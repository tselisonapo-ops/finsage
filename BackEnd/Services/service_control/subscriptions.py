# BackEnd/Services/service_control/subscriptions.py
"""
FinSage Control — Subscription Management Mixin
================================================

Read-side SQL for the Control subscription cockpit. Mix into ControlService:

    from BackEnd.Services.service_control.subscriptions import (
        SubscriptionControlMixin,
    )

    class ControlService(SubscriptionControlMixin):
        ...

DESIGN RULES (do not break them when editing):

  * This mixin is READ-ONLY. Every statement here is a SELECT.
    All writes to public.company_subscriptions / public.subscription_billing /
    public.subscription_events go through the app's shared BillingService
    (app.extensions["billing"]) — never through Control. The billing engine
    owns its event log, audit trail, entitlement-cache invalidation and
    mailer; hand-editing rows from Control would silently bypass all four.

  * User input reaches the database only through bind parameters (%s) and
    whitelisted ORDER BY fragments. Sort keys are mapped through SORTS —
    never interpolate request values into SQL text.

  * companies can hold several historical subscription rows; every fleet
    view reads only the LATEST row per company (DISTINCT ON), matching
    get_company_subscription()'s semantics.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

# Status vocabulary of public.company_subscriptions (billing_service.py):
#   status         : trialing | active | grace | expired | cancelled
#   billing_status : none | current | past_due
# (public.subscription_billing rows carry their own billing_status:
#   pending | paid | failed.)
SUB_STATUSES = (
    "active", "trialing", "grace", "expired", "cancelled",
)
FILTER_STATUSES = SUB_STATUSES + ("past_due",)

# Whitelisted sort keys → SQL ORDER BY fragments (applied to the outer
# query over the per-company latest row).
SORTS = {
    "next_billing": "next_billing_at ASC NULLS LAST",
    "trial_ending": "trial_ends_at ASC NULLS LAST",
    "recent": "created_at DESC",
    "amount": "amount DESC NULLS LAST",
    "company": "company_name ASC",
}

_BASE_COLUMNS = """
                cs.id AS subscription_id,
                cs.company_id,
                c.name AS company_name,

                sp.id AS plan_id,
                sp.plan_code,
                sp.plan_name,

                cs.status,
                cs.billing_status,
                cs.billing_interval,

                cs.currency,
                cs.amount,

                cs.started_at,
                cs.trial_ends_at,

                cs.current_period_start,
                cs.current_period_end,
                cs.next_billing_at,

                cs.cancelled_at,
                cs.cancellation_effective_at,

                cs.payment_provider,
                cs.created_at
"""


def _latest_subquery() -> str:
    """Latest subscription row per company (inner DISTINCT ON query)."""
    return f"""
            SELECT DISTINCT ON (cs.company_id)
{_BASE_COLUMNS}
            FROM public.company_subscriptions cs
            JOIN public.companies c
                ON c.id = cs.company_id
            JOIN public.subscription_plans sp
                ON sp.id = cs.plan_id
            ORDER BY cs.company_id, cs.created_at DESC
        """


class SubscriptionControlMixin:
    """Subscription cockpit queries. Mix into ControlService (self.db)."""

    # ────────────────────────────────────────
    # OVERVIEW — KPI block for the cockpit
    # ────────────────────────────────────────

    def get_subscriptions_overview(self) -> Dict[str, Any]:
        """
        Fleet KPIs: counts per subscription status, past-due count,
        normalized MRR of active subscriptions, and trials ending within
        7 days.

        MRR normalization: monthly rows count amount as-is, annual rows
        contribute amount / 12 (the "2 months free" annual pricing means
        amount/12 slightly understates sticker MRR — that is correct:
        it is the revenue actually being collected).
        """

        kpis = self.db.fetch_one("""
            SELECT
                COUNT(*) FILTER (
                    WHERE status = 'active'
                ) AS active,
                COUNT(*) FILTER (
                    WHERE status = 'trialing'
                ) AS trialing,
                COUNT(*) FILTER (
                    WHERE status = 'grace'
                ) AS grace,
                COUNT(*) FILTER (
                    WHERE status = 'expired'
                ) AS expired,
                COUNT(*) FILTER (
                    WHERE status = 'cancelled'
                ) AS cancelled,
                COUNT(*) FILTER (
                    WHERE billing_status = 'past_due'
                ) AS past_due,
                COALESCE(
                    SUM(
                        CASE
                            WHEN status = 'active'
                            THEN CASE billing_interval
                                     WHEN 'annual' THEN amount / 12.0
                                     ELSE amount
                                 END
                        END
                    ),
                    0
                ) AS mrr
            FROM public.company_subscriptions
        """)

        trial_ending = self.db.fetch_all("""
            SELECT
                cs.company_id,
                c.name AS company_name,
                sp.plan_name,
                cs.trial_ends_at
            FROM public.company_subscriptions cs
            JOIN public.companies c
                ON c.id = cs.company_id
            JOIN public.subscription_plans sp
                ON sp.id = cs.plan_id
            WHERE cs.status = 'trialing'
              AND cs.trial_ends_at IS NOT NULL
              AND cs.trial_ends_at
                  <= NOW() + INTERVAL '7 days'
            ORDER BY cs.trial_ends_at ASC
            LIMIT 10
        """)

        awaiting = self.db.fetch_one("""
            SELECT COUNT(*) AS cnt
            FROM public.subscription_billing
            WHERE billing_status IN ('pending', 'failed')
        """)

        return {
            "active": int(kpis["active"] or 0) if kpis else 0,
            "trialing": int(kpis["trialing"] or 0) if kpis else 0,
            "grace": int(kpis["grace"] or 0) if kpis else 0,
            "expired": int(kpis["expired"] or 0) if kpis else 0,
            "cancelled": int(kpis["cancelled"] or 0) if kpis else 0,
            "past_due": int(kpis["past_due"] or 0) if kpis else 0,
            "mrr": float(kpis["mrr"] or 0) if kpis else 0.0,
            "awaiting_settlement":
                int(awaiting["cnt"] or 0) if awaiting else 0,
            "trials_ending_soon": trial_ending or [],
        }

    # ────────────────────────────────────────
    # FLEET LIST
    # ────────────────────────────────────────

    def list_subscriptions(
        self,
        *,
        status: Optional[str] = None,
        plan_code: Optional[str] = None,
        search: str = "",
        sort: str = "next_billing",
        page: int = 1,
        per_page: int = 20,
    ) -> Dict[str, Any]:
        """
        Latest subscription per company with filters, whitelisted sort
        and pagination.

        status   : one of FILTER_STATUSES ("past_due" filters on
                   billing_status, the rest on status) — or None for all.
        plan_code: exact plan_code match (business/premium/...).
        search   : company name ILIKE, or exact company id when numeric.
        sort     : key into SORTS (whitelist — never raw SQL).
        """

        status = (status or "").strip().lower() or None
        if status is not None and status not in FILTER_STATUSES:
            status = None

        sort_key = sort if sort in SORTS else "next_billing"

        page = max(1, int(page or 1))
        per_page = min(max(1, int(per_page or 20)), 100)
        offset = (page - 1) * per_page

        outer_where: List[str] = []
        params: List[Any] = []

        if status == "past_due":
            outer_where.append("billing_status = 'past_due'")
        elif status:
            outer_where.append("status = %s")
            params.append(status)

        if plan_code:
            outer_where.append("plan_code = %s")
            params.append(plan_code)

        search = (search or "").strip()
        if search:
            if search.isdigit():
                outer_where.append(
                    "(company_name ILIKE %s OR company_id = %s)"
                )
                params.extend([f"%{search}%", int(search)])
            else:
                outer_where.append("company_name ILIKE %s")
                params.append(f"%{search}%")

        outer_clause = (
            "WHERE " + " AND ".join(outer_where)
            if outer_where
            else ""
        )

        # Parameters are used twice (count + page queries) — same order
        # in both because both wrap the same inner subquery.
        count_sql = f"""
            SELECT COUNT(*) AS cnt
            FROM (
{_latest_subquery()}
            ) latest
            {outer_clause}
        """

        page_sql = f"""
            SELECT *
            FROM (
{_latest_subquery()}
            ) latest
            {outer_clause}
            ORDER BY {SORTS[sort_key]}
            LIMIT %s OFFSET %s
        """

        total = self.db.fetch_one(count_sql, tuple(params))["cnt"]

        rows = self.db.fetch_all(
            page_sql,
            tuple(params + [per_page, offset]),
        )

        return {
            "subscriptions": rows,
            "total": int(total or 0),
            "page": page,
            "per_page": per_page,
            "sort": sort_key,
            "status": status,
        }

    # ────────────────────────────────────────
    # AWAITING SETTLEMENT — the money queue
    # ────────────────────────────────────────

    def get_awaiting_settlement(
        self,
        *,
        company_id: Optional[int] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Pending and failed billing rows across the fleet — the queue a
        Control admin settles (confirm/fail) after the EFT or mobile-money
        payment lands. Oldest due first.
        """

        limit = min(max(1, int(limit or 50)), 200)

        where = "WHERE sb.billing_status IN ('pending', 'failed')"
        params: List[Any] = []

        if company_id is not None:
            where += " AND sb.company_id = %s"
            params.append(int(company_id))

        return self.db.fetch_all(
            f"""
            SELECT
                sb.id AS billing_id,
                sb.company_id,
                c.name AS company_name,

                sb.subscription_id,
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
                sb.failure_reason,
                sb.payment_provider,

                sp.plan_name,
                cs.billing_interval

            FROM public.subscription_billing sb
            JOIN public.companies c
                ON c.id = sb.company_id
            LEFT JOIN public.company_subscriptions cs
                ON cs.id = sb.subscription_id
            LEFT JOIN public.subscription_plans sp
                ON sp.id = cs.plan_id
            {where}
            ORDER BY sb.due_at ASC NULLS LAST, sb.created_at ASC
            LIMIT %s
            """,
            tuple(params + [limit]),
        )

    def get_billing_row_for_company(
        self,
        company_id: int,
        billing_id: int,
    ) -> Optional[Dict[str, Any]]:
        """
        Ownership guard for settlement routes: returns the billing row
        only when it belongs to the URL's company. Routes must verify
        this BEFORE calling BillingService — record_payment_success()
        trusts its caller on tenant scoping.
        """

        return self.db.fetch_one(
            """
            SELECT
                id AS billing_id,
                company_id,
                subscription_id,
                billing_status,
                amount,
                currency,
                due_at
            FROM public.subscription_billing
            WHERE id = %s
              AND company_id = %s
            LIMIT 1
            """,
            (int(billing_id), int(company_id)),
        )
