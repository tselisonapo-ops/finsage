from __future__ import annotations

from datetime import date
from decimal import Decimal


def _d(v):
    try:
        return Decimal(str(v or 0))
    except Exception:
        return Decimal("0")


def build_ar_control_reconciliation_report(db, company_id: int, *, as_at: date | None = None):
    data = db.get_ar_control_reconciliation(company_id, as_at=as_at) or {}

    rows = []
    for r in data.get("customers") or []:
        rows.append({
            "customer_id": r.get("customer_id"),
            "customer_name": r.get("customer_name") or "",
            "balance": float(_d(r.get("balance"))),
        })

    columns = [
        {"key": "customer_name", "label": "Customer"},
        {"key": "customer_id", "label": "Customer ID"},
        {"key": "balance", "label": "Balance"},
    ]

    totals = {
        "control_balance": float(_d(data.get("control_balance"))),
        "subledger_total": float(_d(data.get("subledger_total"))),
        "difference": float(_d(data.get("difference"))),
        "is_balanced": bool(data.get("is_balanced")),
        "row_count": len(rows),
    }

    extra_meta = {
        "as_at": data.get("as_at"),
        "ar_account": data.get("ar_account"),
    }

    return rows, columns, totals, extra_meta


def build_ap_control_reconciliation_report(db, company_id: int, *, as_at: date | None = None):
    data = db.get_ap_control_reconciliation(company_id, as_at=as_at) or {}

    rows = []
    for r in data.get("vendors") or []:
        rows.append({
            "vendor_id": r.get("vendor_id"),
            "vendor_name": r.get("vendor_name") or "",
            "balance": float(_d(r.get("balance"))),
        })

    columns = [
        {"key": "vendor_name", "label": "Vendor"},
        {"key": "vendor_id", "label": "Vendor ID"},
        {"key": "balance", "label": "Balance"},
    ]

    totals = {
        "control_balance": float(_d(data.get("control_balance"))),
        "subledger_total": float(_d(data.get("subledger_total"))),
        "difference": float(_d(data.get("difference"))),
        "is_balanced": bool(data.get("is_balanced")),
        "row_count": len(rows),
    }

    extra_meta = {
        "as_at": data.get("as_at"),
        "ap_account": data.get("ap_account"),
    }

    return rows, columns, totals, extra_meta


def build_customer_statement_report(
    db,
    company_id: int,
    *,
    customer_id: int,
    date_from=None,
    date_to=None,
):
    if not customer_id:
        raise ValueError("customer_id is required")

    schema = db.company_schema(company_id)
    ar_ctl = db.get_ar_control_balance(company_id, as_of=date_to).get("ar_account")

    params = [int(company_id), ar_ctl, int(customer_id)]
    where = [
        "l.company_id = %s",
        "l.account = %s",
        "l.customer_id = %s",
    ]

    if date_to:
        ob_row = db.fetch_one(
            f"""
            SELECT COALESCE(SUM(l.debit - l.credit), 0)::numeric(18,2) AS opening_balance
            FROM {schema}.ledger l
            WHERE l.company_id=%s
              AND l.account=%s
              AND l.customer_id=%s
              AND l.date < %s
            """,
            (int(company_id), ar_ctl, int(customer_id), date_from),
        ) if date_from else {"opening_balance": 0}
        opening_balance = _d((ob_row or {}).get("opening_balance"))
    else:
        opening_balance = Decimal("0")

    if date_from:
        where.append("l.date >= %s")
        params.append(date_from)
    if date_to:
        where.append("l.date <= %s")
        params.append(date_to)

    sql = f"""
    SELECT
        l.id,
        l.date,
        COALESCE(l.ref, j.ref, '') AS ref,
        COALESCE(l.memo, j.description, '') AS memo,
        COALESCE(l.debit, 0) AS debit,
        COALESCE(l.credit, 0) AS credit
    FROM {schema}.ledger l
    LEFT JOIN {schema}.journal j
      ON j.id = l.journal_id
    WHERE {" AND ".join(where)}
    ORDER BY l.date ASC, l.id ASC
    """
    lines = db.fetch_all(sql, tuple(params)) or []

    cust = db.fetch_one(
        f"SELECT id, name FROM {schema}.customers WHERE id=%s LIMIT 1",
        (int(customer_id),),
    ) or {}

    running = opening_balance
    rows = []

    for ln in lines:
        debit = _d(ln.get("debit"))
        credit = _d(ln.get("credit"))
        movement = debit - credit
        running += movement

        rows.append({
            "date": str(ln.get("date")) if ln.get("date") else None,
            "ref": ln.get("ref") or "",
            "memo": ln.get("memo") or "",
            "debit": float(debit),
            "credit": float(credit),
            "movement": float(movement),
            "balance": float(running),
        })

    columns = [
        {"key": "date", "label": "Date"},
        {"key": "ref", "label": "Ref"},
        {"key": "memo", "label": "Memo"},
        {"key": "debit", "label": "Debit"},
        {"key": "credit", "label": "Credit"},
        {"key": "movement", "label": "Movement"},
        {"key": "balance", "label": "Balance"},
    ]

    totals = {
        "opening_balance": float(opening_balance),
        "closing_balance": float(running),
        "row_count": len(rows),
    }

    extra_meta = {
        "customer_id": int(customer_id),
        "customer_name": cust.get("name") or f"#{customer_id}",
        "ar_account": ar_ctl,
    }

    return rows, columns, totals, extra_meta


def build_vendor_statement_report(
    db,
    company_id: int,
    *,
    vendor_id: int,
    date_from=None,
    date_to=None,
):
    if not vendor_id:
        raise ValueError("vendor_id is required")

    schema = db.company_schema(company_id)
    ap_ctl = db.get_ap_control_balance(company_id, as_of=date_to).get("ap_account")

    params = [int(company_id), ap_ctl, int(vendor_id)]
    where = [
        "l.company_id = %s",
        "l.account = %s",
        "l.vendor_id = %s",
    ]

    if date_to:
        ob_row = db.fetch_one(
            f"""
            SELECT COALESCE(SUM(l.credit - l.debit), 0)::numeric(18,2) AS opening_balance
            FROM {schema}.ledger l
            WHERE l.company_id=%s
              AND l.account=%s
              AND l.vendor_id=%s
              AND l.date < %s
            """,
            (int(company_id), ap_ctl, int(vendor_id), date_from),
        ) if date_from else {"opening_balance": 0}
        opening_balance = _d((ob_row or {}).get("opening_balance"))
    else:
        opening_balance = Decimal("0")

    if date_from:
        where.append("l.date >= %s")
        params.append(date_from)
    if date_to:
        where.append("l.date <= %s")
        params.append(date_to)

    sql = f"""
    SELECT
        l.id,
        l.date,
        COALESCE(l.ref, j.ref, '') AS ref,
        COALESCE(l.memo, j.description, '') AS memo,
        COALESCE(l.debit, 0) AS debit,
        COALESCE(l.credit, 0) AS credit
    FROM {schema}.ledger l
    LEFT JOIN {schema}.journal j
      ON j.id = l.journal_id
    WHERE {" AND ".join(where)}
    ORDER BY l.date ASC, l.id ASC
    """
    lines = db.fetch_all(sql, tuple(params)) or []

    ven = db.fetch_one(
        f"SELECT id, name FROM {schema}.vendors WHERE id=%s LIMIT 1",
        (int(vendor_id),),
    ) or {}

    running = opening_balance
    rows = []

    for ln in lines:
        debit = _d(ln.get("debit"))
        credit = _d(ln.get("credit"))
        movement = credit - debit
        running += movement

        rows.append({
            "date": str(ln.get("date")) if ln.get("date") else None,
            "ref": ln.get("ref") or "",
            "memo": ln.get("memo") or "",
            "debit": float(debit),
            "credit": float(credit),
            "movement": float(movement),
            "balance": float(running),
        })

    columns = [
        {"key": "date", "label": "Date"},
        {"key": "ref", "label": "Ref"},
        {"key": "memo", "label": "Memo"},
        {"key": "debit", "label": "Debit"},
        {"key": "credit", "label": "Credit"},
        {"key": "movement", "label": "Movement"},
        {"key": "balance", "label": "Balance"},
    ]

    totals = {
        "opening_balance": float(opening_balance),
        "closing_balance": float(running),
        "row_count": len(rows),
    }

    extra_meta = {
        "vendor_id": int(vendor_id),
        "vendor_name": ven.get("name") or f"#{vendor_id}",
        "ap_account": ap_ctl,
    }

    return rows, columns, totals, extra_meta


def build_ar_aging_report(db, company_id: int, *, as_at: date, customer_id: int | None = None):
    schema = db.company_schema(company_id)

    params = [int(company_id), as_at]
    where = [
        "i.company_id = %s",
        "LOWER(COALESCE(i.status,'')) NOT IN ('draft','cancelled','reversed','paid')",
        "COALESCE(i.balance_due, 0) > 0",
        "i.date <= %s",
    ]

    if customer_id:
        where.append("i.customer_id = %s")
        params.append(int(customer_id))

    sql = f"""
    SELECT
        i.id AS invoice_id,
        i.customer_id,
        COALESCE(c.name, '') AS customer_name,
        COALESCE(i.number, '') AS invoice_number,
        i.date AS inv_date,
        i.due_date,
        COALESCE(i.balance_due, 0) AS balance_due
    FROM {schema}.invoices i
    LEFT JOIN {schema}.customers c
      ON c.id = i.customer_id
    WHERE {" AND ".join(where)}
    ORDER BY i.customer_id ASC, i.due_date ASC, i.id ASC
    """
    rows = db.fetch_all(sql, tuple(params)) or []

    out_rows = []
    grand = {
        "0_30": Decimal("0"),
        "31_60": Decimal("0"),
        "61_90": Decimal("0"),
        "121_plus": Decimal("0"),
        "total": Decimal("0"),
    }

    for r in rows:
        due_date = r.get("due_date")
        if not due_date:
            days = 0
        else:
            days = (as_at - due_date).days

        amt = _d(r.get("balance_due"))

        b0 = b31 = b61 = b121 = Decimal("0")
        if days <= 30:
            b0 = amt
        elif days <= 60:
            b31 = amt
        elif days <= 90:
            b61 = amt
        else:
            b121 = amt

        grand["0_30"] += b0
        grand["31_60"] += b31
        grand["61_90"] += b61
        grand["121_plus"] += b121
        grand["total"] += amt

        out_rows.append({
            "customer_name": r.get("customer_name") or "",
            "customer_id": r.get("customer_id"),
            "invoice_id": r.get("invoice_id"),
            "invoice": r.get("invoice_number") or "",
            "inv_date": str(r.get("inv_date")) if r.get("inv_date") else None,
            "due": str(r.get("due_date")) if r.get("due_date") else None,
            "outstanding": float(amt),
            "days_bucket": (
                "0_30" if b0 else
                "31_60" if b31 else
                "61_90" if b61 else
                "121_plus"
            ),
        })

    columns = [
        {"key": "customer_name", "label": "Customer"},
        {"key": "customer_id", "label": "Customer ID"},
        {"key": "invoice_id", "label": "Invoice ID"},
        {"key": "invoice", "label": "Invoice"},
        {"key": "inv_date", "label": "Inv Date"},
        {"key": "due", "label": "Due"},
        {"key": "outstanding", "label": "Outstanding"},
        {"key": "days_bucket", "label": "Days Bucket"},
    ]

    totals = {
        "0_30": float(grand["0_30"]),
        "31_60": float(grand["31_60"]),
        "61_90": float(grand["61_90"]),
        "121_plus": float(grand["121_plus"]),
        "total": float(grand["total"]),
        "row_count": len(out_rows),
    }

    extra_meta = {
        "as_at": as_at.isoformat(),
        "customer_id": int(customer_id) if customer_id else None,
    }

    return out_rows, columns, totals, extra_meta


def build_ap_aging_report(db, company_id: int, *, as_at: date, vendor_id: int | None = None):
    schema = db.company_schema(company_id)

    params = [int(company_id), as_at]
    where = [
        "b.company_id = %s",
        "LOWER(COALESCE(b.status,'')) NOT IN ('draft','cancelled','reversed','paid')",
        "COALESCE(b.balance_due, 0) > 0",
        "b.bill_date <= %s",
    ]

    if vendor_id:
        where.append("b.vendor_id = %s")
        params.append(int(vendor_id))

    sql = f"""
    SELECT
        b.id AS bill_id,
        b.vendor_id,
        COALESCE(v.name, '') AS vendor_name,
        COALESCE(b.number, '') AS bill_number,
        b.bill_date,
        b.due_date,
        COALESCE(b.balance_due, 0) AS balance_due
    FROM {schema}.bills b
    LEFT JOIN {schema}.vendors v
      ON v.id = b.vendor_id
    WHERE {" AND ".join(where)}
    ORDER BY b.vendor_id ASC, b.due_date ASC, b.id ASC
    """
    rows = db.fetch_all(sql, tuple(params)) or []

    out_rows = []
    grand = {
        "current": Decimal("0"),
        "1_30": Decimal("0"),
        "31_60": Decimal("0"),
        "61_90": Decimal("0"),
        "91_plus": Decimal("0"),
        "total": Decimal("0"),
    }

    for r in rows:
        due_date = r.get("due_date")
        if not due_date:
            days = 0
        else:
            days = (as_at - due_date).days

        amt = _d(r.get("balance_due"))

        cur = b1 = b31 = b61 = b91 = Decimal("0")
        if days <= 0:
            cur = amt
        elif days <= 30:
            b1 = amt
        elif days <= 60:
            b31 = amt
        elif days <= 90:
            b61 = amt
        else:
            b91 = amt

        grand["current"] += cur
        grand["1_30"] += b1
        grand["31_60"] += b31
        grand["61_90"] += b61
        grand["91_plus"] += b91
        grand["total"] += amt

        out_rows.append({
            "vendor_name": r.get("vendor_name") or "",
            "vendor_id": r.get("vendor_id"),
            "bill_id": r.get("bill_id"),
            "bill": r.get("bill_number") or "",
            "bill_date": str(r.get("bill_date")) if r.get("bill_date") else None,
            "due": str(r.get("due_date")) if r.get("due_date") else None,
            "outstanding": float(amt),
            "days_bucket": (
                "current" if cur else
                "1_30" if b1 else
                "31_60" if b31 else
                "61_90" if b61 else
                "91_plus"
            ),
        })

    columns = [
        {"key": "vendor_name", "label": "Vendor"},
        {"key": "vendor_id", "label": "Vendor ID"},
        {"key": "bill_id", "label": "Bill ID"},
        {"key": "bill", "label": "Bill"},
        {"key": "bill_date", "label": "Bill Date"},
        {"key": "due", "label": "Due"},
        {"key": "outstanding", "label": "Outstanding"},
        {"key": "days_bucket", "label": "Days Bucket"},
    ]

    totals = {
        "current": float(grand["current"]),
        "1_30": float(grand["1_30"]),
        "31_60": float(grand["31_60"]),
        "61_90": float(grand["61_90"]),
        "91_plus": float(grand["91_plus"]),
        "total": float(grand["total"]),
        "row_count": len(out_rows),
    }

    extra_meta = {
        "as_at": as_at.isoformat(),
        "vendor_id": int(vendor_id) if vendor_id else None,
    }

    return out_rows, columns, totals, extra_meta


def build_lessors_list_report(db, company_id: int, *, q: str | None = None):
    schema = db.company_schema(company_id)

    params = [int(company_id)]
    where = ["company_id = %s"]

    if q:
        like = f"%{q}%"
        where.append(
            "("
            "COALESCE(name,'') ILIKE %s OR "
            "COALESCE(email,'') ILIKE %s OR "
            "COALESCE(phone,'') ILIKE %s OR "
            "COALESCE(reg_no,'') ILIKE %s OR "
            "COALESCE(vat_no,'') ILIKE %s"
            ")"
        )
        params.extend([like, like, like, like, like])

    sql = f"""
    SELECT
        id,
        COALESCE(name, '') AS name,
        COALESCE(reg_no, '') AS reg_no,
        COALESCE(vat_no, '') AS vat_no,
        COALESCE(email, '') AS email,
        COALESCE(phone, '') AS phone,
        COALESCE(is_related_party, FALSE) AS related,
        COALESCE(status, 'active') AS status
    FROM {schema}.lessors
    WHERE {" AND ".join(where)}
    ORDER BY name ASC, id ASC
    """
    rows = db.fetch_all(sql, tuple(params)) or []

    out_rows = [{
        "lessor_id": r.get("id"),
        "name": r.get("name") or "",
        "reg_no": r.get("reg_no") or "",
        "vat_no": r.get("vat_no") or "",
        "email": r.get("email") or "",
        "phone": r.get("phone") or "",
        "related": bool(r.get("related")),
        "status": r.get("status") or "active",
    } for r in rows]

    columns = [
        {"key": "name", "label": "Name"},
        {"key": "reg_no", "label": "Reg / VAT"},
        {"key": "email", "label": "Email"},
        {"key": "phone", "label": "Phone"},
        {"key": "related", "label": "Related"},
        {"key": "status", "label": "Status"},
    ]

    totals = {
        "row_count": len(out_rows),
    }

    return out_rows, columns, totals