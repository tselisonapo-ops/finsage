from __future__ import annotations


def _f(v):
    try:
        return float(v or 0)
    except Exception:
        return 0.0


def _date(v):
    return str(v)[:10] if v else None


def build_revenue_contracts_report(db, company_id, *, q="", status="", limit=500):
    rows = db.list_revenue_contracts(
        int(company_id),
        limit=int(limit or 500),
        q=q or None,
        status=status or None,
    ) or []

    out = [{
        "id": r.get("id"),
        "contract_number": r.get("contract_number"),
        "contract_title": r.get("contract_title"),
        "customer_name": r.get("customer_name"),
        "status": r.get("status"),
        "approval_status": r.get("approval_status"),
        "billing_method": r.get("billing_method"),
        "settlement_pattern": r.get("settlement_pattern"),
        "currency": r.get("contract_currency"),
        "contract_date": _date(r.get("contract_date")),
        "start_date": _date(r.get("start_date")),
        "end_date": _date(r.get("end_date")),
        "transaction_price": _f(r.get("transaction_price")),
        "recognized_revenue_to_date": _f(r.get("recognized_revenue_to_date")),
        "billed_to_date": _f(r.get("billed_to_date")),
        "cash_received_to_date": _f(r.get("cash_received_to_date")),
        "contract_position_type": r.get("contract_position_type"),
        "contract_position_amount": _f(r.get("contract_position_amount")),
    } for r in rows]

    columns = [
        {"key": "contract_number", "label": "Contract No"},
        {"key": "contract_title", "label": "Title"},
        {"key": "customer_name", "label": "Customer"},
        {"key": "status", "label": "Status"},
        {"key": "approval_status", "label": "Approval"},
        {"key": "billing_method", "label": "Billing Method"},
        {"key": "settlement_pattern", "label": "Settlement"},
        {"key": "currency", "label": "Currency"},
        {"key": "contract_date", "label": "Contract Date"},
        {"key": "transaction_price", "label": "Transaction Price"},
        {"key": "recognized_revenue_to_date", "label": "Recognized"},
        {"key": "billed_to_date", "label": "Billed"},
        {"key": "cash_received_to_date", "label": "Cash"},
        {"key": "contract_position_type", "label": "Position"},
        {"key": "contract_position_amount", "label": "Position Amount"},
    ]

    totals = {
        "transaction_price": sum(_f(r["transaction_price"]) for r in out),
        "recognized": sum(_f(r["recognized_revenue_to_date"]) for r in out),
        "billed": sum(_f(r["billed_to_date"]) for r in out),
        "cash": sum(_f(r["cash_received_to_date"]) for r in out),
        "row_count": len(out),
    }

    return out, columns, totals


def build_revenue_obligations_report(db, company_id, *, contract_id=None, q="", status="", limit=1000):
    schema = db.company_schema(company_id)

    params = [int(company_id)]
    where = ["o.company_id = %s"]

    if contract_id:
        where.append("o.contract_id = %s")
        params.append(int(contract_id))

    if status:
        where.append("o.obligation_status = %s")
        params.append(status)

    if q:
        like = f"%{q}%"
        where.append("(o.obligation_code ILIKE %s OR o.obligation_name ILIKE %s OR c.contract_number ILIKE %s)")
        params.extend([like, like, like])

    sql = f"""
    SELECT
        o.id,
        o.contract_id,
        c.contract_number,
        c.contract_title,
        o.obligation_code,
        o.obligation_name,
        o.obligation_status,
        o.recognition_timing,
        o.progress_method,
        o.satisfaction_status,
        o.satisfied_at,
        o.standalone_selling_price,
        o.allocated_transaction_price,
        o.expected_total_cost,
        o.actual_cost_to_date,
        o.progress_percent,
        o.revenue_to_date,
        o.recognized_at_point_in_time_date,
        o.recognition_trigger,
        o.satisfaction_evidence_ref,
        o.created_at
    FROM {schema}.revenue_obligations o
    LEFT JOIN {schema}.revenue_contracts c
      ON c.id = o.contract_id
    WHERE {" AND ".join(where)}
    ORDER BY c.contract_number, o.id
    LIMIT %s
    """
    params.append(int(limit or 1000))

    rows = db.fetch_all(sql, tuple(params)) or []

    out = [{
        **r,
        "satisfied_at": _date(r.get("satisfied_at")),
        "recognized_at_point_in_time_date": _date(r.get("recognized_at_point_in_time_date")),
        "standalone_selling_price": _f(r.get("standalone_selling_price")),
        "allocated_transaction_price": _f(r.get("allocated_transaction_price")),
        "expected_total_cost": _f(r.get("expected_total_cost")),
        "actual_cost_to_date": _f(r.get("actual_cost_to_date")),
        "progress_percent": _f(r.get("progress_percent")),
        "revenue_to_date": _f(r.get("revenue_to_date")),
    } for r in rows]

    columns = [
        {"key": "contract_number", "label": "Contract"},
        {"key": "obligation_code", "label": "Code"},
        {"key": "obligation_name", "label": "Obligation"},
        {"key": "obligation_status", "label": "Status"},
        {"key": "recognition_timing", "label": "Timing"},
        {"key": "progress_method", "label": "Method"},
        {"key": "satisfaction_status", "label": "Satisfaction"},
        {"key": "allocated_transaction_price", "label": "Allocated Price"},
        {"key": "progress_percent", "label": "Progress %"},
        {"key": "revenue_to_date", "label": "Revenue To Date"},
        {"key": "satisfied_at", "label": "Satisfied At"},
    ]

    totals = {
        "allocated_transaction_price": sum(_f(r["allocated_transaction_price"]) for r in out),
        "revenue_to_date": sum(_f(r["revenue_to_date"]) for r in out),
        "row_count": len(out),
    }

    return out, columns, totals


def build_revenue_events_report(db, company_id, *, event_kind, contract_id=None, date_from=None, date_to=None, q="", limit=1000):
    schema = db.company_schema(company_id)

    table = "revenue_billing_events" if event_kind == "billing" else "revenue_cash_events"
    source_col = "source_invoice_id" if event_kind == "billing" else "source_receipt_id"

    params = [int(company_id)]
    where = ["e.company_id = %s"]

    if contract_id:
        where.append("e.contract_id = %s")
        params.append(int(contract_id))

    if date_from:
        where.append("e.event_date >= %s")
        params.append(date_from)

    if date_to:
        where.append("e.event_date <= %s")
        params.append(date_to)

    if q:
        like = f"%{q}%"
        where.append("(c.contract_number ILIKE %s OR c.contract_title ILIKE %s OR COALESCE(e.notes,'') ILIKE %s)")
        params.extend([like, like, like])

    sql = f"""
    SELECT
        e.id,
        e.contract_id,
        c.contract_number,
        c.contract_title,
        e.obligation_id,
        o.obligation_code,
        o.obligation_name,
        e.event_date,
        e.event_type,
        e.{source_col} AS source_id,
        e.amount,
        e.currency,
        e.notes,
        e.created_at
    FROM {schema}.{table} e
    LEFT JOIN {schema}.revenue_contracts c
      ON c.id = e.contract_id
    LEFT JOIN {schema}.revenue_obligations o
      ON o.id = e.obligation_id
    WHERE {" AND ".join(where)}
    ORDER BY e.event_date DESC, e.id DESC
    LIMIT %s
    """
    params.append(int(limit or 1000))

    rows = db.fetch_all(sql, tuple(params)) or []

    out = [{
        **r,
        "event_date": _date(r.get("event_date")),
        "amount": _f(r.get("amount")),
    } for r in rows]

    columns = [
        {"key": "event_date", "label": "Date"},
        {"key": "contract_number", "label": "Contract"},
        {"key": "obligation_name", "label": "Obligation"},
        {"key": "event_type", "label": "Type"},
        {"key": "source_id", "label": "Source ID"},
        {"key": "amount", "label": "Amount"},
        {"key": "currency", "label": "Currency"},
        {"key": "notes", "label": "Notes"},
    ]

    totals = {
        "amount": sum(_f(r["amount"]) for r in out),
        "row_count": len(out),
    }

    return out, columns, totals


def build_revenue_progress_report(db, company_id, *, contract_id=None, obligation_id=None, date_from=None, date_to=None, limit=1000):
    schema = db.company_schema(company_id)

    params = [int(company_id)]
    where = ["p.company_id = %s"]

    if contract_id:
        where.append("p.contract_id = %s")
        params.append(int(contract_id))

    if obligation_id:
        where.append("p.obligation_id = %s")
        params.append(int(obligation_id))

    if date_from:
        where.append("p.period_end >= %s")
        params.append(date_from)

    if date_to:
        where.append("p.period_end <= %s")
        params.append(date_to)

    sql = f"""
    SELECT
        p.id,
        p.contract_id,
        c.contract_number,
        c.contract_title,
        p.obligation_id,
        o.obligation_code,
        o.obligation_name,
        p.period_end,
        p.update_type,
        p.expected_total_cost,
        p.actual_cost_to_date,
        p.progress_percent,
        p.units_done,
        p.units_total,
        p.milestone_code,
        p.notes,
        p.created_at
    FROM {schema}.revenue_progress_updates p
    LEFT JOIN {schema}.revenue_contracts c
      ON c.id = p.contract_id
    LEFT JOIN {schema}.revenue_obligations o
      ON o.id = p.obligation_id
    WHERE {" AND ".join(where)}
    ORDER BY p.period_end DESC, p.id DESC
    LIMIT %s
    """
    params.append(int(limit or 1000))

    rows = db.fetch_all(sql, tuple(params)) or []

    out = [{
        **r,
        "period_end": _date(r.get("period_end")),
        "expected_total_cost": _f(r.get("expected_total_cost")),
        "actual_cost_to_date": _f(r.get("actual_cost_to_date")),
        "progress_percent": _f(r.get("progress_percent")),
        "units_done": _f(r.get("units_done")),
        "units_total": _f(r.get("units_total")),
    } for r in rows]

    columns = [
        {"key": "period_end", "label": "Period End"},
        {"key": "contract_number", "label": "Contract"},
        {"key": "obligation_name", "label": "Obligation"},
        {"key": "update_type", "label": "Type"},
        {"key": "expected_total_cost", "label": "Expected Cost"},
        {"key": "actual_cost_to_date", "label": "Actual Cost"},
        {"key": "progress_percent", "label": "Progress %"},
        {"key": "units_done", "label": "Units Done"},
        {"key": "units_total", "label": "Units Total"},
        {"key": "milestone_code", "label": "Milestone"},
        {"key": "notes", "label": "Notes"},
    ]

    totals = {
        "actual_cost_to_date": sum(_f(r["actual_cost_to_date"]) for r in out),
        "row_count": len(out),
    }

    return out, columns, totals


def build_revenue_runs_report(db, company_id, *, contract_id=None, date_from=None, date_to=None, status="", limit=1000):
    schema = db.company_schema(company_id)

    params = [int(company_id)]
    where = ["r.company_id = %s"]

    if contract_id:
        where.append("r.contract_id = %s")
        params.append(int(contract_id))

    if status:
        where.append("r.status = %s")
        params.append(status)

    if date_from:
        where.append("r.period_end >= %s")
        params.append(date_from)

    if date_to:
        where.append("r.period_end <= %s")
        params.append(date_to)

    sql = f"""
    SELECT
        r.id,
        r.contract_id,
        c.contract_number,
        c.contract_title,
        r.run_scope,
        r.period_start,
        r.period_end,
        r.status,
        r.run_reason,
        r.journal_id,
        r.total_revenue_delta,
        r.total_contract_asset_delta,
        r.total_contract_liability_delta,
        r.posted_at,
        r.created_at
    FROM {schema}.revenue_recognition_runs r
    LEFT JOIN {schema}.revenue_contracts c
      ON c.id = r.contract_id
    WHERE {" AND ".join(where)}
    ORDER BY r.id DESC
    LIMIT %s
    """
    params.append(int(limit or 1000))

    rows = db.fetch_all(sql, tuple(params)) or []

    out = [{
        **r,
        "period_start": _date(r.get("period_start")),
        "period_end": _date(r.get("period_end")),
        "posted_at": str(r.get("posted_at") or "")[:19] if r.get("posted_at") else None,
        "total_revenue_delta": _f(r.get("total_revenue_delta")),
        "total_contract_asset_delta": _f(r.get("total_contract_asset_delta")),
        "total_contract_liability_delta": _f(r.get("total_contract_liability_delta")),
    } for r in rows]

    columns = [
        {"key": "id", "label": "Run ID"},
        {"key": "contract_number", "label": "Contract"},
        {"key": "run_scope", "label": "Scope"},
        {"key": "period_start", "label": "From"},
        {"key": "period_end", "label": "To"},
        {"key": "status", "label": "Status"},
        {"key": "run_reason", "label": "Reason"},
        {"key": "journal_id", "label": "Journal"},
        {"key": "total_revenue_delta", "label": "Revenue Delta"},
        {"key": "total_contract_asset_delta", "label": "Asset Delta"},
        {"key": "total_contract_liability_delta", "label": "Liability Delta"},
    ]

    totals = {
        "total_revenue_delta": sum(_f(r["total_revenue_delta"]) for r in out),
        "total_contract_asset_delta": sum(_f(r["total_contract_asset_delta"]) for r in out),
        "total_contract_liability_delta": sum(_f(r["total_contract_liability_delta"]) for r in out),
        "row_count": len(out),
    }

    return out, columns, totals


def build_revenue_run_entries_report(db, company_id, *, run_id=None, contract_id=None, date_from=None, date_to=None, limit=2000):
    schema = db.company_schema(company_id)

    params = [int(company_id)]
    where = ["e.company_id = %s"]

    if run_id:
        where.append("e.run_id = %s")
        params.append(int(run_id))

    if contract_id:
        where.append("e.contract_id = %s")
        params.append(int(contract_id))

    if date_from:
        where.append("e.period_end >= %s")
        params.append(date_from)

    if date_to:
        where.append("e.period_end <= %s")
        params.append(date_to)

    sql = f"""
    SELECT
        e.id,
        e.run_id,
        e.contract_id,
        c.contract_number,
        c.contract_title,
        e.obligation_id,
        o.obligation_code,
        o.obligation_name,
        e.period_start,
        e.period_end,
        e.revenue_required_to_date,
        e.revenue_previously_recognized,
        e.revenue_delta_this_run,
        e.billed_to_date,
        e.cash_received_to_date,
        e.contract_asset_delta,
        e.contract_liability_delta,
        e.source_basis,
        e.notes,
        e.created_at
    FROM {schema}.revenue_recognition_entries e
    LEFT JOIN {schema}.revenue_contracts c
      ON c.id = e.contract_id
    LEFT JOIN {schema}.revenue_obligations o
      ON o.id = e.obligation_id
    WHERE {" AND ".join(where)}
    ORDER BY e.run_id DESC, e.id ASC
    LIMIT %s
    """
    params.append(int(limit or 2000))

    rows = db.fetch_all(sql, tuple(params)) or []

    out = [{
        **r,
        "period_start": _date(r.get("period_start")),
        "period_end": _date(r.get("period_end")),
        "revenue_delta_this_run": _f(r.get("revenue_delta_this_run")),
        "contract_asset_delta": _f(r.get("contract_asset_delta")),
        "contract_liability_delta": _f(r.get("contract_liability_delta")),
    } for r in rows]

    columns = [
        {"key": "run_id", "label": "Run"},
        {"key": "contract_number", "label": "Contract"},
        {"key": "obligation_name", "label": "Obligation"},
        {"key": "period_start", "label": "From"},
        {"key": "period_end", "label": "To"},
        {"key": "revenue_required_to_date", "label": "Required To Date"},
        {"key": "revenue_previously_recognized", "label": "Previously Recognized"},
        {"key": "revenue_delta_this_run", "label": "Revenue Delta"},
        {"key": "billed_to_date", "label": "Billed To Date"},
        {"key": "cash_received_to_date", "label": "Cash To Date"},
        {"key": "contract_asset_delta", "label": "Asset Delta"},
        {"key": "contract_liability_delta", "label": "Liability Delta"},
        {"key": "source_basis", "label": "Basis"},
    ]

    totals = {
        "revenue_delta_this_run": sum(_f(r["revenue_delta_this_run"]) for r in out),
        "contract_asset_delta": sum(_f(r["contract_asset_delta"]) for r in out),
        "contract_liability_delta": sum(_f(r["contract_liability_delta"]) for r in out),
        "row_count": len(out),
    }

    return out, columns, totals