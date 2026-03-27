from __future__ import annotations
from typing import Dict, Any, Optional, List
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
    source: str = "pool",
) -> dict:
    print(f"[SEED] start company={company_id} source={source!r}")

    db_service.ensure_company_schema(company_id)
    db_service.ensure_company_coa_table(company_id)
    db_service.initialize_public_schema()
    db_service.ensure_company_account_settings(company_id)

    already_seeded = _coa_is_seeded(db_service, company_id)
    print(f"[SEED] already_seeded={already_seeded} (company={company_id})")

    inserted = 0
    source_used = None
    src = (source or "pool").strip().lower()

    if src != "pool":
        raise ValueError("Seeding is configured to use pool only (source must be 'pool').")

    if not already_seeded:
        print("[SEED] calling sync_company_coa_from_pool() ...")

        row = db_service.fetch_one(
            """
            SELECT industry, sub_industry, industry_slug, sub_industry_slug
            FROM public.companies
            WHERE id = %s
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
            f"[SEED] resolved slugs company={company_id} "
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

        if inserted > 0:
            source_used = "pool"
        else:
            print("[SEED] pool returned 0, falling back to template build ...")
            rows = build_coa_flat(industry, sub_industry)
            if rows:
                inserted = db_service.insert_coa(company_id, rows)
                source_used = "template"
                print(f"[SEED] template inserted={inserted}")
            else:
                source_used = "none"
                print("[SEED] template fallback produced no rows")

        assert_reserved_control_integrity(db_service, company_id)
    else:
        print("[SEED] skipping pool seed (already seeded)")
        source_used = "existing"

    print("[SEED] enforcing mandatory controls...")
    db_service.ensure_mandatory_company_accounts(company_id)
    print("[SEED] mandatory controls enforced")
    assert_reserved_control_integrity(db_service, company_id)

    if hasattr(db_service, "ensure_required_control_accounts"):
        print("[SEED] enforcing required control accounts...")
        db_service.ensure_required_control_accounts(company_id)
        print("[SEED] required control accounts enforced")
        assert_reserved_control_integrity(db_service, company_id)

    print("[SEED] applying account settings defaults...")
    db_service.ensure_company_account_settings_defaults(company_id)
    print("[SEED] account settings defaults applied")

    print("[SEED] setup company defaults...")
    db_service.setup_company_defaults(company_id)
    print("[SEED] company defaults done")
    assert_reserved_control_integrity(db_service, company_id)

    final_seeded = _coa_is_seeded(db_service, company_id)

    out = {
        "seeded": final_seeded,
        "inserted": inserted,
        "source_used": source_used or "none",
        "reason": (
            "coa_already_seeded"
            if already_seeded
            else "pool_seed_returned_zero"
            if inserted == 0 and not final_seeded
            else None
        ),
    }
    print(f"[SEED] done -> {out}")
    return out




def assert_reserved_control_integrity(db_service, company_id: int) -> None:
    schema = f"company_{company_id}"

    expected: Dict[str, Dict[str, Any]] = {
        "BS_CA_1000": {
            "template_code": "1000",
            "template_code_scoped": None,
            "name_like_any": ["cash", "bank"],
        },
        "BS_CA_1010": {
            "template_code": "1010",
            "template_code_scoped": None,
        },
        "BS_CA_1050": {
            "template_code": "1050",
            "template_code_scoped": None,
        },
        "BS_CL_2105": {
            "template_code": "2105",
            "template_code_scoped": None,
        },
        "BS_CA_1410": {
            "template_code": "1410",
            "template_code_scoped": None,
        },
        "BS_CL_2310": {
            "template_code": "2310",
            "template_code_scoped": None,
        },
    }

    rows = db_service.fetch_all(
        f"""
        SELECT
            code,
            name,
            category,
            section,
            subcategory,
            template_code,
            template_code_scoped
        FROM {schema}.coa
        WHERE code = ANY(%s)
        """,
        (list(expected.keys()),),
    ) or []

    by_code = {str(r.get("code") or "").strip(): r for r in rows}
    bad: List[str] = []

    for code, rule in expected.items():
        r = by_code.get(code)
        if not r:
            bad.append(f"{code}: missing")
            continue

        actual_tc = str(r.get("template_code") or "").strip() or None
        actual_tcs = str(r.get("template_code_scoped") or "").strip() or None
        actual_name = str(r.get("name") or "").strip().lower()

        expected_tc = str(rule.get("template_code") or "").strip() or None
        expected_tcs = str(rule.get("template_code_scoped") or "").strip() or None

        if expected_tc != actual_tc:
            bad.append(
                f"{code}: wrong template_code actual={actual_tc!r} expected={expected_tc!r}"
            )

        if expected_tcs != actual_tcs:
            bad.append(
                f"{code}: wrong template_code_scoped actual={actual_tcs!r} expected={expected_tcs!r}"
            )

        name_like_any = rule.get("name_like_any") or []
        if name_like_any and not any(tok in actual_name for tok in name_like_any):
            bad.append(
                f"{code}: suspicious name={r.get('name')!r} expected one of {name_like_any!r}"
            )

    if bad:
        raise RuntimeError(
            "Reserved control corruption detected for company "
            f"{company_id}: " + "; ".join(bad)
        )