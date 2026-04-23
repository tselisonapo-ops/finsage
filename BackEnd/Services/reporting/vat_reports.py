from decimal import Decimal

VAT_INPUT_CODES = {"BS_CA_1410"}
VAT_OUTPUT_CODES = {"BS_CL_2310"}

def _is_input_vat_line(account_code, account_name, memo):
    code = str(account_code or "").strip().upper()
    text = " ".join([str(account_name or ""), str(memo or "")]).lower()
    return code in VAT_INPUT_CODES or ("vat input" in text)

def _is_output_vat_line(account_code, account_name, memo):
    code = str(account_code or "").strip().upper()
    text = " ".join([str(account_name or ""), str(memo or "")]).lower()
    return code in VAT_OUTPUT_CODES or ("vat output" in text)

def build_vat_report(db, company_id, *, date_from=None, date_to=None):
    if not date_from or not date_to:
        raise ValueError("VAT report requires date_from and date_to")

    schema = db.company_schema(company_id)

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
    LEFT JOIN {schema}.coa c
      ON c.company_id = l.company_id
     AND c.code = l.account
    WHERE l.company_id = %s
      AND l.date >= %s
      AND l.date <= %s
    ORDER BY l.date ASC, l.id ASC
    """
    rows = db.fetch_all(sql, (int(company_id), date_from, date_to)) or []

    input_total = Decimal("0")
    output_total = Decimal("0")
    detail_rows = []

    for r in rows:
        account_code = r.get("account_code")
        account_name = r.get("account_name")
        memo = r.get("memo")

        debit = Decimal(str(r.get("debit") or 0))
        credit = Decimal(str(r.get("credit") or 0))

        vat_type = None
        vat_amount = Decimal("0")

        if _is_input_vat_line(account_code, account_name, memo):
            vat_type = "input"
            vat_amount = debit - credit
            input_total += vat_amount
        elif _is_output_vat_line(account_code, account_name, memo):
            vat_type = "output"
            vat_amount = credit - debit
            output_total += vat_amount

        if vat_type:
            detail_rows.append({
                "date": str(r.get("date")) if r.get("date") else None,
                "ref": r.get("ref") or "",
                "journal_id": r.get("journal_id"),
                "source": r.get("source") or "",
                "account_code": account_code or "",
                "account_name": account_name or "",
                "journal_description": r.get("journal_description") or "",
                "memo": memo or "",
                "vat_type": vat_type,
                "vat_amount": float(vat_amount),
            })

    filing = db.get_vat_filing(int(company_id), date_from, date_to)

    columns = [
        {"key": "date", "label": "Date"},
        {"key": "ref", "label": "Ref"},
        {"key": "journal_id", "label": "Journal ID"},
        {"key": "source", "label": "Source"},
        {"key": "account_code", "label": "Account"},
        {"key": "account_name", "label": "Account Name"},
        {"key": "vat_type", "label": "VAT Type"},
        {"key": "vat_amount", "label": "VAT Amount"},
        {"key": "journal_description", "label": "Description"},
        {"key": "memo", "label": "Memo"},
    ]

    net_vat = output_total - input_total

    totals = {
        "input_total": float(input_total),
        "output_total": float(output_total),
        "net_vat": float(net_vat),
        "detail_count": len(detail_rows),
    }

    extra_meta = {
        "filing": {
            "exists": bool(filing),
            "status": filing.get("status") if filing else None,
            "reference": filing.get("reference") if filing else None,
            "period_label": filing.get("period_label") if filing else None,
            "due_date": str(filing.get("due_date")) if filing and filing.get("due_date") else None,
            "prepared_at": str(filing.get("prepared_at")) if filing and filing.get("prepared_at") else None,
            "submitted_at": str(filing.get("submitted_at")) if filing and filing.get("submitted_at") else None,
        }
    }

    return detail_rows, columns, totals, extra_meta