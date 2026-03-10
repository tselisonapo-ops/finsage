# scripts/run_coa_pool_restore_general_missing.py
import os, sys, traceback

def main():
    print("=== FinSage COA POOL: restore missing GENERAL only ===")

    ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    dsn = os.getenv("MASTER_DB_DSN") or os.getenv("DATABASE_URL")
    if not dsn:
        raise RuntimeError("MASTER_DB_DSN (or DATABASE_URL) is not set")

    from BackEnd.Services.db_service import db_service
    from BackEnd.Services.coa_service import GENERAL_ACCOUNTS_LIST

    # sanity
    info = db_service.fetch_one("""
        SELECT current_database() db, current_user usr, to_regclass('public.coa_pool') coa_pool;
    """)
    print("DB sanity:", info)

    # build only GENERAL rows
    rows = []
    for name, code, section, category, desc, std in GENERAL_ACCOUNTS_LIST:
        code = str(code).strip()
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

    # ✅ insert only missing using ON CONFLICT DO NOTHING
    inserted = db_service.upsert_coa_pool(rows)
    print(f"Inserted {inserted} missing GENERAL rows")

    print("=== done ===")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED:", e)
        traceback.print_exc()
        raise
