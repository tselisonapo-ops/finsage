from decimal import Decimal

VAT_INPUT_CODES = {"BS_CA_1410"}
VAT_OUTPUT_CODES = {"BS_CL_2310"}

CONTROL_ROLES = {
    "cash",
    "bank",
}

CONTROL_CF_BUCKETS = {
    "cash",
    "receivables",
    "payables",
    "vat_input",
    "vat_output",
    "unallocated_receipts",
    "unallocated_payments",
}

VAT_CF_BUCKETS = {
    "vat_input",
    "vat_output",
}


def _is_input_vat_line(account_code, account_name, memo, cf_bucket=None, role=None):
    code = str(account_code or "").strip().upper()
    text = " ".join([str(account_name or ""), str(memo or "")]).lower()
    bucket = str(cf_bucket or "").strip().lower()
    role = str(role or "").strip().lower()

    return (
        bucket == "vat_input"
        or role == "vat_input"
        or code in VAT_INPUT_CODES
        or "vat input" in text
    )

def _is_output_vat_line(account_code, account_name, memo, cf_bucket=None, role=None):
    code = str(account_code or "").strip().upper()
    text = " ".join([str(account_name or ""), str(memo or "")]).lower()
    bucket = str(cf_bucket or "").strip().lower()
    role = str(role or "").strip().lower()

    return (
        bucket == "vat_output"
        or role == "vat_output"
        or code in VAT_OUTPUT_CODES
        or "vat output" in text
    )

def _looks_like_control_account(row):
    role = str(row.get("account_role") or "").strip().lower()
    cf_bucket = str(row.get("account_cf_bucket") or "").strip().lower()
    name = str(row.get("account_name") or "").strip().lower()

    if role in CONTROL_ROLES:
        return True

    if cf_bucket in CONTROL_CF_BUCKETS:
        return True

    if "vat" in name:
        return True

    return False

def _find_transaction_account(rows_by_journal, vat_line_id):
    rows = rows_by_journal or []

    candidates = []

    for r in rows:
        if r.get("id") == vat_line_id:
            continue

        code = r.get("account_code")
        name = r.get("account_name")
        memo = r.get("memo")

        role = r.get("account_role")
        cf_bucket = r.get("account_cf_bucket")

        # Skip VAT lines
        if _is_input_vat_line(code, name, memo, cf_bucket, role):
            continue

        if _is_output_vat_line(code, name, memo, cf_bucket, role):
            continue

        # Skip control accounts using metadata
        if _looks_like_control_account(r):
            continue

        debit = Decimal(str(r.get("debit") or 0))
        credit = Decimal(str(r.get("credit") or 0))
        amount = abs(debit - credit)

        candidates.append((amount, r))

    if not candidates:
        return None

    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]

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

        COALESCE(c.category, '') AS account_category,
        COALESCE(c.subcategory, '') AS account_subcategory,
        COALESCE(c.section, '') AS account_section,
        COALESCE(c.role, '') AS account_role,
        COALESCE(c.cf_bucket, '') AS account_cf_bucket,
        COALESCE(c.cf_section, '') AS account_cf_section,
        COALESCE(c.reporting_description, '') AS account_reporting_description,

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
    ORDER BY l.date ASC, l.journal_id ASC, l.id ASC
    """

    rows = db.fetch_all(sql, (int(company_id), date_from, date_to)) or []

    rows_by_journal = {}
    for r in rows:
        rows_by_journal.setdefault(r.get("journal_id"), []).append(r)

    input_total = Decimal("0")
    output_total = Decimal("0")
    detail_rows = []

    for r in rows:
        account_code = r.get("account_code")
        account_name = r.get("account_name")
        memo = r.get("memo")

        # ✅ NEW: pull metadata from SQL result
        cf_bucket = r.get("account_cf_bucket")
        role = r.get("account_role")

        debit = Decimal(str(r.get("debit") or 0))
        credit = Decimal(str(r.get("credit") or 0))

        vat_type = None
        vat_amount = Decimal("0")

        # ✅ UPDATED: pass metadata into detection
        if _is_input_vat_line(account_code, account_name, memo, cf_bucket, role):
            vat_type = "input"
            vat_amount = debit - credit
            input_total += vat_amount

        elif _is_output_vat_line(account_code, account_name, memo, cf_bucket, role):
            vat_type = "output"
            vat_amount = credit - debit
            output_total += vat_amount

        if not vat_type:
            continue

        tx_account = _find_transaction_account(
            rows_by_journal.get(r.get("journal_id"), []),
            r.get("id"),
        )

        transaction_account_name = (
            tx_account.get("account_name")
            if tx_account
            else account_name
        )

        detail_rows.append({
            "date": str(r.get("date")) if r.get("date") else None,
            "ref": r.get("ref") or "",
            "journal_id": r.get("journal_id"),
            "source": r.get("source") or "",

            # user-facing account
            "transaction_account": transaction_account_name or "",

            # keep internally available, but not exposed in columns
            "transaction_account_code": tx_account.get("account_code") if tx_account else "",
            "vat_account_name": account_name or "",
            "vat_account_code": account_code or "",

            "vat_type": vat_type,
            "vat_amount": float(vat_amount),
            "journal_description": r.get("journal_description") or "",
            "memo": memo or "",
        })

    filing = db.get_vat_filing(int(company_id), date_from, date_to)

    columns = [
        {"key": "date", "label": "Date"},
        {"key": "ref", "label": "Ref"},
        {"key": "journal_id", "label": "Journal ID"},
        {"key": "source", "label": "Source"},
        {"key": "transaction_account", "label": "Transaction Account"},
        {"key": "vat_account_name", "label": "VAT Account"},
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