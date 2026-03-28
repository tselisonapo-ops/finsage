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

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from BackEnd.Services.db_service import db_service
from BackEnd.Services import coa_service as cs
from BackEnd.Services.coa_pool_service import (
    build_pool_rows_from_templates,
    sync_company_coa_from_pool,
)


def build_template_code_scoped(row: dict, industry: str, sub_industry: str) -> str:
    template_code = (row.get("template_code") or "").strip()
    row_industry = (row.get("industry") or industry or "").strip()
    row_sub_industry = (row.get("sub_industry") or sub_industry or "").strip()

    if row_sub_industry:
        return f"{template_code}::{row_industry}::{row_sub_industry}"
    if row_industry:
        return f"{template_code}::{row_industry}"
    return template_code


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

    normalized_rows = []
    for r in pool_rows:
        row = dict(r)

        original_template_code = (row.get("template_code") or "").strip()
        numeric_code = (row.get("code") or "").strip()

        if not numeric_code:
            raise ValueError(f"Missing code in row: {row}")

        if not original_template_code:
            raise ValueError(f"Missing template_code in row: {row}")

        row["template_code"] = numeric_code
        row["template_code_scoped"] = original_template_code

        if row.get("industry") is None:
            row["industry"] = industry

        if row.get("sub_industry") is None:
            row["sub_industry"] = sub_industry

        normalized_rows.append(row)

    print("🔹 Seeding / updating COA pool...")
    pool_count = db_service.upsert_coa_pool(normalized_rows)

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