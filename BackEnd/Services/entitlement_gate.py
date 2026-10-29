"""
FinSage — Phase 1+3: Entitlement gate (global request gate)
===========================================================

ANSWERS THE "DO I TOUCH EVERY ROUTE?" QUESTION: NO.

Coverage works in three layers, all centralised here:

  1. BLUEPRINT_MIN_TIER  — one entry per blueprint. Every route inside a
     blueprint inherits its tier automatically (≈90% of coverage,
     zero route edits).

  2. PATH_RULES — regex overrides for the fine-grained cases where a
     blueprint has mixed tiers (PPE revaluation/impairment/subsequent
     measurement → premium while the rest of PPE is business;
     disclosure notes; exports). Also zero route edits.

  3. QUOTA_RULES — method+regex → quota key (journals/invoices per
     month). Counted from the tenant tables at request time, no counter
     table. Zero route edits.

  4. @entitled(...) decorator — OPTIONAL escape hatch for a route that
     needs custom logic the regexes can't express.

Wiring (3 lines, once, after all register_blueprint calls):

    from BackEnd.Services.subscription.entitlement_gate import (
        register_entitlement_gate,
    )
    register_entitlement_gate(app, db_service)

Enforcement mode comes from env ENTITLEMENT_MODE:
    off     → gate does nothing
    shadow  → logs what it WOULD deny (default; run 1–2 weeks, review logs)
    enforce → returns 403 upgrade_required responses

Response shape (enforce):
    403 {"ok": false, "error": "upgrade_required",
         "required_plan": "premium", "required_tier": 2,
         "feature": "lease_accounting_lessee",
         "company_plan": "business", "quota": {...} | None}

Delegation: the gate resolves the plan from the URL's company_id, so when
a practitioner works inside a client company (delegated access), the
CLIENT company's plan governs automatically. No special-casing.

Downgrade rule (agreed, Phase 3): EXEMPT_PATHS in module_tiers.py skip
both tier and quota checks — approvals inbox/decide, submit-for-approval
and AP payment approve/release always resolve, on every plan. New
activity in a downgraded module is blocked by the module's own tier, and
quota bites at POST time (rule 2), never on drafts.

Phase 3 additions:
  - tier matrix moved to module_tiers.py (single reviewable source)
  - EXEMPT_PATHS (downgrade rule) evaluated before tier/quota
  - audit-trail EXPORT → enterprise special case (view stays premium)
  - quota counting skipped for tier > 0 companies (saves a query/POST)

Phase 4 additions:
  - READ-ONLY GRACE: when resolve() says state["read_only"] (trial
    expired or dunning exhausted), every write (POST/PUT/PATCH/DELETE)
    is denied with error "subscription_expired" — a DIFFERENT error code
    from "upgrade_required", so the frontend shows a reactivate/billing
    modal, not an upsell. Reads/exports and EXEMPT_PATHS
    (approvals decisions) still resolve.

Phase 5 additions (practice plans — needs register_practice(app, db)
after this register call; without it, behaviour is exactly Phase 4):
  - DELEGATION UPLIFT: a validly-signed delegated token (issued by
    enter-workspace, carrying source/target/engagement) lifts the
    practitioner's SESSION inside a client company to the firm's
    practice plan uplift tier: effective_tier = max(client, uplift).
    Session-scoped, never persisted, never applied to the client's own
    users, withheld when the firm's plan is lapsed or the CLIENT is in
    read-only grace. See practice_service.merge_uplift for the rules.
  - PRACTICE PROVISIONING METER: POSTs under the firm's company URL
    that match module_tiers.PRACTICE_PROVISION_RULES consume the
    practice plan's client_companies quota. Denial (enforce) is
    403 {"error": "practice_limit_reached", ...} — a third error code,
    so the frontend shows the practice upsell, not a module upsell.
"""

import os
import re
import logging

from flask import g, jsonify, request

log = logging.getLogger("finsage.entitlements")

# ------------------------------------------------------------------
# Tier model + matrix: single source of truth is module_tiers.py
# (Phase 3 sweep). Re-exported here for backwards compatibility.
# ------------------------------------------------------------------

from BackEnd.Services.module_tiers import (  # noqa: E402
    TIER_ORDER,
    TIER_NAME,
    BLUEPRINT_MIN_TIER,
    PATH_RULES,
    EXEMPT_PATHS,
    QUOTA_RULES,
    EXPORT_FORMATS,
)

COMPANY_PATH_RX = re.compile(r"^/api/companies/(\d+)(/|$)")

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# (tier matrix + rules now live in module_tiers.py — imported above)

# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _resolve_company_id():
    m = COMPANY_PATH_RX.match(request.path or "")
    return int(m.group(1)) if m else None


AUDIT_TRAIL_RX = re.compile(r"/audit[-_]trail", re.IGNORECASE)


def _required_tier(blueprint_name):
    """Returns (min_tier, feature_label_or_None). None = ungated."""
    requirements = []  # (tier, feature)

    bp_tier = BLUEPRINT_MIN_TIER.get(blueprint_name)
    if bp_tier:
        requirements.append((bp_tier, None))

    path = request.path or ""
    for rx, tier, feature in PATH_RULES:
        if rx.search(path):
            requirements.append((tier, feature))

    fmt = (request.args.get("format") or "").strip().lower()
    if fmt in EXPORT_FORMATS:
        requirements.append((1, "report_exports"))

    # audit-trail EXPORT is enterprise (view stays premium). request.path
    # has no query string, so catch both the /export suffix and format=.
    if AUDIT_TRAIL_RX.search(path) and (
        "/export" in path or fmt in EXPORT_FORMATS
    ):
        requirements.append((3, "audit_trail_export"))

    if not requirements:
        return (None, None)

    tier, feature = max(requirements, key=lambda r: r[0])
    return (tier, feature)


def _exempt_path():
    """Downgrade rule: returns reason string if this path must ALWAYS
    resolve, regardless of plan/quota. None otherwise."""
    for rx, reason in EXEMPT_PATHS:
        if rx.search(request.path or ""):
            return reason
    return None


def _quota_rule():
    for method, rx, key, opts in QUOTA_RULES:
        if request.method != method:
            continue
        if not rx.search(request.path or ""):
            continue
        if opts.get("skip_if_draft"):
            payload = request.get_json(silent=True) or {}
            status = str(payload.get("status") or "draft").strip().lower()
            if status == "draft":
                continue
        return key
    return None


def _upgrade_response(required_tier, feature, state, quota=None):
    body = {
        "ok": False,
        "error": "upgrade_required",
        "required_plan": TIER_NAME.get(required_tier, str(required_tier)),
        "required_tier": required_tier,
        "feature": feature,
        "company_plan": state.get("plan_code"),
        "quota": quota,
    }
    resp = jsonify(body)
    resp.status_code = 403
    resp.headers["X-Entitlement"] = "upgrade_required"
    return resp


def _read_only_response(state):
    """Grace companies get a different error code than upsells: the
    frontend should show 'reactivate / settle billing', not 'upgrade'."""
    body = {
        "ok": False,
        "error": "subscription_expired",
        "reactivate": True,
        "company_plan": state.get("plan_code"),
        "grace_ends_at": (
            state["grace_ends_at"].isoformat()
            if state.get("grace_ends_at") else None
        ),
    }
    resp = jsonify(body)
    resp.status_code = 403
    resp.headers["X-Entitlement"] = "subscription_expired"
    return resp


def _practice_limit_response(prov):
    """Phase 5: the practice ladder has its own upsell — a firm at its
    client_companies limit is not a module-upgrade case."""
    try:
        from subscription.practice_service import (
            NEXT_PRACTICE_PLAN,
        )
    except Exception:
        try:
            from subscription.practice_service import NEXT_PRACTICE_PLAN
        except Exception:
            NEXT_PRACTICE_PLAN = {}
    body = {
        "ok": False,
        "error": "practice_limit_reached",
        "upgrade": True,
        "practice_plan": prov.get("plan_code"),
        "next_practice_plan": NEXT_PRACTICE_PLAN.get(
            prov.get("plan_code")),
        "quota": {
            "key": prov.get("quota_key"),
            "used": prov.get("used"),
            "limit": prov.get("limit"),
            "unlimited": prov.get("unlimited"),
            "remaining": (
                0 if not prov.get("unlimited")
                and prov.get("limit") is not None
                else None
            ),
        },
    }
    resp = jsonify(body)
    resp.status_code = 403
    resp.headers["X-Entitlement"] = "practice_limit_reached"
    return resp


# ------------------------------------------------------------------
# Registration
# ------------------------------------------------------------------

def register_entitlement_gate(app, db_service, mode=None):
    """
    Call ONCE after all app.register_blueprint(...) lines:
        register_entitlement_gate(app, db_service)
    """
    mode = (mode or os.getenv("ENTITLEMENT_MODE") or "shadow").lower()
    if mode not in {"off", "shadow", "enforce"}:
        mode = "shadow"

    # lazy import to avoid circulars with entitlements.py
    from BackEnd.Services.subscription.entitlements import EntitlementService

    service = EntitlementService(db_service)
    app.extensions["entitlements"] = service
    app.config["ENTITLEMENT_MODE"] = mode

    @app.before_request
    def _entitlement_gate():
        if mode == "off":
            return None
        if request.method == "OPTIONS":
            return None

        company_id = _resolve_company_id()
        if company_id is None:
            # auth, health, static, webhooks, pos-auth etc. — out of scope
            return None

        state = service.resolve(company_id)

        # --- Phase 5: delegation uplift (practice plans) --------------
        # Registered via register_practice(app, db). Session-scope merge:
        # delegated practitioner sessions lift to the firm's practice
        # plan tier. Fail-closed; a no-op when practice isn't wired.
        practice = app.extensions.get("practice")
        if practice is not None:
            state = practice.apply_delegation_uplift(state)

        # stash for downstream use (routes / frontend bootstrap payloads)
        g.entitlement_state = state

        # --- downgrade rule: exempt paths always resolve -------------
        exempt_reason = _exempt_path()
        if exempt_reason:
            g.entitlement_exempt = exempt_reason
            return None

        # --- Phase 4: read-only grace (trial lapsed / dunning done) --
        if state.get("read_only") and request.method in WRITE_METHODS:
            if mode == "shadow":
                log.warning(
                    "[ENTITLEMENT:%s] read-only WOULD DENY cid=%s "
                    "method=%s path=%s (grace_ends_at=%s)",
                    mode, company_id, request.method, request.path,
                    state.get("grace_ends_at"),
                )
            else:
                log.warning(
                    "[ENTITLEMENT:enforce] read-only DENY cid=%s "
                    "method=%s path=%s",
                    company_id, request.method, request.path,
                )
                return _read_only_response(state)

        blueprint_name = request.blueprint or ""
        required_tier, feature = _required_tier(blueprint_name)

        # unmapped blueprint → allow, but surface it in shadow logs
        if required_tier is None and blueprint_name not in BLUEPRINT_MIN_TIER:
            log.info(
                "[ENTITLEMENT:%s] unmapped blueprint=%s path=%s cid=%s "
                "(allowed; add to BLUEPRINT_MIN_TIER)",
                mode, blueprint_name, request.path, company_id,
            )
            return None

        denied = False
        quota_info = None

        if required_tier is not None and state["tier"] < required_tier:
            denied = True

        # quotas bite only for free tier (higher tiers are unlimited;
        # skipping the count query saves a round-trip on every POST)
        if not denied and state["tier"] == 0:
            quota_key = _quota_rule()
            if quota_key:
                allowed, usage = service.quota_allows(
                    company_id, quota_key, extra_count=1
                )
                quota_info = {"key": quota_key, **usage}
                if not allowed:
                    denied = True
                    feature = feature or quota_key
                    required_tier = max(required_tier or 0, 1)

        # --- Phase 5: practice provisioning meter ---------------------
        # Independent of the module-tier verdict above: a practice firm
        # at its client_companies limit can't provision client #N+1,
        # whatever its own-books tier allows.
        if practice is not None and request.method == "POST":
            prov = practice.check_provision_quota(company_id)
            if prov is not None and not prov.get("allowed"):
                if mode == "shadow":
                    log.warning(
                        "[ENTITLEMENT:%s] practice provision WOULD DENY "
                        "firm=%s plan=%s used=%s limit=%s path=%s",
                        mode, company_id, prov.get("plan_code"),
                        prov.get("used"), prov.get("limit"), request.path,
                    )
                else:
                    log.warning(
                        "[ENTITLEMENT:enforce] practice provision DENY "
                        "firm=%s plan=%s used=%s limit=%s path=%s",
                        company_id, prov.get("plan_code"),
                        prov.get("used"), prov.get("limit"), request.path,
                    )
                    return _practice_limit_response(prov)

        if not denied:
            return None

        if mode == "shadow":
            log.warning(
                "[ENTITLEMENT:shadow] WOULD DENY cid=%s plan=%s tier=%s "
                "required=%s feature=%s method=%s path=%s bp=%s quota=%s",
                company_id, state.get("plan_code"), state.get("tier"),
                required_tier, feature, request.method, request.path,
                request.blueprint, quota_info,
            )
            return None

        log.warning(
            "[ENTITLEMENT:enforce] DENY cid=%s plan=%s required=%s "
            "feature=%s path=%s",
            company_id, state.get("plan_code"), required_tier, feature,
            request.path,
        )
        return _upgrade_response(required_tier, feature, state, quota_info)

    log.info("entitlement gate registered (mode=%s, %s blueprints mapped)",
             mode, len(BLUEPRINT_MIN_TIER))
    return service


# ------------------------------------------------------------------
# Plan-change hook (downgrade rule, phase 4 will call this from the
# billing webhook / admin actions):
#
#     service = app.extensions["entitlements"]
#     service.notify_plan_change(company_id)
#
# It drops the 60s resolve cache so the new tier applies on the very
# next request — a downgrade must never keep working via stale cache.
# ------------------------------------------------------------------


# ------------------------------------------------------------------
# Optional decorator for explicit, route-specific floors.
# Use ONLY where PATH_RULES/blueprint tiers can't express the logic.
# ------------------------------------------------------------------

def entitled(min_tier, feature=None, quota_key=None):
    """
    Example:
        @ppe_bp.post("/api/companies/<int:company_id>/assets/revaluation")
        @require_auth
        @entitled("premium", feature="ppe_revaluation")
        def post_revaluation(company_id): ...
    """
    from functools import wraps

    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            mode = None
            from flask import current_app
            mode = current_app.config.get("ENTITLEMENT_MODE", "shadow")
            if mode != "off":
                service = current_app.extensions.get("entitlements")
                if service is not None:
                    cid = kwargs.get("company_id") or kwargs.get("cid")
                    if cid is not None:
                        state = service.resolve(int(cid))
                        needed = (service.tier_of(min_tier)
                                  if isinstance(min_tier, str) else min_tier)
                        if state["tier"] < needed:
                            if mode == "shadow":
                                log.warning(
                                    "[ENTITLEMENT:shadow] decorator WOULD "
                                    "DENY cid=%s needs=%s path=%s",
                                    cid, min_tier, request.path,
                                )
                            else:
                                return _upgrade_response(
                                    needed, feature, state
                                )
                        elif quota_key and mode == "enforce":
                            allowed, usage = service.quota_allows(
                                int(cid), quota_key
                            )
                            if not allowed:
                                return _upgrade_response(
                                    needed, quota_key, state,
                                    quota={"key": quota_key, **usage},
                                )
            return fn(*args, **kwargs)
        return wrapper
    return deco
