from __future__ import annotations
from typing import Optional, Dict, Any

from BackEnd.Services.industry_profiles import get_industry_profile
from BackEnd.Services.utils.industry_utils import slugify
from BackEnd.Services.coa_service import build_coa_flat
from BackEnd.Services.coa_pool_sync import sync_company_coa_from_pool

MANDATORY_TEMPLATE_CODES = {"1410", "2310", "2105", "9002"}

def _coa_is_seeded(db_service, company_id: int) -> bool:
    schema = f"company_{company_id}"

    row = db_service.fetch_one(
        f"""
        SELECT
          COUNT(*) FILTER (
            WHERE (
              (template_code IS NOT NULL AND btrim(template_code) <> '')
              OR
              (template_code_scoped IS NOT NULL AND btrim(template_code_scoped) <> '')
            )
            -- ✅ exclude “controls” properly:
            AND COALESCE(role,'') <> 'control'
            AND COALESCE(posting, TRUE) = TRUE
          ) AS n_template_posting,

          COUNT(*) FILTER (
            WHERE COALESCE(role,'') = 'control'
               OR COALESCE(posting, TRUE) = FALSE
          ) AS n_controls,

          COUNT(*) AS n_total
        FROM {schema}.coa
        """,
        (),
    ) or {}

    n_template_posting = int(row.get("n_template_posting") or 0)
    n_controls = int(row.get("n_controls") or 0)
    n_total = int(row.get("n_total") or 0)

    print(f"[SEED-CHECK] company={company_id} total={n_total} template_posting={n_template_posting} controls={n_controls}")

    # choose threshold you expect from a full industry template
    return n_template_posting >= 50

def seed_company_coa_once(
    db_service,
    *,
    company_id: int,
    industry: str,
    sub_industry: Optional[str],
    source: str = "pool",   # "pool" only for now
) -> dict:
    print(f"[SEED] start company={company_id} source={source!r}")

    # 0) Schema always
    db_service.ensure_company_schema(company_id)
    db_service.ensure_company_coa_table(company_id)
    # 1) Public schema + settings
    db_service.initialize_public_schema()
    db_service.ensure_company_account_settings(company_id)

    # ✅ compute BEFORE printing
    already_seeded = _coa_is_seeded(db_service, company_id)
    print(f"[SEED] already_seeded={already_seeded} (company={company_id})")

    inserted = 0
    src = (source or "pool").strip().lower()

    if src != "pool":
        raise ValueError("Seeding is configured to use pool only (source must be 'pool').")

    if not already_seeded:
        print("[SEED] calling sync_company_coa_from_pool() ...")

        row = db_service.fetch_one(
            """
            SELECT industry, sub_industry, industry_slug, sub_industry_slug
            FROM public.companies
            WHERE id=%s
            """,
            (company_id,),
        ) or {}

        industry_display = (row.get("industry") or "").strip() or None
        industry_slug = (
            (row.get("industry_slug") or "").strip()
            or (slugify(industry_display) if industry_display else None)
            or slugify(industry)
        )

        sub_display = (row.get("sub_industry") or "").strip() or None
        sub_slug = (
            (row.get("sub_industry_slug") or "").strip()
            or (slugify(sub_display) if sub_display else None)
            or (slugify(sub_industry) if sub_industry else None)
        )

        print(
            "[SEED] pool seed params "
            f"industry_slug={industry_slug!r} sub_slug={sub_slug!r} "
            f"industry_display={industry_display!r} sub_display={sub_display!r}"
        )

        inserted = sync_company_coa_from_pool(
            db_service,
            company_id=company_id,
            industry=industry_slug,
            sub_industry=sub_slug,
            industry_display=industry_display,
            sub_industry_display=sub_display,
        )

        print(f"[SEED] pool inserted={inserted}")
    else:
        print("[SEED] skipping pool seed (already seeded)")

    # controls always enforced AFTER pool seed
    print("[SEED] enforcing mandatory controls...")
    db_service.ensure_mandatory_company_accounts(company_id)
    print("[SEED] mandatory controls enforced")

    if hasattr(db_service, "ensure_required_control_accounts"):
        print("[SEED] enforcing required control accounts...")
        db_service.ensure_required_control_accounts(company_id)
        print("[SEED] required control accounts enforced")

    print("[SEED] applying account settings defaults...")
    db_service.ensure_company_account_settings_defaults(company_id)
    print("[SEED] account settings defaults applied")

    print("[SEED] setup company defaults...")
    db_service.setup_company_defaults(company_id)
    print("[SEED] company defaults done")

    out = {
        "seeded": (not already_seeded),
        "inserted": inserted,
        "source_used": "pool",
        "reason": ("coa_already_seeded" if already_seeded else None),
    }
    print(f"[SEED] done -> {out}")
    return out


