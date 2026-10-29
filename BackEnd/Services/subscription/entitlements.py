"""
FinSage — Phase 1+3: Entitlement service
=======================================

Resolves a company's subscription state (plan, tier, features, limits) and
answers "is this allowed / is there quota left". Pure service layer — no
Flask request handling here (see entitlement_gate.py for the request gate).

Design rules agreed in the phasing discussion:

  L1 require_auth        (existing middleware — untouched)
  L2 company check       (existing _deny_if_wrong_company — untouched)
  L4 ENTITLEMENT         (THIS module — thin, static, plan-based)
  L3 policy/mode chain   (existing company_policy + credit_policy — untouched)
  audit                  (existing audit_log — untouched)

Entitlements answer "may this company use this module AT ALL".
Governance answers "given it's available, how does the flow execute".
They compose in sequence and never overlap.

Delegation rule (v1 → Phase 5): when a practitioner works inside a
client company, the CLIENT company's plan governs — the gate resolves
the plan from the URL's company_id, so this is automatic. Phase 5 adds
ONE exception on top (the delegation uplift): a validly-signed
delegated token from a practice_* firm lifts that practitioner's
SESSION to the plan's uplift tier. Session-scoped only, never
persisted, never visible to the client's own users — see
practice_service.py (merge_uplift) for the hard rules.
"""

import time
import calendar
import json
import logging
from datetime import date, datetime, timedelta, timezone

log = logging.getLogger("finsage.entitlements")

# plan_code → rank. practice_* plans (Phase 5) join with the business
# tier their plan INCLUDES for the firm's own books, so a practice
# firm's own ledger gates like any other company at that tier. They are
# deliberately NOT added to module_tiers.TIER_NAME (never suggested as
# a module upgrade — practice upgrades run on the practice ladder).
PRACTICE_PLAN_TIERS = {
    "practice_starter": 1,
    "practice_growth": 2,
    "practice_firm": 3,
}

TIER_ORDER = {
    "free": 0,
    "business": 1,
    "premium": 2,
    "enterprise": 3,
    **PRACTICE_PLAN_TIERS,
}

# Companies with no subscription row during rollout. Grandfathered as
# business so existing customers feel zero change; every grandfathered
# resolution is logged so you can convert them deliberately later.
GRANDFATHER_PLAN = "business"


def month_bounds(today=None):
    """Calendar-month window used for quota counting (v1)."""
    today = today or date.today()
    start = today.replace(day=1)
    last_day = calendar.monthrange(today.year, today.month)[1]
    end = today.replace(day=last_day)
    return start, end


def _utcnow():
    return datetime.now(timezone.utc)


def _as_aware(dt):
    """psycopg2 may return naive datetimes for timestamptz when the
    connection tz is unset — treat naive as UTC."""
    if dt is None or dt.tzinfo is not None:
        return dt
    return dt.replace(tzinfo=timezone.utc)


def _augment_state(state):
    """
    Phase 4: compute the commercial runtime flags every consumer needs
    (gate read-only enforcement, endpoint payload, dashboard banner).
    """
    status = state.get("status")
    meta = state.get("metadata") or {}
    trial_end = _as_aware(state.get("trial_ends_at"))
    now = _utcnow()

    trial_days_left = None
    if status == "trialing" and trial_end:
        # round, not floor: 11.99 days remaining should display as 12
        trial_days_left = max(
            round((trial_end - now).total_seconds() / 86400), 0)

    grace_ends_at = None
    raw_grace_end = meta.get("grace_ends_at")
    if raw_grace_end:
        try:
            grace_ends_at = datetime.fromisoformat(raw_grace_end)
        except (TypeError, ValueError):
            grace_ends_at = None

    # Read-only = explicit grace OR a trial that silently lapsed (the
    # daily job will formalise it, but the gate must not wait for cron).
    read_only = (
        status == "grace"
        or (status == "trialing" and trial_end is not None
            and trial_end < now)
    )

    state["trial_days_left"] = trial_days_left
    state["read_only"] = read_only
    state["grace_ends_at"] = grace_ends_at or (
        trial_end if read_only and status == "trialing" else None)
    state["scheduled_plan_code"] = meta.get("scheduled_plan_code")
    state["billing_status"] = meta.get("_billing_status")
    return state


class EntitlementService:
    """
    Inject with your live db_service so we reuse its connection handling.
    Only requires: db_service.get_conn() and db_service.company_schema(cid).
    """

    CACHE_TTL = 60  # seconds; per-process. entitlements change rarely.

    def __init__(self, db_service, cache_ttl=None):
        self.db = db_service
        self._cache = {}           # company_id -> (expires_at, state)
        self.CACHE_TTL = cache_ttl or self.CACHE_TTL

    # ------------------------------------------------------------------
    # Resolution
    # ------------------------------------------------------------------

    def invalidate(self, company_id):
        self._cache.pop(company_id, None)

    def notify_plan_change(self, company_id):
        """
        Downgrade rule (Phase 3): call this whenever a company's plan row
        changes (upgrade, downgrade, renewal, trial end, dunning pause).
        Drops the resolve cache so the NEW tier applies on the very next
        request — a downgrade must never keep working via stale cache.

        Phase 4 billing code / webhooks should call:
            app.extensions["entitlements"].notify_plan_change(company_id)
        """
        self.invalidate(company_id)
        log.info("entitlement cache invalidated (plan change) cid=%s",
                 company_id)

    def resolve(self, company_id):
        """
        Returns:
            {
              "company_id": int,
              "plan_code": "free|business|premium|enterprise|<grandfathered>",
              "tier": int,
              "grandfathered": bool,
              "status": "active|trialing|none|...",
              "trial_ends_at": ... | None,
              "features": {...},
              "limits": {...},
            }
        Never raises for "no row" — grandfathers instead, so the gate can
        never brick a company because billing data is missing.
        """
        now = time.time()
        cached = self._cache.get(company_id)
        if cached and cached[0] > now:
            return cached[1]

        state = self._resolve_from_db(company_id)
        self._cache[company_id] = (now + self.CACHE_TTL, state)
        return state


    def _resolve_from_db(self, company_id):
        with self.db.transaction() as (conn, cur):
            cur.execute(
                """
                SELECT p.plan_code, p.features, p.limits,
                    s.status, s.trial_ends_at, s.metadata,
                    s.billing_status
                FROM public.company_subscriptions s
                JOIN public.subscription_plans p ON p.id = s.plan_id
                WHERE s.company_id = %s
                AND p.is_active = TRUE
                ORDER BY s.created_at DESC
                LIMIT 1
                """,
                (company_id,),
            )
            row = cur.fetchone()

        if not row:
            log.info(
                "grandfathering company_id=%s (no subscription row) "
                "as plan=%s",
                company_id,
                GRANDFATHER_PLAN,
            )
            return self._plan_only_state(
                company_id,
                GRANDFATHER_PLAN,
                grandfathered=True,
            )

        state = {
            "company_id": company_id,
            "plan_code": row["plan_code"],
            "tier": TIER_ORDER.get(row["plan_code"], 0),
            "grandfathered": False,
            "status": row["status"],
            "trial_ends_at": row["trial_ends_at"],
            "features": dict(row["features"] or {}),
            "limits": dict(row["limits"] or {}),
            "metadata": dict(row["metadata"] or {}),
        }
        state["metadata"]["_billing_status"] = row["billing_status"]

        return _augment_state(state)


    def _plan_only_state(self, company_id, plan_code, grandfathered=False):
        """Resolve features/limits from subscription_plans without a
        company_subscriptions row (grandfather path)."""
        conn = self.db.get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT plan_code, features, limits
                    FROM public.subscription_plans
                    WHERE plan_code = %s AND is_active = TRUE
                    LIMIT 1
                    """,
                    (plan_code,),
                )
                row = cur.fetchone()
        finally:
            conn.close()

        if not row:
            # last-resort: treat as free so nothing unexpected is unlocked
            return {
                "company_id": company_id,
                "plan_code": "free",
                "tier": 0,
                "grandfathered": grandfathered,
                "status": "none",
                "trial_ends_at": None,
                "features": {},
                "limits": {},
            }

        plan_code, features, limits = row
        state = {
            "company_id": company_id,
            "plan_code": plan_code,
            "tier": TIER_ORDER.get(plan_code, 0),
            "grandfathered": grandfathered,
            "status": "none" if grandfathered else "active",
            "trial_ends_at": None,
            "features": dict(features or {}),
            "limits": dict(limits or {}),
            "metadata": {},
        }
        return _augment_state(state)

    # ------------------------------------------------------------------
    # Checks
    # ------------------------------------------------------------------

    @staticmethod
    def tier_of(plan_code):
        return TIER_ORDER.get(plan_code, 0)

    @staticmethod
    def meets_tier(state, min_tier):
        """min_tier: int rank or plan_code string."""
        if isinstance(min_tier, str):
            min_tier = TIER_ORDER.get(min_tier, 0)
        return state["tier"] >= min_tier

    @staticmethod
    def has_feature(state, feature_key):
        return bool((state.get("features") or {}).get(feature_key))

    # ------------------------------------------------------------------
    # Quotas (count-on-read: no counter table, no drift)
    # ------------------------------------------------------------------

    def quota_usage(self, company_id, quota_key):
        """
        Returns {"used": int, "limit": int, "unlimited": bool}.
        Backed by real tenant-schema tables:
          - {schema}.journals  (company_id, date, status)   posted only;
            reversals count (they consume a posting slot by design)
          - {schema}.invoices  (company_id, invoice_date, status)
            drafts don't count; cancelled don't count
        """
        limits = self.resolve(company_id).get("limits") or {}
        limit = int(limits.get(quota_key, -1))
        if limit < 0:
            return {"used": None, "limit": -1, "unlimited": True}

        start, end = month_bounds()
        schema = self.db.company_schema(company_id)

        if quota_key == "journals_per_month":
            sql = (
                f"SELECT COUNT(*) FROM {schema}.journals "
                "WHERE company_id = %s AND date >= %s AND date <= %s "
                "AND COALESCE(status, 'posted') = 'posted'"
            )
        elif quota_key == "invoices_per_month":
            sql = (
                f"SELECT COUNT(*) FROM {schema}.invoices "
                "WHERE company_id = %s AND invoice_date >= %s "
                "AND invoice_date <= %s "
                "AND LOWER(COALESCE(status, '')) NOT IN ('draft', 'cancelled')"
            )
        else:
            return {"used": None, "limit": limit, "unlimited": False}

        conn = self.db.get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, (company_id, start, end))
                used = int(cur.fetchone()[0])
        finally:
            conn.close()

        return {"used": used, "limit": limit, "unlimited": False}

    def quota_allows(self, company_id, quota_key, extra_count=1):
        usage = self.quota_usage(company_id, quota_key)
        if usage["unlimited"]:
            return True, usage
        return (usage["used"] + extra_count) <= usage["limit"], usage

    def quota_snapshot(self, company_id, keys=None):
        """
        Usage for every countable quota — powers the entitlements
        endpoint (progress bars, "3 of 5 invoices left this month") and
        the frontend upsell modal. Cheap for tier > 0: unlimited keys
        short-circuit without touching tenant tables.
        """
        keys = keys or ["journals_per_month", "invoices_per_month"]
        out = {}
        for key in keys:
            usage = self.quota_usage(company_id, key)
            out[key] = {
                "used": usage["used"],
                "limit": usage["limit"],
                "unlimited": usage["unlimited"],
                "remaining": (None if usage["unlimited"]
                              else max(usage["limit"] - usage["used"], 0)),
            }
        return out

    # ------------------------------------------------------------------
    # Provisioning helpers (used by signup/upgrade flows in Phase 2+)
    # ------------------------------------------------------------------

    def ensure_subscription(self, company_id, plan_code, trial_days=0,
                            user_id=None):
        """
        Creates (or reactivates) a company_subscriptions row. Idempotent:
        if an active row exists, returns it unchanged.
        """
        conn = self.db.get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT s.id FROM public.company_subscriptions s
                    JOIN public.subscription_plans p ON p.id = s.plan_id
                    WHERE s.company_id = %s
                      AND s.status IN ('trialing', 'active')
                    LIMIT 1
                    """,
                    (company_id,),
                )
                row = cur.fetchone()
                if row:
                    self.invalidate(company_id)
                    return {"subscription_id": row[0], "created": False}

                now = None
                trial_end = None
                if trial_days and trial_days > 0:
                    now = "NOW()"
                    trial_end = "NOW() + INTERVAL '%s days'" % int(trial_days)

                cur.execute(
                    f"""
                    INSERT INTO public.company_subscriptions (
                        company_id, plan_id, status, billing_status,
                        billing_interval, currency, amount,
                        started_at, trial_ends_at
                    )
                    SELECT %s, p.id,
                           %s,
                           'pending', 'monthly', p.currency,
                           p.monthly_amount,
                           {"NOW()" if now else "NOW()"},
                           {trial_end if trial_end else "NULL"}
                    FROM public.subscription_plans p
                    WHERE p.plan_code = %s AND p.is_active = TRUE
                    RETURNING id
                    """,
                    (company_id, "trialing" if trial_days else "active",
                     plan_code),
                )
                sub = cur.fetchone()
                if not sub:
                    raise ValueError(f"plan not found: {plan_code}")

                cur.execute(
                    """
                    INSERT INTO public.subscription_events (
                        subscription_id, company_id, event_type, event_status,
                        description, metadata
                    )
                    VALUES (%s, %s, %s, 'succeeded', %s, %s::jsonb)
                    """,
                    (
                        sub[0], company_id,
                        "trial_started" if trial_days else "subscription_started",
                        f"plan={plan_code} trial_days={trial_days}",
                        '{"source": "ensure_subscription"}',
                    ),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        self.invalidate(company_id)
        return {"subscription_id": sub[0], "created": True}
