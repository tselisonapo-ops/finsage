from decimal import Decimal

from decimal import Decimal


def build_general_ledger_report(
    db,
    company_id,
    *,
    date_from=None,
    date_to=None,
    account_code=None,
    q=None,
):
    schema = db.company_schema(company_id)

    account_code = str(account_code or "").strip()

    params = [int(company_id)]
    where = ["l.company_id = %s"]

    if account_code:
        where.append("l.account = %s")
        params.append(account_code)

    if date_from:
        where.append("l.date >= %s")
        params.append(date_from)

    if date_to:
        where.append("l.date <= %s")
        params.append(date_to)

    if q:
        like = f"%{q}%"
        where.append("""
            (
                COALESCE(l.ref,'') ILIKE %s
                OR COALESCE(l.memo,'') ILIKE %s
                OR COALESCE(j.description,'') ILIKE %s
                OR COALESCE(l.account,'') ILIKE %s
                OR COALESCE(c.name,'') ILIKE %s
            )
        """)
        params.extend([like, like, like, like, like])

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
        COALESCE(l.debit, 0) AS debit,
        COALESCE(l.credit, 0) AS credit,
        COALESCE(j.source, l.source, '') AS source,
        COALESCE(j.source_id, l.source_id, NULL) AS source_id
    FROM {schema}.ledger l
    LEFT JOIN {schema}.journal j
      ON j.id = l.journal_id
     AND j.company_id = l.company_id
    LEFT JOIN {schema}.coa c
      ON c.company_id = l.company_id
     AND c.code = l.account
    WHERE {" AND ".join(where)}
    ORDER BY l.date ASC, l.journal_id ASC, l.id ASC
    """

    rows = db.fetch_all(sql, tuple(params)) or []

    total_debit = Decimal("0")
    total_credit = Decimal("0")
    out_rows = []

    if account_code:
        opening_balance = Decimal("0")

        if date_from:
            ob_sql = f"""
            SELECT
                COALESCE(SUM(l.debit), 0) AS debit_before,
                COALESCE(SUM(l.credit), 0) AS credit_before
            FROM {schema}.ledger l
            WHERE l.company_id = %s
              AND l.account = %s
              AND l.date < %s
            """
            ob_row = db.fetch_one(
                ob_sql,
                (int(company_id), account_code, date_from),
            ) or {}

            opening_balance = (
                Decimal(str(ob_row.get("debit_before") or 0))
                - Decimal(str(ob_row.get("credit_before") or 0))
            )

        running = opening_balance

        for r in rows:
            debit = Decimal(str(r.get("debit") or 0))
            credit = Decimal(str(r.get("credit") or 0))

            running += debit - credit
            total_debit += debit
            total_credit += credit

            out_rows.append({
                "date": str(r.get("date")) if r.get("date") else "",
                "ref": r.get("ref") or "",
                "journal_id": r.get("journal_id"),
                "source": r.get("source") or "",
                "source_id": r.get("source_id"),
                "account_code": r.get("account_code") or "",
                "account_name": r.get("account_name") or "",
                "journal_description": r.get("journal_description") or "",
                "memo": r.get("memo") or "",
                "debit": float(debit),
                "credit": float(credit),
                "balance": float(running),
            })

        totals = {
            "mode": "single_account",
            "account_code": account_code,
            "opening_balance": float(opening_balance),
            "debit_total": float(total_debit),
            "credit_total": float(total_credit),
            "closing_balance": float(running),
            "row_count": len(out_rows),
        }

    else:
        for r in rows:
            debit = Decimal(str(r.get("debit") or 0))
            credit = Decimal(str(r.get("credit") or 0))

            total_debit += debit
            total_credit += credit

            out_rows.append({
                "date": str(r.get("date")) if r.get("date") else "",
                "ref": r.get("ref") or "",
                "journal_id": r.get("journal_id"),
                "source": r.get("source") or "",
                "source_id": r.get("source_id"),
                "account_code": r.get("account_code") or "",
                "account_name": r.get("account_name") or "",
                "journal_description": r.get("journal_description") or "",
                "memo": r.get("memo") or "",
                "debit": float(debit),
                "credit": float(credit),
            })

        totals = {
            "mode": "all_accounts",
            "debit_total": float(total_debit),
            "credit_total": float(total_credit),
            "row_count": len(out_rows),
        }

    columns = [
        {"key": "date", "label": "Date"},
        {"key": "ref", "label": "Ref"},
        {"key": "journal_id", "label": "Journal ID"},
        {"key": "source", "label": "Source"},
        {"key": "account_code", "label": "Account"},
        {"key": "account_name", "label": "Account Name"},
        {"key": "journal_description", "label": "Description"},
        {"key": "memo", "label": "Memo"},
        {"key": "debit", "label": "Debit"},
        {"key": "credit", "label": "Credit"},
    ]

    if account_code:
        columns.append({"key": "balance", "label": "Running Balance"})

    return out_rows, columns, totals