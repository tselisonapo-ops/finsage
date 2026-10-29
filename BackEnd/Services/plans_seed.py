"""
FinSage — Phase 0: Subscription plan seed
==========================================

Idempotently seeds `public.subscription_plans` with the four business tiers
agreed in the tier-matrix discussion.

Primary path — ride the master bootstrap (NO manual step):
    in api_server.py's BOOTSTRAP_ON_START block, after init_master_schema():
        from BackEnd.Services.plans_seed import ensure_plans_seeded
        ensure_plans_seeded(db_service)
    (practice_seed.ensure_practice_seeded(db_service) goes right after)

Standalone fallback (one-off / on deploy):
    MASTER_DB_DSN="postgres://..." python plans_seed.py

Safe to re-run: INSERT ... ON CONFLICT (plan_code) DO UPDATE.
Pricing (LSL, pegged 1:1 to ZAR): business M299 / premium M649 /
enterprise M1,399 monthly; annual = 10 × monthly ("2 months free").
Re-seeding NEVER overwrites these amounts once in production — the
ON CONFLICT clause below does not touch currency/amounts.

NOTE: practitioner (practice) plans are intentionally NOT seeded here.
They arrive in Phase 5 as plan_code values prefixed with "practice_"
(e.g. practice_starter / practice_growth / practice_firm).
"""

import os
import json
import sys

# NOTE: psycopg2 is imported lazily inside seed() — this module must be
# importable without the DB driver (practice_seed.py reuses the feature
# ladders, and the QA suite imports it flat).

# ---------------------------------------------------------------
# Feature map (flat booleans — the frontend reads this directly
# from GET /api/companies/<cid>/entitlements to hide/upsell).
# Each tier inherits the previous tier's features (cumulative).
# ---------------------------------------------------------------

FEATURES_FREE = {
    # core books
    "gl_journal": True,
    "coa": True,
    "invoices": True,
    "receipts": True,
    "invoice_pdf": True,          # operational documents stay free
    "reports_view": True,          # P&L / BS / TB on screen
    "report_exports": False,       # ← the paywall you asked for
    "dashboards": True,
    "approvals": True,             # governance infra is never tier-gated
    "support": True,
    "settings": True,
}

FEATURES_BUSINESS = {
    **FEATURES_FREE,
    "report_exports": True,
    # AR / AP
    "quotes": True,
    "ar_subledger": True,
    "ap_subledger": True,
    "ar_ap_controls": True,
    "credit_control": True,
    "customers_suppliers": True,
    # cash & tax
    "bank_accounts": True,
    "bank_reconciliation": True,
    "vat_recon_filing": True,
    # fixed assets (cost model only — measurement upgrades live in premium)
    "fixed_assets_cost_model": True,
    "fixed_assets_disposals": True,
    # industry pack
    "inventory": True,
    "manufacturing": True,
    "production_performance": True,
    "pos": True,
    "budgets_forecasts": True,
    "management_packs": True,
    "data_migration": True,
}

FEATURES_PREMIUM = {
    **FEATURES_BUSINESS,
    # PPE subsequent measurement
    "ppe_revaluation": True,
    "ppe_impairment": True,
    "ppe_subsequent_measurement": True,
    "ppe_hfs": True,
    # leases (lessee + lessor, full lifecycle)
    "lease_accounting_lessee": True,
    "lease_accounting_lessor": True,
    # disclosure notes for the measurement modules above
    "disclosure_notes_ppe": True,
    "disclosure_notes_leases": True,
    "disclosure_notes_ip": True,
    "disclosure_notes_ia": True,
    # closing-level accounting
    "accruals_deferrals": True,
    "loans_financing": True,
    "ifrs9_ecl": True,
    "revenue_contracts": True,
    "projects_costing": True,
    "project_profitability": True,
    "tax_recon_deferred_tax": True,
    "asset_tax": True,
    # payroll (deductions yes, statutory filing no)
    "payroll_core": True,
    "payroll_benefit_deductions": True,
    "audit_trail_view": True,
    "receipt_scan": True,
}

FEATURES_ENTERPRISE = {
    **FEATURES_PREMIUM,
    # payroll top end
    "payroll_tax_filing_paye": True,
    "employee_benefits_accounting": True,     # IAS 19: leave/bonus/termination/DB
    "payroll_disclosure_pack": True,          # all 6 payroll notes
    # every remaining note + full export pack
    "disclosure_notes_revenue": True,
    "disclosure_notes_ias41": True,
    "disclosure_notes_all": True,
    "export_full_pack": True,
    "audit_trail_export": True,
    # group / ops
    "ops": True,
    "consolidation": True,
    "corporate_structure": True,
    "agriculture_ias41": True,
    "project_revenue_sync": True,
    "api_access": True,
}

# ---------------------------------------------------------------
# Limits. -1 = unlimited.
# ---------------------------------------------------------------

LIMITS_FREE = {
    "journals_per_month": 25,
    "invoices_per_month": 5,
    "users": 1,
    "companies": 1,
}

LIMITS_BUSINESS = {
    "journals_per_month": -1,
    "invoices_per_month": -1,
    "users": 3,
    "companies": 1,
}

LIMITS_PREMIUM = {
    **LIMITS_BUSINESS,
    "users": 10,
    "companies": 3,
}

LIMITS_ENTERPRISE = {
    **LIMITS_PREMIUM,
    "users": -1,
    "companies": -1,
}

# ---------------------------------------------------------------
# Plan rows — PRICING (currency 'LSL', pegged 1:1 to ZAR):
#   business    M299/mo    M2,990/yr
#   premium     M649/mo    M6,490/yr
#   enterprise  M1,399/mo  M13,990/yr
# Ladder rules: each paid step ≈ 2× price for visibly ≥2× value
# (premium M649 < 3 × business M897, so multi-company users
# self-select upward); annual = 10 × monthly everywhere.
# Post-launch price changes are SQL-only — see README "Pricing".
# trial_days: businesses 30 (the signup trial experiences premium);
# the 90-day practitioner trial ships with the practice_* plans
# in practice_seed.py.
# ---------------------------------------------------------------

PLANS = [
    {
        "plan_code": "free",
        "plan_name": "Free",
        "description": "Core books: GL journals, invoices, ledger, TB, P&L, balance sheet (view only).",
        "monthly_amount": 0,
        "annual_amount": 0,
        "trial_days": 0,
        "features": FEATURES_FREE,
        "limits": LIMITS_FREE,
    },
    {
        "plan_code": "business",
        "plan_name": "Business",
        "description": "AR/AP with control accounts, quotes, credit control, bank rec, VAT recon & filing, fixed assets (cost model), inventory/manufacturing, POS, budgets.",
        "monthly_amount": 299,
        "annual_amount": 2990,
        "trial_days": 30,
        "features": FEATURES_BUSINESS,
        "limits": LIMITS_BUSINESS,
    },
    {
        "plan_code": "premium",
        "plan_name": "Premium",
        "description": "Everything in Business plus PPE subsequent measurement, lease accounting (lessee & lessor), PPE/lease/IP/IA disclosure notes, tax recon & deferred tax, accruals, loans, projects, payroll with benefit deductions.",
        "monthly_amount": 649,
        "annual_amount": 6490,
        "trial_days": 30,
        "features": FEATURES_PREMIUM,
        "limits": LIMITS_PREMIUM,
    },
    {
        "plan_code": "enterprise",
        "plan_name": "Enterprise",
        "description": "Everything in Premium plus full disclosure note register & export pack, PAYE filing, IAS 19 employee benefits accounting, OPS, consolidation and group structure.",
        "monthly_amount": 1399,
        "annual_amount": 13990,
        "trial_days": 30,
        "features": FEATURES_ENTERPRISE,
        "limits": LIMITS_ENTERPRISE,
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
    """Plan rows with features/limits JSON-dumped, ready for SEED_SQL."""
    return [
        {
            **p,
            "features": json.dumps(p["features"]),
            "limits": json.dumps(p["limits"]),
        }
        for p in PLANS
    ]


def ensure_plans_seeded(db_service=None, dsn=None, log=print):
    """
    Boot-time seeding — rides the MASTER bootstrap migration path, not
    per-company onboarding.

    Where to call (api_server.py, BOOTSTRAP_ON_START block, AFTER
    db_service.init_master_schema() — the table must exist first):

        db_service.init_master_schema()
        db_service.initialize_public_schema()
        ensure_plans_seeded(db_service)      # ← this
        ensure_practice_seeded(db_service)   # ← practice_seed.py

    Why boot and not company onboarding:
      * subscription_plans is a PUBLIC/master table (init_master_schema
        owns its DDL); onboarding runs per-tenant schema DDL only.
      * signup -> provision_trial references plan_code='premium' — the
        catalog must exist BEFORE the first company ever onboards.
      * the boot block already fails hard on bootstrap errors; a missing
        plan catalog would otherwise silently mis-gate every company via
        grandfathering, so failing the boot here is the correct semantics.

    Pricing safety: SEED_SQL's ON CONFLICT DO UPDATE never touches
    currency / monthly_amount / annual_amount, so re-seeding at every
    boot can NEVER clobber prices edited in production.

    Args:
        db_service: running DatabaseService — seeding rides its pooled
            transaction() (commit/rollback handled). Preferred path.
        dsn:        optional standalone fallback when there is no running
            app (falls back to MASTER_DB_DSN env, same as seed()).
        log:        injectable logger; pass current_app.logger.info (or a
            boot print) instead of relying on the default.
    """
    rows = build_seed_rows()

    if db_service is not None:
        with db_service.transaction() as (conn, cur):
            for r in rows:
                cur.execute(SEED_SQL, r)
                log(f"seeded plan: {r['plan_code']}")
        return rows

    dsn = dsn or os.getenv("MASTER_DB_DSN")
    if not dsn:
        raise RuntimeError(
            "ensure_plans_seeded needs a db_service or MASTER_DB_DSN"
        )
    seed(dsn=dsn, dry_run=False)
    return rows


def seed(dsn=None, dry_run=False):
    rows = build_seed_rows()

    if dry_run:
        # dry-run needs no DSN — it only prints what WOULD be seeded
        # (raw PLANS; `rows` carries JSON-dumped blobs, so len() on
        # those would be the string length, not the feature count)
        for p in PLANS:
            print(f"{p['plan_code']:<12} features={len(p['features'])} "
                  f"limits={p['limits']}")
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
