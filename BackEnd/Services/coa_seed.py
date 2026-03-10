from __future__ import annotations

from typing import Dict, List
from BackEnd.Services.coa_pool_service import (
    build_pool_rows_from_templates,
    sync_company_coa_from_pool,
)
from BackEnd.Services.db_service import db_service


def seed_pool_and_sync_company_1(db):
    """
    1) Seed public.coa_pool from GENERAL / INDUSTRY / SUBINDUSTRY templates
    2) Copy missing accounts into company_1.coa
    """

    from BackEnd.Services import coa_service as cs  # ✅ where templates live

    industry = "Construction"
    sub_industry = "Civil Engineering"
    company_id = 1

    # 1️⃣ Build pool rows from templates
    pool_rows = build_pool_rows_from_templates(
        industry=industry,
        sub_industry=sub_industry,
        GENERAL_ACCOUNTS_LIST=cs.GENERAL_ACCOUNTS_LIST,
        INDUSTRY_TEMPLATES=cs.INDUSTRY_TEMPLATES,
        SUBINDUSTRY_TEMPLATES=cs.SUBINDUSTRY_TEMPLATES,
    )

    # 2️⃣ Upsert into public.coa_pool
    pool_upserted = db_service.upsert_coa_pool(pool_rows)

    # 3️⃣ Sync pool → company COA
    company_inserted = sync_company_coa_from_pool(
        db_service,
        company_id=company_id,
        industry=industry,
        sub_industry=sub_industry,
    )

    return {
        "pool_upserted": pool_upserted,
        "company_inserted": company_inserted,
    }
