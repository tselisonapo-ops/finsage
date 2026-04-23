def build_journal_register(db, company_id, date_from=None, date_to=None, q=None):
    schema = db.company_schema(company_id)

    where = ["company_id = %s"]
    params = [company_id]

    if date_from:
        where.append("date >= %s")
        params.append(date_from)

    if date_to:
        where.append("date <= %s")
        params.append(date_to)

    if q:
        where.append("(ref ILIKE %s OR description ILIKE %s)")
        like = f"%{q}%"
        params.extend([like, like])

    sql = f"""
    SELECT
        j.id,
        j.date,
        j.ref,
        j.description,
        j.source,
        j.net_amount,
        j.vat_amount,
        j.gross_amount,
        COUNT(l.id) AS line_count,
        COALESCE(SUM(l.debit),0) AS debit_total,
        COALESCE(SUM(l.credit),0) AS credit_total
    FROM {schema}.journal j
    LEFT JOIN {schema}.ledger l ON l.journal_id = j.id
    WHERE {" AND ".join(where)}
    GROUP BY j.id
    ORDER BY j.date DESC, j.id DESC
    """

    rows = db.fetch_all(sql, tuple(params)) or []

    columns = [
        {"key": "date", "label": "Date"},
        {"key": "ref", "label": "Ref"},
        {"key": "description", "label": "Description"},
        {"key": "source", "label": "Source"},
        {"key": "debit_total", "label": "Debit"},
        {"key": "credit_total", "label": "Credit"},
    ]

    return rows, columns