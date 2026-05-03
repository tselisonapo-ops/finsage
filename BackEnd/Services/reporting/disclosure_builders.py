
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, List
from BackEnd.Services.reporting.revenue_disclosure_builder import build_revenue_disclosure_payload
from decimal import Decimal, ROUND_HALF_UP

def _d(v: Any) -> Decimal:
    try:
        if v in (None, ""):
            return Decimal("0")
        return Decimal(str(v))
    except Exception:
        return Decimal("0")



def _money(v, places=2) -> float:
    """
    Normalize any numeric input to a rounded float (financial-safe).

    - Accepts: None, int, float, str, Decimal
    - Returns: float rounded to given decimal places (default 2)
    """
    try:
        d = Decimal(str(v or 0))
        q = Decimal("1." + ("0" * places))  # e.g. 1.00
        return float(d.quantize(q, rounding=ROUND_HALF_UP))
    except Exception:
        return 0.0
    
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

def _row(label, amount=None, row_type="normal"):
    return {
        "label": label,
        "values": {"amount": _money(amount)} if amount is not None else {},
        "row_type": row_type,
    }


    
def _ifrs16_rou_rows(strict):
    rou = strict.get("rou") or {}

    return [
        _row("Opening carrying amount", rou.get("opening_rou_asset_total")),
        _row("Additions", rou.get("additions_period")),
        _row("Remeasurements / modifications", rou.get("remeasurements_modifications_period")),
        _row("Depreciation", -_money(rou.get("depreciation_charge_period"))),
        _row("Derecognition / terminations", -_money(rou.get("terminations_nbv_disposed_period"))),
        _row("Closing carrying amount", rou.get("closing_rou_nbv_as_of"), "total"),
    ]


def _ifrs16_liability_rows(strict):
    recon = strict.get("liability_reconciliation") or {}

    return [
        _row("Opening lease liability", recon.get("opening_liability")),
        _row("Additions from new leases", recon.get("additions_new_leases")),
        _row("Interest accretion", recon.get("interest_accretion")),
        _row("Principal reduction", -_money(recon.get("principal_reduction"))),
        _row("Remeasurements / modifications", recon.get("remeasurements_modifications")),
        _row("Derecognitions / terminations", -_money(recon.get("derecognitions_terminations"))),
        _row("Closing lease liability", recon.get("closing_liability"), "total"),
    ]


def _ifrs16_maturity_rows(strict):
    maturity = strict.get("maturity_analysis") or {}
    rows = []

    for r in maturity.get("rows") or []:
        rows.append(_row(r.get("bucket") or "", r.get("undiscounted_net")))

    rows.append(_row("Undiscounted future lease payments", maturity.get("undiscounted_net_total"), "total"))
    rows.append(_row("Carrying amount of lease liability", maturity.get("carrying_amount_liability"), "subtotal"))
    rows.append(_row("Discount gap", maturity.get("discount_gap")))

    return rows

def build_lease_note_export_payload(db, company_id, period_from, period_to, *, cur=None):
    note = db.get_or_build_financial_statement_note(
        company_id,
        "ifrs16_lease_policy",
        period_from,
        period_to,
        cur=cur,
    )

    strict = db.get_ifrs16_disclosure_strict(
        company_id,
        from_date=period_from,
        to_date=period_to,
        as_of=period_to,
        include_terminated=True,
        cur=cur,
    )

    return {
        "title": "Leases",
        "text": note.get("content_text") or note.get("system_draft") or "",
        "sections": [
            {
                "title": "Right-of-use assets",
                "rows": _ifrs16_rou_rows(strict),
                "amount_keys": ["amount"],
            },
            {
                "title": "Lease liabilities",
                "rows": _ifrs16_liability_rows(strict),
                "amount_keys": ["amount"],
            },
            {
                "title": "Maturity analysis",
                "rows": _ifrs16_maturity_rows(strict),
                "amount_keys": ["amount"],
            },
        ],
    }

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

def build_revenue_disclosure(
    db,
    company_id: int,
    date_from: date,
    date_to: date,
) -> Dict[str, Any]:
    """
    IFRS 15 revenue disclosure document/export builder.
    Converts revenue disclosure data into rows suitable for PDF, Excel and CSV export.
    """

    ctx = db.get_company_context(company_id) if hasattr(db, "get_company_context") else {}
    ctx = ctx or {}

    data = build_revenue_disclosure_payload(
        db,
        company_id,
        date_from,
        date_to,
    )

    summary = data.get("summary") or {}
    timing = data.get("revenue_timing") or []
    categories = data.get("revenue_by_category") or []
    unsatisfied = data.get("unsatisfied_performance_obligations") or []

    rows = [
        {
            "label": "Revenue recognised",
            "values": {"amount": _money(summary.get("total_revenue"))},
            "row_type": "total",
        },
        {
            "label": "Contract assets",
            "values": {"amount": _money(summary.get("contract_assets"))},
        },
        {
            "label": "Contract liabilities",
            "values": {"amount": _money(summary.get("contract_liabilities"))},
        },
        {
            "label": "Receivables from contracts with customers",
            "values": {"amount": _money(summary.get("gross_receivables_from_contracts"))},
        },
    ]

    if timing:
        rows.append({"label": "Revenue by timing of recognition", "values": {}, "row_type": "header"})
        for r in timing:
            rows.append({
                "label": r.get("timing") or "Unknown",
                "values": {"amount": _money(r.get("amount"))},
            })

    if categories:
        rows.append({"label": "Revenue by category", "values": {}, "row_type": "header"})
        for r in categories:
            rows.append({
                "label": r.get("category") or "Uncategorised",
                "values": {"amount": _money(r.get("amount"))},
            })

    remaining_total = sum(_money(r.get("remaining_amount")) for r in unsatisfied)
    if remaining_total:
        rows.append({"label": "Unsatisfied performance obligations", "values": {}, "row_type": "header"})
        rows.append({
            "label": "Transaction price allocated to unsatisfied or partially unsatisfied performance obligations",
            "values": {"amount": _money(remaining_total)},
            "row_type": "total",
        })

    return {
        "meta": {
            "company_id": company_id,
            "company_name": ctx.get("company_name") or ctx.get("name"),
            "currency": ctx.get("currency") or "ZAR",
            "statement": "revenue_disclosure",
            "report_name": "Revenue Disclosure",
            "standard": "IFRS 15",
            "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
        },
        "columns": [{"key": "amount", "label": "Amount"}],
        "rows": rows,
        "source": data,
    }

def build_ppe_note_export_payload(note, payload):
    rows = payload.get("rows") or []

    if not rows:
        sections = payload.get("sections") or {}
        if isinstance(sections, dict):
            for sec in sections.get("sections") or []:
                title = (sec.get("title") or "").lower()
                if "carrying" in title or "net book" in title or "movement" in title:
                    rows = sec.get("rows") or sec.get("lines") or []
                    break

    return {
        "title": note.get("note_title") or "Property, plant and equipment",
        "text": note.get("content_text") or note.get("system_draft") or "",
        "sections": [
            {
                "title": "Property, plant and equipment movement",
                "rows": rows,
                "amount_keys": ["amount"],
            }
        ] if rows else [],
    }


def build_revenue_note_export_payload(policy_note, disclosure_data):
    d = disclosure_data or {}
    p = policy_note or {}

    policy_text = p.get("content_text") or p.get("system_draft") or ""

    return {
        "title": "Revenue from contracts with customers",
        "text": policy_text.strip(),
        "sections": [
            {
                "title": "Revenue recognised",
                "rows": [
                    _row("Revenue recognised during the period", d.get("revenue_total"), "total"),
                ],
                "amount_keys": ["amount"],
            },
            {
                "title": "Contract balances",
                "rows": [
                    _row("Contract assets", d.get("contract_assets")),
                    _row("Contract liabilities", d.get("contract_liabilities")),
                    _row("Receivables", d.get("receivables")),
                ],
                "amount_keys": ["amount"],
            },
            {
                "title": "Revenue timing",
                "rows": [
                    _row("Over time", d.get("over_time")),
                    _row("Point in time", d.get("point_in_time")),
                ],
                "amount_keys": ["amount"],
            },
            {
                "title": "Revenue by category",
                "rows": [
                    _row(c.get("category") or c.get("name") or "Other", c.get("amount"))
                    for c in (d.get("revenue_by_category") or [])
                ],
                "amount_keys": ["amount"],
            },
        ],
    }