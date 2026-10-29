"""
FinSage — Phase 2/3: entitlements endpoint
==========================================

    GET /api/companies/<cid>/entitlements

Thin read-only endpoint the dashboard calls to drive tier-aware UX
(hide/disable gated modules, upsell modal, quota progress bars).
It contains NO gating logic — the gate (entitlement_gate.py) stays the
single enforcement point. This endpoint only EXPOSES the resolved state:

    {
      "ok": true,
      "entitlements": {
        "company_id": 12,
        "plan_code": "free",
        "tier": 0,
        "grandfathered": false,
        "status": "active",
        "trial_ends_at": null,
        "mode": "shadow",                      ← gate mode, for the console
        "features": { ...plan features... },   ← flat booleans from the seed
        "limits":  { ...plan limits... },
        "quotas": {
          "journals_per_month": {"used": 25, "limit": 25,
                                  "unlimited": false, "remaining": 0},
          "invoices_per_month": {"used": 2,  "limit": 5,
                                  "unlimited": false, "remaining": 3}
        },
        "upsell": ["report_exports", "quotes", "bank_reconciliation", ...]
      }
    }

"upsell" lists feature keys the NEXT tier unlocks that this plan lacks —
enough for dashboard.js to render upgrade copy without a second call.

Phase 5 additions:
  "practice":          present when THIS company is a practice firm —
                       {plan_code, uplift_to_tier, clients usage, next
                        practice plan} for the firm-side banner.
  "practice_uplift":   present when the REQUEST carries a valid
                       delegated token (a practitioner working in this
                       client workspace) — reports the session-scope
                       uplift so the delegated shell knows the
                       effective tier is not the client's own plan.
  next_tier is null for delegated sessions (upsells belong to the
  client's own dashboard, not the practitioner's).

Wiring (ONE line, with your other blueprint registrations — order does
not matter):
    from BackEnd.Services.subscription.entitlements_endpoint import (
        entitlements_bp,
    )
    app.register_blueprint(entitlements_bp)
"""

from flask import Blueprint, jsonify, request, current_app

from BackEnd.Services.auth_middleware import require_auth

entitlements_bp = Blueprint("entitlements", __name__)


def _deny_if_wrong_company(payload, company_id, db_service=None):
    """
    Same tenancy guard every company-scoped route uses. Imported from
    invoice_routes to stay identical to the rest of the codebase —
    with a tiny self-contained fallback in case the import target moves.
    """
    try:
        from BackEnd.Services.routes.invoice_routes import (
            _deny_if_wrong_company as _deny,
        )
        return _deny(payload, int(company_id), db_service=db_service)
    except Exception:
        claims = (payload or {}).get("company_ids") or []
        try:
            return None if int(company_id) in [int(c) for c in claims] \
                else (jsonify({"ok": False, "error": "wrong_company"}), 403)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "wrong_company"}), 403


def _service():
    """The gate registers the shared service in app.extensions."""
    svc = current_app.extensions.get("entitlements")
    if svc is not None:
        return svc
    # gate not wired yet — degrade gracefully with a private instance
    from BackEnd.Services.db_service import db_service
    from BackEnd.Services.subscription.entitlements import EntitlementService
    svc = EntitlementService(db_service)
    current_app.extensions["entitlements"] = svc
    return svc


# next-tier highlight keys (subset — the ones that sell the upgrade)
UPSELL_BY_TIER = {
    1: ["report_exports", "quotes", "ar_ap_controls", "credit_control",
        "bank_reconciliation", "vat_recon_filing", "inventory", "pos",
        "budgets_forecasts"],
    2: ["ppe_revaluation", "ppe_impairment", "lease_accounting_lessee",
        "disclosure_notes_ppe", "tax_recon_deferred_tax", "projects_costing",
        "payroll_core", "receipt_scan"],
    3: ["payroll_tax_filing_paye", "employee_benefits_accounting",
        "payroll_disclosure_pack", "export_full_pack", "audit_trail_export",
        "ops", "consolidation", "corporate_structure"],
}


@entitlements_bp.get(
    "/api/companies/<int:company_id>/entitlements",
    endpoint="get_company_entitlements",
)
@require_auth
def get_company_entitlements(company_id: int):
    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    svc = _service()
    base_state = svc.resolve(int(company_id))
    base_tier = int(base_state.get("tier") or 0)
    base_plan = str(base_state.get("plan_code") or "")

    # Phase 5: session-scope delegation uplift (no-op unless the request
    # carries a valid delegated token for THIS company and practice is
    # wired). The merged state is what the GATE also judged this
    # request by — the payload must match the enforcement reality.
    practice_svc = current_app.extensions.get("practice")
    state = base_state
    if practice_svc is not None:
        state = practice_svc.apply_delegation_uplift(state)

    quotas = svc.quota_snapshot(int(company_id))

    tier = int(state.get("tier") or 0)
    plan_code = str(state.get("plan_code") or "")
    missing = [k for k, v in (state.get("features") or {}).items()
               if not v and k in UPSELL_BY_TIER.get(tier + 1, [])]

    uplift_info = state.get("practice_uplift")
    delegated_session = bool(uplift_info and uplift_info.get("applied"))

    # Phase 5: firm-side practice block (only when THIS company is the
    # practice — never exposed inside a delegated client session).
    practice_block = None
    if practice_svc is not None and base_plan.startswith("practice_"):
        try:
            ps = practice_svc.practice_state(int(company_id))
        except Exception:
            current_app.logger.warning(
                "practice_state failed cid=%s", company_id, exc_info=True)
            ps = None
        if ps:
            practice_block = {
                "plan_code": ps.get("plan_code"),
                "status": ps.get("status"),
                "uplift_to_tier": ps.get("uplift_to_tier"),
                "clients": ps.get("clients"),
                "next_practice_plan": ps.get("next_practice_plan"),
            }

    # next_tier: module ladder for client companies; the practice ladder
    # for firms; none for delegated sessions (upsells belong to the
    # client's own dashboard, not the practitioner's shell).
    if delegated_session:
        next_tier = None
    elif base_plan.startswith("practice_"):
        next_tier = (practice_block or {}).get("next_practice_plan")
    else:
        next_tier = {0: "business", 1: "premium",
                     2: "enterprise"}.get(base_tier)

    grace_ends_at = state.get("grace_ends_at")
    trial_ends_at = state.get("trial_ends_at")

    payload = {
        "ok": True,
        "entitlements": {
            "company_id": int(company_id),
            "plan_code": plan_code,
            "tier": tier,
            "grandfathered": bool(state.get("grandfathered")),
            "status": state.get("status"),
            "mode": current_app.config.get("ENTITLEMENT_MODE", "off"),
            "features": state.get("features") or {},
            "limits": state.get("limits") or {},
            "quotas": quotas,
            "next_tier": next_tier,
            "upsell": [] if delegated_session else missing,
            # --- Phase 4: trial & grace state for the dashboard banner ---
            "billing": {
                "read_only": bool(state.get("read_only")),
                "trial_days_left": state.get("trial_days_left"),
                "trial_ends_at": (trial_ends_at.isoformat()
                                  if trial_ends_at else None),
                "grace_ends_at": (grace_ends_at.isoformat()
                                  if grace_ends_at else None),
                "billing_status": state.get("billing_status"),
                "scheduled_plan_code": state.get("scheduled_plan_code"),
            },
        },
    }

    ent = payload["entitlements"]
    if practice_block is not None:
        ent["practice"] = practice_block
    if uplift_info is not None:
        ent["practice_uplift"] = {
            "applied": bool(uplift_info.get("applied")),
            "source_company_id": uplift_info.get("source_company_id"),
            "practice_plan_code": uplift_info.get("practice_plan_code"),
            "uplift_to_tier": uplift_info.get("uplift_to_tier"),
            "effective_tier": uplift_info.get("effective_tier"),
        }

    return jsonify(payload), 200
