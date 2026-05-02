from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, List


def _d(v: Any) -> Decimal:
    try:
        if v in (None, ""):
            return Decimal("0")
        return Decimal(str(v))
    except Exception:
        return Decimal("0")


def _money(v: Any) -> float:
    return float(_d(v).quantize(Decimal("0.01")))


def _row_text(r: Dict[str, Any]) -> str:
    return " ".join(str(r.get(k) or "") for k in (
        "code", "name", "account_name", "section", "category", "standard", "role"
    )).lower()


def _is_ppe_row(r: Dict[str, Any]) -> bool:
    txt = _row_text(r)
    return (
        "ias 16" in txt
        or "property, plant" in txt
        or "plant and equipment" in txt
        or "ppe" in txt
        or "equipment" in txt
        or "vehicle" in txt
        or "building" in txt
        or "furniture" in txt
    ) and "right-of-use" not in txt and "right of use" not in txt and "rou" not in txt


def _is_accum_dep_row(r: Dict[str, Any]) -> bool:
    txt = _row_text(r)
    return (
        "accumulated depreciation" in txt
        or "accum depreciation" in txt
        or "acc dep" in txt
        or "accumulated amortisation" in txt
        or "accumulated amortization" in txt
    )


def _is_rou_row(r: Dict[str, Any]) -> bool:
    txt = _row_text(r)
    return (
        "ifrs 16" in txt
        or "right-of-use" in txt
        or "right of use" in txt
        or "rou" in txt
        or str(r.get("role") or "").lower() in {
            "lease_rou_asset",
            "lease_rou_accum_depr",
        }
    )


def _signed_asset_amount(row: Dict[str, Any]) -> Decimal:
    dr = _d(row.get("debit_total") or row.get("debit"))
    cr = _d(row.get("credit_total") or row.get("credit"))
    return dr - cr


def _signed_liability_amount(row: Dict[str, Any]) -> Decimal:
    dr = _d(row.get("debit_total") or row.get("debit"))
    cr = _d(row.get("credit_total") or row.get("credit"))
    return cr - dr


def _tb_map(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    out = {}
    for r in rows or []:
        code = str(r.get("code") or r.get("account") or "").strip()
        if code:
            out[code] = r
    return out


def build_ppe_disclosure(
    db,
    company_id: int,
    date_from: date,
    date_to: date,
) -> Dict[str, Any]:
    """
    IAS 16 PPE disclosure.
    Uses trial balance opening/closing and depreciation/account movement clues.
    """

    ctx = db.get_company_context(company_id) if hasattr(db, "get_company_context") else {}
    ctx = ctx or {}

    open_as_of = date_from - timedelta(days=1)

    tb_open = db.get_trial_balance(company_id, None, open_as_of) or []
    tb_close = db.get_trial_balance(company_id, None, date_to) or []
    tb_period = db.get_trial_balance(company_id, date_from, date_to) or []

    open_by = _tb_map(tb_open)
    close_by = _tb_map(tb_close)

    all_codes = set(open_by.keys()) | set(close_by.keys())

    opening_cost = Decimal("0")
    opening_acc_dep = Decimal("0")
    closing_cost = Decimal("0")
    closing_acc_dep = Decimal("0")

    for code in all_codes:
        r = close_by.get(code) or open_by.get(code) or {}
        if not _is_ppe_row(r):
            continue

        open_amt = _signed_asset_amount(open_by.get(code) or {})
        close_amt = _signed_asset_amount(close_by.get(code) or {})

        if _is_accum_dep_row(r):
            opening_acc_dep += abs(open_amt)
            closing_acc_dep += abs(close_amt)
        else:
            opening_cost += open_amt
            closing_cost += close_amt

    # Period movements
    additions = Decimal("0")
    disposals = Decimal("0")
    depreciation = Decimal("0")
    impairment = Decimal("0")
    revaluation = Decimal("0")

    for r in tb_period:
        txt = _row_text(r)

        if _is_ppe_row(r) and not _is_accum_dep_row(r):
            amt = _signed_asset_amount(r)
            if amt > 0:
                additions += amt
            elif amt < 0:
                disposals += abs(amt)

        if "depreciation" in txt and "accum" not in txt and ("ias 16" in txt or "ppe" in txt or "equipment" in txt):
            # P/L depreciation expense is usually debit positive
            depreciation += abs(_d(r.get("debit_total") or r.get("debit")) - _d(r.get("credit_total") or r.get("credit")))

        if "impairment" in txt:
            impairment += abs(_d(r.get("debit_total") or r.get("debit")) - _d(r.get("credit_total") or r.get("credit")))

        if "revaluation" in txt:
            revaluation += _d(r.get("credit_total") or r.get("credit")) - _d(r.get("debit_total") or r.get("debit"))

    opening_carrying = opening_cost - opening_acc_dep
    closing_carrying = closing_cost - closing_acc_dep

    columns = [{"key": "amount", "label": "Amount"}]

    rows = [
        {"label": "Opening cost", "values": {"amount": _money(opening_cost)}},
        {"label": "Additions", "values": {"amount": _money(additions)}},
        {"label": "Disposals", "values": {"amount": _money(-disposals)}},
        {"label": "Revaluation movement", "values": {"amount": _money(revaluation)}},
        {"label": "Closing cost", "values": {"amount": _money(closing_cost)}, "row_type": "subtotal"},

        {"label": "Opening accumulated depreciation", "values": {"amount": _money(-opening_acc_dep)}},
        {"label": "Depreciation charge", "values": {"amount": _money(-depreciation)}},
        {"label": "Impairment", "values": {"amount": _money(-impairment)}},
        {"label": "Closing accumulated depreciation", "values": {"amount": _money(-closing_acc_dep)}, "row_type": "subtotal"},

        {"label": "Opening carrying amount", "values": {"amount": _money(opening_carrying)}, "row_type": "total"},
        {"label": "Closing carrying amount", "values": {"amount": _money(closing_carrying)}, "row_type": "total"},
    ]

    return {
        "meta": {
            "company_id": company_id,
            "company_name": ctx.get("company_name") or ctx.get("name"),
            "currency": ctx.get("currency") or "ZAR",
            "statement": "ppe_disclosure",
            "report_name": "Property, Plant and Equipment Disclosure",
            "standard": "IAS 16",
            "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
        },
        "columns": columns,
        "rows": rows,
    }


def build_lease_disclosure(
    db,
    company_id: int,
    date_from: date,
    date_to: date,
    *,
    as_of: date | None = None,
) -> Dict[str, Any]:
    """
    IFRS 16 lease disclosure.
    Prefer strict lease disclosure engine if available; otherwise fallback to TB/P&L roles.
    """

    as_of = as_of or date_to
    ctx = db.get_company_context(company_id) if hasattr(db, "get_company_context") else {}
    ctx = ctx or {}

    # Best source: your strict IFRS16 engine if present
    if hasattr(db, "get_ifrs16_disclosure_strict"):
        strict = db.get_ifrs16_disclosure_strict(
            company_id,
            from_date=date_from,
            to_date=date_to,
            as_of=as_of,
            include_terminated=True,
        )

        return {
            "meta": {
                "company_id": company_id,
                "company_name": ctx.get("company_name") or ctx.get("name"),
                "currency": ctx.get("currency") or "ZAR",
                "statement": "lease_disclosure",
                "report_name": "Lease Disclosure",
                "standard": "IFRS 16",
                "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
            },
            "columns": [{"key": "amount", "label": "Amount"}],
            "rows": _ifrs16_strict_to_rows(strict),
            "source": strict,
        }

    # Fallback
    open_as_of = date_from - timedelta(days=1)

    tb_open = db.get_trial_balance(company_id, None, open_as_of) or []
    tb_close = db.get_trial_balance(company_id, None, as_of) or []
    tb_period = db.get_trial_balance(company_id, date_from, date_to) or []

    def sum_asset(rows, pred):
        total = Decimal("0")
        for r in rows or []:
            if pred(r):
                total += _signed_asset_amount(r)
        return total

    def sum_liability(rows, pred):
        total = Decimal("0")
        for r in rows or []:
            if pred(r):
                total += _signed_liability_amount(r)
        return total

    def is_lease_liab(r):
        txt = _row_text(r)
        role = str(r.get("role") or "").lower()
        return (
            "lease liability" in txt
            or role in {"lease_liability_current", "lease_liability_noncurrent"}
        )

    rou_open = sum_asset(tb_open, _is_rou_row)
    rou_close = sum_asset(tb_close, _is_rou_row)

    liab_open = sum_liability(tb_open, is_lease_liab)
    liab_close = sum_liability(tb_close, is_lease_liab)

    dep = Decimal("0")
    interest = Decimal("0")
    payments = Decimal("0")

    for r in tb_period:
        txt = _row_text(r)
        role = str(r.get("role") or "").lower()

        amount = abs(_d(r.get("debit_total") or r.get("debit")) - _d(r.get("credit_total") or r.get("credit")))

        if role == "lease_rou_depreciation_expense" or "lease amortization" in txt or "lease amortisation" in txt:
            dep += amount

        if role == "lease_interest_expense" or "lease interest" in txt:
            interest += amount

        if is_lease_liab(r):
            # debit movement to liability usually means payment/principal reduction
            dr = _d(r.get("debit_total") or r.get("debit"))
            if dr > 0:
                payments += dr

    rows = [
        {"label": "Right-of-use assets", "values": {}, "row_type": "header"},
        {"label": "Opening carrying amount", "values": {"amount": _money(rou_open)}},
        {"label": "Depreciation / amortisation charge", "values": {"amount": _money(-dep)}},
        {"label": "Closing carrying amount", "values": {"amount": _money(rou_close)}, "row_type": "total"},

        {"label": "Lease liabilities", "values": {}, "row_type": "header"},
        {"label": "Opening lease liability", "values": {"amount": _money(liab_open)}},
        {"label": "Interest expense", "values": {"amount": _money(interest)}},
        {"label": "Lease payments / principal reductions", "values": {"amount": _money(-payments)}},
        {"label": "Closing lease liability", "values": {"amount": _money(liab_close)}, "row_type": "total"},
    ]

    return {
        "meta": {
            "company_id": company_id,
            "company_name": ctx.get("company_name") or ctx.get("name"),
            "currency": ctx.get("currency") or "ZAR",
            "statement": "lease_disclosure",
            "report_name": "Lease Disclosure",
            "standard": "IFRS 16",
            "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
        },
        "columns": [{"key": "amount", "label": "Amount"}],
        "rows": rows,
    }


def _ifrs16_strict_to_rows(strict: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Adapter for db.get_ifrs16_disclosure_strict() output.
    Keeps this tolerant because your strict disclosure shape can evolve.
    """
    rows: List[Dict[str, Any]] = []

    def add(label, amount=None, row_type="normal"):
        rows.append({
            "label": label,
            "values": {"amount": _money(amount)} if amount is not None else {},
            "row_type": row_type,
        })

    def dig(*keys, default=None):
        cur = strict or {}
        for k in keys:
            if not isinstance(cur, dict):
                return default
            cur = cur.get(k)
        return cur if cur is not None else default

    add("Right-of-use assets", None, "header")
    add("Opening carrying amount", dig("rou_assets", "opening", default=0))
    add("Additions / modifications", dig("rou_assets", "additions", default=0))
    add("Depreciation / amortisation", -_d(dig("rou_assets", "depreciation", default=0)))
    add("Derecognition / terminations", -_d(dig("rou_assets", "derecognition", default=0)))
    add("Closing carrying amount", dig("rou_assets", "closing", default=0), "total")

    add("Lease liabilities", None, "header")
    add("Opening lease liability", dig("lease_liabilities", "opening", default=0))
    add("Interest expense", dig("lease_liabilities", "interest", default=0))
    add("Additions / modifications", dig("lease_liabilities", "additions", default=0))
    add("Payments", -_d(dig("lease_liabilities", "payments", default=0)))
    add("Closing lease liability", dig("lease_liabilities", "closing", default=0), "total")

    maturity = strict.get("maturity") if isinstance(strict, dict) else None
    if isinstance(maturity, dict):
        add("Lease maturity analysis", None, "header")
        for key, label in [
            ("within_1_year", "Within one year"),
            ("one_to_five_years", "One to five years"),
            ("after_five_years", "After five years"),
        ]:
            add(label, maturity.get(key, 0))

    return rows