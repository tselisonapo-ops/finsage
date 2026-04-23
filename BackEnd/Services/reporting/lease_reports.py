from decimal import Decimal


def _d(v):
    try:
        return Decimal(str(v or 0))
    except Exception:
        return Decimal("0")


def build_lease_register_report(db, company_id, *, q=None):
    schema = db.company_schema(company_id)

    where = ["l.company_id = %s"]
    params = [int(company_id)]

    if q:
        like = f"%{q}%"
        where.append(
            "(COALESCE(l.lease_name,'') ILIKE %s OR COALESCE(ls.name,'') ILIKE %s)"
        )
        params.extend([like, like])

    sql = f"""
    SELECT
        l.id,
        l.lease_name,
        l.lessor_id,
        COALESCE(ls.name, '') AS lessor_name,
        l.start_date,
        l.end_date,
        COALESCE(l.payment_amount, 0) AS payment_amount,
        COALESCE(l.payment_frequency, '') AS payment_frequency,
        COALESCE(l.payment_timing, '') AS payment_timing,
        COALESCE(l.annual_rate, 0) AS annual_rate,
        COALESCE(l.vat_rate, 0) AS vat_rate,
        COALESCE(l.opening_lease_liability, 0) AS opening_lease_liability,
        COALESCE(l.opening_rou_asset, 0) AS opening_rou_asset,
        COALESCE(l.status, 'active') AS status,
        l.termination_date,
        l.created_at
    FROM {schema}.leases l
    LEFT JOIN {schema}.lessors ls
      ON ls.id = l.lessor_id
    WHERE {" AND ".join(where)}
    ORDER BY l.start_date DESC, l.id DESC
    """
    rows = db.fetch_all(sql, tuple(params)) or []

    out = []
    total_liability = Decimal("0")
    total_rou = Decimal("0")

    for r in rows:
        liability = _d(r.get("opening_lease_liability"))
        rou = _d(r.get("opening_rou_asset"))
        total_liability += liability
        total_rou += rou

        out.append({
            "lease_id": int(r.get("id") or 0),
            "lease_name": r.get("lease_name") or "",
            "lessor_id": r.get("lessor_id"),
            "lessor_name": r.get("lessor_name") or "",
            "start_date": str(r.get("start_date")) if r.get("start_date") else None,
            "end_date": str(r.get("end_date")) if r.get("end_date") else None,
            "payment_amount": float(_d(r.get("payment_amount"))),
            "payment_frequency": r.get("payment_frequency") or "",
            "payment_timing": r.get("payment_timing") or "",
            "annual_rate": float(_d(r.get("annual_rate"))),
            "vat_rate": float(_d(r.get("vat_rate"))),
            "opening_lease_liability": float(liability),
            "opening_rou_asset": float(rou),
            "status": r.get("status") or "active",
            "termination_date": str(r.get("termination_date")) if r.get("termination_date") else None,
            "created_at": str(r.get("created_at")) if r.get("created_at") else None,
        })

    columns = [
        {"key": "lease_id", "label": "Lease ID"},
        {"key": "lease_name", "label": "Lease"},
        {"key": "lessor_name", "label": "Lessor"},
        {"key": "start_date", "label": "Start"},
        {"key": "end_date", "label": "End"},
        {"key": "payment_amount", "label": "Payment"},
        {"key": "payment_frequency", "label": "Frequency"},
        {"key": "payment_timing", "label": "Timing"},
        {"key": "annual_rate", "label": "Rate %"},
        {"key": "vat_rate", "label": "VAT %"},
        {"key": "opening_lease_liability", "label": "Opening Liability"},
        {"key": "opening_rou_asset", "label": "Opening ROU Asset"},
        {"key": "status", "label": "Status"},
    ]

    totals = {
        "lease_count": len(out),
        "opening_lease_liability": float(total_liability),
        "opening_rou_asset": float(total_rou),
    }

    return out, columns, totals


def build_lease_schedule_report(
    db,
    company_id,
    *,
    lease_id,
    date_from=None,
    date_to=None,
    include_inactive=False,
):
    if not lease_id:
        raise ValueError("lease_id is required")

    schema = db.company_schema(company_id)

    params = [int(company_id), int(lease_id)]
    where = [
        "s.company_id = %s",
        "s.lease_id = %s",
    ]

    if not include_inactive:
        where.append("COALESCE(s.is_active, TRUE) = TRUE")

    if date_from:
        where.append("s.period_end >= %s")
        params.append(date_from)

    if date_to:
        where.append("s.period_start <= %s")
        params.append(date_to)

    sql = f"""
    SELECT
        s.id,
        s.lease_id,
        s.version_no,
        s.is_active,
        s.modification_id,
        s.period_no,
        s.period_start,
        s.period_end,
        COALESCE(s.opening_liability, 0) AS opening_liability,
        COALESCE(s.interest, 0) AS interest,
        COALESCE(s.payment, 0) AS payment,
        COALESCE(s.principal, 0) AS principal,
        COALESCE(s.closing_liability, 0) AS closing_liability,
        COALESCE(s.depreciation, 0) AS depreciation,
        COALESCE(s.vat_portion, 0) AS vat_portion,
        COALESCE(s.net_payment, 0) AS net_payment,
        COALESCE(s.payment_timing, '') AS payment_timing,
        s.posted_journal_id,
        s.posted_at,
        l.lease_name,
        COALESCE(ls.name, '') AS lessor_name
    FROM {schema}.lease_schedule s
    JOIN {schema}.leases l
      ON l.id = s.lease_id
    LEFT JOIN {schema}.lessors ls
      ON ls.id = l.lessor_id
    WHERE {" AND ".join(where)}
    ORDER BY s.period_no ASC, s.id ASC
    """
    rows = db.fetch_all(sql, tuple(params)) or []

    out = []
    total_payment = Decimal("0")
    total_interest = Decimal("0")
    total_principal = Decimal("0")
    total_depr = Decimal("0")

    lease_name = ""
    lessor_name = ""

    for r in rows:
        lease_name = lease_name or (r.get("lease_name") or "")
        lessor_name = lessor_name or (r.get("lessor_name") or "")

        payment = _d(r.get("payment"))
        interest = _d(r.get("interest"))
        principal = _d(r.get("principal"))
        depr = _d(r.get("depreciation"))

        total_payment += payment
        total_interest += interest
        total_principal += principal
        total_depr += depr

        out.append({
            "schedule_id": int(r.get("id") or 0),
            "lease_id": int(r.get("lease_id") or 0),
            "version_no": int(r.get("version_no") or 1),
            "is_active": bool(r.get("is_active")),
            "modification_id": r.get("modification_id"),
            "period_no": int(r.get("period_no") or 0),
            "period_start": str(r.get("period_start")) if r.get("period_start") else None,
            "period_end": str(r.get("period_end")) if r.get("period_end") else None,
            "opening_liability": float(_d(r.get("opening_liability"))),
            "interest": float(interest),
            "payment": float(payment),
            "principal": float(principal),
            "closing_liability": float(_d(r.get("closing_liability"))),
            "depreciation": float(depr),
            "vat_portion": float(_d(r.get("vat_portion"))),
            "net_payment": float(_d(r.get("net_payment"))),
            "payment_timing": r.get("payment_timing") or "",
            "posted_journal_id": r.get("posted_journal_id"),
            "posted_at": str(r.get("posted_at")) if r.get("posted_at") else None,
        })

    columns = [
        {"key": "period_no", "label": "P#"},
        {"key": "period_start", "label": "Start"},
        {"key": "period_end", "label": "End"},
        {"key": "opening_liability", "label": "Opening Liability"},
        {"key": "interest", "label": "Interest"},
        {"key": "payment", "label": "Payment"},
        {"key": "principal", "label": "Principal"},
        {"key": "closing_liability", "label": "Closing Liability"},
        {"key": "depreciation", "label": "Depreciation"},
        {"key": "vat_portion", "label": "VAT Portion"},
        {"key": "net_payment", "label": "Net Payment"},
        {"key": "payment_timing", "label": "Timing"},
        {"key": "posted_journal_id", "label": "Journal"},
    ]

    totals = {
        "row_count": len(out),
        "payment_total": float(total_payment),
        "interest_total": float(total_interest),
        "principal_total": float(total_principal),
        "depreciation_total": float(total_depr),
    }

    extra_meta = {
        "lease_id": int(lease_id),
        "lease_name": lease_name,
        "lessor_name": lessor_name,
    }

    return out, columns, totals, extra_meta


def build_lease_payments_report(
    db,
    company_id,
    *,
    lease_id=None,
    date_from=None,
    date_to=None,
    q=None,
):
    schema = db.company_schema(company_id)

    params = [int(company_id)]
    where = ["p.company_id = %s"]

    if lease_id:
        where.append("p.lease_id = %s")
        params.append(int(lease_id))

    if date_from:
        where.append("p.payment_date >= %s")
        params.append(date_from)

    if date_to:
        where.append("p.payment_date <= %s")
        params.append(date_to)

    if q:
        like = f"%{q}%"
        where.append(
            "(COALESCE(p.reference,'') ILIKE %s OR COALESCE(p.notes,'') ILIKE %s OR COALESCE(l.lease_name,'') ILIKE %s OR COALESCE(ls.name,'') ILIKE %s)"
        )
        params.extend([like, like, like, like])

    sql = f"""
    SELECT
        p.id,
        p.company_id,
        p.lease_id,
        p.schedule_id,
        p.lessor_id,
        p.payment_date,
        COALESCE(p.amount_gross, 0) AS amount_gross,
        COALESCE(p.amount_net, 0) AS amount_net,
        COALESCE(p.vat_amount, 0) AS vat_amount,
        COALESCE(p.reference, '') AS reference,
        COALESCE(p.notes, '') AS notes,
        COALESCE(p.bank_account_code, '') AS bank_account_code,
        COALESCE(p.status, 'draft') AS status,
        p.posted_journal_id,
        p.posted_at,
        l.lease_name,
        COALESCE(ls.name, '') AS lessor_name,
        COALESCE(s.interest, 0) AS schedule_interest,
        COALESCE(s.principal, 0) AS schedule_principal
    FROM {schema}.lease_payments p
    JOIN {schema}.leases l
      ON l.id = p.lease_id
    LEFT JOIN {schema}.lessors ls
      ON ls.id = p.lessor_id
    LEFT JOIN {schema}.lease_schedule s
      ON s.id = p.schedule_id
    WHERE {" AND ".join(where)}
    ORDER BY p.payment_date DESC, p.id DESC
    """
    rows = db.fetch_all(sql, tuple(params)) or []

    out = []
    total_gross = Decimal("0")
    total_net = Decimal("0")
    total_vat = Decimal("0")

    for r in rows:
        gross = _d(r.get("amount_gross"))
        net = _d(r.get("amount_net"))
        vat = _d(r.get("vat_amount"))

        total_gross += gross
        total_net += net
        total_vat += vat

        out.append({
            "lease_payment_id": int(r.get("id") or 0),
            "lease_id": int(r.get("lease_id") or 0),
            "schedule_id": r.get("schedule_id"),
            "payment_date": str(r.get("payment_date")) if r.get("payment_date") else None,
            "reference": r.get("reference") or "",
            "lease_name": r.get("lease_name") or "",
            "lessor_name": r.get("lessor_name") or "",
            "amount_gross": float(gross),
            "amount_net": float(net),
            "vat_amount": float(vat),
            "interest": float(_d(r.get("schedule_interest"))),
            "principal": float(_d(r.get("schedule_principal"))),
            "bank_account_code": r.get("bank_account_code") or "",
            "status": r.get("status") or "draft",
            "posted_journal_id": r.get("posted_journal_id"),
            "posted_at": str(r.get("posted_at")) if r.get("posted_at") else None,
            "notes": r.get("notes") or "",
        })

    columns = [
        {"key": "payment_date", "label": "Date"},
        {"key": "reference", "label": "Ref"},
        {"key": "lease_id", "label": "Lease ID"},
        {"key": "lease_name", "label": "Lease"},
        {"key": "lessor_name", "label": "Lessor"},
        {"key": "amount_gross", "label": "Amount"},
        {"key": "interest", "label": "Interest"},
        {"key": "principal", "label": "Principal"},
        {"key": "vat_amount", "label": "VAT"},
        {"key": "status", "label": "Status"},
        {"key": "posted_journal_id", "label": "Journal"},
    ]

    totals = {
        "row_count": len(out),
        "amount_gross_total": float(total_gross),
        "amount_net_total": float(total_net),
        "vat_total": float(total_vat),
    }

    return out, columns, totals


def build_lease_monthly_due_report(
    db,
    company_id,
    *,
    as_of_date=None,
    q=None,
):
    schema = db.company_schema(company_id)

    if not as_of_date:
        raise ValueError("as_of_date is required")

    params = [int(company_id), as_of_date]
    where = [
        "s.company_id = %s",
        "COALESCE(s.is_active, TRUE) = TRUE",
        "%s BETWEEN s.period_start AND s.period_end",
    ]

    if q:
        like = f"%{q}%"
        where.append(
            "(COALESCE(l.lease_name,'') ILIKE %s OR COALESCE(ls.name,'') ILIKE %s)"
        )
        params.extend([like, like])

    sql = f"""
    SELECT
        s.id,
        s.lease_id,
        s.period_no,
        s.period_start,
        s.period_end,
        COALESCE(s.payment, 0) AS payment,
        COALESCE(s.interest, 0) AS interest,
        COALESCE(s.principal, 0) AS principal,
        COALESCE(s.vat_portion, 0) AS vat_portion,
        COALESCE(s.posted_journal_id, NULL) AS posted_journal_id,
        l.lease_name,
        COALESCE(ls.name, '') AS lessor_name
    FROM {schema}.lease_schedule s
    JOIN {schema}.leases l
      ON l.id = s.lease_id
    LEFT JOIN {schema}.lessors ls
      ON ls.id = l.lessor_id
    WHERE {" AND ".join(where)}
    ORDER BY s.period_no ASC, s.lease_id ASC
    """
    rows = db.fetch_all(sql, tuple(params)) or []

    out = []
    total_due = Decimal("0")

    for r in rows:
        due = _d(r.get("payment"))
        total_due += due

        out.append({
            "schedule_id": int(r.get("id") or 0),
            "lease_id": int(r.get("lease_id") or 0),
            "lease_name": r.get("lease_name") or "",
            "lessor_name": r.get("lessor_name") or "",
            "period_no": int(r.get("period_no") or 0),
            "period_start": str(r.get("period_start")) if r.get("period_start") else None,
            "period_end": str(r.get("period_end")) if r.get("period_end") else None,
            "due": float(due),
            "interest": float(_d(r.get("interest"))),
            "principal": float(_d(r.get("principal"))),
            "vat_portion": float(_d(r.get("vat_portion"))),
            "posted_journal_id": r.get("posted_journal_id"),
        })

    columns = [
        {"key": "lease_id", "label": "Lease ID"},
        {"key": "lease_name", "label": "Lease"},
        {"key": "lessor_name", "label": "Lessor"},
        {"key": "period_no", "label": "Period"},
        {"key": "period_start", "label": "Start"},
        {"key": "period_end", "label": "End"},
        {"key": "due", "label": "Due"},
        {"key": "interest", "label": "Interest"},
        {"key": "principal", "label": "Principal"},
        {"key": "vat_portion", "label": "VAT"},
        {"key": "posted_journal_id", "label": "Journal"},
    ]

    totals = {
        "row_count": len(out),
        "due_total": float(total_due),
        "as_of_date": str(as_of_date),
    }

    return out, columns, totals