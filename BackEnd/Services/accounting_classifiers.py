# BackEnd/Services/accounting_classifiers.py
from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, List
import re

# ============================================================
# Module constants / helpers
# ============================================================

BUCKET_BASE = {
    # Balance Sheet
    "BS_CA": 1000,
    "BS_NCA": 1100,
    "BS_CL": 2000,
    "BS_NCL": 2400,
    "BS_EQ": 3000,

    # Profit & Loss – Revenue
    "PL_REV": 4000,
    "PL_GNT": 4050,
    "PL_DON": 4100,
    "PL_OI": 4300,

    # Profit & Loss – Costs
    "PL_COS": 5000,
    "PL_OPEX": 6000,
    "PL_DA": 7100,
    "PL_FIN": 7200,

    # Profit & Loss – Adjustments
    "PL_ADJ": 8000,

    # ✅ Profit & Loss – Contra Revenue (shares 8000 range)
    "PL_REV_ADJ": 8000,
}

def _make_reporting_code(bucket: str, n: int) -> str:
    """
    Example:
      bucket="PL_OPEX", n=6002 -> "PL_OPEX_6002"
    """
    return f"{bucket}_{n}"


# ============================================================
# Text + basic field accessors
# ============================================================

def _norm_text(*parts: Any) -> str:
    """Lowercase, strip, join text parts for fuzzy matching."""
    return " ".join(str(p or "").strip().lower() for p in parts if p is not None)


def _tb_debit(row: Dict[str, Any]) -> float:
    """
    Supports both TB shapes:
      - debit/credit
      - debit_total/credit_total
    """
    v = row.get("debit_total")
    if v is None:
        v = row.get("debit")
    return float(v or 0.0)


def _tb_credit(row: Dict[str, Any]) -> float:
    v = row.get("credit_total")
    if v is None:
        v = row.get("credit")
    return float(v or 0.0)


def _account_code(row: Dict[str, Any]) -> str:
    return str(row.get("account") or row.get("account_code") or row.get("code") or "").strip()


def _account_name(row: Dict[str, Any]) -> str:
    # never return empty; fall back to code
    return str(
        row.get("account_name")
        or row.get("name")
        or row.get("account")
        or row.get("account_code")
        or row.get("code")
        or ""
    ).strip()


def _tb_key(row: Dict[str, Any]) -> str:
    """Stable key for TB rows."""
    return str(row.get("code") or row.get("account") or "").strip()


def _name(row: Dict[str, Any]) -> str:
    return str(row.get("name") or row.get("account_name") or _tb_key(row) or "").strip()


# ============================================================
# Standard / IFRS tag + row text
# ============================================================

def _std_tag(row: Dict[str, Any]) -> str:
    """
    Return standard/IFRS tag for an account if present.
    Supports multiple possible field names (including inside meta).
    """
    v = row.get("standard") or row.get("std_tag") or row.get("ifrs_tag")
    if isinstance(v, str) and v.strip():
        return v.strip()

    meta = row.get("meta") or {}
    v2 = meta.get("standard") or meta.get("std_tag") or meta.get("ifrs_tag")
    if isinstance(v2, str) and v2.strip():
        return v2.strip()

    return ""


def _row_text(row: Dict[str, Any]) -> str:
    """Normalized row text for matching."""
    return _norm_text(
        row.get("section"),
        row.get("category"),
        row.get("name"),
        row.get("account_name"),
        _std_tag(row),
    )


# ============================================================
# Core TB classifier (supports new code_family + legacy)
# ============================================================

def _parse_code_int(row: Dict[str, Any]) -> int:
    """
    Parse leading digits from code, supports:
      - "2105"
      - "BS_CA_1000" (returns 1000)
      - "1000_bank"  (returns 1000)
    """
    s = (_account_code(row) or _tb_key(row) or "").strip()
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


def _code_family(row: Dict[str, Any]) -> str:
    """
    Returns canonical family if present:
      - row["code_family"] (preferred)
      - inferred from code like "BS_CA_1000" -> "BS_CA"
    """
    fam = (row.get("code_family") or "").upper().strip()
    if fam:
        return fam

    code = str(row.get("code") or row.get("account") or "").strip().upper()
    parts = code.split("_")
    # BS_CA_1000 -> BS_CA
    if len(parts) >= 2 and parts[0] in ("BS", "PL"):
        return f"{parts[0]}_{parts[1]}"
    return ""


def _classify_tb_row(row: Dict[str, Any]) -> str:
    """
    Returns one of:
      asset | liability | equity | revenue | cogs | expense | other
    """

    # 1) NEW SYSTEM — code_family (authoritative)
    family = _code_family(row) or ""   # <<< ensure not None

    if family.startswith("BS_"):
        if family in ("BS_CA", "BS_NCA"):
            return "asset"
        if family in ("BS_CL", "BS_NCL"):
            return "liability"
        if family == "BS_EQ":
            return "equity"

    if family.startswith("PL_"):
        if family.startswith(("PL_REV", "PL_GNT", "PL_DON", "PL_OI")):
            return "revenue"
        if family.startswith("PL_COS"):
            return "cogs"
        if family.startswith(("PL_OPEX", "PL_DA", "PL_FIN")):
            return "expense"
        if family.startswith("PL_ADJ"):
            return "other"

    # 2) LEGACY SAFETY — category + section heuristics
    sec = (row.get("section") or "").lower()
    cat = (row.get("category") or "").lower()
    nm = (row.get("name") or row.get("account_name") or "").lower()
    text = f"{sec} {cat} {nm}"

    if "asset" in cat:
        return "asset"
    if "liab" in cat:
        return "liability"
    if "equity" in cat:
        return "equity"

    if "income" in cat or "revenue" in cat or "sales" in cat:
        return "revenue"

    # 🔹 ADD THIS RIGHT HERE
    if "cost of sales" in cat or "cost of revenue" in cat or "cogs" in cat:
        return "cogs"

    if "expense" in cat:
        if "cost of sales" in sec or "cost of revenue" in sec or "cogs" in sec:
            return "cogs"
        return "expense"

    # Keyword safety net
    if any(k in text for k in ("receivable", "inventory", "cash", "bank", "ppe")):
        return "asset"
    if any(k in text for k in ("payable", "loan", "overdraft", "provision", "deferred")):
        return "liability"
    if any(k in text for k in ("retained earnings", "share capital", "reserve")):
        return "equity"

    # 3) LEGACY NUMERIC FALLBACK (deprecated)
    code_int = _parse_code_int(row)

    if 1000 <= code_int < 2000:
        return "asset"
    if 2000 <= code_int < 3000:
        return "liability"
    if 3000 <= code_int < 4000:
        return "equity"
    if 4000 <= code_int < 5000:
        return "revenue"
    if 5000 <= code_int < 6000:
        return "cogs"
    if 6000 <= code_int < 8000:
        return "expense"

    return "other"


def is_revenue_adjustment(row: Dict[str, Any]) -> bool:
    fam = _code_family(row)
    if fam == "PL_ADJ":
        return True

    text = _row_text(row)
    return any(k in text for k in (
        "sales returns", "returns & allowances", "discount", "refund", "credit note"
    ))

def _cf_bucket_from_text(name: str, category: str, section: str, subcategory: str = "", standard: str = "") -> str:
    t = " ".join([name or "", category or "", section or "", subcategory or "", standard or ""]).lower()

    # --- Cash & equivalents ---
    if any(k in t for k in ("petty cash", "cash & bank", "cash and bank", "cash at bank", "bank clearing", "suspense")):
        return "cash"

    # --- VAT / Tax working capital ---
    if "vat" in t and ("input" in t or "receivable" in t):
        return "vat_input"
    if "vat" in t and ("output" in t or "payable" in t):
        return "vat_output"
    if any(k in t for k in ("income tax payable", "provisional tax", "withholding", "paye")):
        return "tax_payable"
    if any(k in t for k in ("income tax receivable", "tax receivable")):
        return "tax_receivable"

    # --- Working capital ---
    if any(k in t for k in ("accounts receivable", "trade receivable", "debtors")) and "lease" not in t:
        return "receivables"
    if any(k in t for k in ("accounts payable", "trade payable", "creditor", "accrued", "accrual")):
        return "payables"
    if any(k in t for k in ("inventory", "stock", "closing stock", "opening stock")):
        return "inventory"
    if any(k in t for k in ("prepaid", "prepayment")):
        return "prepaids"
    if any(k in t for k in ("deposit paid", "deposits paid")):
        return "deposits_paid"
    if any(k in t for k in ("deferred revenue", "contract liability", "deferred income", "customer deposits")):
        return "deferred_revenue"

    # --- Debt / financing ---
    if "overdraft" in t:
        return "overdraft"
    if any(k in t for k in ("loan", "borrow", "debenture", "note payable", "hire purchase", "hp")):
        return "debt"

    # --- Leases ---
    if "lease liability" in t:
        return "lease_liability"
    if any(k in t for k in ("right-of-use", "right of use", "rou")):
        return "rou_asset"
    if "lease receivable" in t:
        return "lease_receivable"

    # --- Investing / capex ---
    if any(k in t for k in ("property, plant", "plant", "equipment", "ppe", "motor vehicle", "vehicles", "buildings", "land")):
        return "ppe"
    if any(k in t for k in ("intangible", "software license", "software licences", "goodwill")):
        return "intangible"
    if "investment property" in t:
        return "investment_property"
    if "long-term investment" in t or "investment" in t and "property" not in t:
        return "investment"

    # --- Non-cash addback hints (helps indirect later) ---
    if any(k in t for k in ("depreciation", "accumulated depreciation")):
        return "depreciation"
    if any(k in t for k in ("amortization", "amortisation", "accumulated amort")):
        return "amortization"

    return ""

def _cf_section_from_bucket(bucket: str) -> str:
    b = (bucket or "").lower()
    if b in ("cash",):
        return "none"

    if b in ("debt","overdraft","lease_liability","equity","dividends","owner_drawings","share_capital"):
        return "financing"

    if b in ("ppe","intangible","investment","investment_property","rou_asset","lease_receivable"):
        return "investing"

    # default for WC and everything else
    return "operating"

# ============================================================
# Signed amount rules (BS + P&L)
# ============================================================

def _bs_signed_amount(kind: str, row: Dict[str, Any]) -> float:
    """
    Balance Sheet sign convention:
      Assets:      debit - credit
      Liab/Equity: credit - debit
    """
    dr = _tb_debit(row)
    cr = _tb_credit(row)
    if kind == "asset":
        return dr - cr
    if kind in ("liability", "equity"):
        return cr - dr
    return 0.0


def _pnl_amount(row: Dict[str, Any]) -> float:
    """
    P&L sign convention (display-friendly):
      Revenue: credit - debit
      Costs/Expenses: debit - credit
    """
    kind = _classify_tb_row(row)
    dr = _tb_debit(row)
    cr = _tb_credit(row)
    if kind == "revenue":
        return cr - dr
    return dr - cr


# ============================================================
# Balance Sheet: IAS detectors & contra
# ============================================================

def _is_accum_dep_row(row: Dict[str, Any]) -> bool:
    text = _norm_text(row.get("category"), row.get("name"), row.get("account_name"))
    return ("accumulated" in text or "accum" in text) and ("depreciation" in text or "dep" in text)


def _is_ppe_row(row: Dict[str, Any]) -> bool:
    text = _norm_text(
        row.get("section"),
        row.get("category"),
        row.get("name"),
        row.get("account_name"),
        _std_tag(row),
    )
    tag = (_std_tag(row) or "").upper()

    # IAS-driven (strong)
    if "IAS 16" in tag:
        return True

    # Category / structure driven
    if any(k in text for k in (
        "property, plant and equipment",
        "property plant and equipment",
        "ppe",
        "fixed asset",
    )):
        return True

    # Soft fallback
    return any(k in text for k in ("plant", "machinery", "equipment", "vehicle", "motor"))


def _is_investment_property_row(row: Dict[str, Any]) -> bool:
    text = _row_text(row)
    tag = _std_tag(row).upper()
    if "IAS 40" in tag:
        return True
    return "investment property" in text


def _is_intangible_row(row: Dict[str, Any]) -> bool:
    text = _row_text(row)
    tag = _std_tag(row).upper()
    if "IAS 38" in tag:
        return True
    return any(k in text for k in ("intangible", "software", "licence", "license", "goodwill"))


def _is_biological_assets_row(row: Dict[str, Any]) -> bool:
    text = _row_text(row)
    tag = _std_tag(row).upper()
    if "IAS 41" in tag:
        return True
    return any(k in text for k in ("biological", "livestock", "crops", "agriculture", "bearer plants"))

def is_contra_row(row: Dict[str, Any]) -> bool:
    return _is_contra_row(row)


def _is_contra_row(row: dict) -> bool:
    """
    Contra detection WITHOUT numeric codes.
    Uses (in order):
      1) explicit is_contra flag (if present on COA)
      2) explicit 'contra-*' tokens in reporting_description/notes/description
      3) controlled section list
      4) strict keyword patterns gated by category
    """
    if not row:
        return False

    # 1) Explicit flag (source of truth)
    if bool(row.get("is_contra")):
        return True

    cat  = (row.get("category") or "").strip().lower()
    sec  = (row.get("section") or "").strip().lower()
    sub  = (row.get("reporting_description") or row.get("subcategory") or "").strip().lower()
    desc = (row.get("notes") or row.get("description") or "").strip().lower()
    name = (row.get("name") or row.get("account_name") or "").strip().lower()

    # ✅ Treat "Accumulated Depreciation" category as contra-asset bucket
    if "accumulated depreciation" in cat or "accum dep" in cat:
        return True

    # 2) Explicit tokens (precise)
    contra_tokens = ("contra-asset", "contra asset", "contra revenue", "contra inventory", "contra equity")
    if any(tok in sub for tok in contra_tokens) or any(tok in desc for tok in contra_tokens):
        return True

    # 3) Controlled sections (small and stable)
    contra_sections = {
        "accumulated depreciation",
        "accumulated amortization",
        "allowance for doubtful debts",
        "inventory write-down / obsolescence",
        "treasury stock",
        "accumulated depreciation - buildings",
        "accumulated depreciation - equipment",
    }
    if sec in contra_sections:
        return True

    # 4) Keyword fallback (strict + gated)
    if cat == "asset":
        if "accumulated depreciation" in name:
            return True
        if "accumulated amortization" in name or "accumulated amortisation" in name:
            return True

        # receivables allowances
        if name.startswith("allowance for ") and ("doubtful" in name or "impairment" in name or "ecl" in name):
            return True
        if "expected credit loss allowance" in name:
            return True

        # inventory contra
        if ("write-down" in name or "writedown" in name or "obsolescence" in name) and "inventory" in name:
            return True

    if cat == "equity":
        if "treasury stock" in name:
            return True

    if cat in ("adjustment", "income"):
        # only if clearly returns/allowances/discounts
        if ("returns" in name or "allowances" in name or "sales discount" in name) and ("contra" in sub or "contra" in desc):
            return True

    return False


def _pnl_bucket(row: Dict[str, Any], profile: Dict[str, Any]) -> str:
    kind = _classify_tb_row(row)
    text = _row_text(row)

    # Block BS rows
    if kind in ("asset", "liability", "equity"):
        return "IGNORE"

    # Exclude VAT/GST from P&L buckets
    if any(k in text for k in ("vat", "gst", "output vat", "input vat", "value added")):
        return "IGNORE"

    # Income tax only
    if ("income tax" in text) or ("corporate tax" in text) or ("ias 12" in text):
        return "TAX"

    # -------------------------
    # REVENUE (Sales + Deductions)
    # -------------------------
    if kind == "revenue":
        if any(k in text for k in ("discount", "return", "allowance", "rebate", "refund")):
            return "SALES_DEDUCTIONS"
        return "SALES"

    # -------------------------
    # TRADING / COGS (multi-step)
    # -------------------------
    if profile.get("uses_cogs") and kind == "cogs":
        # Inventory (begin/end)
        if "inventory" in text or "stock" in text:
            # Ending inventory / closing stock
            if any(k in text for k in ("ending", "closing", "close", "end of year", "year-end", "final")):
                return "INV_END"
            # Beginning inventory / opening stock
            if any(k in text for k in ("beginning", "opening", "open", "start", "b/f", "brought forward")):
                return "INV_BEGIN"
            # If you only have one inventory adjustment account, treat as ending by default (safer in practice)
            return "INV_END"

        # Purchases
        if "purchase" in text or "purchases" in text:
            if any(k in text for k in ("discount", "rebate")):
                return "PURCHASE_DISCOUNTS"
            if any(k in text for k in ("return", "returns", "allowance")):
                return "PURCHASE_RETURNS"
            return "PURCHASES"

        # Freight-in / carriage inwards
        if any(k in text for k in ("freight-in", "freight in", "carriage in", "carriage-in", "inbound freight", "import duty", "clearing")):
            return "FREIGHT_IN"

        # Some charts use "cost of sales" accounts for freight-in / purchases etc.
        # Keep unknown COGS here as fallback.
        return "COGS"

    # -------------------------
    # EXPENSES (Selling vs G&A)
    # -------------------------
    if kind == "expense":
        if any(k in text for k in ("selling", "distribution", "marketing", "advertising", "freight-out", "delivery", "commissions")):
            return "SELLING"
        return "GNA"

    # -------------------------
    # OTHER (interest, gains/losses, etc.)
    # -------------------------
    return "OTHER"



# ============================================================
# PPE grouping helper
# ============================================================

def _asset_group_name(name: str) -> str:
    s = (name or "").lower()
    if any(k in s for k in ("vehicle", "motor", "truck", "car", "bakkie")):
        return "Vehicles"
    if any(k in s for k in ("computer", "laptop", "server", "printer", "it")):
        return "IT Equipment"
    if any(k in s for k in ("furniture", "fittings", "fixtures")):
        return "Furniture & Fittings"
    if any(k in s for k in ("building", "office", "warehouse", "premises")):
        return "Buildings"
    if any(k in s for k in ("plant", "machine", "machinery", "equipment")):
        return "Plant & Equipment"
    return "Other PPE"


# ============================================================
# Cashflow helpers + cash position
# ============================================================

def _is_cash_bank(row: Dict[str, Any]) -> bool:
    meta = resolve_account_cf_meta(row)
    if meta["bucket"] == "cash":
        return True

    text = _norm_text(row.get("section"), row.get("category"), _account_name(row))
    cash_keywords = (
        "cash and bank", "cash & bank", "cash at bank", "bank account",
        "cash equivalents", "cash equivalent", "petty cash",
        "current account", "cheque account", "checking account",
    )
    if any(k in text for k in cash_keywords):
        return True

    code = _account_code(row)
    try:
        code_int = int(code)
    except (ValueError, TypeError):
        code_int = None

    if code_int is not None and 1000 <= code_int <= 1099:
        return True

    return False

def _is_overdraft(row: Dict[str, Any]) -> bool:
    meta = resolve_account_cf_meta(row)
    if meta["bucket"] == "overdraft":
        return True

    text = _norm_text(row.get("section"), row.get("category"), _account_name(row))
    if any(k in text for k in ("overdraft", "bank overdraft", "facility", "bank facility", "revolver")):
        return True

    code = _account_code(row)
    try:
        code_int = int(str(code).strip())
    except (ValueError, TypeError):
        return False

    if code_int == 2105:
        return True

    return 2100 <= code_int <= 2199

def _classify_cf_section(row: Dict[str, Any]) -> str:
    if _is_cash_bank(row):
        return "ignore"

    meta = resolve_account_cf_meta(row)
    section = (meta.get("section") or "").lower()
    if section in ("operating", "investing", "financing", "none"):
        return section

    return "operating"

def _classify_cf_section_from_tb(row: Dict[str, Any]) -> str:
    meta = resolve_account_cf_meta(row)
    section = (meta.get("section") or "").lower()
    if section in ("operating", "investing", "financing"):
        return section

    kind = _classify_tb_row(row)
    if kind == "equity":
        return "financing"

    return "operating"

def resolve_account_cf_meta(row: dict) -> dict:
    """
    Single source of truth for cashflow classification.
    """

    name = row.get("name") or row.get("account_name")
    category = row.get("category")
    section = row.get("section")
    subcategory = row.get("subcategory")
    standard = row.get("standard")

    # 1. Bucket
    bucket = row.get("cf_bucket") or _cf_bucket_from_text(
        name, category, section, subcategory, standard
    )

    # 2. Section
    section_cf = row.get("cf_section") or _cf_section_from_bucket(bucket)

    # 3. Role (for precision like depreciation, leases, loans)
    role = row.get("role") or _coa_role_from_text(
        name, section, category, subcategory, standard
    )

    return {
        "bucket": bucket,
        "section": section_cf,
        "role": role,
    }

def cash_position_amount(tb_rows: List[Dict[str, Any]]) -> Decimal:
    """
    Returns cash & cash equivalents position = (positive cash) - (overdraft)
    Convention: signed = dr - cr
    """
    cash_positive = Decimal("0")
    overdraft_total = Decimal("0")

    for r in tb_rows or []:
        dr = Decimal(str(r.get("debit_total") if r.get("debit_total") is not None else r.get("debit") or 0))
        cr = Decimal(str(r.get("credit_total") if r.get("credit_total") is not None else r.get("credit") or 0))

        signed = dr - cr

        if _is_cash_bank(r):
            if signed >= 0:
                cash_positive += signed
            else:
                overdraft_total += abs(signed)
            continue

        if _is_overdraft(r):
            if signed < 0:
                overdraft_total += abs(signed)
            else:
                overdraft_total += signed

    return cash_positive - overdraft_total

NORMAL_SIDE = {
    # Balance Sheet
    "BS_CA":  "debit",
    "BS_NCA": "debit",
    "BS_CL":  "credit",
    "BS_NCL": "credit",
    "BS_EQ":  "credit",

    # P&L
    "PL_REV":  "credit",
    "PL_GNT":  "credit",
    "PL_DON":  "credit",
    "PL_OI":   "credit",
    "PL_COS":  "debit",
    "PL_OPEX": "debit",
    "PL_DA":   "debit",
    "PL_FIN":  "debit",
    "PL_ADJ":  "debit",   # depends; but debit is safer default
}

# Which families can legitimately be negative/opposite?
ALLOW_OPPOSITE_BY_FAMILY = {
    # Allow contra-type / special accounts to go opposite if flagged as is_contra
    # but by default keep this false and use is_contra to override.
    "BS_CA":  False,
    "BS_NCA": False,
    "BS_CL":  False,
    "BS_NCL": False,
    "BS_EQ":  False,

    "PL_REV":  False,
    "PL_COS":  False,
    "PL_OPEX": False,
    "PL_DA":   False,
    "PL_FIN":  False,
    "PL_ADJ":  True,   # adjustments can go either way
}

def normal_balance_sign(row: dict) -> int:
    """
    Returns a multiplier to present balances as positive in their normal direction.
    Raw closing balance is assumed: closing = debit - credit.
    """
    fam = (row.get("code_family") or "").strip()
    side = NORMAL_SIDE.get(fam, "")  # 'debit' or 'credit'

    # Raw closing: debit-normal -> positive, credit-normal -> negative
    sign = +1 if side == "debit" else (-1 if side == "credit" else +1)

    # Contra accounts flip the normal sign
    if bool(row.get("is_contra")):
        sign *= -1

    return sign



def _coa_role_from_text(
    name: str | None,
    section: str | None,
    category: str | None,
    subcategory: str | None,
    standard: str | None,
) -> str:
    text = " ".join([
        (name or ""),
        (section or ""),
        (category or ""),
        (subcategory or ""),
        (standard or ""),
    ]).lower()

    sec = (section or "").lower()
    cat = (category or "").lower()
    sub = (subcategory or "").lower()

    def has_any(*terms: str) -> bool:
        return any(t in text for t in terms if t)

    # --- AR / cash / bank / VAT ---
    if any(k in text for k in ("accounts receivable", "trade receivable", "debtors")):
        return "ar"

    # Cash & Bank / bank account control ONLY
    if (
        "cash & bank" in text
        or "cash and bank" in text
        or "cash equivalents" in text
        or "money held in bank accounts" in text
        or "bank accounts and petty cash" in text
    ):
        return "cash_bank"

    # Petty cash / cash account
    if "petty cash" in text:
        return "cash"

    # Do NOT classify bank charges as bank control
    if "bank charges" in text or "bank fees" in text:
        return ""

    if "vat receivable" in text or "refund due" in text:
        return "vat_receivable"

    if "vat payable" in text and "output" not in text:
        return "vat_payable"

    if "output vat" in text or "vat output" in text:
        return "vat_output"

    if "input vat" in text or "vat input" in text:
        return "vat_input"

    # ----------------------------
    # helpers
    # ----------------------------
    is_expense = ("expense" in sec) or ("depreciation" in text) or ("amort" in text)
    is_asset = ("asset" in sec) or ("accum" in text) or ("contra" in text)
    is_liability = (
        "liability" in sec
        or "liab" in sec
        or "liability" in cat
        or "liab" in cat
        or "payable" in text
    )

    is_rou = any(k in text for k in (
        "right-of-use", "right of use", "rou", "ifrs 16", "lease amort"
    ))

    is_accum = any(k in text for k in (
        "accumulated depreciation",
        "accum depreciation",
        "accum dep",
        "accumulated amort",
        "accum amort",
    ))

    # ----------------------------
    # IFRS 15 / contract liability
    # ----------------------------
    if has_any(
        "deferred revenue",
        "deferred income",
        "contract liability",
        "unearned revenue",
        "customer advances",
        "advance from customer",
        "mobilisation advance",
        "mobilization advance",
        "revenue received but not yet earned",
        "income received in advance",
        "progress payment received in advance",
        "payments received in advance",
        "advance consideration",
        "customer advance",
        "customer deposit",
        "client deposit",
        "contract deposit",
        "deposit received",
        "deferred contract revenue",
        "contract deferred income",
        "billings in excess of revenue",
        "billings in excess of costs",
    ):
        return "CONTRACT_LIABILITY"

    # ----------------------------
    # IFRS 15 / contract asset
    # ----------------------------
    if has_any(
        "contract asset",
        "contract assets",
        "unbilled revenue",
        "unbilled income",
        "accrued contract income",
        "accrued project revenue",
        "accrued consulting revenue",
        "contract assets - postpaid",
        "postpaid contract revenue",
        "revenue earned not yet billed",
        "amounts due from customer",
        "amount due from customer",
        "conditional right to consideration",
        "right to consideration",
        "revenue asset",
        "work certified not billed",
        "work performed not billed",
        "wip receivable",
        "contract work in progress",
        "construction contract asset",
    ):
        return "CONTRACT_ASSET"

    # ----------------------------
    # IFRS 15 / contract revenue
    # ----------------------------
    if has_any(
        "contract income",
        "contract revenue",
        "service income"
        "revenue recognized from contracts",
        "revenue recognition - ifrs 15",
        "revenue recognition ifrs 15",
        "e&m contract income",
        "residential contract income",
        "postpaid contract revenue",
        "revenue from contracts with customers",
        "ifrs 15 revenue",
        "ifrs15 revenue",
        "customer contract revenue",
        "service contract revenue",
        "project revenue",
        "construction contract revenue",
        "consulting contract revenue",
        "performance obligation revenue",
        "revenue from performance obligations",
    ):
        return "CONTRACT_REVENUE"

    # ----------------------------
    # IFRS 15 / contract revenue
    # ----------------------------
    # --- IFRS 15 fallback (industry revenue accounts) ---
    if (
        (standard or "").strip().upper() == "IFRS 15"
        and (
            "income" in sec
            or "revenue" in sec
            or "income" in cat
            or "revenue" in cat
        )
        and not has_any(
            "discount", "rebate", "returns", "allowance",
            "adjustment", "recovery", "grant", "subsidy",
            "commission income", "interest", "foreign exchange"
        )
    ):
        return "contract_revenue"

    # ----------------------------
    # loan / borrowing roles
    # ----------------------------
    if is_liability:
        if has_any("loan payable - current", "current portion of loan", "current loan payable"):
            return "loan_payable_current"

        if has_any(
            "loan payable - non-current",
            "loan payable - non current",
            "non-current loan payable",
            "non current loan payable",
        ):
            return "loan_payable_noncurrent"

        if has_any("accrued interest", "interest payable"):
            return "loan_accrued_interest"

    if is_expense:
        if has_any("lease interest"):
            return "lease_interest_expense"

        if has_any("interest expense", "finance cost", "borrowing cost"):
            if not has_any("lease interest"):
                return "loan_interest_expense"

        if has_any("loan fee expense", "facility fee expense", "arrangement fee expense"):
            return "loan_fees_expense"

    if is_asset:
        if has_any(
            "deferred loan cost",
            "deferred finance cost",
            "loan transaction cost",
            "debt issue cost",
            "borrowing cost asset",
        ):
            return "loan_fees_asset"

    # ----------------------------
    # asset-class detection
    # ----------------------------
    is_buildings = has_any("building", "buildings")
    is_furniture = has_any("office furniture", "furniture", "fixtures", "fixtures & fittings")
    is_computers = has_any("computer equipment", "computer", "server", "laptop", "it hardware")
    is_vehicles = has_any("motor vehicle", "motor vehicles", "vehicle", "vehicles", "fleet")
    is_equipment = has_any("construction equipment", "equipment", "machinery", "machine", "tools")
    is_intangible = has_any("intangible", "software", "license", "licence", "trademark")

    # ----------------------------
    # Expense side
    # ----------------------------
    if is_expense:
        if ("depreciation" in text or "depr" in text) and is_rou:
            return "depreciation_expense_rou"

        if ("amort" in text) and is_rou:
            return "amortisation_expense_rou"

        if "amort" in text and is_intangible:
            return "amortisation_expense"

        if "depreciation" in text or "depr" in text:
            if is_buildings:
                return "depreciation_expense_buildings"
            if is_furniture:
                return "depreciation_expense_office_furniture"
            if is_computers:
                return "depreciation_expense_computer_equipment"
            if is_vehicles:
                return "depreciation_expense_motor_vehicles"
            if is_equipment:
                return "depreciation_expense_equipment"
            return "depreciation_expense_ppe"

        if "amort" in text:
            return "amortisation_expense"

    # ----------------------------
    # Asset contra side
    # ----------------------------
    if is_asset and is_accum:
        if is_rou:
            return "accumulated_depreciation_rou"

        if is_intangible:
            return "accumulated_amortization"

        if is_buildings:
            return "accumulated_depreciation_buildings"
        if is_furniture:
            return "accumulated_depreciation_office_furniture"
        if is_computers:
            return "accumulated_depreciation_computer_equipment"
        if is_vehicles:
            return "accumulated_depreciation_motor_vehicles"
        if is_equipment:
            return "accumulated_depreciation_equipment"

        return "accumulated_depreciation_ppe"

    return ""