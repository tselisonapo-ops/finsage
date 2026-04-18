# BackEnd/Services/coa_pool_sync.py
from __future__ import annotations

from BackEnd.Services.coa_rules import profile_flags, should_exclude_account
from BackEnd.Services.db_service import _bucket_from_category_section, BUCKET_BASE
from BackEnd.Services import accounting_classifiers as ac

from typing import Any, Dict, List, Optional, Set

import re

def _scope_rank(tcs: str) -> int:
    # higher = wins
    if tcs.startswith("S::"): return 3
    if tcs.startswith("I::"): return 2
    if tcs.startswith("G::"): return 1
    return 0

def _variant_from_name(name: str) -> str:
    n = (name or "").strip().lower()
    if "non-current" in n or "non current" in n or "long-term" in n or "long term" in n:
        return "noncurrent"
    if "current" in n or "short-term" in n or "short term" in n:
        return "current"
    return "generic"

def _semantic_key(name: str) -> str:
    """
    Normalize: remove the variant labels so generic/current/noncurrent match one base concept.
    """
    n = (name or "").strip().lower()
    n = re.sub(r"\s+", " ", n)
    n = n.replace("non-current", "").replace("non current", "")
    n = n.replace("current", "")
    n = n.replace("short-term", "").replace("short term", "")
    n = n.replace("long-term", "").replace("long term", "")
    n = re.sub(r"\s+", " ", n).strip(" -")
    return n

def sync_company_coa_from_pool(
    db_service,
    *,
    company_id: int,
    industry: str,
    sub_industry: Optional[str] = None,
    industry_display: Optional[str] = None,
    sub_industry_display: Optional[str] = None,
) -> int:
    schema = f"company_{company_id}"

    print(
        "[POOL] start "
        f"company={company_id} industry={industry!r} sub_industry={sub_industry!r} "
        f"industry_display={industry_display!r} sub_industry_display={sub_industry_display!r}"
    )

    # ✅ Canonical control TEMPLATE CODES (pool must NEVER insert these)
    # ✅ Canonical control TEMPLATE CODES (pool must NEVER insert these)
    CANON_CONTROL_TCS = {
        # Core controls
        "1410",  # VAT Input
        "2310",  # VAT Output
        "2300",  # VAT Net (optional but protected)
        "2105",  # Bank Overdraft
        "9002",  # AR Control
        "2200",  # AP Control
        "2350",  # Unallocated receipts
        "2325",  # legacy/variant unallocated receipts
        "1730",  # supplier advances (unallocated payments)
        "2360",  # WHT payable
        "2215",  # GRNI control
        "5305",  # PPV control
        "1500",  # Inventory control
        "1000",  # Cash & Bank (optional protect)
        
    
        "8010",  # Sales discount
        "8011",  # Purchases discount

        # IFRS 16 lease controls
        "1610",  # ROU Asset
        "2610",  # Lease Liability - Current
        "2620",  # Lease Liability - Non-Current
        "7110",  # Lease interest expense (your mapped code)
        "6119",  # Lease amortization expense
        "1590",  # ROU accum depreciation placeholder
        "1000",
    }

    # ✅ Reporting codes we never want duplicated (company COA source of truth)
    CONTROL_REPORTING_CODES = {
        # VAT
        "BS_CA_1410",
        "BS_CL_2310",
        "BS_CL_2300",

        # Banking
        "BS_CA_1000",
        "BS_CL_2105",

        # AR/AP
        "BS_CA_9002",
        "BS_CL_2200",

        # Unallocated
        "BS_CL_2325",
        "BS_CL_2350",
        "BS_CA_1730",

        # GRNI/WHT/Inventory/PPV
        "BS_CL_2360",   # ✅ FIXED
        "BS_CL_2215",
        "BS_CA_1500",
        "BS_PL_5305",   # ✅ FIXED

        # Discounts
        "PL_REV_ADJ_8010",
        "PL_EXP_ADJ_8011",

        # IFRS16
        "BS_NCA_1610",
        "BS_CL_2610",
        "BS_NCL_2620",
        "PL_OPEX_7110",
        "PL_OPEX_6119",
        "BS_NCA_1590",
    }

    db_service.execute_ddl(
        f"ALTER TABLE {schema}.coa ADD COLUMN IF NOT EXISTS template_code_scoped TEXT NULL;"
    )
    db_service.execute_ddl(
        f"CREATE INDEX IF NOT EXISTS {schema}_coa_template_code_scoped_idx ON {schema}.coa(template_code_scoped);"
    )

    # Existing scoped IDs + existing reporting codes already in company COA
    existing_scoped: Set[str] = set()
    existing_codes: Set[str] = set()

    existing_rows = db_service.fetch_all(
        f"SELECT template_code_scoped, code, template_code, name FROM {schema}.coa;"
    ) or []

    for r in existing_rows:
        tcs = (r.get("template_code_scoped") or "").strip()
        if tcs:
            existing_scoped.add(tcs)

        c = (r.get("code") or "").strip()
        if c:
            existing_codes.add(c)

    print(
        f"[POOL] existing rows={len(existing_rows)} "
        f"existing_scoped={len(existing_scoped)} existing_codes={len(existing_codes)} "
        f"have_controls={bool(CONTROL_REPORTING_CODES & existing_codes)}"
    )

    ind_slug = (industry or "").strip()
    sub_slug = (sub_industry or "").strip() if sub_industry else None
    if not ind_slug:
        raise ValueError("sync_company_coa_from_pool requires `industry` slug (non-empty).")

    g_pat = "G::%"
    i_pat = f"I::{ind_slug}::%"
    s_pat = f"S::{ind_slug}::{sub_slug}::%" if sub_slug else None

    flags = profile_flags(industry_display, sub_industry_display)

    # ✅ exclude canonical controls at source
    sql = """
    SELECT
    p.template_code,
    p.template_code_scoped,
    p.name,
    p.code,
    p.section,
    p.category,
    p.subcategory,
    p.description,
    p.standard,
    p.posting
    FROM public.coa_pool p
    WHERE p.template_code IS NOT NULL
    AND p.template_code_scoped IS NOT NULL
    AND p.template_code::text NOT IN (
        '1410','2310','2300','2105','9002','2200','2325','2350','1730','2360','2215','5305','1500',
        '1000','8010','8011',
        '1610','2610','2620','7110','6119','1590', '1000'
    )
    AND (
        p.template_code_scoped LIKE %s
        OR p.template_code_scoped LIKE %s
        OR (%s IS NOT NULL AND p.template_code_scoped LIKE %s)
    )
    ORDER BY p.template_code_scoped;
    """

    params = (g_pat, i_pat, sub_slug, s_pat)
    pool_rows = db_service.fetch_all(sql, params) or []
    print(f"[POOL] fetched pool_rows={len(pool_rows)} g_pat={g_pat!r} i_pat={i_pat!r} s_pat={s_pat!r}")

    # Keep best row per (semantic_key, variant) using scope rank
    best: dict[tuple[str, str], dict] = {}

    for p in pool_rows:
        tcs = str(p.get("template_code_scoped") or "").strip()
        name = (p.get("name") or "").strip()
        if not tcs or not name:
            continue

        sem = _semantic_key(name)
        var = _variant_from_name(name)
        key = (sem, var)

        r = _scope_rank(tcs)
        prev = best.get(key)
        if (prev is None) or (r > _scope_rank(prev.get("template_code_scoped", ""))):
            best[key] = p

    print(f"[POOL] best dedup keys={len(best)} (semantic+variant)")

    # Generic suppression: if both current & noncurrent exist for same semantic, drop generic
    final_rows = []
    by_sem: Dict[str, Set[str]] = {}

    for (sem, var), row in best.items():
        by_sem.setdefault(sem, set()).add(var)

    suppressed_generic = 0
    for (sem, var), row in best.items():
        if var == "generic":
            vars_present = by_sem.get(sem, set())
            if "current" in vars_present and "noncurrent" in vars_present:
                suppressed_generic += 1
                continue
        final_rows.append(row)

    pool_rows = final_rows
    print(f"[POOL] after generic suppression rows={len(pool_rows)} suppressed_generic={suppressed_generic}")

    next_code_cache: Dict[str, int] = {}
    missing: List[Dict[str, Any]] = []

    skipped_existing_scoped = 0
    skipped_excluded_general = 0
    skipped_controls = 0
    skipped_canon_tc = 0
    added = 0

    for p in pool_rows:
        tc = str(p.get("template_code") or "").strip()
        tcs = str(p.get("template_code_scoped") or "").strip()
        if not tc or not tcs:
            continue

        # ✅ double safety: hard skip canonical control template codes
        if tc in CANON_CONTROL_TCS:
            skipped_canon_tc += 1
            existing_scoped.add(tcs)
            continue

        # Dedupe by scoped identifier ONLY
        if tcs in existing_scoped:
            skipped_existing_scoped += 1
            continue

        name = (p.get("name") or "").strip()
        section = (p.get("section") or "").strip()
        category = (p.get("category") or "").strip()
        subcat = (p.get("subcategory") or "").strip()
        std = (p.get("standard") or "").strip()

        # Only filter GENERAL scoped rows
        if tcs.startswith("G::"):
            if should_exclude_account(name=name, section=section, category=category, flags=flags):
                skipped_excluded_general += 1
                existing_scoped.add(tcs)
                continue

        # (keep your control-reporting-code guard if you want; it’s now mostly redundant)
        # (keep your control-reporting-code guard if you want; it’s now mostly redundant)
        # Only run these string-detection guards if the company already has canonical control codes.
        if CONTROL_REPORTING_CODES & existing_codes:
            txt = f"{name} {category} {subcat} {section} {std}".lower()

            # -----------------------------
            # Core controls
            # -----------------------------
            is_vat_input  = (tc == "1410") or ("vat input" in txt) or ("input vat" in txt)
            is_vat_output = (tc == "2310") or ("vat output" in txt) or ("output vat" in txt)
            is_vat_net    = (tc == "2300") or ("vat payable" in txt and "net" in txt)
            is_lease_bank_account_code  = (tc == "1000") or ("cash & bank" in txt and "bank & cash" in txt)
            is_ar_control = (
                tc == "9002"
                or (("accounts receivable" in txt or "trade receivable" in txt) and "control" in txt)
            )

            is_overdraft = (tc == "2105") or ("bank overdraft" in txt) or ("overdraft" in txt and "bank" in txt)

            is_ap_control = (
                tc == "2200"
                or (
                    ("accounts payable" in txt or "trade payable" in txt or "trade payables" in txt)
                    and ("current liabilities" in txt or "liability" in txt)
                )
            )

            # receipts-side unallocated (customer overpayments)
            is_unalloc_receipts = (
                tc in {"2325", "2350"}
                or ("unallocated" in txt and ("receipt" in txt or "receipts" in txt))
                or ("customer overpayment" in txt)
                or ("unallocated receipt" in txt)
                or ("customer credit" in txt)
            )

            # payments-side unallocated (supplier advances / vendor prepayments)
            is_vendor_advances = (
                tc == "1730"
                or ("supplier advances" in txt)
                or ("vendor prepayment" in txt)
                or ("vendor prepayments" in txt)
                or ("unallocated" in txt and ("payment" in txt or "payments" in txt))
            )

            is_wht = (
                tc == "2360"
                or ("withholding" in txt and "tax" in txt)
                or ("wht" in txt and ("payable" in txt or "liability" in txt))
            )

            is_grni = (
                tc == "2215"
                or ("grni" in txt)
                or ("goods received not invoiced" in txt)
                or ("goods received" in txt and "not invoiced" in txt)
            )

            is_ppv_control = (
                tc == "5305"
                or ("purchase price variance" in txt)
                or ("ir/gr" in txt)
                or ("gr/ir" in txt)
                or ("price variance" in txt)
            )

            is_inventory_control = (
                tc == "1500"
                or ("inventory" in txt and "control" in txt)
            )

            is_sales_discount_control = (
                tc == "8010"
                or ("sales discount" in txt)
                or ("sales discounts" in txt)
            )

            is_purchase_discount_control = (
                tc == "8011"
                or ("purchases discount" in txt)
                or ("purchase discount" in txt)
                or ("rebate" in txt and "purchase" in txt)
            )

            # -----------------------------
            # IFRS 16 / Lease controls
            # -----------------------------
            is_rou_asset = (
                tc == "1610"
                or ("right-of-use" in txt)
                or ("right of use" in txt)
                or ("rou asset" in txt)
            )

            is_lease_liab_current = (
                tc == "2610"
                or ("lease liability" in txt and "current" in txt)
            )

            is_lease_liab_noncurrent = (
                tc == "2620"
                or ("lease liability" in txt and ("non-current" in txt or "non current" in txt))
            )

            is_lease_interest = (
                tc == "7110"
                or ("lease interest" in txt)
                or ("interest expense" in txt and "lease" in txt)
            )

            is_lease_amort = (
                tc == "6119"
                or ("lease amortization" in txt)
                or ("lease amortisation" in txt)
                or ("depreciation" in txt and "lease" in txt)
                or ("rou depreciation" in txt)
            )

            is_rou_accum_depr = (
                tc == "1590"
                or ("accumulated depreciation" in txt and ("rou" in txt or "right-of-use" in txt or "right of use" in txt))
            )

            # -----------------------------
            # Hard skips if canonical already exists in company COA
            # -----------------------------
            if is_vat_input and "BS_CA_1410" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            if is_vat_output and "BS_CL_2310" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            if is_vat_net and "BS_CL_2300" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            if is_ar_control and "BS_CA_9002" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            if is_overdraft and "BS_CL_2105" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            if is_ap_control and "BS_CL_2200" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            if is_unalloc_receipts and (("BS_CL_2350" in existing_codes) or ("BS_CL_2325" in existing_codes)):
                skipped_controls += 1; existing_scoped.add(tcs); continue

            if is_vendor_advances and "BS_CA_1730" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            if is_wht and "BS_CL_2360" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            if is_grni and "BS_CL_2215" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            # ✅ FIXED: PPV reporting code is BS_PL_5305 (not BS_CL_5305)
            if is_ppv_control and "BS_PL_5305" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            if is_inventory_control and "BS_CA_1500" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            if is_sales_discount_control and "PL_REV_ADJ_8010" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            if is_purchase_discount_control and "PL_EXP_ADJ_8011" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            # IFRS 16 skips (only if you actually keep these codes in your COA)
            if is_rou_asset and "BS_NCA_1610" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            if is_lease_liab_current and "BS_CL_2610" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            if is_lease_liab_noncurrent and "BS_NCL_2620" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            if is_lease_interest and "PL_OPEX_7110" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            if is_lease_amort and "PL_OPEX_6119" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue

            if is_rou_accum_depr and "BS_NCA_1590" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue
            
            if is_lease_bank_account_code and "BS_CA_1000" in existing_codes:
                skipped_controls += 1; existing_scoped.add(tcs); continue
            
        family = _bucket_from_category_section(category, section, subcat, std)
        base = BUCKET_BASE.get(family, 6000)

        if family not in next_code_cache:
            next_code_cache[family] = _next_code_for_family(db_service, schema, family, base)

        code_numeric = next_code_cache[family]
        next_code_cache[family] += 1

        reporting_code = ac._make_reporting_code(family, int(code_numeric))

        missing.append({
            "template_code": tc,
            "template_code_scoped": tcs,
            "name": name,
            "code": None,
            "code_family": family,
            "code_numeric": None,
            "section": section or None,
            "category": category or None,
            "subcategory": subcat or None,
            "description": (p.get("description") or "").strip() or None,
            "standard": std or None,
            "posting": bool(p.get("posting", True)),
        })

        added += 1
        existing_scoped.add(tcs)
        existing_codes.add(reporting_code)

    print(
        "[POOL] loop stats "
        f"added={added} missing={len(missing)} "
        f"skipped_canon_tc={skipped_canon_tc} "
        f"skipped_existing_scoped={skipped_existing_scoped} "
        f"skipped_excluded_general={skipped_excluded_general} "
        f"skipped_controls={skipped_controls}"
    )

    if not missing:
        print("[POOL] nothing to insert (missing=0)")
        return 0
    dbg = [m for m in missing if m.get("template_code") in ("1501","1502") or str(m.get("template_code_scoped","")).startswith("G::150")]
    print("[POOL][DEBUG] missing 1501/1502:", [(x.get("template_code"), x.get("template_code_scoped"), x.get("name")) for x in dbg])

    print(f"[POOL] inserting missing={len(missing)} ...")
    n = db_service.insert_coa(company_id, missing)
    print(f"[POOL] inserted={n}")
    return n


def _next_code_for_family(db_service, schema: str, family: str, base: int) -> int:
    row = db_service.fetch_one(
        f"""
        SELECT COALESCE(MAX(code_numeric), 0) AS max_num
        FROM {schema}.coa
        WHERE code_family = %s
        """,
        (family,),
    )
    max_num = 0
    if row:
        max_num = row.get("max_num") if isinstance(row, dict) else row[0]
    if not max_num or int(max_num) < base:
        return base
    return int(max_num) + 1
