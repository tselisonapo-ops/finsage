from BackEnd.Services import coa_service as cs
from BackEnd.Services.coa_pool_service import build_pool_rows_from_templates
from BackEnd.Services.db_service import db_service

def seed_full_pool():
    all_rows = []

    # Loop through industries and subindustries properly
    for industry in cs.INDUSTRY_TEMPLATES.keys():
        for sub_industry in (cs.SUBINDUSTRY_TEMPLATES.get(industry) or {}):
            pool_rows = build_pool_rows_from_templates(
                industry=industry,
                sub_industry=sub_industry,
                GENERAL_ACCOUNTS_LIST=cs.GENERAL_ACCOUNTS_LIST,
                INDUSTRY_TEMPLATES=cs.INDUSTRY_TEMPLATES,
                SUBINDUSTRY_TEMPLATES=cs.SUBINDUSTRY_TEMPLATES,
            )
            all_rows.extend(pool_rows)

    # Upsert dict rows into public.coa_pool
    pool_upserted = db_service.upsert_coa_pool(all_rows)
    print(f"✅ Seeded {pool_upserted} rows into public.coa_pool")

if __name__ == "__main__":
    seed_full_pool()

