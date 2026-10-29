"""
FinSage — Phase 5: practice overview endpoint
=============================================

    GET /api/companies/<cid>/practice/overview

One read-only call that powers the practice dashboard banner, the
client-roster page and the practice upsell modal. Contains NO gating
logic — enforcement lives in the gate (entitlement_gate.py) and the
provisioning guard (practice_service.assert_can_provision).

Response shape:

    {
      "ok": true,
      "practice": {
        "company_id": 7,
        "on_practice_plan": true,
        "plan_code": "practice_growth",
        "status": "trialing",
        "tier": 2,                          ← firm's OWN books tier
        "uplift_to_tier": 2,                ← delegated work level
        "clients": {"used": 11, "limit": 25, "unlimited": false,
                     "remaining": 14},
        "next_practice_plan": "practice_firm",
        "features": { ...plan features (own books + practice_*)... },
        "limits":  { ...plan limits... },
        "clients_list": [
          {"company_id": 31, "name": "Maliba Traders",
           "industry": "Retail", "plan_code": "free", "status": "active"}
        ],
        "plans_catalog": [ ...the 3 practice plans, for the upsell... ]
      }
    }

When the company is NOT on a practice plan: on_practice_plan=false, and
the payload still carries plans_catalog so the frontend can sell the
practice ladder. When the REQUEST carries a delegated token (i.e. a
practitioner is asking from inside a CLIENT workspace), the response
says so instead of leaking the firm's commercial view into the client
session.

Wiring (ONE line, with your other blueprint registrations):
    from BackEnd.Services.subscription.practice_endpoint import (
        practice_bp,
    )
    app.register_blueprint(practice_bp)
"""

from flask import Blueprint, jsonify, request, current_app

from BackEnd.Services.auth_middleware import require_auth

practice_bp = Blueprint("practice", __name__)


def _deny_if_wrong_company(payload, company_id, db_service=None):
    """Identical tenancy guard to entitlements_endpoint (same import,
    same fallback)."""
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
    svc = current_app.extensions.get("practice")
    if svc is not None:
        return svc
    from BackEnd.Services.db_service import db_service
    from BackEnd.Services.subscription.practice_service import (
        PracticeService,
    )
    svc = PracticeService(db_service)
    current_app.extensions["practice"] = svc
    return svc


def _plans_catalog():
    """The 3 practice plans for the upsell modal. Degrades to [] if the
    seed hasn't run yet."""
    try:
        svc = _service()
        conn = svc.db.get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT plan_code, plan_name, description, currency,
                           monthly_amount, annual_amount, trial_days,
                           features, limits
                    FROM public.subscription_plans
                    WHERE plan_code IN ('practice_starter',
                                        'practice_growth',
                                        'practice_firm')
                      AND is_active = TRUE
                    ORDER BY monthly_amount ASC
                    """
                )
                rows = cur.fetchall()
        finally:
            conn.close()
    except Exception:
        current_app.logger.warning(
            "practice plans_catalog unavailable", exc_info=True)
        return []

    return [
        {
            "plan_code": r[0], "plan_name": r[1], "description": r[2],
            "currency": r[3], "monthly_amount": float(r[4] or 0),
            "annual_amount": float(r[5] or 0), "trial_days": int(r[6] or 0),
            "features": dict(r[7] or {}), "limits": dict(r[8] or {}),
        }
        for r in rows
    ]


@practice_bp.get(
    "/api/companies/<int:company_id>/practice/overview",
    endpoint="get_practice_overview",
)
@require_auth
def get_practice_overview(company_id: int):
    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    svc = _service()

    # A delegated practitioner asking from inside a CLIENT workspace:
    # report the session view, not the client's commercial internals.
    claims = svc.peek_delegated_token()
    if claims and int(claims.get("target_company_id") or 0) == int(company_id):
        return jsonify({
            "ok": True,
            "practice": {
                "company_id": int(company_id),
                "view": "delegated_session",
                "source_company_id": claims.get("source_company_id"),
                "engagement_id": claims.get("engagement_id"),
                "note": "client workspace — firm practice plan governs "
                        "this session's entitlements; see the firm's own "
                        "company for plan/usage",
            },
        }), 200

    state = svc.practice_state(int(company_id))
    on_practice = state is not None

    clients_list = []
    if on_practice:
        try:
            clients_list = svc.list_clients(int(company_id))
        except Exception:
            current_app.logger.warning(
                "practice clients_list failed cid=%s", company_id,
                exc_info=True)

    return jsonify({
        "ok": True,
        "practice": {
            "company_id": int(company_id),
            "view": "firm",
            "on_practice_plan": on_practice,
            "plan_code": state.get("plan_code") if on_practice else None,
            "status": state.get("status") if on_practice else None,
            "tier": state.get("tier") if on_practice else None,
            "uplift_to_tier": (state.get("uplift_to_tier")
                               if on_practice else None),
            "clients": state.get("clients") if on_practice else None,
            "next_practice_plan": (state.get("next_practice_plan")
                                   if on_practice else "practice_starter"),
            "features": state.get("features") if on_practice else {},
            "limits": state.get("limits") if on_practice else {},
            "clients_list": clients_list,
            "plans_catalog": _plans_catalog(),
        },
    }), 200
