
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

def build_lease_note_export_payload(db, company_id, period_from, period_to, *, cur=None):
    note = db.get_or_build_financial_statement_note(
        company_id,
        "ifrs16_lease_policy",
        period_from,
        period_to,
        cur=cur,
    )

    lease_payload = build_lease_disclosure(
        db,
        company_id,
        period_from,
        period_to,
        as_of=period_to,
    )

    return {
        "title": "Leases",
        "text": note.get("content_text") or note.get("system_draft") or "",
        "sections": lease_payload.get("sections") or [],
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

        disposals = _n(r.get("disposals_carrying"))

        depreciation = _n(r.get("depreciation_charge"))

        impairment = (
            _n(r.get("impairment_losses"))
            - _n(r.get("impairment_reversals"))
        )

        revaluation = (
            _n(r.get("revaluation_upward"))
            + _n(r.get("revaluation_downward"))
        )

        values = {
            "opening_carrying": _n(r.get("opening_carrying")),
            "additions": additions,
            "disposals": disposals,
            "depreciation": -abs(depreciation),
            "impairment": -abs(impairment),
            "revaluation": revaluation,
            "closing_carrying": _n(r.get("closing_carrying")),
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
            "currency": ctx.get("currency") or "ZAR",
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
        "currency": ctx.get("currency") or "ZAR",
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
                "columns": payload.get("columns") or [],
                "amount_keys": [
                    c["key"]
                    for c in (payload.get("columns") or [])
                ],
                "amount_labels": {
                    c["key"]: c["label"]
                    for c in (payload.get("columns") or [])
                },
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

def build_ppe_disclosure_multi_year(
    db,
    company_id: int,
    date_from: date,
    date_to: date,
    *,
    comparison_years: int = 1,
):
    return _with_comparative_disclosures(
        build_fn=build_ppe_disclosure,
        db=db,
        company_id=company_id,
        date_from=date_from,
        date_to=date_to,
        comparison_years=comparison_years,
    )


def build_lease_disclosure_multi_year(
    db,
    company_id: int,
    date_from: date,
    date_to: date,
    *,
    as_of: date | None = None,
    comparison_years: int = 1,
):
    return _with_comparative_disclosures(
        build_fn=build_lease_disclosure,
        db=db,
        company_id=company_id,
        date_from=date_from,
        date_to=date_to,
        comparison_years=comparison_years,
        as_of=as_of or date_to,
    )


def build_revenue_disclosure_multi_year(
    db,
    company_id: int,
    date_from: date,
    date_to: date,
    *,
    comparison_years: int = 1,
):
    return _with_comparative_disclosures(
        build_fn=build_revenue_disclosure,
        db=db,
        company_id=company_id,
        date_from=date_from,
        date_to=date_to,
        comparison_years=comparison_years,
    )