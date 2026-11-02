from flask import Blueprint, request, current_app, make_response
from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth, _corsify
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.credit_policy import _can_view_engagements
from BackEnd.Services.practitioner.practitioner_engagements import _json_err, _json_ok

practitioner_dashboard_bp = Blueprint("practitioner_dashboard", __name__)


def _parse_engagement_id():
    raw = (
        request.args.get("engagement_id")
        or request.args.get("engagementId")
        or ""
    ).strip()
    if not raw:
        raise ValueError("engagementId is required")
    try:
        val = int(raw)
    except Exception:
        raise ValueError("engagementId must be a valid integer")
    if val <= 0:
        raise ValueError("engagementId must be greater than zero")
    return val


def _parse_optional_int_arg(name: str):
    raw = (request.args.get(name) or "").strip()
    if raw == "":
        return None
    try:
        val = int(raw)
    except Exception:
        raise ValueError(f"{name} must be a valid integer")
    if val <= 0:
        raise ValueError(f"{name} must be greater than zero")
    return val


def _parse_module_name():
    val = (
        request.args.get("module_name")
        or request.args.get("moduleName")
        or request.args.get("module")
        or ""
    ).strip().lower()
    allowed = {
        "journal_entries", "accounts_receivable", "accounts_payable",
        "revenue", "inventory", "loans", "leases", "ppe", "fixed_assets",
        "vat", "cashbook", "banking", "payments", "receipts",
    }
    if not val:
        raise ValueError("module_name is required")
    if val not in allowed:
        raise ValueError(f"Invalid module_name: {val}")
    return val


def _parse_limit(default=100, max_limit=500):
    raw = int(request.args.get("limit", default))
    return max(1, min(raw, max_limit))


def _parse_offset(default=0):
    raw = int(request.args.get("offset", default))
    return max(0, raw)


# ============================================================
# HELPER: Resolve the engagement's target_company_id
# ============================================================
def _resolve_engagement_target_company(cur, firm_company_id, engagement_id):
    """
    Look up the engagement in the FIRM's schema to find its
    target_company_id (the provisioned company where actual postings live).

    Returns (target_company_id, engagement_name, engagement_code,
             customer_id, customer_name, engagement_status,
             engagement_priority, due_date) or None if not found.
    """
    firm_schema = f"company_{int(firm_company_id)}"

    cur.execute(f"""
        SELECT
            e.id,
            e.engagement_name,
            e.engagement_code,
            e.customer_id,
            e.status AS engagement_status,
            e.priority AS engagement_priority,
            e.due_date,
            e.target_company_id,
            c.name AS customer_name
        FROM {firm_schema}.engagements e
        LEFT JOIN {firm_schema}.customers c ON c.id = e.customer_id
        WHERE e.company_id = %s
          AND e.id = %s
          AND e.is_active = TRUE
        LIMIT 1
    """, (int(firm_company_id), int(engagement_id)))

    row = cur.fetchone()
    if not row:
        return None

    return row


# ============================================================
# HELPER: Map module_name to a SQL fragment + params that filters
# journal_lines / coa rows down to ONLY the accounts that belong to
# that subledger. Returns ("(LOWER(a.section) = %s AND ...)", [params]).
# Returns ("", []) for modules that don't filter by account (payments
# and receipts filter by journal.source instead, handled by the caller).
# ============================================================
def _build_module_account_filter(module_name):
    """Return (sql_fragment, params) restricting COA rows to this module."""
    m = (module_name or "").strip().lower()

    if m == "revenue":
        # P&L revenue / sales / income / adjustments accounts only.
        return (
            """(
                LOWER(COALESCE(a.section, '')) = 'profit or loss'
                AND (
                    LOWER(COALESCE(a.category, '')) IN
                        ('revenue','sales revenue','other income',
                         'other operating income','adjustments','finance income',
                         'income')
                    OR LOWER(COALESCE(a.code_family, '')) LIKE 'pl_rev%'
                    OR LOWER(COALESCE(a.name, '')) ~
                        '(revenue|sales|income|service|royalt|fee earned|turnover)'
                )
            )""",
            [],
        )

    if m == "inventory":
        return (
            """(
                LOWER(COALESCE(a.category, '')) IN ('inventory','current assets')
                AND (
                    LOWER(COALESCE(a.name, '')) ~
                        '(inventory|stock|raw material|work in progress|wip|finished goods)'
                    OR LOWER(COALESCE(a.name, '')) ~
                        '(grni|goods received not invoiced)'
                    OR LOWER(COALESCE(a.name, '')) ~
                        '(purchase price variance|ppv)'
                    OR LOWER(COALESCE(a.name, '')) ~
                        '(supplier advances|vendor prepayments|prepayment to supplier)'
                    OR LOWER(COALESCE(a.subcategory, '')) = 'inventory'
                )
            )""",
            [],
        )

    if m in ("ppe", "fixed_assets"):
        return (
            """(
                LOWER(COALESCE(a.category, '')) IN
                    ('non-current assets','accumulated depreciation',
                     'depreciation & amortization','fixed assets')
                AND (
                    LOWER(COALESCE(a.name, '')) ~
                        '(asset|depreciation|property|ppe|plant|equipment|vehicle|'
                        'building|furniture|fixture|land|machinery|computer)'
                )
                AND LOWER(COALESCE(a.name, '')) NOT LIKE '%right-of-use%'
                AND LOWER(COALESCE(a.name, '')) NOT LIKE '%rou asset%'
                AND LOWER(COALESCE(a.subcategory, '')) <> 'lease'
            )""",
            [],
        )

    if m == "loans":
        return (
            """(
                LOWER(COALESCE(a.name, '')) ~ '(loan|borrowing|mortgage|debenture|note payable)'
                OR LOWER(COALESCE(a.category, '')) LIKE '%loan%'
                OR LOWER(COALESCE(a.subcategory, '')) LIKE '%loan%'
            )
            AND LOWER(COALESCE(a.name, '')) NOT LIKE '%lease%'
            """,
            [],
        )

    if m == "leases":
        return (
            """(
                LOWER(COALESCE(a.name, '')) LIKE '%lease%'
                OR LOWER(COALESCE(a.name, '')) LIKE '%right-of-use%'
                OR LOWER(COALESCE(a.name, '')) LIKE '%rou asset%'
                OR LOWER(COALESCE(a.subcategory, '')) = 'lease'
                OR LOWER(COALESCE(a.category, '')) LIKE '%lease%'
            )""",
            [],
        )

    if m == "vat":
        return (
            """(
                LOWER(COALESCE(a.name, '')) ~ '(vat|sales tax|gst|input tax|output tax|hst|value added tax)'
                OR LOWER(COALESCE(a.subcategory, '')) = 'vat'
                OR LOWER(COALESCE(a.subcategory, '')) = 'sales tax'
            )
            AND LOWER(COALESCE(a.name, '')) NOT LIKE '%income tax%'
            AND LOWER(COALESCE(a.name, '')) NOT LIKE '%withholding%'
            AND LOWER(COALESCE(a.name, '')) NOT LIKE '%payroll tax%'
            """,
            [],
        )

    if m in ("cashbook", "banking"):
        return (
            """(
                LOWER(COALESCE(a.category, '')) IN ('cash & equivalents','cash and equivalents','cash','bank')
                OR LOWER(COALESCE(a.name, '')) ~ '(cash|bank|petty cash)'
                OR LOWER(COALESCE(a.cf_bucket, '')) IN ('cash','bank','cash and equivalents')
                OR COALESCE(a.is_cash_equiv, FALSE) = TRUE
            )""",
            [],
        )

    # payments & receipts filter by journal.source, not account.
    # Return empty filter — caller adds the source IN (...) clause.
    return ("", [])


# ============================================================
# HELPER: Map module_name to the actual table + query in the
# target company's schema.
# ============================================================
def _query_target_company_postings(
    cur,
    target_company_id,
    module_name,
    *,
    status="",
    event_type="",
    prepared_by_user_id=None,
    reviewer_user_id=None,
    date_from=None,
    date_to=None,
    mine_only=False,
    current_user_id=None,
    q="",
    limit=100,
    offset=0,
    count_only=False,
):
    """
    Query ACTUAL financial data from the target/provisioned company's schema.
    Returns a list of posting activity rows (or a count if count_only=True).
    """
    target_schema = f"company_{int(target_company_id)}"
    params = []
    where_clauses = ["1=1"]

    # Build the query based on module_name
    if module_name == "journal_entries":
        base_table = "journal"
        ref_col = "ref"
        desc_col = "description"
        date_col = "date"
        amount_col = "gross_amount"
        # Journal has: id, date, ref, description, gross_amount, currency,
        # posted_by_user_id, status (always 'posted' in journal table),
        # reversal_of_journal_id

        if date_from:
            where_clauses.append(f"date >= %s")
            params.append(date_from)
        if date_to:
            where_clauses.append(f"date <= %s")
            params.append(date_to)
        if q:
            where_clauses.append(f"(LOWER(COALESCE(ref, '')) LIKE LOWER(%s) OR LOWER(COALESCE(description, '')) LIKE LOWER(%s))")
            params.extend([f"%{q}%", f"%{q}%"])

        where_sql = " AND ".join(where_clauses)

        if count_only:
            sql = f"""
                SELECT COUNT(*) AS total_rows
                FROM {target_schema}.{base_table}
                WHERE {where_sql}
                  AND COALESCE(reversal_of_journal_id, 0) = 0
            """
            cur.execute(sql, params)
            row = cur.fetchone()
            return {"total_rows": int(row["total_rows"]) if row else 0}

        sql = f"""
            SELECT
                j.id,
                j.date AS posting_date,
                j.ref AS reference_no,
                j.description,
                j.gross_amount AS amount,
                j.currency,
                NULL::INTEGER AS prepared_by_user_id,
                NULL AS reviewer_user_id,
                'posted' AS status,
                'journal_entry' AS event_type,
                'journal' AS source_table,
                j.id AS source_id,
                NULL AS module_name,
                j.created_at
            FROM {target_schema}.{base_table} j
            WHERE {where_sql}
              AND COALESCE(j.reversal_of_journal_id, 0) = 0
            ORDER BY j.date DESC, j.id DESC
            LIMIT %s OFFSET %s
        """
        params.extend([limit, offset])

    elif module_name == "accounts_receivable":
        base_table = "invoices"

        if status:
            where_clauses.append(f"LOWER(COALESCE(status, '')) = LOWER(%s)")
            params.append(status)
        if date_from:
            where_clauses.append(f"invoice_date >= %s")
            params.append(date_from)
        if date_to:
            where_clauses.append(f"invoice_date <= %s")
            params.append(date_to)
        if q:
            where_clauses.append(f"(LOWER(COALESCE(number, '')) LIKE LOWER(%s) OR LOWER(COALESCE(notes, '')) LIKE LOWER(%s))")
            params.extend([f"%{q}%", f"%{q}%"])

        where_sql = " AND ".join(where_clauses)

        if count_only:
            sql = f"SELECT COUNT(*) AS total_rows FROM {target_schema}.{base_table} WHERE {where_sql}"
            cur.execute(sql, params)
            row = cur.fetchone()
            return {"total_rows": int(row["total_rows"]) if row else 0}

        sql = f"""
            SELECT
                i.id,
                i.invoice_date AS posting_date,
                i.number AS reference_no,
                COALESCE(
                    NULLIF(BTRIM(i.notes), ''),
                    NULLIF(BTRIM(c.name), ''),
                    NULLIF(BTRIM(i.number), ''),
                    'Invoice'
                ) AS description,
                i.total_amount AS amount,
                i.currency,
                i.created_by_user_id AS prepared_by_user_id,
                NULL AS reviewer_user_id,
                COALESCE(i.status, 'draft') AS status,
                'invoice' AS event_type,
                'invoices' AS source_table,
                i.id AS source_id,
                NULL AS module_name,
                i.created_at
            FROM {target_schema}.invoices i
            LEFT JOIN {target_schema}.customers c
                ON c.id = i.customer_id
            AND c.company_id = i.company_id
            WHERE {where_sql}
            ORDER BY i.invoice_date DESC, i.id DESC
            LIMIT %s OFFSET %s
        """
        params.extend([limit, offset])

    elif module_name == "accounts_payable":
        base_table = "bills"

        if status:
            where_clauses.append(f"LOWER(COALESCE(status, '')) = LOWER(%s)")
            params.append(status)
        if date_from:
            where_clauses.append(f"bill_date >= %s")
            params.append(date_from)
        if date_to:
            where_clauses.append(f"bill_date <= %s")
            params.append(date_to)
        if q:
            where_clauses.append(f"(LOWER(COALESCE(number, '')) LIKE LOWER(%s) OR LOWER(COALESCE(notes, '')) LIKE LOWER(%s))")
            params.extend([f"%{q}%", f"%{q}%"])

        where_sql = " AND ".join(where_clauses)

        if count_only:
            sql = f"SELECT COUNT(*) AS total_rows FROM {target_schema}.{base_table} WHERE {where_sql}"
            cur.execute(sql, params)
            row = cur.fetchone()
            return {"total_rows": int(row["total_rows"]) if row else 0}

        sql = f"""
            SELECT
                b.id,
                b.bill_date AS posting_date,
                b.number AS reference_no,
                COALESCE(
                    NULLIF(BTRIM(b.notes), ''),
                    NULLIF(BTRIM(v.name), ''),
                    NULLIF(BTRIM(b.number), ''),
                    'Bill'
                ) AS description,
                b.total_amount AS amount,
                b.currency,
                NULL::INTEGER AS prepared_by_user_id,
                NULL AS reviewer_user_id,
                COALESCE(b.status, 'draft') AS status,
                'bill' AS event_type,
                'bills' AS source_table,
                b.id AS source_id,
                NULL AS module_name,
                b.created_at
            FROM {target_schema}.bills b
            LEFT JOIN {target_schema}.vendors v
                ON v.id = b.vendor_id
            AND v.company_id = b.company_id
            WHERE {where_sql}
            ORDER BY b.bill_date DESC, b.id DESC
            LIMIT %s OFFSET %s
        """
        params.extend([limit, offset])

    else:
        # ---------------------------------------------------------------
        # Module-aware filtering for subledgers (revenue, inventory, ppe,
        # loans, leases, vat, cashbook, banking, payments, receipts).
        #
        # We JOIN journal -> journal_lines -> coa ON account_code = code
        # and restrict to journals whose lines touch accounts that belong
        # to the requested subledger. We also honour journal.source for
        # payments / receipts which are event-driven, not account-driven.
        # ---------------------------------------------------------------
        module_filter_sql, module_filter_params = _build_module_account_filter(
            module_name
        )

        source_filter_sql = ""
        if module_name == "payments":
            source_filter_sql = (
                " AND LOWER(COALESCE(j.source, '')) IN "
                "('payment','bill_payment','vendor_payment','ap_payment','cash_payment')"
            )
        elif module_name == "receipts":
            source_filter_sql = (
                " AND LOWER(COALESCE(j.source, '')) IN "
                "('receipt','invoice_receipt','customer_receipt','ar_receipt','cash_receipt')"
            )

        try:
            if count_only:
                sql = f"""
                    SELECT COUNT(DISTINCT j.id) AS total_rows
                    FROM {target_schema}.journal j
                """
                join_clause = ""
                where_extra = ""
                count_params = []

                if module_filter_sql:
                    join_clause = (
                        f" JOIN {target_schema}.journal_lines jl "
                        f" ON jl.journal_id = j.id "
                        f" LEFT JOIN {target_schema}.coa a "
                        f" ON a.code = jl.account_code "
                    )
                    where_extra = " AND (" + module_filter_sql + ")"
                    count_params = list(module_filter_params)

                sql += join_clause
                sql += (
                    " WHERE COALESCE(j.reversal_of_journal_id, 0) = 0"
                    + source_filter_sql
                    + where_extra
                )
                if date_from:
                    sql += " AND j.date >= %s"
                    count_params.append(date_from)
                if date_to:
                    sql += " AND j.date <= %s"
                    count_params.append(date_to)
                if q:
                    sql += (
                        " AND (LOWER(COALESCE(j.ref, '')) LIKE LOWER(%s) "
                        " OR LOWER(COALESCE(j.description, '')) LIKE LOWER(%s))"
                    )
                    count_params.extend([f"%{q}%", f"%{q}%"])

                cur.execute(sql, count_params)
                row = cur.fetchone()
                return {"total_rows": int(row["total_rows"]) if row else 0}

            sql = f"""
                SELECT DISTINCT
                    j.id,
                    j.date AS posting_date,
                    j.ref AS reference_no,
                    j.description,
                    j.gross_amount AS amount,
                    j.currency,
                    NULL::INTEGER AS prepared_by_user_id,
                    NULL AS reviewer_user_id,
                    'posted' AS status,
                    %s AS event_type,
                    'journal' AS source_table,
                    j.id AS source_id,
                    %s AS module_name,
                    j.created_at
                FROM {target_schema}.journal j
            """
            row_params = [module_name, module_name]

            join_clause = ""
            where_extra = ""
            if module_filter_sql:
                join_clause = (
                    f" JOIN {target_schema}.journal_lines jl "
                    f" ON jl.journal_id = j.id "
                    f" LEFT JOIN {target_schema}.coa a "
                    f" ON a.code = jl.account_code "
                )
                where_extra = " AND (" + module_filter_sql + ")"
                row_params.extend(module_filter_params)

            sql += join_clause
            sql += (
                " WHERE COALESCE(j.reversal_of_journal_id, 0) = 0"
                + source_filter_sql
                + where_extra
            )
            if date_from:
                sql += " AND j.date >= %s"
                row_params.append(date_from)
            if date_to:
                sql += " AND j.date <= %s"
                row_params.append(date_to)
            if q:
                sql += (
                    " AND (LOWER(COALESCE(j.ref, '')) LIKE LOWER(%s) "
                    " OR LOWER(COALESCE(j.description, '')) LIKE LOWER(%s))"
                )
                row_params.extend([f"%{q}%", f"%{q}%"])

            sql += " ORDER BY j.date DESC, j.id DESC LIMIT %s OFFSET %s"
            row_params.extend([limit, offset])

            cur.execute(sql, row_params)
            return cur.fetchall()

        except Exception:
            # coa/journal_lines table missing or query failed — empty result
            if count_only:
                return {"total_rows": 0}
            return []

    cur.execute(sql, params)
    return cur.fetchall()


# ============================================================
# HELPER: Look up a company's base currency from public.companies
# ============================================================
def _lookup_company_currency(cur, company_id):
    """Return the company's currency code (e.g. 'ZAR', 'USD') or None."""
    try:
        cur.execute(
            """
            SELECT currency
            FROM public.companies
            WHERE id = %s
            LIMIT 1
            """,
            (int(company_id),),
        )
        row = cur.fetchone()
        if row and row.get("currency"):
            return row["currency"]
    except Exception:
        pass
    return None


# ============================================================
# HELPER: Build summary from actual posting data
# ============================================================
def _build_summary_from_actual_data(
    cur,
    target_company_id,
    engagement_info,
    module_name,
):
    """
    Build a summary row by querying the target company's actual data.
    """
    target_schema = f"company_{int(target_company_id)}"

    if module_name == "journal_entries":
        sql = f"""
            SELECT
                COUNT(*) AS total_items,
                COUNT(*) FILTER (WHERE COALESCE(reversal_of_journal_id, 0) = 0) AS posted_count,
                0 AS draft_count,
                0 AS review_count,
                0 AS approved_count,
                0 AS returned_or_rejected_count,
                COUNT(*) FILTER (WHERE date = CURRENT_DATE) AS activity_today_count,
                MAX(date) AS last_activity_date,
                COALESCE(SUM(gross_amount), 0) AS total_amount,
                COALESCE(SUM(gross_amount) FILTER (WHERE COALESCE(reversal_of_journal_id, 0) = 0), 0) AS posted_amount
            FROM {target_schema}.journal
            WHERE COALESCE(reversal_of_journal_id, 0) = 0
        """
        cur.execute(sql)
        row = cur.fetchone() or {}

    elif module_name == "accounts_receivable":
        sql = f"""
            SELECT
                COUNT(*) AS total_items,
                COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'draft') AS draft_count,
                COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) IN ('pending_review', 'in_review')) AS review_count,
                COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'approved') AS approved_count,
                COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'posted') AS posted_count,
                COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) IN ('returned', 'rejected')) AS returned_or_rejected_count,
                COUNT(*) FILTER (WHERE invoice_date = CURRENT_DATE) AS activity_today_count,
                MAX(invoice_date) AS last_activity_date,
                COALESCE(SUM(total_amount), 0) AS total_amount,
                COALESCE(SUM(total_amount) FILTER (WHERE LOWER(COALESCE(status, '')) = 'posted'), 0) AS posted_amount
            FROM {target_schema}.invoices
        """
        cur.execute(sql)
        row = cur.fetchone() or {}

    elif module_name == "accounts_payable":
        sql = f"""
            SELECT
                COUNT(*) AS total_items,
                COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'draft') AS draft_count,
                COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) IN ('pending_review', 'in_review')) AS review_count,
                COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'approved') AS approved_count,
                COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'posted') AS posted_count,
                COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) IN ('returned', 'rejected')) AS returned_or_rejected_count,
                COUNT(*) FILTER (WHERE bill_date = CURRENT_DATE) AS activity_today_count,
                MAX(bill_date) AS last_activity_date,
                COALESCE(SUM(total_amount), 0) AS total_amount,
                COALESCE(SUM(total_amount) FILTER (WHERE LOWER(COALESCE(status, '')) = 'posted'), 0) AS posted_amount
            FROM {target_schema}.bills
        """
        cur.execute(sql)
        row = cur.fetchone() or {}

    else:
        # Module-aware summary: count only journals whose lines touch accounts
        # that belong to this subledger.
        module_filter_sql, module_filter_params = _build_module_account_filter(
            module_name
        )
        source_filter_sql = ""
        if module_name == "payments":
            source_filter_sql = (
                " AND LOWER(COALESCE(j.source, '')) IN "
                "('payment','bill_payment','vendor_payment','ap_payment','cash_payment')"
            )
        elif module_name == "receipts":
            source_filter_sql = (
                " AND LOWER(COALESCE(j.source, '')) IN "
                "('receipt','invoice_receipt','customer_receipt','ar_receipt','cash_receipt')"
            )

        try:
            join_clause = ""
            where_extra = ""
            sum_params = list(module_filter_params)
            if module_filter_sql:
                join_clause = (
                    f" JOIN {target_schema}.journal_lines jl "
                    f" ON jl.journal_id = j.id "
                    f" LEFT JOIN {target_schema}.coa a "
                    f" ON a.code = jl.account_code "
                )
                where_extra = " AND (" + module_filter_sql + ")"

            sql = f"""
                SELECT
                    COUNT(DISTINCT j.id) AS total_items,
                    0 AS draft_count,
                    0 AS review_count,
                    0 AS approved_count,
                    COUNT(DISTINCT j.id) AS posted_count,
                    0 AS returned_or_rejected_count,
                    COUNT(DISTINCT j.id) FILTER (WHERE j.date = CURRENT_DATE) AS activity_today_count,
                    MAX(j.date) AS last_activity_date,
                    COALESCE(SUM(DISTINCT j.gross_amount), 0) AS total_amount,
                    COALESCE(SUM(DISTINCT j.gross_amount), 0) AS posted_amount
                FROM {target_schema}.journal j
            """
            sql += join_clause
            sql += (
                " WHERE COALESCE(j.reversal_of_journal_id, 0) = 0"
                + source_filter_sql
                + where_extra
            )
            cur.execute(sql, sum_params)
            row = cur.fetchone() or {}
        except Exception:
            row = {
                "total_items": 0, "draft_count": 0, "review_count": 0,
                "approved_count": 0, "posted_count": 0,
                "returned_or_rejected_count": 0,
                "activity_today_count": 0, "last_activity_date": None,
                "total_amount": 0, "posted_amount": 0,
            }

    # Merge engagement info + summary stats
    return {
        "engagement_id": engagement_info.get("id"),
        "engagement_name": engagement_info.get("engagement_name"),
        "engagement_code": engagement_info.get("engagement_code"),
        "customer_id": engagement_info.get("customer_id"),
        "customer_name": engagement_info.get("customer_name"),
        "engagement_status": engagement_info.get("engagement_status"),
        "engagement_priority": engagement_info.get("engagement_priority"),
        "due_date": engagement_info.get("due_date"),
        "total_items": int(row.get("total_items") or 0),
        "draft_count": int(row.get("draft_count") or 0),
        "review_count": int(row.get("review_count") or 0),
        "approved_count": int(row.get("approved_count") or 0),
        "posted_count": int(row.get("posted_count") or 0),
        "returned_or_rejected_count": int(row.get("returned_or_rejected_count") or 0),
        "activity_today_count": int(row.get("activity_today_count") or 0),
        "last_activity_date": row.get("last_activity_date"),
        "total_amount": float(row.get("total_amount") or 0),
        "posted_amount": float(row.get("posted_amount") or 0),
        "module_name": module_name,
        "currency_code": _lookup_company_currency(cur, target_company_id),
    }


# ============================================================
# HELPER: Build filter options from actual data
# ============================================================
def _build_filter_options_from_actual_data(
    cur,
    target_company_id,
    module_name,
):
    """Build filter options by querying distinct values from actual data."""
    target_schema = f"company_{int(target_company_id)}"
    statuses = []
    event_types = []
    prepared_by_users = []
    reviewer_users = []

    try:
        if module_name == "journal_entries":
            cur.execute(f"""
                SELECT DISTINCT 'posted' AS status
                FROM {target_schema}.journal
                WHERE COALESCE(reversal_of_journal_id, 0) = 0
                LIMIT 20
            """)
            statuses = [r["status"] for r in cur.fetchall() if r.get("status")]
            event_types = ["journal_entry"]

            cur.execute(f"""
                SELECT DISTINCT posted_by_user_id AS user_id
                FROM {target_schema}.journal
                WHERE posted_by_user_id IS NOT NULL
                  AND COALESCE(reversal_of_journal_id, 0) = 0
                LIMIT 50
            """)
            prepared_by_users = [
                {"user_id": r["user_id"], "user_name": f"User {r['user_id']}"}
                for r in cur.fetchall()
            ]

        elif module_name == "accounts_receivable":
            cur.execute(f"""
                SELECT DISTINCT COALESCE(status, 'draft') AS status
                FROM {target_schema}.invoices
                LIMIT 20
            """)
            statuses = [r["status"] for r in cur.fetchall() if r.get("status")]
            event_types = ["invoice", "receipt", "credit_note"]

            cur.execute(f"""
                SELECT DISTINCT created_by_user_id AS user_id
                FROM {target_schema}.invoices
                WHERE created_by_user_id IS NOT NULL
                LIMIT 50
            """)
            prepared_by_users = [
                {"user_id": r["user_id"], "user_name": f"User {r['user_id']}"}
                for r in cur.fetchall()
            ]

        elif module_name == "accounts_payable":
            cur.execute(f"""
                SELECT DISTINCT COALESCE(status, 'draft') AS status
                FROM {target_schema}.bills
                LIMIT 20
            """)
            statuses = [r["status"] for r in cur.fetchall() if r.get("status")]
            event_types = ["bill", "payment"]

            cur.execute(f"""
                SELECT DISTINCT created_by_user_id AS user_id
                FROM {target_schema}.bills
                WHERE created_by_user_id IS NOT NULL
                LIMIT 50
            """)
            prepared_by_users = [
                {"user_id": r["user_id"], "user_name": f"User {r['user_id']}"}
                for r in cur.fetchall()
            ]

        else:
            # Module-aware filter options — pull real statuses / event types
            # from the journals that actually belong to this subledger.
            module_filter_sql, module_filter_params = _build_module_account_filter(
                module_name
            )
            source_filter_sql = ""
            if module_name == "payments":
                source_filter_sql = (
                    " AND LOWER(COALESCE(j.source, '')) IN "
                    "('payment','bill_payment','vendor_payment','ap_payment','cash_payment')"
                )
            elif module_name == "receipts":
                source_filter_sql = (
                    " AND LOWER(COALESCE(j.source, '')) IN "
                    "('receipt','invoice_receipt','customer_receipt','ar_receipt','cash_receipt')"
                )

            try:
                join_clause = ""
                where_extra = ""
                opt_params = list(module_filter_params)
                if module_filter_sql:
                    join_clause = (
                        f" JOIN {target_schema}.journal_lines jl "
                        f" ON jl.journal_id = j.id "
                        f" LEFT JOIN {target_schema}.coa a "
                        f" ON a.code = jl.account_code "
                    )
                    where_extra = " AND (" + module_filter_sql + ")"

                cur.execute(f"""
                    SELECT DISTINCT 'posted' AS status
                    FROM {target_schema}.journal j
                    {join_clause}
                    WHERE COALESCE(j.reversal_of_journal_id, 0) = 0
                    {source_filter_sql}
                    {where_extra}
                    LIMIT 20
                """, opt_params)
                statuses = [
                    r["status"] for r in cur.fetchall() if r.get("status")
                ] or ["posted"]

                # event types: distinct journal.source values for this module
                cur.execute(f"""
                    SELECT DISTINCT COALESCE(j.source, 'journal_entry') AS evt
                    FROM {target_schema}.journal j
                    {join_clause}
                    WHERE COALESCE(j.reversal_of_journal_id, 0) = 0
                    {source_filter_sql}
                    {where_extra}
                    ORDER BY evt
                    LIMIT 30
                """, opt_params)
                event_types = [
                    r["evt"] for r in cur.fetchall() if r.get("evt")
                ] or [module_name]

                cur.execute(f"""
                    SELECT DISTINCT j.posted_by_user_id AS user_id
                    FROM {target_schema}.journal j
                    {join_clause}
                    WHERE j.posted_by_user_id IS NOT NULL
                      AND COALESCE(j.reversal_of_journal_id, 0) = 0
                      {source_filter_sql}
                      {where_extra}
                    LIMIT 50
                """, opt_params)
                prepared_by_users = [
                    {"user_id": r["user_id"], "user_name": f"User {r['user_id']}"}
                    for r in cur.fetchall()
                    if r.get("user_id")
                ]
            except Exception:
                statuses = ["posted"]
                event_types = [module_name]
                prepared_by_users = []

    except Exception:
        pass

    return {
        "statuses": statuses,
        "event_types": event_types,
        "prepared_by_users": prepared_by_users,
        "reviewer_users": reviewer_users,
    }


# ============================================================
# ROUTES
# ============================================================

@practitioner_dashboard_bp.route(
    "/api/companies/<int:cid>/practitioner-dashboard/posting-modules/summary",
    methods=["GET", "OPTIONS"],
)
@require_auth
def get_practitioner_posting_module_summary_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        engagement_id = _parse_engagement_id()
        module_name = _parse_module_name()

        deny = _deny_if_wrong_company(
            payload,
            int(company_id),
            db_service=db_service,
        )
        if deny:
            return deny

        if not _can_view_engagements(payload):
            return _json_err("You do not have permission to view posting module summaries.", 403)

        with db_service._conn_cursor() as (conn, cur):
            # Step 1: Look up the engagement in the FIRM's schema
            # to get target_company_id
            eng_info = _resolve_engagement_target_company(
                cur, company_id, engagement_id
            )

            if not eng_info:
                return _json_err("Engagement not found or not active.", 404)

            target_company_id = eng_info.get("target_company_id")

            if not target_company_id:
                # No target company — engagement may not have a provisioned
                # workspace yet. Return empty summary.
                row = {
                    "engagement_id": engagement_id,
                    "engagement_name": eng_info.get("engagement_name"),
                    "engagement_code": eng_info.get("engagement_code"),
                    "customer_name": eng_info.get("customer_name"),
                    "engagement_status": eng_info.get("engagement_status"),
                    "total_items": 0,
                    "draft_count": 0,
                    "review_count": 0,
                    "posted_count": 0,
                    "total_amount": 0,
                    "last_activity_date": None,
                    "module_name": module_name,
                }
                return _json_ok({"row": row})

            # Step 2: Query ACTUAL financial data from the target company
            row = _build_summary_from_actual_data(
                cur,
                int(target_company_id),
                eng_info,
                module_name,
            )

        return _json_ok({"row": row})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("get_practitioner_posting_module_summary_route failed")
        return _json_err(str(e), 500)


@practitioner_dashboard_bp.route(
    "/api/companies/<int:cid>/practitioner-dashboard/posting-modules/activity",
    methods=["GET", "OPTIONS"],
)
@require_auth
def list_practitioner_posting_module_activity_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        engagement_id = _parse_engagement_id()
        module_name = _parse_module_name()

        deny = _deny_if_wrong_company(
            payload,
            company_id,
            db_service=db_service,
            engagement_id=int(engagement_id),
        )
        if deny:
            return deny

        if not _can_view_engagements(payload):
            return _json_err("You do not have permission to view posting module activity.", 403)

        status = (request.args.get("status") or "").strip().lower()
        event_type = (
            request.args.get("event_type")
            or request.args.get("eventType")
            or ""
        ).strip().lower()

        prepared_by_user_id = (
            _parse_optional_int_arg("prepared_by_user_id")
            or _parse_optional_int_arg("preparedByUserId")
        )
        reviewer_user_id = (
            _parse_optional_int_arg("reviewer_user_id")
            or _parse_optional_int_arg("reviewerUserId")
        )

        date_from = (
            request.args.get("date_from")
            or request.args.get("dateFrom")
            or ""
        ).strip()

        date_to = (
            request.args.get("date_to")
            or request.args.get("dateTo")
            or ""
        ).strip()

        q = (request.args.get("q") or "").strip()

        mine_only = str(
            request.args.get("mine_only")
            or request.args.get("mineOnly")
            or ""
        ).strip().lower() in ("1", "true", "yes", "y", "on")

        limit = _parse_limit(default=100)
        offset = _parse_offset()
        current_user_id = payload.get("user_id")

        with db_service._conn_cursor() as (conn, cur):
            # Step 1: Look up engagement to get target_company_id
            eng_info = _resolve_engagement_target_company(
                cur, company_id, engagement_id
            )

            if not eng_info:
                return _json_ok({"rows": [], "total": 0, "limit": limit, "offset": offset})

            target_company_id = eng_info.get("target_company_id")

            if not target_company_id:
                return _json_ok({"rows": [], "total": 0, "limit": limit, "offset": offset})

            # Step 2: Query ACTUAL financial data from the target company
            rows = _query_target_company_postings(
                cur,
                int(target_company_id),
                module_name,
                status=status,
                event_type=event_type,
                prepared_by_user_id=prepared_by_user_id,
                reviewer_user_id=reviewer_user_id,
                date_from=date_from or None,
                date_to=date_to or None,
                mine_only=mine_only,
                current_user_id=current_user_id,
                q=q,
                limit=limit,
                offset=offset,
            )

            total = _query_target_company_postings(
                cur,
                int(target_company_id),
                module_name,
                status=status,
                event_type=event_type,
                prepared_by_user_id=prepared_by_user_id,
                reviewer_user_id=reviewer_user_id,
                date_from=date_from or None,
                date_to=date_to or None,
                mine_only=mine_only,
                current_user_id=current_user_id,
                q=q,
                count_only=True,
            )

        total_count = total.get("total_rows", 0) if isinstance(total, dict) else 0

        # Format rows for response
        formatted_rows = []
        for r in (rows or []):
            if isinstance(r, dict):
                formatted_rows.append({
                    "id": r.get("id"),
                    "posting_date": r.get("posting_date").isoformat() if r.get("posting_date") else None,
                    "reference_no": r.get("reference_no"),
                    "description": r.get("description"),
                    "amount": float(r.get("amount") or 0),
                    "currency": r.get("currency"),
                    "prepared_by_user_id": r.get("prepared_by_user_id"),
                    "prepared_by_user_name": f"User {r['prepared_by_user_id']}" if r.get("prepared_by_user_id") else None,
                    "reviewer_user_id": r.get("reviewer_user_id"),
                    "reviewer_user_name": None,
                    "status": r.get("status"),
                    "event_type": r.get("event_type"),
                    "source_table": r.get("source_table"),
                    "source_id": r.get("source_id"),
                    "module_name": r.get("module_name") or module_name,
                })

        return _json_ok({
            "rows": formatted_rows,
            "total": total_count,
            "limit": limit,
            "offset": offset,
        })

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("list_practitioner_posting_module_activity_route failed")
        return _json_err(str(e), 500)


@practitioner_dashboard_bp.route(
    "/api/companies/<int:cid>/practitioner-dashboard/posting-modules/filter-options",
    methods=["GET", "OPTIONS"],
)
@require_auth
def list_practitioner_posting_module_filter_options_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        engagement_id = _parse_engagement_id()
        module_name = _parse_module_name()

        deny = _deny_if_wrong_company(
            payload,
            company_id,
            db_service=db_service,
            engagement_id=int(engagement_id),
        )
        if deny:
            return deny

        if not _can_view_engagements(payload):
            return _json_err("You do not have permission to view posting module filters.", 403)

        with db_service._conn_cursor() as (conn, cur):
            # Step 1: Look up engagement to get target_company_id
            eng_info = _resolve_engagement_target_company(
                cur, company_id, engagement_id
            )

            if not eng_info:
                return _json_ok({"row": {"statuses": [], "event_types": [], "prepared_by_users": [], "reviewer_users": []}})

            target_company_id = eng_info.get("target_company_id")

            if not target_company_id:
                return _json_ok({"row": {"statuses": [], "event_types": [], "prepared_by_users": [], "reviewer_users": []}})

            # Step 2: Build filter options from actual data
            row = _build_filter_options_from_actual_data(
                cur,
                int(target_company_id),
                module_name,
            )

        return _json_ok({"row": row})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("list_practitioner_posting_module_filter_options_route failed")
        return _json_err(str(e), 500)
