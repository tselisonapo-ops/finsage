# BackEnd/Services/reporting/balance_sheet_builder_v3.py
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from BackEnd.Services.reporting.tb_helpers import split_cash_and_overdraft
from BackEnd.Services.accounting_classifiers import _is_contra_row
from BackEnd.Services.periods import parse_date_maybe

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
    name = str(_tb_name(row) or "").strip().lower()

    # Exclude ROU and investment property from IAS 16 PPE rollup
    if "right-of-use" in name or "right of use" in name or "rou" in name:
        return False
    if "investment property" in name or "ias 40" in tag:
        return False

    # Strict PPE bucket
    if category == "property, plant & equipment":
        return True

    if category in ("property, plant and equipment", "ppe"):
        return True

    # IAS 16 fallback only if it is an asset cost account, not depreciation/impairment
    if "IAS 16" in tag and section in ("asset", "assets"):
        if "accum" in name or "depreciation" in name or "impairment" in name:
            return False
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

# ============================================================
# Builder v3: exact layout
# ============================================================

def build_balance_sheet_v3(
    *,
    company_id: int,
    as_of: date,
    prior_as_of: Optional[date],
    get_company_context_fn,
    get_trial_balance_fn,
    get_pnl_full_fn=None,                 # optional
    include_net_profit_line: bool = False,
    view: str = "external",               # external | internal
    basis: str = "external",              # meta only
) -> Dict[str, Any]:

    ctx = get_company_context_fn(company_id) or {}
    currency = ctx.get("currency") or "ZAR"
    company_name = ctx.get("company_name") or ""

    view = (view or "external").lower()
    if view not in ("external", "internal"):
        view = "external"

    # -------------------------
    # TB rows (fetch first)
    # -------------------------
    cur_rows = get_trial_balance_fn(company_id, None, as_of) or []

    pri_rows = []
    if prior_as_of:
        pri_rows = get_trial_balance_fn(company_id, None, prior_as_of) or []

    # Normalise cash/overdraft split
    cur_rows = split_cash_and_overdraft(cur_rows)
    if pri_rows:
        pri_rows = split_cash_and_overdraft(pri_rows)

    # ✅ Decide has_prior based on actual prior data
    has_prior = bool(prior_as_of and pri_rows)

    # -------------------------
    # Columns (build AFTER has_prior)
    # -------------------------
    if view == "external":
        columns = [{"key": "cur", "label": "Amount"}]
        if has_prior:
            columns += [{"key": "pri", "label": "Prior"}, {"key": "delta", "label": "Δ"}]
    else:
        columns = [
            {"key": "noncur", "label": "Non-current"},
            {"key": "cur", "label": "Current"},
            {"key": "total", "label": "Total"},
        ]
        if has_prior:
            columns += [{"key": "pri_total", "label": "Prior (Total)"}, {"key": "delta", "label": "Δ"}]

    # maps
    cur_by = _tb_maps(cur_rows)
    pri_by = _tb_maps(pri_rows) if has_prior else {}

    if has_prior:
        # ✅ only keep prior if there is any meaningful delta
        tol = 1e-9
        def _net(m):
            return sum(float((r or {}).get("closing_balance") or 0.0) for r in m.values())

        if abs(_net(cur_by) - _net(pri_by)) < tol:
            has_prior = False
            pri_by = {}
            all_codes = set(cur_by.keys())
            # rebuild columns (since has_prior changed)
            if view == "external":
                columns = [{"key": "cur", "label": "Amount"}]
            else:
                columns = [
                    {"key": "noncur", "label": "Non-current"},
                    {"key": "cur", "label": "Current"},
                    {"key": "total", "label": "Total"},
                ]

    all_codes = set(cur_by.keys()) | set(pri_by.keys())

    def _vals_external(code: str, kind: str) -> Dict[str, float]:
        cur_amt = _bs_signed_amount(kind, cur_by.get(code, {}) or {})
        if not has_prior:
            return {"cur": float(cur_amt)}
        pri_amt = _bs_signed_amount(kind, pri_by.get(code, {}) or {})
        return {"cur": float(cur_amt), "pri": float(pri_amt), "delta": float(cur_amt - pri_amt)}

    def _vals_internal(code: str, kind: str, row_any: Dict[str, Any]) -> Dict[str, float]:
        cur_amt = _bs_signed_amount(kind, cur_by.get(code, {}) or {})
        pri_amt = _bs_signed_amount(kind, pri_by.get(code, {}) or {}) if has_prior else 0.0

        bucket_is_cur = _is_current_bucket(row_any, kind)
        if bucket_is_cur is None:
            # safe fallback: treat unknown assets/liabs as non-current
            bucket_is_cur = False

        noncur = float(cur_amt) if not bucket_is_cur else 0.0
        cur = float(cur_amt) if bucket_is_cur else 0.0
        total = noncur + cur

        out = {"noncur": noncur, "cur": cur, "total": total}
        if has_prior:
            out["pri_total"] = float(pri_amt)
            out["delta"] = float(total - pri_amt)
        return out

    def _make_line(code: str, name: str, values: Dict[str, float], row_any: Dict[str, Any], *, is_contra: bool) -> Dict[str, Any]:
        return {
            "code": code,
            "name": name,
            "values": values,
            "is_contra": bool(is_contra),
            "meta": {
                "section": row_any.get("section"),
                "category": row_any.get("category"),
                "standard": row_any.get("standard") or row_any.get("ifrs_tag") or row_any.get("std_tag") or None,
            }
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
            cur_amt = _raw_close(cur_by.get(code, {}) or {})
            pri_amt = _raw_close(pri_by.get(code, {}) or {}) if has_prior else 0.0

            if is_ppe_acc:
                ppe_acc_cur += abs(cur_amt)
                if has_prior:
                    ppe_acc_pri += abs(pri_amt)
            else:
                ppe_cost_cur += cur_amt
                if has_prior:
                    ppe_cost_pri += pri_amt
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
    ppe_line = None  # default for internal view

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
            "meta": {"standard": "IAS 16", "section": "Property, Plant & Equipment"},
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
                "meta": {"standard": "IFRS 16", "section": "Right-of-use assets"},
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
    if include_net_profit_line and get_pnl_full_fn is not None:
        # --- current year-to-date (YTD) ---
        fy = parse_date_maybe(ctx.get("fin_year_start")) or date(as_of.year, 3, 1)

        ytd_from = fin_year_start_for_as_of(as_of, fy)
        pnl_cur = get_pnl_full_fn(company_id, ytd_from, as_of) or {}

        net_obj_cur = pnl_cur.get("net_result") or {}
        net_cur = float(
            net_obj_cur.get("amount")
            or (net_obj_cur.get("values") or {}).get("cur")
            or 0.0
        )

        # --- prior year-to-date (only if prior_as_of exists) ---
        net_pri = 0.0
        if has_prior and prior_as_of:
            ytd_from_pri = fin_year_start_for_as_of(prior_as_of, fy)  # ✅ FY-aware
            pnl_pri = get_pnl_full_fn(company_id, ytd_from_pri, prior_as_of) or {}

            net_obj_pri = pnl_pri.get("net_result") or {}
            net_pri = float(
                net_obj_pri.get("amount")
                or (net_obj_pri.get("values") or {}).get("cur")
                or 0.0
            )

        # --- build values for BS columns ---
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

        # --- append equity plug line ---
        eq_lines.append({
            "code": "NET_PROFIT",
            "name": "Profit/(loss) for the year to date",
            "values": v,
            "is_contra": False,
            "meta": {"is_plug": True, "source": "pnl_ytd"},
        })

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
            cur = sum(_getv(ln, "cur") for ln in lines)
            if not has_prior:
                return {"cur": float(cur)}
            pri = sum(_getv(ln, "pri") for ln in lines)
            return {"cur": float(cur), "pri": float(pri), "delta": float(cur - pri)}

        noncur = sum(_getv(ln, "noncur") for ln in lines)
        cur = sum(_getv(ln, "cur") for ln in lines)
        total = sum(_getv(ln, "total") for ln in lines)
        out = {"noncur": float(noncur), "cur": float(cur), "total": float(total)}
        if has_prior:
            pri_total = sum(_getv(ln, "pri_total") for ln in lines)
            out["pri_total"] = float(pri_total)
            out["delta"] = float(total - pri_total)
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

    tot_nca = _sum(non_current_assets)
    tot_ca = _sum(ca_lines)
    tot_assets = _sum_vals(tot_nca, tot_ca)

    tot_cl = _sum(cl_lines)
    tot_ncl = _sum(ncl_lines)
    tot_eq = _sum(eq_lines)

    tot_liab = _sum_vals(tot_cl, tot_ncl)
    tot_eql = _sum_vals(tot_liab, tot_eq)

    diff = _sub_vals(tot_assets, tot_eql)

    effective_prior_as_of = prior_as_of if has_prior else None

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
                "label": "Equity",
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
