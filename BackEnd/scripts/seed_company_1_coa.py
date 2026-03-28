# BackEnd/scripts/seed_company_1_coa.py
"""
One-off script:
- Seed COA pool from templates
- Sync missing accounts into company COA

Target company:
- company_id = 16
- name = Tbr Deliveries
- industry = Logistics & Transport
- sub-industry = Courier/Last Mile
"""

import sys
import os

# Ensure project root is on PYTHONPATH
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from BackEnd.Services.db_service import db_service
from BackEnd.Services import coa_service as cs
from BackEnd.Services.coa_pool_service import (
    build_pool_rows_from_templates,
    sync_company_coa_from_pool,
)


def main():
    company_id = 16
    industry = "Logistics & Transport"
    sub_industry = "Courier/Last Mile"

    print(f"🔹 Target company_id={company_id}")
    print(f"🔹 Industry={industry}")
    print(f"🔹 Sub-industry={sub_industry}")

    print("🔹 Building COA pool rows from templates...")
    pool_rows = build_pool_rows_from_templates(
        industry=industry,
        sub_industry=sub_industry,
        GENERAL_ACCOUNTS_LIST=cs.GENERAL_ACCOUNTS_LIST,
        INDUSTRY_TEMPLATES=cs.INDUSTRY_TEMPLATES,
        SUBINDUSTRY_TEMPLATES=cs.SUBINDUSTRY_TEMPLATES,
    )

    print(f"   → {len(pool_rows)} pool rows prepared")

    print("🔹 Seeding / updating COA pool...")
    pool_count = db_service.upsert_coa_pool(pool_rows)

    print("🔹 Syncing company COA from pool...")
    company_count = sync_company_coa_from_pool(
        db_service,
        company_id,
        industry,
        sub_industry,
    )

    print("\n✅ DONE")
    print(f"   Pool rows upserted : {pool_count}")
    print(f"   Company rows added : {company_count}")


if __name__ == "__main__":
    main()
