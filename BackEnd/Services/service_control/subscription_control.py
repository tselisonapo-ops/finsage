"""
FinSage — Control-panel subscription admin (SubscriptionControlMixin)
=====================================================================

Gives the Control app's ControlService the ability to MANAGE customer
subscriptions (commit/upgrade/downgrade plans, extend trials, cancel,
un-cancel, record EFT payments) by delegating to the Phase-4
BillingService — the same state machine, subscription_events rows,
tenant audit rows and entitlement cache-busting the customer-facing
API uses. Nothing is mutated outside the audited state machine.

The Control app's own READ methods (get_company_subscription,
get_subscription_billing, get_subscription_events,
get_subscription_visibility) stay untouched in service_control.py.

WHY A MIXIN (and not pasting into service_control.py)
-----------------------------------------------------
service_control.py is 3.5k lines of debugged code. Rather than editing
it heavily, the admin methods live HERE and are grafted on with ONE
line:

    from BackEnd.Services.subscription_control import (
        SubscriptionControlMixin,
    )

    class ControlService(SubscriptionControlMixin):  # was: class ControlService:
        ...

The class name does NOT change. Deleting the mixin parent restores the
original behaviour exactly — the read-only subscription view keeps
working; only the admin actions disappear.

If the import line screams (ModuleNotFoundError — depends where this
file sits in your package), the zero-import fallback is to paste this
entire class DIRECTLY ABOVE `class ControlService:` in
service_control.py and inherit from it. Same result.

HOUSE RULES
-----------
- Reads use self.db.fetch_one / fetch_all, exactly like the rest of
  the Control service.
- Writes go through app.extensions["billing"] (BillingService) for the
  state-machine actions, or replicate its exact transaction pattern
  (get_conn → cursor → commit/rollback/close) for the two Control-only
  actions (un-cancel, extend trial).
- The "writes only to control.*" rule is deliberately excepted here:
  subscription admin MUST write the public subscription tables, but
  every action lands in subscription_events + audit_trail.

REQUIREMENT (Phase 4 wiring in api_server.py)
---------------------------------------------
    billing = BillingService(db_service, app.extensions["entitlements"])
    app.extensions["billing"] = billing

Without it, admin actions raise RuntimeError with an explanatory
message. The existing READ methods never touch billing and keep
working without it.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional


class SubscriptionControlMixin:
    """Admin actions for customer subscriptions (Control panel).

    Mixed into ControlService — the methods below appear on every
    ControlService instance, so control routes call them the same way
    as every other method: ``g.control_service.admin_extend_trial(...)``
    """

    # ------------------------------------------------------------------
    # plumbing
    # ------------------------------------------------------------------

    def _billing(self):
        """Resolve the Phase-4 BillingService from the Flask app."""
        try:
            from flask import current_app

            billing = current_app.extensions.get("billing")
        except Exception:  # no app context / flask missing → treat as unwired
            billing = None
        if billing is None:
            raise RuntimeError(
                "BillingService is not registered. Wire it in api_server.py: "
                'app.extensions["billing"] = BillingService(db_service, '
                'app.extensions["entitlements"]) '
                "(see the subscription README, Phase 4 wiring section)."
            )
        return billing

    def _control_event(self, cur, subscription_id, company_id, event_type,
                       description=None, effective_at=None, metadata=None):
        """Write a subscription_events row — mirrors billing_service._event
        so Control-side actions look identical in the history feed."""
        cur.execute(
            """
            INSERT INTO public.subscription_events (
                subscription_id, company_id, event_type, event_status,
                event_reference, effective_at, description, metadata
            )
            VALUES (%s, %s, %s, 'succeeded', %s, %s, %s, %s::jsonb)
            """,
            (subscription_id, company_id, event_type, None, effective_at,
             description, json.dumps(metadata or {})),
        )

    def _control_audit(self, company_id, *, actor_user_id, action,
                       description):
        """Tenant audit_trail row (module='subscription'), never fatal."""
        try:
            self.db.audit_log(
                company_id,
                actor_user_id=int(actor_user_id or 0),
                module="subscription",
                action=action,
                entity_type="subscription",
                entity_id=str(company_id),
                after_json={},
                message=description,
                source="control",
            )
        except Exception:
            pass  # auditing must never break an admin action

    # ------------------------------------------------------------------
    # fleet reads (Control cockpit backends — SELECT-only, safe on any plan)
    # ------------------------------------------------------------------

    def get_billing_row_for_company(self, company_id: int,
                                    billing_id: int) -> Optional[Dict[str, Any]]:
        """Ownership check for settlement routes: the billing row must
        belong to the company in the URL — record_payment_success /
        record_payment_failure trust their caller on tenant scoping."""
        return self.db.fetch_one(
            """
            SELECT sb.id AS billing_id,
                   sb.subscription_id,
                   sb.company_id,
                   sb.billing_reference,
                   sb.invoice_reference,
                   sb.billing_status,
                   sb.amount,
                   sb.currency,
                   sb.billing_period_start,
                   sb.billing_period_end,
                   sb.due_at,
                   sb.paid_at,
                   sb.failed_at,
                   sb.payment_provider,
                   sb.external_payment_id,
                   sb.failure_reason,
                   sb.created_at
            FROM public.subscription_billing sb
            WHERE sb.id = %s
              AND sb.company_id = %s
            LIMIT 1
            """,
            (billing_id, company_id),
        )

    def get_awaiting_settlement(self, company_id: Optional[int] = None,
                                limit: int = 50) -> List[Dict[str, Any]]:
        """The money queue: pending/failed billing rows awaiting a human.

        Manual-gateway reality: renewals create 'pending' rows and wait;
        'failed' rows are dunning in progress. Either way, money in or
        an explicit fail — both settle from this list.
        """
        limit = min(max(int(limit or 50), 1), 200)
        where = ["sb.billing_status IN ('pending', 'failed')"]
        params: List[Any] = []
        if company_id:
            where.append("sb.company_id = %s")
            params.append(int(company_id))
        params.append(limit)
        return self.db.fetch_all(
            f"""
            SELECT sb.id AS billing_id,
                   sb.company_id,
                   c.company_name,
                   sb.billing_reference,
                   sb.invoice_reference,
                   sb.billing_status,
                   sb.amount,
                   sb.currency,
                   sb.due_at,
                   sb.failed_at,
                   sb.failure_reason,
                   sb.billing_period_end,
                   sb.created_at
            FROM public.subscription_billing sb
            LEFT JOIN public.companies c
                ON c.id = sb.company_id
            WHERE {' AND '.join(where)}
            ORDER BY sb.created_at DESC
            LIMIT %s
            """,
            tuple(params),
        )

    def list_subscriptions(self, status: Optional[str] = None,
                           plan_code: Optional[str] = None,
                           search: str = "", sort: str = "next_billing",
                           page: int = 1, per_page: int = 20):
        """Fleet overview — the LATEST subscription row per company.

        Sort whitelist (never interpolated raw): next_billing, company,
        status, amount, recent.
        """
        page = max(int(page or 1), 1)
        per_page = min(max(int(per_page or 20), 1), 100)
        offset = (page - 1) * per_page

        where = ["TRUE"]
        params: List[Any] = []
        if status:
            where.append("s.status = %s")
            params.append(str(status))
        if plan_code:
            where.append("p.plan_code = %s")
            params.append(str(plan_code))
        if search:
            where.append("c.company_name ILIKE %s")
            params.append(f"%{search}%")

        sorts = {
            "next_billing": "next_billing_at ASC NULLS LAST",
            "company": "company_name ASC",
            "status": "status ASC, company_name ASC",
            "amount": "amount DESC NULLS LAST",
            "recent": "updated_at DESC",
        }
        order = sorts.get((sort or "").strip().lower(),
                          sorts["next_billing"])

        params.extend([per_page, offset])
        return self.db.fetch_all(
            f"""
            SELECT *
            FROM (
                SELECT DISTINCT ON (s.company_id)
                       s.id AS subscription_id,
                       s.company_id,
                       c.company_name,
                       p.plan_code,
                       p.plan_name,
                       s.status,
                       s.billing_status,
                       s.billing_interval,
                       s.currency,
                       s.amount,
                       s.trial_ends_at,
                       s.current_period_end,
                       s.next_billing_at,
                       s.cancelled_at,
                       s.cancellation_effective_at,
                       s.updated_at
                FROM public.company_subscriptions s
                JOIN public.subscription_plans p
                    ON p.id = s.plan_id
                LEFT JOIN public.companies c
                    ON c.id = s.company_id
                WHERE {' AND '.join(where)}
                ORDER BY s.company_id, s.created_at DESC
            ) latest
            ORDER BY {order}
            LIMIT %s OFFSET %s
            """,
            tuple(params),
        )

    def get_subscriptions_overview(self) -> Dict[str, Any]:
        """KPI block for the cockpit header — status counts, trials
        ending within 7 days, and MRR over the latest row per company
        (annual plans counted at amount / 12)."""
        row = self.db.fetch_one(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'trialing')
                    AS trialing,
                COUNT(*) FILTER (WHERE status = 'active')
                    AS active,
                COUNT(*) FILTER (WHERE status = 'past_due')
                    AS past_due,
                COUNT(*) FILTER (WHERE status = 'grace')
                    AS grace,
                COUNT(*) FILTER (WHERE status = 'cancelled')
                    AS cancelled,
                COUNT(*) FILTER (WHERE status = 'trialing'
                                 AND trial_ends_at
                                     <= NOW() + INTERVAL '7 days')
                    AS trials_ending_7d,
                COALESCE(SUM(
                    CASE billing_interval
                        WHEN 'annual' THEN amount / 12.0
                        ELSE amount
                    END
                ) FILTER (WHERE status = 'active'), 0)
                    AS mrr
            FROM (
                SELECT DISTINCT ON (s.company_id)
                       s.status, s.billing_interval, s.amount,
                       s.trial_ends_at
                FROM public.company_subscriptions s
                ORDER BY s.company_id, s.created_at DESC
            ) latest
            """
        )
        return dict(row or {})

    # ------------------------------------------------------------------
    # plan catalog (for the change-plan dropdown)
    # ------------------------------------------------------------------

    def admin_list_plans(self) -> List[Dict[str, Any]]:
        """Active plans, cheapest first — feeds the plan dropdown."""
        return self.db.fetch_all(
            """
            SELECT id, plan_code, plan_name, description, currency,
                   monthly_amount, annual_amount, trial_days
            FROM public.subscription_plans
            WHERE is_active = TRUE
            ORDER BY monthly_amount ASC
            """
        )

    # ------------------------------------------------------------------
    # state-machine actions (delegate to BillingService — proration,
    # events, audit and entitlement cache-busting all handled there)
    # ------------------------------------------------------------------

    def admin_commit_plan(self, company_id: int, plan_code: str,
                          billing_interval: str = "monthly",
                          actor_user_id: Optional[int] = None):
        """First charge out of trialing / grace → active(plan)."""
        return self._billing().commit_plan(
            company_id, plan_code,
            billing_interval=billing_interval,
            actor_user_id=actor_user_id,
        )

    def admin_upgrade_plan(self, company_id: int, plan_code: str,
                           actor_user_id: Optional[int] = None):
        """Immediate mid-cycle upgrade, prorated credit for unused time."""
        return self._billing().upgrade(
            company_id, plan_code, actor_user_id=actor_user_id)

    def admin_downgrade_plan(self, company_id: int, plan_code: str,
                             actor_user_id: Optional[int] = None):
        """Scheduled at period end (they already paid for it)."""
        return self._billing().downgrade(
            company_id, plan_code, actor_user_id=actor_user_id)

    def admin_cancel_subscription(self, company_id: int,
                                  actor_user_id: Optional[int] = None):
        """Runs to period end, then the daily job moves them to free."""
        return self._billing().cancel(
            company_id, actor_user_id=actor_user_id)

    def admin_record_payment(self, billing_id: int,
                             external_payment_id: Optional[str] = None):
        """Mark a billing row paid (EFT came in) — extends the period,
        revives grace/past_due, writes events, busts caches."""
        return self._billing().record_payment_success(
            billing_id, external_payment_id=external_payment_id)

    def admin_record_payment_failure(self, billing_id: int,
                                     reason: Optional[str] = None):
        """Mark a billing row failed — starts/advances the dunning clock."""
        return self._billing().record_payment_failure(
            billing_id, reason=reason)

    # ------------------------------------------------------------------
    # Control-only actions (BillingService doesn't ship these)
    # ------------------------------------------------------------------

    def admin_uncancel_subscription(self, company_id: int,
                                    actor_user_id: Optional[int] = None):
        """Undo a pending cancellation (customer paid / changed mind).

        Only valid while status='cancelled' and the daily job has not
        applied it yet. Clears the cancel flags and writes an event.
        """
        conn = self.db.get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, status, cancellation_effective_at
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
                sub_id, status, eff = row
                if status != "cancelled" or not eff:
                    raise ValueError(
                        "subscription is not pending cancellation "
                        f"(status={status})")
                cur.execute(
                    """
                    UPDATE public.company_subscriptions
                    SET status = 'active',
                        cancelled_at = NULL,
                        cancellation_effective_at = NULL,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (sub_id,),
                )
                self._control_event(
                    cur, sub_id, company_id, "subscription_uncancelled",
                    description="pending cancellation reversed by control",
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        self._control_audit(
            company_id, actor_user_id=actor_user_id,
            action="subscription_uncancelled",
            description="pending cancellation reversed by control")
        return {"ok": True, "company_id": company_id}

    def admin_extend_trial(self, company_id: int, days: int,
                           actor_user_id: Optional[int] = None):
        """Extend the trial window by N days.

        Prefers BillingService.extend_trial (the engine method — same
        event/audit/cache-bust trail as every other lifecycle op) and
        only falls back to local SQL when billing is not wired.
        """
        try:
            return self._billing().extend_trial(
                company_id, days, actor_user_id=actor_user_id)
        except RuntimeError:
            pass  # billing not wired — legacy fallback below

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
                            "trial_extended_by_control": {
                                "days": days,
                                "actor_user_id": actor_user_id,
                                "at": now.isoformat(),
                            },
                        }),
                        sub_id,
                    ),
                )
                self._control_event(
                    cur, sub_id, company_id, "trial_extended",
                    description=f"+{days}d by control, ends {new_end.date()}",
                    effective_at=new_end,
                    metadata={"days": days, "actor_user_id": actor_user_id},
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        self._control_audit(
            company_id, actor_user_id=actor_user_id,
            action="trial_extended", description=f"+{days}d")
        return {"ok": True, "company_id": company_id,
                "trial_ends_at": new_end.isoformat()}
