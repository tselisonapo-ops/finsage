"""
FinSage — Phase 4: Trials & billing loop
========================================

The full commercial lifecycle on top of the EXISTING tables (no
migrations — company_subscriptions / subscription_billing /
subscription_events already carry every needed column).

THE TRIAL-DESIGN DECISION (agreed)
----------------------------------
The no-card trial runs on PREMIUM, not Enterprise:

  TRIAL_EXPERIENCE_PLAN = "premium"

Why (short): users commit to what they're about to lose. Bonding with
OPS/consolidation/PAYE during a trial makes the eventual Premium commit
feel like losing features (loss aversion against you), and statutory
filing endpoints must not be exercised from trial accounts. Enterprise
features stay VISIBLE everywhere (nav, upsell modal, entitlements
endpoint) — users can reach every corner of the app, they just can't
transact in firm-grade modules. Flip TRIAL_EXPERIENCE_PLAN="enterprise"
(or pass plan_code per company) if onboarding data says otherwise.

STATE MACHINE (company_subscriptions.status)
--------------------------------------------
  trialing ──commit──▶ active(plan X)          ← first charge at commit
  trialing ──expire─▶ grace (READ-ONLY, 14d)   ← metadata.grace_ends_at
  active   ──fail───▶ active+past_due          ← still full access, retries
  past_due ──success─▶ active                  ← billing_status='current'
  past_due ──exhaust▶ grace (READ-ONLY, 14d)   ← dunning gave up
  grace    ──commit──▶ active(plan X)
  grace    ──expire─▶ active(free)             ← plan_id switched to free
  active   ──cancel──▶ cancelled(effective at period end) ──▶ active(free)

WRITE methods are blocked during grace by the entitlement gate
(error "subscription_expired") — EXEMPT_PATHS (approvals, decisions,
payment release) still resolve, per the downgrade rule. Reads and
exports stay available: reading your data is the point of grace.

PAYMENT GATEWAY SEAM
--------------------
No gateway is chosen yet, so this ships with ManualGateway: renewal
cycles create PENDING billing rows and wait. When a gateway arrives,
implement charge() and inject it:

    class MyGateway:
        def charge(self, *, company_id, amount, currency, billing_row_id,
                   description):
            ...call provider...
            return {"ok": True, "external_payment_id": "tx_123"}
            # or {"ok": False, "failure_reason": "card_declined"}

    BillingService(db, ent, gateway=MyGateway())

Webhooks then call record_payment_success / record_payment_failure.

Dunning: on failure, retries are scheduled +2, +5, +9 days (RETRY_SCHEDULE_DAYS);
exhausted → grace. Every transition writes subscription_events; key ones
also write the tenant audit_trail (module="subscription").

Usage (signup, after company creation):
    billing = BillingService(db_service, entitlement_service)
    billing.provision_trial(company_id, actor_user_id=user_id)

Usage (user picks a plan):
    billing.commit_plan(company_id, "business", actor_user_id=user_id)

Usage (billing pages / webhooks):
    billing.upgrade(company_id, "premium", actor_user_id=uid)      # now, prorated
    billing.downgrade(company_id, "business", actor_user_id=uid)   # at period end
    billing.record_payment_success(billing_row_id, external_payment_id=...)
    billing.record_payment_failure(billing_row_id, reason="card_declined")
"""

import json
import logging
from datetime import datetime, timedelta

log = logging.getLogger("finsage.billing")

# ------------------------------------------------------------------
# Product knobs
# ------------------------------------------------------------------

TRIAL_EXPERIENCE_PLAN = "premium"      # what a no-card trial feels like
GRACE_DAYS = 14                        # read-only window before → free
RETRY_SCHEDULE_DAYS = [2, 5, 9]        # dunning retries after a failure
BILLING_INTERVALS = {"monthly": 30, "annual": 365}


# ------------------------------------------------------------------
# Pure helpers (no DB — unit-testable)
# ------------------------------------------------------------------

def period_after(start, interval):
    """Next (period_start, period_end) for a billing interval."""
    days = BILLING_INTERVALS.get(interval, 30)
    return start, start + timedelta(days=days)


def proration_credit(amount, period_start, period_end, now):
    """Unused value of the current period (upgrade credit)."""
    total = (period_end - period_start).total_seconds()
    if total <= 0:
        return 0.0
    remaining = (period_end - now).total_seconds()
    if remaining <= 0:
        return 0.0
    return round(float(amount) * (remaining / total), 2)


def proration_charge(new_amount, credit):
    """Charge after credit; leftover credit (negative result) is parked."""
    charge = round(float(new_amount) - float(credit), 2)
    if charge >= 0:
        return charge, 0.0
    return 0.0, round(-charge, 2)     # leftover credit carried forward


def retry_at(failed_at, attempt_no):
    """When the next dunning retry runs (None = schedule exhausted)."""
    idx = attempt_no - 1               # attempt 1 just failed
    if idx >= len(RETRY_SCHEDULE_DAYS):
        return None
    return failed_at + timedelta(days=RETRY_SCHEDULE_DAYS[idx])


def trial_nudge_key(trial_ends_at, today):
    """Which trial nudge (if any) is due today. Idempotency is enforced
    by the caller via subscription_events.event_reference."""
    if trial_ends_at is None:
        return None
    end_date = (trial_ends_at.date() if isinstance(trial_ends_at, datetime)
                else trial_ends_at)
    today = (today.date() if isinstance(today, datetime) else today)
    days_left = (end_date - today).days
    return {5: "trial_d_5", 1: "trial_d_1", 0: "trial_expired"}.get(days_left)


def grace_nudge_key(grace_ends_at, today, grace_days=GRACE_DAYS):
    """Day-3-of-grace nudge ('commit or drop to free in 11 days')."""
    if grace_ends_at is None:
        return None
    end_date = (grace_ends_at.date() if isinstance(grace_ends_at, datetime)
                else grace_ends_at)
    today = (today.date() if isinstance(today, datetime) else today)
    days_left = (end_date - today).days
    if days_left == max(grace_days - 3, 0):
        return "grace_day_3"
    if days_left == 0:
        return "grace_ended"
    return None


# ------------------------------------------------------------------
# Default gateway: no provider wired yet — cycles stay PENDING and are
# settled manually / by the future webhook. Nothing is auto-failed.
# ------------------------------------------------------------------

class ManualGateway:
    def charge(self, **kwargs):
        return {"ok": None, "pending": True,
                "note": "ManualGateway: settle via admin or webhook"}


# Nudge emails (subject, plain-ish html body). mailer is injectable;
# default logs instead of sending.
NUDGE_TEMPLATES = {
    "trial_d_5": (
        "Your FinSage trial ends in 5 days",
        "Hi there,<br><br>Your FinSage trial ends in 5 days. Pick the plan "
        "that fits — everything you've set up stays exactly as it is."
        "<br><br>The FinSage team",
    ),
    "trial_d_1": (
        "Your FinSage trial ends tomorrow",
        "Hi there,<br><br>Tomorrow your trial ends. Choose a plan to keep "
        "your workspace live, or explore in read-only mode for 14 more days."
        "<br><br>The FinSage team",
    ),
    "trial_expired": (
        "Your FinSage trial has ended",
        "Hi there,<br><br>Your trial has ended and your workspace is now in "
        "read-only mode for 14 days. Commit to a plan anytime to pick up "
        "right where you left off.<br><br>The FinSage team",
    ),
    "grace_day_3": (
        "Keep your FinSage workspace — 11 days left",
        "Hi there,<br><br>Your workspace is read-only. Commit to a plan "
        "before the read-only window ends to avoid moving to the Free plan."
        "<br><br>The FinSage team",
    ),
    "grace_ended": (
        "Your FinSage workspace has moved to the Free plan",
        "Hi there,<br><br>The read-only window has ended and your company "
        "is now on the Free plan (25 journals and 5 invoices per month). "
        "Upgrade anytime — your history is intact.<br><br>The FinSage team",
    ),
    "payment_failed": (
        "Action needed: your FinSage payment failed",
        "Hi there,<br><br>We couldn't process your latest payment. We'll "
        "retry automatically — no action needed if your card is valid."
        "<br><br>The FinSage team",
    ),
    "payment_final": (
        "Your FinSage subscription is paused (read-only)",
        "Hi there,<br><br>After several retries your payment still failed, "
        "so your workspace is read-only for 14 days. Settle your billing to "
        "restore full access instantly.<br><br>The FinSage team",
    ),
}


# ------------------------------------------------------------------
# Service
# ------------------------------------------------------------------

class BillingService:

    def __init__(self, db_service, entitlement_service=None, gateway=None,
                 mailer=None):
        self.db = db_service
        self.ent = entitlement_service      # for notify_plan_change
        self.gateway = gateway or ManualGateway()
        self.mailer = mailer                # callable(to, subject, html)

    # ------------------------------------------------------------------
    # small utilities
    # ------------------------------------------------------------------

    def _notify_plan_change(self, company_id):
        if self.ent is None:
            try:
                from subscription.entitlements import (
                    EntitlementService,
                )
                self.ent = EntitlementService(self.db)
            except Exception:
                return
        try:
            self.ent.notify_plan_change(company_id)
        except Exception:
            log.warning("notify_plan_change failed cid=%s", company_id,
                        exc_info=True)

    def _event(self, cur, subscription_id, company_id, event_type,
               event_status="succeeded", event_reference=None,
               description=None, effective_at=None, metadata=None):
        cur.execute(
            """
            INSERT INTO public.subscription_events (
                subscription_id, company_id, event_type, event_status,
                event_reference, effective_at, description, metadata
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            """,
            (subscription_id, company_id, event_type, event_status,
             event_reference, effective_at, description,
             json.dumps(metadata or {})),
        )

    def _audit(self, company_id, *, actor_user_id, action, description,
               after=None):
        """Tenant audit trail — rides the same infra as everything else."""
        try:
            self.db.audit_log(
                company_id,
                actor_user_id=int(actor_user_id or 0),
                module="subscription",
                action=action,
                entity_type="subscription",
                entity_id=str(company_id),
                after_json=after or {},
                message=description,
                source="billing",
            )
        except Exception:
            log.warning("subscription audit failed cid=%s", company_id,
                        exc_info=True)

    def _plan(self, cur, plan_code):
        cur.execute(
            """
            SELECT id, plan_code, monthly_amount, annual_amount, trial_days,
                   currency
            FROM public.subscription_plans
            WHERE plan_code = %s AND is_active = TRUE
            LIMIT 1
            """,
            (plan_code,),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"plan not found or inactive: {plan_code}")
        cols = ("id", "plan_code", "monthly_amount", "annual_amount",
                "trial_days", "currency")
        return dict(zip(cols, row))

    def get_active_subscription(self, company_id):
        conn = self.db.get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT s.id, s.company_id, s.plan_id, s.status,
                           s.billing_status, s.billing_interval, s.currency,
                           s.amount, s.started_at, s.trial_ends_at,
                           s.current_period_start, s.current_period_end,
                           s.next_billing_at, s.cancelled_at,
                           s.cancellation_effective_at, s.metadata,
                           p.plan_code
                    FROM public.company_subscriptions s
                    JOIN public.subscription_plans p ON p.id = s.plan_id
                    WHERE s.company_id = %s
                    ORDER BY s.created_at DESC
                    LIMIT 1
                    """,
                    (company_id,),
                )
                row = cur.fetchone()
        finally:
            conn.close()
        if not row:
            return None
        cols = ("id", "company_id", "plan_id", "status", "billing_status",
                "billing_interval", "currency", "amount", "started_at",
                "trial_ends_at", "current_period_start", "current_period_end",
                "next_billing_at", "cancelled_at", "cancellation_effective_at",
                "metadata", "plan_code")
        sub = dict(zip(cols, row))
        sub["metadata"] = dict(sub["metadata"] or {})
        return sub

    # ------------------------------------------------------------------
    # Provisioning (signup — no card upfront)
    # ------------------------------------------------------------------

    def provision_trial(self, company_id, plan_code=None, trial_days=None,
                        actor_user_id=None, source="signup"):
        """
        Starts the no-card trial. The subscription ROW points at the
        trial-experience plan (default premium) so entitlements resolve
        exactly like a paying premium company — status 'trialing'.
        Idempotent: an existing active/trialing subscription is returned
        untouched.
        """
        plan_code = plan_code or TRIAL_EXPERIENCE_PLAN
        conn = self.db.get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, status FROM public.company_subscriptions
                    WHERE company_id = %s
                      AND status IN ('trialing', 'active')
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    (company_id,),
                )
                existing = cur.fetchone()
                if existing:
                    return {"subscription_id": existing[0],
                            "created": False, "status": existing[1]}

                plan = self._plan(cur, plan_code)
                trial_days = int(
                    trial_days if trial_days is not None
                    else plan["trial_days"] or 0
                )
                start = datetime.utcnow()
                trial_end = (start + timedelta(days=trial_days)
                             if trial_days > 0 else None)
                meta = {
                    "trial": True,
                    "trial_experience_plan": plan_code,
                    "source": source,
                }

                cur.execute(
                    """
                    INSERT INTO public.company_subscriptions (
                        company_id, plan_id, status, billing_status,
                        billing_interval, currency, amount,
                        started_at, trial_ends_at, metadata
                    )
                    VALUES (%s, %s, 'trialing', 'none',
                            'monthly', %s, 0, %s, %s, %s::jsonb)
                    RETURNING id
                    """,
                    (company_id, plan["id"], plan["currency"], start,
                     trial_end, json.dumps(meta)),
                )
                sub_id = cur.fetchone()[0]
                self._event(
                    cur, sub_id, company_id, "trial_started",
                    description=f"plan={plan_code} trial_days={trial_days}",
                    effective_at=trial_end,
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        self._audit(company_id, actor_user_id=actor_user_id,
                    action="trial_started",
                    description=f"trial started on {plan_code}")
        self._notify_plan_change(company_id)
        return {"subscription_id": sub_id, "created": True,
                "status": "trialing", "trial_ends_at": trial_end}

    # ------------------------------------------------------------------
    # Commit (trial/grace/free → paid plan) — first charge now
    # ------------------------------------------------------------------

    def commit_plan(self, company_id, plan_code, billing_interval="monthly",
                    actor_user_id=None):
        return self._switch_plan(
            company_id, plan_code, billing_interval,
            actor_user_id=actor_user_id, when="now", event_type="plan_committed",
            prorate=False,
        )

    def upgrade(self, company_id, plan_code, actor_user_id=None):
        """Immediate mid-cycle upgrade: prorated credit for unused time."""
        return self._switch_plan(
            company_id, plan_code, None, actor_user_id=actor_user_id,
            when="now", event_type="plan_upgraded", prorate=True,
        )

    def downgrade(self, company_id, plan_code, actor_user_id=None):
        """Scheduled downgrade at period end (they already paid)."""
        sub = self.get_active_subscription(company_id)
        if not sub:
            raise ValueError("no subscription to downgrade")
        effective = sub["current_period_end"] or datetime.utcnow()
        conn = self.db.get_conn()
        try:
            with conn.cursor() as cur:
                self._plan(cur, plan_code)          # validate exists
                meta = dict(sub["metadata"])
                meta["scheduled_plan_code"] = plan_code
                meta["scheduled_effective_at"] = effective.isoformat()
                cur.execute(
                    """
                    UPDATE public.company_subscriptions
                    SET metadata = %s::jsonb, updated_at = NOW()
                    WHERE id = %s
                    """,
                    (json.dumps(meta), sub["id"]),
                )
                self._event(
                    cur, sub["id"], company_id, "plan_downgrade_scheduled",
                    description=f"to={plan_code}",
                    effective_at=effective,
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        self._audit(company_id, actor_user_id=actor_user_id,
                    action="plan_downgrade_scheduled",
                    description=f"to={plan_code} effective={effective}")
        # entitlements do NOT change yet — they paid for this period
        return {"scheduled": True, "effective_at": effective}

    def cancel(self, company_id, actor_user_id=None):
        """Voluntary cancel: runs to the end of the paid period, then the
        daily job moves the company to the free plan."""
        sub = self.get_active_subscription(company_id)
        if not sub:
            raise ValueError("no subscription to cancel")
        effective = sub["current_period_end"] or datetime.utcnow()
        conn = self.db.get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE public.company_subscriptions
                    SET status = 'cancelled',
                        cancelled_at = NOW(),
                        cancellation_effective_at = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (effective, sub["id"]),
                )
                self._event(cur, sub["id"], company_id, "subscription_cancelled",
                            effective_at=effective,
                            description="runs to period end, then free")
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        self._audit(company_id, actor_user_id=actor_user_id,
                    action="subscription_cancelled",
                    description=f"effective={effective}")
        return {"cancelled": True, "effective_at": effective}

    def extend_trial(self, company_id, days, reason=None,
                     actor_user_id=None):
        """Extend the trialing window by N days (Control cockpit / ops).

        Only valid while status='trialing'. Extends from
        max(NOW(), trial_ends_at), so an elapsed-but-not-yet-expired
        trial still gets a clean window. Writes the trial_extended
        event, tenant audit row and busts the entitlement cache (the
        trial_days_left / read-only flags resolve from trial_ends_at).
        """
        if days is None:
            raise ValueError("days is required (1..365)")
        days = int(days)
        if days <= 0 or days > 365:
            raise ValueError("days must be between 1 and 365")
        conn = self.db.get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, status, trial_ends_at
                    FROM public.company_subscriptions
                    WHERE company_id = %s
                    ORDER BY created_at DESC
                    LIMIT 1
                    FOR UPDATE
                    """,
                    (company_id,),
                )
                row = cur.fetchone()
                if not row:
                    raise ValueError(
                        f"no subscription record for company {company_id}")
                sub_id, status, trial_end = row
                if status != "trialing":
                    raise ValueError(
                        f"trial can only be extended while trialing "
                        f"(status={status})")
                now = datetime.utcnow()
                base = trial_end if (trial_end and trial_end > now) else now
                new_end = base + timedelta(days=days)
                cur.execute(
                    """
                    UPDATE public.company_subscriptions
                    SET trial_ends_at = %s,
                        metadata = metadata || %s::jsonb,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        new_end,
                        json.dumps({
                            "trial_extended": {
                                "days": days,
                                "reason": reason,
                                "actor_user_id": actor_user_id,
                                "at": now.isoformat(),
                            },
                        }),
                        sub_id,
                    ),
                )
                self._event(
                    cur, sub_id, company_id, "trial_extended",
                    description=(f"+{days}d"
                                 + (f" — {reason}" if reason else "")
                                 + f", ends {new_end.date()}"),
                    effective_at=new_end,
                    metadata={"days": days, "reason": reason,
                              "actor_user_id": actor_user_id},
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        self._audit(company_id, actor_user_id=actor_user_id,
                    action="trial_extended",
                    description=(f"+{days}d"
                                 + (f" — {reason}" if reason else "")))
        self._notify_plan_change(company_id)
        return {"extended": True, "subscription_id": sub_id,
                "company_id": company_id, "days": days,
                "trial_ends_at": new_end}

    def _switch_plan(self, company_id, plan_code, billing_interval,
                     actor_user_id=None, when="now", event_type="plan_changed",
                     prorate=False):
        conn = self.db.get_conn()
        try:
            with conn.cursor() as cur:
                plan = self._plan(cur, plan_code)
                sub = self.get_active_subscription(company_id)
                interval = (billing_interval
                            or (sub or {}).get("billing_interval")
                            or "monthly")
                amount = (plan["annual_amount"] if interval == "annual"
                          else plan["monthly_amount"])
                now = datetime.utcnow()

                credit_balance = 0.0
                if sub:
                    credit_balance = float(
                        (sub["metadata"] or {}).get("credit_balance") or 0
                    )
                charge = amount
                proration_meta = None
                if prorate and sub and sub["current_period_end"] \
                        and sub["amount"]:
                    credit = proration_credit(
                        float(sub["amount"]),
                        sub["current_period_start"] or now,
                        sub["current_period_end"], now,
                    )
                    charge, leftover = proration_charge(amount, credit)
                    credit_balance += leftover
                    proration_meta = {"credit": credit, "charge": charge}

                start, end = period_after(now, interval)

                if sub:
                    cur.execute(
                        """
                        UPDATE public.company_subscriptions
                        SET plan_id = %s, status = 'active',
                            billing_status = %s, billing_interval = %s,
                            currency = %s, amount = %s,
                            started_at = COALESCE(started_at, %s),
                            trial_ends_at = NULL,
                            current_period_start = %s,
                            current_period_end = %s,
                            next_billing_at = %s,
                            metadata = %s::jsonb,
                            updated_at = NOW()
                        WHERE id = %s
                        RETURNING id
                        """,
                        (
                            plan["id"],
                            "current" if float(amount) == 0 else "pending",
                            interval, plan_code, amount,
                            now, start, end, end,
                            json.dumps({
                                **(sub["metadata"] or {}),
                                "trial": False,
                                "credit_balance": credit_balance,
                                "scheduled_plan_code": None,
                                "scheduled_effective_at": None,
                            }),
                            sub["id"],
                        ),
                    )
                    sub_id = cur.fetchone()[0]
                else:
                    cur.execute(
                        """
                        INSERT INTO public.company_subscriptions (
                            company_id, plan_id, status, billing_status,
                            billing_interval, currency, amount,
                            started_at, current_period_start,
                            current_period_end, next_billing_at, metadata
                        )
                        VALUES (%s, %s, 'active', %s, %s, %s, %s,
                                %s, %s, %s, %s, %s::jsonb)
                        RETURNING id
                        """,
                        (
                            company_id, plan["id"],
                            "current" if float(amount) == 0 else "pending",
                            interval, plan_code, amount,
                            now, start, end, end,
                            json.dumps({"trial": False,
                                        "credit_balance": credit_balance}),
                        ),
                    )
                    sub_id = cur.fetchone()[0]

                # first/prorated charge row for the gateway to settle
                billing_id = None
                if float(amount) > 0:
                    cur.execute(
                        """
                        INSERT INTO public.subscription_billing (
                            subscription_id, company_id, billing_reference,
                            billing_status, amount, currency,
                            billing_period_start, billing_period_end,
                            due_at, metadata
                        )
                        VALUES (
                            %s, %s, %s, 'pending', %s, %s, %s, %s, %s,
                            %s::jsonb
                        )
                        RETURNING id
                        """,
                        (
                            sub_id, company_id,
                            f"FS-{company_id}-{now.strftime('%Y%m%d%H%M%S')}",
                            charge, plan_code.upper(),
                            start, end, now,
                            json.dumps({"proration": proration_meta,
                                        "kind": "commit"}),
                        ),
                    )
                    billing_id = cur.fetchone()[0]

                self._event(cur, sub_id, company_id, event_type,
                            description=f"plan={plan_code} interval={interval}"
                                        f" charge={charge}",
                            metadata={"proration": proration_meta})
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        self._audit(company_id, actor_user_id=actor_user_id,
                    action=event_type,
                    description=f"plan={plan_code} charge={charge}",
                    after={"plan_code": plan_code, "charge": charge})
        self._notify_plan_change(company_id)      # entitlement applies NOW
        return {"subscription_id": sub_id, "plan_code": plan_code,
                "charge": charge, "billing_id": billing_id,
                "credit_balance": credit_balance}

    # ------------------------------------------------------------------
    # Payment loop (webhooks / admin settle)
    # ------------------------------------------------------------------

    def record_payment_success(self, billing_id,
                               external_payment_id=None):
        conn = self.db.get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT b.subscription_id, b.company_id, b.billing_status,
                           b.billing_period_end, b.amount, s.billing_interval
                    FROM public.subscription_billing b
                    JOIN public.company_subscriptions s
                      ON s.id = b.subscription_id
                    WHERE b.id = %s
                    FOR UPDATE OF b
                    """,
                    (billing_id,),
                )
                row = cur.fetchone()
                if not row:
                    raise ValueError(f"billing row not found: {billing_id}")
                sub_id, company_id, bstatus, period_end, amount, interval = row
                if bstatus == "paid":
                    conn.commit()            # idempotent no-op
                    return {"ok": True, "already_paid": True}

                cur.execute(
                    """
                    UPDATE public.subscription_billing
                    SET billing_status = 'paid', paid_at = NOW(),
                        external_payment_id = %s, failure_reason = NULL,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (external_payment_id, billing_id),
                )
                # extend the period this charge pays for
                if period_end:
                    next_start, next_end = period_after(
                        period_end, interval or "monthly")
                    cur.execute(
                        """
                        UPDATE public.company_subscriptions
                        SET status = 'active', billing_status = 'current',
                            current_period_end = %s,
                            next_billing_at = %s, suspended_at = NULL,
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (period_end, period_end, sub_id),
                    )
                self._event(cur, sub_id, company_id, "payment_succeeded",
                            event_reference=external_payment_id,
                            description=f"amount={amount}")
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        self._notify_plan_change(company_id)
        return {"ok": True}

    def record_payment_failure(self, billing_id, reason=None,
                               external_payment_id=None):
        conn = self.db.get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT b.subscription_id, b.company_id, b.metadata
                    FROM public.subscription_billing b
                    WHERE b.id = %s
                    FOR UPDATE
                    """,
                    (billing_id,),
                )
                row = cur.fetchone()
                if not row:
                    raise ValueError(f"billing row not found: {billing_id}")
                sub_id, company_id, bmeta = row
                bmeta = dict(bmeta or {})
                attempt = int(bmeta.get("attempt") or 1)

                cur.execute(
                    """
                    UPDATE public.subscription_billing
                    SET billing_status = 'failed', failed_at = NOW(),
                        failure_reason = %s, external_payment_id = %s,
                        metadata = %s::jsonb, updated_at = NOW()
                    WHERE id = %s
                    """,
                    (reason, external_payment_id,
                     json.dumps({**bmeta, "attempt": attempt}), billing_id),
                )
                nxt = retry_at(datetime.utcnow(), attempt)
                final_email = False
                if nxt is None:
                    # dunning exhausted → read-only grace (14 days)
                    grace_end = datetime.utcnow() + timedelta(days=GRACE_DAYS)
                    cur.execute(
                        """
                        UPDATE public.company_subscriptions
                        SET status = 'grace',
                            next_billing_at = NULL,
                            metadata = metadata || %s::jsonb,
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (
                            json.dumps({
                                "grace_started_at":
                                    datetime.utcnow().isoformat(),
                                "grace_ends_at": grace_end.isoformat(),
                                "grace_reason": "payment_failed",
                            }),
                            sub_id,
                        ),
                    )
                    self._event(cur, sub_id, company_id, "dunning_exhausted",
                                description=f"read-only until {grace_end}")
                    final_email = True
                else:
                    cur.execute(
                        """
                        UPDATE public.company_subscriptions
                        SET billing_status = 'past_due',
                            next_billing_at = %s,
                            metadata = metadata || %s::jsonb,
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (
                            nxt,
                            json.dumps({"dunning_attempt": attempt,
                                        "last_failure_reason": reason}),
                            sub_id,
                        ),
                    )
                self._event(cur, sub_id, company_id, "payment_failed",
                            event_status="failed",
                            event_reference=external_payment_id,
                            description=f"attempt={attempt} reason={reason}",
                            effective_at=nxt)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        self._send(company_id, "payment_final" if final_email
                   else "payment_failed")
        return {"retry_scheduled": nxt is not None,
                "next_retry_at": nxt,
                "grace": final_email}

    # ------------------------------------------------------------------
    # Lifecycle transitions (driven by subscription_jobs.run_daily)
    # ------------------------------------------------------------------

    def expire_trials(self, today=None):
        """
        trialing  (past trial_ends_at) → grace (read-only 14d)
        grace     (past grace_ends_at) → active on the FREE plan
        Returns list of {company_id, action} for the job summary.
        """
        today = today or datetime.utcnow()
        out = []
        conn = self.db.get_conn()
        try:
            with conn.cursor() as cur:
                # 1) trialing → grace
                cur.execute(
                    """
                    SELECT s.id, s.company_id, s.trial_ends_at
                    FROM public.company_subscriptions s
                    WHERE s.status = 'trialing'
                      AND s.trial_ends_at IS NOT NULL
                      AND s.trial_ends_at < %s
                    FOR UPDATE
                    """,
                    (today,),
                )
                for sub_id, company_id, trial_end in cur.fetchall():
                    grace_end = trial_end + timedelta(days=GRACE_DAYS)
                    cur.execute(
                        """
                        UPDATE public.company_subscriptions
                        SET status = 'grace', metadata = %s::jsonb,
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (json.dumps({
                            "grace_started_at": trial_end.isoformat(),
                            "grace_ends_at": grace_end.isoformat(),
                            "grace_reason": "trial_expired",
                        }), sub_id),
                    )
                    self._event(cur, sub_id, company_id, "trial_expired",
                                description=f"read-only until {grace_end}")
                    out.append({"company_id": company_id,
                                "action": "trial_to_grace",
                                "grace_ends_at": grace_end})

                # 2) grace → free
                cur.execute(
                    """
                    SELECT s.id, s.company_id, s.metadata
                    FROM public.company_subscriptions s
                    WHERE s.status = 'grace'
                    FOR UPDATE
                    """,
                    (today,),
                )
                free_plan = None
                for sub_id, company_id, meta in cur.fetchall():
                    meta = dict(meta or {})
                    grace_end = meta.get("grace_ends_at")
                    if not grace_end:
                        continue
                    grace_end = datetime.fromisoformat(grace_end)
                    if grace_end > today:
                        continue
                    if free_plan is None:
                        free_plan = self._plan(cur, "free")
                    cur.execute(
                        """
                        UPDATE public.company_subscriptions
                        SET plan_id = %s, status = 'active',
                            billing_status = 'current', amount = 0,
                            next_billing_at = NULL,
                            trial_ends_at = NULL,
                            metadata = %s::jsonb, updated_at = NOW()
                        WHERE id = %s
                        """,
                        (free_plan["id"],
                         json.dumps({**meta, "grace_ended_at":
                                     today.isoformat()}),
                         sub_id),
                    )
                    self._event(cur, sub_id, company_id,
                                "downgraded_to_free",
                                description="grace window ended")
                    out.append({"company_id": company_id,
                                "action": "grace_to_free"})
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        for item in out:
            self._notify_plan_change(item["company_id"])
        return out

    def apply_scheduled_changes(self, today=None):
        """Applies scheduled downgrades + expired cancellations → free."""
        today = today or datetime.utcnow()
        out = []
        conn = self.db.get_conn()
        try:
            with conn.cursor() as cur:
                # scheduled downgrades (metadata-driven)
                cur.execute(
                    """
                    SELECT s.id, s.company_id, s.metadata
                    FROM public.company_subscriptions s
                    WHERE s.status = 'active'
                      AND s.metadata ? 'scheduled_plan_code'
                    FOR UPDATE
                    """,
                    (today,),
                )
                for sub_id, company_id, meta in cur.fetchall():
                    meta = dict(meta or {})
                    eff = meta.get("scheduled_effective_at")
                    target = meta.get("scheduled_plan_code")
                    if not eff or not target:
                        continue
                    if datetime.fromisoformat(eff) > today:
                        continue
                    plan = self._plan(cur, target)
                    cur.execute(
                        """
                        UPDATE public.company_subscriptions
                        SET plan_id = %s, amount = %s,
                            metadata = %s::jsonb, updated_at = NOW()
                        WHERE id = %s
                        """,
                        (plan["id"], plan["monthly_amount"],
                         json.dumps({**meta,
                                     "scheduled_plan_code": None,
                                     "scheduled_effective_at": None}),
                         sub_id),
                    )
                    self._event(cur, sub_id, company_id,
                                "plan_downgrade_applied",
                                description=f"to={target}")
                    out.append({"company_id": company_id,
                                "action": f"downgraded_to_{target}"})

                # cancelled subscriptions past their effective date → free
                cur.execute(
                    """
                    SELECT s.id, s.company_id
                    FROM public.company_subscriptions s
                    WHERE s.status = 'cancelled'
                      AND s.cancellation_effective_at IS NOT NULL
                      AND s.cancellation_effective_at <= %s
                    FOR UPDATE
                    """,
                    (today,),
                )
                free_plan = None
                for sub_id, company_id in cur.fetchall():
                    if free_plan is None:
                        free_plan = self._plan(cur, "free")
                    cur.execute(
                        """
                        UPDATE public.company_subscriptions
                        SET plan_id = %s, status = 'active',
                            billing_status = 'current', amount = 0,
                            next_billing_at = NULL, updated_at = NOW()
                        WHERE id = %s
                        """,
                        (free_plan["id"], sub_id),
                    )
                    self._event(cur, sub_id, company_id,
                                "downgraded_to_free",
                                description="cancellation took effect")
                    out.append({"company_id": company_id,
                                "action": "cancelled_to_free"})
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        for item in out:
            self._notify_plan_change(item["company_id"])
        return out

    def run_renewals(self, today=None):
        """
        Renewal charges + dunning retries.
        - active+current with next_billing_at due → new PENDING cycle row
          (gateway settles; ManualGateway leaves it pending)
        - active+past_due with next_billing_at due → gateway retry on the
          latest failed cycle row (ManualGateway: leaves it pending)
        Returns job summary items.
        """
        today = today or datetime.utcnow()
        out = []
        conn = self.db.get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT s.id, s.company_id, s.billing_status, s.amount,
                           s.currency, s.current_period_start,
                           s.current_period_end, s.metadata
                    FROM public.company_subscriptions s
                    WHERE s.status = 'active'
                      AND s.amount > 0
                      AND s.next_billing_at IS NOT NULL
                      AND s.next_billing_at <= %s
                    FOR UPDATE
                    """,
                    (today,),
                )
                rows = cur.fetchall()
                for (sub_id, company_id, bstatus, amount, currency,
                     pstart, pend, meta) in rows:
                    meta = dict(meta or {})
                    if bstatus == "past_due":
                        # dunning retry: re-open the latest failed row,
                        # bumping the attempt counter stored on the ROW
                        cur.execute(
                            """
                            SELECT id, metadata
                            FROM public.subscription_billing
                            WHERE subscription_id = %s
                              AND billing_status = 'failed'
                            ORDER BY failed_at DESC LIMIT 1
                            """,
                            (sub_id,),
                        )
                        failed = cur.fetchone()
                        if failed:
                            failed_id, failed_meta = failed
                            failed_meta = dict(failed_meta or {})
                            attempt = int(failed_meta.get("attempt") or 1)
                            cur.execute(
                                """
                                UPDATE public.subscription_billing
                                SET billing_status = 'pending',
                                    failure_reason = NULL,
                                    metadata = %s::jsonb,
                                    updated_at = NOW()
                                WHERE id = %s
                                """,
                                (json.dumps({**failed_meta,
                                             "attempt": attempt + 1}),
                                 failed_id),
                            )
                            out.append({"company_id": company_id,
                                        "action": "dunning_retry",
                                        "billing_id": failed_id,
                                        "attempt": attempt + 1})
                        continue

                    # normal renewal: new pending cycle
                    start, end = period_after(pend or pstart or today,
                                              "monthly")
                    cur.execute(
                        """
                        INSERT INTO public.subscription_billing (
                            subscription_id, company_id, billing_reference,
                            billing_status, amount, currency,
                            billing_period_start, billing_period_end,
                            due_at, metadata
                        )
                        VALUES (%s, %s, %s, 'pending', %s, %s, %s, %s, %s,
                                '{"kind": "renewal"}'::jsonb)
                        RETURNING id
                        """,
                        (sub_id, company_id,
                         f"FS-{company_id}-{today.strftime('%Y%m%d')}-R",
                         amount, currency, start, end, pend),
                    )
                    billing_id = cur.fetchone()[0]
                    result = self.gateway.charge(
                        company_id=company_id, amount=float(amount),
                        currency=currency, billing_row_id=billing_id,
                        description="FinSage subscription renewal",
                    )
                    if result.get("ok") is True:
                        cur.execute(
                            """
                            UPDATE public.subscription_billing
                            SET billing_status = 'paid', paid_at = NOW(),
                                external_payment_id = %s
                            WHERE id = %s
                            """,
                            (result.get("external_payment_id"), billing_id),
                        )
                        cur.execute(
                            """
                            UPDATE public.company_subscriptions
                            SET current_period_end = %s,
                                next_billing_at = %s,
                                billing_status = 'current'
                            WHERE id = %s
                            """,
                            (end, end, sub_id),
                        )
                        out.append({"company_id": company_id,
                                    "action": "renewed", "billing_id":
                                    billing_id})
                    elif result.get("ok") is False:
                        cur.execute(
                            """
                            UPDATE public.subscription_billing
                            SET billing_status = 'failed',
                                failed_at = NOW(),
                                failure_reason = %s
                            WHERE id = %s
                            """,
                            (result.get("failure_reason"), billing_id),
                        )
                        out.append({"company_id": company_id,
                                    "action": "renewal_failed",
                                    "billing_id": billing_id})
                    else:
                        # ManualGateway: stay pending, settle via webhook
                        out.append({"company_id": company_id,
                                    "action": "renewal_pending",
                                    "billing_id": billing_id})
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        return out

    # ------------------------------------------------------------------
    # Mail
    # ------------------------------------------------------------------

    def _send(self, company_id, key, to_email=None):
        subject, body = NUDGE_TEMPLATES[key]
        if self.mailer is None:
            log.info("[BILLING:mail:%s] to=%s subject=%r", key,
                     to_email or f"company:{company_id}", subject)
            return
        try:
            self.mailer(to_email or f"company:{company_id}", subject, body)
        except Exception:
            log.warning("nudge mail failed key=%s cid=%s", key, company_id,
                        exc_info=True)
