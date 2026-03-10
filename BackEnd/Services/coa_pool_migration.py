# scripts/run_coa_pool_migration.py
import os
import sys
import traceback

def main():
    print("=== FinSage COA POOL migration starting ===")

    # Ensure project root is on PYTHONPATH
    ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    dsn = os.getenv("MASTER_DB_DSN") or os.getenv("DATABASE_URL")
    print("MASTER_DB_DSN set?", bool(os.getenv("MASTER_DB_DSN")))
    print("DATABASE_URL set?", bool(os.getenv("DATABASE_URL")))
    if not dsn:
        raise RuntimeError("MASTER_DB_DSN (or DATABASE_URL) is not set")

    # Import AFTER env is confirmed
    from BackEnd.Services.db_service import db_service
    import BackEnd.Services.db_service as m
    print("db_service module file:", m.__file__)

    from BackEnd.Services.coa_service import (
        GENERAL_ACCOUNTS_LIST,
        INDUSTRY_TEMPLATES,
        SUBINDUSTRY_TEMPLATES,
    )
    from BackEnd.Services.industry_profiles import slugify

    print("db_service imported OK")

    # -------------------------------------------------
    # 🔍 DB sanity check – proves which DB this script uses
    # -------------------------------------------------
    info = db_service.fetch_one("""
        SELECT
            current_database() AS db,
            current_user AS usr,
            inet_server_addr() AS host,
            inet_server_port() AS port,
            to_regclass('public.coa_pool') AS coa_pool
    """)

    print("DB sanity check:", info)
    # -------------------------------------------------

    rows = []

    # -----------------------------
    # 1) GENERAL accounts
    # -----------------------------
    for name, code, section, category, desc, std in GENERAL_ACCOUNTS_LIST:
        rows.append({
            "template_code": code,
            "template_code_scoped": f"G::{code}",
            "name": name,
            "code": code,
            "section": section,
            "category": category,
            "subcategory": None,
            "description": desc,
            "standard": std,
            "industry": None,
            "sub_industry": None,
            "is_general": True,
            "posting": True,
        })

    # -----------------------------
    # 2) INDUSTRY templates
    # -----------------------------
    for industry, accs in INDUSTRY_TEMPLATES.items():
        ind_slug = slugify(industry)
        for name, code, section, category, desc, std in accs:
            rows.append({
                "template_code": code,
                "template_code_scoped": f"I::{ind_slug}::{code}",
                "name": name,
                "code": code,
                "section": section,
                "category": category,
                "subcategory": None,
                "description": desc,
                "standard": std,
                "industry": industry,
                "sub_industry": None,
                "is_general": False,
                "posting": True,
            })

    # -----------------------------
    # 3) SUB-INDUSTRY templates
    # -----------------------------
    for industry, submap in SUBINDUSTRY_TEMPLATES.items():
        ind_slug = slugify(industry)
        for sub, accs in submap.items():
            sub_slug = slugify(sub)
            for name, code, section, category, desc, std in accs:
                rows.append({
                    "template_code": code,
                    "template_code_scoped": f"S::{ind_slug}::{sub_slug}::{code}",
                    "name": name,
                    "code": code,
                    "section": section,
                    "category": category,
                    "subcategory": sub,
                    "description": desc,
                    "standard": std,
                    "industry": industry,
                    "sub_industry": sub,
                    "is_general": False,
                    "posting": True,
                })

    print(f"Prepared {len(rows)} COA pool rows")

    info = db_service.fetch_one("""
    SELECT
    current_database() AS db,
    current_user AS usr,
    inet_server_addr() AS host,
    inet_server_port() AS port,
    to_regclass('public.coa_pool') AS coa_pool
    """)
    print("DB sanity check:", info)

    # NEW: prove the constraint exists in THIS connection
    c = db_service.fetch_one("""
    SELECT conname, contype
    FROM pg_constraint
    WHERE conrelid = 'public.coa_pool'::regclass
    ORDER BY conname
    """)
    print("Constraint check sample:", c)

    inserted = db_service.upsert_coa_pool(rows)
    print(f"Upserted {inserted} rows into public.coa_pool")

    print("=== COA POOL migration finished OK ===")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("=== COA POOL migration FAILED ===")
        print(str(e))
        traceback.print_exc()
        raise



