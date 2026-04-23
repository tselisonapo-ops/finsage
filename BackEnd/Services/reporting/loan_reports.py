from decimal import Decimal


def _d(v):
    try:
        return Decimal(str(v or 0))
    except Exception:
        return Decimal("0")


def build_loan_register_report(db, company_id, *, q=None, status=None):
    schema = db.company_schema(company_id)

    params = [int(company_id)]
    where = ["l.company_id = %s"]

    if status:
        where.append("LOWER(COALESCE(l.status, '')) = %s")
        params.append(str(status).strip().lower())

    if q:
        like = f"%{q}%"
        where.append(
            "("
            "COALESCE(l.loan_name,'') ILIKE %s OR "
            "COALESCE(l.loan_reference,'') ILIKE %s OR "
            "COALESCE(l.lender_name,'') ILIKE %s OR "
            "COALESCE(l.agreement_reference,'') ILIKE %s"
            ")"
        )
        params.extend([like, like, like, like])

    sql = f"""
    SELECT
        l.id,
        l.loan_name,
        l.loan_reference,
        l.lender_name,
        l.loan_type,
        l.start_date,
        l.first_payment_date,
        l.maturity_date,
        COALESCE(l.principal_amount, 0) AS principal_amount,
        COALESCE(l.annual_interest_rate, 0) AS annual_interest_rate,
        COALESCE(l.payment_frequency, '') AS payment_frequency,
        COALESCE(l.payment_amount, 0) AS payment_amount,
        COALESCE(l.total_interest_projected, 0) AS total_interest_projected,
        COALESCE(l.total_repayment_projected, 0) AS total_repayment_projected,
        l.next_due_date,
        COALESCE(l.outstanding_principal, 0) AS outstanding_principal,
        COALESCE(l.outstanding_interest, 0) AS outstanding_interest,
        COALESCE(l.status, 'draft') AS status,
        l.originated_journal_id,
        l.last_reclass_journal_id,
        l.last_payment_date,
        l.closed_at,
        COALESCE(l.currency, 'ZAR') AS currency,
        l.created_at,
        l.updated_at
    FROM {schema}.loans l
    WHERE {" AND ".join(where)}
    ORDER BY l.start_date DESC NULLS LAST, l.id DESC
    """
    rows = db.fetch_all(sql, tuple(params)) or []

    out = []
    total_principal = Decimal("0")
    total_outstanding_principal = Decimal("0")
    total_outstanding_interest = Decimal("0")
    total_payment_amount = Decimal("0")
    total_projected_interest = Decimal("0")

    for r in rows:
        principal = _d(r.get("principal_amount"))
        outstanding_principal = _d(r.get("outstanding_principal"))
        outstanding_interest = _d(r.get("outstanding_interest"))
        payment_amount = _d(r.get("payment_amount"))
        projected_interest = _d(r.get("total_interest_projected"))

        total_principal += principal
        total_outstanding_principal += outstanding_principal
        total_outstanding_interest += outstanding_interest
        total_payment_amount += payment_amount
        total_projected_interest += projected_interest

        out.append({
            "loan_id": int(r.get("id") or 0),
            "loan_name": r.get("loan_name") or "",
            "loan_reference": r.get("loan_reference") or "",
            "lender_name": r.get("lender_name") or "",
            "loan_type": r.get("loan_type") or "",
            "start_date": str(r.get("start_date")) if r.get("start_date") else None,
            "first_payment_date": str(r.get("first_payment_date")) if r.get("first_payment_date") else None,
            "maturity_date": str(r.get("maturity_date")) if r.get("maturity_date") else None,
            "principal_amount": float(principal),
            "annual_interest_rate": float(_d(r.get("annual_interest_rate"))),
            "payment_frequency": r.get("payment_frequency") or "",
            "payment_amount": float(payment_amount),
            "total_interest_projected": float(projected_interest),
            "total_repayment_projected": float(_d(r.get("total_repayment_projected"))),
            "next_due_date": str(r.get("next_due_date")) if r.get("next_due_date") else None,
            "outstanding_principal": float(outstanding_principal),
            "outstanding_interest": float(outstanding_interest),
            "status": r.get("status") or "draft",
            "originated_journal_id": r.get("originated_journal_id"),
            "last_reclass_journal_id": r.get("last_reclass_journal_id"),
            "last_payment_date": str(r.get("last_payment_date")) if r.get("last_payment_date") else None,
            "closed_at": str(r.get("closed_at")) if r.get("closed_at") else None,
            "currency": r.get("currency") or "ZAR",
        })

    columns = [
        {"key": "loan_id", "label": "Loan ID"},
        {"key": "loan_name", "label": "Loan"},
        {"key": "loan_reference", "label": "Reference"},
        {"key": "lender_name", "label": "Lender"},
        {"key": "loan_type", "label": "Type"},
        {"key": "principal_amount", "label": "Principal"},
        {"key": "outstanding_principal", "label": "Outstanding Principal"},
        {"key": "outstanding_interest", "label": "Outstanding Interest"},
        {"key": "total_interest_projected", "label": "Projected Interest"},
        {"key": "payment_amount", "label": "Instalment"},
        {"key": "next_due_date", "label": "Next Due"},
        {"key": "status", "label": "Status"},
    ]

    totals = {
        "loan_count": len(out),
        "principal_total": float(total_principal),
        "outstanding_principal_total": float(total_outstanding_principal),
        "outstanding_interest_total": float(total_outstanding_interest),
        "projected_interest_total": float(total_projected_interest),
        "instalment_total": float(total_payment_amount),
    }

    return out, columns, totals


def build_loan_schedule_report(
    db,
    company_id,
    *,
    loan_id,
    date_from=None,
    date_to=None,
    schedule_version=None,
):
    if not loan_id:
        raise ValueError("loan_id is required")

    schema = db.company_schema(company_id)

    ver = schedule_version
    if ver is None:
        loan_row = db.fetch_one(
            f"""
            SELECT COALESCE(schedule_version, 1) AS schedule_version, loan_name, lender_name
            FROM {schema}.loans
            WHERE company_id=%s AND id=%s
            LIMIT 1
            """,
            (int(company_id), int(loan_id)),
        )
        if not loan_row:
            raise ValueError("loan not found")
        ver = int(loan_row.get("schedule_version") or 1)
        loan_name = loan_row.get("loan_name") or ""
        lender_name = loan_row.get("lender_name") or ""
    else:
        loan_row = db.fetch_one(
            f"""
            SELECT loan_name, lender_name
            FROM {schema}.loans
            WHERE company_id=%s AND id=%s
            LIMIT 1
            """,
            (int(company_id), int(loan_id)),
        ) or {}
        loan_name = loan_row.get("loan_name") or ""
        lender_name = loan_row.get("lender_name") or ""

    params = [int(company_id), int(loan_id), int(ver)]
    where = [
        "s.company_id = %s",
        "s.loan_id = %s",
        "s.schedule_version = %s",
    ]

    if date_from:
        where.append("s.due_date >= %s")
        params.append(date_from)

    if date_to:
        where.append("s.due_date <= %s")
        params.append(date_to)

    sql = f"""
    SELECT
        s.id,
        s.loan_id,
        s.schedule_version,
        s.period_no,
        s.due_date,
        COALESCE(s.opening_balance, 0) AS opening_balance,
        COALESCE(s.scheduled_payment, 0) AS scheduled_payment,
        COALESCE(s.scheduled_interest, 0) AS scheduled_interest,
        COALESCE(s.scheduled_principal, 0) AS scheduled_principal,
        COALESCE(s.closing_balance, 0) AS closing_balance,
        COALESCE(s.current_portion_amount, 0) AS current_portion_amount,
        COALESCE(s.noncurrent_portion_amount, 0) AS noncurrent_portion_amount,
        COALESCE(s.payment_status, 'open') AS payment_status,
        COALESCE(s.paid_amount, 0) AS paid_amount,
        COALESCE(s.paid_interest, 0) AS paid_interest,
        COALESCE(s.paid_principal, 0) AS paid_principal,
        s.last_payment_date
    FROM {schema}.loan_schedules s
    WHERE {" AND ".join(where)}
    ORDER BY s.period_no ASC, s.id ASC
    """
    rows = db.fetch_all(sql, tuple(params)) or []

    out = []
    total_payment = Decimal("0")
    total_interest = Decimal("0")
    total_principal = Decimal("0")
    total_paid = Decimal("0")

    for r in rows:
        payment = _d(r.get("scheduled_payment"))
        interest = _d(r.get("scheduled_interest"))
        principal = _d(r.get("scheduled_principal"))
        paid = _d(r.get("paid_amount"))

        total_payment += payment
        total_interest += interest
        total_principal += principal
        total_paid += paid

        out.append({
            "schedule_id": int(r.get("id") or 0),
            "loan_id": int(r.get("loan_id") or 0),
            "schedule_version": int(r.get("schedule_version") or 1),
            "period_no": int(r.get("period_no") or 0),
            "due_date": str(r.get("due_date")) if r.get("due_date") else None,
            "opening_balance": float(_d(r.get("opening_balance"))),
            "scheduled_payment": float(payment),
            "scheduled_interest": float(interest),
            "scheduled_principal": float(principal),
            "closing_balance": float(_d(r.get("closing_balance"))),
            "current_portion_amount": float(_d(r.get("current_portion_amount"))),
            "noncurrent_portion_amount": float(_d(r.get("noncurrent_portion_amount"))),
            "payment_status": r.get("payment_status") or "open",
            "paid_amount": float(paid),
            "paid_interest": float(_d(r.get("paid_interest"))),
            "paid_principal": float(_d(r.get("paid_principal"))),
            "last_payment_date": str(r.get("last_payment_date")) if r.get("last_payment_date") else None,
        })

    columns = [
        {"key": "period_no", "label": "Period"},
        {"key": "due_date", "label": "Due Date"},
        {"key": "opening_balance", "label": "Opening"},
        {"key": "scheduled_payment", "label": "Payment"},
        {"key": "scheduled_interest", "label": "Interest"},
        {"key": "scheduled_principal", "label": "Principal"},
        {"key": "closing_balance", "label": "Closing"},
        {"key": "current_portion_amount", "label": "Current Portion"},
        {"key": "noncurrent_portion_amount", "label": "Non-current Portion"},
        {"key": "payment_status", "label": "Status"},
        {"key": "paid_amount", "label": "Paid"},
    ]

    totals = {
        "row_count": len(out),
        "payment_total": float(total_payment),
        "interest_total": float(total_interest),
        "principal_total": float(total_principal),
        "paid_total": float(total_paid),
    }

    extra_meta = {
        "loan_id": int(loan_id),
        "loan_name": loan_name,
        "lender_name": lender_name,
        "schedule_version": int(ver),
    }

    return out, columns, totals, extra_meta


def build_loan_payments_report(
    db,
    company_id,
    *,
    loan_id=None,
    date_from=None,
    date_to=None,
    q=None,
    status=None,
):
    schema = db.company_schema(company_id)

    params = [int(company_id)]
    where = ["p.company_id = %s"]

    if loan_id:
        where.append("p.loan_id = %s")
        params.append(int(loan_id))

    if date_from:
        where.append("p.payment_date >= %s")
        params.append(date_from)

    if date_to:
        where.append("p.payment_date <= %s")
        params.append(date_to)

    if status:
        where.append("LOWER(COALESCE(p.status, '')) = %s")
        params.append(str(status).strip().lower())

    if q:
        like = f"%{q}%"
        where.append(
            "("
            "COALESCE(p.reference,'') ILIKE %s OR "
            "COALESCE(p.description,'') ILIKE %s OR "
            "COALESCE(l.loan_name,'') ILIKE %s OR "
            "COALESCE(l.lender_name,'') ILIKE %s"
            ")"
        )
        params.extend([like, like, like, like])

    sql = f"""
    SELECT
        p.id,
        p.loan_id,
        p.primary_schedule_id,
        p.payment_date,
        COALESCE(p.amount_paid, 0) AS amount_paid,
        COALESCE(p.principal_amount, 0) AS principal_amount,
        COALESCE(p.interest_amount, 0) AS interest_amount,
        COALESCE(p.accrued_interest_amount, 0) AS accrued_interest_amount,
        COALESCE(p.fees_amount, 0) AS fees_amount,
        COALESCE(p.penalties_amount, 0) AS penalties_amount,
        COALESCE(p.reference, '') AS reference,
        COALESCE(p.description, '') AS description,
        COALESCE(p.allocation_method, '') AS allocation_method,
        COALESCE(p.payment_type, '') AS payment_type,
        COALESCE(p.status, 'draft') AS status,
        p.posted_journal_id,
        p.posted_at,
        l.loan_name,
        COALESCE(l.lender_name, '') AS lender_name
    FROM {schema}.loan_payments p
    JOIN {schema}.loans l
      ON l.id = p.loan_id
     AND l.company_id = p.company_id
    WHERE {" AND ".join(where)}
    ORDER BY p.payment_date DESC, p.id DESC
    """
    rows = db.fetch_all(sql, tuple(params)) or []

    out = []
    total_paid = Decimal("0")
    total_principal = Decimal("0")
    total_interest = Decimal("0")
    total_accrued = Decimal("0")
    total_fees = Decimal("0")
    total_penalties = Decimal("0")

    for r in rows:
        amount_paid = _d(r.get("amount_paid"))
        principal = _d(r.get("principal_amount"))
        interest = _d(r.get("interest_amount"))
        accrued = _d(r.get("accrued_interest_amount"))
        fees = _d(r.get("fees_amount"))
        penalties = _d(r.get("penalties_amount"))

        total_paid += amount_paid
        total_principal += principal
        total_interest += interest
        total_accrued += accrued
        total_fees += fees
        total_penalties += penalties

        out.append({
            "loan_payment_id": int(r.get("id") or 0),
            "loan_id": int(r.get("loan_id") or 0),
            "primary_schedule_id": r.get("primary_schedule_id"),
            "payment_date": str(r.get("payment_date")) if r.get("payment_date") else None,
            "reference": r.get("reference") or "",
            "loan_name": r.get("loan_name") or "",
            "lender_name": r.get("lender_name") or "",
            "amount_paid": float(amount_paid),
            "principal_amount": float(principal),
            "interest_amount": float(interest),
            "accrued_interest_amount": float(accrued),
            "fees_amount": float(fees),
            "penalties_amount": float(penalties),
            "allocation_method": r.get("allocation_method") or "",
            "payment_type": r.get("payment_type") or "",
            "status": r.get("status") or "draft",
            "posted_journal_id": r.get("posted_journal_id"),
            "posted_at": str(r.get("posted_at")) if r.get("posted_at") else None,
            "description": r.get("description") or "",
        })

    columns = [
        {"key": "payment_date", "label": "Date"},
        {"key": "reference", "label": "Reference"},
        {"key": "loan_id", "label": "Loan ID"},
        {"key": "loan_name", "label": "Loan"},
        {"key": "lender_name", "label": "Lender"},
        {"key": "amount_paid", "label": "Amount"},
        {"key": "principal_amount", "label": "Principal"},
        {"key": "interest_amount", "label": "Interest"},
        {"key": "accrued_interest_amount", "label": "Accrued Interest"},
        {"key": "fees_amount", "label": "Fees"},
        {"key": "penalties_amount", "label": "Penalties"},
        {"key": "status", "label": "Status"},
        {"key": "posted_journal_id", "label": "Journal"},
    ]

    totals = {
        "row_count": len(out),
        "amount_paid_total": float(total_paid),
        "principal_total": float(total_principal),
        "interest_total": float(total_interest),
        "accrued_interest_total": float(total_accrued),
        "fees_total": float(total_fees),
        "penalties_total": float(total_penalties),
    }

    return out, columns, totals


def build_loan_journals_report(db, company_id, *, loan_id):
    if not loan_id:
        raise ValueError("loan_id is required")

    schema = db.company_schema(company_id)

    sql = f"""
    SELECT
        j.id,
        j.date,
        j.ref,
        j.description,
        COALESCE(j.gross_amount, 0) AS gross_amount,
        COALESCE(j.net_amount, 0) AS net_amount,
        COALESCE(j.vat_amount, 0) AS vat_amount,
        COALESCE(j.source, '') AS source,
        j.source_id,
        j.created_at
    FROM {schema}.journal j
    WHERE j.company_id=%s
      AND (
            (j.source = 'loan_origination' AND j.source_id = %s)
         OR (j.source = 'loan_reclassification' AND j.source_id = %s)
         OR (j.source = 'loan_payment' AND j.source_id IN (
                SELECT id
                FROM {schema}.loan_payments
                WHERE company_id=%s AND loan_id=%s
            ))
      )
    ORDER BY j.date DESC, j.id DESC
    """
    rows = db.fetch_all(sql, (int(company_id), int(loan_id), int(loan_id), int(company_id), int(loan_id))) or []

    out = []
    total_gross = Decimal("0")
    total_net = Decimal("0")
    total_vat = Decimal("0")

    for r in rows:
        gross = _d(r.get("gross_amount"))
        net = _d(r.get("net_amount"))
        vat = _d(r.get("vat_amount"))

        total_gross += gross
        total_net += net
        total_vat += vat

        out.append({
            "journal_id": int(r.get("id") or 0),
            "date": str(r.get("date")) if r.get("date") else None,
            "ref": r.get("ref") or "",
            "description": r.get("description") or "",
            "gross_amount": float(gross),
            "net_amount": float(net),
            "vat_amount": float(vat),
            "source": r.get("source") or "",
            "source_id": r.get("source_id"),
            "created_at": str(r.get("created_at")) if r.get("created_at") else None,
        })

    columns = [
        {"key": "journal_id", "label": "Journal"},
        {"key": "date", "label": "Date"},
        {"key": "ref", "label": "Ref"},
        {"key": "description", "label": "Description"},
        {"key": "gross_amount", "label": "Gross"},
        {"key": "net_amount", "label": "Net"},
        {"key": "vat_amount", "label": "VAT"},
        {"key": "source", "label": "Source"},
        {"key": "source_id", "label": "Source ID"},
    ]

    totals = {
        "row_count": len(out),
        "gross_total": float(total_gross),
        "net_total": float(total_net),
        "vat_total": float(total_vat),
    }

    return out, columns, totals