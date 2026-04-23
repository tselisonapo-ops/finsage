from decimal import Decimal


CASH_CONTROL_CODES = {"BS_CA_1000"}
OVERDRAFT_CODES = {"BS_CL_2105"}


def _d(v):
    try:
        return Decimal(str(v or 0))
    except Exception:
        return Decimal("0")


def _is_cashbook_row(account_code, account_name, role):
    code = str(account_code or "").strip().upper()
    name = str(account_name or "").lower()
    role_txt = str(role or "").lower()

    if code in CASH_CONTROL_CODES or code in OVERDRAFT_CODES:
        return True

    if "cash" in name or "bank" in name or "petty" in name:
        return True

    if "cash" in role_txt or "bank" in role_txt or "overdraft" in role_txt:
        return True

    return False


def build_cashbook_report(
    db,
    company_id,
    *,
    date_from=None,
    date_to=None,
    q=None,
):
    schema = db.company_schema(company_id)

    params = [int(company_id)]
    where = ["l.company_id = %s"]

    if date_from:
        where.append("l.date >= %s")
        params.append(date_from)

    if date_to:
        where.append("l.date <= %s")
        params.append(date_to)

    if q:
        like = f"%{q}%"
        where.append(
            "("
            "COALESCE(l.ref,'') ILIKE %s OR "
            "COALESCE(l.memo,'') ILIKE %s OR "
            "COALESCE(j.description,'') ILIKE %s"
            ")"
        )
        params.extend([like, like, like])

    sql = f"""
    SELECT
        l.id,
        l.journal_id,
        l.date,
        COALESCE(l.ref, j.ref, '') AS ref,
        COALESCE(j.description, '') AS journal_description,
        COALESCE(l.memo, '') AS memo,
        l.account AS account_code,
        COALESCE(c.name, l.account) AS account_name,
        COALESCE(c.role, '') AS role,
        COALESCE(l.debit, 0) AS debit,
        COALESCE(l.credit, 0) AS credit,
        COALESCE(j.source, l.source, '') AS source,
        COALESCE(j.source_id, l.source_id, NULL) AS source_id
    FROM {schema}.ledger l
    LEFT JOIN {schema}.journal j
      ON j.id = l.journal_id
    LEFT JOIN {schema}.coa c
      ON c.company_id = l.company_id
     AND c.code = l.account
    WHERE {" AND ".join(where)}
    ORDER BY l.date ASC, l.id ASC
    """
    rows = db.fetch_all(sql, tuple(params)) or []

    cash_rows = []
    total_receipts = Decimal("0")
    total_payments = Decimal("0")
    net_movement = Decimal("0")

    for r in rows:
        account_code = r.get("account_code")
        account_name = r.get("account_name")
        role = r.get("role")

        if not _is_cashbook_row(account_code, account_name, role):
            continue

        debit = _d(r.get("debit"))
        credit = _d(r.get("credit"))

        receipts = debit if debit > 0 else Decimal("0")
        payments = credit if credit > 0 else Decimal("0")
        movement = debit - credit

        total_receipts += receipts
        total_payments += payments
        net_movement += movement

        cash_rows.append({
            "date": str(r.get("date")) if r.get("date") else None,
            "ref": r.get("ref") or "",
            "journal_id": r.get("journal_id"),
            "source": r.get("source") or "",
            "source_id": r.get("source_id"),
            "account_code": account_code or "",
            "account_name": account_name or "",
            "journal_description": r.get("journal_description") or "",
            "memo": r.get("memo") or "",
            "receipts": float(receipts),
            "payments": float(payments),
            "movement": float(movement),
        })

    columns = [
        {"key": "date", "label": "Date"},
        {"key": "ref", "label": "Ref"},
        {"key": "journal_id", "label": "Journal ID"},
        {"key": "source", "label": "Source"},
        {"key": "account_code", "label": "Account"},
        {"key": "account_name", "label": "Account Name"},
        {"key": "journal_description", "label": "Description"},
        {"key": "memo", "label": "Memo"},
        {"key": "receipts", "label": "Receipts"},
        {"key": "payments", "label": "Payments"},
        {"key": "movement", "label": "Net Movement"},
    ]

    totals = {
        "receipts_total": float(total_receipts),
        "payments_total": float(total_payments),
        "net_movement": float(net_movement),
        "row_count": len(cash_rows),
    }

    return cash_rows, columns, totals