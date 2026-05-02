def build_revenue_disclosure_payload(db, company_id, date_from, date_to):
    schema = db.company_schema(company_id)

    def one(sql, params=()):
        return db.fetch_one(sql, params) or {}

    def all_(sql, params=()):
        return db.fetch_all(sql, params) or []

    revenue_by_category = all_(f"""
        WITH obligation_totals AS (
            SELECT
                e.obligation_id,
                SUM(e.revenue_delta_this_run) AS revenue
            FROM {schema}.revenue_recognition_entries e
            JOIN {schema}.revenue_recognition_runs r ON r.id = e.run_id
            WHERE e.company_id = %s
            AND r.status = 'posted'
            AND e.period_end BETWEEN %s AND %s
            GROUP BY e.obligation_id
        )

        SELECT
            COALESCE(
                ro.payload_json->>'catalog_item_type',
                ro.payload_json->>'catalog_item_label',
                ro.obligation_name,
                'Uncategorised'
            ) AS category,
            SUM(ot.revenue) AS amount
        FROM obligation_totals ot
        LEFT JOIN {schema}.revenue_obligations ro
            ON ro.id = ot.obligation_id
        GROUP BY 1
        ORDER BY amount DESC;
    """, (company_id, date_from, date_to))

    revenue_timing = all_(f"""
        WITH obligation_totals AS (
            SELECT
                e.obligation_id,
                SUM(e.revenue_delta_this_run) AS revenue
            FROM {schema}.revenue_recognition_entries e
            JOIN {schema}.revenue_recognition_runs r ON r.id = e.run_id
            WHERE e.company_id = %s
            AND r.status = 'posted'
            AND e.period_end BETWEEN %s AND %s
            GROUP BY e.obligation_id
        )

        SELECT
            COALESCE(ro.recognition_timing, 'unknown') AS timing,
            SUM(ot.revenue) AS amount
        FROM obligation_totals ot
        LEFT JOIN {schema}.revenue_obligations ro
            ON ro.id = ot.obligation_id
        GROUP BY 1
        ORDER BY 1;
    """, (company_id, date_from, date_to))

    contract_balances = one(f"""
        SELECT
            SUM(
                CASE
                    WHEN COALESCE(recognized_revenue_to_date,0) > COALESCE(billed_to_date,0)
                    THEN COALESCE(recognized_revenue_to_date,0) - COALESCE(billed_to_date,0)
                    ELSE 0
                END
            ) AS contract_assets,

            SUM(
                CASE
                    WHEN COALESCE(billed_to_date,0) > COALESCE(recognized_revenue_to_date,0)
                    THEN COALESCE(billed_to_date,0) - COALESCE(recognized_revenue_to_date,0)
                    ELSE 0
                END
            ) AS contract_liabilities
        FROM {schema}.revenue_contracts
        WHERE company_id = %s;
    """, (company_id,))

    receivables = one(f"""
        SELECT
            COALESCE(SUM(total_amount),0) AS gross_receivables
        FROM {schema}.invoices
        WHERE company_id = %s
        AND revenue_contract_id IS NOT NULL
        AND status IN ('approved','posted','issued')
        AND reversed_journal_id IS NULL
        AND writeoff_journal_id IS NULL;
    """, (company_id,))

    unsatisfied_obligations = all_(f"""
        SELECT
            rc.id AS contract_id,
            rc.contract_number,
            rc.contract_title,
            rc.end_date,
            ro.id AS obligation_id,
            ro.obligation_name,
            ro.recognition_timing,
            COALESCE(ro.allocated_transaction_price,0) AS allocated_transaction_price,
            COALESCE(ro.revenue_to_date,0) AS revenue_to_date,
            GREATEST(
                COALESCE(ro.allocated_transaction_price,0) - COALESCE(ro.revenue_to_date,0),
                0
            ) AS remaining_amount
        FROM {schema}.revenue_obligations ro
        JOIN {schema}.revenue_contracts rc ON rc.id = ro.contract_id
        WHERE ro.company_id = %s
        AND COALESCE(ro.obligation_status,'') NOT IN ('cancelled','void')
        AND GREATEST(
                COALESCE(ro.allocated_transaction_price,0) - COALESCE(ro.revenue_to_date,0),
                0
            ) > 0
        ORDER BY rc.end_date NULLS LAST, rc.contract_number;
    """, (company_id,))

    judgments = all_(f"""
        SELECT DISTINCT
            ro.recognition_timing,
            ro.progress_method,
            ro.recognition_trigger,
            rc.billing_method,
            rc.has_significant_financing_component,
            rc.variable_consideration_est,
            rc.variable_consideration_constrained
        FROM {schema}.revenue_obligations ro
        JOIN {schema}.revenue_contracts rc ON rc.id = ro.contract_id
        WHERE ro.company_id = %s;
    """, (company_id,))

    total_revenue = one(f"""
        SELECT COALESCE(SUM(e.revenue_delta_this_run),0) AS amount
        FROM {schema}.revenue_recognition_entries e
        JOIN {schema}.revenue_recognition_runs r ON r.id = e.run_id
        WHERE e.company_id = %s
        AND r.status = 'posted'
        AND e.period_end BETWEEN %s AND %s;
    """, (company_id, date_from, date_to))

    return {
        "company_id": company_id,
        "date_from": str(date_from),
        "date_to": str(date_to),

        "summary": {
            "total_revenue": float(total_revenue.get("amount") or 0),
            "contract_assets": float(contract_balances.get("contract_assets") or 0),
            "contract_liabilities": float(contract_balances.get("contract_liabilities") or 0),
            "gross_receivables_from_contracts": float(receivables.get("gross_receivables") or 0),
        },

        "revenue_by_category": revenue_by_category,
        "revenue_timing": revenue_timing,
        "contract_assets": contract_balances.get("contract_assets") or 0,
        "contract_liabilities": contract_balances.get("contract_liabilities") or 0,
        "receivables_from_contracts": receivables,
        "unsatisfied_performance_obligations": unsatisfied_obligations,

        "significant_judgments": {
            "basis": "Generated from contract billing methods, recognition timing, progress methods, recognition triggers, financing component flags, and variable consideration fields.",
            "items": judgments,
        },
    }