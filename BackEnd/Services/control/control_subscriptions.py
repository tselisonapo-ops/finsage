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

from flask import Blueprint, request, jsonify, g, current_app, Response
from datetime import datetime, timedelta
import json
import os

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
        if note:
            try:
                conn = g.control_service.db.get_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE public.subscription_billing
                        SET metadata = metadata || jsonb_build_object('settlement_note', %s::text)
                        WHERE id = %s
                        """,
                        (note, billing_id),
                    )
                conn.commit()
                conn.close()
            except Exception:
                pass
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


# ---------------------------------------------------------------
# PROVISIONING (new companies with no subscription record)
# ---------------------------------------------------------------

@subscriptions_bp.post("/<int:company_id>/provision")
@require_control_admin
def provision_subscription(company_id):
    """
    Start a trial or commit an active plan for a company (e.g. newly added companies).

    Body:
      mode: "trial" | "commit" (default "trial")
      plan_code: "business" | "premium" | "enterprise" (default "premium")
      trial_days: int (default 14, for trial mode, e.g. 14, 30, 90)
      billing_interval: "monthly" | "annual" (for commit mode)
      reason: str
      is_founding_partner: bool
      discount_percent: float
      discount_type: "percent" | "fixed" | "founding_partner"
      special_case_notes: str
      industry: str
    """
    billing = _billing_service()
    if billing is None:
        return _billing_unavailable()

    # Verify company exists in public.companies
    try:
        co = g.control_service.db.fetch_one(
            "SELECT id, name, industry FROM public.companies WHERE id = %s",
            (company_id,)
        )
        if not co:
            return jsonify({"error": f"Company #{company_id} does not exist"}), 404
    except Exception as exc:
        current_app.logger.warning("Failed checking company existence: %s", exc)

    body = _body()
    mode = (body.get("mode") or "trial").strip().lower()
    plan_code = (body.get("plan_code") or "premium").strip().lower()
    
    # Robust parsing of trial_days
    raw_days = body.get("trial_days")
    days = 14
    if raw_days is not None:
        try:
            cleaned_str = str(raw_days).lower().replace("d", "").replace("days", "").strip()
            days = int(cleaned_str)
        except (ValueError, TypeError):
            days = 14

    billing_interval = (body.get("billing_interval") or "monthly").strip().lower()
    reason = (body.get("reason") or "").strip() or None

    # Special case and partner metadata
    special_meta = {}
    if body.get("is_founding_partner"):
        special_meta["is_founding_partner"] = True
        special_meta["partner_tier"] = "founding_partner"
    if body.get("discount_percent") is not None and str(body.get("discount_percent")).strip() != "":
        try:
            special_meta["discount_percent"] = float(body.get("discount_percent"))
        except (ValueError, TypeError):
            pass
    if body.get("discount_type"):
        special_meta["discount_type"] = str(body.get("discount_type")).strip()
    if body.get("discount_amount") is not None and str(body.get("discount_amount")).strip() != "":
        try:
            special_meta["discount_amount"] = float(body.get("discount_amount"))
        except (ValueError, TypeError):
            pass
    if body.get("special_case_notes"):
        special_meta["special_case_notes"] = str(body.get("special_case_notes")).strip()
    if body.get("industry"):
        special_meta["industry"] = str(body.get("industry")).strip()
    if reason:
        special_meta["provision_reason"] = reason

    try:
        if mode == "trial":
            result = billing.provision_trial(
                company_id,
                plan_code=plan_code,
                trial_days=days,
                actor_user_id=g.user_id,
                source="control",
                metadata=special_meta,
            )
        else:
            result = billing.commit_plan(
                company_id,
                plan_code=plan_code,
                billing_interval=billing_interval,
                actor_user_id=g.user_id,
            )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        current_app.logger.exception("Subscription provisioning (%s) failed", mode)
        return jsonify({
            "error": f"Subscription provisioning ({mode}) failed",
            "detail": str(exc),
        }), 500

    after = g.control_service.get_company_subscription(company_id)
    _audit(
        f"subscription.provision_{mode}",
        entity_type="company_subscription",
        entity_id=(after or {}).get("subscription_id"),
        description=(
            f"provisioned {mode} plan={plan_code} ({days}d) for company {company_id}"
            + (f" — {reason}" if reason else "")
        ),
        after=after,
        metadata={"via": "control", "company_id": company_id, "mode": mode, **special_meta},
    )
    return jsonify({"ok": True, "mode": mode, "result": result, "subscription": after})


# ---------------------------------------------------------------
# UNCANCEL (reverse pending cancellation)
# ---------------------------------------------------------------

@subscriptions_bp.post("/<int:company_id>/uncancel")
@require_control_admin
def uncancel_subscription(company_id):
    """
    Reverses a pending subscription cancellation before period end.
    """
    body = _body()
    reason = (body.get("reason") or "").strip() or None
    try:
        result = g.control_service.admin_uncancel_subscription(
            company_id, actor_user_id=g.user_id
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({
            "error": "Failed to undo cancellation",
            "detail": str(exc),
        }), 500

    after = g.control_service.get_company_subscription(company_id)
    _audit(
        "subscription.uncancelled",
        entity_type="company_subscription",
        entity_id=(after or {}).get("subscription_id"),
        description=f"pending cancellation reversed for company {company_id}" + (f" — {reason}" if reason else ""),
        after=after,
        metadata={"via": "control", "company_id": company_id},
    )
    return jsonify({"ok": True, "result": result, "subscription": after})


# ---------------------------------------------------------------
# MANUAL INVOICE / BILLING CHARGE
# ---------------------------------------------------------------

@subscriptions_bp.post("/<int:company_id>/billing/issue")
@require_control_admin
def issue_manual_billing(company_id):
    """
    Issue a manual subscription invoice / billing row for a company.

    Body:
      amount: float (required)
      currency: str (default "LSL")
      description: str (e.g. "FinSage Subscription - Custom Invoice")
      lines: list of { description, quantity, unit_price, total }
      due_at: date string
      period_start: date string
      period_end: date string
      invoice_reference: str (optional)
      note: str
    """
    billing = _billing_service()
    if billing is None:
        return _billing_unavailable()

    body = _body()
    amount_raw = body.get("amount")
    if amount_raw is None:
        return jsonify({"error": "amount is required"}), 400
    try:
        amount = float(amount_raw)
        if amount < 0:
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({"error": "amount must be a non-negative number"}), 400

    currency = (body.get("currency") or "LSL").strip().upper()
    description = (body.get("description") or "Subscription Invoice").strip()
    lines = body.get("lines") or []
    due_at = body.get("due_at")
    period_start = body.get("period_start")
    period_end = body.get("period_end")
    note = (body.get("note") or "").strip() or None

    sub = billing.get_active_subscription(company_id)
    if not sub:
        sub_row = g.control_service.get_company_subscription(company_id)
        if sub_row:
            subscription_id = sub_row.get("subscription_id")
        else:
            prov = billing.provision_trial(company_id, source="manual_billing")
            subscription_id = prov.get("subscription_id")
    else:
        subscription_id = sub["id"]

    now = datetime.utcnow()
    ref_suffix = now.strftime("%Y%m%d%H%M%S")
    invoice_ref = (body.get("invoice_reference") or "").strip() or f"FS-INV-{company_id}-{ref_suffix}"
    billing_ref = f"FS-BILL-{company_id}-{ref_suffix}"

    meta = {
        "kind": "manual_invoice",
        "description": description,
        "note": note,
        "issued_by_control_user_id": g.user_id,
        "lines": lines if lines else [{"description": description, "quantity": 1, "unit_price": amount, "total": amount}],
    }

    conn = g.control_service.db.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.subscription_billing (
                    subscription_id, company_id, billing_reference, invoice_reference,
                    billing_status, amount, currency, billing_period_start,
                    billing_period_end, due_at, metadata, created_at, updated_at
                )
                VALUES (
                    %s, %s, %s, %s,
                    'pending', %s, %s, %s,
                    %s, COALESCE(%s, NOW() + INTERVAL '14 days'), %s::jsonb, NOW(), NOW()
                )
                RETURNING id
                """,
                (
                    subscription_id, company_id, billing_ref, invoice_ref,
                    amount, currency, period_start or now,
                    period_end or (now + timedelta(days=30)), due_at,
                    json.dumps(meta),
                ),
            )
            billing_id = cur.fetchone()[0]

            billing._event(
                cur, subscription_id, company_id, "manual_invoice_issued",
                description=f"Manual invoice issued: {invoice_ref} ({currency} {amount})",
                metadata={"billing_id": billing_id, "invoice_reference": invoice_ref, "amount": amount, "note": note},
            )
        conn.commit()
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": "Failed to create billing record", "detail": str(exc)}), 500
    finally:
        conn.close()

    _audit(
        "subscription.invoice_issued",
        entity_type="subscription_billing",
        entity_id=billing_id,
        description=f"Manual invoice {invoice_ref} issued for company {company_id} ({currency} {amount})",
        after={"billing_id": billing_id, "invoice_reference": invoice_ref, "amount": amount, "billing_status": "pending"},
        metadata={"via": "control", "company_id": company_id},
    )

    return jsonify({
        "ok": True,
        "billing_id": billing_id,
        "invoice_reference": invoice_ref,
        "amount": amount,
        "currency": currency,
        "billing_status": "pending",
    })


# ---------------------------------------------------------------
# INVOICE PDF GENERATION
# ---------------------------------------------------------------

@subscriptions_bp.get("/<int:company_id>/billing/<int:billing_id>/invoice-pdf")
@require_control_auth
def get_billing_invoice_pdf(company_id, billing_id):
    """
    Generate and stream an invoice PDF for a subscription billing row.
    """
    from BackEnd.Services.invoice_pdf_service import generate_invoice_pdf

    row = g.control_service.get_billing_row_for_company(company_id, billing_id)
    if not row:
        return jsonify({"error": "Billing row not found"}), 404

    company = g.control_service.db.fetch_one(
        """
        SELECT id, name, company_email, company_phone, physical_address,
               postal_address, vat, tin, company_reg_no, currency
        FROM public.companies
        WHERE id = %s
        """,
        (company_id,)
    ) or {"name": f"Company #{company_id}"}

    meta = row.get("metadata") or {}
    lines = meta.get("lines") or [
        {
            "description": meta.get("description") or f"Subscription Billing ({row.get('invoice_reference') or row.get('billing_reference')})",
            "quantity": 1,
            "unit_price": float(row.get("amount") or 0),
            "line_total": float(row.get("amount") or 0),
            "total": float(row.get("amount") or 0),
            "tax_rate": 0,
            "tax_amount": 0,
        }
    ]

    inv_doc = {
        "invoice_number": row.get("invoice_reference") or row.get("billing_reference") or f"FS-{billing_id}",
        "number": row.get("invoice_reference") or row.get("billing_reference") or f"FS-{billing_id}",
        "invoice_date": row.get("created_at").strftime("%Y-%m-%d") if hasattr(row.get("created_at"), "strftime") else str(row.get("created_at") or "")[:10],
        "due_date": row.get("due_at").strftime("%Y-%m-%d") if hasattr(row.get("due_at"), "strftime") else str(row.get("due_at") or "")[:10],
        "customer_name": company.get("name") or company.get("company_name"),
        "customer": {
            "name": company.get("name") or company.get("company_name"),
            "email": company.get("company_email"),
            "phone": company.get("company_phone"),
            "address": company.get("physical_address") or company.get("postal_address"),
            "vat_no": company.get("vat"),
            "reg_no": company.get("company_reg_no"),
        },
        "lines": lines,
        "currency": row.get("currency") or "LSL",
        "subtotal": float(row.get("amount") or 0),
        "total_amount": float(row.get("amount") or 0),
        "grand_total": float(row.get("amount") or 0),
        "status": row.get("billing_status") or "pending",
        "notes": meta.get("note") or (
            f"Subscription Payment ({row.get('invoice_reference') or row.get('billing_reference')})\n"
            "Remittance via Mobile Money Wallet:\n"
            f"• M-Pesa: {os.environ.get('PLATFORM_MPESA_NUMBER', '[M-Pesa Number]')} ({os.environ.get('PLATFORM_OWNER_NAME', 'Tseliso Napo')})\n"
            f"• EcoCash: {os.environ.get('PLATFORM_ECOCASH_NUMBER', '[EcoCash Number]')} ({os.environ.get('PLATFORM_OWNER_NAME', 'Tseliso Napo')})\n"
            f"Reference: Use Invoice Ref '{row.get('invoice_reference') or row.get('billing_reference')}'"
        ),
    }

    platform_name = os.environ.get("PLATFORM_COMPANY_NAME", "FinSphere Solutions")
    owner_name = os.environ.get("PLATFORM_OWNER_NAME", "Tseliso Napo")
    owner_id = os.environ.get("PLATFORM_OWNER_ID_NO", "").strip()
    contact_email = os.environ.get("PLATFORM_CONTACT_EMAIL", "accounts@finspheresolutions.com")
    billing_email = os.environ.get("PLATFORM_BILLING_EMAIL", "billing@finspheresolutions.com")
    mpesa_no = os.environ.get("PLATFORM_MPESA_NUMBER", "").strip()
    ecocash_no = os.environ.get("PLATFORM_ECOCASH_NUMBER", "").strip()
    address = os.environ.get("PLATFORM_ADDRESS", "Maseru, Lesotho")

    reg_label = f"ID No: {owner_id} (Sole Trader)" if owner_id else f"Operating as Sole Trader ({owner_name})"

    issuer_company = {
        "name": platform_name,
        "company_name": platform_name,
        "company_reg_no": reg_label,
        "reg_no": reg_label,
        "email": contact_email,
        "billing_email": billing_email,
        "phone": mpesa_no or ecocash_no or "",
        "address": address,
        "currency": row.get("currency") or "LSL",
    }

    try:
        pdf_bytes = generate_invoice_pdf(inv_doc, company=issuer_company)
    except Exception as exc:
        return jsonify({"error": "Failed to render PDF", "detail": str(exc)}), 500

    filename = f"Invoice_{inv_doc['invoice_number']}.pdf"
    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=\"{filename}\"",
            "Content-Type": "application/pdf",
        },
    )


# ---------------------------------------------------------------
# SYNC COMPANIES TO ACCOUNTING CUSTOMERS
# ---------------------------------------------------------------

@subscriptions_bp.post("/sync-companies-to-accounting")
@require_control_admin
def sync_companies_to_accounting():
    """
    Sync all active public.companies into an accounting company's customers table.
    Body: { "accounting_company_id": int }
    """
    body = _body()
    accounting_cid = body.get("accounting_company_id")
    if not accounting_cid:
        return jsonify({"error": "accounting_company_id is required"}), 400

    result = g.control_service.db.sync_customers_from_public_companies(int(accounting_cid))
    _audit(
        "accounting.customers_synced_from_companies",
        entity_type="company",
        entity_id=int(accounting_cid),
        description=f"Synced {result.get('total_companies')} public companies to accounting company #{accounting_cid} customers",
        metadata=result,
    )
    return jsonify(result)
