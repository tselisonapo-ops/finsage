"""
DDL and schema management for the Marketplace module.
Creates dedicated marketplace tables within each company schema:
  - marketplace_accounts
  - marketplace_orders
  - marketplace_order_lines
  - marketplace_fees
  - marketplace_remittances
  - marketplace_remittance_lines
  - marketplace_settlement_allocations
"""

from __future__ import annotations
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def get_marketplace_ddl_sql(company_id: int) -> str:
    """Return the idempotent DDL SQL string for the given company schema."""
    schema = f"company_{int(company_id)}"

    return f"""
    -- 1. Marketplace Accounts (Configurations for Makro, Takealot, etc.)
    CREATE TABLE IF NOT EXISTS {schema}.marketplace_accounts (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL DEFAULT {company_id},
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'ZAR',
        receivable_account_code TEXT NOT NULL DEFAULT 'BS_CA_9002',
        sales_revenue_account_code TEXT NOT NULL DEFAULT 'PL_REV_4000',
        sales_returns_account_code TEXT NULL,
        commission_expense_account_code TEXT NULL,
        transport_expense_account_code TEXT NULL,
        other_expense_account_code TEXT NULL,
        vat_output_account_code TEXT NOT NULL DEFAULT 'BS_CL_2310',
        vat_input_account_code TEXT NOT NULL DEFAULT 'BS_CA_1410',
        cogs_account_code TEXT NULL,
        inventory_account_code TEXT NULL,
        settlement_bank_account_id INT NULL,
        default_vat_rate NUMERIC(6,4) NOT NULL DEFAULT 0.1500,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        settings JSONB NOT NULL DEFAULT '{{}}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_marketplace_accounts_code UNIQUE (company_id, code)
    );

    -- 2. Marketplace Orders (Headers)
    CREATE TABLE IF NOT EXISTS {schema}.marketplace_orders (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL DEFAULT {company_id},
        marketplace_account_id INT NOT NULL REFERENCES {schema}.marketplace_accounts(id),
        external_order_number TEXT NOT NULL,
        order_date DATE NOT NULL,
        fulfilment_date DATE NULL,
        currency TEXT NOT NULL DEFAULT 'ZAR',
        order_status TEXT NOT NULL DEFAULT 'imported', -- 'imported', 'draft', 'approved', 'posted', 'cancelled', 'returned'
        settlement_status TEXT NOT NULL DEFAULT 'unsettled', -- 'unsettled', 'partially_settled', 'settled'
        gross_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        net_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        total_cost NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
        customer_name TEXT NULL,
        shipping_address TEXT NULL,
        posted_journal_id INT NULL REFERENCES {schema}.journal(id),
        cogs_journal_id INT NULL REFERENCES {schema}.journal(id),
        reversal_journal_id INT NULL REFERENCES {schema}.journal(id),
        posted_at TIMESTAMPTZ NULL,
        posted_by INT NULL,
        cancelled_at TIMESTAMPTZ NULL,
        cancelled_by INT NULL,
        cancellation_reason TEXT NULL,
        notes TEXT NULL,
        raw_payload JSONB NOT NULL DEFAULT '{{}}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_marketplace_orders_ext_ref UNIQUE (company_id, marketplace_account_id, external_order_number)
    );

    CREATE INDEX IF NOT EXISTS idx_mp_orders_company_status 
        ON {schema}.marketplace_orders(company_id, order_status);
    CREATE INDEX IF NOT EXISTS idx_mp_orders_settlement_status 
        ON {schema}.marketplace_orders(company_id, settlement_status);
    CREATE INDEX IF NOT EXISTS idx_mp_orders_order_date 
        ON {schema}.marketplace_orders(company_id, order_date);
    CREATE INDEX IF NOT EXISTS idx_mp_orders_ext_ref 
        ON {schema}.marketplace_orders(external_order_number);

    -- 3. Marketplace Order Lines
    CREATE TABLE IF NOT EXISTS {schema}.marketplace_order_lines (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL DEFAULT {company_id},
        order_id INT NOT NULL REFERENCES {schema}.marketplace_orders(id) ON DELETE CASCADE,
        line_number INT NOT NULL DEFAULT 1,
        inventory_item_id INT NULL REFERENCES {schema}.inventory_items(id),
        sku TEXT NULL,
        product_description TEXT NOT NULL,
        quantity NUMERIC(18,4) NOT NULL DEFAULT 1.0000,
        unit_price NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
        discount NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
        vat_rate NUMERIC(6,4) NOT NULL DEFAULT 0.1500,
        vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        net_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        gross_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
        total_cost NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
        inventory_tx_id INT NULL,
        meta JSONB NOT NULL DEFAULT '{{}}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_marketplace_order_lines_num UNIQUE (order_id, line_number)
    );

    CREATE INDEX IF NOT EXISTS idx_mp_order_lines_order_id 
        ON {schema}.marketplace_order_lines(order_id);
    CREATE INDEX IF NOT EXISTS idx_mp_order_lines_item_id 
        ON {schema}.marketplace_order_lines(company_id, inventory_item_id);
    CREATE INDEX IF NOT EXISTS idx_mp_order_lines_sku 
        ON {schema}.marketplace_order_lines(company_id, sku);

    -- 4. Marketplace Fees (Commission, Transport, Fulfilment, etc.)
    CREATE TABLE IF NOT EXISTS {schema}.marketplace_fees (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL DEFAULT {company_id},
        marketplace_account_id INT NOT NULL REFERENCES {schema}.marketplace_accounts(id),
        order_id INT NULL REFERENCES {schema}.marketplace_orders(id),
        external_order_number TEXT NULL,
        fee_type TEXT NOT NULL, -- 'commission', 'transport', 'fulfilment', 'advertising', 'storage', 'penalty', 'other', 'refund_commission', 'refund_transport'
        fee_date DATE NOT NULL,
        amount_before_vat NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        vat_rate NUMERIC(6,4) NOT NULL DEFAULT 0.1500,
        vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        total_fee NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        currency TEXT NOT NULL DEFAULT 'ZAR',
        source_reference TEXT NULL,
        description TEXT NULL,
        posting_status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'approved', 'posted', 'reversed'
        expense_account_code TEXT NULL,
        posted_journal_id INT NULL REFERENCES {schema}.journal(id),
        reversal_journal_id INT NULL REFERENCES {schema}.journal(id),
        posted_at TIMESTAMPTZ NULL,
        posted_by INT NULL,
        remittance_line_id INT NULL,
        raw_payload JSONB NOT NULL DEFAULT '{{}}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_mp_fees_company_type 
        ON {schema}.marketplace_fees(company_id, fee_type);
    CREATE INDEX IF NOT EXISTS idx_mp_fees_ext_ref 
        ON {schema}.marketplace_fees(company_id, external_order_number);
    CREATE INDEX IF NOT EXISTS idx_mp_fees_order_id 
        ON {schema}.marketplace_fees(order_id);
    CREATE INDEX IF NOT EXISTS idx_mp_fees_posting_status 
        ON {schema}.marketplace_fees(company_id, posting_status);

    -- 5. Marketplace Remittances (Headers)
    CREATE TABLE IF NOT EXISTS {schema}.marketplace_remittances (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL DEFAULT {company_id},
        marketplace_account_id INT NOT NULL REFERENCES {schema}.marketplace_accounts(id),
        payment_reference_no TEXT NOT NULL,
        payment_date DATE NOT NULL,
        currency TEXT NOT NULL DEFAULT 'ZAR',
        sales_total NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        returns_total NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        commission_total NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        transport_total NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        other_deductions_total NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        net_payment_total NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        status TEXT NOT NULL DEFAULT 'imported', -- 'imported', 'matched', 'partially_settled', 'settled', 'reconciled'
        bank_account_id INT NULL REFERENCES {schema}.company_bank_accounts(id),
        bank_transaction_id INT NULL REFERENCES {schema}.bank_transactions(id),
        settlement_journal_id INT NULL REFERENCES {schema}.journal(id),
        idempotency_hash TEXT NOT NULL,
        raw_text TEXT NULL,
        parsed_payload JSONB NOT NULL DEFAULT '{{}}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_mp_remittances_ref UNIQUE (company_id, marketplace_account_id, payment_reference_no)
    );

    CREATE INDEX IF NOT EXISTS idx_mp_remittances_status 
        ON {schema}.marketplace_remittances(company_id, status);
    CREATE INDEX IF NOT EXISTS idx_mp_remittances_payment_date 
        ON {schema}.marketplace_remittances(company_id, payment_date);

    -- 6. Marketplace Remittance Lines (Parsed individual line items)
    CREATE TABLE IF NOT EXISTS {schema}.marketplace_remittance_lines (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL DEFAULT {company_id},
        remittance_id INT NOT NULL REFERENCES {schema}.marketplace_remittances(id) ON DELETE CASCADE,
        line_number INT NOT NULL,
        line_type TEXT NOT NULL DEFAULT 'sale', -- 'sale', 'return', 'fee_adjustment', 'other'
        external_order_number TEXT NOT NULL,
        order_date DATE NULL,
        sales_gross NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        sales_net NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        sales_vat NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        commission_gross NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        commission_net NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        commission_vat NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        transport_gross NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        transport_net NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        transport_vat NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        net_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        matched_order_id INT NULL REFERENCES {schema}.marketplace_orders(id),
        match_status TEXT NOT NULL DEFAULT 'unmatched', -- 'matched', 'unmatched', 'discrepancy', 'ignored'
        discrepancy_details JSONB NOT NULL DEFAULT '{{}}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_mp_remittance_lines_num UNIQUE (remittance_id, line_number)
    );

    CREATE INDEX IF NOT EXISTS idx_mp_remit_lines_ext_order 
        ON {schema}.marketplace_remittance_lines(company_id, external_order_number);
    CREATE INDEX IF NOT EXISTS idx_mp_remit_lines_match_status 
        ON {schema}.marketplace_remittance_lines(remittance_id, match_status);

    -- 7. Marketplace Settlement Allocations (Links settlements to orders and fees)
    CREATE TABLE IF NOT EXISTS {schema}.marketplace_settlement_allocations (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL DEFAULT {company_id},
        remittance_id INT NOT NULL REFERENCES {schema}.marketplace_remittances(id),
        settlement_journal_id INT NOT NULL REFERENCES {schema}.journal(id),
        order_id INT NULL REFERENCES {schema}.marketplace_orders(id),
        fee_id INT NULL REFERENCES {schema}.marketplace_fees(id),
        allocation_type TEXT NOT NULL, -- 'order_gross', 'order_return', 'fee_deduction', 'fee_refund', 'unallocated_balance'
        allocated_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_mp_allocations_remit 
        ON {schema}.marketplace_settlement_allocations(company_id, remittance_id);
    CREATE INDEX IF NOT EXISTS idx_mp_allocations_order 
        ON {schema}.marketplace_settlement_allocations(company_id, order_id);
    CREATE INDEX IF NOT EXISTS idx_mp_allocations_fee 
        ON {schema}.marketplace_settlement_allocations(company_id, fee_id);

    -- 8. Allow Marketplace sources in journal source check constraint
    DO $$
    DECLARE
        existing_def TEXT;
    BEGIN
        SELECT pg_get_constraintdef(c.oid) INTO existing_def
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = '{schema}_journal_source_check'
          AND n.nspname = '{schema}';

        IF existing_def IS NOT NULL AND existing_def NOT LIKE '%%marketplace_order%%' THEN
            EXECUTE format('ALTER TABLE %I.journal DROP CONSTRAINT IF EXISTS %I', '{schema}', '{schema}_journal_source_check');
            
            -- Extract inside ARRAY[...] and append marketplace sources
            EXECUTE format(
                'ALTER TABLE %I.journal ADD CONSTRAINT %I CHECK (
                    source IS NULL OR source = ANY (ARRAY[
                        ''manual'', ''invoice'', ''invoice_reversal'', ''bill'', ''bill_reversal'',
                        ''payment'', ''vendor_payment'', ''receipt'', ''credit_note'', ''debit_note'',
                        ''inventory'', ''inventory_reversal'', ''project_material_issue'', ''project_material_return'',
                        ''manufacturing_material_usage'', ''manufacturing_material_usage_reversal'',
                        ''manufacturing_output'', ''manufacturing_output_reversal'',
                        ''manufacturing_order_dispatch'', ''manufacturing_order_dispatch_reversal'',
                        ''manufacturing_order_eod'', ''manufacturing_order_eod_reversal'',
                        ''manufacturing_order_cost'', ''manufacturing_order_labour'',
                        ''manufacturing_order_labour_reversal'', ''manufacturing_order_direct_cost'',
                        ''manufacturing_order_direct_cost_reversal'', ''asset'', ''asset_reversal'',
                        ''asset_acquisition'', ''asset_acquisition_reversal'', ''asset_depreciation'',
                        ''asset_depreciation_reversal'', ''asset_revaluation'', ''asset_revaluation_reversal'',
                        ''asset_impairment'', ''asset_impairment_reversal'', ''asset_disposal'',
                        ''asset_disposal_reversal'', ''asset_hfs'', ''asset_hfs_reversal'',
                        ''asset_add_cost'', ''asset_add_cost_reversal'', ''asset_transfer'',
                        ''asset_transfer_reversal'', ''lease_inception'', ''lease_monthly'', ''lease_payment'',
                        ''lease_direct_cost_paid'', ''lease_modification'', ''lease_termination'',
                        ''lease_inception_reversal'', ''lease_monthly_reversal'', ''lease_payment_reversal'',
                        ''lease_direct_cost_paid_reversal'', ''lease_modification_reversal'',
                        ''lease_termination_reversal'', ''lessor_lease_commencement'',
                        ''lessor_lease_operating_income'', ''lessor_lease_finance_income'',
                        ''lessor_lease_receipt'', ''lessor_lease_deposit'', ''lessor_lease_modification'',
                        ''lessor_lease_termination'', ''lessor_lease_commencement_reversal'',
                        ''lessor_lease_operating_income_reversal'', ''lessor_lease_finance_income_reversal'',
                        ''lessor_lease_receipt_reversal'', ''lessor_lease_deposit_reversal'',
                        ''lessor_lease_modification_reversal'', ''lessor_lease_termination_reversal'',
                        ''loan_origination'', ''loan_payment'', ''loan_reclassification'', ''loan_accrual'',
                        ''loan_restructure'', ''loan_settlement'', ''bank'', ''adjustment'', ''opening_balance'',
                        ''revenue_run_reversal'', ''vat_filing'', ''vat_filing_payment'', ''pos_sale'',
                        ''pos_payment'', ''pos_return'', ''year_end'', ''year_end_reversal'', ''year_end_close'',
                        ''ifrs9_ecl'', ''ifrs9_ecl_reversal'', ''ifrs9_amortised_cost'',
                        ''ifrs9_amortised_cost_reversal'', ''ifrs9_fair_value'', ''ifrs9_fair_value_reversal'',
                        ''ifrs9_modification'', ''ifrs9_modification_reversal'', ''ifrs9_derecognition'',
                        ''ifrs9_derecognition_reversal'', ''ifrs9_writeoff'', ''ifrs9_writeoff_reversal'',
                        ''manual_reversal'', ''payment_reversal'', ''vendor_payment_reversal'',
                        ''receipt_reversal'', ''credit_note_reversal'', ''debit_note_reversal'',
                        ''accrual_deferral_initial'', ''accrual_deferral_run'',
                        ''accrual_deferral_initial_reversal'', ''accrual_deferral_run_reversal'',
                        ''deferred_tax'', ''deferred_tax_reversal'', ''payroll_run'', ''payroll_run_reversal'',
                        ''payroll_leave_accrual'', ''payroll_leave_accrual_reversal'', ''payroll_bonus_accrual'',
                        ''payroll_bonus_accrual_reversal'', ''payroll_defined_contribution'',
                        ''payroll_defined_contribution_reversal'', ''payroll_defined_benefit'',
                        ''payroll_defined_benefit_reversal'', ''payroll_long_term_benefit'',
                        ''payroll_long_term_benefit_reversal'', ''payroll_termination_benefit'',
                        ''payroll_termination_benefit_reversal'', ''payroll_termination_benefit_settlement'',
                        ''payroll_liability_payment'', ''payroll_liability_payment_reversal'',
                        ''ias41_acquisition'', ''ias41_acquisition_reversal'', ''ias41_event'',
                        ''ias41_event_reversal'', ''ias41_valuation'', ''ias41_valuation_reversal'',
                        ''ias41_harvest'', ''ias41_harvest_reversal'', ''ias41_grant'',
                        ''ias41_grant_reversal'', ''ias41_grant_receipt'', ''ias41_grant_receipt_reversal'',
                        ''makro_marketplace'',
                        ''marketplace_order'', ''marketplace_order_reversal'',
                        ''marketplace_cogs'', ''marketplace_cogs_reversal'',
                        ''marketplace_fee'', ''marketplace_fee_reversal'',
                        ''marketplace_settlement'', ''marketplace_settlement_reversal'',
                        ''system''
                    ]::text[])
                )',
                '{schema}',
                '{schema}_journal_source_check'
            );
        END IF;
    END $$;
    """


def ensure_marketplace_tables(cur, company_id: int) -> None:
    """Execute the marketplace DDL for a given company schema using the provided cursor."""
    ddl_sql = get_marketplace_ddl_sql(company_id)
    cur.execute(ddl_sql)
    logger.info("Marketplace tables ensured for company_%s", company_id)


def seed_default_marketplace_account(cur, company_id: int, marketplace_code: str = "MAKRO") -> int:
    """
    Ensure the default marketplace account exists for this company,
    automatically resolving account codes from the company's COA.
    Returns the marketplace_account_id.
    """
    schema = f"company_{int(company_id)}"
    code = marketplace_code.strip().upper()

    # Check if already exists
    cur.execute(f"""
        SELECT id FROM {schema}.marketplace_accounts
        WHERE company_id = %s AND code = %s
        LIMIT 1;
    """, (company_id, code))
    row = cur.fetchone()
    if row:
        return row[0] if isinstance(row, (tuple, list)) else row.get("id")

    # Resolve accounts from COA
    def find_account(prefixes: list[str], fallback: str) -> str:
        for p in prefixes:
            cur.execute(f"SELECT code FROM {schema}.coa WHERE code = %s LIMIT 1;", (p,))
            r = cur.fetchone()
            if r:
                return r[0] if isinstance(r, (tuple, list)) else r.get("code")
        return fallback

    receivable_code = find_account(["BS_CA_9002", "BS_CA_1300"], "BS_CA_9002")
    revenue_code = find_account(["PL_REV_4000", "PL_REV_4100"], "PL_REV_4000")
    returns_code = find_account(["PL_ADJ_8000", "PL_REV_4000"], "PL_REV_4000")
    commission_code = find_account(["PL_OPEX_6390", "PL_OPEX_6203", "PL_OPEX_6100"], "PL_OPEX_6390")
    transport_code = find_account(["PL_OPEX_6795", "PL_OPEX_6700"], "PL_OPEX_6795")
    vat_output_code = find_account(["BS_CL_2310", "BS_CL_2300"], "BS_CL_2310")
    vat_input_code = find_account(["BS_CA_1410", "BS_CA_1400"], "BS_CA_1410")
    cogs_code = find_account(["PL_COS_5000", "PL_COS_5100"], "PL_COS_5000")
    inventory_code = find_account(["BS_CA_1500", "BS_CA_1200"], "BS_CA_1500")

    name = "Makro Marketplace" if code == "MAKRO" else f"{code.capitalize()} Marketplace"

    cur.execute(f"""
        INSERT INTO {schema}.marketplace_accounts (
            company_id,
            code,
            name,
            currency,
            receivable_account_code,
            sales_revenue_account_code,
            sales_returns_account_code,
            commission_expense_account_code,
            transport_expense_account_code,
            vat_output_account_code,
            vat_input_account_code,
            cogs_account_code,
            inventory_account_code,
            default_vat_rate,
            is_active
        ) VALUES (
            %s, %s, %s, 'ZAR',
            %s, %s, %s, %s, %s, %s, %s, %s, %s,
            0.1500, TRUE
        )
        ON CONFLICT (company_id, code) DO UPDATE SET updated_at = NOW()
        RETURNING id;
    """, (
        company_id, code, name,
        receivable_code, revenue_code, returns_code,
        commission_code, transport_code,
        vat_output_code, vat_input_code,
        cogs_code, inventory_code
    ))
    res = cur.fetchone()
    account_id = res[0] if isinstance(res, (tuple, list)) else res.get("id")
    logger.info("Seeded marketplace account %s (id=%s) for company_%s", code, account_id, company_id)
    return account_id
