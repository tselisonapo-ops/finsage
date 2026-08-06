
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, List
from BackEnd.Services.reporting.revenue_disclosure_builder import build_revenue_disclosure_payload
from decimal import Decimal, ROUND_HALF_UP
from BackEnd.Services.db_service import db_service
def _d(v: Any) -> Decimal:
    try:
        if v in (None, ""):
            return Decimal("0")
        return Decimal(str(v))
    except Exception:
        return Decimal("0")

def _has_nonzero_column(rows, key):
    for r in rows or []:
        try:
            if abs(float((r.get("values") or {}).get(key) or 0)) > 0.000001:
                return True
        except Exception:
            pass
    return False

def _q(schema: str, sql: str) -> str:
    """
    Injects schema safely into SQL templates that use {schema}.
    Example usage:
        cur.execute(_q(schema, "SELECT * FROM {schema}.assets"))
    """
    if not schema:
        raise ValueError("Schema is required")

    # Basic safety check (avoid SQL injection via schema name)
    if not schema.replace("_", "").isalnum():
        raise ValueError(f"Invalid schema name: {schema}")

    return sql.replace("{schema}", schema)

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

def _shift_year(d: date, years: int = 1) -> date:
    try:
        return d.replace(year=d.year - years)
    except ValueError:
        return d.replace(year=d.year - years, day=28)

def _asset_note_export_payload(db, company_id, period_from, period_to, *, kind, cur=None):
    kind = str(kind or "").lower()
    if kind not in {"ip", "ia"}:
        raise ValueError("kind must be 'ip' or 'ia'")

    note_key = "ias40_ip_policy" if kind == "ip" else "ias38_ia_policy"
    title = "Investment property" if kind == "ip" else "Intangible assets"

    note = db.get_or_build_financial_statement_note(
        company_id,
        note_key,
        period_from,
        period_to,
        cur=cur,
    )

    def load_payload(cursor):
        fn = db.get_ip_note_payload if kind == "ip" else db.get_ia_note_payload
        return fn(cursor, company_id, period_from, period_to)

    if cur is not None:
        data = load_payload(cur)
    else:
        with db._conn_cursor() as (_conn, cursor):
            data = load_payload(cursor)

    section_data = data.get("sections") or {}
    class_names = [
        str(c)
        for c in (section_data.get("columns") or [])
        if str(c).lower() != "total"
    ]

    columns = [
        {"key": c, "label": c}
        for c in class_names
    ] + [{"key": "Total", "label": "Total"}]

    sections = []

    for sec in section_data.get("sections") or []:
        rows = []

        for row in sec.get("rows") or []:
            values = row.get("values") or {}
            rows.append({
                "label": row.get("label") or "",
                "values": {
                    c["key"]: _money(values.get(c["key"]))
                    for c in columns
                },
                "row_type": (
                    "total"
                    if "closing" in str(row.get("row_key") or "").lower()
                    else "normal"
                ),
            })

        if rows:
            sections.append({
                "title": sec.get("title") or "",
                "rows": rows,
                "columns": columns,
                "amount_keys": [c["key"] for c in columns],
                "amount_labels": {
                    c["key"]: c["label"]
                    for c in columns
                },
            })

    return {
        "title": title,
        "text": note.get("content_text") or note.get("system_draft") or "",
        "sections": sections,
        "raw": data,
    }


def build_ip_note_export_payload(
    db,
    company_id,
    period_from,
    period_to,
    *,
    cur=None,
):
    return _asset_note_export_payload(
        db,
        company_id,
        period_from,
        period_to,
        kind="ip",
        cur=cur,
    )


def build_ia_note_export_payload(
    db,
    company_id,
    period_from,
    period_to,
    *,
    cur=None,
):
    return _asset_note_export_payload(
        db,
        company_id,
        period_from,
        period_to,
        kind="ia",
        cur=cur,
    )

def _asset_disclosure_export_payload(
    db,
    company_id,
    period_from,
    period_to,
    *,
    kind,
    cur=None,
):
    note = _asset_note_export_payload(
        db,
        company_id,
        period_from,
        period_to,
        kind=kind,
        cur=cur,
    )

    ctx = (
        db.get_company_context(company_id)
        if hasattr(db, "get_company_context")
        else {}
    ) or {}

    sections = []

    for sec in note.get("sections") or []:
        sections.append({
            "label": sec.get("title") or "",
            "key": str(sec.get("title") or "").lower().replace(" ", "_"),
            "lines": [
                {
                    "label": row.get("label") or "",
                    "name": row.get("label") or "",
                    "values": row.get("values") or {},
                    "row_type": row.get("row_type") or "normal",
                }
                for row in sec.get("rows") or []
            ],
        })

    first_columns = (
        (note.get("sections") or [{}])[0].get("columns") or
        [{"key": "amount", "label": "Amount"}]
    )

    standard = "IAS 40" if kind == "ip" else "IAS 38"
    statement = "investment_property_disclosure" if kind == "ip" else "intangible_assets_disclosure"
    report_name = "Investment Property Disclosure" if kind == "ip" else "Intangible Assets Disclosure"

    return {
        "meta": {
            "company_id": company_id,
            "company_name": ctx.get("company_name") or ctx.get("name"),
            "currency": ctx.get("currency") or "USD",
            "statement": statement,
            "report_name": report_name,
            "standard": standard,
            "period": {
                "from": period_from.isoformat(),
                "to": period_to.isoformat(),
            },
        },
        "columns": first_columns,
        "sections": sections,
        "raw": note.get("raw") or {},
    }


def build_ip_disclosure_export_payload(
    db,
    company_id,
    period_from,
    period_to,
    *,
    cur=None,
):
    return _asset_disclosure_export_payload(
        db,
        company_id,
        period_from,
        period_to,
        kind="ip",
        cur=cur,
    )


def build_ia_disclosure_export_payload(
    db,
    company_id,
    period_from,
    period_to,
    *,
    cur=None,
):
    return _asset_disclosure_export_payload(
        db,
        company_id,
        period_from,
        period_to,
        kind="ia",
        cur=cur,
    )

def _multi_year_ranges(date_from: date, date_to: date, comparison_years: int = 1):
    try:
        comparison_years = int(comparison_years or 1)
    except Exception:
        comparison_years = 1

    comparison_years = max(1, min(comparison_years, 10))

    return [
        (_shift_year(date_from, i), _shift_year(date_to, i))
        for i in range(1, comparison_years)
    ]

def _with_comparative_disclosures(
    *,
    build_fn,
    db,
    company_id: int,
    date_from: date,
    date_to: date,
    comparison_years: int = 1,
    **kwargs,
):
    current = build_fn(db, company_id, date_from, date_to, **kwargs)

    comparisons = []
    for idx, (pf, pt) in enumerate(_multi_year_ranges(date_from, date_to, comparison_years), start=1):
        key = "pri" if idx == 1 else f"p{idx}"
        cmp_payload = build_fn(db, company_id, pf, pt, **kwargs)
        cmp_payload.setdefault("meta", {})
        cmp_payload["meta"]["key"] = key
        comparisons.append(cmp_payload)

    current["comparison_disclosures"] = comparisons
    current.setdefault("meta", {})
    current["meta"]["comparison_years"] = comparison_years
    return current

def build_lease_note_export_payload(
    db,
    company_id,
    period_from,
    period_to,
    *,
    cur=None,
    comparison_years: int = 1,
):
    note = db.get_or_build_financial_statement_note(
        company_id,
        "ifrs16_lease_policy",
        period_from,
        period_to,
        cur=cur,
    )

    lease_payload = build_lease_disclosure_multi_year(
        db,
        company_id,
        period_from,
        period_to,
        as_of=period_to,
        comparison_years=comparison_years,
    )

    sections = []

    summary_rows = lease_payload.get("comparison_summary_rows") or []
    comparison_columns = lease_payload.get("comparison_columns") or []

    if summary_rows:
        sections.append({
            "title": "Lease disclosure summary",
            "rows": summary_rows,
            "columns": comparison_columns,
            "amount_keys": [
                c["key"]
                for c in comparison_columns
            ],
            "amount_labels": {
                c["key"]: c["label"]
                for c in comparison_columns
            },
        })

    for sec in lease_payload.get("sections") or []:
        columns = sec.get("columns") or [{"key": "amount", "label": "Amount"}]

        sections.append({
            "title": sec.get("title") or "",
            "rows": sec.get("rows") or [],
            "columns": columns,
            "amount_keys": [
                c["key"]
                for c in columns
                if c.get("key")
            ],
            "amount_labels": {
                c["key"]: c.get("label") or c["key"]
                for c in columns
                if c.get("key")
            },
        })

    return {
        "title": "Leases",
        "text": note.get("content_text") or note.get("system_draft") or "",
        "sections": sections,
    }

def build_lessor_lease_note_export_payload(
    db, company_id, period_from, period_to, *, cur=None,
):
    note = db.get_or_build_financial_statement_note(
        company_id, "ifrs16_lessor_lease_policy",
        period_from, period_to, cur=cur,
    )
    d = db.get_ifrs16_lessor_disclosure_strict(
        company_id, from_date=period_from, to_date=period_to,
        as_of=period_to, include_terminated=True, cur=cur,
    )

    op = d.get("operating_lease") or {}
    fin = d.get("finance_lease") or {}
    rec = d.get("net_investment_reconciliation") or {}
    op_mat = d.get("operating_maturity_analysis") or {}
    fin_mat = d.get("finance_maturity_analysis") or {}

    def row(label, amount=0, row_type="normal"):
        return {
            "label": label,
            "values": {"amount": _money(amount)},
            "row_type": row_type,
        }

    def section(title, rows, columns=None):
        columns = columns or [{"key": "amount", "label": "Amount"}]
        keys = [c["key"] for c in columns]
        return {
            "title": title,
            "rows": rows,
            "columns": columns,
            "amount_keys": keys,
            "amount_labels": {c["key"]: c["label"] for c in columns},
        }

    op_rows = [
        {
            "label": r.get("bucket") or "",
            "values": {
                "amount": _money(r.get("undiscounted_net")),
            },
        }
        for r in op_mat.get("rows") or []
    ]
    op_rows.append(row(
        "Total undiscounted operating lease receipts",
        op_mat.get("undiscounted_net_total"),
        "total",
    ))

    fin_rows = [
        {
            "label": r.get("bucket") or "",
            "values": {
                "gross_investment": _money(r.get("undiscounted_receipts")),
                "unearned_income": _money(r.get("unearned_finance_income")),
                "net_investment": _money(r.get("principal_recovery")),
            },
        }
        for r in fin_mat.get("rows") or []
    ]
    fin_rows.append({
        "label": "Total",
        "values": {
            "gross_investment": _money(
                fin_mat.get("undiscounted_receipts_total")
            ),
            "unearned_income": _money(
                fin_mat.get("unearned_finance_income_total")
            ),
            "net_investment": _money(
                fin_mat.get("principal_recovery_total")
            ),
        },
        "row_type": "total",
    })

    sections = [
        section("Lease income", [
            row(
                "Operating lease income recognised on a straight-line basis",
                op.get("straight_line_income"),
            ),
            row(
                "Finance income on the net investment in finance leases",
                fin.get("finance_income"),
            ),
            row(
                "Initial direct costs recognised as an expense",
                op.get("initial_direct_cost_expense"),
            ),
            row(
                "Total lease income",
                _money(op.get("straight_line_income"))
                + _money(fin.get("finance_income")),
                "total",
            ),
        ]),

        section("Net investment in finance leases", [
            row("Opening net investment", rec.get("opening_net_investment")),
            row("Additions from new finance leases", rec.get("additions")),
            row(
                "Principal recovered",
                -abs(_money(rec.get("principal_recovery"))),
            ),
            row(
                "Modifications and remeasurements",
                rec.get("modification_adjustments"),
            ),
            row(
                "Derecognitions",
                -abs(_money(rec.get("derecognitions"))),
            ),
            row(
                "Closing net investment",
                fin.get("closing_net_investment"),
                "total",
            ),
        ]),

        section("Classification of net investment", [
            row("Current", fin.get("current_portion")),
            row("Non-current", fin.get("noncurrent_portion")),
            row(
                "Total net investment",
                fin.get("closing_net_investment"),
                "total",
            ),
        ]),

        section("Operating lease maturity analysis", op_rows),

        section(
            "Finance lease maturity analysis",
            fin_rows,
            [
                {"key": "gross_investment", "label": "Gross investment"},
                {"key": "unearned_income", "label": "Unearned finance income"},
                {"key": "net_investment", "label": "Net investment"},
            ],
        ),
    ]

    return {
        "title": "Leases – lessor",
        "text": note.get("content_text") or note.get("system_draft") or "",
        "sections": sections,
        "checks": d.get("net_investment_check") or {},
    }

def build_lessor_lease_disclosure_export_payload(
    db,
    company_id,
    period_from,
    period_to,
    *,
    as_of=None,
    cur=None,
):
    as_of = as_of or period_to

    d = db.get_ifrs16_lessor_disclosure_strict(
        company_id,
        from_date=period_from,
        to_date=period_to,
        as_of=as_of,
        include_terminated=True,
        cur=cur,
    )

    pnl = d.get("pnl") or {}
    finance = d.get("finance_lease") or {}
    recon = d.get("net_investment_reconciliation") or {}
    billing = d.get("billing") or {}
    cashflow = d.get("cashflow") or {}

    sections = [
        {
            "title": "Lease income",
            "rows": [
                {"description": "Operating lease income", "amount": pnl.get("operating_lease_income", 0)},
                {"description": "Finance income", "amount": pnl.get("finance_income", 0)},
                {"description": "Initial direct cost expense", "amount": pnl.get("initial_direct_cost_expense", 0)},
                {"description": "Modification gain or loss", "amount": pnl.get("gain_loss_on_modifications", 0)},
                {"description": "Termination gain or loss", "amount": pnl.get("gain_loss_on_terminations", 0)},
            ],
            "columns": [{"key": "amount", "label": "Amount"}],
        },
        {
            "title": "Net investment in finance leases",
            "rows": [
                {"description": "Opening net investment", "amount": recon.get("opening_net_investment", 0)},
                {"description": "Additions", "amount": recon.get("additions", 0)},
                {"description": "Finance income", "amount": recon.get("finance_income", 0)},
                {"description": "Principal recovery", "amount": -float(recon.get("principal_recovery") or 0)},
                {"description": "Modification adjustments", "amount": recon.get("modification_adjustments", 0)},
                {"description": "Derecognitions", "amount": -float(recon.get("derecognitions") or 0)},
                {"description": "Closing net investment", "amount": recon.get("closing_net_investment", 0)},
            ],
            "columns": [{"key": "amount", "label": "Amount"}],
        },
        {
            "title": "Net investment classification",
            "rows": [
                {"description": "Current portion", "amount": finance.get("current_portion", 0)},
                {"description": "Non-current portion", "amount": finance.get("noncurrent_portion", 0)},
                {"description": "Closing net investment", "amount": finance.get("closing_net_investment", 0)},
            ],
            "columns": [{"key": "amount", "label": "Amount"}],
        },
        {
            "title": "Operating lease maturity analysis",
            "rows": (d.get("operating_maturity_analysis") or {}).get("rows") or [],
            "columns": [
                {"key": "bucket", "label": "Maturity period", "type": "text"},
                {"key": "undiscounted_net", "label": "Net receipts", "type": "amount"},
                {"key": "vat", "label": "VAT", "type": "amount"},
                {"key": "gross", "label": "Gross receipts", "type": "amount"},
            ],
        },
        {
            "title": "Finance lease maturity analysis",
            "rows": (d.get("finance_maturity_analysis") or {}).get("rows") or [],
            "columns": [
                {"key": "bucket", "label": "Maturity period", "type": "text"},
                {"key": "undiscounted_receipts", "label": "Lease receipts", "type": "amount"},
                {"key": "unearned_finance_income", "label": "Unearned finance income", "type": "amount"},
                {"key": "principal_recovery", "label": "Principal", "type": "amount"},
                {"key": "vat", "label": "VAT", "type": "amount"},
                {"key": "gross", "label": "Gross receipts", "type": "amount"},
            ],
        },
        {
            "title": "Billing and cash receipts",
            "rows": [
                {"description": "Net amount billed", "amount": billing.get("billed_net", 0)},
                {"description": "VAT billed", "amount": billing.get("billed_vat", 0)},
                {"description": "Gross amount billed", "amount": billing.get("billed_gross", 0)},
                {"description": "Cash receipts", "amount": cashflow.get("lease_receipts_gross", 0)},
            ],
            "columns": [{"key": "amount", "label": "Amount"}],
        },
    ]

    contract_rows = d.get("lease_income_by_contract") or []
    if contract_rows:
        sections.append({
            "title": "Lease income by contract",
            "rows": contract_rows,
            "columns": [
                {"key": "contract_no", "label": "Contract number", "type": "text"},
                {"key": "contract_name", "label": "Contract name", "type": "text"},
                {"key": "lease_classification", "label": "Classification", "type": "text"},
                {"key": "operating_lease_income", "label": "Operating income", "type": "amount"},
                {"key": "finance_income", "label": "Finance income", "type": "amount"},
                {"key": "principal_recovery", "label": "Principal recovery", "type": "amount"},
                {"key": "contractual_net", "label": "Contractual net", "type": "amount"},
                {"key": "vat", "label": "VAT", "type": "amount"},
                {"key": "contractual_gross", "label": "Contractual gross", "type": "amount"},
            ],
        })

    for section in sections:
        columns = section.get("columns") or []

        section["amount_keys"] = [
            col["key"]
            for col in columns
            if col.get("key") and col.get("type", "amount") == "amount"
        ]

        section["amount_labels"] = {
            col["key"]: col.get("label") or col["key"]
            for col in columns
            if col.get("key") and col.get("type", "amount") == "amount"
        }
    return {
        "title": "Leases – lessor",
        "statement": "lessor_lease_disclosure",
        "period_from": period_from.isoformat(),
        "period_to": period_to.isoformat(),
        "as_of": as_of.isoformat(),
        "sections": sections,
        "checks": d.get("net_investment_check") or {},
        "raw": d,
    }

def build_ppe_disclosure(db, company_id: int, date_from: date, date_to: date) -> Dict[str, Any]:
    """
    IAS 16 PPE disclosure.

    Source:
    - db.get_ppe_disclosure_by_class()
    - Asset classes are shown as columns
    - Movements are shown as rows
    """

    ctx = db.get_company_context(company_id) if hasattr(db, "get_company_context") else {}
    ctx = ctx or {}

    with db._conn_cursor() as (_conn, cur):
        ppe_rows = db.get_ppe_disclosure_by_class(
            cur,
            company_id,
            date_from,
            date_to,
        ) or []

    def _n(v):
        try:
            return Decimal(str(v or 0))
        except Exception:
            return Decimal("0")

    def _class_key(name):
        n = str(name or "").strip().lower()

        if n in ("land",):
            return "land"

        if n in ("building", "buildings"):
            return "buildings"

        if n in ("plant", "plant & equipment", "plant and equipment", "equipment", "plant and machinery"):
            return "plant_machinery"

        if n in ("motorcycle", "motorcycles", "motor bike", "motor bikes", "motorbike", "motorbikes"):
            return "motorcycles"

        if n in ("bicycle", "bicycles", "bike", "bikes", "cycle", "cycles"):
            return "bicycles"

        if n in ("bicycle fleet", "delivery bicycle", "delivery bicycles"):
            return "bicycles"

        if n in ("motorcycle fleet", "motorbike fleet", "delivery motorcycles"):
            return "motorcycles"

        if n in ("safety equipment", "helmets", "helmet"):
            return "safety_equipment"

        # Scooters
        if n in ("scooter", "scooters", "motor scooter", "motor scooters",):
            return "scooters"

        # Quad bikes / ATVs
        if n in ("quad bike", "quad bikes", "atv", "atvs", "all terrain vehicle", "all terrain vehicles",):
            return "quad_bikes"
        
        if n in ("vehicle", "vehicles", "motor vehicle", "motor vehicles"):
            return "vehicles"

        if n in ("heavy vehicle", "heavy vehicles", "truck", "trucks", "lorry", "lorries"):
            return "heavy_vehicles"

        if n in ("construction equipment", "construction machinery"):
            return "construction_equipment"

        if n in ("mining equipment", "mining machinery"):
            return "mining_equipment"

        if n in ("manufacturing equipment", "manufacturing machinery", "production equipment"):
            return "manufacturing_equipment"

        if n in ("computer", "computers", "computer equipment", "it equipment"):
            return "computer_equipment"

        if n in ("office equipment",):
            return "office_equipment"

        if n in ("furniture", "furniture & fittings", "furniture and fittings", "furniture and fixtures"):
            return "furniture_fittings"

        if n in ("tools", "tools and small equipment", "small tools", "small equipment"):
            return "tools_small_equipment"

        if n in ("leasehold improvements", "leasehold improvement"):
            return "leasehold_improvements"

        if n in (
            "cip",
            "construction in progress",
            "assets under construction",
            "asset under construction",
            "expansion project",
            "capital work in progress",
            "cwip",
        ):
            return "assets_under_construction"

        return "other"

    columns = [
        {"key": "land", "label": "Land"},
        {"key": "buildings", "label": "Buildings"},
        {"key": "plant_machinery", "label": "Plant and Machinery"},
        {"key": "vehicles", "label": "Vehicles"},
        {"key": "motorcycles", "label": "Motorcycles"},
        {"key": "bicycles", "label": "Bicycles"},
        {"key": "safety_equipment", "label": "Safety Equipment"},
        {"key": "scooters", "label": "Scooters"},
        {"key": "quad_bikes", "label": "Quad Bikes"},
        {"key": "heavy_vehicles", "label": "Heavy Vehicles"},
        {"key": "construction_equipment", "label": "Construction Equipment"},
        {"key": "mining_equipment", "label": "Mining Equipment"},
        {"key": "manufacturing_equipment", "label": "Manufacturing Equipment"},
        {"key": "computer_equipment", "label": "Computer Equipment"},
        {"key": "office_equipment", "label": "Office Equipment"},
        {"key": "furniture_fittings", "label": "Furniture and Fittings"},
        {"key": "tools_small_equipment", "label": "Tools and Small Equipment"},
        {"key": "leasehold_improvements", "label": "Leasehold Improvements"},
        {"key": "assets_under_construction", "label": "Assets under Construction"},
        {"key": "other", "label": "Other PPE"},
        {"key": "total", "label": "Total"},
    ]

    movement_keys = [
        "opening_carrying",
        "additions",
        "disposals",
        "depreciation",
        "impairment",
        "revaluation",
        "closing_carrying",
    ]

    summary = {
        movement: {col["key"]: Decimal("0") for col in columns}
        for movement in movement_keys
    }

    for r in ppe_rows:
        if not isinstance(r, dict):
            continue

        asset_class = _class_key(
            r.get("asset_class_group")
            or r.get("asset_class")
            or r.get("account_name")
            or r.get("name")
        )
        additions = (
            _n(r.get("additions_cost"))
            + _n(r.get("subsequent_additions_cost"))
        )

        disposals = -abs(_n(r.get("disposals_carrying")))

        depreciation = _n(r.get("depreciation_charge"))

        impairment = (
            _n(r.get("impairment_losses"))
            - _n(r.get("impairment_reversals"))
        )

        revaluation = (
            _n(r.get("revaluation_upward"))
            + _n(r.get("revaluation_downward"))
        )

        opening = _n(r.get("opening_carrying"))

        additions = (
            _n(r.get("additions_cost"))
            + _n(r.get("subsequent_additions_cost"))
        )

        disposals = -abs(_n(r.get("disposals_carrying")))

        depreciation = -abs(_n(r.get("depreciation_charge")))

        impairment_raw = (
            _n(r.get("impairment_losses"))
            - _n(r.get("impairment_reversals"))
        )
        impairment = -abs(impairment_raw) if impairment_raw > 0 else abs(impairment_raw)

        revaluation = (
            _n(r.get("revaluation_upward"))
            + _n(r.get("revaluation_downward"))
        )

        closing = (
            opening
            + additions
            + disposals
            + depreciation
            + impairment
            + revaluation
        )

        values = {
            "opening_carrying": opening,
            "additions": additions,
            "disposals": disposals,
            "depreciation": depreciation,
            "impairment": impairment,
            "revaluation": revaluation,
            "closing_carrying": closing,
        }

        for movement, amount in values.items():
            summary[movement][asset_class] += amount
            summary[movement]["total"] += amount

    rows = [
        {
            "label": "Opening carrying amount",
            "values": {k: _money(v) for k, v in summary["opening_carrying"].items()},
        },
        {
            "label": "Additions",
            "values": {k: _money(v) for k, v in summary["additions"].items()},
        },
        {
            "label": "Disposals",
            "values": {k: _money(v) for k, v in summary["disposals"].items()},
        },
        {
            "label": "Depreciation charge",
            "values": {k: _money(v) for k, v in summary["depreciation"].items()},
        },
        {
            "label": "Impairment",
            "values": {k: _money(v) for k, v in summary["impairment"].items()},
        },
        {
            "label": "Revaluation movement",
            "values": {k: _money(v) for k, v in summary["revaluation"].items()},
        },
        {
            "label": "Closing carrying amount",
            "values": {k: _money(v) for k, v in summary["closing_carrying"].items()},
            "row_type": "total",
        },
    ]

    columns = [
        c for c in columns
        if c["key"] == "total" or _has_nonzero_column(rows, c["key"])
    ]

    return {
        "meta": {
            "company_id": company_id,
            "company_name": ctx.get("company_name") or ctx.get("name"),
            "currency": ctx.get("currency") or "USD",
            "statement": "ppe_disclosure",
            "report_name": "Property, Plant and Equipment Disclosure",
            "standard": "IAS 16",
            "period": {
                "from": date_from.isoformat(),
                "to": date_to.isoformat(),
            },
        },
        "columns": columns,
        "rows": rows,
        "source": ppe_rows,
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

    Preferred source:
    - db.get_ifrs16_disclosure_strict()

    Layout:
    - ROU asset classes as columns
    - Movements as rows
    - Lease liability and maturity analysis as supporting sections
    """

    as_of = as_of or date_to

    ctx = db.get_company_context(company_id) if hasattr(db, "get_company_context") else {}
    ctx = ctx or {}

    def _n(v):
        try:
            return Decimal(str(v or 0))
        except Exception:
            return Decimal("0")

    def _lease_class_key(name: str) -> str:
        n = str(name or "").strip().lower()

        if any(x in n for x in ("office", "building", "branch", "warehouse", "premises", "head office")):
            return "buildings"
        if any(x in n for x in ("vehicle", "vehicles", "fleet", "car", "truck")):
            return "vehicles"
        if any(x in n for x in ("equipment", "machine", "plant", "production")):
            return "equipment"
        if any(x in n for x in ("it", "server", "software", "infrastructure", "computer")):
            return "it_infrastructure"

        return "other"

    def _empty_col_values(columns):
        return {col["key"]: Decimal("0") for col in columns}

    meta = {
        "company_id": company_id,
        "company_name": ctx.get("company_name") or ctx.get("name"),
        "currency": ctx.get("currency") or "USD",
        "statement": "lease_disclosure",
        "report_name": "Lease Disclosure",
        "standard": "IFRS 16",
        "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
    }

    if hasattr(db, "get_ifrs16_disclosure_strict"):
        strict = db.get_ifrs16_disclosure_strict(
            company_id,
            from_date=date_from,
            to_date=date_to,
            as_of=as_of,
            include_terminated=True,
        )

        columns = [
            {"key": "buildings", "label": "Buildings"},
            {"key": "vehicles", "label": "Vehicles"},
            {"key": "equipment", "label": "Equipment"},
            {"key": "it_infrastructure", "label": "IT Infrastructure"},
            {"key": "other", "label": "Other"},
            {"key": "total", "label": "Total"},
        ]

        movement_keys = [
            "opening",
            "additions",
            "remeasurements",
            "depreciation",
            "disposals",
            "closing",
        ]

        summary = {
            movement: _empty_col_values(columns)
            for movement in movement_keys
        }

        rou_asset_table = strict.get("rou_asset_table") or []

        for r in rou_asset_table:
            if not isinstance(r, dict):
                continue

            asset_class = _lease_class_key(r.get("lease_name"))

            values = {
                "opening": _n(r.get("opening")),
                "additions": _n(r.get("additions")),
                "remeasurements": _n(r.get("remeasurements")),
                "depreciation": -abs(_n(r.get("depreciation"))),
                "disposals": -abs(_n(r.get("disposals"))),
                "closing": _n(r.get("closing")),
            }

            for movement, amount in values.items():
                summary[movement][asset_class] += amount
                summary[movement]["total"] += amount

        # REMOVE EMPTY ASSET CLASSES
        active_keys = [
            col["key"]
            for col in columns
            if col["key"] == "total"
            or any(summary[m][col["key"]] != 0 for m in movement_keys)
        ]

        active_rou_columns = [
            col for col in columns
            if col["key"] in active_keys
        ]

        rou_rows = [
            {
                "label": "Opening carrying amount",
                "values": {k: _money(v) for k, v in summary["opening"].items()},
            },
            {
                "label": "Additions",
                "values": {k: _money(v) for k, v in summary["additions"].items()},
            },
            {
                "label": "Remeasurements / modifications",
                "values": {k: _money(v) for k, v in summary["remeasurements"].items()},
            },
            {
                "label": "Depreciation charge",
                "values": {k: _money(v) for k, v in summary["depreciation"].items()},
            },
            {
                "label": "Disposals / terminations",
                "values": {k: _money(v) for k, v in summary["disposals"].items()},
            },
            {
                "label": "Closing carrying amount",
                "values": {k: _money(v) for k, v in summary["closing"].items()},
                "row_type": "total",
            },
        ]

        liability_recon = strict.get("liability_reconciliation") or {}
        maturity = strict.get("maturity_analysis") or {}
        maturity_source_rows = maturity.get("rows") or []
        pnl = strict.get("pnl") or {}
        cashflow = strict.get("cashflow") or {}

        liability_rows = [
            {
                "label": "Opening lease liability",
                "values": {"amount": _money(liability_recon.get("opening_liability"))},
            },
            {
                "label": "Additions from new leases",
                "values": {"amount": _money(liability_recon.get("additions_new_leases"))},
            },
            {
                "label": "Interest expense",
                "values": {"amount": _money(liability_recon.get("interest_accretion"))},
            },
            {
                "label": "Principal reductions",
                "values": {"amount": _money(-abs(_n(liability_recon.get("principal_reduction"))))},
            },
            {
                "label": "Remeasurements / modifications",
                "values": {"amount": _money(liability_recon.get("remeasurements_modifications"))},
            },
            {
                "label": "Derecognitions / terminations",
                "values": {"amount": _money(-abs(_n(liability_recon.get("derecognitions_terminations"))))},
            },
            {
                "label": "Closing lease liability",
                "values": {"amount": _money(liability_recon.get("closing_liability"))},
                "row_type": "total",
            },
        ]

        pnl_cashflow_rows = [
            {
                "label": "Depreciation of right-of-use assets",
                "values": {"amount": _money(pnl.get("depreciation"))},
            },
            {
                "label": "Interest expense on lease liabilities",
                "values": {"amount": _money(pnl.get("interest"))},
            },
            {
                "label": "Lease payments - gross",
                "values": {"amount": _money(cashflow.get("lease_payments_gross"))},
            },
            {
                "label": "Lease payments - net of VAT",
                "values": {"amount": _money(cashflow.get("lease_payments_net"))},
            },
            {
                "label": "VAT on lease payments",
                "values": {"amount": _money(cashflow.get("vat"))},
            },
        ]

        maturity_rows_clean = []

        for m in maturity_source_rows:
            if not isinstance(m, dict):
                continue

            maturity_rows_clean.append({
                "label": m.get("bucket") or "Unclassified",
                "values": {"amount": _money(m.get("undiscounted_net"))},
            })

        maturity_rows_clean.extend([
            {
                "label": "Undiscounted lease payments",
                "values": {"amount": _money(maturity.get("undiscounted_net_total"))},
                "row_type": "subtotal",
            },
            {
                "label": "Less: finance charges / discount effect",
                "values": {"amount": _money(-abs(_n(maturity.get("discount_gap"))))},
            },
            {
                "label": "Carrying amount of lease liability",
                "values": {"amount": _money(maturity.get("carrying_amount_liability"))},
                "row_type": "total",
            },
        ])

        return {
            "meta": meta,
            "sections": [
                {
                    "title": "Right-of-use assets",
                    "columns": active_rou_columns,
                    "rows": rou_rows,
                },
                {
                    "title": "Lease liabilities",
                    "columns": [{"key": "amount", "label": "Amount"}],
                    "rows": liability_rows,
                },
                {
                    "title": "Amounts recognised in profit or loss and cash flows",
                    "columns": [{"key": "amount", "label": "Amount"}],
                    "rows": pnl_cashflow_rows,
                },
                {
                    "title": "Maturity analysis",
                    "columns": [{"key": "amount", "label": "Amount"}],
                    "rows": maturity_rows_clean,
                },
            ],
            "source": strict,
        }

    # Fallback only if strict engine is unavailable
    return {
        "meta": meta,
        "columns": [{"key": "amount", "label": "Amount"}],
        "rows": [],
        "source": None,
        "warning": "Strict IFRS 16 disclosure engine is not available.",
    }

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
            "currency": ctx.get("currency") or "USD",
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

    summary_rows = payload.get("comparison_summary_rows") or []

    sections = []

    if summary_rows:
        sections.append({
            "title": "Property, plant and equipment summary",
            "rows": summary_rows,
            "columns": payload.get("comparison_columns") or [],
            "amount_keys": [
                c["key"]
                for c in (payload.get("comparison_columns") or [])
            ],
            "amount_labels": {
                c["key"]: c["label"]
                for c in (payload.get("comparison_columns") or [])
            },
        })

    if rows:
        sections.append({
            "title": "Property, plant and equipment movement",
            "rows": rows,
            "columns": payload.get("columns") or [],
            "amount_keys": [
                c["key"]
                for c in (payload.get("columns") or [])
            ],
            "amount_labels": {
                c["key"]: c["label"]
                for c in (payload.get("columns") or [])
            },
        })

    return {
        "title": note.get("note_title") or "Property, plant and equipment",
        "text": note.get("content_text") or note.get("system_draft") or "",
        "sections": sections,
    }

def build_revenue_note_export_payload(policy_note, disclosure_data):
    d = disclosure_data or {}
    p = policy_note or {}

    policy_text = p.get("content_text") or p.get("system_draft") or ""

    sections = []

    summary_rows = d.get("comparison_summary_rows") or []
    comparison_columns = d.get("comparison_columns") or []

    if summary_rows:
        sections.append({
            "title": "Revenue disclosure summary",
            "rows": summary_rows,
            "columns": comparison_columns,
            "amount_keys": [
                c["key"]
                for c in comparison_columns
                if c.get("key")
            ],
            "amount_labels": {
                c["key"]: c.get("label") or c["key"]
                for c in comparison_columns
                if c.get("key")
            },
        })

    rows = d.get("rows") or []

    if rows:
        sections.append({
            "title": "Revenue disclosure detail",
            "rows": rows,
            "columns": d.get("columns") or [{"key": "amount", "label": "Amount"}],
            "amount_keys": [
                c["key"]
                for c in (d.get("columns") or [{"key": "amount", "label": "Amount"}])
                if c.get("key")
            ],
            "amount_labels": {
                c["key"]: c.get("label") or c["key"]
                for c in (d.get("columns") or [{"key": "amount", "label": "Amount"}])
                if c.get("key")
            },
        })

    return {
        "title": "Revenue from contracts with customers",
        "text": policy_text.strip(),
        "sections": sections,
    }

def build_payroll_employee_cost_note_export_payload(
    note,
    disclosure,
):
    note=note or {}
    disclosure=disclosure or {}

    sections_data=disclosure.get("sections") or {}
    summary=disclosure.get("summary") or {}
    totals=disclosure.get("totals") or {}

    sections=[]

    earnings=(
        sections_data.get("earnings") or {}
    ).get("rows") or []

    if earnings:
        rows=[
            {
                "label":
                    row.get("label")
                    or row.get("code")
                    or "Employee cost",
                "values":{
                    "amount":_money(
                        row.get("amount")
                    ),
                },
                "row_type":
                    row.get("row_type")
                    or "normal",
            }
            for row in earnings
        ]

        rows.append({
            "label":"Short-term employee benefits",
            "values":{
                "amount":_money(
                    totals.get(
                        "short_term_employee_benefits"
                    )
                ),
            },
            "row_type":"subtotal",
        })

        sections.append({
            "title":"Short-term employee benefits",
            "rows":rows,
            "amount_keys":["amount"],
            "amount_labels":{
                "amount":"Current period",
            },
        })

    contributions=(
        sections_data.get(
            "employer_contributions"
        ) or {}
    ).get("rows") or []

    if contributions:
        rows=[
            {
                "label":
                    row.get("label")
                    or row.get("code")
                    or "Employer contribution",
                "values":{
                    "amount":_money(
                        row.get("amount")
                    ),
                },
                "row_type":"normal",
            }
            for row in contributions
        ]

        rows.append({
            "label":"Employer contributions",
            "values":{
                "amount":_money(
                    totals.get(
                        "employer_contributions"
                    )
                ),
            },
            "row_type":"subtotal",
        })

        sections.append({
            "title":"Employer contributions",
            "rows":rows,
            "amount_keys":["amount"],
            "amount_labels":{
                "amount":"Current period",
            },
        })

    departments=(
        sections_data.get(
            "department_analysis"
        ) or {}
    ).get("rows") or []

    if departments:
        sections.append({
            "title":"Employee costs by department",
            "rows":[{
                "label":
                    row.get("department")
                    or "Unassigned",
                "values":{
                    "gross_pay":_money(
                        row.get("gross_pay")
                    ),
                    "employer_contributions":
                        _money(row.get(
                            "employer_contributions"
                        )),
                    "total_employee_cost":
                        _money(row.get(
                            "total_employee_cost"
                        )),
                },
                "row_type":"normal",
            } for row in departments],
            "amount_keys":[
                "gross_pay",
                "employer_contributions",
                "total_employee_cost",
            ],
            "amount_labels":{
                "gross_pay":"Gross pay",
                "employer_contributions":
                    "Employer contributions",
                "total_employee_cost":
                    "Total employee cost",
            },
        })

    sections.append({
        "title":"Employee benefit expense",
        "rows":[
            {
                "label":
                    "Short-term employee benefits",
                "values":{
                    "amount":_money(
                        totals.get(
                            "short_term_employee_benefits"
                        )
                    ),
                },
                "row_type":"normal",
            },
            {
                "label":"Employer contributions",
                "values":{
                    "amount":_money(
                        totals.get(
                            "employer_contributions"
                        )
                    ),
                },
                "row_type":"normal",
            },
            {
                "label":
                    "Total employee benefit expense",
                "values":{
                    "amount":_money(
                        totals.get(
                            "employee_benefit_expense"
                        )
                    ),
                },
                "row_type":"total",
            },
        ],
        "amount_keys":["amount"],
        "amount_labels":{
            "amount":"Current period",
        },
    })

    return{
        "title":
            note.get("note_title")
            or disclosure.get("title")
            or "Employee benefit expense",

        "text":
            note.get("content_text")
            or note.get("system_draft")
            or "",

        "sections":sections,

        "meta":{
            **(disclosure.get("meta") or {}),
            "employee_count":int(
                summary.get("employee_count") or 0
            ),
            "payroll_run_count":int(
                summary.get("payroll_run_count") or 0
            ),
        },
    }

def build_payroll_bonus_provision_note_payload(
    note,
    disclosure,
):
    note=note or {}
    disclosure=disclosure or {}
    movement=disclosure.get("movement") or {}
    sections_data=disclosure.get("sections") or {}

    sections=[{
        "title":"Bonus provision reconciliation",
        "rows":[
            {
                "label":"Opening provision",
                "values":{
                    "amount":_money(
                        movement.get(
                            "opening_provision"
                        )
                    ),
                },
                "row_type":"normal",
            },
            {
                "label":"Current-period charge",
                "values":{
                    "amount":_money(
                        movement.get(
                            "current_period_charge"
                        )
                    ),
                },
                "row_type":"normal",
            },
            {
                "label":"Amounts paid",
                "values":{
                    "amount":-_money(
                        movement.get("amount_paid")
                    ),
                },
                "row_type":"normal",
            },
            {
                "label":"Amounts reversed",
                "values":{
                    "amount":-_money(
                        movement.get(
                            "amount_reversed"
                        )
                    ),
                },
                "row_type":"normal",
            },
            {
                "label":"Other adjustments",
                "values":{
                    "amount":_money(
                        movement.get(
                            "adjustment_amount"
                        )
                    ),
                },
                "row_type":"normal",
            },
            {
                "label":"Closing bonus provision",
                "values":{
                    "amount":_money(
                        movement.get(
                            "closing_provision"
                        )
                    ),
                },
                "row_type":"total",
            },
        ],
        "amount_keys":["amount"],
        "amount_labels":{
            "amount":"Current period",
        },
    }]

    schemes=(
        sections_data.get("by_scheme") or {}
    ).get("rows") or []

    if schemes:
        sections.append({
            "title":"Bonus provision by scheme",
            "rows":[{
                "label":
                    row.get("scheme_name")
                    or row.get("scheme_code")
                    or "Bonus scheme",
                "values":{
                    "employee_count":
                        row.get("employee_count") or 0,
                    "eligible_remuneration":_money(
                        row.get(
                            "eligible_remuneration"
                        )
                    ),
                    "provision_amount":_money(
                        row.get("provision_amount")
                    ),
                },
                "row_type":"normal",
            } for row in schemes],
            "amount_keys":[
                "employee_count",
                "eligible_remuneration",
                "provision_amount",
            ],
            "amount_labels":{
                "employee_count":"Employees",
                "eligible_remuneration":
                    "Eligible remuneration",
                "provision_amount":"Provision",
            },
        })

    departments=(
        sections_data.get("by_department") or {}
    ).get("rows") or []

    if departments:
        sections.append({
            "title":"Bonus provision by department",
            "rows":[{
                "label":
                    row.get("department")
                    or "Unassigned",
                "values":{
                    "employee_count":
                        row.get("employee_count") or 0,
                    "eligible_remuneration":_money(
                        row.get(
                            "eligible_remuneration"
                        )
                    ),
                    "provision_amount":_money(
                        row.get("provision_amount")
                    ),
                },
                "row_type":"normal",
            } for row in departments],
            "amount_keys":[
                "employee_count",
                "eligible_remuneration",
                "provision_amount",
            ],
            "amount_labels":{
                "employee_count":"Employees",
                "eligible_remuneration":
                    "Eligible remuneration",
                "provision_amount":"Provision",
            },
        })

    return{
        "title":
            note.get("note_title")
            or disclosure.get("title")
            or "Bonus provision",
        "text":
            note.get("content_text")
            or note.get("system_draft")
            or "",
        "sections":sections,
        "meta":disclosure.get("meta") or {},
    }

def build_payroll_bonus_provision_export_payload(
    disclosure,
):
    disclosure=disclosure or {}
    movement=disclosure.get("movement") or {}
    sections=disclosure.get("sections") or {}

    return{
        "meta":{
            **(disclosure.get("meta") or {}),
            "report_key":"ias19_bonus_provision",
        },
        "title":"Bonus provision",
        "sections":[
            {
                "title":"Bonus provision reconciliation",
                "rows":[
                    {
                        "label":"Opening provision",
                        "amount":_money(
                            movement.get(
                                "opening_provision"
                            )
                        ),
                    },
                    {
                        "label":"Current-period charge",
                        "amount":_money(
                            movement.get(
                                "current_period_charge"
                            )
                        ),
                    },
                    {
                        "label":"Amounts paid",
                        "amount":-_money(
                            movement.get(
                                "amount_paid"
                            )
                        ),
                    },
                    {
                        "label":"Amounts reversed",
                        "amount":-_money(
                            movement.get(
                                "amount_reversed"
                            )
                        ),
                    },
                    {
                        "label":"Other adjustments",
                        "amount":_money(
                            movement.get(
                                "adjustment_amount"
                            )
                        ),
                    },
                    {
                        "label":"Closing provision",
                        "amount":_money(
                            movement.get(
                                "closing_provision"
                            )
                        ),
                    },
                ],
                "amount_keys":["amount"],
                "amount_labels":{
                    "amount":"Current period",
                },
            },
            {
                "title":"Bonus provision by scheme",
                "rows":(
                    sections.get("by_scheme") or {}
                ).get("rows") or [],
                "amount_keys":[
                    "employee_count",
                    "eligible_remuneration",
                    "provision_amount",
                ],
                "amount_labels":{
                    "employee_count":"Employees",
                    "eligible_remuneration":
                        "Eligible remuneration",
                    "provision_amount":"Provision",
                },
            },
            {
                "title":"Bonus provision by department",
                "rows":(
                    sections.get(
                        "by_department"
                    ) or {}
                ).get("rows") or [],
                "amount_keys":[
                    "employee_count",
                    "eligible_remuneration",
                    "provision_amount",
                ],
                "amount_labels":{
                    "employee_count":"Employees",
                    "eligible_remuneration":
                        "Eligible remuneration",
                    "provision_amount":"Provision",
                },
            },
        ],
        "totals":disclosure.get("totals") or {},
        "disclosure":disclosure,
    }

def build_payroll_employee_cost_export_payload(
    db,
    company_id:int,
    date_from,
    date_to,
):
    disclosure=(
        db.build_payroll_employee_cost_disclosure(
            company_id,
            date_from,
            date_to,
        )
    )

    sections_data=disclosure.get("sections") or {}
    totals=disclosure.get("totals") or {}

    rows=[]

    for row in(
        sections_data.get("earnings") or {}
    ).get("rows") or []:
        rows.append({
            "label":row.get("label"),
            "category":"Short-term benefits",
            "values":{
                "amount":_money(
                    row.get("amount")
                ),
            },
            "row_type":"normal",
        })

    for row in(
        sections_data.get(
            "employer_contributions"
        ) or {}
    ).get("rows") or []:
        rows.append({
            "label":row.get("label"),
            "category":
                "Employer contributions",
            "values":{
                "amount":_money(
                    row.get("amount")
                ),
            },
            "row_type":"normal",
        })

    rows.extend([
        {
            "label":"Short-term employee benefits",
            "category":"Total",
            "values":{
                "amount":_money(
                    totals.get(
                        "short_term_employee_benefits"
                    )
                ),
            },
            "row_type":"subtotal",
        },
        {
            "label":"Employer contributions",
            "category":"Total",
            "values":{
                "amount":_money(
                    totals.get(
                        "employer_contributions"
                    )
                ),
            },
            "row_type":"subtotal",
        },
        {
            "label":"Employee benefit expense",
            "category":"Total",
            "values":{
                "amount":_money(
                    totals.get(
                        "employee_benefit_expense"
                    )
                ),
            },
            "row_type":"total",
        },
    ])

    return{
        "meta":{
            **(disclosure.get("meta") or {}),
            "title":"Employee benefit expense",
            "report_key":
                "payroll_employee_cost_disclosure",
            "company_id":int(company_id),
        },

        "title":"Employee benefit expense",

        "columns":[
            {
                "key":"label",
                "label":"Description",
            },
            {
                "key":"amount",
                "label":"Current period",
            },
        ],

        "sections":[
            {
                "title":"Employee benefit expense",
                "rows":rows,
                "amount_keys":["amount"],
                "amount_labels":{
                    "amount":"Current period",
                },
            },
        ],

        "rows":rows,
        "totals":{
            "employee_benefit_expense":
                _money(totals.get(
                    "employee_benefit_expense"
                )),
        },

        "disclosure":disclosure,
    }

def build_payroll_termination_benefits_note_payload(
    note,
    disclosure,
):
    note=note or {}
    disclosure=disclosure or {}
    movement=disclosure.get("movement") or {}
    section_data=disclosure.get("sections") or {}

    sections=[{
        "title":"Termination benefit reconciliation",
        "rows":[
            {
                "label":"Opening obligation",
                "values":{
                    "amount":_money(
                        movement.get(
                            "opening_obligation"
                        )
                    ),
                },
                "row_type":"normal",
            },
            {
                "label":"Current-period charge",
                "values":{
                    "amount":_money(
                        movement.get(
                            "current_period_charge"
                        )
                    ),
                },
                "row_type":"normal",
            },
            {
                "label":"Benefits paid",
                "values":{
                    "amount":-_money(
                        movement.get("benefits_paid")
                    ),
                },
                "row_type":"normal",
            },
            {
                "label":"Amounts reversed",
                "values":{
                    "amount":-_money(
                        movement.get(
                            "amount_reversed"
                        )
                    ),
                },
                "row_type":"normal",
            },
            {
                "label":"Other adjustments",
                "values":{
                    "amount":_money(
                        movement.get(
                            "adjustment_amount"
                        )
                    ),
                },
                "row_type":"normal",
            },
            {
                "label":
                    "Closing termination benefit obligation",
                "values":{
                    "amount":_money(
                        movement.get(
                            "closing_obligation"
                        )
                    ),
                },
                "row_type":"total",
            },
        ],
        "amount_keys":["amount"],
        "amount_labels":{
            "amount":"Current period",
        },
    }]

    benefit_types=(
        section_data.get("by_benefit_type") or {}
    ).get("rows") or []

    if benefit_types:
        sections.append({
            "title":"Termination benefits by type",
            "rows":[{
                "label":
                    row.get("benefit_type")
                    or "Termination benefit",
                "values":{
                    "employee_count":
                        row.get("employee_count") or 0,
                    "gross_benefit_amount":_money(
                        row.get(
                            "gross_benefit_amount"
                        )
                    ),
                    "amount_paid":_money(
                        row.get("amount_paid")
                    ),
                    "outstanding_obligation":_money(
                        row.get(
                            "outstanding_obligation"
                        )
                    ),
                },
                "row_type":"normal",
            } for row in benefit_types],
            "amount_keys":[
                "employee_count",
                "gross_benefit_amount",
                "amount_paid",
                "outstanding_obligation",
            ],
            "amount_labels":{
                "employee_count":"Employees",
                "gross_benefit_amount":
                    "Gross benefit",
                "amount_paid":"Paid",
                "outstanding_obligation":
                    "Outstanding",
            },
        })

    departments=(
        section_data.get("by_department") or {}
    ).get("rows") or []

    if departments:
        sections.append({
            "title":
                "Termination benefits by department",
            "rows":[{
                "label":
                    row.get("department")
                    or "Unassigned",
                "values":{
                    "employee_count":
                        row.get("employee_count") or 0,
                    "gross_benefit_amount":_money(
                        row.get(
                            "gross_benefit_amount"
                        )
                    ),
                    "amount_paid":_money(
                        row.get("amount_paid")
                    ),
                    "outstanding_obligation":_money(
                        row.get(
                            "outstanding_obligation"
                        )
                    ),
                },
                "row_type":"normal",
            } for row in departments],
            "amount_keys":[
                "employee_count",
                "gross_benefit_amount",
                "amount_paid",
                "outstanding_obligation",
            ],
            "amount_labels":{
                "employee_count":"Employees",
                "gross_benefit_amount":
                    "Gross benefit",
                "amount_paid":"Paid",
                "outstanding_obligation":
                    "Outstanding",
            },
        })

    return{
        "title":
            note.get("note_title")
            or disclosure.get("title")
            or "Termination benefits",
        "text":
            note.get("content_text")
            or note.get("system_draft")
            or "",
        "sections":sections,
        "meta":disclosure.get("meta") or {},
    }

def build_payroll_termination_benefits_export_payload(
    disclosure,
):
    disclosure=disclosure or {}
    movement=disclosure.get("movement") or {}
    sections=disclosure.get("sections") or {}

    return{
        "meta":{
            **(disclosure.get("meta") or {}),
            "report_key":
                "ias19_termination_benefits",
        },
        "title":"Termination benefits",
        "sections":[
            {
                "title":
                    "Termination benefit reconciliation",
                "rows":[
                    {
                        "label":"Opening obligation",
                        "amount":_money(
                            movement.get(
                                "opening_obligation"
                            )
                        ),
                    },
                    {
                        "label":"Current-period charge",
                        "amount":_money(
                            movement.get(
                                "current_period_charge"
                            )
                        ),
                    },
                    {
                        "label":"Benefits paid",
                        "amount":-_money(
                            movement.get(
                                "benefits_paid"
                            )
                        ),
                    },
                    {
                        "label":"Amounts reversed",
                        "amount":-_money(
                            movement.get(
                                "amount_reversed"
                            )
                        ),
                    },
                    {
                        "label":"Other adjustments",
                        "amount":_money(
                            movement.get(
                                "adjustment_amount"
                            )
                        ),
                    },
                    {
                        "label":"Closing obligation",
                        "amount":_money(
                            movement.get(
                                "closing_obligation"
                            )
                        ),
                    },
                ],
                "amount_keys":["amount"],
                "amount_labels":{
                    "amount":"Current period",
                },
            },
            {
                "title":"Termination benefits by type",
                "rows":(
                    sections.get(
                        "by_benefit_type"
                    ) or {}
                ).get("rows") or [],
                "amount_keys":[
                    "employee_count",
                    "gross_benefit_amount",
                    "amount_paid",
                    "outstanding_obligation",
                ],
                "amount_labels":{
                    "employee_count":"Employees",
                    "gross_benefit_amount":
                        "Gross benefit",
                    "amount_paid":"Paid",
                    "outstanding_obligation":
                        "Outstanding",
                },
            },
            {
                "title":
                    "Termination benefits by department",
                "rows":(
                    sections.get(
                        "by_department"
                    ) or {}
                ).get("rows") or [],
                "amount_keys":[
                    "employee_count",
                    "gross_benefit_amount",
                    "amount_paid",
                    "outstanding_obligation",
                ],
                "amount_labels":{
                    "employee_count":"Employees",
                    "gross_benefit_amount":
                        "Gross benefit",
                    "amount_paid":"Paid",
                    "outstanding_obligation":
                        "Outstanding",
                },
            },
        ],
        "totals":disclosure.get("totals") or {},
        "disclosure":disclosure,
    }

def _benefit_note_payload(
    note,
    disclosure,
    sections,
):
    return{
        "title":
            note.get("note_title")
            or disclosure.get("title")
            or "Employee benefits",
        "text":
            note.get("content_text")
            or note.get("system_draft")
            or "",
        "sections":sections,
        "meta":disclosure.get("meta") or {},
    }


def build_payroll_dc_note_payload(
    note,
    disclosure,
):
    d=disclosure or {}
    sections=d.get("sections") or {}
    totals=d.get("totals") or {}

    plan_rows=[{
        "label":
            row.get("plan_name")
            or row.get("plan_code")
            or "Plan",
        "values":{
            "employee_count":
                row.get("employee_count") or 0,
            "pensionable_remuneration":_money(
                row.get("pensionable_remuneration")
            ),
            "employee_contribution":_money(
                row.get("employee_contribution")
            ),
            "employer_contribution":_money(
                row.get("employer_contribution")
            ),
            "total_contribution":_money(
                row.get("total_contribution")
            ),
        },
        "row_type":"normal",
    } for row in(
        sections.get("by_plan") or {}
    ).get("rows") or []]

    plan_rows.append({
        "label":"Total contributions",
        "values":{
            "employee_count":None,
            "pensionable_remuneration":None,
            "employee_contribution":_money(
                totals.get("employee_contributions")
            ),
            "employer_contribution":_money(
                totals.get("employer_contributions")
            ),
            "total_contribution":_money(
                totals.get("contributions_payable")
            ),
        },
        "row_type":"total",
    })

    return _benefit_note_payload(
        note,
        d,
        [{
            "title":
                "Defined-contribution plans",
            "rows":plan_rows,
            "amount_keys":[
                "employee_count",
                "pensionable_remuneration",
                "employee_contribution",
                "employer_contribution",
                "total_contribution",
            ],
            "amount_labels":{
                "employee_count":"Employees",
                "pensionable_remuneration":
                    "Pensionable remuneration",
                "employee_contribution":
                    "Employee contribution",
                "employer_contribution":
                    "Employer contribution",
                "total_contribution":
                    "Total contribution",
            },
        }],
    )


def build_payroll_dc_export_payload(disclosure):
    d=disclosure or {}

    return{
        "meta":{
            **(d.get("meta") or {}),
            "report_key":
                "ias19_defined_contribution",
        },
        "title":"Defined-contribution plans",
        "sections":[
            {
                "title":"Contributions by plan",
                "rows":(
                    d.get("sections",{})
                    .get("by_plan",{})
                    .get("rows",[])
                ),
                "amount_keys":[
                    "employee_count",
                    "pensionable_remuneration",
                    "employee_contribution",
                    "employer_contribution",
                    "total_contribution",
                ],
                "amount_labels":{
                    "employee_count":"Employees",
                    "pensionable_remuneration":
                        "Pensionable remuneration",
                    "employee_contribution":
                        "Employee contribution",
                    "employer_contribution":
                        "Employer contribution",
                    "total_contribution":
                        "Total contribution",
                },
            },
            {
                "title":"Contributions by department",
                "rows":(
                    d.get("sections",{})
                    .get("by_department",{})
                    .get("rows",[])
                ),
                "amount_keys":[
                    "employee_count",
                    "pensionable_remuneration",
                    "employee_contribution",
                    "employer_contribution",
                    "total_contribution",
                ],
                "amount_labels":{
                    "employee_count":"Employees",
                    "pensionable_remuneration":
                        "Pensionable remuneration",
                    "employee_contribution":
                        "Employee contribution",
                    "employer_contribution":
                        "Employer contribution",
                    "total_contribution":
                        "Total contribution",
                },
            },
        ],
        "totals":d.get("totals") or {},
        "disclosure":d,
    }


def build_payroll_db_note_payload(
    note,
    disclosure,
):
    d=disclosure or {}
    movement=d.get("movement") or {}
    dbo=movement.get("dbo") or {}
    assets=movement.get("plan_assets") or {}

    sections=[
        {
            "title":
                "Defined-benefit obligation reconciliation",
            "rows":[
                {
                    "label":"Opening obligation",
                    "values":{
                        "amount":_money(
                            dbo.get("opening_dbo")
                        ),
                    },
                    "row_type":"normal",
                },
                {
                    "label":"Current service cost",
                    "values":{
                        "amount":_money(
                            dbo.get(
                                "current_service_cost"
                            )
                        ),
                    },
                    "row_type":"normal",
                },
                {
                    "label":"Past service cost",
                    "values":{
                        "amount":_money(
                            dbo.get(
                                "past_service_cost"
                            )
                        ),
                    },
                    "row_type":"normal",
                },
                {
                    "label":"Interest cost",
                    "values":{
                        "amount":_money(
                            dbo.get("interest_cost")
                        ),
                    },
                    "row_type":"normal",
                },
                {
                    "label":"Benefits paid",
                    "values":{
                        "amount":-_money(
                            dbo.get("benefits_paid")
                        ),
                    },
                    "row_type":"normal",
                },
                {
                    "label":"Settlements",
                    "values":{
                        "amount":-_money(
                            dbo.get("settlements")
                        ),
                    },
                    "row_type":"normal",
                },
                {
                    "label":"Curtailments",
                    "values":{
                        "amount":-_money(
                            dbo.get("curtailments")
                        ),
                    },
                    "row_type":"normal",
                },
                {
                    "label":"Actuarial gain/(loss)",
                    "values":{
                        "amount":_money(
                            dbo.get(
                                "actuarial_gain_loss"
                            )
                        ),
                    },
                    "row_type":"normal",
                },
                {
                    "label":"Closing obligation",
                    "values":{
                        "amount":_money(
                            dbo.get("closing_dbo")
                        ),
                    },
                    "row_type":"total",
                },
            ],
            "amount_keys":["amount"],
            "amount_labels":{
                "amount":"Current period",
            },
        },
        {
            "title":"Plan asset reconciliation",
            "rows":[
                {
                    "label":"Opening plan assets",
                    "values":{
                        "amount":_money(
                            assets.get(
                                "opening_plan_assets"
                            )
                        ),
                    },
                    "row_type":"normal",
                },
                {
                    "label":"Interest income",
                    "values":{
                        "amount":_money(
                            assets.get(
                                "interest_income"
                            )
                        ),
                    },
                    "row_type":"normal",
                },
                {
                    "label":"Employer contributions",
                    "values":{
                        "amount":_money(
                            assets.get(
                                "employer_contributions"
                            )
                        ),
                    },
                    "row_type":"normal",
                },
                {
                    "label":"Employee contributions",
                    "values":{
                        "amount":_money(
                            assets.get(
                                "employee_contributions"
                            )
                        ),
                    },
                    "row_type":"normal",
                },
                {
                    "label":
                        "Return excluding interest",
                    "values":{
                        "amount":_money(
                            assets.get(
                                "return_excluding_interest"
                            )
                        ),
                    },
                    "row_type":"normal",
                },
                {
                    "label":"Benefits paid",
                    "values":{
                        "amount":-_money(
                            assets.get("benefits_paid")
                        ),
                    },
                    "row_type":"normal",
                },
                {
                    "label":"Closing plan assets",
                    "values":{
                        "amount":_money(
                            assets.get(
                                "closing_plan_assets"
                            )
                        ),
                    },
                    "row_type":"total",
                },
            ],
            "amount_keys":["amount"],
            "amount_labels":{
                "amount":"Current period",
            },
        },
    ]

    return _benefit_note_payload(
        note,
        d,
        sections,
    )


def build_payroll_db_export_payload(disclosure):
    d=disclosure or {}
    note=build_payroll_db_note_payload({},d)

    return{
        "meta":{
            **(d.get("meta") or {}),
            "report_key":
                "ias19_defined_benefit",
        },
        "title":"Defined-benefit plans",
        "sections":[
            *note.get("sections",[]),
            {
                "title":"Defined-benefit plans",
                "rows":(
                    d.get("sections",{})
                    .get("plans",{})
                    .get("rows",[])
                ),
                "amount_keys":[
                    "active_members",
                    "closing_dbo",
                    "closing_plan_assets",
                    "net_defined_benefit_liability",
                    "net_defined_benefit_asset",
                    "profit_or_loss_amount",
                    "oci_remeasurement_amount",
                ],
                "amount_labels":{
                    "active_members":"Members",
                    "closing_dbo":"DBO",
                    "closing_plan_assets":
                        "Plan assets",
                    "net_defined_benefit_liability":
                        "Net liability",
                    "net_defined_benefit_asset":
                        "Net asset",
                    "profit_or_loss_amount":
                        "Profit or loss",
                    "oci_remeasurement_amount":
                        "OCI",
                },
            },
            {
                "title":
                    "Significant actuarial assumptions",
                "rows":(
                    d.get("sections",{})
                    .get("assumptions",{})
                    .get("rows",[])
                ),
                "amount_keys":[
                    "numeric_value",
                ],
                "amount_labels":{
                    "numeric_value":"Value",
                },
            },
        ],
        "totals":d.get("totals") or {},
        "disclosure":d,
    }
def build_ifrs9_disclosure(
    db,
    company_id: int,
    date_from: date,
    date_to: date,
    *,
    as_of: date | None = None,
) -> Dict[str, Any]:
    as_of = as_of or date_to

    ctx = (
        db.get_company_context(company_id)
        if hasattr(
            db,
            "get_company_context",
        )
        else {}
    ) or {}

    strict = (
        db.get_ifrs9_disclosure_strict(
            company_id,
            from_date=date_from,
            to_date=date_to,
            as_of=as_of,
            include_closed=True,
        )
    )

    classification = (
        strict.get("classification") or {}
    )

    receivables = (
        strict.get("trade_receivables") or {}
    )

    reconciliation = (
        strict.get("ecl_reconciliation")
        or {}
    )

    effective_interest = (
        strict.get("effective_interest")
        or {}
    )

    modifications = (
        strict.get("modifications") or {}
    )

    derecognitions = (
        strict.get("derecognitions") or {}
    )

    fair_value = (
        strict.get("fair_value") or {}
    )

    def row(
        label,
        amount=0,
        row_type="normal",
    ):
        return {
            "label": label,
            "values": {
                "amount": _money(amount),
            },
            "row_type": row_type,
        }

    classification_rows = [
        row(
            "Financial assets at amortised cost",
            classification.get(
                "amortised_cost_assets"
            ),
        ),
        row(
            "Financial assets at FVOCI",
            classification.get(
                "fvoci_assets"
            ),
        ),
        row(
            "Financial assets at FVPL",
            classification.get(
                "fvpl_assets"
            ),
        ),
        row(
            "Financial liabilities at amortised cost",
            classification.get(
                "amortised_cost_liabilities"
            ),
        ),
        row(
            "Financial liabilities at FVPL",
            classification.get(
                "fvpl_liabilities"
            ),
        ),
        row(
            "Unclassified financial instruments",
            classification.get(
                "unclassified"
            ),
        ),
    ]

    receivable_rows = [
        row(
            "Gross trade receivables",
            receivables.get("gross"),
        ),
        row(
            "Loss allowance",
            -abs(
                _money(
                    receivables.get(
                        "loss_allowance"
                    )
                )
            ),
        ),
        row(
            "Net trade receivables",
            receivables.get("net"),
            "total",
        ),
    ]

    ageing = (
        receivables.get("ageing") or {}
    )

    ageing_rows = [
        row(
            "Current",
            ageing.get("current"),
        ),
        row(
            "1–30 days past due",
            ageing.get("days_1_30"),
        ),
        row(
            "31–60 days past due",
            ageing.get("days_31_60"),
        ),
        row(
            "61–90 days past due",
            ageing.get("days_61_90"),
        ),
        row(
            "91–120 days past due",
            ageing.get("days_91_120"),
        ),
        row(
            "More than 120 days past due",
            ageing.get("over_120"),
        ),
        row(
            "Total gross exposure",
            receivables.get("gross"),
            "total",
        ),
    ]

    ecl_rows = [
        row(
            "Opening loss allowance",
            reconciliation.get(
                "opening_allowance"
            ),
        ),
        row(
            "Expected credit losses recognised",
            reconciliation.get("charges"),
        ),
        row(
            "Expected credit losses reversed",
            -abs(
                _money(
                    reconciliation.get(
                        "reversals"
                    )
                )
            ),
        ),
        row(
            "Allowance used on write-offs",
            -abs(
                _money(
                    reconciliation.get(
                        "allowance_used_on_writeoffs"
                    )
                )
            ),
        ),
        row(
            "Closing loss allowance",
            reconciliation.get(
                "closing_allowance"
            ),
            "total",
        ),
    ]

    impairment_rows = [
        row(
            "Gross receivables written off",
            reconciliation.get(
                "gross_writeoffs"
            ),
        ),
        row(
            "Additional loss recognised on write-off",
            reconciliation.get(
                "additional_writeoff_loss"
            ),
        ),
        row(
            "Recoveries of amounts previously written off",
            reconciliation.get(
                "recoveries"
            ),
        ),
    ]

    interest_rows = [
        row(
            "Effective-interest income",
            effective_interest.get(
                "interest_income"
            ),
        ),
        row(
            "Effective-interest expense",
            effective_interest.get(
                "interest_expense"
            ),
        ),
    ]

    other_gain_loss_rows = [
        row(
            "Modification gains",
            modifications.get("gains"),
        ),
        row(
            "Modification losses",
            -abs(
                _money(
                    modifications.get("losses")
                )
            ),
        ),
        row(
            "Derecognition gains",
            derecognitions.get("gains"),
        ),
        row(
            "Derecognition losses",
            -abs(
                _money(
                    derecognitions.get("losses")
                )
            ),
        ),
        row(
            "FVPL gains",
            fair_value.get("fvpl_gain"),
        ),
        row(
            "FVPL losses",
            -abs(
                _money(
                    fair_value.get("fvpl_loss")
                )
            ),
        ),
        row(
            "FVOCI gains",
            fair_value.get("fvoci_gain"),
        ),
        row(
            "FVOCI losses",
            -abs(
                _money(
                    fair_value.get("fvoci_loss")
                )
            ),
        ),
    ]

    hierarchy = (
        fair_value.get("hierarchy") or {}
    )

    hierarchy_rows = [
        row(
            "Level 1 fair values",
            hierarchy.get("level_1"),
        ),
        row(
            "Level 2 fair values",
            hierarchy.get("level_2"),
        ),
        row(
            "Level 3 fair values",
            hierarchy.get("level_3"),
        ),
    ]

    return {
        "meta": {
            "company_id": company_id,
            "company_name": (
                ctx.get("company_name")
                or ctx.get("name")
            ),
            "currency": (
                ctx.get("currency")
                or "USD"
            ),
            "statement":
                "ifrs9_disclosure",
            "report_name":
                "Financial Instruments Disclosure",
            "standard": "IFRS 9",
            "period": {
                "from":
                    date_from.isoformat(),
                "to":
                    date_to.isoformat(),
                "as_of":
                    as_of.isoformat(),
            },
        },
        "sections": [
            {
                "title":
                    "Financial instruments by measurement category",
                "columns": [
                    {
                        "key": "amount",
                        "label": "Carrying Amount",
                    }
                ],
                "rows": classification_rows,
            },
            {
                "title":
                    "Trade receivables",
                "columns": [
                    {
                        "key": "amount",
                        "label": "Amount",
                    }
                ],
                "rows": receivable_rows,
            },
            {
                "title":
                    "Trade receivables ageing",
                "columns": [
                    {
                        "key": "amount",
                        "label": "Gross Exposure",
                    }
                ],
                "rows": ageing_rows,
            },
            {
                "title":
                    "Loss allowance reconciliation",
                "columns": [
                    {
                        "key": "amount",
                        "label": "Amount",
                    }
                ],
                "rows": ecl_rows,
            },
            {
                "title":
                    "Write-offs and recoveries",
                "columns": [
                    {
                        "key": "amount",
                        "label": "Amount",
                    }
                ],
                "rows": impairment_rows,
            },
            {
                "title":
                    "Effective-interest income and expense",
                "columns": [
                    {
                        "key": "amount",
                        "label": "Amount",
                    }
                ],
                "rows": interest_rows,
            },
            {
                "title":
                    "Fair value, modification and derecognition gains or losses",
                "columns": [
                    {
                        "key": "amount",
                        "label": "Amount",
                    }
                ],
                "rows": other_gain_loss_rows,
            },
            {
                "title":
                    "Fair-value hierarchy",
                "columns": [
                    {
                        "key": "amount",
                        "label": "Carrying Amount",
                    }
                ],
                "rows": hierarchy_rows,
            },
        ],
        "source": strict,
    }

def build_ifrs9_note_export_payload(
    db,
    company_id,
    period_from,
    period_to,
    *,
    cur=None,
):
    note = (
        db.get_or_build_financial_statement_note(
            company_id,
            "ifrs9_financial_instruments_policy",
            period_from,
            period_to,
            cur=cur,
        )
    )

    disclosure = build_ifrs9_disclosure(
        db,
        company_id,
        period_from,
        period_to,
        as_of=period_to,
    )

    sections = []

    for section in (
        disclosure.get("sections") or []
    ):
        columns = (
            section.get("columns")
            or [
                {
                    "key": "amount",
                    "label": "Amount",
                }
            ]
        )

        sections.append({
            "title":
                section.get("title") or "",
            "rows":
                section.get("rows") or [],
            "columns": columns,
            "amount_keys": [
                column["key"]
                for column in columns
                if column.get("key")
            ],
            "amount_labels": {
                column["key"]: (
                    column.get("label")
                    or column["key"]
                )
                for column in columns
                if column.get("key")
            },
        })

    return {
        "title": "Financial instruments",
        "text": (
            note.get("content_text")
            or note.get("system_draft")
            or ""
        ),
        "sections": sections,
    }

def build_payroll_leave_liability_note_payload(
    note,
    disclosure,
):
    note=note or {}
    disclosure=disclosure or {}
    movement=disclosure.get("movement") or {}
    sections_data=disclosure.get("sections") or {}

    sections=[{
        "title":"Leave liability reconciliation",
        "rows":[
            {
                "label":"Opening liability",
                "values":{
                    "amount":_money(
                        movement.get(
                            "opening_liability"
                        )
                    ),
                },
                "row_type":"normal",
            },
            {
                "label":"Current service cost",
                "values":{
                    "amount":_money(
                        movement.get(
                            "current_service_cost"
                        )
                    ),
                },
                "row_type":"normal",
            },
            {
                "label":"Leave utilised",
                "values":{
                    "amount":-_money(
                        movement.get(
                            "leave_taken_amount"
                        )
                    ),
                },
                "row_type":"normal",
            },
            {
                "label":"Adjustments",
                "values":{
                    "amount":_money(
                        movement.get(
                            "adjustment_amount"
                        )
                    ),
                },
                "row_type":"normal",
            },
            {
                "label":"Closing leave liability",
                "values":{
                    "amount":_money(
                        movement.get(
                            "closing_liability"
                        )
                    ),
                },
                "row_type":"total",
            },
        ],
        "amount_keys":["amount"],
        "amount_labels":{
            "amount":"Current period",
        },
    }]

    leave_types=(
        sections_data.get("by_leave_type") or {}
    ).get("rows") or []

    if leave_types:
        sections.append({
            "title":"Leave liability by type",
            "rows":[{
                "label":
                    row.get("leave_type") or "Leave",
                "values":{
                    "closing_days":
                        row.get("closing_days") or 0,
                    "liability_amount":_money(
                        row.get("liability_amount")
                    ),
                },
                "row_type":"normal",
            } for row in leave_types],
            "amount_keys":[
                "closing_days",
                "liability_amount",
            ],
            "amount_labels":{
                "closing_days":"Days",
                "liability_amount":"Liability",
            },
        })

    departments=(
        sections_data.get("by_department") or {}
    ).get("rows") or []

    if departments:
        sections.append({
            "title":"Leave liability by department",
            "rows":[{
                "label":
                    row.get("department")
                    or "Unassigned",
                "values":{
                    "employee_count":
                        row.get("employee_count") or 0,
                    "closing_days":
                        row.get("closing_days") or 0,
                    "liability_amount":_money(
                        row.get("liability_amount")
                    ),
                },
                "row_type":"normal",
            } for row in departments],
            "amount_keys":[
                "employee_count",
                "closing_days",
                "liability_amount",
            ],
            "amount_labels":{
                "employee_count":"Employees",
                "closing_days":"Days",
                "liability_amount":"Liability",
            },
        })

    return{
        "title":
            note.get("note_title")
            or disclosure.get("title")
            or "Leave pay liability",
        "text":
            note.get("content_text")
            or note.get("system_draft")
            or "",
        "sections":sections,
        "meta":disclosure.get("meta") or {},
    }


def build_payroll_leave_liability_export_payload(
    disclosure,
):
    disclosure=disclosure or {}
    sections_data=disclosure.get("sections") or {}
    movement=disclosure.get("movement") or {}

    return{
        "meta":{
            **(disclosure.get("meta") or {}),
            "report_key":"ias19_leave_liability",
        },
        "title":"Leave pay liability",
        "sections":[
            {
                "title":"Leave liability reconciliation",
                "rows":[
                    {
                        "label":"Opening liability",
                        "amount":_money(
                            movement.get(
                                "opening_liability"
                            )
                        ),
                    },
                    {
                        "label":"Current service cost",
                        "amount":_money(
                            movement.get(
                                "current_service_cost"
                            )
                        ),
                    },
                    {
                        "label":"Leave utilised",
                        "amount":-_money(
                            movement.get(
                                "leave_taken_amount"
                            )
                        ),
                    },
                    {
                        "label":"Adjustments",
                        "amount":_money(
                            movement.get(
                                "adjustment_amount"
                            )
                        ),
                    },
                    {
                        "label":"Closing liability",
                        "amount":_money(
                            movement.get(
                                "closing_liability"
                            )
                        ),
                    },
                ],
                "amount_keys":["amount"],
                "amount_labels":{
                    "amount":"Current period",
                },
            },
            {
                "title":"Leave liability by type",
                "rows":(
                    sections_data.get(
                        "by_leave_type"
                    ) or {}
                ).get("rows") or [],
                "amount_keys":[
                    "closing_days",
                    "liability_amount",
                ],
                "amount_labels":{
                    "closing_days":"Days",
                    "liability_amount":"Liability",
                },
            },
            {
                "title":"Leave liability by department",
                "rows":(
                    sections_data.get(
                        "by_department"
                    ) or {}
                ).get("rows") or [],
                "amount_keys":[
                    "employee_count",
                    "closing_days",
                    "liability_amount",
                ],
                "amount_labels":{
                    "employee_count":"Employees",
                    "closing_days":"Days",
                    "liability_amount":"Liability",
                },
            },
        ],
        "totals":disclosure.get("totals") or {},
        "disclosure":disclosure,
    }

def build_ppe_disclosure_multi_year(
    db,
    company_id: int,
    date_from: date,
    date_to: date,
    *,
    comparison_years: int = 1,
):
    current = _with_comparative_disclosures(
        build_fn=build_ppe_disclosure,
        db=db,
        company_id=company_id,
        date_from=date_from,
        date_to=date_to,
        comparison_years=comparison_years,
    )

    payloads = [current] + (current.get("comparison_disclosures") or [])

    comparison_columns = []
    summary_map = {}

    preferred_order = [
        "Opening carrying amount",
        "Additions",
        "Disposals",
        "Depreciation charge",
        "Impairment",
        "Revaluation movement",
        "Closing carrying amount",
    ]

    for idx, p in enumerate(payloads):
        meta = p.get("meta") or {}
        year = str((meta.get("period") or {}).get("to") or "")[:4]
        key = "cur" if idx == 0 else ("pri" if idx == 1 else f"p{idx}")

        comparison_columns.append({
            "key": key,
            "label": year or key.upper(),
        })

        for r in p.get("rows") or []:
            label = r.get("label") or ""
            if not label:
                continue

            if label not in summary_map:
                summary_map[label] = {
                    "label": label,
                    "values": {},
                    "row_type": r.get("row_type") or "normal",
                }

            summary_map[label]["values"][key] = (r.get("values") or {}).get("total", 0)

            if (r.get("row_type") or "").lower() == "total":
                summary_map[label]["row_type"] = "total"

    summary_rows = []

    for label in preferred_order:
        if label in summary_map:
            summary_rows.append(summary_map[label])

    for label, row in summary_map.items():
        if label not in preferred_order:
            summary_rows.append(row)

    current["comparison_columns"] = comparison_columns
    current["comparison_summary_rows"] = summary_rows

    current.setdefault("meta", {})
    current["meta"]["comparison_years"] = comparison_years

    return current


def build_lease_disclosure_multi_year(
    db,
    company_id: int,
    date_from: date,
    date_to: date,
    *,
    as_of: date | None = None,
    comparison_years: int = 1,
):
    current = _with_comparative_disclosures(
        build_fn=build_lease_disclosure,
        db=db,
        company_id=company_id,
        date_from=date_from,
        date_to=date_to,
        comparison_years=comparison_years,
        as_of=as_of or date_to,
    )

    payloads = [current] + (current.get("comparison_disclosures") or [])

    comparison_columns = []
    summary_map = {}

    preferred_order = [
        "Opening lease liability",
        "Lease additions",
        "Interest expense",
        "Lease payments",
        "Closing lease liability",
        "Right-of-use assets",
    ]

    for idx, p in enumerate(payloads):
        meta = p.get("meta") or {}
        year = str((meta.get("period") or {}).get("to") or "")[:4]

        key = "cur" if idx == 0 else ("pri" if idx == 1 else f"p{idx}")

        comparison_columns.append({
            "key": key,
            "label": year or key.upper(),
        })

        for r in p.get("rows") or []:
            label = r.get("label") or ""
            if not label:
                continue

            if label not in summary_map:
                summary_map[label] = {
                    "label": label,
                    "values": {},
                    "row_type": r.get("row_type") or "normal",
                }

            summary_map[label]["values"][key] = (
                (r.get("values") or {}).get("amount")
                or (r.get("values") or {}).get("total")
                or 0
            )

            if (r.get("row_type") or "").lower() == "total":
                summary_map[label]["row_type"] = "total"

    summary_rows = []

    for label in preferred_order:
        if label in summary_map:
            summary_rows.append(summary_map[label])

    for label, row in summary_map.items():
        if label not in preferred_order:
            summary_rows.append(row)

    current["comparison_columns"] = comparison_columns
    current["comparison_summary_rows"] = summary_rows

    current.setdefault("meta", {})
    current["meta"]["comparison_years"] = comparison_years

    return current

def build_revenue_disclosure_multi_year(
    db,
    company_id: int,
    date_from: date,
    date_to: date,
    *,
    comparison_years: int = 1,
):
    current = _with_comparative_disclosures(
        build_fn=build_revenue_disclosure,
        db=db,
        company_id=company_id,
        date_from=date_from,
        date_to=date_to,
        comparison_years=comparison_years,
    )

    payloads = [current] + (current.get("comparison_disclosures") or [])

    comparison_columns = []
    summary_map = {}

    preferred_order = [
        "Revenue recognised",
        "Contract assets",
        "Contract liabilities",
        "Receivables from contracts with customers",
        "Over time",
        "Point in time",
        "Transaction price allocated to unsatisfied or partially unsatisfied performance obligations",
    ]

    for idx, p in enumerate(payloads):
        meta = p.get("meta") or {}
        year = str((meta.get("period") or {}).get("to") or "")[:4]
        key = "cur" if idx == 0 else ("pri" if idx == 1 else f"p{idx}")

        comparison_columns.append({
            "key": key,
            "label": year or key.upper(),
        })

        for r in p.get("rows") or []:
            label = r.get("label") or ""
            if not label:
                continue

            # Skip section headers in comparison summary
            if (r.get("row_type") or "").lower() == "header":
                continue

            if label not in summary_map:
                summary_map[label] = {
                    "label": label,
                    "values": {},
                    "row_type": r.get("row_type") or "normal",
                }

            summary_map[label]["values"][key] = (
                (r.get("values") or {}).get("amount")
                or (r.get("values") or {}).get("total")
                or 0
            )

            if (r.get("row_type") or "").lower() == "total":
                summary_map[label]["row_type"] = "total"

    summary_rows = []

    for label in preferred_order:
        if label in summary_map:
            summary_rows.append(summary_map[label])

    for label, row in summary_map.items():
        if label not in preferred_order:
            summary_rows.append(row)

    current["comparison_columns"] = comparison_columns
    current["comparison_summary_rows"] = summary_rows

    current.setdefault("meta", {})
    current["meta"]["comparison_years"] = comparison_years

    return current