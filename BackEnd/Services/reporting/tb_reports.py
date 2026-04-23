from decimal import Decimal

def _to_float(v):
    try:
        return float(v or 0)
    except Exception:
        return 0.0

def build_trial_balance_report(db, company_id, *, date_from=None, date_to=None):
    schema = db.company_schema(company_id)

    # Current implementation reads from trial_balance store table.
    # Period metadata still comes from shared period resolver in route layer.
    sql = f"""
    SELECT
        tb.account,
        COALESCE(c.name, tb.account) AS account_name,
        COALESCE(c.section, '') AS section,
        COALESCE(c.category, '') AS category,
        COALESCE(c.subcategory, '') AS subcategory,
        COALESCE(c.role, '') AS role,
        COALESCE(tb.debit_total, 0) AS debit_total,
        COALESCE(tb.credit_total, 0) AS credit_total,
        COALESCE(tb.closing_balance, 0) AS closing_balance
    FROM {schema}.trial_balance tb
    LEFT JOIN {schema}.coa c
      ON c.company_id = tb.company_id
     AND c.code = tb.account
    WHERE tb.company_id = %s
    ORDER BY tb.account
    """
    rows = db.fetch_all(sql, (int(company_id),)) or []

    out_rows = []
    total_debit = Decimal("0")
    total_credit = Decimal("0")
    total_closing = Decimal("0")

    for r in rows:
        debit = Decimal(str(r.get("debit_total") or 0))
        credit = Decimal(str(r.get("credit_total") or 0))
        closing = Decimal(str(r.get("closing_balance") or 0))

        total_debit += debit
        total_credit += credit
        total_closing += closing

        out_rows.append({
            "account": r.get("account") or "",
            "account_name": r.get("account_name") or "",
            "section": r.get("section") or "",
            "category": r.get("category") or "",
            "subcategory": r.get("subcategory") or "",
            "role": r.get("role") or "",
            "debit_total": float(debit),
            "credit_total": float(credit),
            "closing_balance": float(closing),
        })

    columns = [
        {"key": "account", "label": "Account"},
        {"key": "account_name", "label": "Account Name"},
        {"key": "section", "label": "Section"},
        {"key": "category", "label": "Category"},
        {"key": "debit_total", "label": "Debit"},
        {"key": "credit_total", "label": "Credit"},
        {"key": "closing_balance", "label": "Closing Balance"},
    ]

    totals = {
        "debit_total": float(total_debit),
        "credit_total": float(total_credit),
        "closing_balance": float(total_closing),
        "is_balanced": abs(float(total_debit - total_credit)) < 0.005,
    }

    return out_rows, columns, totals