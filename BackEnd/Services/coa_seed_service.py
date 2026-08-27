from __future__ import annotations
from typing import Dict, Any, Optional, List
from BackEnd.Services.industry_profiles import get_industry_profile
from BackEnd.Services.utils.industry_utils import slugify
from BackEnd.Services.coa_service import build_coa_flat
from BackEnd.Services.coa_pool_sync import sync_company_coa_from_pool

MANDATORY_TEMPLATE_CODES = {"1410", "2310", "2105", "9002"}

def _coa_is_seeded(
    db_service,
    company_id: int,
    *,
    cur=None,
) -> bool:

    schema = f"company_{company_id}"

    row = db_service.fetch_one(
        f"""
        SELECT
            COUNT(*) FILTER (
                WHERE (
                    (
                        template_code IS NOT NULL
                        AND btrim(template_code) <> ''
                    )
                    OR
                    (
                        template_code_scoped IS NOT NULL
                        AND btrim(template_code_scoped) <> ''
                    )
                )
                AND COALESCE(role, '') <> 'control'
                AND COALESCE(posting, TRUE) = TRUE
            ) AS n_template_posting,

            COUNT(*) FILTER (
                WHERE COALESCE(role, '') = 'control'
                   OR COALESCE(posting, TRUE) = FALSE
            ) AS n_controls,

            COUNT(*) AS n_total

        FROM {schema}.coa
        """,
        (),
        cur=cur,
    ) or {}

    n_template_posting = int(
        row.get("n_template_posting") or 0
    )

    n_controls = int(
        row.get("n_controls") or 0
    )

    n_total = int(
        row.get("n_total") or 0
    )

    print(
        f"[SEED-CHECK] company={company_id} "
        f"total={n_total} "
        f"template_posting={n_template_posting} "
        f"controls={n_controls}"
    )

    return n_template_posting >= 50


ORG_EQUITY_REQUIRED = {
    "private_company": {
        "equity_share_capital": "Ordinary Share Capital",
        "equity_retained_earnings": "Retained Earnings",
        "equity_dividends": "Dividends Declared",
    },
    "public_company": {
        "equity_share_capital": "Ordinary Share Capital",
        "equity_preference_share_capital": "Preference Share Capital",
        "equity_share_premium": "Share Premium",
        "equity_retained_earnings": "Retained Earnings",
        "equity_dividends": "Dividends Declared",
    },
    "sole_trader": {
        "equity_owner_capital": "Owner Capital",
        "equity_retained_earnings": "Accumulated Profit / Loss",
        "equity_drawings": "Drawings",
    },
    "partnership": {
        "equity_partner_capital": "Partners' Capital",
        "equity_partner_current": "Partners' Current Accounts",
        "equity_drawings": "Partners' Drawings",
    },
    "ngo": {
        "equity_restricted_funds": "Restricted Funds",
        "equity_unrestricted_funds": "Unrestricted Funds",
        "equity_accumulated_surplus": "Accumulated Surplus",
    },
    "npo": {
        "equity_restricted_funds": "Restricted Funds",
        "equity_unrestricted_funds": "Unrestricted Funds",
        "equity_accumulated_surplus": "Accumulated Surplus",
    },
    "trust": {
        "equity_trust_capital": "Trust Capital",
        "equity_beneficiary_funds": "Beneficiary Funds",
        "equity_accumulated_surplus": "Accumulated Income",
    },
    "cooperative": {
        "equity_member_capital": "Member Shares",
        "equity_retained_earnings": "Retained Earnings",
        "equity_reserve": "Statutory Reserve",
    },
    "body_corporate": {
        "equity_accumulated_surplus": "Accumulated Surplus",
        "equity_restricted_funds": "Reserve Fund",
    },
    "club_association": {
        "equity_accumulated_surplus": "Accumulated Fund",
        "equity_restricted_funds": "Restricted Funds",
        "equity_current_year_surplus": "Current Year Surplus / (Deficit)",
    },
    "government_entity": {
        "equity_accumulated_surplus": "Accumulated Surplus",
        "equity_reserve": "Reserves",
    },
}

def apply_organization_equity_accounts(
    db_service,
    company_id: int,
    organization_type: str,
    *,
    cur=None,
    conn=None,
) -> None:
    schema = f"company_{int(company_id)}"
    org_type = (organization_type or "private_company").strip().lower()

    required = ORG_EQUITY_REQUIRED.get(
        org_type,
        ORG_EQUITY_REQUIRED["private_company"],
    )

    # ---------------------------------------------------------
    # Use caller's transaction when supplied.
    # Otherwise the DB helpers will create their own transaction.
    # ---------------------------------------------------------

    existing = db_service.fetch_all(
        f"""
        SELECT id, code, name, role, section, category
        FROM {schema}.coa
        WHERE LOWER(COALESCE(section, '')) = 'equity'
           OR COALESCE(role, '') LIKE 'equity_%%'
        ORDER BY code;
        """,
        (),
        cur=cur,
    ) or []

    existing_by_role = {
        (r.get("role") or "").strip(): r
        for r in existing
        if (r.get("role") or "").strip()
    }

    # ---------------------------------------------------------
    # 1) Rename existing matching roles to organisation wording
    # ---------------------------------------------------------

    for role, desired_name in required.items():
        row = existing_by_role.get(role)

        if row:
            db_service.execute_sql(
                f"""
                UPDATE {schema}.coa
                SET name = %s
                WHERE id = %s;
                """,
                (desired_name, row["id"]),
                cur=cur,
            )

    # ---------------------------------------------------------
    # 2) Deactivate unsuitable equity rows
    # ---------------------------------------------------------

    allowed_roles = list(
        set(required.keys()) | {
            "equity_oci_reserve",
            "equity_regulatory_reserve",
            "equity_reserve",
        }
    )

    placeholders = ",".join(["%s"] * len(allowed_roles))

    db_service.execute_sql(
        f"""
        UPDATE {schema}.coa
        SET posting = FALSE
        WHERE COALESCE(role, '') LIKE 'equity_%%'
        AND COALESCE(role, '') <> ''
        AND COALESCE(role, '') NOT IN ({placeholders});
        """,
        tuple(allowed_roles),
        cur=cur,
    )

def seed_company_coa_once(
    db_service,
    *,
    company_id: int,
    industry: str,
    sub_industry: Optional[str],
    source: str = "pool",
    cur=None,
    conn=None,
) -> dict:

    print(f"[SEED] start company={company_id} source={source!r}")


    # =========================================================
    # INITIALIZE COMPANY-SPECIFIC SCHEMA
    # =========================================================

    db_service.ensure_company_account_settings(
        company_id,
        cur=cur,
        conn=conn,
    )

    already_seeded = _coa_is_seeded(
        db_service,
        company_id,
        cur=cur,
    )

    print(
        f"[SEED] already_seeded={already_seeded} "
        f"(company={company_id})"
    )

    inserted = 0
    source_used = None

    src = (source or "pool").strip().lower()

    if src != "pool":
        raise ValueError(
            "Seeding is configured to use pool only "
            "(source must be 'pool')."
        )

    # ---------------------------------------------------------
    # SEED COA
    # ---------------------------------------------------------

    if not already_seeded:

        print("[SEED] calling sync_company_coa_from_pool() ...")

        row = db_service.fetch_one(
            """
            SELECT
                industry,
                sub_industry,
                industry_slug,
                sub_industry_slug,
                organization_type
            FROM public.companies
            WHERE id = %s
            """,
            (company_id,),
            cur=cur,
        ) or {}

        industry_display = (
            (row.get("industry") or "").strip()
            or None
        )

        industry_slug = (
            (row.get("industry_slug") or "").strip()
            or (
                slugify(industry_display)
                if industry_display
                else None
            )
            or slugify(industry)
        )

        sub_display = (
            (row.get("sub_industry") or "").strip()
            or None
        )

        sub_slug = (
            (row.get("sub_industry_slug") or "").strip()
            or (
                slugify(sub_display)
                if sub_display
                else None
            )
            or (
                slugify(sub_industry)
                if sub_industry
                else None
            )
        )

        print(
            f"[SEED] resolved slugs company={company_id} "
            f"industry_slug={industry_slug!r} "
            f"sub_slug={sub_slug!r} "
            f"industry_display={industry_display!r} "
            f"sub_display={sub_display!r}"
        )

        inserted = sync_company_coa_from_pool(
            db_service,
            company_id=company_id,
            industry=industry_slug,
            sub_industry=sub_slug,
            industry_display=industry_display,
            sub_industry_display=sub_display,
            cur=cur,
            conn=conn,
        )

        print(f"[SEED] pool inserted={inserted}")

        organization_type = (
            row.get("organization_type")
            or "private_company"
        ).strip().lower()

        apply_organization_equity_accounts(
            db_service,
            company_id=company_id,
            organization_type=organization_type,
            cur=cur,
            conn=conn,
        )

        if inserted > 0:
            source_used = "pool"

        else:
            print(
                "[SEED] pool returned 0, "
                "falling back to template build ..."
            )

            rows = build_coa_flat(
                industry,
                sub_industry,
            )

            if rows:

                inserted = db_service.insert_coa(
                    company_id,
                    rows,
                    cur=cur,
                    conn=conn,
                )

                source_used = "template"

                print(
                    f"[SEED] template inserted={inserted}"
                )

            else:
                source_used = "none"

                print(
                    "[SEED] template fallback "
                    "produced no rows"
                )

    else:

        print(
            "[SEED] skipping pool seed "
            "(already seeded)"
        )

        source_used = "existing"

    # ---------------------------------------------------------
    # MANDATORY ACCOUNTS
    # ---------------------------------------------------------

    print("[SEED] enforcing mandatory controls...")

    db_service.ensure_mandatory_company_accounts(
        company_id,
        cur=cur,
        conn=conn,
    )

    print(
        "[SEED] mandatory controls enforced"
    )

    # ---------------------------------------------------------
    # REQUIRED CONTROL ACCOUNTS
    # ---------------------------------------------------------

    if hasattr(
        db_service,
        "ensure_required_control_accounts"
    ):

        print(
            "[SEED] enforcing required control accounts..."
        )

        db_service.ensure_required_control_accounts(
            company_id,
            cur=cur,
            conn=conn,
        )

        print(
            "[SEED] required control accounts enforced"
        )

    # ---------------------------------------------------------
    # INTEGRITY
    # ---------------------------------------------------------

    assert_reserved_control_integrity(
        db_service,
        company_id,
        cur=cur,
    )

    # ---------------------------------------------------------
    # ACCOUNT SETTINGS
    # ---------------------------------------------------------

    print(
        "[SEED] applying account settings defaults..."
    )

    db_service.ensure_company_account_settings_defaults(
        company_id,
        cur=cur,
        conn=conn,
    )

    print(
        "[SEED] account settings defaults applied"
    )

    # ---------------------------------------------------------
    # COMPANY DEFAULTS
    # ---------------------------------------------------------

    print("[SEED] setup company defaults...")

    db_service.setup_company_defaults(
        company_id,
        cur=cur,
        conn=conn,
    )

    print(
        "[SEED] company defaults done"
    )

    assert_reserved_control_integrity(
        db_service,
        company_id,
        cur=cur,
    )

    # ---------------------------------------------------------
    # FINAL CHECK
    # ---------------------------------------------------------

    final_seeded = _coa_is_seeded(
        db_service,
        company_id,
        cur=cur,
    )

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

def assert_reserved_control_integrity(
    db_service,
    company_id: int,
    *,
    cur=None,
    conn=None,
) -> None:
    schema = f"company_{company_id}"

    expected: Dict[str, Dict[str, Any]] = {
        "BS_CA_1000": {
            "template_code": "1000",
            "template_code_scoped": None,
            "name_like_any": ["cash", "bank"],
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
        cur=cur,
    ) or []

    by_code = {
        str(r.get("code") or "").strip(): r
        for r in rows
    }

    bad: List[str] = []

    for code, rule in expected.items():
        r = by_code.get(code)

        if not r:
            bad.append(f"{code}: missing")
            continue

        actual_tc = (
            str(r.get("template_code") or "").strip()
            or None
        )

        actual_tcs = (
            str(r.get("template_code_scoped") or "").strip()
            or None
        )

        actual_name = (
            str(r.get("name") or "").strip().lower()
        )

        expected_tc = (
            str(rule.get("template_code") or "").strip()
            or None
        )

        expected_tcs = (
            str(rule.get("template_code_scoped") or "").strip()
            or None
        )

        if expected_tc != actual_tc:
            bad.append(
                f"{code}: wrong template_code "
                f"actual={actual_tc!r} "
                f"expected={expected_tc!r}"
            )

        if expected_tcs != actual_tcs:
            bad.append(
                f"{code}: wrong template_code_scoped "
                f"actual={actual_tcs!r} "
                f"expected={expected_tcs!r}"
            )

        name_like_any = rule.get("name_like_any") or []

        if (
            name_like_any
            and not any(
                tok in actual_name
                for tok in name_like_any
            )
        ):
            bad.append(
                f"{code}: suspicious name={r.get('name')!r} "
                f"expected one of {name_like_any!r}"
            )

    if bad:
        raise RuntimeError(
            "Reserved control corruption detected for "
            f"company {company_id}: "
            + "; ".join(bad)
        )
