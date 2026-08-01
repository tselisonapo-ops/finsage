# BackEnd/Services/reporting/balance_sheet_builder_v3.py
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from BackEnd.Services.reporting.tb_helpers import split_cash_and_overdraft
from BackEnd.Services.accounting_classifiers import _is_contra_row
from BackEnd.Services.periods import parse_date_maybe
from . import reporting_helpers as rh
# ============================================================
# TB field-safe getters (support debit/credit OR debit_total/credit_total)
# ============================================================

def _tb_debit(row: Dict[str, Any]) -> float:
    v = row.get("debit_total")
    if v is None:
        v = row.get("debit")
    return float(v or 0.0)


def _tb_credit(row: Dict[str, Any]) -> float:
    v = row.get("credit_total")
    if v is None:
        v = row.get("credit")
    return float(v or 0.0)


def _tb_code(row: Dict[str, Any]) -> str:
    return str(row.get("code") or row.get("account") or "").strip()

def _tb_role(row: Dict[str, Any]) -> str:
    return str(
        row.get("role")
        or row.get("account_role")
        or ""
    ).strip().lower()

def _tb_name(row: Dict[str, Any]) -> str:
    return str(
        row.get("name")
        or row.get("account_name")
        or row.get("label")
        or row.get("display_name")
        or _tb_code(row)
        or ""
    ).strip()

def _norm(*parts: Any) -> str:
    return " ".join(str(p or "").strip().lower() for p in parts if p is not None)


def _code_family(row: Dict[str, Any]) -> str:
    """
    Supports:
      - explicit row["code_family"] if present
      - inferred from code like "BS_CA_1000" -> "BS_CA"
    """
    fam = str(row.get("code_family") or "").strip().upper()
    if fam:
        return fam

    code = _tb_code(row).upper()
    parts = code.split("_")
    if len(parts) >= 2 and parts[0] in ("BS", "PL"):
        return f"{parts[0]}_{parts[1]}"
    return ""


def _parse_code_int(row: Dict[str, Any]) -> int:
    """
    Allows:
      - "2105"
      - "BS_CA_1000" (extracts first numeric run)
    """
    s = _tb_code(row)
    digits = ""
    for ch in s:
        if ch.isdigit():
            digits += ch
        elif digits:
            break
    try:
        return int(digits) if digits else 0
    except Exception:
        return 0

def fin_year_start_for_as_of(as_of: date, fy_start: date) -> date:
    # fy_start holds month/day, year irrelevant
    m, d = fy_start.month, fy_start.day
    start = date(as_of.year, m, d)
    if as_of < start:
        start = date(as_of.year - 1, m, d)
    return start


# ============================================================
# Classifiers (Balance Sheet only)
# ============================================================

def _classify_kind(row: Dict[str, Any]) -> str:
    """
    asset | liability | equity | other
    Uses code_family first, then falls back to text/numeric.
    """
    fam = _code_family(row)
    role = _tb_role(row)

    if role in (
        "lessor_net_investment_current",
        "lessor_net_investment_noncurrent",
        "lessor_accrued_rental",
        "lessor_initial_direct_cost_asset",
    ):
        return "asset"

    if role in (
        "lessor_deferred_rental",
        "lessor_security_deposit_current",
        "lessor_security_deposit_noncurrent",
    ):
        return "liability"

    if fam.startswith("BS_"):
        if fam in ("BS_CA", "BS_NCA"):
            return "asset"
        if fam in ("BS_CL", "BS_NCL"):
            return "liability"
        if fam == "BS_EQ":
            return "equity"

    cat = str(row.get("category") or "").lower()
    sec = str(row.get("section") or "").lower()
    txt = _norm(cat, sec, _tb_name(row))

    if "asset" in cat or "assets" in sec or "receivable" in txt or "cash" in txt:
        return "asset"
    if "liab" in cat or "liabil" in sec or "payable" in txt or "overdraft" in txt or "loan" in txt:
        return "liability"
    if "equity" in cat or "retained" in txt or "share capital" in txt or "reserve" in txt:
        return "equity"

    n = _parse_code_int(row)
    if 1000 <= n < 2000:
        return "asset"
    if 2000 <= n < 3000:
        return "liability"
    if 3000 <= n < 4000:
        return "equity"

    return "other"


def _is_current_bucket(row: Dict[str, Any], kind: str) -> Optional[bool]:
    if kind == "equity":
        return False

    role = _tb_role(row)

    if role in (
        "lessor_net_investment_current",
        "lessor_accrued_rental",
    ):
        return True

    if role in (
        "lessor_net_investment_noncurrent",
        "lessor_initial_direct_cost_asset",
    ):
        return False

    txt = _norm(row.get("section"), row.get("category"), _tb_name(row))

    # ✅ check non-current FIRST (because it contains "current")
    if "non-current" in txt or "non current" in txt or "long-term" in txt or "long term" in txt:
        return False
    if "current" in txt:
        return True

    fam = _code_family(row)
    if fam == "BS_CA":
        return True
    if fam == "BS_NCA":
        return False
    if fam == "BS_CL":
        return True
    if fam == "BS_NCL":
        return False

    n = _parse_code_int(row)

    if kind == "asset":
        if 1000 <= n < 1500:
            return True
        if 1500 <= n < 2000:
            return False

    if kind == "liability":
        if 2000 <= n < 2400:
            return True
        if 2400 <= n < 3000:
            return False

    return None

def _is_ppe(row: Dict[str, Any]) -> bool:
    tag = str(row.get("standard") or row.get("ifrs_tag") or row.get("std_tag") or "").upper()
    section = str(row.get("section") or "").strip().lower()
    category = str(row.get("category") or "").strip().lower()
    subcategory = str(row.get("subcategory") or "").strip().lower()
    role = str(row.get("role") or "").strip().lower()
    name = str(_tb_name(row) or "").strip().lower()

    if role.startswith("lessor_"):
        return False
    txt = _norm(section, category, subcategory, role, name)

    # Exclude ROU and investment property
    if "right-of-use" in txt or "right of use" in txt or "rou" in txt:
        return False
    if "investment property" in txt or "ias 40" in tag:
        return False

    # Exclude depreciation / amortisation expense accounts
    if section == "expense" or category == "expense":
        return False

    # Role-based PPE detection
    if role.startswith("ppe_"):
        return True

    if role in (
        "land",
        "buildings",
        "plant_equipment",
        "office_furniture",
        "computer_equipment",
        "office_equipment",
        "motor_vehicles",
        "heavy_vehicles",
        "construction_equipment",
        "mining_equipment",
        "manufacturing_equipment",
        "tools",
        "leasehold_improvements",
        "assets_under_construction",
        "other_ppe",
    ):
        return True

    # Accumulated depreciation roles are PPE-related, but not PPE cost
    if role.startswith("accumulated_depreciation_"):
        return False

    # Old seeded company fallback
    if "property, plant" in txt or "plant and equipment" in txt or "ppe" in txt:
        return True

    # IAS 16 asset fallback
    if "IAS 16" in tag and "asset" in txt:
        return True

    return False

import re
from typing import Any, Dict

def _is_accum_dep(row: Dict[str, Any]) -> bool:
    """
    True if row looks like accumulated depreciation / accumulated amortisation
    (contra-asset). Uses category + name, plus a few shorthand patterns.
    """
    txt = _norm(row.get("category"), _tb_name(row), row.get("section"))

    if not txt:
        return False

    # Quick shorthand patterns like: "A/D", "ACC DEP", "ACC. DEP"
    if re.search(r"\b(a\/d|acc\.?\s*dep|acc\s*depr)\b", txt):
        return True

    has_accum = (
        "accum" in txt
        or "accumulated" in txt
        or "accum dep" in txt
        or "acc depreciation" in txt
        or "acc depreciation" in txt
    )

    # Depreciation / amortisation terms
    has_dep_or_amort = (
        "dep" in txt
        or "depreciation" in txt
        or "amort" in txt
        or "amortisation" in txt
        or "amortization" in txt
    )

    # Avoid false positives like "accumulated income", "accumulated profit", etc.
    equity_like = ("retained" in txt) or ("earnings" in txt) or ("profit" in txt) or ("reserve" in txt)
    if equity_like:
        return False

    return bool(has_accum and has_dep_or_amort)

# ============================================================
# Signed BS amount
# ============================================================

def _bs_signed_amount(kind: str, row: Dict[str, Any]) -> float:
    dr = _tb_debit(row)
    cr = _tb_credit(row)
    if kind == "asset":
        return dr - cr
    if kind in ("liability", "equity"):
        return cr - dr
    return 0.0


# ============================================================
# TB map helper  ✅ fixes your _tb_maps undefined
# ============================================================

def _tb_maps(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """
    Map by code/account -> row.
    """
    out: Dict[str, Dict[str, Any]] = {}
    for r in rows or []:
        k = _tb_code(r)
        if k:
            out[k] = r
    return out

def _raw_close(m: Dict[str, Any]) -> float:
    if not m: 
        return 0.0
    v = m.get("closing_balance_raw")
    if v is None:
        v = m.get("closing_balance")
    return float(v or 0.0) 

def _is_rou_asset(row: Dict[str, Any], ctx: Dict[str, Any]) -> bool:
    code = str(row.get("code") or "").strip()
    if _tb_role(row).startswith("lessor_"):
        return False
    roa = str(ctx.get("roa_code") or "").strip()

    if roa and code == roa:
        return True

    name_l = (_tb_name(row) or "").lower()
    return ("right-of-use" in name_l) or ("right of use" in name_l) or ("rou" in name_l)

def _is_rou_accum_dep(row: Dict[str, Any], ctx: Dict[str, Any]) -> bool:
    code = str(row.get("code") or "").strip()
    lease_acc = str(ctx.get("lease_accumulated_depreciation_code") or "").strip()

    if lease_acc and code == lease_acc:
        return True

    # fallback (if settings missing)
    name_l = (_tb_name(row) or "").lower()
    cat_l = str(row.get("category") or "").lower()
    return ("accum" in cat_l or "accum" in name_l) and ("right-of-use" in name_l or "rou" in name_l)

def _is_intangible(row: Dict[str, Any]) -> bool:
    tag = str(row.get("standard") or row.get("ifrs_tag") or row.get("std_tag") or "").upper()
    txt = _norm(row.get("section"), row.get("category"), _tb_name(row), tag)

    if "IAS 38" in tag:
        return True

    # common labels
    if any(k in txt for k in (
        "intangible", "goodwill", "software", "license", "licence",
        "patent", "trademark", "development cost", "development costs"
    )):
        return True

    # optional numeric/code fallback (adjust to your COA if needed)
    n = _parse_code_int(row)
    if 1800 <= n < 1900:   # example: many COAs keep intangibles ~1800s
        return True

    return False


def _is_investment_property(row: Dict[str, Any]) -> bool:
    tag = str(row.get("standard") or row.get("ifrs_tag") or row.get("std_tag") or "").upper()
    txt = _norm(row.get("section"), row.get("category"), _tb_name(row), tag)

    if "IAS 40" in tag:
        return True

    if any(k in txt for k in ("investment property", "investment properties")):
        return True

    # optional numeric/code fallback (adjust to your COA if needed)
    n = _parse_code_int(row)
    if 1900 <= n < 2000:   # example bucket
        return True

    return False

def _route_nca_internal_bucket(row_any: Dict[str, Any], ctx: Dict[str, Any]) -> str:
    """
    Returns one of:
      'invprop' | 'rou' | 'ppe' | 'intang' | 'other'

    Purpose:
      - Acc Dep rows often have generic names ("Accumulated depreciation")
      - We route using section/category/tag first, not only name.
    """
    # Strong signals first
    if _is_investment_property(row_any):
        return "invprop"

    if _is_rou_asset(row_any, ctx) or _is_rou_accum_dep(row_any, ctx):
        return "rou"

    if _is_intangible(row_any):
        return "intang"

    # PPE last (broad bucket)
    if _is_ppe(row_any):
        return "ppe"

    # fallback using section/category hints (covers generic acc dep)
    txt = _norm(row_any.get("section"), row_any.get("category"), row_any.get("standard") or row_any.get("ifrs_tag"))
    if "property, plant" in txt or "plant and equipment" in txt or "ias 16" in txt:
        return "ppe"
    if "ias 40" in txt or "investment property" in txt:
        return "invprop"
    if "ias 38" in txt or "intangible" in txt:
        return "intang"
    if "ifrs 16" in txt or "right-of-use" in txt or "right of use" in txt or "rou" in txt:
        return "rou"

    return "other"

def _make_header(title: str) -> Dict[str, Any]:
    return {
        "code": "",
        "name": title,
        "values": {},
        "is_contra": False,
        "meta": {"row_type": "header", "bold": True},
    }

def _standard_code(row: Dict[str, Any]) -> str:
    standard = str(
        row.get("standard")
        or row.get("ifrs_tag")
        or row.get("std_tag")
        or ""
    ).strip().upper()

    return standard.replace(" ", "")


def _deferred_tax_source_module(row: Dict[str, Any]) -> str:
    standard = _standard_code(row)
    role = str(row.get("role") or "").strip().lower()
    if role.startswith("lessor_"):
        return "lessor_leases"
    text = _norm(
        row.get("section"),
        row.get("category"),
        row.get("subcategory"),
        role,
        _tb_name(row),
    )

    if standard in ("IAS16", "IAS38", "IAS40"):
        return "assets"

    if standard == "IFRS16":
        return "leases"

    if standard == "IFRS9":
        return "ifrs9"

    if standard == "IFRS15":
        if any(x in text for x in (
            "deferred income",
            "contract liability",
            "contract asset",
            "unbilled revenue",
        )):
            return "accrual_deferral"
        return "revenue"

    if role in (
        "prepaid_expense",
        "deferred_income",
        "accrued_expense",
        "accrued_income",
    ):
        return "accrual_deferral"

    if "inventory" in text or standard == "IAS2":
        return "inventory"

    return "general_ledger"


def _deferred_tax_source_type(row: Dict[str, Any]) -> str:
    standard = _standard_code(row)
    role = str(row.get("role") or "").strip().lower()
    if role == "lessor_net_investment_current":
        return "finance_lease_receivable_current"

    if role == "lessor_net_investment_noncurrent":
        return "finance_lease_receivable_noncurrent"

    if role == "lessor_accrued_rental":
        return "operating_lease_accrued_rental"

    if role == "lessor_initial_direct_cost_asset":
        return "lessor_initial_direct_cost_asset"
    text = _norm(
        row.get("section"),
        row.get("category"),
        row.get("subcategory"),
        role,
        _tb_name(row),
    )

    if standard == "IAS16":
        return "ppe"

    if standard == "IAS38":
        return "intangible_asset"

    if standard == "IAS40":
        return "investment_property"

    if standard == "IFRS16":
        if "liability" in text:
            return "lease_liability"
        return "right_of_use_asset"

    if role in (
        "prepaid_expense",
        "deferred_income",
        "accrued_expense",
        "accrued_income",
    ):
        return role

    if "deferred income" in text or "contract liability" in text:
        return "deferred_income"

    if "contract asset" in text or "unbilled revenue" in text:
        return "contract_asset"

    if "receivable" in text:
        return "receivable"

    if "payable" in text:
        return "payable"

    if "inventory" in text:
        return "inventory"

    if "provision" in text:
        return "provision"

    return "balance_sheet_account"
# ============================================================
# Builder v3: exact layout
# ============================================================

def build_balance_sheet_v3(
    *,
    company_id: int,
    as_of: date,
    date_from: Optional[date] = None,
    prior_as_of: Optional[date] = None,
    comparison_as_of_dates: Optional[List[date]] = None,
    get_company_context_fn=None,
    get_trial_balance_fn=None,
    get_pnl_full_fn=None,
    include_net_profit_line: bool = False,
    view: str = "external",
    basis: str = "external",
) -> Dict[str, Any]:

    ctx = get_company_context_fn(company_id) or {}
    currency = ctx.get("currency") or "USD"
    company_name = ctx.get("company_name") or ""

    organization_type = (
        ctx.get("organization_type")
        or ctx.get("organisation_type")
        or "private_company"
    ).strip().lower()

    EQUITY_LABELS = {
        "private_company": "Equity",
        "public_company": "Equity",
        "sole_trader": "Owner's Equity",
        "partnership": "Partners' Equity",
        "ngo": "Funds and Reserves",
        "npo": "Funds and Reserves",
        "trust": "Trust Funds",
        "cooperative": "Members' Equity",
        "body_corporate": "Funds and Reserves",
        "club_association": "Accumulated Funds",
        "government_entity": "Accumulated Surplus and Reserves",
        "other": "Equity",
    }

    equity_label = EQUITY_LABELS.get(organization_type, "Equity")

    view = (view or "external").lower()
    if view not in ("external", "internal"):
        view = "external"

    # --------------------------------------------------
    # Comparison date setup
    # --------------------------------------------------
    if comparison_as_of_dates:
        comparison_as_of_dates = [
            d for d in comparison_as_of_dates
            if d is not None
        ]
    else:
        comparison_as_of_dates = [as_of]
        if prior_as_of:
            comparison_as_of_dates.append(prior_as_of)

    # remove duplicates while keeping order
    seen_dates = set()
    clean_dates = []
    for d in comparison_as_of_dates:
        key = d.isoformat() if hasattr(d, "isoformat") else str(d)
        if key not in seen_dates:
            seen_dates.add(key)
            clean_dates.append(d)

    comparison_as_of_dates = clean_dates or [as_of]

    # make sure current as_of is first
    if comparison_as_of_dates[0] != as_of:
        comparison_as_of_dates = [as_of] + [
            d for d in comparison_as_of_dates if d != as_of
        ]

    has_prior = len(comparison_as_of_dates) > 1
    effective_prior_as_of = comparison_as_of_dates[1] if has_prior else None

    # --------------------------------------------------
    # TB rows for all selected dates
    # --------------------------------------------------
    tb_rows_by_key: Dict[str, List[Dict[str, Any]]] = {}
    tb_maps_by_key: Dict[str, Dict[str, Dict[str, Any]]] = {}

    period_keys: List[str] = []

    for idx, d_to in enumerate(comparison_as_of_dates):
        key = "cur" if idx == 0 else f"p{idx}"
        period_keys.append(key)

        rows = get_trial_balance_fn(company_id, None, d_to) or []
        rows = split_cash_and_overdraft(rows)

        tb_rows_by_key[key] = rows
        tb_maps_by_key[key] = _tb_maps(rows)

    cur_rows = tb_rows_by_key.get("cur", [])
    cur_by = tb_maps_by_key.get("cur", {})

    pri_rows = tb_rows_by_key.get("p1", []) if has_prior else []
    pri_by = tb_maps_by_key.get("p1", {}) if has_prior else {}

    # --------------------------------------------------
    # Columns
    # Important:
    # keep cur/pri/delta for existing renderer compatibility.
    # Additional years can be exposed later as p2, p3, p4...
    # --------------------------------------------------
    if view == "external":
        columns = [{"key": "cur", "label": str(comparison_as_of_dates[0].year)}]

        if has_prior:
            columns.append({
                "key": "pri",
                "label": str(effective_prior_as_of.year),
            })
            columns.append({"key": "delta", "label": "Δ"})

        for idx, d in enumerate(comparison_as_of_dates[2:], start=2):
            columns.insert(-1 if has_prior else len(columns), {
                "key": f"p{idx}",
                "label": str(d.year),
            })

    else:
        columns = [
            {"key": "noncur", "label": "Non-current"},
            {"key": "cur", "label": "Current"},
            {"key": "total", "label": "Total"},
        ]

        if has_prior:
            columns.append({
                "key": "pri_total",
                "label": f"{effective_prior_as_of.year} Total",
            })

            for idx, d in enumerate(comparison_as_of_dates[2:], start=2):
                columns.append({
                    "key": f"p{idx}_total",
                    "label": f"{d.year} Total",
                })

            columns.append({"key": "delta", "label": "Δ"})

    # --------------------------------------------------
    # All account codes across all selected periods
    # --------------------------------------------------
    all_codes = set()
    for m in tb_maps_by_key.values():
        all_codes |= set(m.keys())

    def _vals_external(code: str, kind: str) -> Dict[str, float]:
        cur_amt = _bs_signed_amount(kind, cur_by.get(code, {}) or {})

        out = {"cur": float(cur_amt)}

        if has_prior:
            pri_amt = _bs_signed_amount(kind, pri_by.get(code, {}) or {})
            out["pri"] = float(pri_amt)

            # additional comparison years: p2, p3, p4...
            for idx in range(2, len(comparison_as_of_dates)):
                key = f"p{idx}"
                m = tb_maps_by_key.get(key, {})
                amt = _bs_signed_amount(kind, m.get(code, {}) or {})
                out[key] = float(amt)

            # delta remains current year minus first prior year
            out["delta"] = float(cur_amt - pri_amt)

        return out

    def _vals_internal(code: str, kind: str, row_any: Dict[str, Any]) -> Dict[str, float]:
        cur_amt = _bs_signed_amount(kind, cur_by.get(code, {}) or {})

        bucket_is_cur = _is_current_bucket(row_any, kind)
        if bucket_is_cur is None:
            bucket_is_cur = False

        noncur = float(cur_amt) if not bucket_is_cur else 0.0
        cur = float(cur_amt) if bucket_is_cur else 0.0
        total = noncur + cur

        out = {
            "noncur": float(noncur),
            "cur": float(cur),
            "total": float(total),
        }

        if has_prior:
            pri_amt = _bs_signed_amount(kind, pri_by.get(code, {}) or {})
            out["pri_total"] = float(pri_amt)

            for idx in range(2, len(comparison_as_of_dates)):
                key = f"p{idx}"
                total_key = f"{key}_total"
                m = tb_maps_by_key.get(key, {})
                amt = _bs_signed_amount(kind, m.get(code, {}) or {})
                out[total_key] = float(amt)

            out["delta"] = float(total - pri_amt)

        return out

    def _period_is_closed_from_tb() -> bool:
        ref = f"YEC-{as_of.isoformat()}"

        for row in cur_rows:
            row_ref = str(row.get("ref") or row.get("journal_ref") or "").strip()
            source = str(row.get("source") or "").strip().lower()

            if row_ref == ref or source in ("year_end", "year_end_close"):
                return True

        # fallback: retained earnings has movement and PL still has P&L result
        return False

    def _make_line(
        code: str,
        name: str,
        values: Dict[str, float],
        row_any: Dict[str, Any],
        *,
        is_contra: bool,
    ) -> Dict[str, Any]:
        return {
            "code": code,
            "name": name,
            "values": values,
            "is_contra": bool(is_contra),
            "meta": {
                "section": row_any.get("section"),
                "category": row_any.get("category"),
                "subcategory": row_any.get("subcategory"),
                "standard": (
                    row_any.get("standard")
                    or row_any.get("ifrs_tag")
                    or row_any.get("std_tag")
                    or None
                ),
                "role": row_any.get("role"),
                "source_module": _deferred_tax_source_module(row_any),
                "source_type": _deferred_tax_source_type(row_any),
            },
        }

    # -------------------------
    # Collect lines into layout buckets
    # -------------------------
    nca_other: List[Dict[str, Any]] = []
    ca_lines: List[Dict[str, Any]] = []

    cl_lines: List[Dict[str, Any]] = []
    ncl_lines: List[Dict[str, Any]] = []
    eq_lines: List[Dict[str, Any]] = []

    # internal grouping buckets (only used for internal view)
    invprop_lines: List[Dict[str, Any]] = []
    ppe_lines: List[Dict[str, Any]] = []
    rou_lines: List[Dict[str, Any]] = []
    intang_lines: List[Dict[str, Any]] = []
    nca_other_lines: List[Dict[str, Any]] = []  # replaces/extends nca_other usage for internal

    # PPE rollup
    ppe_cost_cur = 0.0
    ppe_acc_cur  = 0.0
    ppe_cost_pri = 0.0
    ppe_acc_pri  = 0.0

    # ROU rollup (IFRS 16)
    rou_cost_cur = 0.0
    rou_acc_cur  = 0.0
    rou_cost_pri = 0.0
    rou_acc_pri  = 0.0

    for code in sorted(all_codes):
        row_any = cur_by.get(code) or pri_by.get(code) or {}
        kind = _classify_kind(row_any)
        if kind not in ("asset", "liability", "equity"):
            continue

        name = _tb_name(row_any)
        is_contra = _is_contra_row(row_any)

        # -------------------------------------------------
        # ✅ Rollups ONLY for external view
        # Internal view should show actual TB accounts
        # -------------------------------------------------

        # 1) ROU rollup FIRST (external only)
        if view == "external" and kind == "asset" and (
            _is_rou_asset(row_any, ctx) or _is_rou_accum_dep(row_any, ctx)
        ):
            cur_amt = _bs_signed_amount("asset", cur_by.get(code, {}) or {})
            pri_amt = _bs_signed_amount("asset", pri_by.get(code, {}) or {}) if has_prior else 0.0

            if _is_rou_accum_dep(row_any, ctx):
                rou_acc_cur += abs(float(cur_amt))
                if has_prior:
                    rou_acc_pri += abs(float(pri_amt))
            else:
                rou_cost_cur += float(cur_amt)
                if has_prior:
                    rou_cost_pri += float(pri_amt)

            continue

        # 2) PPE rollup (external only) - after ROU
        name_l = (_tb_name(row_any) or "").lower()
        is_ppe_cost = _is_ppe(row_any)
        is_ppe_acc  = _is_accum_dep(row_any) or ("accumulated depreciation" in name_l)

        if view == "external" and kind == "asset" and (is_ppe_cost or is_ppe_acc):
            if is_ppe_acc:
                cur_amt = _tb_credit(cur_by.get(code, {}) or {}) - _tb_debit(cur_by.get(code, {}) or {})
                pri_amt = (
                    _tb_credit(pri_by.get(code, {}) or {}) - _tb_debit(pri_by.get(code, {}) or {})
                ) if has_prior else 0.0
            else:
                cur_amt = _tb_debit(cur_by.get(code, {}) or {}) - _tb_credit(cur_by.get(code, {}) or {})
                pri_amt = (
                    _tb_debit(pri_by.get(code, {}) or {}) - _tb_credit(pri_by.get(code, {}) or {})
                ) if has_prior else 0.0

            if is_ppe_acc:
                ppe_acc_cur += abs(cur_amt)
                if has_prior:
                    ppe_acc_pri += abs(pri_amt)
            else:
                ppe_cost_cur += float(cur_amt)
                if has_prior:
                    ppe_cost_pri += float(pri_amt)

            continue

        # --- INTERNAL VIEW: force accumulated depreciation to Acc Dep column (middle) and negative ---
        if view == "internal" and kind == "asset":
            name_l = (name or "").lower()
            is_acc = _is_accum_dep(row_any) or ("accumulated depreciation" in name_l)
            is_acc = is_acc or _is_rou_accum_dep(row_any, ctx)

            if is_acc:
                cur_amt = float(_bs_signed_amount("asset", cur_by.get(code, {}) or {}))
                pri_amt = float(_bs_signed_amount("asset", pri_by.get(code, {}) or {})) if has_prior else 0.0

                cur_amt = -abs(cur_amt)
                pri_amt = -abs(pri_amt) if has_prior else 0.0

                values = {"noncur": 0.0, "cur": cur_amt, "total": cur_amt}
                if has_prior:
                    values["pri_total"] = pri_amt
                    values["delta"] = float(cur_amt - pri_amt)

                line = _make_line(code, name, values, row_any, is_contra=False)

                if _is_investment_property(row_any):
                    invprop_lines.append(line)
                elif _is_rou_asset(row_any, ctx) or _is_rou_accum_dep(row_any, ctx):
                    rou_lines.append(line)
                elif _is_ppe(row_any):   # <-- recommended (no need for "or _is_accum_dep" here)
                    ppe_lines.append(line)
                elif _is_intangible(row_any):
                    intang_lines.append(line)
                else:
                    nca_other_lines.append(line)
                continue

        # NORMAL path (runs for everything else)
        values = _vals_external(code, kind) if view == "external" else _vals_internal(code, kind, row_any)
        line = _make_line(code, name, values, row_any, is_contra=is_contra)

        if kind == "asset":
            is_cur = _is_current_bucket(row_any, kind)

            if is_cur is True:
                ca_lines.append(line)
            else:
                # ✅ NON-CURRENT asset line
                if view == "internal":
                    # route into internal subgroups
                    if _is_investment_property(row_any):
                        invprop_lines.append(line)
                    elif _is_rou_asset(row_any, ctx) or _is_rou_accum_dep(row_any, ctx):
                        rou_lines.append(line)
                    elif _is_ppe(row_any):
                        # PPE incl accum dep (but ROU already caught above)
                        ppe_lines.append(line)
                    elif _is_intangible(row_any):
                        intang_lines.append(line)
                    else:
                        nca_other_lines.append(line)
                else:
                    # external: keep your normal list (since rollups already consumed PPE/ROU)
                    nca_other.append(line)

        elif kind == "liability":
            is_cur = _is_current_bucket(row_any, kind)
            if is_cur is True:
                cl_lines.append(line)
            else:
                ncl_lines.append(line)

        else:
            eq_lines.append(line)

    # PPE rollup line + table (EXTERNAL ONLY)
    # PPE / ROU rollup defaults
    ppe_line = None
    ppe_carry_cur = 0.0
    ppe_carry_pri = 0.0

    rou_line = None
    rou_carry_cur = 0.0
    rou_carry_pri = 0.0

    if view == "external":
        ppe_carry_cur = float(ppe_cost_cur - ppe_acc_cur)
        ppe_carry_pri = float(ppe_cost_pri - ppe_acc_pri) if has_prior else 0.0

        ppe_values = {"cur": ppe_carry_cur} if not has_prior else {
            "cur": ppe_carry_cur,
            "pri": ppe_carry_pri,
            "delta": ppe_carry_cur - ppe_carry_pri,
        }

        ppe_table = {
            "label": "Property, plant and equipment",
            "columns": ["Cost", "Acc Dep", "Carrying"],
            "values": {
                "cur": {"cost": float(ppe_cost_cur), "acc_dep": float(ppe_acc_cur), "carrying": float(ppe_carry_cur)},
                "pri": {"cost": float(ppe_cost_pri), "acc_dep": float(ppe_acc_pri), "carrying": float(ppe_carry_pri)} if has_prior else None,
            },
        }

        ppe_line = {
            "code": "PPE",
            "name": "Property, plant and equipment",
            "values": ppe_values,
            "is_contra": False,
            "meta": {
                "standard": "IAS 16",
                "section": "Property, Plant & Equipment",
                "category": "Non-current assets",
                "role": "ppe",
                "source_module": "assets",
                "source_type": "ppe",
            },
            "ppe_table": ppe_table,
        }

        # -------------------------
        # ROU line + table (EXTERNAL ONLY)
        # -------------------------
        rou_carry_cur = float(rou_cost_cur - rou_acc_cur)
        rou_carry_pri = float(rou_cost_pri - rou_acc_pri) if has_prior else 0.0

        rou_line = None
        if view == "external":
            rou_values = {"cur": rou_carry_cur} if not has_prior else {
                "cur": rou_carry_cur, "pri": rou_carry_pri, "delta": rou_carry_cur - rou_carry_pri
            }

            rou_table = {
                "label": "Right-of-use assets",
                "columns": ["Cost", "Acc Dep", "Carrying"],
                "values": {
                    "cur": {"cost": float(rou_cost_cur), "acc_dep": float(rou_acc_cur), "carrying": float(rou_carry_cur)},
                    "pri": {"cost": float(rou_cost_pri), "acc_dep": float(rou_acc_pri), "carrying": float(rou_carry_pri)} if has_prior else None
                }
            }

            rou_line = {
                "code": "ROU",
                "name": "Right-of-use assets",
                "values": rou_values,
                "is_contra": False,
                "meta": {
                    "standard": "IFRS 16",
                    "section": "Right-of-use assets",
                    "category": "Non-current assets",
                    "role": "right_of_use_asset",
                    "source_module": "leases",
                    "source_type": "right_of_use_asset",
                },
                "rou_table": rou_table,
            }

    # -------------------------
    # Build Non-current assets AFTER PPE + ROU exist
    # -------------------------
    if view == "external":
        non_current_assets = (
            ([] if abs(ppe_carry_cur) < 1e-9 else [ppe_line]) +
            ([] if abs(rou_carry_cur) < 1e-9 else [rou_line]) +
            nca_other
        )
    else:
        non_current_assets = []

        if invprop_lines:
            non_current_assets += [_make_header("Investment property")] + invprop_lines
        if ppe_lines:
            non_current_assets += [_make_header("Property, plant and equipment")] + ppe_lines
        if rou_lines:
            non_current_assets += [_make_header("Right-of-use assets")] + rou_lines
        if intang_lines:
            non_current_assets += [_make_header("Intangible assets")] + intang_lines
        if nca_other_lines:
            non_current_assets += [_make_header("Other non-current assets")] + nca_other_lines
            

    # Optional net profit plug line (only if requested)
    period_closed = _period_is_closed_from_tb()

    if include_net_profit_line and get_pnl_full_fn is not None and not period_closed:
        # --- current year-to-date (YTD) ---
        ytd_from = date_from

        if not ytd_from:
            fy = parse_date_maybe(ctx.get("fin_year_start")) or date(as_of.year, 4, 1)
            ytd_from = fin_year_start_for_as_of(as_of, fy)

        pnl_cur = get_pnl_full_fn(company_id, ytd_from, as_of) or {}
        print("Net result:", pnl_cur.get("net_result"))
        net_obj_cur = pnl_cur.get("net_result") or {}
        net_cur = float(
            net_obj_cur.get("amount")
            or (net_obj_cur.get("values") or {}).get("cur")
            or 0.0
        )

        # --- prior year-to-date ---
        net_pri = 0.0
        if has_prior and prior_as_of:
            ytd_from_pri = fin_year_start_for_as_of(prior_as_of, fy)
            pnl_pri = get_pnl_full_fn(company_id, ytd_from_pri, prior_as_of) or {}

            net_obj_pri = pnl_pri.get("net_result") or {}
            net_pri = float(
                net_obj_pri.get("amount")
                or (net_obj_pri.get("values") or {}).get("cur")
                or 0.0
            )

        # only add profit/loss line if P&L is still open
        if abs(net_cur) > 0.01:
            if view == "external":
                v = {"cur": net_cur} if not has_prior else {
                    "cur": net_cur,
                    "pri": net_pri,
                    "delta": float(net_cur - net_pri),
                }
            else:
                v = {"noncur": 0.0, "cur": 0.0, "total": net_cur}
                if has_prior:
                    v["pri_total"] = net_pri
                    v["delta"] = float(net_cur - net_pri)

            eq_lines.append({
                "code": "NET_PROFIT",
                "name": "Profit/(loss) for the year to date",
                "values": v,
                "is_contra": False,
                "meta": {"is_plug": True, "source": "pnl_ytd"},
            })

    # -------------------------
    # Hide zero lines for external reporting only
    # -------------------------
    if view == "external":
        non_current_assets = rh.filter_zero_lines(non_current_assets)
        ca_lines = rh.filter_zero_lines(ca_lines)
        cl_lines = rh.filter_zero_lines(cl_lines)
        ncl_lines = rh.filter_zero_lines(ncl_lines)
        eq_lines = rh.filter_zero_lines(eq_lines)
        
    # -------------------------
    # Totals (contra-aware)
    # -------------------------
    def _getv(line: Dict[str, Any], k: str) -> float:
        # ignore header rows in totals
        if (line.get("meta") or {}).get("row_type") == "header":
            return 0.0

        v = float((line.get("values") or {}).get(k) or 0.0)
        return -v if line.get("is_contra") else v

    def _sum(lines: List[Dict[str, Any]]) -> Dict[str, float]:
        if view == "external":
            out = {
                "cur": float(sum(_getv(ln, "cur") for ln in lines))
            }

            if has_prior:
                out["pri"] = float(sum(_getv(ln, "pri") for ln in lines))

                for idx in range(2, len(comparison_as_of_dates)):
                    key = f"p{idx}"
                    out[key] = float(sum(_getv(ln, key) for ln in lines))

                out["delta"] = float(out["cur"] - out["pri"])

            return out

        out = {
            "noncur": float(sum(_getv(ln, "noncur") for ln in lines)),
            "cur": float(sum(_getv(ln, "cur") for ln in lines)),
            "total": float(sum(_getv(ln, "total") for ln in lines)),
        }

        if has_prior:
            out["pri_total"] = float(sum(_getv(ln, "pri_total") for ln in lines))

            for idx in range(2, len(comparison_as_of_dates)):
                key = f"p{idx}_total"
                out[key] = float(sum(_getv(ln, key) for ln in lines))

            out["delta"] = float(out["total"] - out["pri_total"])

        return out

    def _sum_vals(a: Dict[str, float], b: Dict[str, float]) -> Dict[str, float]:
        keys = set((a or {}).keys()) | set((b or {}).keys())
        out: Dict[str, float] = {}
        for k in keys:
            out[k] = float((a or {}).get(k, 0.0) or 0.0) + float((b or {}).get(k, 0.0) or 0.0)
        return out

    def _sub_vals(a: Dict[str, float], b: Dict[str, float]) -> Dict[str, float]:
        keys = set((a or {}).keys()) | set((b or {}).keys())
        out: Dict[str, float] = {}
        for k in keys:
            out[k] = float((a or {}).get(k, 0.0) or 0.0) - float((b or {}).get(k, 0.0) or 0.0)
        return out

    if view == "external":
        print("PPE COST :", ppe_cost_cur)
        print("PPE ACC  :", ppe_acc_cur)
        print("PPE CARRY:", ppe_carry_cur)

    for ln in non_current_assets:
        print(
            ln.get("code"),
            ln.get("name"),
            ln.get("values", {}).get("cur"),
            ln.get("is_contra")
        )
    tot_nca = _sum(non_current_assets)
    tot_ca = _sum(ca_lines)
    tot_assets = _sum_vals(tot_nca, tot_ca)

    tot_cl = _sum(cl_lines)
    tot_ncl = _sum(ncl_lines)
    tot_eq = _sum(eq_lines)

    tot_liab = _sum_vals(tot_cl, tot_ncl)
    tot_eql = _sum_vals(tot_liab, tot_eq)

    diff = _sub_vals(tot_assets, tot_eql)

    effective_prior_as_of = comparison_as_of_dates[1] if has_prior else None

    nca_col_labels = None
    if view == "internal":
        nca_col_labels = {"noncur": "Cost", "cur": "Acc Dep", "total": "Carrying"}
        
    return {
        "meta": {
            "company_id": company_id,
            "company_name": company_name,
            "currency": currency,
            "statement": "bs",
            "basis": basis,
            "view": view,
            "as_of": as_of.isoformat(),
            "prior_as_of": effective_prior_as_of.isoformat() if effective_prior_as_of else None,
            "layout": "bs_layout_v3_exact",
        },
        "columns": columns,

        "assets": {
            "non_current_assets": {
                "label": "Non-current assets",
                "col_labels": nca_col_labels,   # ✅ NEW
                "lines": non_current_assets,
                "totals": tot_nca,
            },
            "current_assets": {
                "label": "Current assets",
                "lines": ca_lines,
                "totals": tot_ca,
            },
            "totals": {
                "label": "Total assets",
                "values": tot_assets,
            },
        },

        "equity_and_liabilities": {
            "current_liabilities": {
                "label": "Current liabilities",
                "lines": cl_lines,
                "totals": tot_cl,
            },
            "non_current_liabilities": {
                "label": "Non-current liabilities",
                "lines": ncl_lines,
                "totals": tot_ncl,
            },
            "equity": {
                "label": equity_label,
                "lines": eq_lines,
                "totals": tot_eq,
            },
            "totals": {
                "label": "Total equity and liabilities",
                "values": tot_eql,
            },
        },

        "balance_check": {
            "label": "Assets - (Equity + Liabilities)",
            "values": diff,
        },
    }

def _candidate_carrying_amount(
    line: Dict[str, Any],
) -> float:
    ppe_current = (
        line.get("ppe_table", {})
        .get("values", {})
        .get("cur")
    )

    if ppe_current:
        return float(ppe_current.get("carrying") or 0)

    rou_current = (
        line.get("rou_table", {})
        .get("values", {})
        .get("cur")
    )

    if rou_current:
        return float(rou_current.get("carrying") or 0)

    values = line.get("values") or {}

    if values.get("cur") is not None:
        return float(values.get("cur") or 0)

    if values.get("total") is not None:
        return float(values.get("total") or 0)

    return 0.0

def extract_deferred_tax_candidates(
    balance_sheet: Dict[str, Any],
) -> List[Dict[str, Any]]:
    candidates: List[Dict[str, Any]] = []

    sections = (
        (
            "current_assets",
            "asset",
            balance_sheet.get("assets", {}).get(
                "current_assets",
                {},
            ),
        ),
        (
            "non_current_assets",
            "asset",
            balance_sheet.get("assets", {}).get(
                "non_current_assets",
                {},
            ),
        ),
        (
            "current_liabilities",
            "liability",
            balance_sheet.get(
                "equity_and_liabilities",
                {},
            ).get("current_liabilities", {}),
        ),
        (
            "non_current_liabilities",
            "liability",
            balance_sheet.get(
                "equity_and_liabilities",
                {},
            ).get("non_current_liabilities", {}),
        ),
    )

    for section_name, balance_type, section in sections:
        for line in section.get("lines", []) or []:
            meta = line.get("meta") or {}

            if meta.get("row_type") == "header":
                continue

            carrying_amount = _candidate_carrying_amount(line)

            if abs(carrying_amount) < 0.005:
                continue

            candidates.append({
                "account_code": line.get("code"),
                "description": line.get("name"),
                "balance_type": balance_type,
                "carrying_amount": carrying_amount,
                "standard": meta.get("standard"),
                "role": meta.get("role"),
                "source_module": (
                    meta.get("source_module")
                    or "general_ledger"
                ),
                "source_type": (
                    meta.get("source_type")
                    or "balance_sheet_account"
                ),
                "section": section_name,
                "category": meta.get("category"),
                "subcategory": meta.get("subcategory"),
                "is_contra": bool(line.get("is_contra")),
                "source_json": line,
            })

    return candidates