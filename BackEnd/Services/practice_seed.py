"""
FinSage — Phase 5: Practice plan seed
=====================================

Idempotently seeds `public.subscription_plans` with the three PRACTICE
tiers for accounting firms (the ones promised in plans_seed.py's header
note). Same table, same shape, `plan_code` prefixed `practice_`.

Primary path — ride the master bootstrap (NO manual step):
    in api_server.py's BOOTSTRAP_ON_START block, right after
    plans_seed.ensure_plans_seeded(db_service):
        from BackEnd.Services.practice_seed import ensure_practice_seeded
        ensure_practice_seeded(db_service)

Standalone fallback (one-off / on deploy):
    MASTER_DB_DSN="postgres://..." python practice_seed.py
Safe to re-run: INSERT ... ON CONFLICT (plan_code) DO UPDATE.
Pricing (LSL): starter M399 / growth M1,199 / firm M2,499 monthly;
annual = 10 × monthly. Per-client cost at cap falls M80 → M48 → flat,
so growing firms always gain by stepping up the ladder.

THE PRACTICE MODEL (agreed design)
----------------------------------
A practice plan is the FIRM's own subscription row. It bundles three
things in one plan:

  1. OWN BOOKS   — the firm's own ledger runs at an included business
                   tier (practice_starter→business, growth→premium,
                   firm→enterprise). Practice firms do real accounting
                   for themselves; they must not be stuck on Free.
  2. TOOLKIT     — the practitioner side (engagements, client
                   workspaces, working papers, review queue...) via the
                   practice_* feature keys.
  3. DELEGATION UPLIFT — while working inside a CLIENT company through
                   delegated access, the practitioner's session is
                   lifted to the plan's uplift tier (client's own users
                   still see the client's own plan). Encoded as the
                   numeric `delegation_uplift_tier` limit.

Client-company metering (Starter ≤5 / Growth ≤25 / Firm unlimited) is
the `client_companies` limit, enforced against the live count of
provisioned client companies (customer_company_links ∪ provisioned
engagements — see practice_service.py).

Trials: practices get 90 days no-card (businesses get 30). The trial
row points at practice_growth so a firm feels the middle of the ladder
— the same loss-aversion logic as the Phase 4 premium-trial decision.
"""

import os
import json
import sys

try:
    from BackEnd.Services.plans_seed import (
        FEATURES_BUSINESS,
        FEATURES_PREMIUM,
        FEATURES_ENTERPRISE,
        LIMITS_BUSINESS,
        LIMITS_PREMIUM,
        LIMITS_ENTERPRISE,
    )
except ImportError:
    # standalone CLI / QA context: run from the folder the seeds live in
    from plans_seed import (
        FEATURES_BUSINESS,
        FEATURES_PREMIUM,
        FEATURES_ENTERPRISE,
        LIMITS_BUSINESS,
        LIMITS_PREMIUM,
        LIMITS_ENTERPRISE,
    )

TRIAL_DAYS_PRACTICE = 90

# ---------------------------------------------------------------
# Practice-side feature keys (flat booleans, same contract as the
# business ladder). These gate the FIRM-side practitioner toolkit in
# the frontend; the backend modules remain role-gated (Phase 3 kept
# the practitioner blueprints out of the module-tier ladder).
# ---------------------------------------------------------------

PRACTICE_FEATURES = {
    "practice_workspace": True,             # engagements + delegated workspaces
    "practice_client_provisioning": True,   # create/link client companies
    "practice_client_dashboards": True,     # client overview / action center
    "practice_working_papers": True,
    "practice_review_queue": True,
    "practice_deliverables_review": True,
    "practice_delegation_uplift": True,     # uplift mechanics on (tier in limits)
}

PRACTICE_ONLY_LIMIT_KEYS = {
    "client_companies",
    "delegation_uplift_tier",
    "practice_users",
}


# PRICING (LSL, pegged 1:1 to ZAR) — designed on per-client economics:
#   starter  M399   ≤5 clients  →  M79.80 /client at cap
#   growth   M1,199 ≤25 clients →  M47.96 /client at cap (40% cheaper)
#   firm     M2,499  unlimited  →  beats growth from ~52 clients
# starter is deliberately only +M100 over business: the first step into
# the practice ladder (own Business-tier books + full toolkit + 5 client
# companies) must be a no-brainer for solo bookkeepers — the highest-LTV
# segment. annual = 10 × monthly, same rule as the business ladder.

PRACTICE_PLANS = [
    {
        "plan_code": "practice_starter",
        "plan_name": "Practice Starter",
        "description": (
            "Practices: up to 5 client companies. Includes a Business-tier "
            "ledger for your own practice books and Business-level "
            "delegated work in every client workspace."
        ),
        "monthly_amount": 399,
        "annual_amount": 3990,
        "trial_days": TRIAL_DAYS_PRACTICE,
        "features": {**FEATURES_BUSINESS, **PRACTICE_FEATURES},
        "limits": {**LIMITS_BUSINESS,
                   "client_companies": 5,
                   "delegation_uplift_tier": 1},
    },
    {
        "plan_code": "practice_growth",
        "plan_name": "Practice Growth",
        "description": (
            "Practices: up to 25 client companies. Premium-tier ledger for "
            "your own books and Premium-level delegated work (leases, "
            "deferred tax, disclosure notes) in client workspaces."
        ),
        "monthly_amount": 1199,
        "annual_amount": 11990,
        "trial_days": TRIAL_DAYS_PRACTICE,
        "features": {**FEATURES_PREMIUM, **PRACTICE_FEATURES},
        "limits": {**LIMITS_PREMIUM,
                   "client_companies": 25,
                   "delegation_uplift_tier": 2},
    },
    {
        "plan_code": "practice_firm",
        "plan_name": "Practice Firm",
        "description": (
            "Practices: unlimited client companies. Enterprise-tier ledger "
            "for your own books and Enterprise-level delegated work (PAYE "
            "filings, IAS 19, consolidation, OPS) in client workspaces."
        ),
        "monthly_amount": 2499,
        "annual_amount": 24990,
        "trial_days": TRIAL_DAYS_PRACTICE,
        "features": {**FEATURES_ENTERPRISE, **PRACTICE_FEATURES},
        "limits": {**LIMITS_ENTERPRISE,
                   "client_companies": -1,
                   "delegation_uplift_tier": 3},
    },
]

SEED_SQL = """
INSERT INTO public.subscription_plans (
    plan_code, plan_name, description,
    currency, monthly_amount, annual_amount,
    billing_model, trial_days, is_active,
    features, limits
) VALUES (
    %(plan_code)s, %(plan_name)s, %(description)s,
    'LSL', %(monthly_amount)s, %(annual_amount)s,
    'subscription', %(trial_days)s, TRUE,
    %(features)s::jsonb, %(limits)s::jsonb
)
ON CONFLICT (plan_code) DO UPDATE SET
    plan_name      = EXCLUDED.plan_name,
    description    = EXCLUDED.description,
    trial_days     = EXCLUDED.trial_days,
    features       = EXCLUDED.features,
    limits         = EXCLUDED.limits,
    updated_at     = NOW();
"""


def build_seed_rows():
    """Practice plan rows with features/limits JSON-dumped for SEED_SQL."""
    return [
        {
            **p,
            "features": json.dumps(p["features"]),
            "limits": json.dumps(p["limits"]),
        }
        for p in PRACTICE_PLANS
    ]


def ensure_practice_seeded(db_service=None, dsn=None, log=print):
    """
    Boot-time seeding for the practice tiers — the companion to
    plans_seed.ensure_plans_seeded(). Call it in the same place, right
    after (must be AFTER db_service.init_master_schema()):

        db_service.init_master_schema()
        db_service.initialize_public_schema()
        ensure_plans_seeded(db_service)      # plans_seed.py
        ensure_practice_seeded(db_service)   # ← this

    Same rationale and pricing-safety guarantee as ensure_plans_seeded:
      * public.subscription_plans is a master table — never seed it from
        per-company onboarding;
      * practice trials (provision_trial -> 'practice_growth') need these
        rows before the first firm signs up;
      * ON CONFLICT DO UPDATE never touches currency/amounts, so boot
        re-seeding cannot clobber production pricing;
      * raises on failure — the boot block's fail-hard semantics are
        correct here (a missing practice catalog would make every firm
        trial silently fall back to grandfathering).

    Args:
        db_service: running DatabaseService — rides its pooled
            transaction(). Preferred path at boot.
        dsn:        optional standalone fallback (else MASTER_DB_DSN env).
        log:        injectable logger.
    """
    rows = build_seed_rows()

    if db_service is not None:
        with db_service.transaction() as (conn, cur):
            for r in rows:
                cur.execute(SEED_SQL, r)
                log(f"seeded practice plan: {r['plan_code']}")
        return rows

    dsn = dsn or os.getenv("MASTER_DB_DSN")
    if not dsn:
        raise RuntimeError(
            "ensure_practice_seeded needs a db_service or MASTER_DB_DSN"
        )
    seed(dsn=dsn, dry_run=False)
    return rows


def seed(dsn=None, dry_run=False):
    rows = build_seed_rows()

    if dry_run:
        # dry-run needs no DSN — it only prints what WOULD be seeded
        # (raw PRACTICE_PLANS; `rows` already carries JSON-dumped blobs)
        for p in PRACTICE_PLANS:
            print(f"{p['plan_code']:<18} "
                  f"clients={p['limits']['client_companies']:<3} "
                  f"uplift_tier={p['limits']['delegation_uplift_tier']} "
                  f"trial={p['trial_days']}d "
                  f"features={len(p['features'])}")
        return

    dsn = dsn or os.getenv("MASTER_DB_DSN")
    if not dsn:
        raise RuntimeError("MASTER_DB_DSN is not set")

    import psycopg2
    from psycopg2.extras import RealDictCursor

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            for r in rows:
                cur.execute(SEED_SQL, r)
                print(f"seeded plan: {r['plan_code']}")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    seed(dry_run="--dry-run" in sys.argv)
