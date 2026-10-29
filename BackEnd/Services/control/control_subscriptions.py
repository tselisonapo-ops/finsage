# BackEnd/Services/control/control_subscriptions.py
"""
FinSage Control — Subscription Management Routes
=================================================

The admin cockpit for the FinSage subscription engine.

READS  → ControlService (SubscriptionControlMixin — SELECT-only SQL).
WRITES → the app's SHARED BillingService via app.extensions["billing"].

DESIGN RULES (do not break them when editing):

  * The control panel is a COCKPIT, never a second engine. Every mutation
    MUST go through the shared BillingService instance — it owns the
    subscription event log, the billing audit trail, entitlement-cache
    invalidation and the mailer. Writing public.subscription* rows from
    Control would silently bypass all four.

  * If app.extensions["billing"] is absent (billing engine not wired in
    api_server), mutations fail closed with 503 — Control never falls
    back to raw SQL.

  * Money mutations are @require_control_admin (Control's current RBAC
    reality: role == 'admin'). Reads are @require_control_auth.

  * Every mutation writes control.audit_log via AuditService with the
    control user id, the reason, and before/after snapshots. BillingService
    writes its own subscription_events in parallel — two independent
    paper trails.

  * Settlement routes verify billing-row ownership
    (get_billing_row_for_company) BEFORE calling BillingService:
    record_payment_success() trusts its caller on tenant scoping.

Register next to the other Control blueprints:

    from BackEnd.Services.control.control_subscriptions import (
        subscriptions_bp,
    )
    app.register_blueprint(subscriptions_bp)
"""

from flask import Blueprint, request, jsonify, g, current_app

from BackEnd.Services.control_auth import (
    require_control_auth,
    require_control_admin,
)

subscriptions_bp = Blueprint(
    "control_subscriptions",
    __name__,
    url_prefix="/api/control/subscriptions",
)


# ---------------------------------------------------------------
# helpers
# ---------------------------------------------------------------

def _billing_service():
    """The app's shared BillingService — or None when not wired."""
    return current_app.extensions.get("billing")


def _billing_unavailable():
    return jsonify({
        "error": (
            "Billing engine is not wired on this server "
            "(app.extensions['billing'] missing). Mutations are "
            "disabled; wire BillingService in api_server first."
        )
    }), 503


def _audit(action, *, entity_type=None, entity_id=None,
           description=None, before=None, after=None, metadata=None):
    """control.audit_log entry — failure can never break the operation."""
    try:
        g.control_service.audit_service.record(
            control_user_id=g.user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            description=description,
            ip_address=request.remote_addr,
            user_agent=request.headers.get("User-Agent"),
            before_data=before,
            after_data=after,
            metadata=metadata,
        )
    except Exception:
        pass


def _body():
    return request.get_json(silent=True) or {}


# ---------------------------------------------------------------
# READS — any active Control user
# ---------------------------------------------------------------

@subscriptions_bp.route("", methods=["GET"], strict_slashes=False)
@require_control_auth
def list_subscriptions():
    """Fleet overview: latest subscription per company, filterable."""

    result = g.control_service.list_subscriptions(
        status=request.args.get("status"),
        plan_code=request.args.get("plan_code"),
        search=request.args.get("search", ""),
        sort=request.args.get("sort", "next_billing"),
        page=request.args.get("page", 1, type=int),
        per_page=request.args.get("per_page", 20, type=int),
    )
    return jsonify(result)


@subscriptions_bp.get("/overview")
@require_control_auth
def subscriptions_overview():
    """KPI block: status counts, past-due, MRR, trials ending soon."""

    return jsonify(g.control_service.get_subscriptions_overview())


@subscriptions_bp.get("/awaiting-settlement")
@require_control_auth
def awaiting_settlement():
    """The money queue: pending/failed billing rows awaiting an admin."""

    company_id = request.args.get("company_id", type=int)
    limit = request.args.get("limit", 50, type=int)

    rows = g.control_service.get_awaiting_settlement(
        company_id=company_id,
        limit=limit,
    )
    return jsonify({"billing": rows, "count": len(rows)})


# ---------------------------------------------------------------
# PAYMENT SETTLEMENT — the manual-gateway loop's admin half
# ---------------------------------------------------------------

@subscriptions_bp.post(
    "/<int:company_id>/billing/<int:billing_id>/confirm"
)
@require_control_admin
def confirm_payment(company_id, billing_id):
    """
    Record an EFT / mobile-money payment as received.

    Body (all optional): { "payment_reference": "...", "note": "..." }

    Idempotent: confirming an already-paid row is a no-op success.
    Side effects (owned by BillingService): billing row → paid, subscription
    period extended, subscription → active/current, payment_succeeded
    event, entitlement cache invalidated.
    """

    billing = _billing_service()
    if billing is None:
        return _billing_unavailable()

    body = _body()
    reference = (body.get("payment_reference")
                 or body.get("external_payment_id") or "").strip() or None
    note = (body.get("note") or "").strip() or None

    row = g.control_service.get_billing_row_for_company(
        company_id, billing_id
    )
    if not row:
        return jsonify({
            "error": "Billing row not found for this company"
        }), 404

    try:
        result = billing.record_payment_success(
            billing_id,
            external_payment_id=reference,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # engine failure — never mask as success
        return jsonify({
            "error": "Payment confirmation failed",
            "detail": str(exc),
        }), 500

    _audit(
        "subscription.payment_confirmed",
        entity_type="subscription_billing",
        entity_id=billing_id,
        description=(
            f"payment confirmed for company {company_id} "
            f"(ref={reference or 'n/a'})"
            + (f" — {note}" if note else "")
        ),
        before={"billing_status": row.get("billing_status")},
        after={"billing_status": "paid",
               "external_payment_id": reference},
        metadata={"via": "control", "company_id": company_id},
    )
    return jsonify({"ok": True, "result": result})


@subscriptions_bp.post(
    "/<int:company_id>/billing/<int:billing_id>/fail"
)
@require_control_admin
def fail_payment(company_id, billing_id):
    """
    Record a payment attempt as failed.

    Body: { "reason": "...", "payment_reference": "..." }

    Side effects (owned by BillingService): billing row → failed,
    dunning retry scheduled (or read-only grace when attempts exhausted),
    payment_failed event, entitlement cache invalidated.
    """

    billing = _billing_service()
    if billing is None:
        return _billing_unavailable()

    body = _body()
    reason = (body.get("reason") or "").strip() or None
    reference = (body.get("payment_reference")
                 or body.get("external_payment_id") or "").strip() or None

    row = g.control_service.get_billing_row_for_company(
        company_id, billing_id
    )
    if not row:
        return jsonify({
            "error": "Billing row not found for this company"
        }), 404

    if not reason:
        return jsonify({
            "error": "A failure reason is required"
        }), 400

    try:
        result = billing.record_payment_failure(
            billing_id,
            reason=reason,
            external_payment_id=reference,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({
            "error": "Payment failure recording failed",
            "detail": str(exc),
        }), 500

    _audit(
        "subscription.payment_failed",
        entity_type="subscription_billing",
        entity_id=billing_id,
        description=(
            f"payment marked failed for company {company_id} "
            f"— {reason}"
        ),
        before={"billing_status": row.get("billing_status")},
        after={"billing_status": "failed", "failure_reason": reason},
        metadata={"via": "control", "company_id": company_id},
    )
    return jsonify({"ok": True, "result": result})


# ---------------------------------------------------------------
# PLAN OPS — commit / upgrade / downgrade / cancel
# ---------------------------------------------------------------

_PLAN_ACTIONS = ("commit", "upgrade", "downgrade", "cancel")


@subscriptions_bp.post("/<int:company_id>/plan")
@require_control_admin
def plan_action(company_id):
    """
    Plan operations, dispatched through BillingService.

    Body: {
      "action": "commit" | "upgrade" | "downgrade" | "cancel",
      "plan_code": "business" | "premium" | ...   (not for cancel),
      "billing_interval": "monthly" | "annual",    (commit only),
      "reason": "why"                              (audited)
    }

    Semantics owned by BillingService:
      commit    — trial/grace/expired → paid plan, first charge now.
      upgrade   — immediate mid-cycle, prorated credit for unused time.
      downgrade — SCHEDULED at period end (they already paid).
      cancel    — cancellation effective at period end.
    """

    billing = _billing_service()
    if billing is None:
        return _billing_unavailable()

    body = _body()
    action = (body.get("action") or "").strip().lower()
    plan_code = (body.get("plan_code") or "").strip().lower() or None
    billing_interval = (body.get("billing_interval") or "").strip().lower()
    reason = (body.get("reason") or "").strip() or None

    if action not in _PLAN_ACTIONS:
        return jsonify({
            "error": (
                "action must be one of: "
                + ", ".join(_PLAN_ACTIONS)
            )
        }), 400

    if action != "cancel" and not plan_code:
        return jsonify({
            "error": f"plan_code is required for '{action}'"
        }), 400

    if billing_interval and billing_interval not in ("monthly", "annual"):
        return jsonify({
            "error": "billing_interval must be 'monthly' or 'annual'"
        }), 400

    before = g.control_service.get_company_subscription(company_id)

    try:
        if action == "commit":
            result = billing.commit_plan(
                company_id, plan_code,
                billing_interval=billing_interval or "monthly",
            )
        elif action == "upgrade":
            result = billing.upgrade(company_id, plan_code)
        elif action == "downgrade":
            result = billing.downgrade(company_id, plan_code)
        else:  # cancel
            result = billing.cancel(company_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({
            "error": f"Plan action '{action}' failed",
            "detail": str(exc),
        }), 500

    after = g.control_service.get_company_subscription(company_id)

    _audit(
        f"subscription.plan_{action}",
        entity_type="company_subscription",
        entity_id=(before or {}).get("subscription_id"),
        description=(
            f"{action} on company {company_id}"
            + (f" → {plan_code}" if plan_code else "")
            + (f" — {reason}" if reason else "")
        ),
        before=before,
        after=after,
        metadata={"via": "control", "company_id": company_id},
    )
    return jsonify({"ok": True, "action": action, "result": result})


# ---------------------------------------------------------------
# TRIAL OPS
# ---------------------------------------------------------------

@subscriptions_bp.post("/<int:company_id>/trial/extend")
@require_control_admin
def extend_trial(company_id):
    """
    Extend the company's trialing subscription by N days (1..365).

    Body: { "days": 14, "reason": "..." }
    """

    billing = _billing_service()
    if billing is None:
        return _billing_unavailable()

    body = _body()
    days = body.get("days")
    reason = (body.get("reason") or "").strip() or None

    try:
        result = billing.extend_trial(
            company_id, days, reason=reason,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({
            "error": "Trial extension failed",
            "detail": str(exc),
        }), 500

    _audit(
        "subscription.trial_extended",
        entity_type="company_subscription",
        entity_id=result.get("subscription_id"),
        description=(
            f"trial extended by {days} days for company {company_id}"
            + (f" — {reason}" if reason else "")
        ),
        after={"trial_ends_at": str(result.get("trial_ends_at"))},
        metadata={"via": "control", "company_id": company_id},
    )
    return jsonify({"ok": True, "result": result})
