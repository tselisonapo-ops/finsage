
        -- ==================================================
        -- Schema
        -- ==================================================
        CREATE SCHEMA IF NOT EXISTS company_8;

        -- ==================================================
        -- COA
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.coa (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            section TEXT NULL,
            category TEXT NULL,
            subcategory TEXT NULL,
            description TEXT NULL,
            reporting_description TEXT NULL,
            standard TEXT NULL,
            posting BOOLEAN NOT NULL DEFAULT TRUE,
            posting_rules TEXT NULL,
            cf_section TEXT NOT NULL DEFAULT 'operating',
            cf_bucket TEXT NULL,
            is_working_capital BOOLEAN NOT NULL DEFAULT FALSE,
            is_cash_equiv BOOLEAN NOT NULL DEFAULT FALSE,
            is_non_cash_addback BOOLEAN NOT NULL DEFAULT FALSE,
            is_contra BOOLEAN NOT NULL DEFAULT FALSE,

            template_code TEXT NULL,
            template_code_scoped TEXT NULL,

            template_code_base TEXT NULL,
            code_family TEXT NULL,
            code_numeric INT NULL,
            role TEXT NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Safe additive ALTERs (legacy)
        ALTER TABLE company_8.coa ADD COLUMN IF NOT EXISTS reporting_description TEXT NULL;
        ALTER TABLE company_8.coa ADD COLUMN IF NOT EXISTS posting_rules TEXT NULL;
        ALTER TABLE company_8.coa ADD COLUMN IF NOT EXISTS cf_bucket TEXT NULL;
        ALTER TABLE company_8.coa ADD COLUMN IF NOT EXISTS template_code_base TEXT NULL;
        ALTER TABLE company_8.coa ADD COLUMN IF NOT EXISTS code_family TEXT NULL;
        ALTER TABLE company_8.coa ADD COLUMN IF NOT EXISTS code_numeric INT NULL;
        ALTER TABLE company_8.coa ADD COLUMN IF NOT EXISTS role TEXT NULL;
        ALTER TABLE company_8.coa ADD COLUMN IF NOT EXISTS template_code_scoped TEXT NULL;

        -- Indexes
        CREATE UNIQUE INDEX IF NOT EXISTS company_8_coa_code_uniq
            ON company_8.coa(code);
        CREATE INDEX IF NOT EXISTS company_8_coa_cf_section_idx
            ON company_8.coa(cf_section);
        CREATE INDEX IF NOT EXISTS company_8_coa_family_num_idx
            ON company_8.coa(code_family, code_numeric);
        CREATE INDEX IF NOT EXISTS company_8_coa_template_code_idx
            ON company_8.coa(template_code);
        CREATE INDEX IF NOT EXISTS company_8_coa_template_code_scoped_idx
            ON company_8.coa(template_code_scoped);
        CREATE INDEX IF NOT EXISTS company_8_coa_role_idx
            ON company_8.coa(role);

        -- ==================================================
        -- APPROVAL REQUESTS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.approval_requests (
            id                  BIGSERIAL PRIMARY KEY,
            company_id           INT NOT NULL DEFAULT 8,

            entity_type          TEXT NOT NULL,     -- 'journal','vendor','customer','bill','payment', etc
            entity_id            TEXT NOT NULL,     -- string form of id (safe for uuid/int)
            entity_ref           TEXT NULL,

            module               TEXT NOT NULL,     -- 'gl','ap','ar','control_room'
            action               TEXT NOT NULL,     -- 'post','release','approve','reverse', etc

            requested_by_user_id INT NOT NULL,      -- public.users.id
            requested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            status               TEXT NOT NULL DEFAULT 'pending', -- pending/approved/rejected/cancelled/expired
            decided_by_user_id   INT NULL,
            decided_at           TIMESTAMPTZ NULL,
            decision_note        TEXT NULL,

            amount               NUMERIC(18,2) NOT NULL DEFAULT 0,
            currency             TEXT NULL,
            risk_level           TEXT NOT NULL DEFAULT 'low', -- low/medium/high/critical

            dedupe_key           TEXT NULL,         -- app-computed key to avoid duplicates
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,

            created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- --------------------------
        -- Safe additive evolution
        -- --------------------------
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS company_id INT;
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS entity_type TEXT;
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS entity_id TEXT;
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS entity_ref TEXT;
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS module TEXT;
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS action TEXT;
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS requested_by_user_id INT;
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS status TEXT;
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS decided_by_user_id INT;
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS decision_note TEXT;
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS amount NUMERIC(18,2);
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS currency TEXT;
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS risk_level TEXT;
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS payload_json JSONB;
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
        ALTER TABLE company_8.approval_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        -- backfill/enforce company_id
        UPDATE company_8.approval_requests
        SET company_id = 8
        WHERE company_id IS NULL;

        ALTER TABLE company_8.approval_requests
        ALTER COLUMN company_id SET NOT NULL,
        ALTER COLUMN company_id SET DEFAULT 8;

        -- default/backfill stability
        UPDATE company_8.approval_requests
        SET status = COALESCE(NULLIF(status,''), 'pending')
        WHERE status IS NULL OR status = '';

        UPDATE company_8.approval_requests
        SET risk_level = COALESCE(NULLIF(risk_level,''), 'low')
        WHERE risk_level IS NULL OR risk_level = '';

        UPDATE company_8.approval_requests
        SET payload_json = COALESCE(payload_json, '{}'::jsonb)
        WHERE payload_json IS NULL;

        ALTER TABLE company_8.approval_requests
        ALTER COLUMN status SET NOT NULL,
        ALTER COLUMN status SET DEFAULT 'pending',
        ALTER COLUMN risk_level SET NOT NULL,
        ALTER COLUMN risk_level SET DEFAULT 'low',
        ALTER COLUMN payload_json SET NOT NULL,
        ALTER COLUMN payload_json SET DEFAULT '{}'::jsonb;

        -- --------------------------
        -- CHECK constraints
        -- --------------------------
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_approval_requests_status_ck' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.approval_requests
            ADD CONSTRAINT %I
            CHECK (status IN (''pending'',''approved'',''rejected'',''cancelled'',''expired''))',
            'company_8', 'company_8_approval_requests_status_ck'
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_approval_requests_risk_ck' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.approval_requests
            ADD CONSTRAINT %I
            CHECK (risk_level IN (''low'',''medium'',''high'',''critical''))',
            'company_8', 'company_8_approval_requests_risk_ck'
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_approval_requests_amt_ck' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.approval_requests
            ADD CONSTRAINT %I
            CHECK (amount >= 0)',
            'company_8', 'company_8_approval_requests_amt_ck'
            );
        END IF;
        END $$;

        -- --------------------------
        -- Uniqueness
        -- --------------------------

        -- A) dedupe_key uniqueness (optional but recommended)
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'company_8' AND indexname = 'company_8_approval_requests_dedupe_uq'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX %I
            ON %I.approval_requests(company_id, dedupe_key)
            WHERE dedupe_key IS NOT NULL AND dedupe_key <> ''''',
            'company_8_approval_requests_dedupe_uq', 'company_8'
            );
        END IF;
        END $$;

        -- B) one ACTIVE pending request per entity+module+action (hard safety)
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'company_8' AND indexname = 'company_8_approval_active_entity_action_uq'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX %I
            ON %I.approval_requests(company_id, entity_type, entity_id, module, action)
            WHERE status IN (''pending'')',
            'company_8_approval_active_entity_action_uq',
            'company_8'
            );
        END IF;
        END $$;

        -- C) composite unique for (id, company_id) to support composite FKs
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'company_8' AND indexname = 'company_8_approval_requests_id_company_uq'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX %I ON %I.approval_requests(id, company_id)',
            'company_8_approval_requests_id_company_uq',
            'company_8'
            );
        END IF;
        END $$;

        -- --------------------------
        -- Indexes
        -- --------------------------
        CREATE INDEX IF NOT EXISTS company_8_approval_requests_status_idx
        ON company_8.approval_requests(company_id, status, requested_at DESC);

        CREATE INDEX IF NOT EXISTS company_8_approval_requests_entity_idx
        ON company_8.approval_requests(company_id, entity_type, entity_id);

        CREATE INDEX IF NOT EXISTS company_8_approval_requests_entity_time_idx
        ON company_8.approval_requests(company_id, entity_type, entity_id, requested_at DESC);

        CREATE INDEX IF NOT EXISTS company_8_approval_requests_module_status_idx
        ON company_8.approval_requests(company_id, module, status, requested_at DESC);

        -- --------------------------
        -- FKs to users
        -- --------------------------
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_approval_requests_requested_by_fk' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.approval_requests
            ADD CONSTRAINT %I
            FOREIGN KEY (requested_by_user_id)
            REFERENCES public.users(id)
            ON DELETE RESTRICT',
            'company_8', 'company_8_approval_requests_requested_by_fk'
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_approval_requests_decided_by_fk' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.approval_requests
            ADD CONSTRAINT %I
            FOREIGN KEY (decided_by_user_id)
            REFERENCES public.users(id)
            ON DELETE SET NULL',
            'company_8', 'company_8_approval_requests_decided_by_fk'
            );
        END IF;
        END $$;

        -- --------------------------
        -- OPTIONAL: auto touch updated_at on updates
        -- --------------------------
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgname = 'company_8_approval_requests_touch'
        ) THEN
        EXECUTE format(
        'CREATE TRIGGER %I
        BEFORE UPDATE ON %I.approval_requests
        FOR EACH ROW
        EXECUTE PROCEDURE %I.touch_updated_at()',
        'company_8_approval_requests_touch',
        'company_8',
        'company_8'
        );
        END IF;
        END $$;

        -- ==================================================
        -- APPROVAL DECISIONS (history)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.approval_decisions (
            id                  BIGSERIAL PRIMARY KEY,
            company_id           INT NOT NULL DEFAULT 8,
            approval_request_id  BIGINT NOT NULL,

            decision             TEXT NOT NULL,    -- approve/reject/comment/cancel/reassign
            decided_by_user_id   INT NOT NULL,     -- public.users.id
            decided_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            note                 TEXT NULL,

            meta_json    JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        -- safe additive
        ALTER TABLE company_8.approval_decisions ADD COLUMN IF NOT EXISTS company_id INT;
        ALTER TABLE company_8.approval_decisions ADD COLUMN IF NOT EXISTS approval_request_id BIGINT;
        ALTER TABLE company_8.approval_decisions ADD COLUMN IF NOT EXISTS decision TEXT;
        ALTER TABLE company_8.approval_decisions ADD COLUMN IF NOT EXISTS decided_by_user_id INT;
        ALTER TABLE company_8.approval_decisions ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
        ALTER TABLE company_8.approval_decisions ADD COLUMN IF NOT EXISTS note TEXT;
        ALTER TABLE company_8.approval_decisions ADD COLUMN IF NOT EXISTS meta_json JSONB;

        UPDATE company_8.approval_decisions
        SET company_id = 8
        WHERE company_id IS NULL;

        ALTER TABLE company_8.approval_decisions
        ALTER COLUMN company_id SET NOT NULL,
        ALTER COLUMN company_id SET DEFAULT 8;

        UPDATE company_8.approval_decisions
        SET meta_json = COALESCE(meta_json, '{}'::jsonb)
        WHERE meta_json IS NULL;

        ALTER TABLE company_8.approval_decisions
        ALTER COLUMN meta_json SET NOT NULL,
        ALTER COLUMN meta_json SET DEFAULT '{}'::jsonb;

        -- decision check
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_approval_decisions_decision_ck' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.approval_decisions
            ADD CONSTRAINT %I
            CHECK (decision IN (''approve'',''reject'',''comment'',''cancel'',''reassign''))',
            'company_8', 'company_8_approval_decisions_decision_ck'
            );
        END IF;
        END $$;

        -- FKs (composite FK ensures same company)
        DO $$
        BEGIN
        -- Composite request FK: (approval_request_id, company_id) -> approval_requests(id, company_id)
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_approval_decisions_request_company_fk' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.approval_decisions
            ADD CONSTRAINT %I
            FOREIGN KEY (approval_request_id, company_id)
            REFERENCES %I.approval_requests(id, company_id)
            ON DELETE CASCADE',
            'company_8', 'company_8_approval_decisions_request_company_fk', 'company_8'
            );
        END IF;

        -- decided_by -> public.users
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_approval_decisions_user_fk' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.approval_decisions
            ADD CONSTRAINT %I
            FOREIGN KEY (decided_by_user_id)
            REFERENCES public.users(id)
            ON DELETE RESTRICT',
            'company_8', 'company_8_approval_decisions_user_fk'
            );
        END IF;
        END $$;

        -- indexes
        CREATE INDEX IF NOT EXISTS company_8_approval_decisions_req_idx
        ON company_8.approval_decisions(company_id, approval_request_id, decided_at DESC);

        -- ==================================================
        -- JOURNAL
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.journal (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            date DATE NOT NULL,
            ref TEXT NULL,
            description TEXT NOT NULL,
            gross_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            net_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            -- reversal links
            is_reversal BOOLEAN NOT NULL DEFAULT FALSE,
            reversal_of_journal_id INT NULL,      -- this journal reverses original
            reversed_by_journal_id INT NULL,      -- original was reversed by this journal

            -- idempotency / traceability
            source TEXT NULL,
            source_id INT NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- ==================================================
        -- Safe additive evolution (legacy tenants)
        -- ==================================================
        ALTER TABLE company_8.journal ADD COLUMN IF NOT EXISTS company_id INT;
        ALTER TABLE company_8.journal ADD COLUMN IF NOT EXISTS is_reversal BOOLEAN;
        ALTER TABLE company_8.journal ADD COLUMN IF NOT EXISTS reversal_of_journal_id INT;
        ALTER TABLE company_8.journal ADD COLUMN IF NOT EXISTS reversed_by_journal_id INT;
        ALTER TABLE company_8.journal ADD COLUMN IF NOT EXISTS source TEXT;
        ALTER TABLE company_8.journal ADD COLUMN IF NOT EXISTS source_id INT;
        ALTER TABLE company_8.journal ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

        -- backfill / enforce company_id defaults
        UPDATE company_8.journal
        SET company_id = 8
        WHERE company_id IS NULL;

        ALTER TABLE company_8.journal
        ALTER COLUMN company_id SET NOT NULL;

        ALTER TABLE company_8.journal
        ALTER COLUMN company_id SET DEFAULT 8;

        -- set defaults safely
        UPDATE company_8.journal
        SET is_reversal = COALESCE(is_reversal, FALSE)
        WHERE is_reversal IS NULL;

        ALTER TABLE company_8.journal
        ALTER COLUMN is_reversal SET NOT NULL;

        ALTER TABLE company_8.journal
        ALTER COLUMN is_reversal SET DEFAULT FALSE;

        UPDATE company_8.journal
        SET created_at = COALESCE(created_at, NOW())
        WHERE created_at IS NULL;

        ALTER TABLE company_8.journal
        ALTER COLUMN created_at SET NOT NULL;

        ALTER TABLE company_8.journal
        ALTER COLUMN created_at SET DEFAULT NOW();

        -- ==================================================
        -- Currency (per-company, no hardcode)
        -- ==================================================
        ALTER TABLE company_8.journal
        ADD COLUMN IF NOT EXISTS currency TEXT;

        -- backfill NULL currency from the company's base currency
        UPDATE company_8.journal j
        SET currency = COALESCE(NULLIF(trim(c.currency), ''), j.currency)
        FROM public.companies c
        WHERE c.id = 8
        AND j.currency IS NULL;

        -- set default to the company's base currency (per tenant schema)
        DO $$
        DECLARE base_ccy text;
        BEGIN
        SELECT COALESCE(NULLIF(trim(currency), ''), 'USD')
        INTO base_ccy
        FROM public.companies
        WHERE id = 8;

        EXECUTE format(
            'ALTER TABLE %I.journal ALTER COLUMN currency SET DEFAULT %L;',
            'company_8', base_ccy
        );
        END $$;

        -- enforce NOT NULL (after backfill)
        ALTER TABLE company_8.journal
        ALTER COLUMN currency SET NOT NULL;

        -- ==================================================
        -- Uniqueness: block duplicate journal creation per source+source_id
        -- ==================================================
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='company_8' AND indexname='uq_journal_source_company'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_journal_source_company
            ON %I.journal(company_id, source, source_id)
            WHERE source IS NOT NULL AND source_id IS NOT NULL',
            'company_8'
            );
        END IF;
        END $$;

        -- ==================================================
        -- JOURNAL reversal FKs (self references)
        -- ==================================================
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_journal_reversal_of_fk' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.journal
            ADD CONSTRAINT %I
            FOREIGN KEY (reversal_of_journal_id)
            REFERENCES %I.journal(id)
            ON DELETE SET NULL',
            'company_8', 'company_8_journal_reversal_of_fk', 'company_8'
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_journal_reversed_by_fk' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.journal
            ADD CONSTRAINT %I
            FOREIGN KEY (reversed_by_journal_id)
            REFERENCES %I.journal(id)
            ON DELETE SET NULL',
            'company_8', 'company_8_journal_reversed_by_fk', 'company_8'
            );
        END IF;
        END $$;

        -- ==================================================
        -- Prevent double reversal: one original can only be reversed once
        -- ==================================================
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'company_8'
            AND indexname  = 'company_8_journal_reversal_of_uniq'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX %I ON %I.journal(reversal_of_journal_id)
            WHERE reversal_of_journal_id IS NOT NULL',
            'company_8_journal_reversal_of_uniq',
            'company_8'
            );
        END IF;
        END $$;

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_journal_reversal_check' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.journal
            ADD CONSTRAINT %I
            CHECK (
                (is_reversal = FALSE AND reversal_of_journal_id IS NULL)
                OR
                (is_reversal = TRUE  AND reversal_of_journal_id IS NOT NULL)
            )',
            'company_8', 'company_8_journal_reversal_check'
            );
        END IF;
        END $$;

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_journal_reversed_by_check' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.journal
            ADD CONSTRAINT %I
            CHECK (
                reversed_by_journal_id IS NULL
                OR
                (is_reversal = FALSE AND reversal_of_journal_id IS NULL)
            )',
            'company_8', 'company_8_journal_reversed_by_check'
            );
        END IF;
        END $$;

        -- ==================================================
        -- Journal source check (keep in sync with app features)
        -- ==================================================
        DO $$
        BEGIN
            EXECUTE format(
                'ALTER TABLE %I.journal DROP CONSTRAINT IF EXISTS %I',
                'company_8',
                'company_8_journal_source_check'
            );
            EXECUTE format(
                'ALTER TABLE %I.journal
                ADD CONSTRAINT %I
                CHECK (
                    source IS NULL
                    OR source = ANY (ARRAY[
                        ''manual'',

                        ''invoice'',
                        ''invoice_reversal'',
                        ''bill'',
                        ''bill_reversal'',
                        ''payment'',
                        ''vendor_payment'',
                        ''receipt'',
                        ''credit_note'',
                        ''debit_note'',

                        ''inventory'',
                        ''inventory_reversal'',

                        ''asset'',
                        ''asset_reversal'',
                        ''asset_acquisition'',
                        ''asset_acquisition_reversal'',
                        ''asset_depreciation'',
                        ''asset_depreciation_reversal'',
                        ''asset_revaluation'',
                        ''asset_revaluation_reversal'',
                        ''asset_impairment'',
                        ''asset_impairment_reversal'',
                        ''asset_disposal'',
                        ''asset_disposal_reversal'',
                        ''asset_hfs'',
                        ''asset_hfs_reversal'',
                        ''asset_add_cost'',
                        ''asset_add_cost_reversal'',
                        ''asset_transfer'',
                        ''asset_transfer_reversal'',

                        ''lease_inception'',
                        ''lease_monthly'',
                        ''lease_payment'',
                        ''lease_direct_cost_paid'',
                        ''lease_modification'',
                        ''lease_termination'',

                        ''lease_inception_reversal'',
                        ''lease_monthly_reversal'',
                        ''lease_payment_reversal'',
                        ''lease_direct_cost_paid_reversal'',
                        ''lease_modification_reversal'',
                        ''lease_termination_reversal'',

                        ''lessor_lease_commencement'',
                        ''lessor_lease_operating_income'',
                        ''lessor_lease_finance_income'',
                        ''lessor_lease_receipt'',
                        ''lessor_lease_deposit'',
                        ''lessor_lease_modification'',
                        ''lessor_lease_termination'',

                        ''lessor_lease_commencement_reversal'',
                        ''lessor_lease_operating_income_reversal'',
                        ''lessor_lease_finance_income_reversal'',
                        ''lessor_lease_receipt_reversal'',
                        ''lessor_lease_deposit_reversal'',
                        ''lessor_lease_modification_reversal'',
                        ''lessor_lease_termination_reversal'',

                        ''loan_origination'',
                        ''loan_payment'',
                        ''loan_reclassification'',
                        ''loan_accrual'',
                        ''loan_restructure'',
                        ''loan_settlement'',

                        ''bank'',
                        ''adjustment'',
                        ''opening_balance'',

                        ''revenue_run_reversal'',

                        ''vat_filing'',
                        ''vat_filing_payment'',

                        ''pos_sale'',
                        ''pos_payment'',
                        ''pos_return'',

                        ''year_end'',
                        ''year_end_reversal'',
                        ''year_end_close'',

                        ''ifrs9_ecl'',
                        ''ifrs9_ecl_reversal'',
                        ''ifrs9_amortised_cost'',
                        ''ifrs9_amortised_cost_reversal'',
                        ''ifrs9_fair_value'',
                        ''ifrs9_fair_value_reversal'',
                        ''ifrs9_modification'',
                        ''ifrs9_modification_reversal'',
                        ''ifrs9_derecognition'',
                        ''ifrs9_derecognition_reversal'',
                        ''ifrs9_writeoff'',
                        ''ifrs9_writeoff_reversal'',

                        ''manual_reversal'',
                        ''payment_reversal'',
                        ''vendor_payment_reversal'',
                        ''receipt_reversal'',
                        ''credit_note_reversal'',
                        ''debit_note_reversal'',

                        ''accrual_deferral_initial'',
                        ''accrual_deferral_run'',
                        ''accrual_deferral_initial_reversal'',
                        ''accrual_deferral_run_reversal'',

                        ''deferred_tax'',
                        ''deferred_tax_reversal'',

                        ''payroll_run'',
                        ''payroll_run_reversal'',
                        ''payroll_leave_accrual'',
                        ''payroll_leave_accrual_reversal'',
                        ''payroll_bonus_accrual'',
                        ''payroll_bonus_accrual_reversal'',
                        ''payroll_defined_contribution'',
                        ''payroll_defined_contribution_reversal'',
                        ''payroll_defined_benefit'',
                        ''payroll_defined_benefit_reversal'',
                        ''payroll_long_term_benefit'',
                        ''payroll_long_term_benefit_reversal'',
                        ''payroll_termination_benefit'',
                        ''payroll_termination_benefit_reversal'',
                        ''payroll_termination_benefit_settlement'',

                        ''ias41_acquisition'',
                        ''ias41_acquisition_reversal'',
                        ''ias41_event'',
                        ''ias41_event_reversal'',
                        ''ias41_valuation'',
                        ''ias41_valuation_reversal'',
                        ''ias41_harvest'',
                        ''ias41_harvest_reversal'',
                        ''ias41_grant'',
                        ''ias41_grant_reversal'',
                        ''ias41_grant_receipt'',
                        ''ias41_grant_receipt_reversal'',
                        ''system''
                    ]::text[])
                )',
                'company_8',
                'company_8_journal_source_check'
            );

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n
                ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_journal_reversed_by_check'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.journal
                    ADD CONSTRAINT %I
                    CHECK (
                        reversed_by_journal_id IS NULL
                        OR
                        (is_reversal = FALSE AND reversal_of_journal_id IS NULL)
                    )',
                    'company_8',
                    'company_8_journal_reversed_by_check'
                );
            END IF;
        END $$;

                
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'company_8' AND indexname = 'company_8_journal_reversed_by_uniq'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX %I ON %I.journal(reversed_by_journal_id)
            WHERE reversed_by_journal_id IS NOT NULL',
            'company_8_journal_reversed_by_uniq', 'company_8'
            );
        END IF;
        END $$;

        -- ==================================================
        -- JOURNAL LINES (GL detail)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.journal_lines (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            journal_id INT NOT NULL,

            line_no INT NOT NULL DEFAULT 1,

            account_code TEXT NOT NULL,         -- e.g. BS_NCA_1520, PL_7100 etc
            description TEXT NULL,

            debit  NUMERIC(18,2) NOT NULL DEFAULT 0,
            credit NUMERIC(18,2) NOT NULL DEFAULT 0,

            -- traceability
            source TEXT NULL,
            source_id INT NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_jrnl_lines_journal_idx
        ON company_8.journal_lines(journal_id);

        CREATE INDEX IF NOT EXISTS company_8_jrnl_lines_company_acct_idx
        ON company_8.journal_lines(company_id, account_code);

        DO $$
        BEGIN
        IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_namespace n ON n.oid=c.connamespace
        WHERE c.conname='company_8_jrnl_lines_drcr_ck' AND n.nspname='company_8'
        ) THEN
        EXECUTE format(
            'ALTER TABLE %I.journal_lines
            ADD CONSTRAINT %I
            CHECK ((debit=0 AND credit>0) OR (credit=0 AND debit>0))',
            'company_8','company_8_jrnl_lines_drcr_ck'
        );
        END IF;
        END $$;

        DO $$
        BEGIN
        IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_namespace n ON n.oid=c.connamespace
        WHERE c.conname='company_8_jrnl_lines_journal_fk' AND n.nspname='company_8'
        ) THEN
        EXECUTE format(
            'ALTER TABLE %I.journal_lines
            ADD CONSTRAINT %I
            FOREIGN KEY (journal_id) REFERENCES %I.journal(id) ON DELETE CASCADE',
            'company_8','company_8_jrnl_lines_journal_fk','company_8'
        );
        END IF;
        END $$;

        -- ==================================================
        -- Helpful indexes
        -- ==================================================
        CREATE INDEX IF NOT EXISTS company_8_journal_company_date_idx
        ON company_8.journal(company_id, date);

        CREATE INDEX IF NOT EXISTS company_8_journal_source_idx
        ON company_8.journal(company_id, source, source_id);

        -- ==================================================
        -- LEDGER
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.ledger (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            journal_id INT REFERENCES company_8.journal(id),
            customer_id INT NULL,
            date DATE NOT NULL,
            ref TEXT NULL,
            account TEXT NOT NULL,
            debit NUMERIC(18,2) NOT NULL DEFAULT 0,
            credit NUMERIC(18,2) NOT NULL DEFAULT 0,
            source TEXT NULL,
            source_id INT NULL,
            memo TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        UPDATE company_8.ledger
        SET company_id = 8
        WHERE company_id IS NULL;

        ALTER TABLE company_8.ledger
        ALTER COLUMN company_id SET NOT NULL;

        ALTER TABLE company_8.ledger
        ALTER COLUMN company_id SET DEFAULT 8;

        CREATE INDEX IF NOT EXISTS company_8_ledger_company_id_idx
        ON company_8.ledger(company_id);

        ALTER TABLE company_8.ledger
        ADD COLUMN IF NOT EXISTS vendor_id INT NULL;

        CREATE INDEX IF NOT EXISTS company_8_ledger_company_vendor_date_idx
        ON company_8.ledger(company_id, vendor_id, date);

        CREATE INDEX IF NOT EXISTS company_8_ledger_company_account_vendor_idx
        ON company_8.ledger(company_id, account, vendor_id);

        CREATE INDEX IF NOT EXISTS company_8_ledger_company_account_customer_idx
        ON company_8.ledger(company_id, account, customer_id);

        ALTER TABLE company_8.ledger ADD COLUMN IF NOT EXISTS company_id INT;
        ALTER TABLE company_8.ledger ADD COLUMN IF NOT EXISTS journal_id INT;
        ALTER TABLE company_8.ledger ADD COLUMN IF NOT EXISTS customer_id INT;
        ALTER TABLE company_8.ledger ADD COLUMN IF NOT EXISTS vendor_id INT;
        ALTER TABLE company_8.ledger ADD COLUMN IF NOT EXISTS source TEXT;
        ALTER TABLE company_8.ledger ADD COLUMN IF NOT EXISTS source_id INT;
        ALTER TABLE company_8.ledger ADD COLUMN IF NOT EXISTS memo TEXT;

        DO $ledger_fk$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ledger_customer_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ledger
                    ADD CONSTRAINT %I
                    FOREIGN KEY (customer_id)
                    REFERENCES %I.customers(id)',
                    'company_8',
                    'company_8_ledger_customer_fk',
                    'company_8'
                );
            END IF;
        END $ledger_fk$;

        DO $ledger_vendor_fk$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_ledger_vendor_fk'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.ledger
            ADD CONSTRAINT %I
            FOREIGN KEY (vendor_id)
            REFERENCES %I.vendors(id)',
            'company_8',
            'company_8_ledger_vendor_fk',
            'company_8'
            );
        END IF;
        END
        $ledger_vendor_fk$;

        -- ==================================================
        -- CUSTOMERS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.customers (
            id SERIAL PRIMARY KEY,

            -- ✅ REQUIRED for all inserts + API filters
            company_id INT NOT NULL DEFAULT 8,

            external_code TEXT NULL,
            name TEXT NOT NULL,
            email TEXT NULL,
            phone TEXT NULL,
            billing_address TEXT NULL,
            shipping_address TEXT NULL,
            country TEXT NULL,
            tax_number TEXT NULL,
            vat_number TEXT NULL,
            payment_terms TEXT NULL,
            credit_limit NUMERIC(18,2) DEFAULT 0,
            credit_status TEXT NOT NULL DEFAULT 'draft',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            customer_type TEXT NULL,
            default_service TEXT NULL,
            billing_country TEXT NULL,
            registration_no TEXT NULL,
            tax_exempt TEXT NULL,
            wht_percent NUMERIC(8,4),
            on_hold TEXT NULL,
            notes TEXT NULL,
            tags TEXT NULL,
            contacts JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- ✅ Safe additive evolution (legacy DBs)
        ALTER TABLE company_8.customers
            ADD COLUMN IF NOT EXISTS company_id INT;

        -- Backfill + enforce default + not null (only needed if the column was added later)
        UPDATE company_8.customers
        SET company_id = 8
        WHERE company_id IS NULL;

        ALTER TABLE company_8.customers
            ALTER COLUMN company_id SET DEFAULT 8;

        ALTER TABLE company_8.customers
            ALTER COLUMN company_id SET NOT NULL;

        -- ✅ Index for fast company filtering (MOVED DOWN so it never fails)
        CREATE INDEX IF NOT EXISTS company_8_customers_company_id_idx
            ON company_8.customers(company_id);

        -- Other safe-additive columns
        ALTER TABLE company_8.customers
            ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS approved_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS pending_reason TEXT NULL,
            ADD COLUMN IF NOT EXISTS credit_profile_id INT NULL;

        ALTER TABLE company_8.customers
            ADD COLUMN IF NOT EXISTS company_master_id INT NULL,
            ADD COLUMN IF NOT EXISTS workspace_status TEXT NOT NULL DEFAULT 'not_provisioned',
            ADD COLUMN IF NOT EXISTS workspace_created_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS workspace_created_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS legal_name TEXT NULL,
            ADD COLUMN IF NOT EXISTS industry TEXT NULL,
            ADD COLUMN IF NOT EXISTS sub_industry TEXT NULL,
            ADD COLUMN IF NOT EXISTS currency TEXT NULL,
            ADD COLUMN IF NOT EXISTS fin_year_start TEXT NULL,
            ADD COLUMN IF NOT EXISTS company_reg_date DATE NULL,
            ADD COLUMN IF NOT EXISTS registered_address_json JSONB NULL,
            ADD COLUMN IF NOT EXISTS postal_address_json JSONB NULL,
            ADD COLUMN IF NOT EXISTS company_phone TEXT NULL,
            ADD COLUMN IF NOT EXISTS logo_url TEXT NULL;

        ALTER TABLE company_8.customers
        DROP CONSTRAINT IF EXISTS company_8_customers_workspace_status_chk;

        ALTER TABLE company_8.customers
        ADD CONSTRAINT company_8_customers_workspace_status_chk
        CHECK (
            workspace_status IN (
                'not_provisioned',
                'pending_setup',
                'provisioned',
                'failed',
                'archived'
            )
        );

        CREATE INDEX IF NOT EXISTS company_8_customers_company_master_id_idx
            ON company_8.customers(company_master_id);

        CREATE INDEX IF NOT EXISTS company_8_customers_workspace_status_idx
            ON company_8.customers(workspace_status);

        -- ==================================================
        -- CUSTOMERS: user FKs
        -- ==================================================
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_customers_created_by_fk' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.customers
            ADD CONSTRAINT %I
            FOREIGN KEY (created_by_user_id)
            REFERENCES public.users(id)
            ON DELETE SET NULL',
            'company_8', 'company_8_customers_created_by_fk'
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_customers_approved_by_fk' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.customers
            ADD CONSTRAINT %I
            FOREIGN KEY (approved_by_user_id)
            REFERENCES public.users(id)
            ON DELETE SET NULL',
            'company_8', 'company_8_customers_approved_by_fk'
            );
        END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_customers_company_master_fk'
                  AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.customers
                     ADD CONSTRAINT %I
                     FOREIGN KEY (company_master_id)
                     REFERENCES public.companies(id)
                     ON DELETE SET NULL',
                    'company_8', 'company_8_customers_company_master_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_customers_workspace_created_by_fk'
                  AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.customers
                     ADD CONSTRAINT %I
                     FOREIGN KEY (workspace_created_by_user_id)
                     REFERENCES public.users(id)
                     ON DELETE SET NULL',
                    'company_8', 'company_8_customers_workspace_created_by_fk'
                );
            END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS company_8.customer_company_links (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            customer_id INT NOT NULL,
            linked_company_id INT NOT NULL,
            link_type TEXT NOT NULL DEFAULT 'workspace',
            is_primary BOOLEAN NOT NULL DEFAULT TRUE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            linked_by_user_id INT NULL,
            notes TEXT NULL
        );

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_cust_company_links_customer_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.customer_company_links
                    ADD CONSTRAINT %I
                    FOREIGN KEY (customer_id)
                    REFERENCES %I.customers(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_cust_company_links_customer_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_cust_company_links_company_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.customer_company_links
                    ADD CONSTRAINT %I
                    FOREIGN KEY (linked_company_id)
                    REFERENCES public.companies(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_cust_company_links_company_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_cust_company_links_user_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.customer_company_links
                    ADD CONSTRAINT %I
                    FOREIGN KEY (linked_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_cust_company_links_user_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_cust_company_links_type_chk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.customer_company_links
                    ADD CONSTRAINT %I
                    CHECK (link_type IN (''workspace'', ''reporting'', ''tax'', ''legacy''))',
                    'company_8', 'company_8_cust_company_links_type_chk'
                );
            END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS company_8_cust_company_links_customer_idx
            ON company_8.customer_company_links(customer_id);

        CREATE INDEX IF NOT EXISTS company_8_cust_company_links_company_idx
            ON company_8.customer_company_links(linked_company_id);

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_cust_company_links_primary_uq
            ON company_8.customer_company_links(customer_id, linked_company_id, link_type)
            WHERE is_active = TRUE;

        -- ==================================================
        -- VENDORS  ✅ (expanded)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.vendors (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,

            external_code TEXT NULL,
            name TEXT NOT NULL,
            email TEXT NULL,
            phone TEXT NULL,
            remit_address TEXT NULL,
            country TEXT NULL,

            tax_number TEXT NULL,
            vat_number TEXT NULL,
            registration_no TEXT NULL,
            wht_percent NUMERIC(6,2) NULL,
            payment_terms TEXT NULL,

            vendor_status TEXT NOT NULL DEFAULT 'active',
            on_hold TEXT NULL,

            notes TEXT NULL,
            tags TEXT NULL,
            contacts JSONB NULL,

            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            approved_by_user_id INT NULL,
            approved_at TIMESTAMPTZ NULL,

            -- ✅ Bank details (single/default bank account shortcut)
            bank_name TEXT NULL,
            branch_code TEXT NULL,
            account_name TEXT NULL,
            account_number TEXT NULL,
            account_type TEXT NULL,
            bank_currency TEXT NULL,
            swift_code TEXT NULL,

            -- ✅ Compliance tracking
            compliance_status TEXT NOT NULL DEFAULT 'draft',         -- draft|pending|verified|blocked
            compliance_required BOOLEAN NOT NULL DEFAULT FALSE,
            missing_docs JSONB NOT NULL DEFAULT '[]'::jsonb,         -- ["cipc","bank_proof",...]
            compliance_updated_at TIMESTAMPTZ NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- ✅ Safe additive evolution (legacy DBs)
        ALTER TABLE company_8.vendors
        ADD COLUMN IF NOT EXISTS compliance_status TEXT;

        ALTER TABLE company_8.vendors
        ADD COLUMN IF NOT EXISTS compliance_required BOOLEAN;

        ALTER TABLE company_8.vendors
        ADD COLUMN IF NOT EXISTS missing_docs JSONB;

        ALTER TABLE company_8.vendors
        ADD COLUMN IF NOT EXISTS compliance_updated_at TIMESTAMPTZ;

        UPDATE company_8.vendors
        SET compliance_status = COALESCE(compliance_status, 'draft'),
            compliance_required = COALESCE(compliance_required, FALSE),
            missing_docs = COALESCE(missing_docs, '[]'::jsonb)
        WHERE compliance_status IS NULL
        OR compliance_required IS NULL
        OR missing_docs IS NULL;

        ALTER TABLE company_8.vendors
        ALTER COLUMN compliance_status SET DEFAULT 'draft',
        ALTER COLUMN compliance_status SET NOT NULL;

        ALTER TABLE company_8.vendors
        ALTER COLUMN compliance_required SET DEFAULT FALSE,
        ALTER COLUMN compliance_required SET NOT NULL;

        ALTER TABLE company_8.vendors
        ALTER COLUMN missing_docs SET DEFAULT '[]'::jsonb,
        ALTER COLUMN missing_docs SET NOT NULL;

        -- --------------------------------------------------
        -- Indexes / Uniqueness
        -- --------------------------------------------------
        CREATE INDEX IF NOT EXISTS company_8_vendors_company_idx
        ON company_8.vendors(company_id);

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_vendors_name_email_uniq
        ON company_8.vendors(company_id, LOWER(COALESCE(name,'')), LOWER(COALESCE(email,'')));

        CREATE INDEX IF NOT EXISTS company_8_vendors_status_idx
        ON company_8.vendors(company_id, vendor_status);

        CREATE INDEX IF NOT EXISTS company_8_vendors_active_idx
        ON company_8.vendors(company_id, is_active);

        CREATE INDEX IF NOT EXISTS company_8_vendors_compliance_idx
        ON company_8.vendors(company_id, compliance_status);

        -- --------------------------------------------------
        -- SAFE ADDITIVE ALTERs (legacy tenants)
        -- --------------------------------------------------
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS registration_no TEXT NULL;
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS wht_percent NUMERIC(6,2) NULL;
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS on_hold TEXT NULL;
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS notes TEXT NULL;
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS tags TEXT NULL;
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS contacts JSONB NULL;
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS approved_by_user_id INT NULL;
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL;

        -- ✅ Bank fields (legacy safety)
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS bank_name TEXT NULL;
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS branch_code TEXT NULL;
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS account_name TEXT NULL;
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS account_number TEXT NULL;
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS account_type TEXT NULL;
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS bank_currency TEXT NULL;
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS swift_code TEXT NULL;

        -- ✅ Compliance fields (legacy safety)
        -- NOTE: adding NOT NULL columns can fail on some PG versions depending on defaults.
        -- The pattern below is safe: add if missing, backfill, then set default/not null.
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS compliance_status TEXT;
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS compliance_required BOOLEAN;
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS missing_docs JSONB;
        ALTER TABLE company_8.vendors ADD COLUMN IF NOT EXISTS compliance_updated_at TIMESTAMPTZ NULL;

        UPDATE company_8.vendors
        SET compliance_status = COALESCE(compliance_status, 'draft')
        WHERE compliance_status IS NULL;

        UPDATE company_8.vendors
        SET compliance_required = COALESCE(compliance_required, FALSE)
        WHERE compliance_required IS NULL;

        UPDATE company_8.vendors
        SET missing_docs = COALESCE(missing_docs, '[]'::jsonb)
        WHERE missing_docs IS NULL;

        ALTER TABLE company_8.vendors
        ALTER COLUMN compliance_status SET DEFAULT 'draft';

        ALTER TABLE company_8.vendors
        ALTER COLUMN compliance_required SET DEFAULT FALSE;

        ALTER TABLE company_8.vendors
        ALTER COLUMN missing_docs SET DEFAULT '[]'::jsonb;

        ALTER TABLE company_8.vendors
        ALTER COLUMN compliance_status SET NOT NULL;

        ALTER TABLE company_8.vendors
        ALTER COLUMN compliance_required SET NOT NULL;

        ALTER TABLE company_8.vendors
        ALTER COLUMN missing_docs SET NOT NULL;

        ALTER TABLE company_8.vendors
        ALTER COLUMN on_hold SET DEFAULT 'no';

        UPDATE company_8.vendors
        SET on_hold = 'no'
        WHERE on_hold IS NULL;

        -- --------------------------------------------------
        -- Defaults/backfills for frontend stability
        -- --------------------------------------------------
        ALTER TABLE company_8.vendors
        ALTER COLUMN contacts SET DEFAULT '[]'::jsonb;

        UPDATE company_8.vendors
        SET contacts = '[]'::jsonb
        WHERE contacts IS NULL;

        ALTER TABLE company_8.vendors
        ALTER COLUMN tags SET DEFAULT '';

        UPDATE company_8.vendors
        SET tags = ''
        WHERE tags IS NULL;

        ALTER TABLE company_8.vendors
        ALTER COLUMN notes SET DEFAULT '';

        UPDATE company_8.vendors
        SET notes = ''
        WHERE notes IS NULL;


        -- ==================================================
        -- OPTIONAL: Vendor Bank Accounts (multi-account support)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.vendor_bank_accounts (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            vendor_id INT NOT NULL REFERENCES company_8.vendors(id) ON DELETE CASCADE,

            bank_name TEXT NULL,
            branch_code TEXT NULL,
            account_name TEXT NULL,
            account_number TEXT NULL,
            account_type TEXT NULL,      -- cheque/savings/current
            currency TEXT NULL,          -- USD/USD/etc
            swift_code TEXT NULL,        -- international
            iban TEXT NULL,              -- optional
            is_default BOOLEAN NOT NULL DEFAULT TRUE,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'company_8'
                AND table_name = 'vendor_bank_accounts'
            ) THEN
                EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I ON %I.vendor_bank_accounts(company_id, vendor_id)',
                'company_8_vba_company_vendor_idx',
                'company_8'
                );

                EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I ON %I.vendor_bank_accounts(company_id, vendor_id, is_default)',
                'company_8_vba_company_vendor_default_idx',
                'company_8'
                );
            END IF;
        END $$;

        -- ==================================================
        -- OPTIONAL: Vendor Documents (compliance attachments)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.vendor_documents (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            vendor_id INT NOT NULL REFERENCES company_8.vendors(id) ON DELETE CASCADE,

            doc_type TEXT NOT NULL,                     -- cipc|bank_proof|tax_pin|vat_cert|id_copy|...
            file_name TEXT NULL,
            file_url TEXT NULL,                         -- or storage_key
            status TEXT NOT NULL DEFAULT 'uploaded',     -- uploaded|approved|rejected|expired
            uploaded_by INT NULL,
            uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            reviewed_by INT NULL,
            reviewed_at TIMESTAMPTZ NULL,
            notes TEXT NULL
        );

        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'company_8'
                AND table_name = 'vendor_documents'
            ) THEN
                EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I ON %I.vendor_documents(company_id, vendor_id)',
                'company_8_vendor_docs_company_vendor_idx',
                'company_8'
                );

                EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I ON %I.vendor_documents(company_id, vendor_id, doc_type)',
                'company_8_vendor_docs_company_vendor_type_idx',
                'company_8'
                );
            END IF;
        END $$;

                DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE n.nspname='company_8' AND c.conname='company_8_inv_tx_vendor_fk'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.inventory_tx
            ADD CONSTRAINT %I
            FOREIGN KEY (vendor_id) REFERENCES %I.vendors(id)
            ON DELETE SET NULL',
            'company_8', 'company_8_inv_tx_vendor_fk', 'company_8'
            );
        END IF;
        END $$;

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE n.nspname='company_8' AND c.conname='company_8_inv_tx_po_fk'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.inventory_tx
            ADD CONSTRAINT %I
            FOREIGN KEY (po_id) REFERENCES %I.purchase_orders(id)
            ON DELETE SET NULL',
            'company_8', 'company_8_inv_tx_po_fk', 'company_8'
            );
        END IF;
        END $$;

        -- ==================================================
        -- VENDORS: user FK
        -- ==================================================
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_vendors_approved_by_fk' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.vendors
            ADD CONSTRAINT %I
            FOREIGN KEY (approved_by_user_id)
            REFERENCES public.users(id)
            ON DELETE SET NULL',
            'company_8', 'company_8_vendors_approved_by_fk'
            );
        END IF;
        END $$;

        -- ==================================================
        -- ENGAGEMENTS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.engagements (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            customer_id INT NOT NULL,
            target_company_id INT NULL,
            engagement_code TEXT NULL,
            engagement_name TEXT NOT NULL,
            engagement_type TEXT NOT NULL, -- bookkeeping, compilation, audit, tax, advisory
            status TEXT NOT NULL DEFAULT 'draft',
            governance_mode TEXT NULL,
            reporting_cycle TEXT NULL,
            due_date DATE NULL,
            start_date DATE NULL,
            end_date DATE NULL,
            manager_user_id INT NULL,
            partner_user_id INT NULL,
            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,
            description TEXT NULL,
            scope_summary TEXT NULL,
            fiscal_year_end DATE NULL,
            priority TEXT NOT NULL DEFAULT 'normal',
            workflow_stage TEXT NOT NULL DEFAULT 'planning',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.engagements
            ADD COLUMN IF NOT EXISTS company_id INT,
            ADD COLUMN IF NOT EXISTS customer_id INT,
            ADD COLUMN IF NOT EXISTS target_company_id INT NULL,
            ADD COLUMN IF NOT EXISTS engagement_code TEXT NULL,
            ADD COLUMN IF NOT EXISTS engagement_name TEXT,
            ADD COLUMN IF NOT EXISTS engagement_type TEXT,
            ADD COLUMN IF NOT EXISTS status TEXT,
            ADD COLUMN IF NOT EXISTS governance_mode TEXT NULL,
            ADD COLUMN IF NOT EXISTS reporting_cycle TEXT NULL,
            ADD COLUMN IF NOT EXISTS due_date DATE NULL,
            ADD COLUMN IF NOT EXISTS start_date DATE NULL,
            ADD COLUMN IF NOT EXISTS end_date DATE NULL,
            ADD COLUMN IF NOT EXISTS manager_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS partner_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS description TEXT NULL,
            ADD COLUMN IF NOT EXISTS scope_summary TEXT NULL,
            ADD COLUMN IF NOT EXISTS fiscal_year_end DATE NULL,
            ADD COLUMN IF NOT EXISTS priority TEXT NULL,
            ADD COLUMN IF NOT EXISTS workflow_stage TEXT NULL,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        UPDATE company_8.engagements SET company_id = 8 WHERE company_id IS NULL;
        UPDATE company_8.engagements SET status = 'draft' WHERE status IS NULL;
        UPDATE company_8.engagements SET priority = 'normal' WHERE priority IS NULL;
        UPDATE company_8.engagements SET workflow_stage = 'planning' WHERE workflow_stage IS NULL;
        UPDATE company_8.engagements SET is_active = TRUE WHERE is_active IS NULL;
        UPDATE company_8.engagements SET created_at = NOW() WHERE created_at IS NULL;
        UPDATE company_8.engagements SET updated_at = NOW() WHERE updated_at IS NULL;

        ALTER TABLE company_8.engagements ALTER COLUMN company_id SET DEFAULT 8;
        ALTER TABLE company_8.engagements ALTER COLUMN status SET DEFAULT 'draft';
        ALTER TABLE company_8.engagements ALTER COLUMN priority SET DEFAULT 'normal';
        ALTER TABLE company_8.engagements ALTER COLUMN workflow_stage SET DEFAULT 'planning';
        ALTER TABLE company_8.engagements ALTER COLUMN is_active SET DEFAULT TRUE;
        ALTER TABLE company_8.engagements ALTER COLUMN created_at SET DEFAULT NOW();
        ALTER TABLE company_8.engagements ALTER COLUMN updated_at SET DEFAULT NOW();

        ALTER TABLE company_8.engagements ALTER COLUMN company_id SET NOT NULL;
        ALTER TABLE company_8.engagements ALTER COLUMN customer_id SET NOT NULL;
        ALTER TABLE company_8.engagements ALTER COLUMN engagement_name SET NOT NULL;
        ALTER TABLE company_8.engagements ALTER COLUMN engagement_type SET NOT NULL;
        ALTER TABLE company_8.engagements ALTER COLUMN status SET NOT NULL;
        ALTER TABLE company_8.engagements ALTER COLUMN priority SET NOT NULL;
        ALTER TABLE company_8.engagements ALTER COLUMN workflow_stage SET NOT NULL;
        ALTER TABLE company_8.engagements ALTER COLUMN is_active SET NOT NULL;
        ALTER TABLE company_8.engagements ALTER COLUMN created_at SET NOT NULL;
        ALTER TABLE company_8.engagements ALTER COLUMN updated_at SET NOT NULL;

        ALTER TABLE company_8.engagements
            ADD COLUMN IF NOT EXISTS requires_workspace BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS workspace_status TEXT NOT NULL DEFAULT 'not_required',
            ADD COLUMN IF NOT EXISTS workspace_source TEXT NULL,
            ADD COLUMN IF NOT EXISTS target_company_source TEXT NULL;

        ALTER TABLE company_8.engagements
        DROP CONSTRAINT IF EXISTS company_8_engagements_workspace_status_chk;

        ALTER TABLE company_8.engagements
        ADD CONSTRAINT company_8_engagements_workspace_status_chk
        CHECK (
            workspace_status IN (
                'not_required',
                'pending',
                'linked',
                'provisioned',
                'failed'
            )
        );

        ALTER TABLE company_8.engagements
        DROP CONSTRAINT IF EXISTS company_8_engagements_workspace_source_chk;

        ALTER TABLE company_8.engagements
        ADD CONSTRAINT company_8_engagements_workspace_source_chk
        CHECK (
            workspace_source IS NULL OR
            workspace_source IN (
                'customer_link',
                'manual_select',
                'auto_provision',
                'manual_provision'
            )
        );

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_engagements_customer_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagements
                    ADD CONSTRAINT %I
                    FOREIGN KEY (customer_id)
                    REFERENCES %I.customers(id)
                    ON DELETE RESTRICT',
                    'company_8', 'company_8_engagements_customer_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_engagements_manager_user_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagements
                    ADD CONSTRAINT %I
                    FOREIGN KEY (manager_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_engagements_manager_user_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_engagements_partner_user_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagements
                    ADD CONSTRAINT %I
                    FOREIGN KEY (partner_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_engagements_partner_user_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_engagements_created_by_user_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagements
                    ADD CONSTRAINT %I
                    FOREIGN KEY (created_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_engagements_created_by_user_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_engagements_updated_by_user_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagements
                    ADD CONSTRAINT %I
                    FOREIGN KEY (updated_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_engagements_updated_by_user_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_engagements_target_company_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagements
                    ADD CONSTRAINT %I
                    FOREIGN KEY (target_company_id)
                    REFERENCES public.companies(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_engagements_target_company_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_engagements_status_chk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagements
                    ADD CONSTRAINT %I
                    CHECK (
                        status IN (
                            ''draft'',
                            ''pending'',
                            ''pending_acceptance'',
                            ''active'',
                            ''declined'',
                            ''on_hold'',
                            ''completed'',
                            ''cancelled'',
                            ''archived''
                        )
                    )',
                    'company_8', 'company_8_engagements_status_chk'
                );
            END IF;

            -- engagement types are now governed by company_8.engagement_service_policies
            -- so remove the old hardcoded CHECK if it exists
            IF EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_engagements_type_chk'
                  AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagements
                     DROP CONSTRAINT IF EXISTS %I',
                    'company_8', 'company_8_engagements_type_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_engagements_priority_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagements
                    ADD CONSTRAINT %I
                    CHECK (priority IN (''low'', ''normal'', ''high'', ''urgent''))',
                    'company_8', 'company_8_engagements_priority_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_engagements_date_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagements
                    ADD CONSTRAINT %I
                    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)',
                    'company_8', 'company_8_engagements_date_chk'
                );
            END IF;
        
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_engagements_target_company_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagements
                    ADD CONSTRAINT %I
                    CHECK (
                        requires_workspace = FALSE
                        OR target_company_id IS NOT NULL
                    )',
                    'company_8', 'company_8_engagements_target_company_chk'
                );
            END IF;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_engagements_company_code_uq
            ON company_8.engagements(company_id, LOWER(engagement_code))
            WHERE engagement_code IS NOT NULL AND BTRIM(engagement_code) <> '';

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_engagements_company_customer_name_type_uq
            ON company_8.engagements(company_id, customer_id, LOWER(engagement_name), LOWER(engagement_type));

        CREATE INDEX IF NOT EXISTS company_8_engagements_company_id_idx
            ON company_8.engagements(company_id);

        CREATE INDEX IF NOT EXISTS company_8_engagements_customer_id_idx
            ON company_8.engagements(customer_id);

        CREATE INDEX IF NOT EXISTS company_8_engagements_status_idx
            ON company_8.engagements(status);

        CREATE INDEX IF NOT EXISTS company_8_engagements_type_idx
            ON company_8.engagements(engagement_type);

        CREATE INDEX IF NOT EXISTS company_8_engagements_due_date_idx
            ON company_8.engagements(due_date);

        CREATE INDEX IF NOT EXISTS company_8_engagements_manager_user_id_idx
            ON company_8.engagements(manager_user_id);

        CREATE INDEX IF NOT EXISTS company_8_engagements_partner_user_id_idx
            ON company_8.engagements(partner_user_id);

        CREATE INDEX IF NOT EXISTS company_8_engagements_is_active_idx
            ON company_8.engagements(is_active);

        CREATE INDEX IF NOT EXISTS company_8_engagements_target_company_id_idx
            ON company_8.engagements(target_company_id);

        CREATE TABLE IF NOT EXISTS company_8.engagement_service_policies (
            engagement_type TEXT PRIMARY KEY,
            requires_workspace BOOLEAN NOT NULL DEFAULT FALSE,
            allows_auto_provision BOOLEAN NOT NULL DEFAULT TRUE,
            default_status TEXT NOT NULL DEFAULT 'draft',
            default_workflow_stage TEXT NOT NULL DEFAULT 'planning',
            default_priority TEXT NOT NULL DEFAULT 'normal',
            is_active BOOLEAN NOT NULL DEFAULT TRUE
        );     

        -- ==================================================
        -- ENGAGEMENT TEAM
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.engagement_team (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            engagement_id INT NOT NULL,
            user_id INT NOT NULL,
            role_on_engagement TEXT NOT NULL, -- preparer, reviewer, manager, partner, qc, admin
            allocation_percent NUMERIC(5,2) NULL,
            start_date DATE NULL,
            end_date DATE NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            notes TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.engagement_team
            ADD COLUMN IF NOT EXISTS company_id INT,
            ADD COLUMN IF NOT EXISTS engagement_id INT,
            ADD COLUMN IF NOT EXISTS user_id INT,
            ADD COLUMN IF NOT EXISTS role_on_engagement TEXT,
            ADD COLUMN IF NOT EXISTS allocation_percent NUMERIC(5,2) NULL,
            ADD COLUMN IF NOT EXISTS start_date DATE NULL,
            ADD COLUMN IF NOT EXISTS end_date DATE NULL,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
            ADD COLUMN IF NOT EXISTS notes TEXT NULL,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        UPDATE company_8.engagement_team SET company_id = 8 WHERE company_id IS NULL;
        UPDATE company_8.engagement_team SET is_active = TRUE WHERE is_active IS NULL;
        UPDATE company_8.engagement_team SET created_at = NOW() WHERE created_at IS NULL;
        UPDATE company_8.engagement_team SET updated_at = NOW() WHERE updated_at IS NULL;

        ALTER TABLE company_8.engagement_team ALTER COLUMN company_id SET DEFAULT 8;
        ALTER TABLE company_8.engagement_team ALTER COLUMN is_active SET DEFAULT TRUE;
        ALTER TABLE company_8.engagement_team ALTER COLUMN created_at SET DEFAULT NOW();
        ALTER TABLE company_8.engagement_team ALTER COLUMN updated_at SET DEFAULT NOW();

        ALTER TABLE company_8.engagement_team ALTER COLUMN company_id SET NOT NULL;
        ALTER TABLE company_8.engagement_team ALTER COLUMN engagement_id SET NOT NULL;
        ALTER TABLE company_8.engagement_team ALTER COLUMN user_id SET NOT NULL;
        ALTER TABLE company_8.engagement_team ALTER COLUMN role_on_engagement SET NOT NULL;
        ALTER TABLE company_8.engagement_team ALTER COLUMN is_active SET NOT NULL;
        ALTER TABLE company_8.engagement_team ALTER COLUMN created_at SET NOT NULL;
        ALTER TABLE company_8.engagement_team ALTER COLUMN updated_at SET NOT NULL;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_engagement_team_engagement_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_team
                    ADD CONSTRAINT %I
                    FOREIGN KEY (engagement_id)
                    REFERENCES %I.engagements(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_engagement_team_engagement_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_engagement_team_user_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_team
                    ADD CONSTRAINT %I
                    FOREIGN KEY (user_id)
                    REFERENCES public.users(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_engagement_team_user_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_engagement_team_role_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_team
                    ADD CONSTRAINT %I
                    CHECK (role_on_engagement IN (''preparer'', ''reviewer'', ''manager'', ''partner'', ''qc'', ''admin''))',
                    'company_8', 'company_8_engagement_team_role_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_engagement_team_alloc_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_team
                    ADD CONSTRAINT %I
                    CHECK (allocation_percent IS NULL OR (allocation_percent >= 0 AND allocation_percent <= 100))',
                    'company_8', 'company_8_engagement_team_alloc_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_engagement_team_date_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_team
                    ADD CONSTRAINT %I
                    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)',
                    'company_8', 'company_8_engagement_team_date_chk'
                );
            END IF;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_engagement_team_active_uq
            ON company_8.engagement_team(company_id, engagement_id, user_id, LOWER(role_on_engagement))
            WHERE is_active = TRUE;

        CREATE INDEX IF NOT EXISTS company_8_engagement_team_company_id_idx
            ON company_8.engagement_team(company_id);

        CREATE INDEX IF NOT EXISTS company_8_engagement_team_engagement_id_idx
            ON company_8.engagement_team(engagement_id);

        CREATE INDEX IF NOT EXISTS company_8_engagement_team_user_id_idx
            ON company_8.engagement_team(user_id);

        CREATE INDEX IF NOT EXISTS company_8_engagement_team_role_idx
            ON company_8.engagement_team(role_on_engagement);

        CREATE INDEX IF NOT EXISTS company_8_engagement_team_is_active_idx
            ON company_8.engagement_team(is_active);


        CREATE TABLE IF NOT EXISTS company_8.review_queue (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            engagement_id INT NOT NULL,

            queue_type TEXT NOT NULL DEFAULT 'review', -- review, deliverable, signoff
            title TEXT NOT NULL,
            description TEXT NULL,

            status TEXT NOT NULL DEFAULT 'pending', -- pending, in_review, awaiting_approval, returned, approved, escalated, released, archived
            priority TEXT NOT NULL DEFAULT 'normal', -- low, normal, high, urgent
            review_state TEXT NOT NULL DEFAULT 'pending',

            assigned_reviewer_user_id INT NULL,
            assigned_manager_user_id INT NULL,

            due_date DATE NULL,
            last_action TEXT NULL,
            manager_comment TEXT NULL,

            source_table TEXT NULL,
            source_id INT NULL,

            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.review_queue
            ADD COLUMN IF NOT EXISTS company_id INT,
            ADD COLUMN IF NOT EXISTS engagement_id INT,
            ADD COLUMN IF NOT EXISTS queue_type TEXT,
            ADD COLUMN IF NOT EXISTS title TEXT,
            ADD COLUMN IF NOT EXISTS description TEXT NULL,
            ADD COLUMN IF NOT EXISTS status TEXT,
            ADD COLUMN IF NOT EXISTS priority TEXT,
            ADD COLUMN IF NOT EXISTS review_state TEXT,
            ADD COLUMN IF NOT EXISTS assigned_reviewer_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS assigned_manager_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS due_date DATE NULL,
            ADD COLUMN IF NOT EXISTS last_action TEXT NULL,
            ADD COLUMN IF NOT EXISTS manager_comment TEXT NULL,
            ADD COLUMN IF NOT EXISTS source_table TEXT NULL,
            ADD COLUMN IF NOT EXISTS source_id INT NULL,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
            ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        UPDATE company_8.review_queue
        SET company_id = 8
        WHERE company_id IS NULL;

        UPDATE company_8.review_queue
        SET queue_type = 'review'
        WHERE queue_type IS NULL OR BTRIM(queue_type) = '';

        UPDATE company_8.review_queue
        SET status = 'pending'
        WHERE status IS NULL OR BTRIM(status) = '';

        UPDATE company_8.review_queue
        SET priority = 'normal'
        WHERE priority IS NULL OR BTRIM(priority) = '';

        UPDATE company_8.review_queue
        SET review_state = 'pending'
        WHERE review_state IS NULL OR BTRIM(review_state) = '';

        UPDATE company_8.review_queue
        SET is_active = TRUE
        WHERE is_active IS NULL;

        UPDATE company_8.review_queue
        SET created_at = NOW()
        WHERE created_at IS NULL;

        UPDATE company_8.review_queue
        SET updated_at = NOW()
        WHERE updated_at IS NULL;

        ALTER TABLE company_8.review_queue
            ALTER COLUMN company_id SET DEFAULT 8;

        ALTER TABLE company_8.review_queue
            ALTER COLUMN queue_type SET DEFAULT 'review',
            ALTER COLUMN status SET DEFAULT 'pending',
            ALTER COLUMN priority SET DEFAULT 'normal',
            ALTER COLUMN review_state SET DEFAULT 'pending',
            ALTER COLUMN is_active SET DEFAULT TRUE,
            ALTER COLUMN created_at SET DEFAULT NOW(),
            ALTER COLUMN updated_at SET DEFAULT NOW();

        ALTER TABLE company_8.review_queue
            ALTER COLUMN company_id SET NOT NULL,
            ALTER COLUMN engagement_id SET NOT NULL,
            ALTER COLUMN queue_type SET NOT NULL,
            ALTER COLUMN title SET NOT NULL,
            ALTER COLUMN status SET NOT NULL,
            ALTER COLUMN priority SET NOT NULL,
            ALTER COLUMN review_state SET NOT NULL,
            ALTER COLUMN is_active SET NOT NULL,
            ALTER COLUMN created_at SET NOT NULL,
            ALTER COLUMN updated_at SET NOT NULL;

        CREATE INDEX IF NOT EXISTS company_8_review_queue_company_idx
            ON company_8.review_queue(company_id);

        CREATE INDEX IF NOT EXISTS company_8_review_queue_engagement_idx
            ON company_8.review_queue(engagement_id);

        CREATE INDEX IF NOT EXISTS company_8_review_queue_queue_type_idx
            ON company_8.review_queue(queue_type);

        CREATE INDEX IF NOT EXISTS company_8_review_queue_status_idx
            ON company_8.review_queue(status);

        CREATE INDEX IF NOT EXISTS company_8_review_queue_due_date_idx
            ON company_8.review_queue(due_date);

        CREATE INDEX IF NOT EXISTS company_8_review_queue_active_idx
            ON company_8.review_queue(is_active);

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_review_queue_engagement_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.review_queue
                        ADD CONSTRAINT %I
                        FOREIGN KEY (engagement_id)
                        REFERENCES %I.engagements(id)
                        ON DELETE CASCADE',
                    'company_8', 'company_8_review_queue_engagement_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_review_queue_reviewer_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.review_queue
                        ADD CONSTRAINT %I
                        FOREIGN KEY (assigned_reviewer_user_id)
                        REFERENCES public.users(id)
                        ON DELETE SET NULL',
                    'company_8', 'company_8_review_queue_reviewer_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_review_queue_manager_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.review_queue
                        ADD CONSTRAINT %I
                        FOREIGN KEY (assigned_manager_user_id)
                        REFERENCES public.users(id)
                        ON DELETE SET NULL',
                    'company_8', 'company_8_review_queue_manager_fk'
                );
            END IF;
        END $$;

        -- ==================================================
        -- ENGAGEMENT REPORTING ITEMS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.engagement_reporting_items (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            engagement_id INT NOT NULL,
            item_type TEXT NOT NULL, -- milestone, component
            item_code TEXT NULL,
            item_name TEXT NOT NULL,
            description TEXT NULL,
            owner_user_id INT NULL,
            reviewer_user_id INT NULL,
            due_date DATE NULL,
            prepared_at TIMESTAMPTZ NULL,
            reviewed_at TIMESTAMPTZ NULL,
            completed_at TIMESTAMPTZ NULL,
            status TEXT NOT NULL DEFAULT 'not_started', -- not_started, in_progress, ready, in_review, approved, completed, blocked, waived, returned
            priority TEXT NOT NULL DEFAULT 'normal',
            version_no INT NOT NULL DEFAULT 1,
            sort_order INT NOT NULL DEFAULT 0,
            notes TEXT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.engagement_reporting_items
            ADD COLUMN IF NOT EXISTS company_id INT,
            ADD COLUMN IF NOT EXISTS engagement_id INT,
            ADD COLUMN IF NOT EXISTS item_type TEXT,
            ADD COLUMN IF NOT EXISTS item_code TEXT NULL,
            ADD COLUMN IF NOT EXISTS item_name TEXT,
            ADD COLUMN IF NOT EXISTS description TEXT NULL,
            ADD COLUMN IF NOT EXISTS owner_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS reviewer_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS due_date DATE NULL,
            ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS status TEXT,
            ADD COLUMN IF NOT EXISTS priority TEXT NULL,
            ADD COLUMN IF NOT EXISTS version_no INT,
            ADD COLUMN IF NOT EXISTS sort_order INT,
            ADD COLUMN IF NOT EXISTS notes TEXT NULL,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
            ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        UPDATE company_8.engagement_reporting_items SET company_id = 8 WHERE company_id IS NULL;
        UPDATE company_8.engagement_reporting_items SET status = 'not_started' WHERE status IS NULL;
        UPDATE company_8.engagement_reporting_items SET priority = 'normal' WHERE priority IS NULL;
        UPDATE company_8.engagement_reporting_items SET version_no = 1 WHERE version_no IS NULL;
        UPDATE company_8.engagement_reporting_items SET sort_order = 0 WHERE sort_order IS NULL;
        UPDATE company_8.engagement_reporting_items SET is_active = TRUE WHERE is_active IS NULL;
        UPDATE company_8.engagement_reporting_items SET created_at = NOW() WHERE created_at IS NULL;
        UPDATE company_8.engagement_reporting_items SET updated_at = NOW() WHERE updated_at IS NULL;

        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN company_id SET DEFAULT 8;
        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN status SET DEFAULT 'not_started';
        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN priority SET DEFAULT 'normal';
        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN version_no SET DEFAULT 1;
        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN sort_order SET DEFAULT 0;
        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN is_active SET DEFAULT TRUE;
        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN created_at SET DEFAULT NOW();
        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN updated_at SET DEFAULT NOW();

        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN company_id SET NOT NULL;
        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN engagement_id SET NOT NULL;
        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN item_type SET NOT NULL;
        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN item_name SET NOT NULL;
        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN status SET NOT NULL;
        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN priority SET NOT NULL;
        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN version_no SET NOT NULL;
        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN sort_order SET NOT NULL;
        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN is_active SET NOT NULL;
        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN created_at SET NOT NULL;
        ALTER TABLE company_8.engagement_reporting_items ALTER COLUMN updated_at SET NOT NULL;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_reporting_items_engagement_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_reporting_items
                    ADD CONSTRAINT %I
                    FOREIGN KEY (engagement_id)
                    REFERENCES %I.engagements(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_eng_reporting_items_engagement_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_reporting_items_owner_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_reporting_items
                    ADD CONSTRAINT %I
                    FOREIGN KEY (owner_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_reporting_items_owner_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_reporting_items_reviewer_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_reporting_items
                    ADD CONSTRAINT %I
                    FOREIGN KEY (reviewer_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_reporting_items_reviewer_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_reporting_items_created_by_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_reporting_items
                    ADD CONSTRAINT %I
                    FOREIGN KEY (created_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_reporting_items_created_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_reporting_items_updated_by_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_reporting_items
                    ADD CONSTRAINT %I
                    FOREIGN KEY (updated_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_reporting_items_updated_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_reporting_items_type_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_reporting_items
                    ADD CONSTRAINT %I
                    CHECK (item_type IN (''milestone'', ''component''))',
                    'company_8', 'company_8_eng_reporting_items_type_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_reporting_items_status_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_reporting_items
                    ADD CONSTRAINT %I
                    CHECK (status IN (''not_started'', ''in_progress'', ''ready'', ''in_review'', ''approved'', ''completed'', ''blocked'', ''waived'', ''returned''))',
                    'company_8', 'company_8_eng_reporting_items_status_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_reporting_items_priority_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_reporting_items
                    ADD CONSTRAINT %I
                    CHECK (priority IN (''low'', ''normal'', ''high'', ''urgent''))',
                    'company_8', 'company_8_eng_reporting_items_priority_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_reporting_items_version_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_reporting_items
                    ADD CONSTRAINT %I
                    CHECK (version_no >= 1)',
                    'company_8', 'company_8_eng_reporting_items_version_chk'
                );
            END IF;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_eng_reporting_items_active_uq
            ON company_8.engagement_reporting_items(company_id, engagement_id, item_type, LOWER(item_name))
            WHERE is_active = TRUE;

        CREATE INDEX IF NOT EXISTS company_8_eng_reporting_items_company_id_idx
            ON company_8.engagement_reporting_items(company_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_reporting_items_engagement_id_idx
            ON company_8.engagement_reporting_items(engagement_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_reporting_items_type_idx
            ON company_8.engagement_reporting_items(item_type);

        CREATE INDEX IF NOT EXISTS company_8_eng_reporting_items_status_idx
            ON company_8.engagement_reporting_items(status);

        CREATE INDEX IF NOT EXISTS company_8_eng_reporting_items_due_date_idx
            ON company_8.engagement_reporting_items(due_date);

        CREATE INDEX IF NOT EXISTS company_8_eng_reporting_items_owner_user_id_idx
            ON company_8.engagement_reporting_items(owner_user_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_reporting_items_reviewer_user_id_idx
            ON company_8.engagement_reporting_items(reviewer_user_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_reporting_items_is_active_idx
            ON company_8.engagement_reporting_items(is_active);

        -- ==================================================
        -- ENGAGEMENT DELIVERABLES
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.engagement_deliverables (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            engagement_id INT NOT NULL,
            deliverable_code TEXT NULL,
            deliverable_name TEXT NOT NULL,
            deliverable_type TEXT NULL, -- client_document, working_paper, fs_draft, confirmation, tax_support, other
            requested_from TEXT NULL,
            assigned_user_id INT NULL,
            reviewer_user_id INT NULL,
            due_date DATE NULL,
            received_date DATE NULL,
            status TEXT NOT NULL DEFAULT 'not_started', -- not_started, requested, outstanding, received, in_review, completed, waived
            priority TEXT NOT NULL DEFAULT 'normal',
            notes TEXT NULL,
            document_count INT NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.engagement_deliverables
            ADD COLUMN IF NOT EXISTS company_id INT,
            ADD COLUMN IF NOT EXISTS engagement_id INT,
            ADD COLUMN IF NOT EXISTS deliverable_code TEXT NULL,
            ADD COLUMN IF NOT EXISTS deliverable_name TEXT,
            ADD COLUMN IF NOT EXISTS deliverable_type TEXT NULL,
            ADD COLUMN IF NOT EXISTS requested_from TEXT NULL,
            ADD COLUMN IF NOT EXISTS assigned_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS reviewer_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS due_date DATE NULL,
            ADD COLUMN IF NOT EXISTS received_date DATE NULL,
            ADD COLUMN IF NOT EXISTS status TEXT,
            ADD COLUMN IF NOT EXISTS priority TEXT NULL,
            ADD COLUMN IF NOT EXISTS notes TEXT NULL,
            ADD COLUMN IF NOT EXISTS document_count INT,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
            ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        UPDATE company_8.engagement_deliverables SET company_id = 8 WHERE company_id IS NULL;
        UPDATE company_8.engagement_deliverables SET status = 'not_started' WHERE status IS NULL;
        UPDATE company_8.engagement_deliverables SET priority = 'normal' WHERE priority IS NULL;
        UPDATE company_8.engagement_deliverables SET document_count = 0 WHERE document_count IS NULL;
        UPDATE company_8.engagement_deliverables SET is_active = TRUE WHERE is_active IS NULL;
        UPDATE company_8.engagement_deliverables SET created_at = NOW() WHERE created_at IS NULL;
        UPDATE company_8.engagement_deliverables SET updated_at = NOW() WHERE updated_at IS NULL;

        ALTER TABLE company_8.engagement_deliverables ALTER COLUMN company_id SET DEFAULT 8;
        ALTER TABLE company_8.engagement_deliverables ALTER COLUMN status SET DEFAULT 'not_started';
        ALTER TABLE company_8.engagement_deliverables ALTER COLUMN priority SET DEFAULT 'normal';
        ALTER TABLE company_8.engagement_deliverables ALTER COLUMN document_count SET DEFAULT 0;
        ALTER TABLE company_8.engagement_deliverables ALTER COLUMN is_active SET DEFAULT TRUE;
        ALTER TABLE company_8.engagement_deliverables ALTER COLUMN created_at SET DEFAULT NOW();
        ALTER TABLE company_8.engagement_deliverables ALTER COLUMN updated_at SET DEFAULT NOW();

        ALTER TABLE company_8.engagement_deliverables ALTER COLUMN company_id SET NOT NULL;
        ALTER TABLE company_8.engagement_deliverables ALTER COLUMN engagement_id SET NOT NULL;
        ALTER TABLE company_8.engagement_deliverables ALTER COLUMN deliverable_name SET NOT NULL;
        ALTER TABLE company_8.engagement_deliverables ALTER COLUMN status SET NOT NULL;
        ALTER TABLE company_8.engagement_deliverables ALTER COLUMN priority SET NOT NULL;
        ALTER TABLE company_8.engagement_deliverables ALTER COLUMN document_count SET NOT NULL;
        ALTER TABLE company_8.engagement_deliverables ALTER COLUMN is_active SET NOT NULL;
        ALTER TABLE company_8.engagement_deliverables ALTER COLUMN created_at SET NOT NULL;
        ALTER TABLE company_8.engagement_deliverables ALTER COLUMN updated_at SET NOT NULL;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_deliverables_engagement_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_deliverables
                    ADD CONSTRAINT %I
                    FOREIGN KEY (engagement_id)
                    REFERENCES %I.engagements(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_eng_deliverables_engagement_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_deliverables_assigned_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_deliverables
                    ADD CONSTRAINT %I
                    FOREIGN KEY (assigned_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_deliverables_assigned_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_deliverables_reviewer_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_deliverables
                    ADD CONSTRAINT %I
                    FOREIGN KEY (reviewer_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_deliverables_reviewer_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_deliverables_created_by_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_deliverables
                    ADD CONSTRAINT %I
                    FOREIGN KEY (created_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_deliverables_created_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_deliverables_updated_by_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_deliverables
                    ADD CONSTRAINT %I
                    FOREIGN KEY (updated_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_deliverables_updated_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_deliverables_status_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_deliverables
                    ADD CONSTRAINT %I
                    CHECK (status IN (''not_started'', ''requested'', ''outstanding'', ''received'', ''in_review'', ''completed'', ''waived''))',
                    'company_8', 'company_8_eng_deliverables_status_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_deliverables_priority_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_deliverables
                    ADD CONSTRAINT %I
                    CHECK (priority IN (''low'', ''normal'', ''high'', ''urgent''))',
                    'company_8', 'company_8_eng_deliverables_priority_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_deliverables_doc_count_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_deliverables
                    ADD CONSTRAINT %I
                    CHECK (document_count >= 0)',
                    'company_8', 'company_8_eng_deliverables_doc_count_chk'
                );
            END IF;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_eng_deliverables_active_uq
            ON company_8.engagement_deliverables(company_id, engagement_id, LOWER(deliverable_name))
            WHERE is_active = TRUE;

        CREATE INDEX IF NOT EXISTS company_8_eng_deliverables_company_id_idx
            ON company_8.engagement_deliverables(company_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_deliverables_engagement_id_idx
            ON company_8.engagement_deliverables(engagement_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_deliverables_status_idx
            ON company_8.engagement_deliverables(status);

        CREATE INDEX IF NOT EXISTS company_8_eng_deliverables_due_date_idx
            ON company_8.engagement_deliverables(due_date);

        CREATE INDEX IF NOT EXISTS company_8_eng_deliverables_assigned_user_id_idx
            ON company_8.engagement_deliverables(assigned_user_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_deliverables_reviewer_user_id_idx
            ON company_8.engagement_deliverables(reviewer_user_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_deliverables_is_active_idx
            ON company_8.engagement_deliverables(is_active);

        -- ==================================================
        -- ENGAGEMENT POSTING ACTIVITY
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.engagement_posting_activity (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            engagement_id INT NOT NULL,
            posting_date DATE NOT NULL DEFAULT CURRENT_DATE,
            module_name TEXT NOT NULL, -- journal_entries, accounts_receivable, accounts_payable, leases, ppe
            event_type TEXT NOT NULL,  -- draft, submitted, approved, posted, returned, rejected, reversed, payment, allocation, modification, disposal, revaluation, impairment
            reference_no TEXT NULL,
            description TEXT NOT NULL,
            prepared_by_user_id INT NULL,
            reviewer_user_id INT NULL,
            status TEXT NOT NULL DEFAULT 'draft', -- draft, pending_review, in_review, approved, posted, returned, rejected, reversed
            amount NUMERIC(18,2) NULL,
            currency_code TEXT NULL DEFAULT 'USD',
            source_table TEXT NULL,
            source_id INT NULL,
            notes TEXT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.engagement_posting_activity
            ADD COLUMN IF NOT EXISTS company_id INT,
            ADD COLUMN IF NOT EXISTS engagement_id INT,
            ADD COLUMN IF NOT EXISTS posting_date DATE,
            ADD COLUMN IF NOT EXISTS module_name TEXT,
            ADD COLUMN IF NOT EXISTS event_type TEXT,
            ADD COLUMN IF NOT EXISTS reference_no TEXT NULL,
            ADD COLUMN IF NOT EXISTS description TEXT,
            ADD COLUMN IF NOT EXISTS prepared_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS reviewer_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS status TEXT,
            ADD COLUMN IF NOT EXISTS amount NUMERIC(18,2) NULL,
            ADD COLUMN IF NOT EXISTS currency_code TEXT NULL,
            ADD COLUMN IF NOT EXISTS source_table TEXT NULL,
            ADD COLUMN IF NOT EXISTS source_id INT NULL,
            ADD COLUMN IF NOT EXISTS notes TEXT NULL,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
            ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        UPDATE company_8.engagement_posting_activity SET company_id = 8 WHERE company_id IS NULL;
        UPDATE company_8.engagement_posting_activity SET posting_date = CURRENT_DATE WHERE posting_date IS NULL;
        UPDATE company_8.engagement_posting_activity SET status = 'draft' WHERE status IS NULL;
        UPDATE company_8.engagement_posting_activity SET currency_code = 'USD' WHERE currency_code IS NULL;
        UPDATE company_8.engagement_posting_activity SET is_active = TRUE WHERE is_active IS NULL;
        UPDATE company_8.engagement_posting_activity SET created_at = NOW() WHERE created_at IS NULL;
        UPDATE company_8.engagement_posting_activity SET updated_at = NOW() WHERE updated_at IS NULL;

        ALTER TABLE company_8.engagement_posting_activity ALTER COLUMN company_id SET DEFAULT 8;
        ALTER TABLE company_8.engagement_posting_activity ALTER COLUMN posting_date SET DEFAULT CURRENT_DATE;
        ALTER TABLE company_8.engagement_posting_activity ALTER COLUMN status SET DEFAULT 'draft';
        ALTER TABLE company_8.engagement_posting_activity ALTER COLUMN currency_code SET DEFAULT 'USD';
        ALTER TABLE company_8.engagement_posting_activity ALTER COLUMN is_active SET DEFAULT TRUE;
        ALTER TABLE company_8.engagement_posting_activity ALTER COLUMN created_at SET DEFAULT NOW();
        ALTER TABLE company_8.engagement_posting_activity ALTER COLUMN updated_at SET DEFAULT NOW();

        ALTER TABLE company_8.engagement_posting_activity ALTER COLUMN company_id SET NOT NULL;
        ALTER TABLE company_8.engagement_posting_activity ALTER COLUMN engagement_id SET NOT NULL;
        ALTER TABLE company_8.engagement_posting_activity ALTER COLUMN posting_date SET NOT NULL;
        ALTER TABLE company_8.engagement_posting_activity ALTER COLUMN module_name SET NOT NULL;
        ALTER TABLE company_8.engagement_posting_activity ALTER COLUMN event_type SET NOT NULL;
        ALTER TABLE company_8.engagement_posting_activity ALTER COLUMN description SET NOT NULL;
        ALTER TABLE company_8.engagement_posting_activity ALTER COLUMN status SET NOT NULL;
        ALTER TABLE company_8.engagement_posting_activity ALTER COLUMN is_active SET NOT NULL;
        ALTER TABLE company_8.engagement_posting_activity ALTER COLUMN created_at SET NOT NULL;
        ALTER TABLE company_8.engagement_posting_activity ALTER COLUMN updated_at SET NOT NULL;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_posting_activity_engagement_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_posting_activity
                    ADD CONSTRAINT %I
                    FOREIGN KEY (engagement_id)
                    REFERENCES %I.engagements(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_eng_posting_activity_engagement_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_posting_activity_prepared_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_posting_activity
                    ADD CONSTRAINT %I
                    FOREIGN KEY (prepared_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_posting_activity_prepared_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_posting_activity_reviewer_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_posting_activity
                    ADD CONSTRAINT %I
                    FOREIGN KEY (reviewer_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_posting_activity_reviewer_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_posting_activity_created_by_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_posting_activity
                    ADD CONSTRAINT %I
                    FOREIGN KEY (created_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_posting_activity_created_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_posting_activity_updated_by_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_posting_activity
                    ADD CONSTRAINT %I
                    FOREIGN KEY (updated_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_posting_activity_updated_by_fk'
                );
            END IF;

            EXECUTE format(
                'ALTER TABLE %I.engagement_posting_activity
                DROP CONSTRAINT IF EXISTS %I',
                'company_8',
                'company_8_eng_posting_activity_module_chk'
            );

            EXECUTE format(
                'ALTER TABLE %I.engagement_posting_activity
                ADD CONSTRAINT %I
                CHECK (
                    module_name IN (
                        ''journal_entries'',
                        ''accounts_receivable'',
                        ''accounts_payable'',
                        ''revenue'',
                        ''inventory'',
                        ''loans'',
                        ''leases'',
                        ''ppe'',
                        ''fixed_assets'',
                        ''vat'',
                        ''cashbook'',
                        ''banking'',
                        ''payments'',
                        ''receipts''
                    )
                )',
                'company_8',
                'company_8_eng_posting_activity_module_chk'
            );

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_posting_activity_status_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_posting_activity
                    ADD CONSTRAINT %I
                    CHECK (status IN (''draft'', ''pending_review'', ''in_review'', ''approved'', ''posted'', ''returned'', ''rejected'', ''reversed''))',
                    'company_8', 'company_8_eng_posting_activity_status_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_posting_activity_amount_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_posting_activity
                    ADD CONSTRAINT %I
                    CHECK (amount IS NULL OR amount >= 0)',
                    'company_8', 'company_8_eng_posting_activity_amount_chk'
                );
            END IF;
        END $$;

        DROP INDEX IF EXISTS company_8_eng_posting_activity_source_uq;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_eng_posting_activity_source_uq
            ON company_8.engagement_posting_activity(
                company_id,
                engagement_id,
                module_name,
                source_table,
                source_id,
                event_type
            )
            WHERE source_table IS NOT NULL
            AND source_id IS NOT NULL;

        CREATE INDEX IF NOT EXISTS company_8_eng_posting_activity_company_id_idx
            ON company_8.engagement_posting_activity(company_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_posting_activity_engagement_id_idx
            ON company_8.engagement_posting_activity(engagement_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_posting_activity_posting_date_idx
            ON company_8.engagement_posting_activity(posting_date);

        CREATE INDEX IF NOT EXISTS company_8_eng_posting_activity_module_name_idx
            ON company_8.engagement_posting_activity(module_name);

        CREATE INDEX IF NOT EXISTS company_8_eng_posting_activity_status_idx
            ON company_8.engagement_posting_activity(status);

        CREATE INDEX IF NOT EXISTS company_8_eng_posting_activity_prepared_by_user_id_idx
            ON company_8.engagement_posting_activity(prepared_by_user_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_posting_activity_reviewer_user_id_idx
            ON company_8.engagement_posting_activity(reviewer_user_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_posting_activity_is_active_idx
            ON company_8.engagement_posting_activity(is_active);


        -- ==================================================
        -- ENGAGEMENT MONTHLY CLOSE TASKS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.engagement_monthly_close_tasks (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            engagement_id INT NOT NULL,
            close_period DATE NOT NULL,
            task_code TEXT NULL,
            task_name TEXT NOT NULL,
            description TEXT NULL,
            owner_user_id INT NULL,
            reviewer_user_id INT NULL,
            due_date DATE NULL,
            completed_at TIMESTAMPTZ NULL,
            status TEXT NOT NULL DEFAULT 'not_started', -- not_started, in_progress, in_review, completed, blocked, skipped
            priority TEXT NOT NULL DEFAULT 'normal',
            notes TEXT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.engagement_monthly_close_tasks
            ADD COLUMN IF NOT EXISTS company_id INT,
            ADD COLUMN IF NOT EXISTS engagement_id INT,
            ADD COLUMN IF NOT EXISTS close_period DATE,
            ADD COLUMN IF NOT EXISTS task_code TEXT NULL,
            ADD COLUMN IF NOT EXISTS task_name TEXT,
            ADD COLUMN IF NOT EXISTS description TEXT NULL,
            ADD COLUMN IF NOT EXISTS owner_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS reviewer_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS due_date DATE NULL,
            ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS status TEXT,
            ADD COLUMN IF NOT EXISTS priority TEXT NULL,
            ADD COLUMN IF NOT EXISTS notes TEXT NULL,
            ADD COLUMN IF NOT EXISTS sort_order INT,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
            ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        UPDATE company_8.engagement_monthly_close_tasks SET company_id = 8 WHERE company_id IS NULL;
        UPDATE company_8.engagement_monthly_close_tasks SET status = 'not_started' WHERE status IS NULL;
        UPDATE company_8.engagement_monthly_close_tasks SET priority = 'normal' WHERE priority IS NULL;
        UPDATE company_8.engagement_monthly_close_tasks SET sort_order = 0 WHERE sort_order IS NULL;
        UPDATE company_8.engagement_monthly_close_tasks SET is_active = TRUE WHERE is_active IS NULL;
        UPDATE company_8.engagement_monthly_close_tasks SET created_at = NOW() WHERE created_at IS NULL;
        UPDATE company_8.engagement_monthly_close_tasks SET updated_at = NOW() WHERE updated_at IS NULL;

        ALTER TABLE company_8.engagement_monthly_close_tasks ALTER COLUMN company_id SET DEFAULT 8;
        ALTER TABLE company_8.engagement_monthly_close_tasks ALTER COLUMN status SET DEFAULT 'not_started';
        ALTER TABLE company_8.engagement_monthly_close_tasks ALTER COLUMN priority SET DEFAULT 'normal';
        ALTER TABLE company_8.engagement_monthly_close_tasks ALTER COLUMN sort_order SET DEFAULT 0;
        ALTER TABLE company_8.engagement_monthly_close_tasks ALTER COLUMN is_active SET DEFAULT TRUE;
        ALTER TABLE company_8.engagement_monthly_close_tasks ALTER COLUMN created_at SET DEFAULT NOW();
        ALTER TABLE company_8.engagement_monthly_close_tasks ALTER COLUMN updated_at SET DEFAULT NOW();

        ALTER TABLE company_8.engagement_monthly_close_tasks ALTER COLUMN company_id SET NOT NULL;
        ALTER TABLE company_8.engagement_monthly_close_tasks ALTER COLUMN engagement_id SET NOT NULL;
        ALTER TABLE company_8.engagement_monthly_close_tasks ALTER COLUMN close_period SET NOT NULL;
        ALTER TABLE company_8.engagement_monthly_close_tasks ALTER COLUMN task_name SET NOT NULL;
        ALTER TABLE company_8.engagement_monthly_close_tasks ALTER COLUMN status SET NOT NULL;
        ALTER TABLE company_8.engagement_monthly_close_tasks ALTER COLUMN priority SET NOT NULL;
        ALTER TABLE company_8.engagement_monthly_close_tasks ALTER COLUMN sort_order SET NOT NULL;
        ALTER TABLE company_8.engagement_monthly_close_tasks ALTER COLUMN is_active SET NOT NULL;
        ALTER TABLE company_8.engagement_monthly_close_tasks ALTER COLUMN created_at SET NOT NULL;
        ALTER TABLE company_8.engagement_monthly_close_tasks ALTER COLUMN updated_at SET NOT NULL;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_monthly_close_tasks_engagement_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_monthly_close_tasks
                    ADD CONSTRAINT %I
                    FOREIGN KEY (engagement_id)
                    REFERENCES %I.engagements(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_eng_monthly_close_tasks_engagement_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_monthly_close_tasks_owner_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_monthly_close_tasks
                    ADD CONSTRAINT %I
                    FOREIGN KEY (owner_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_monthly_close_tasks_owner_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_monthly_close_tasks_reviewer_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_monthly_close_tasks
                    ADD CONSTRAINT %I
                    FOREIGN KEY (reviewer_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_monthly_close_tasks_reviewer_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_monthly_close_tasks_created_by_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_monthly_close_tasks
                    ADD CONSTRAINT %I
                    FOREIGN KEY (created_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_monthly_close_tasks_created_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_monthly_close_tasks_updated_by_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_monthly_close_tasks
                    ADD CONSTRAINT %I
                    FOREIGN KEY (updated_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_monthly_close_tasks_updated_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_monthly_close_tasks_status_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_monthly_close_tasks
                    ADD CONSTRAINT %I
                    CHECK (status IN (''not_started'', ''in_progress'', ''in_review'', ''completed'', ''blocked'', ''skipped''))',
                    'company_8', 'company_8_eng_monthly_close_tasks_status_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_monthly_close_tasks_priority_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_monthly_close_tasks
                    ADD CONSTRAINT %I
                    CHECK (priority IN (''low'', ''normal'', ''high'', ''urgent''))',
                    'company_8', 'company_8_eng_monthly_close_tasks_priority_chk'
                );
            END IF;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_eng_monthly_close_tasks_active_uq
            ON company_8.engagement_monthly_close_tasks(company_id, engagement_id, close_period, LOWER(task_name))
            WHERE is_active = TRUE;

        CREATE INDEX IF NOT EXISTS company_8_eng_monthly_close_tasks_company_id_idx
            ON company_8.engagement_monthly_close_tasks(company_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_monthly_close_tasks_engagement_id_idx
            ON company_8.engagement_monthly_close_tasks(engagement_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_monthly_close_tasks_close_period_idx
            ON company_8.engagement_monthly_close_tasks(close_period);

        CREATE INDEX IF NOT EXISTS company_8_eng_monthly_close_tasks_status_idx
            ON company_8.engagement_monthly_close_tasks(status);

        CREATE INDEX IF NOT EXISTS company_8_eng_monthly_close_tasks_due_date_idx
            ON company_8.engagement_monthly_close_tasks(due_date);

        CREATE INDEX IF NOT EXISTS company_8_eng_monthly_close_tasks_owner_user_id_idx
            ON company_8.engagement_monthly_close_tasks(owner_user_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_monthly_close_tasks_reviewer_user_id_idx
            ON company_8.engagement_monthly_close_tasks(reviewer_user_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_monthly_close_tasks_is_active_idx
            ON company_8.engagement_monthly_close_tasks(is_active);

        -- ==================================================
        -- ENGAGEMENT YEAR-END TASKS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.engagement_year_end_tasks (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            engagement_id INT NOT NULL,
            reporting_year_end DATE NOT NULL,
            task_code TEXT NULL,
            task_name TEXT NOT NULL,
            description TEXT NULL,
            owner_user_id INT NULL,
            reviewer_user_id INT NULL,
            due_date DATE NULL,
            completed_at TIMESTAMPTZ NULL,
            status TEXT NOT NULL DEFAULT 'not_started', -- not_started, in_progress, in_review, completed, blocked, waived
            priority TEXT NOT NULL DEFAULT 'normal',
            notes TEXT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.engagement_year_end_tasks
            ADD COLUMN IF NOT EXISTS company_id INT,
            ADD COLUMN IF NOT EXISTS engagement_id INT,
            ADD COLUMN IF NOT EXISTS reporting_year_end DATE,
            ADD COLUMN IF NOT EXISTS task_code TEXT NULL,
            ADD COLUMN IF NOT EXISTS task_name TEXT,
            ADD COLUMN IF NOT EXISTS description TEXT NULL,
            ADD COLUMN IF NOT EXISTS owner_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS reviewer_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS due_date DATE NULL,
            ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS status TEXT,
            ADD COLUMN IF NOT EXISTS priority TEXT NULL,
            ADD COLUMN IF NOT EXISTS notes TEXT NULL,
            ADD COLUMN IF NOT EXISTS sort_order INT,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
            ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        UPDATE company_8.engagement_year_end_tasks SET company_id = 8 WHERE company_id IS NULL;
        UPDATE company_8.engagement_year_end_tasks SET status = 'not_started' WHERE status IS NULL;
        UPDATE company_8.engagement_year_end_tasks SET priority = 'normal' WHERE priority IS NULL;
        UPDATE company_8.engagement_year_end_tasks SET sort_order = 0 WHERE sort_order IS NULL;
        UPDATE company_8.engagement_year_end_tasks SET is_active = TRUE WHERE is_active IS NULL;
        UPDATE company_8.engagement_year_end_tasks SET created_at = NOW() WHERE created_at IS NULL;
        UPDATE company_8.engagement_year_end_tasks SET updated_at = NOW() WHERE updated_at IS NULL;

        ALTER TABLE company_8.engagement_year_end_tasks ALTER COLUMN company_id SET DEFAULT 8;
        ALTER TABLE company_8.engagement_year_end_tasks ALTER COLUMN status SET DEFAULT 'not_started';
        ALTER TABLE company_8.engagement_year_end_tasks ALTER COLUMN priority SET DEFAULT 'normal';
        ALTER TABLE company_8.engagement_year_end_tasks ALTER COLUMN sort_order SET DEFAULT 0;
        ALTER TABLE company_8.engagement_year_end_tasks ALTER COLUMN is_active SET DEFAULT TRUE;
        ALTER TABLE company_8.engagement_year_end_tasks ALTER COLUMN created_at SET DEFAULT NOW();
        ALTER TABLE company_8.engagement_year_end_tasks ALTER COLUMN updated_at SET DEFAULT NOW();

        ALTER TABLE company_8.engagement_year_end_tasks ALTER COLUMN company_id SET NOT NULL;
        ALTER TABLE company_8.engagement_year_end_tasks ALTER COLUMN engagement_id SET NOT NULL;
        ALTER TABLE company_8.engagement_year_end_tasks ALTER COLUMN reporting_year_end SET NOT NULL;
        ALTER TABLE company_8.engagement_year_end_tasks ALTER COLUMN task_name SET NOT NULL;
        ALTER TABLE company_8.engagement_year_end_tasks ALTER COLUMN status SET NOT NULL;
        ALTER TABLE company_8.engagement_year_end_tasks ALTER COLUMN priority SET NOT NULL;
        ALTER TABLE company_8.engagement_year_end_tasks ALTER COLUMN sort_order SET NOT NULL;
        ALTER TABLE company_8.engagement_year_end_tasks ALTER COLUMN is_active SET NOT NULL;
        ALTER TABLE company_8.engagement_year_end_tasks ALTER COLUMN created_at SET NOT NULL;
        ALTER TABLE company_8.engagement_year_end_tasks ALTER COLUMN updated_at SET NOT NULL;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_year_end_tasks_engagement_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_year_end_tasks
                    ADD CONSTRAINT %I
                    FOREIGN KEY (engagement_id)
                    REFERENCES %I.engagements(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_eng_year_end_tasks_engagement_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_year_end_tasks_owner_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_year_end_tasks
                    ADD CONSTRAINT %I
                    FOREIGN KEY (owner_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_year_end_tasks_owner_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_year_end_tasks_reviewer_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_year_end_tasks
                    ADD CONSTRAINT %I
                    FOREIGN KEY (reviewer_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_year_end_tasks_reviewer_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_year_end_tasks_created_by_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_year_end_tasks
                    ADD CONSTRAINT %I
                    FOREIGN KEY (created_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_year_end_tasks_created_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_year_end_tasks_updated_by_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_year_end_tasks
                    ADD CONSTRAINT %I
                    FOREIGN KEY (updated_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_year_end_tasks_updated_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_year_end_tasks_status_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_year_end_tasks
                    ADD CONSTRAINT %I
                    CHECK (status IN (''not_started'', ''in_progress'', ''in_review'', ''completed'', ''blocked'', ''waived''))',
                    'company_8', 'company_8_eng_year_end_tasks_status_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_year_end_tasks_priority_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_year_end_tasks
                    ADD CONSTRAINT %I
                    CHECK (priority IN (''low'', ''normal'', ''high'', ''urgent''))',
                    'company_8', 'company_8_eng_year_end_tasks_priority_chk'
                );
            END IF;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_eng_year_end_tasks_active_uq
            ON company_8.engagement_year_end_tasks(company_id, engagement_id, reporting_year_end, LOWER(task_name))
            WHERE is_active = TRUE;

        CREATE INDEX IF NOT EXISTS company_8_eng_year_end_tasks_company_id_idx
            ON company_8.engagement_year_end_tasks(company_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_year_end_tasks_engagement_id_idx
            ON company_8.engagement_year_end_tasks(engagement_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_year_end_tasks_reporting_year_end_idx
            ON company_8.engagement_year_end_tasks(reporting_year_end);

        CREATE INDEX IF NOT EXISTS company_8_eng_year_end_tasks_status_idx
            ON company_8.engagement_year_end_tasks(status);

        CREATE INDEX IF NOT EXISTS company_8_eng_year_end_tasks_due_date_idx
            ON company_8.engagement_year_end_tasks(due_date);

        CREATE INDEX IF NOT EXISTS company_8_eng_year_end_tasks_owner_user_id_idx
            ON company_8.engagement_year_end_tasks(owner_user_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_year_end_tasks_reviewer_user_id_idx
            ON company_8.engagement_year_end_tasks(reviewer_user_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_year_end_tasks_is_active_idx
            ON company_8.engagement_year_end_tasks(is_active);

        -- ==================================================
        -- ENGAGEMENT SIGNOFF STEPS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.engagement_signoff_steps (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            engagement_id INT NOT NULL,
            reporting_year_end DATE NOT NULL,
            step_code TEXT NOT NULL, -- manager_review, partner_review, qc_review, final_signoff
            step_name TEXT NOT NULL,
            assigned_user_id INT NULL,
            due_date DATE NULL,
            completed_at TIMESTAMPTZ NULL,
            status TEXT NOT NULL DEFAULT 'not_started', -- not_started, in_progress, completed, blocked, waived
            notes TEXT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            is_required BOOLEAN NOT NULL DEFAULT TRUE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.engagement_signoff_steps
            ADD COLUMN IF NOT EXISTS company_id INT,
            ADD COLUMN IF NOT EXISTS engagement_id INT,
            ADD COLUMN IF NOT EXISTS reporting_year_end DATE,
            ADD COLUMN IF NOT EXISTS step_code TEXT,
            ADD COLUMN IF NOT EXISTS step_name TEXT,
            ADD COLUMN IF NOT EXISTS assigned_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS due_date DATE NULL,
            ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS status TEXT,
            ADD COLUMN IF NOT EXISTS notes TEXT NULL,
            ADD COLUMN IF NOT EXISTS sort_order INT,
            ADD COLUMN IF NOT EXISTS is_required BOOLEAN,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
            ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        UPDATE company_8.engagement_signoff_steps SET company_id = 8 WHERE company_id IS NULL;
        UPDATE company_8.engagement_signoff_steps SET status = 'not_started' WHERE status IS NULL;
        UPDATE company_8.engagement_signoff_steps SET sort_order = 0 WHERE sort_order IS NULL;
        UPDATE company_8.engagement_signoff_steps SET is_required = TRUE WHERE is_required IS NULL;
        UPDATE company_8.engagement_signoff_steps SET is_active = TRUE WHERE is_active IS NULL;
        UPDATE company_8.engagement_signoff_steps SET created_at = NOW() WHERE created_at IS NULL;
        UPDATE company_8.engagement_signoff_steps SET updated_at = NOW() WHERE updated_at IS NULL;

        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN company_id SET DEFAULT 8;
        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN status SET DEFAULT 'not_started';
        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN sort_order SET DEFAULT 0;
        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN is_required SET DEFAULT TRUE;
        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN is_active SET DEFAULT TRUE;
        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN created_at SET DEFAULT NOW();
        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN updated_at SET DEFAULT NOW();

        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN company_id SET NOT NULL;
        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN engagement_id SET NOT NULL;
        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN reporting_year_end SET NOT NULL;
        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN step_code SET NOT NULL;
        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN step_name SET NOT NULL;
        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN status SET NOT NULL;
        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN sort_order SET NOT NULL;
        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN is_required SET NOT NULL;
        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN is_active SET NOT NULL;
        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN created_at SET NOT NULL;
        ALTER TABLE company_8.engagement_signoff_steps ALTER COLUMN updated_at SET NOT NULL;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_signoff_steps_engagement_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_signoff_steps
                    ADD CONSTRAINT %I
                    FOREIGN KEY (engagement_id)
                    REFERENCES %I.engagements(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_eng_signoff_steps_engagement_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_signoff_steps_assigned_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_signoff_steps
                    ADD CONSTRAINT %I
                    FOREIGN KEY (assigned_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_signoff_steps_assigned_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_signoff_steps_created_by_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_signoff_steps
                    ADD CONSTRAINT %I
                    FOREIGN KEY (created_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_signoff_steps_created_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_signoff_steps_updated_by_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_signoff_steps
                    ADD CONSTRAINT %I
                    FOREIGN KEY (updated_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_signoff_steps_updated_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_signoff_steps_status_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_signoff_steps
                    ADD CONSTRAINT %I
                    CHECK (status IN (''not_started'', ''in_progress'', ''completed'', ''blocked'', ''waived''))',
                    'company_8', 'company_8_eng_signoff_steps_status_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_signoff_steps_step_code_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_signoff_steps
                    ADD CONSTRAINT %I
                    CHECK (step_code IN (''manager_review'', ''partner_review'', ''qc_review'', ''final_signoff''))',
                    'company_8', 'company_8_eng_signoff_steps_step_code_chk'
                );
            END IF;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_eng_signoff_steps_active_uq
            ON company_8.engagement_signoff_steps(company_id, engagement_id, reporting_year_end, LOWER(step_code))
            WHERE is_active = TRUE;

        CREATE INDEX IF NOT EXISTS company_8_eng_signoff_steps_company_id_idx
            ON company_8.engagement_signoff_steps(company_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_signoff_steps_engagement_id_idx
            ON company_8.engagement_signoff_steps(engagement_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_signoff_steps_reporting_year_end_idx
            ON company_8.engagement_signoff_steps(reporting_year_end);

        CREATE INDEX IF NOT EXISTS company_8_eng_signoff_steps_status_idx
            ON company_8.engagement_signoff_steps(status);

        CREATE INDEX IF NOT EXISTS company_8_eng_signoff_steps_assigned_user_id_idx
            ON company_8.engagement_signoff_steps(assigned_user_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_signoff_steps_is_active_idx
            ON company_8.engagement_signoff_steps(is_active);

        -- ==================================================
        -- ENGAGEMENT ACCEPTANCE
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.engagement_acceptance (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            engagement_id INT NOT NULL,

            acceptance_type TEXT NOT NULL DEFAULT 'acceptance', -- acceptance, continuation
            status TEXT NOT NULL DEFAULT 'draft',               -- draft, submitted, under_review, approved, declined, returned
            decision TEXT NULL,                                 -- approve, decline, return
            decision_date TIMESTAMPTZ NULL,

            requested_by_user_id INT NULL,
            assigned_partner_user_id INT NULL,
            decided_by_user_id INT NULL,

            decision_notes TEXT NULL,

            valid_from DATE NULL,
            valid_to DATE NULL,

            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.engagement_acceptance
            ADD COLUMN IF NOT EXISTS company_id INT,
            ADD COLUMN IF NOT EXISTS engagement_id INT,
            ADD COLUMN IF NOT EXISTS acceptance_type TEXT,
            ADD COLUMN IF NOT EXISTS status TEXT,
            ADD COLUMN IF NOT EXISTS decision TEXT NULL,
            ADD COLUMN IF NOT EXISTS decision_date TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS requested_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS assigned_partner_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS decided_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS decision_notes TEXT NULL,
            ADD COLUMN IF NOT EXISTS valid_from DATE NULL,
            ADD COLUMN IF NOT EXISTS valid_to DATE NULL,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
            ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        -- Legacy columns retained for backward compatibility.
        -- Do not use these in new UI/backend logic.
        ALTER TABLE company_8.engagement_acceptance
            ADD COLUMN IF NOT EXISTS risk_level TEXT NULL,
            ADD COLUMN IF NOT EXISTS independence_cleared BOOLEAN NULL,
            ADD COLUMN IF NOT EXISTS conflicts_checked BOOLEAN NULL,
            ADD COLUMN IF NOT EXISTS competence_confirmed BOOLEAN NULL,
            ADD COLUMN IF NOT EXISTS capacity_confirmed BOOLEAN NULL,
            ADD COLUMN IF NOT EXISTS client_risk_notes TEXT NULL,
            ADD COLUMN IF NOT EXISTS service_complexity_notes TEXT NULL,
            ADD COLUMN IF NOT EXISTS preconditions_notes TEXT NULL;

        UPDATE company_8.engagement_acceptance SET company_id = 8 WHERE company_id IS NULL;
        UPDATE company_8.engagement_acceptance SET acceptance_type = 'acceptance' WHERE acceptance_type IS NULL OR BTRIM(acceptance_type) = '';
        UPDATE company_8.engagement_acceptance SET status = 'draft' WHERE status IS NULL OR BTRIM(status) = '';
        UPDATE company_8.engagement_acceptance SET is_active = TRUE WHERE is_active IS NULL;
        UPDATE company_8.engagement_acceptance SET created_at = NOW() WHERE created_at IS NULL;
        UPDATE company_8.engagement_acceptance SET updated_at = NOW() WHERE updated_at IS NULL;

        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN company_id SET DEFAULT 8;
        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN acceptance_type SET DEFAULT 'acceptance';
        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN status SET DEFAULT 'draft';
        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN is_active SET DEFAULT TRUE;
        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN created_at SET DEFAULT NOW();
        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN updated_at SET DEFAULT NOW();

        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN company_id SET NOT NULL;
        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN engagement_id SET NOT NULL;
        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN acceptance_type SET NOT NULL;
        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN status SET NOT NULL;
        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN is_active SET NOT NULL;
        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN created_at SET NOT NULL;
        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN updated_at SET NOT NULL;

        -- Convert old duplicated assessment columns to nullable legacy fields.
        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN risk_level DROP NOT NULL;
        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN independence_cleared DROP NOT NULL;
        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN conflicts_checked DROP NOT NULL;
        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN competence_confirmed DROP NOT NULL;
        ALTER TABLE company_8.engagement_acceptance ALTER COLUMN capacity_confirmed DROP NOT NULL;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_acceptance_engagement_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_acceptance
                    ADD CONSTRAINT %I
                    FOREIGN KEY (engagement_id)
                    REFERENCES %I.engagements(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_eng_acceptance_engagement_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_acceptance_requested_by_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_acceptance
                    ADD CONSTRAINT %I
                    FOREIGN KEY (requested_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_acceptance_requested_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_acceptance_partner_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_acceptance
                    ADD CONSTRAINT %I
                    FOREIGN KEY (assigned_partner_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_acceptance_partner_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_acceptance_decided_by_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_acceptance
                    ADD CONSTRAINT %I
                    FOREIGN KEY (decided_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_acceptance_decided_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_acceptance_type_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_acceptance
                    ADD CONSTRAINT %I
                    CHECK (acceptance_type IN (''acceptance'', ''continuation''))',
                    'company_8', 'company_8_eng_acceptance_type_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_acceptance_status_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_acceptance
                    ADD CONSTRAINT %I
                    CHECK (status IN (''draft'', ''submitted'', ''under_review'', ''approved'', ''declined'', ''returned''))',
                    'company_8', 'company_8_eng_acceptance_status_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_acceptance_decision_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_acceptance
                    ADD CONSTRAINT %I
                    CHECK (decision IS NULL OR decision IN (''approve'', ''decline'', ''return''))',
                    'company_8', 'company_8_eng_acceptance_decision_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_acceptance_validity_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_acceptance
                    ADD CONSTRAINT %I
                    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)',
                    'company_8', 'company_8_eng_acceptance_validity_chk'
                );
            END IF;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_eng_acceptance_active_uq
            ON company_8.engagement_acceptance(company_id, engagement_id, acceptance_type)
            WHERE is_active = TRUE;

        CREATE INDEX IF NOT EXISTS company_8_eng_acceptance_company_idx
            ON company_8.engagement_acceptance(company_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_acceptance_engagement_idx
            ON company_8.engagement_acceptance(engagement_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_acceptance_status_idx
            ON company_8.engagement_acceptance(status);

        CREATE INDEX IF NOT EXISTS company_8_eng_acceptance_partner_idx
            ON company_8.engagement_acceptance(assigned_partner_user_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_acceptance_decision_date_idx
            ON company_8.engagement_acceptance(decision_date);
            
        -- ==================================================
        -- RISK & INDEPENDENCE ASSESSMENTS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.risk_independence_assessments (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            engagement_id INT NOT NULL,

            assessment_type TEXT NOT NULL DEFAULT 'acceptance', -- acceptance, continuance, independence
            status TEXT NOT NULL DEFAULT 'draft',               -- draft, submitted, under_review, approved, declined, returned
            decision TEXT NULL,                                 -- approve, decline, return
            decision_date TIMESTAMPTZ NULL,

            requested_by_user_id INT NULL,
            assigned_partner_user_id INT NULL,
            reviewed_by_user_id INT NULL,

            risk_level TEXT NOT NULL DEFAULT 'normal',          -- low, normal, high, critical
            independence_cleared BOOLEAN NOT NULL DEFAULT FALSE,
            conflicts_checked BOOLEAN NOT NULL DEFAULT FALSE,
            competence_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
            capacity_confirmed BOOLEAN NOT NULL DEFAULT FALSE,

            client_risk_notes TEXT NULL,
            service_complexity_notes TEXT NULL,
            preconditions_notes TEXT NULL,
            decision_notes TEXT NULL,

            valid_from DATE NULL,
            valid_to DATE NULL,

            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.risk_independence_assessments
            ADD COLUMN IF NOT EXISTS company_id INT,
            ADD COLUMN IF NOT EXISTS engagement_id INT,
            ADD COLUMN IF NOT EXISTS assessment_type TEXT,
            ADD COLUMN IF NOT EXISTS status TEXT,
            ADD COLUMN IF NOT EXISTS decision TEXT NULL,
            ADD COLUMN IF NOT EXISTS decision_date TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS requested_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS assigned_partner_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS reviewed_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS risk_level TEXT,
            ADD COLUMN IF NOT EXISTS independence_cleared BOOLEAN,
            ADD COLUMN IF NOT EXISTS conflicts_checked BOOLEAN,
            ADD COLUMN IF NOT EXISTS competence_confirmed BOOLEAN,
            ADD COLUMN IF NOT EXISTS capacity_confirmed BOOLEAN,
            ADD COLUMN IF NOT EXISTS client_risk_notes TEXT NULL,
            ADD COLUMN IF NOT EXISTS service_complexity_notes TEXT NULL,
            ADD COLUMN IF NOT EXISTS preconditions_notes TEXT NULL,
            ADD COLUMN IF NOT EXISTS decision_notes TEXT NULL,
            ADD COLUMN IF NOT EXISTS valid_from DATE NULL,
            ADD COLUMN IF NOT EXISTS valid_to DATE NULL,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
            ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        UPDATE company_8.risk_independence_assessments SET company_id = 8 WHERE company_id IS NULL;
        UPDATE company_8.risk_independence_assessments SET assessment_type = 'acceptance' WHERE assessment_type IS NULL OR BTRIM(assessment_type) = '';
        UPDATE company_8.risk_independence_assessments SET status = 'draft' WHERE status IS NULL OR BTRIM(status) = '';
        UPDATE company_8.risk_independence_assessments SET risk_level = 'normal' WHERE risk_level IS NULL OR BTRIM(risk_level) = '';
        UPDATE company_8.risk_independence_assessments SET independence_cleared = FALSE WHERE independence_cleared IS NULL;
        UPDATE company_8.risk_independence_assessments SET conflicts_checked = FALSE WHERE conflicts_checked IS NULL;
        UPDATE company_8.risk_independence_assessments SET competence_confirmed = FALSE WHERE competence_confirmed IS NULL;
        UPDATE company_8.risk_independence_assessments SET capacity_confirmed = FALSE WHERE capacity_confirmed IS NULL;
        UPDATE company_8.risk_independence_assessments SET is_active = TRUE WHERE is_active IS NULL;
        UPDATE company_8.risk_independence_assessments SET created_at = NOW() WHERE created_at IS NULL;
        UPDATE company_8.risk_independence_assessments SET updated_at = NOW() WHERE updated_at IS NULL;

        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN company_id SET DEFAULT 8;
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN assessment_type SET DEFAULT 'acceptance';
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN status SET DEFAULT 'draft';
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN risk_level SET DEFAULT 'normal';
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN independence_cleared SET DEFAULT FALSE;
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN conflicts_checked SET DEFAULT FALSE;
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN competence_confirmed SET DEFAULT FALSE;
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN capacity_confirmed SET DEFAULT FALSE;
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN is_active SET DEFAULT TRUE;
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN created_at SET DEFAULT NOW();
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN updated_at SET DEFAULT NOW();

        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN company_id SET NOT NULL;
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN engagement_id SET NOT NULL;
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN assessment_type SET NOT NULL;
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN status SET NOT NULL;
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN risk_level SET NOT NULL;
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN independence_cleared SET NOT NULL;
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN conflicts_checked SET NOT NULL;
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN competence_confirmed SET NOT NULL;
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN capacity_confirmed SET NOT NULL;
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN is_active SET NOT NULL;
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN created_at SET NOT NULL;
        ALTER TABLE company_8.risk_independence_assessments ALTER COLUMN updated_at SET NOT NULL;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ria_engagement_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.risk_independence_assessments
                    ADD CONSTRAINT %I
                    FOREIGN KEY (engagement_id)
                    REFERENCES %I.engagements(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_ria_engagement_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ria_requested_by_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.risk_independence_assessments
                    ADD CONSTRAINT %I
                    FOREIGN KEY (requested_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_ria_requested_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ria_partner_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.risk_independence_assessments
                    ADD CONSTRAINT %I
                    FOREIGN KEY (assigned_partner_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_ria_partner_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ria_reviewed_by_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.risk_independence_assessments
                    ADD CONSTRAINT %I
                    FOREIGN KEY (reviewed_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_ria_reviewed_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ria_type_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.risk_independence_assessments
                    ADD CONSTRAINT %I
                    CHECK (assessment_type IN (''acceptance'', ''continuance'', ''independence''))',
                    'company_8', 'company_8_ria_type_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ria_status_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.risk_independence_assessments
                    ADD CONSTRAINT %I
                    CHECK (status IN (''draft'', ''submitted'', ''under_review'', ''approved'', ''declined'', ''returned''))',
                    'company_8', 'company_8_ria_status_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ria_decision_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.risk_independence_assessments
                    ADD CONSTRAINT %I
                    CHECK (decision IS NULL OR decision IN (''approve'', ''decline'', ''return''))',
                    'company_8', 'company_8_ria_decision_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ria_risk_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.risk_independence_assessments
                    ADD CONSTRAINT %I
                    CHECK (risk_level IN (''low'', ''normal'', ''high'', ''critical''))',
                    'company_8', 'company_8_ria_risk_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ria_validity_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.risk_independence_assessments
                    ADD CONSTRAINT %I
                    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)',
                    'company_8', 'company_8_ria_validity_chk'
                );
            END IF;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_ria_active_uq
            ON company_8.risk_independence_assessments(company_id, engagement_id, assessment_type)
            WHERE is_active = TRUE;

        CREATE INDEX IF NOT EXISTS company_8_ria_company_idx
            ON company_8.risk_independence_assessments(company_id);

        CREATE INDEX IF NOT EXISTS company_8_ria_engagement_idx
            ON company_8.risk_independence_assessments(engagement_id);

        CREATE INDEX IF NOT EXISTS company_8_ria_status_idx
            ON company_8.risk_independence_assessments(status);

        CREATE INDEX IF NOT EXISTS company_8_ria_risk_idx
            ON company_8.risk_independence_assessments(risk_level);

        CREATE INDEX IF NOT EXISTS company_8_ria_partner_idx
            ON company_8.risk_independence_assessments(assigned_partner_user_id);

        CREATE INDEX IF NOT EXISTS company_8_ria_decision_date_idx
            ON company_8.risk_independence_assessments(decision_date);            
        -- ==================================================
        -- ENGAGEMENT WORKING PAPERS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.engagement_working_papers (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            engagement_id INT NOT NULL,

            paper_code TEXT NULL,
            paper_name TEXT NOT NULL,
            paper_section TEXT NOT NULL, -- planning, cash, receivables, payables, revenue, expenses, payroll, tax, ppe, equity, fs, completion, other
            paper_type TEXT NOT NULL DEFAULT 'working_paper', -- working_paper, lead_schedule, reconciliation, checklist, memo, analysis, support

            status TEXT NOT NULL DEFAULT 'not_started', -- not_started, in_progress, prepared, in_review, reviewed, cleared, blocked, returned, archived
            priority TEXT NOT NULL DEFAULT 'normal',

            preparer_user_id INT NULL,
            reviewer_user_id INT NULL,

            due_date DATE NULL,
            prepared_at TIMESTAMPTZ NULL,
            reviewed_at TIMESTAMPTZ NULL,
            cleared_at TIMESTAMPTZ NULL,

            version_no INT NOT NULL DEFAULT 1,
            document_count INT NOT NULL DEFAULT 0,

            linked_reporting_item_id INT NULL,
            linked_deliverable_id INT NULL,

            notes TEXT NULL,
            review_notes TEXT NULL,

            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.engagement_working_papers
            ADD COLUMN IF NOT EXISTS company_id INT,
            ADD COLUMN IF NOT EXISTS engagement_id INT,

            ADD COLUMN IF NOT EXISTS paper_code TEXT NULL,
            ADD COLUMN IF NOT EXISTS paper_name TEXT,
            ADD COLUMN IF NOT EXISTS paper_section TEXT,
            ADD COLUMN IF NOT EXISTS paper_type TEXT NULL,

            ADD COLUMN IF NOT EXISTS status TEXT,
            ADD COLUMN IF NOT EXISTS priority TEXT NULL,

            ADD COLUMN IF NOT EXISTS preparer_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS reviewer_user_id INT NULL,

            ADD COLUMN IF NOT EXISTS due_date DATE NULL,
            ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ NULL,

            ADD COLUMN IF NOT EXISTS version_no INT,
            ADD COLUMN IF NOT EXISTS document_count INT,

            ADD COLUMN IF NOT EXISTS linked_reporting_item_id INT NULL,
            ADD COLUMN IF NOT EXISTS linked_deliverable_id INT NULL,

            ADD COLUMN IF NOT EXISTS notes TEXT NULL,
            ADD COLUMN IF NOT EXISTS review_notes TEXT NULL,

            ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
            ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        UPDATE company_8.engagement_working_papers
        SET company_id = 8
        WHERE company_id IS NULL;

        UPDATE company_8.engagement_working_papers
        SET paper_type = 'working_paper'
        WHERE paper_type IS NULL OR BTRIM(paper_type) = '';

        UPDATE company_8.engagement_working_papers
        SET status = 'not_started'
        WHERE status IS NULL OR BTRIM(status) = '';

        UPDATE company_8.engagement_working_papers
        SET priority = 'normal'
        WHERE priority IS NULL OR BTRIM(priority) = '';

        UPDATE company_8.engagement_working_papers
        SET version_no = 1
        WHERE version_no IS NULL OR version_no < 1;

        UPDATE company_8.engagement_working_papers
        SET document_count = 0
        WHERE document_count IS NULL OR document_count < 0;

        UPDATE company_8.engagement_working_papers
        SET is_active = TRUE
        WHERE is_active IS NULL;

        UPDATE company_8.engagement_working_papers
        SET created_at = NOW()
        WHERE created_at IS NULL;

        UPDATE company_8.engagement_working_papers
        SET updated_at = NOW()
        WHERE updated_at IS NULL;

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN company_id SET DEFAULT 8;

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN paper_type SET DEFAULT 'working_paper';

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN status SET DEFAULT 'not_started';

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN priority SET DEFAULT 'normal';

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN version_no SET DEFAULT 1;

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN document_count SET DEFAULT 0;

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN is_active SET DEFAULT TRUE;

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN created_at SET DEFAULT NOW();

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN updated_at SET DEFAULT NOW();

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN company_id SET NOT NULL;

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN engagement_id SET NOT NULL;

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN paper_name SET NOT NULL;

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN paper_section SET NOT NULL;

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN paper_type SET NOT NULL;

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN status SET NOT NULL;

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN priority SET NOT NULL;

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN version_no SET NOT NULL;

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN document_count SET NOT NULL;

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN is_active SET NOT NULL;

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN created_at SET NOT NULL;

        ALTER TABLE company_8.engagement_working_papers
            ALTER COLUMN updated_at SET NOT NULL;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_wp_engagement_fk'
                  AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_working_papers
                     ADD CONSTRAINT %I
                     FOREIGN KEY (engagement_id)
                     REFERENCES %I.engagements(id)
                     ON DELETE CASCADE',
                    'company_8', 'company_8_eng_wp_engagement_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_wp_preparer_fk'
                  AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_working_papers
                     ADD CONSTRAINT %I
                     FOREIGN KEY (preparer_user_id)
                     REFERENCES public.users(id)
                     ON DELETE SET NULL',
                    'company_8', 'company_8_eng_wp_preparer_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_wp_reviewer_fk'
                  AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_working_papers
                     ADD CONSTRAINT %I
                     FOREIGN KEY (reviewer_user_id)
                     REFERENCES public.users(id)
                     ON DELETE SET NULL',
                    'company_8', 'company_8_eng_wp_reviewer_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_wp_created_by_fk'
                  AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_working_papers
                     ADD CONSTRAINT %I
                     FOREIGN KEY (created_by_user_id)
                     REFERENCES public.users(id)
                     ON DELETE SET NULL',
                    'company_8', 'company_8_eng_wp_created_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_wp_updated_by_fk'
                  AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_working_papers
                     ADD CONSTRAINT %I
                     FOREIGN KEY (updated_by_user_id)
                     REFERENCES public.users(id)
                     ON DELETE SET NULL',
                    'company_8', 'company_8_eng_wp_updated_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_wp_reporting_item_fk'
                  AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_working_papers
                     ADD CONSTRAINT %I
                     FOREIGN KEY (linked_reporting_item_id)
                     REFERENCES %I.engagement_reporting_items(id)
                     ON DELETE SET NULL',
                    'company_8', 'company_8_eng_wp_reporting_item_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_wp_deliverable_fk'
                  AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_working_papers
                     ADD CONSTRAINT %I
                     FOREIGN KEY (linked_deliverable_id)
                     REFERENCES %I.engagement_deliverables(id)
                     ON DELETE SET NULL',
                    'company_8', 'company_8_eng_wp_deliverable_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_wp_section_chk'
                  AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_working_papers
                     ADD CONSTRAINT %I
                     CHECK (
                        paper_section IN (
                            ''planning'',
                            ''cash'',
                            ''receivables'',
                            ''payables'',
                            ''revenue'',
                            ''expenses'',
                            ''payroll'',
                            ''tax'',
                            ''ppe'',
                            ''equity'',
                            ''fs'',
                            ''completion'',
                            ''other''
                        )
                     )',
                    'company_8', 'company_8_eng_wp_section_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_wp_type_chk'
                  AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_working_papers
                     ADD CONSTRAINT %I
                     CHECK (
                        paper_type IN (
                            ''working_paper'',
                            ''lead_schedule'',
                            ''reconciliation'',
                            ''checklist'',
                            ''memo'',
                            ''analysis'',
                            ''support''
                        )
                     )',
                    'company_8', 'company_8_eng_wp_type_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_wp_status_chk'
                  AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_working_papers
                     ADD CONSTRAINT %I
                     CHECK (
                        status IN (
                            ''not_started'',
                            ''in_progress'',
                            ''prepared'',
                            ''in_review'',
                            ''reviewed'',
                            ''cleared'',
                            ''blocked'',
                            ''returned'',
                            ''archived''
                        )
                     )',
                    'company_8', 'company_8_eng_wp_status_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_wp_priority_chk'
                  AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_working_papers
                     ADD CONSTRAINT %I
                     CHECK (priority IN (''low'', ''normal'', ''high'', ''urgent''))',
                    'company_8', 'company_8_eng_wp_priority_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_wp_version_chk'
                  AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_working_papers
                     ADD CONSTRAINT %I
                     CHECK (version_no >= 1)',
                    'company_8', 'company_8_eng_wp_version_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_wp_doc_count_chk'
                  AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_working_papers
                     ADD CONSTRAINT %I
                     CHECK (document_count >= 0)',
                    'company_8', 'company_8_eng_wp_doc_count_chk'
                );
            END IF;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_eng_wp_company_code_uq
            ON company_8.engagement_working_papers(company_id, LOWER(paper_code))
            WHERE paper_code IS NOT NULL AND BTRIM(paper_code) <> '';

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_eng_wp_active_name_uq
            ON company_8.engagement_working_papers(company_id, engagement_id, LOWER(paper_name))
            WHERE is_active = TRUE;

        CREATE INDEX IF NOT EXISTS company_8_eng_wp_company_id_idx
            ON company_8.engagement_working_papers(company_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_wp_engagement_id_idx
            ON company_8.engagement_working_papers(engagement_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_wp_section_idx
            ON company_8.engagement_working_papers(paper_section);

        CREATE INDEX IF NOT EXISTS company_8_eng_wp_type_idx
            ON company_8.engagement_working_papers(paper_type);

        CREATE INDEX IF NOT EXISTS company_8_eng_wp_status_idx
            ON company_8.engagement_working_papers(status);

        CREATE INDEX IF NOT EXISTS company_8_eng_wp_priority_idx
            ON company_8.engagement_working_papers(priority);

        CREATE INDEX IF NOT EXISTS company_8_eng_wp_due_date_idx
            ON company_8.engagement_working_papers(due_date);

        CREATE INDEX IF NOT EXISTS company_8_eng_wp_preparer_idx
            ON company_8.engagement_working_papers(preparer_user_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_wp_reviewer_idx
            ON company_8.engagement_working_papers(reviewer_user_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_wp_reporting_item_idx
            ON company_8.engagement_working_papers(linked_reporting_item_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_wp_deliverable_idx
            ON company_8.engagement_working_papers(linked_deliverable_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_wp_is_active_idx
            ON company_8.engagement_working_papers(is_active);

        CREATE TABLE IF NOT EXISTS company_8.engagement_escalations (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            engagement_id INT NOT NULL,

            escalation_code TEXT NULL,

            source_type TEXT NOT NULL,       -- working_paper, deliverable, signoff, posting_activity, monthly_close_task, year_end_task, manual
            source_id INT NULL,

            escalation_type TEXT NOT NULL,   -- deadline_risk, quality_issue, blocker, client_issue, review_delay, signoff_delay, other
            severity TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, critical

            title TEXT NULL,
            description TEXT NULL,

            status TEXT NOT NULL DEFAULT 'open', -- open, in_progress, resolved, closed, dismissed

            raised_by_user_id INT NULL,
            assigned_to_user_id INT NULL,
            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,

            due_date DATE NULL,
            resolved_at TIMESTAMPTZ NULL,
            closed_at TIMESTAMPTZ NULL,

            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.engagement_escalations
            ADD COLUMN IF NOT EXISTS company_id INT,
            ADD COLUMN IF NOT EXISTS engagement_id INT,

            ADD COLUMN IF NOT EXISTS escalation_code TEXT NULL,

            ADD COLUMN IF NOT EXISTS source_type TEXT,
            ADD COLUMN IF NOT EXISTS source_id INT NULL,

            ADD COLUMN IF NOT EXISTS escalation_type TEXT,
            ADD COLUMN IF NOT EXISTS severity TEXT NULL,

            ADD COLUMN IF NOT EXISTS title TEXT NULL,
            ADD COLUMN IF NOT EXISTS description TEXT NULL,

            ADD COLUMN IF NOT EXISTS status TEXT,

            ADD COLUMN IF NOT EXISTS raised_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS assigned_to_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL,

            ADD COLUMN IF NOT EXISTS due_date DATE NULL,
            ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL,

            ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        UPDATE company_8.engagement_escalations
        SET company_id = 8
        WHERE company_id IS NULL;

        UPDATE company_8.engagement_escalations
        SET source_type = 'manual'
        WHERE source_type IS NULL OR BTRIM(source_type) = '';

        UPDATE company_8.engagement_escalations
        SET escalation_type = 'other'
        WHERE escalation_type IS NULL OR BTRIM(escalation_type) = '';

        UPDATE company_8.engagement_escalations
        SET severity = 'medium'
        WHERE severity IS NULL OR BTRIM(severity) = '';

        UPDATE company_8.engagement_escalations
        SET status = 'open'
        WHERE status IS NULL OR BTRIM(status) = '';

        UPDATE company_8.engagement_escalations
        SET is_active = TRUE
        WHERE is_active IS NULL;

        UPDATE company_8.engagement_escalations
        SET created_at = NOW()
        WHERE created_at IS NULL;

        UPDATE company_8.engagement_escalations
        SET updated_at = NOW()
        WHERE updated_at IS NULL;

        ALTER TABLE company_8.engagement_escalations
            ALTER COLUMN company_id SET DEFAULT 8;

        ALTER TABLE company_8.engagement_escalations
            ALTER COLUMN source_type SET DEFAULT 'manual';

        ALTER TABLE company_8.engagement_escalations
            ALTER COLUMN escalation_type SET DEFAULT 'other';

        ALTER TABLE company_8.engagement_escalations
            ALTER COLUMN severity SET DEFAULT 'medium';

        ALTER TABLE company_8.engagement_escalations
            ALTER COLUMN status SET DEFAULT 'open';

        ALTER TABLE company_8.engagement_escalations
            ALTER COLUMN is_active SET DEFAULT TRUE;

        ALTER TABLE company_8.engagement_escalations
            ALTER COLUMN created_at SET DEFAULT NOW();

        ALTER TABLE company_8.engagement_escalations
            ALTER COLUMN updated_at SET DEFAULT NOW();

        ALTER TABLE company_8.engagement_escalations
            ALTER COLUMN company_id SET NOT NULL;

        ALTER TABLE company_8.engagement_escalations
            ALTER COLUMN engagement_id SET NOT NULL;

        ALTER TABLE company_8.engagement_escalations
            ALTER COLUMN source_type SET NOT NULL;

        ALTER TABLE company_8.engagement_escalations
            ALTER COLUMN escalation_type SET NOT NULL;

        ALTER TABLE company_8.engagement_escalations
            ALTER COLUMN severity SET NOT NULL;

        ALTER TABLE company_8.engagement_escalations
            ALTER COLUMN status SET NOT NULL;

        ALTER TABLE company_8.engagement_escalations
            ALTER COLUMN is_active SET NOT NULL;

        ALTER TABLE company_8.engagement_escalations
            ALTER COLUMN created_at SET NOT NULL;

        ALTER TABLE company_8.engagement_escalations
            ALTER COLUMN updated_at SET NOT NULL;

        CREATE INDEX IF NOT EXISTS idx_engagement_escalations_engagement
        ON company_8.engagement_escalations (engagement_id);

        CREATE INDEX IF NOT EXISTS idx_engagement_escalations_company
        ON company_8.engagement_escalations (company_id);

        CREATE INDEX IF NOT EXISTS idx_engagement_escalations_status
        ON company_8.engagement_escalations (status);

        CREATE INDEX IF NOT EXISTS idx_engagement_escalations_active
        ON company_8.engagement_escalations (is_active);

        CREATE INDEX IF NOT EXISTS idx_engagement_escalations_due_date
        ON company_8.engagement_escalations (due_date);

        CREATE INDEX IF NOT EXISTS idx_engagement_escalations_assigned_to
        ON company_8.engagement_escalations (assigned_to_user_id);

        CREATE INDEX IF NOT EXISTS idx_engagement_escalations_raised_by
        ON company_8.engagement_escalations (raised_by_user_id);

        CREATE INDEX IF NOT EXISTS idx_engagement_escalations_source
        ON company_8.engagement_escalations (source_type, source_id);

        CREATE UNIQUE INDEX IF NOT EXISTS idx_engagement_escalations_code_unique
        ON company_8.engagement_escalations (company_id, escalation_code)
        WHERE escalation_code IS NOT NULL AND BTRIM(escalation_code) <> '';

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_esc_engagement_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_escalations
                    ADD CONSTRAINT %I
                    FOREIGN KEY (engagement_id)
                    REFERENCES %I.engagements(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_eng_esc_engagement_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_esc_raised_by_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_escalations
                    ADD CONSTRAINT %I
                    FOREIGN KEY (raised_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_esc_raised_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_esc_assigned_to_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_escalations
                    ADD CONSTRAINT %I
                    FOREIGN KEY (assigned_to_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_esc_assigned_to_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_esc_created_by_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_escalations
                    ADD CONSTRAINT %I
                    FOREIGN KEY (created_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_esc_created_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_esc_updated_by_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_escalations
                    ADD CONSTRAINT %I
                    FOREIGN KEY (updated_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_esc_updated_by_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_esc_source_type_chk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_escalations
                    ADD CONSTRAINT %I
                    CHECK (
                        source_type IN (
                            ''working_paper'',
                            ''deliverable'',
                            ''signoff'',
                            ''posting_activity'',
                            ''monthly_close_task'',
                            ''year_end_task'',
                            ''manual''
                        )
                    )',
                    'company_8', 'company_8_eng_esc_source_type_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_esc_type_chk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_escalations
                    ADD CONSTRAINT %I
                    CHECK (
                        escalation_type IN (
                            ''deadline_risk'',
                            ''quality_issue'',
                            ''blocker'',
                            ''client_issue'',
                            ''review_delay'',
                            ''signoff_delay'',
                            ''other''
                        )
                    )',
                    'company_8', 'company_8_eng_esc_type_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_esc_severity_chk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_escalations
                    ADD CONSTRAINT %I
                    CHECK (severity IN (''low'', ''medium'', ''high'', ''critical''))',
                    'company_8', 'company_8_eng_esc_severity_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_esc_status_chk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_escalations
                    ADD CONSTRAINT %I
                    CHECK (status IN (''open'', ''in_progress'', ''resolved'', ''closed'', ''dismissed''))',
                    'company_8', 'company_8_eng_esc_status_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_esc_due_closed_chk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_escalations
                    ADD CONSTRAINT %I
                    CHECK (
                        (resolved_at IS NULL OR resolved_at >= created_at)
                        AND (closed_at IS NULL OR closed_at >= created_at)
                    )',
                    'company_8', 'company_8_eng_esc_due_closed_chk'
                );
            END IF;
        END $$;

        CREATE OR REPLACE FUNCTION company_8.set_engagement_escalations_updated_at()
        RETURNS TRIGGER AS $fn$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $fn$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_engagement_escalations_updated_at
        ON company_8.engagement_escalations;

        CREATE TRIGGER trg_engagement_escalations_updated_at
        BEFORE UPDATE ON company_8.engagement_escalations
        FOR EACH ROW
        EXECUTE PROCEDURE company_8.set_engagement_escalations_updated_at();

        -- ==================================================
        -- ENGAGEMENT OVERRIDE LOG
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.engagement_override_log (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            engagement_id INT NOT NULL,
            source_type TEXT NOT NULL DEFAULT 'engagement', -- engagement, deliverable, signoff_step, acceptance, escalation, posting, working_paper, other
            source_id INT NULL,
            override_type TEXT NOT NULL DEFAULT 'override', -- override, exception, dispute, waiver, approval_exception
            severity TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, critical
            title TEXT NOT NULL,
            description TEXT NULL,
            rationale TEXT NULL,
            resolution_summary TEXT NULL,
            status TEXT NOT NULL DEFAULT 'open', -- open, under_review, resolved, closed
            decision_outcome TEXT NULL, -- approved, rejected, accepted_exception, waived, no_change
            override_reason_code TEXT NULL,
            assigned_to_user_id INT NULL,
            requested_by_user_id INT NULL,
            decided_by_user_id INT NULL,
            resolved_by_user_id INT NULL,
            decision_date TIMESTAMPTZ NULL,
            resolved_at TIMESTAMPTZ NULL,
            closed_at TIMESTAMPTZ NULL,
            due_date DATE NULL,
            is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.engagement_override_log
            ADD COLUMN IF NOT EXISTS company_id INT,
            ADD COLUMN IF NOT EXISTS engagement_id INT,
            ADD COLUMN IF NOT EXISTS source_type TEXT,
            ADD COLUMN IF NOT EXISTS source_id INT NULL,
            ADD COLUMN IF NOT EXISTS override_type TEXT,
            ADD COLUMN IF NOT EXISTS severity TEXT,
            ADD COLUMN IF NOT EXISTS title TEXT,
            ADD COLUMN IF NOT EXISTS description TEXT NULL,
            ADD COLUMN IF NOT EXISTS rationale TEXT NULL,
            ADD COLUMN IF NOT EXISTS resolution_summary TEXT NULL,
            ADD COLUMN IF NOT EXISTS status TEXT,
            ADD COLUMN IF NOT EXISTS decision_outcome TEXT NULL,
            ADD COLUMN IF NOT EXISTS override_reason_code TEXT NULL,
            ADD COLUMN IF NOT EXISTS assigned_to_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS requested_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS decided_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS resolved_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS decision_date TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS due_date DATE NULL,
            ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
            ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        UPDATE company_8.engagement_override_log SET company_id = 8 WHERE company_id IS NULL;
        UPDATE company_8.engagement_override_log SET source_type = 'engagement' WHERE source_type IS NULL;
        UPDATE company_8.engagement_override_log SET override_type = 'override' WHERE override_type IS NULL;
        UPDATE company_8.engagement_override_log SET severity = 'medium' WHERE severity IS NULL;
        UPDATE company_8.engagement_override_log SET status = 'open' WHERE status IS NULL;
        UPDATE company_8.engagement_override_log SET is_sensitive = FALSE WHERE is_sensitive IS NULL;
        UPDATE company_8.engagement_override_log SET is_active = TRUE WHERE is_active IS NULL;
        UPDATE company_8.engagement_override_log SET created_at = NOW() WHERE created_at IS NULL;
        UPDATE company_8.engagement_override_log SET updated_at = NOW() WHERE updated_at IS NULL;

        ALTER TABLE company_8.engagement_override_log ALTER COLUMN company_id SET DEFAULT 8;
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN source_type SET DEFAULT 'engagement';
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN override_type SET DEFAULT 'override';
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN severity SET DEFAULT 'medium';
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN status SET DEFAULT 'open';
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN is_sensitive SET DEFAULT FALSE;
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN is_active SET DEFAULT TRUE;
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN created_at SET DEFAULT NOW();
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN updated_at SET DEFAULT NOW();

        ALTER TABLE company_8.engagement_override_log ALTER COLUMN company_id SET NOT NULL;
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN engagement_id SET NOT NULL;
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN source_type SET NOT NULL;
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN override_type SET NOT NULL;
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN severity SET NOT NULL;
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN title SET NOT NULL;
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN status SET NOT NULL;
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN is_sensitive SET NOT NULL;
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN is_active SET NOT NULL;
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN created_at SET NOT NULL;
        ALTER TABLE company_8.engagement_override_log ALTER COLUMN updated_at SET NOT NULL;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_override_engagement_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_override_log
                    ADD CONSTRAINT %I
                    FOREIGN KEY (engagement_id)
                    REFERENCES %I.engagements(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_eng_override_engagement_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_override_assigned_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_override_log
                    ADD CONSTRAINT %I
                    FOREIGN KEY (assigned_to_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_override_assigned_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_override_requested_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_override_log
                    ADD CONSTRAINT %I
                    FOREIGN KEY (requested_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_override_requested_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_override_decided_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_override_log
                    ADD CONSTRAINT %I
                    FOREIGN KEY (decided_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_override_decided_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_override_resolved_fk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_override_log
                    ADD CONSTRAINT %I
                    FOREIGN KEY (resolved_by_user_id)
                    REFERENCES public.users(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_eng_override_resolved_fk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_override_type_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_override_log
                    ADD CONSTRAINT %I
                    CHECK (override_type IN (''override'', ''exception'', ''dispute'', ''waiver'', ''approval_exception''))',
                    'company_8', 'company_8_eng_override_type_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_override_severity_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_override_log
                    ADD CONSTRAINT %I
                    CHECK (severity IN (''low'', ''medium'', ''high'', ''critical''))',
                    'company_8', 'company_8_eng_override_severity_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_eng_override_status_chk' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.engagement_override_log
                    ADD CONSTRAINT %I
                    CHECK (status IN (''open'', ''under_review'', ''resolved'', ''closed''))',
                    'company_8', 'company_8_eng_override_status_chk'
                );
            END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS company_8_eng_override_company_idx
            ON company_8.engagement_override_log(company_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_override_engagement_idx
            ON company_8.engagement_override_log(engagement_id);

        CREATE INDEX IF NOT EXISTS company_8_eng_override_status_idx
            ON company_8.engagement_override_log(status);

        CREATE INDEX IF NOT EXISTS company_8_eng_override_type_idx
            ON company_8.engagement_override_log(override_type);

        CREATE INDEX IF NOT EXISTS company_8_eng_override_severity_idx
            ON company_8.engagement_override_log(severity);

        CREATE INDEX IF NOT EXISTS company_8_eng_override_due_date_idx
            ON company_8.engagement_override_log(due_date);

        CREATE INDEX IF NOT EXISTS company_8_eng_override_active_idx
            ON company_8.engagement_override_log(is_active);

        -- ==================================================
        -- NOTES
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.notes (
            id SERIAL PRIMARY KEY,
            journal_id INT REFERENCES company_8.journal(id),
            account_code TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- ==================================================
        -- TRIAL BALANCE
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.trial_balance (
            company_id INT NOT NULL DEFAULT 8,
            account TEXT NOT NULL,
            debit_total NUMERIC(18,2) DEFAULT 0,
            credit_total NUMERIC(18,2) DEFAULT 0,
            closing_balance NUMERIC(18,2) DEFAULT 0,
            PRIMARY KEY (company_id, account)
        );

        -- ✅ SAFE EVOLUTION: trial_balance legacy upgrade to include company_id + composite PK
        DO $tb_evolve$
        BEGIN
            -- 1) add company_id if missing
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'company_8'
                AND table_name = 'trial_balance'
                AND column_name = 'company_id'
            ) THEN
                EXECUTE format('ALTER TABLE %I.trial_balance ADD COLUMN company_id INT', 'company_8');
            END IF;

            -- 2) backfill NULLs
            EXECUTE format(
                'UPDATE %I.trial_balance SET company_id = %L WHERE company_id IS NULL',
                'company_8', 8
            );

            EXECUTE format(
                'ALTER TABLE %I.trial_balance ALTER COLUMN company_id SET DEFAULT %L',
                'company_8', 8
            );

            EXECUTE format(
                'ALTER TABLE %I.trial_balance ALTER COLUMN company_id SET NOT NULL',
                'company_8'
            );

            -- 4) drop old PK if it exists (likely on account only)
            IF EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE n.nspname = 'company_8'
                AND c.conrelid = format('%I.trial_balance', 'company_8')::regclass
                AND c.contype = 'p'
            ) THEN
                EXECUTE format('ALTER TABLE %I.trial_balance DROP CONSTRAINT %I',
                    'company_8',
                    (SELECT conname
                    FROM pg_constraint c
                    JOIN pg_namespace n ON n.oid = c.connamespace
                    WHERE n.nspname = 'company_8'
                    AND c.conrelid = format('%I.trial_balance', 'company_8')::regclass
                    AND c.contype = 'p'
                    LIMIT 1)
                );
            END IF;

            -- 5) set the correct composite PK
            EXECUTE format(
                'ALTER TABLE %I.trial_balance ADD PRIMARY KEY (company_id, account)',
                'company_8'
            );

            -- 6) index for reports (optional but helpful)
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I ON %I.trial_balance(account)',
                'company_8_trial_balance_account_idx',
                'company_8'
            );
        END
        $tb_evolve$;


        -- ==================================================
        -- COMPANY BANK ACCOUNTS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.company_bank_accounts (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL
                REFERENCES public.companies(id)
                ON DELETE CASCADE,

            name TEXT NOT NULL,
            bank_name TEXT NOT NULL,
            account_name TEXT NOT NULL,
            account_number TEXT NOT NULL,
            branch_code TEXT NULL,
            swift_code TEXT NULL,
            currency TEXT NULL,
            ledger_account_code TEXT NULL,

            is_default_receipts BOOLEAN NOT NULL DEFAULT FALSE,
            is_default_payments BOOLEAN NOT NULL DEFAULT FALSE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CONSTRAINT company_bank_accounts_account_no_blank_chk
                CHECK (BTRIM(account_number)<>''),
            CONSTRAINT company_bank_accounts_name_blank_chk
                CHECK (BTRIM(name)<>'')
        );

        ALTER TABLE company_8.company_bank_accounts
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

        ALTER TABLE company_8.company_bank_accounts
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

        CREATE INDEX IF NOT EXISTS company_8_bank_accounts_company_idx
        ON company_8.company_bank_accounts(company_id);

        CREATE INDEX IF NOT EXISTS company_8_bank_accounts_ledger_idx
        ON company_8.company_bank_accounts(company_id,ledger_account_code);

        DELETE FROM company_8.company_bank_accounts a
        USING company_8.company_bank_accounts b
        WHERE a.id>b.id
        AND a.company_id=b.company_id
        AND LOWER(BTRIM(a.account_number))=LOWER(BTRIM(b.account_number));

        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY company_id
                    ORDER BY id
                ) AS rn
            FROM company_8.company_bank_accounts
            WHERE is_default_receipts=TRUE
        )
        UPDATE company_8.company_bank_accounts a
        SET is_default_receipts=FALSE,
            updated_at=NOW()
        FROM ranked r
        WHERE a.id=r.id
        AND r.rn>1;

        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY company_id
                    ORDER BY id
                ) AS rn
            FROM company_8.company_bank_accounts
            WHERE is_default_payments=TRUE
        )
        UPDATE company_8.company_bank_accounts a
        SET is_default_payments=FALSE,
            updated_at=NOW()
        FROM ranked r
        WHERE a.id=r.id
        AND r.rn>1;

        CREATE UNIQUE INDEX IF NOT EXISTS
        company_8_company_bank_accounts_account_uniq
        ON company_8.company_bank_accounts(
            company_id,
            LOWER(BTRIM(account_number))
        )
        WHERE account_number IS NOT NULL
        AND BTRIM(account_number)<>'';

        CREATE UNIQUE INDEX IF NOT EXISTS
        company_8_company_bank_default_receipts_uniq
        ON company_8.company_bank_accounts(company_id)
        WHERE is_default_receipts=TRUE;

        CREATE UNIQUE INDEX IF NOT EXISTS
        company_8_company_bank_default_payments_uniq
        ON company_8.company_bank_accounts(company_id)
        WHERE is_default_payments=TRUE;

        CREATE TABLE IF NOT EXISTS company_8.bank_transactions (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            bank_account_id INT NOT NULL
                REFERENCES company_8.company_bank_accounts(id),

            tx_date DATE NOT NULL,
            description TEXT NOT NULL,
            reference TEXT NULL,

            amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            direction TEXT NOT NULL,

            matched_journal_id INT NULL
                REFERENCES company_8.journal(id)
                ON DELETE SET NULL,

            source TEXT NULL,
            source_id INT NULL,

            status TEXT NOT NULL DEFAULT 'unmatched',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_bank_tx_account_date_idx
        ON company_8.bank_transactions(
            company_id,
            bank_account_id,
            tx_date
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_bank_tx_source_uniq
        ON company_8.bank_transactions(
            company_id,
            source,
            source_id
        )
        WHERE source IS NOT NULL
        AND source_id IS NOT NULL;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_bank_tx_direction_chk'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.bank_transactions
                    ADD CONSTRAINT %I
                    CHECK (direction IN (''in'',''out''))',
                    'company_8',
                    'company_8_bank_tx_direction_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_bank_tx_status_chk'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.bank_transactions
                    ADD CONSTRAINT %I
                    CHECK (
                        status IN (
                            ''unmatched'',
                            ''matched'',
                            ''posted'',
                            ''void''
                        )
                    )',
                    'company_8',
                    'company_8_bank_tx_status_chk'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_bank_tx_amount_nonzero_chk'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.bank_transactions
                    ADD CONSTRAINT %I
                    CHECK (amount <> 0)',
                    'company_8',
                    'company_8_bank_tx_amount_nonzero_chk'
                );
            END IF;
        END $$;

        -- ==================================================
        -- LEASES
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.leases (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            lease_name TEXT NOT NULL,
            role TEXT NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            payment_amount NUMERIC(18,2) NOT NULL,
            payment_frequency TEXT NOT NULL,
            payment_timing TEXT NOT NULL DEFAULT 'arrears',
            annual_rate NUMERIC(10,6) NOT NULL,
            initial_direct_costs NUMERIC(18,2) DEFAULT 0,
            residual_value NUMERIC(18,2) DEFAULT 0,
            vat_rate NUMERIC(10,6) DEFAULT 0,
            opening_lease_liability NUMERIC(18,2) NOT NULL,
            opening_rou_asset NUMERIC(18,2) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE company_8.leases
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        ALTER TABLE company_8.leases
        ADD COLUMN IF NOT EXISTS tax_treatment_rule_id INT NULL;

        DO $fk_leases_tax_treatment_rule$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n
                    ON n.oid = c.connamespace
                WHERE c.conname = 'fk_leases_tax_treatment_rule'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.leases
                    ADD CONSTRAINT fk_leases_tax_treatment_rule
                    FOREIGN KEY (tax_treatment_rule_id)
                    REFERENCES public.lease_tax_treatment_rules(id)',
                    'company_8'
                );
            END IF;
        END
        $fk_leases_tax_treatment_rule$;

        CREATE INDEX IF NOT EXISTS
        company_8_leases_tax_treatment_rule_idx
        ON company_8.leases(tax_treatment_rule_id);
        -- ==================================================
        -- Safe additive evolution (leases)
        -- ==================================================
        -- payment_timing (legacy)  ✅ keep only if you have old DBs without this column
        DO $add_payment_timing_leases$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'company_8'
                AND table_name = 'leases'
                AND column_name = 'payment_timing'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.leases ADD COLUMN payment_timing TEXT NOT NULL DEFAULT ''arrears''',
                    'company_8'
                );
            END IF;
        END $add_payment_timing_leases$;

        -- bank_account_code (where payment is credited)
        DO $add_leases_bank_account_code$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'company_8'
                AND table_name = 'leases'
                AND column_name = 'bank_account_code'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.leases ADD COLUMN bank_account_code TEXT NULL',
                    'company_8'
                );
            END IF;
        END $add_leases_bank_account_code$;

        -- post_payment (whether to post payment leg automatically)
        DO $add_leases_post_payment$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'company_8'
                AND table_name = 'leases'
                AND column_name = 'post_payment'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.leases ADD COLUMN post_payment BOOLEAN NOT NULL DEFAULT TRUE',
                    'company_8'
                );
            END IF;
        END $add_leases_post_payment$;

        DO $add_leases_updated_at$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'company_8'
                AND table_name   = 'leases'
                AND column_name  = 'updated_at'
            ) THEN
                EXECUTE format('ALTER TABLE %I.leases ADD COLUMN updated_at TIMESTAMPTZ NULL', 'company_8');
                EXECUTE format('UPDATE %I.leases SET updated_at = created_at WHERE updated_at IS NULL', 'company_8');
            END IF;
        END $add_leases_updated_at$;

        -- index for bank_account_code
        DO $idx_leases_bank_account_code$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_indexes
                WHERE schemaname = 'company_8'
                AND indexname  = 'company_8_leases_bank_account_code_idx'
            ) THEN
                EXECUTE format(
                    'CREATE INDEX %I ON %I.leases(bank_account_code)',
                    'company_8_leases_bank_account_code_idx',
                    'company_8'
                );
            END IF;
        END $idx_leases_bank_account_code$;

        -- ==================================================
        -- Lease -> Lessor link (requires company_8.lessors)
        -- ==================================================
        ALTER TABLE company_8.leases
        ADD COLUMN IF NOT EXISTS lessor_id INT;

        -- ==================================================
        -- IAS 12 tax treatment for lessee leases
        -- ==================================================
        ALTER TABLE company_8.leases
        ADD COLUMN IF NOT EXISTS tax_deduction_basis TEXT NULL,
        ADD COLUMN IF NOT EXISTS tax_deduction_percent NUMERIC(7,4)
            NOT NULL DEFAULT 100,
        ADD COLUMN IF NOT EXISTS rou_tax_base_override NUMERIC(18,2) NULL,
        ADD COLUMN IF NOT EXISTS liability_tax_base_override NUMERIC(18,2) NULL,
        ADD COLUMN IF NOT EXISTS lease_tax_treatment_notes TEXT NULL,
        ADD COLUMN IF NOT EXISTS lease_tax_treatment_updated_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS lease_tax_treatment_updated_by INT NULL;

        DO $ck_leases_tax_deduction_basis$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n
                    ON n.oid = c.connamespace
                WHERE c.conname = 'ck_leases_tax_deduction_basis'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.leases
                    ADD CONSTRAINT ck_leases_tax_deduction_basis
                    CHECK (
                        tax_deduction_basis IS NULL
                        OR tax_deduction_basis IN (
                            ''lease_payments'',
                            ''rou_asset'',
                            ''none'',
                            ''manual''
                        )
                    )',
                    'company_8'
                );
            END IF;
        END
        $ck_leases_tax_deduction_basis$;

        DO $ck_leases_tax_deduction_percent$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n
                    ON n.oid = c.connamespace
                WHERE c.conname = 'ck_leases_tax_deduction_percent'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.leases
                    ADD CONSTRAINT ck_leases_tax_deduction_percent
                    CHECK (
                        tax_deduction_percent >= 0
                        AND tax_deduction_percent <= 100
                    )',
                    'company_8'
                );
            END IF;
        END
        $ck_leases_tax_deduction_percent$;

        CREATE INDEX IF NOT EXISTS
        company_8_leases_tax_deduction_basis_idx
        ON company_8.leases(
            company_id,
            tax_deduction_basis
        );

        CREATE INDEX IF NOT EXISTS company_8_leases_lessor_id_idx
        ON company_8.leases(lessor_id);

        DO $fk_leases_lessor$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'fk_leases_lessor'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.leases
                    ADD CONSTRAINT fk_leases_lessor
                    FOREIGN KEY (lessor_id) REFERENCES %I.lessors(id)',
                    'company_8', 'company_8'
                );
            END IF;
        END $fk_leases_lessor$;

        -- ==================================================
        -- Checks (leases)
        -- ==================================================
        DO $ck_leases_dates$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'ck_leases_dates'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.leases
                    ADD CONSTRAINT ck_leases_dates
                    CHECK (end_date >= start_date)',
                    'company_8'
                );
            END IF;
        END $ck_leases_dates$;

        DO $ck_leases_amounts$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'ck_leases_amounts'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.leases
                    ADD CONSTRAINT ck_leases_amounts
                    CHECK (
                        payment_amount >= 0
                        AND annual_rate >= 0
                        AND vat_rate >= 0
                        AND initial_direct_costs >= 0
                        AND residual_value >= 0
                        AND opening_lease_liability >= 0
                        AND opening_rou_asset >= 0
                    )',
                    'company_8'
                );
            END IF;
        END $ck_leases_amounts$;

        -- Helpful indexes (leases)
        CREATE INDEX IF NOT EXISTS company_8_leases_company_dates_idx
        ON company_8.leases(company_id, start_date, end_date);

        CREATE INDEX IF NOT EXISTS company_8_leases_company_lessor_idx
        ON company_8.leases(company_id, lessor_id);


        -- ==================================================
        -- LEASE SCHEDULE
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.lease_schedule (
            id SERIAL PRIMARY KEY,
            lease_id INT REFERENCES company_8.leases(id),
            period_no INT NOT NULL,
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            opening_liability NUMERIC(18,2) NOT NULL,
            interest NUMERIC(18,2) NOT NULL,
            payment NUMERIC(18,2) NOT NULL,
            principal NUMERIC(18,2) NOT NULL,
            closing_liability NUMERIC(18,2) NOT NULL,
            depreciation NUMERIC(18,2) NOT NULL,
            vat_portion NUMERIC(18,2) DEFAULT 0,
            net_payment NUMERIC(18,2) DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE company_8.lease_schedule
        ADD COLUMN IF NOT EXISTS company_id INT;

        -- payment_timing (schedule legacy)
        DO $add_payment_timing_schedule$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'company_8'
                AND table_name = 'lease_schedule'
                AND column_name = 'payment_timing'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_schedule ADD COLUMN payment_timing TEXT NOT NULL DEFAULT ''arrears''',
                    'company_8'
                );
            END IF;
        END $add_payment_timing_schedule$;

        -- ==================================================
        -- lease_schedule versioning + uniqueness
        -- ==================================================

        -- version_no
        DO $add_lease_schedule_version_no$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'company_8'
                AND table_name = 'lease_schedule'
                AND column_name = 'version_no'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_schedule ADD COLUMN version_no INT NOT NULL DEFAULT 1',
                    'company_8'
                );
            END IF;
        END $add_lease_schedule_version_no$;

        -- is_active
        DO $add_lease_schedule_is_active$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'company_8'
                AND table_name = 'lease_schedule'
                AND column_name = 'is_active'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_schedule ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE',
                    'company_8'
                );
            END IF;
        END $add_lease_schedule_is_active$;

        -- modification_id (nullable, links schedule version to the mod that created it)
        DO $add_lease_schedule_modification_id$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'company_8'
                AND table_name = 'lease_schedule'
                AND column_name = 'modification_id'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_schedule ADD COLUMN modification_id INT NULL',
                    'company_8'
                );
            END IF;
        END $add_lease_schedule_modification_id$;

        -- FK for modification_id (if lease_modifications table exists)
        DO $fk_lease_schedule_modification$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'fk_lease_schedule_modification'
                AND n.nspname = 'company_8'
            ) THEN
                -- Only add FK if referenced table exists
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'company_8'
                    AND table_name = 'lease_modifications'
                ) THEN
                    EXECUTE format(
                        'ALTER TABLE %I.lease_schedule
                         ADD CONSTRAINT fk_lease_schedule_modification
                         FOREIGN KEY (modification_id)
                         REFERENCES %I.lease_modifications(id)',
                        'company_8', 'company_8'
                    );
                END IF;
            END IF;
        END $fk_lease_schedule_modification$;

        -- ✅ IMPORTANT: drop old unique (lease_id, period_no) if it exists (blocks versioning)
        DO $drop_uq_lease_schedule_lease_period$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_indexes
                WHERE schemaname = 'company_8'
                AND indexname  = 'uq_lease_schedule_lease_period'
            ) THEN
                EXECUTE format('DROP INDEX IF EXISTS %I.uq_lease_schedule_lease_period', 'company_8');
            END IF;
        END $drop_uq_lease_schedule_lease_period$;

        -- ✅ New unique: (lease_id, version_no, period_no)
        DO $uq_lease_schedule_lease_period_version$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_indexes
                WHERE schemaname = 'company_8'
                AND indexname  = 'uq_lease_schedule_lease_period_version'
            ) THEN
                EXECUTE format(
                    'CREATE UNIQUE INDEX uq_lease_schedule_lease_period_version
                     ON %I.lease_schedule(lease_id, version_no, period_no)',
                    'company_8'
                );
            END IF;
        END $uq_lease_schedule_lease_period_version$;

        -- Helpful index for "active schedule" queries
        DO $lease_schedule_active_idx$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_indexes
                WHERE schemaname = 'company_8'
                AND indexname  = 'company_8_lease_schedule_active_idx'
            ) THEN
                EXECUTE format(
                    'CREATE INDEX %I
                     ON %I.lease_schedule(lease_id, is_active, version_no)',
                    'company_8_lease_schedule_active_idx',
                    'company_8'
                );
            END IF;
        END $lease_schedule_active_idx$;

        -- Checks (schedule)
        DO $ck_lease_schedule_amounts$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'ck_lease_schedule_amounts'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_schedule
                    ADD CONSTRAINT ck_lease_schedule_amounts
                    CHECK (
                        period_end >= period_start
                        AND opening_liability >= 0
                        AND interest >= 0
                        AND payment >= 0
                        AND principal >= 0
                        AND closing_liability >= 0
                        AND depreciation >= 0
                        AND vat_portion >= 0
                        AND net_payment >= 0
                    )',
                    'company_8'
                );
            END IF;
        END $ck_lease_schedule_amounts$;

        -- Helpful indexes (schedule)
        CREATE INDEX IF NOT EXISTS company_8_lease_schedule_lease_period_end_idx
        ON company_8.lease_schedule(lease_id, period_end);

        CREATE INDEX IF NOT EXISTS company_8_lease_schedule_period_end_idx
        ON company_8.lease_schedule(period_end);

        CREATE INDEX IF NOT EXISTS company_8_lease_schedule_company_idx
        ON company_8.lease_schedule(company_id);

        -- ==================================================
        -- Safe additive evolution (lease_schedule) - posting markers
        -- ==================================================
        DO $add_lease_schedule_posted_journal_id$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'company_8'
                AND table_name = 'lease_schedule'
                AND column_name = 'posted_journal_id'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_schedule ADD COLUMN posted_journal_id INT NULL',
                    'company_8'
                );
            END IF;
        END $add_lease_schedule_posted_journal_id$;

        DO $add_lease_schedule_posted_at$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'company_8'
                AND table_name = 'lease_schedule'
                AND column_name = 'posted_at'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_schedule ADD COLUMN posted_at TIMESTAMPTZ NULL',
                    'company_8'
                );
            END IF;
        END $add_lease_schedule_posted_at$;

        CREATE INDEX IF NOT EXISTS company_8_lease_schedule_posted_journal_id_idx
        ON company_8.lease_schedule(posted_journal_id);

        -- ==================================================
        -- LEASE PAYMENTS (final merged)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.lease_payments (
            id SERIAL PRIMARY KEY,

            company_id INT NOT NULL,
            lease_id INT NOT NULL,

            -- optional: link payment to a specific schedule row (period)
            schedule_id INT NULL,

            -- snapshot / reporting convenience (can be NULL, derive from lease)
            lessor_id INT NULL,

            payment_date DATE NOT NULL,

            -- amounts
            amount_gross    NUMERIC(18,2) NOT NULL DEFAULT 0,   -- cash paid (incl VAT if applicable)
            amount_net      NUMERIC(18,2) NOT NULL DEFAULT 0,   -- lease-liability basis (ex VAT)
            vat_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,

            -- optional breakdown (useful for reporting; can be 0 if not allocated)
            interest_amount  NUMERIC(18,2) NOT NULL DEFAULT 0,
            principal_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            -- metadata
            reference TEXT NULL,
            notes TEXT NULL,

            -- optional: which bank/cash account credited (posting code)
            bank_account_code TEXT NULL,

            -- lifecycle
            status TEXT NOT NULL DEFAULT 'draft', -- draft|posted|reversed|void

            -- posting markers
            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,

            -- reversal linkage (self-FKs)
            reverses_payment_id INT NULL,
            reversed_by_payment_id INT NULL,

            created_by INT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- ==================================================
        -- Safe additive evolution (lease_payments)
        -- ==================================================
        DO $lease_payments_add_cols$
        BEGIN
            -- schedule_id
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_payments' AND column_name='schedule_id'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_payments ADD COLUMN schedule_id INT NULL', 'company_8');
            END IF;

            -- lessor_id
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_payments' AND column_name='lessor_id'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_payments ADD COLUMN lessor_id INT NULL', 'company_8');
            END IF;

            -- bank_account_code
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_payments' AND column_name='bank_account_code'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_payments ADD COLUMN bank_account_code TEXT NULL', 'company_8');
            END IF;

            -- reference
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_payments' AND column_name='reference'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_payments ADD COLUMN reference TEXT NULL', 'company_8');
            END IF;

            -- notes
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_payments' AND column_name='notes'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_payments ADD COLUMN notes TEXT NULL', 'company_8');
            END IF;

            -- status
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_payments' AND column_name='status'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_payments ADD COLUMN status TEXT NOT NULL DEFAULT ''draft''', 'company_8');
            END IF;

            -- posted_journal_id
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_payments' AND column_name='posted_journal_id'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_payments ADD COLUMN posted_journal_id INT NULL', 'company_8');
            END IF;

            -- posted_at
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_payments' AND column_name='posted_at'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_payments ADD COLUMN posted_at TIMESTAMPTZ NULL', 'company_8');
            END IF;

            -- reverses_payment_id
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_payments' AND column_name='reverses_payment_id'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_payments ADD COLUMN reverses_payment_id INT NULL', 'company_8');
            END IF;

            -- reversed_by_payment_id
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_payments' AND column_name='reversed_by_payment_id'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_payments ADD COLUMN reversed_by_payment_id INT NULL', 'company_8');
            END IF;

            -- created_by
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_payments' AND column_name='created_by'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_payments ADD COLUMN created_by INT NULL', 'company_8');
            END IF;

            -- amount columns (in case older table had different names)
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_payments' AND column_name='amount_gross'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_payments ADD COLUMN amount_gross NUMERIC(18,2) NOT NULL DEFAULT 0', 'company_8');
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_payments' AND column_name='amount_net'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_payments ADD COLUMN amount_net NUMERIC(18,2) NOT NULL DEFAULT 0', 'company_8');
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_payments' AND column_name='vat_amount'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_payments ADD COLUMN vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0', 'company_8');
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_payments' AND column_name='interest_amount'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_payments ADD COLUMN interest_amount NUMERIC(18,2) NOT NULL DEFAULT 0', 'company_8');
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_payments' AND column_name='principal_amount'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_payments ADD COLUMN principal_amount NUMERIC(18,2) NOT NULL DEFAULT 0', 'company_8');
            END IF;

        END
        $lease_payments_add_cols$;

        -- ==================================================
        -- Checks
        -- ==================================================
        DO $ck_lease_payments_valid$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='ck_lease_payments_valid'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_payments
                    ADD CONSTRAINT ck_lease_payments_valid
                    CHECK (
                        payment_date IS NOT NULL
                        AND amount_gross >= 0
                        AND amount_net >= 0
                        AND vat_amount >= 0
                        AND interest_amount >= 0
                        AND principal_amount >= 0
                        AND (amount_net + vat_amount) <= (amount_gross + 0.02)
                        AND status IN (''draft'',''posted'',''reversed'',''void'')
                    )',
                    'company_8'
                );
            END IF;
        END
        $ck_lease_payments_valid$;

        DO $ck_lease_payments_reversal_sanity$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='ck_lease_payments_reversal_sanity'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_payments
                    ADD CONSTRAINT ck_lease_payments_reversal_sanity
                    CHECK (
                    reverses_payment_id IS NULL OR reverses_payment_id <> id
                    )',
                    'company_8'
                );
            END IF;
        END
        $ck_lease_payments_reversal_sanity$;

        -- ==================================================
        -- Lease payment indexes
        -- Partial payments are allowed per schedule period.
        -- Excess is blocked in application logic by comparing
        -- SUM(amount_gross) against lease_schedule.payment.
        -- ==================================================

        DO $drop_old_lease_payment_ref_unique$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_indexes
                WHERE schemaname='company_8'
                AND indexname='uq_lease_payments_lease_date_amount_ref'
            ) THEN
                EXECUTE format(
                    'DROP INDEX IF EXISTS %I.uq_lease_payments_lease_date_amount_ref',
                    'company_8'
                );
            END IF;
        END
        $drop_old_lease_payment_ref_unique$;

        DO $lease_payments_lease_schedule_status_idx$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_indexes
                WHERE schemaname='company_8'
                AND indexname='company_8_lease_payments_lease_schedule_status_idx'
            ) THEN
                EXECUTE format(
                    'CREATE INDEX %I
                     ON %I.lease_payments(lease_id, schedule_id, status)',
                    'company_8_lease_payments_lease_schedule_status_idx',
                    'company_8'
                );
            END IF;
        END
        $lease_payments_lease_schedule_status_idx$;

        DO $uq_lease_payments_one_reversal_per_original$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE schemaname='company_8' AND indexname='uq_lease_payments_one_reversal_per_original'
            ) THEN
                EXECUTE format(
                    'CREATE UNIQUE INDEX uq_lease_payments_one_reversal_per_original
                    ON %I.lease_payments(reverses_payment_id)
                    WHERE reverses_payment_id IS NOT NULL',
                    'company_8'
                );
            END IF;
        END
        $uq_lease_payments_one_reversal_per_original$;

        -- ==================================================
        -- Helpful indexes
        -- ==================================================
        CREATE INDEX IF NOT EXISTS company_8_lease_payments_company_idx
        ON company_8.lease_payments(company_id);

        CREATE INDEX IF NOT EXISTS company_8_lease_payments_lease_date_idx
        ON company_8.lease_payments(lease_id, payment_date);

        CREATE INDEX IF NOT EXISTS company_8_lease_payments_payment_date_idx
        ON company_8.lease_payments(payment_date);

        CREATE INDEX IF NOT EXISTS company_8_lease_payments_schedule_id_idx
        ON company_8.lease_payments(schedule_id);

        CREATE INDEX IF NOT EXISTS company_8_lease_payments_lessor_id_idx
        ON company_8.lease_payments(lessor_id);

        CREATE INDEX IF NOT EXISTS company_8_lease_payments_posted_journal_id_idx
        ON company_8.lease_payments(posted_journal_id);

        CREATE INDEX IF NOT EXISTS company_8_lease_payments_bank_account_code_idx
        ON company_8.lease_payments(bank_account_code);

        CREATE INDEX IF NOT EXISTS company_8_lease_payments_status_idx
        ON company_8.lease_payments(status);

        -- ==================================================
        -- FKs (safe-add)
        -- ==================================================
        DO $fk_lease_payments_lease$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_lease_payments_lease'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_payments
                    ADD CONSTRAINT fk_lease_payments_lease
                    FOREIGN KEY (lease_id) REFERENCES %I.leases(id)',
                    'company_8', 'company_8'
                );
            END IF;
        END
        $fk_lease_payments_lease$;

        DO $fk_lease_payments_schedule$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_lease_payments_schedule'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_payments
                    ADD CONSTRAINT fk_lease_payments_schedule
                    FOREIGN KEY (schedule_id) REFERENCES %I.lease_schedule(id)',
                    'company_8', 'company_8'
                );
            END IF;
        END
        $fk_lease_payments_schedule$;

        DO $fk_lease_payments_lessor$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_lease_payments_lessor'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_payments
                    ADD CONSTRAINT fk_lease_payments_lessor
                    FOREIGN KEY (lessor_id) REFERENCES %I.lessors(id)',
                    'company_8', 'company_8'
                );
            END IF;
        END
        $fk_lease_payments_lessor$;

        DO $fk_lease_payments_reverses$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_lease_payments_reverses'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_payments
                    ADD CONSTRAINT fk_lease_payments_reverses
                    FOREIGN KEY (reverses_payment_id) REFERENCES %I.lease_payments(id)',
                    'company_8', 'company_8'
                );
            END IF;
        END
        $fk_lease_payments_reverses$;

        DO $fk_lease_payments_reversed_by$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_lease_payments_reversed_by'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_payments
                    ADD CONSTRAINT fk_lease_payments_reversed_by
                    FOREIGN KEY (reversed_by_payment_id) REFERENCES %I.lease_payments(id)',
                    'company_8', 'company_8'
                );
            END IF;
        END
        $fk_lease_payments_reversed_by$;

        -- ==================================================
        -- LEASE MODIFICATIONS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.lease_modifications (
            id SERIAL PRIMARY KEY,

            company_id INT NOT NULL,
            lease_id   INT NOT NULL,

            modification_date DATE NOT NULL,
            change_type TEXT NOT NULL,      -- payment|term|rate|scope|mixed
            reason TEXT NULL,

            -- old/new snapshot (NULL allowed depending on change_type)
            old_payment_amount NUMERIC(18,2) NULL,
            new_payment_amount NUMERIC(18,2) NULL,

            old_annual_rate NUMERIC(10,6) NULL,
            new_annual_rate NUMERIC(10,6) NULL,

            old_end_date DATE NULL,
            new_end_date DATE NULL,

            -- computed adjustments (store what was actually applied)
            liability_before NUMERIC(18,2) NOT NULL DEFAULT 0,
            liability_after  NUMERIC(18,2) NOT NULL DEFAULT 0,
            rou_before       NUMERIC(18,2) NOT NULL DEFAULT 0,
            rou_after        NUMERIC(18,2) NOT NULL DEFAULT 0,

            liability_adjustment NUMERIC(18,2) NOT NULL DEFAULT 0,  -- after - before
            rou_adjustment       NUMERIC(18,2) NOT NULL DEFAULT 0,

            -- posting markers
            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,

            -- lifecycle
            status TEXT NOT NULL DEFAULT 'draft',  -- draft|posted|reversed|void

            created_by INT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- ==================================================
        -- Safe additive evolution (lease_modifications)
        -- ==================================================
        DO $lease_mods_add_cols$
        BEGIN
            -- posted_journal_id
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_modifications' AND column_name='posted_journal_id'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_modifications ADD COLUMN posted_journal_id INT NULL', 'company_8');
            END IF;

            -- posted_at
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_modifications' AND column_name='posted_at'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_modifications ADD COLUMN posted_at TIMESTAMPTZ NULL', 'company_8');
            END IF;

            -- status
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_modifications' AND column_name='status'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_modifications ADD COLUMN status TEXT NOT NULL DEFAULT ''draft''', 'company_8');
            END IF;

            -- created_by
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_modifications' AND column_name='created_by'
            ) THEN
                EXECUTE format('ALTER TABLE %I.lease_modifications ADD COLUMN created_by INT NULL', 'company_8');
            END IF;
        END
        $lease_mods_add_cols$;

        -- ==================================================
        -- Checks (lease_modifications)
        -- ==================================================
        DO $ck_lease_modifications_valid$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='ck_lease_modifications_valid'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_modifications
                    ADD CONSTRAINT ck_lease_modifications_valid
                    CHECK (
                        modification_date IS NOT NULL
                        AND change_type IN (''payment'',''term'',''rate'',''scope'',''mixed'')
                        AND liability_before >= 0
                        AND liability_after >= 0
                        AND rou_before >= 0
                        AND rou_after >= 0
                        AND status IN (''draft'',''posted'',''reversed'',''void'')
                    )',
                    'company_8'
                );
            END IF;
        END
        $ck_lease_modifications_valid$;

        -- ==================================================
        -- Uniques (anti-duplicate)
        -- One active (non-void) modification per lease per date per change_type
        -- ==================================================
        DO $uq_lease_modifications_lease_date_type$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE schemaname='company_8' AND indexname='uq_lease_modifications_lease_date_type'
            ) THEN
                EXECUTE format(
                    'CREATE UNIQUE INDEX uq_lease_modifications_lease_date_type
                    ON %I.lease_modifications(lease_id, modification_date, change_type)
                    WHERE status <> ''void''',
                    'company_8'
                );
            END IF;
        END
        $uq_lease_modifications_lease_date_type$;

        -- ==================================================
        -- Helpful indexes (lease_modifications)
        -- ==================================================
        CREATE INDEX IF NOT EXISTS company_8_lease_modifications_company_idx
        ON company_8.lease_modifications(company_id);

        CREATE INDEX IF NOT EXISTS company_8_lease_modifications_lease_date_idx
        ON company_8.lease_modifications(lease_id, modification_date);

        CREATE INDEX IF NOT EXISTS company_8_lease_modifications_posted_journal_id_idx
        ON company_8.lease_modifications(posted_journal_id);

        CREATE INDEX IF NOT EXISTS company_8_lease_modifications_status_idx
        ON company_8.lease_modifications(status);

        -- ==================================================
        -- FKs (safe-add) (lease_modifications)
        -- ==================================================
        DO $fk_lease_modifications_lease$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_lease_modifications_lease'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_modifications
                    ADD CONSTRAINT fk_lease_modifications_lease
                    FOREIGN KEY (lease_id) REFERENCES %I.leases(id)',
                    'company_8', 'company_8'
                );
            END IF;
        END
        $fk_lease_modifications_lease$;

        -- ==================================================
        -- LEASE TERMINATIONS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.lease_terminations (
            id SERIAL PRIMARY KEY,

            company_id INT NOT NULL,
            lease_id   INT NOT NULL,

            termination_date DATE NOT NULL,
            reason TEXT NULL,

            -- optional settlement paid/received (cash), if any
            settlement_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            -- computed balances at termination date
            liability_carrying_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            rou_nbv NUMERIC(18,2) NOT NULL DEFAULT 0,

            -- computed outcome (positive = gain, negative = loss) (store for disclosure)
            gain_loss_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            -- posting markers
            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,

            -- lifecycle
            status TEXT NOT NULL DEFAULT 'draft',  -- draft|posted|reversed|void

            notes TEXT NULL,
            created_by INT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- ==================================================
        -- Checks (lease_terminations)
        -- ==================================================
        DO $ck_lease_terminations_valid$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='ck_lease_terminations_valid'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_terminations
                    ADD CONSTRAINT ck_lease_terminations_valid
                    CHECK (
                        termination_date IS NOT NULL
                        AND settlement_amount >= 0
                        AND liability_carrying_amount >= 0
                        AND rou_nbv >= 0
                        AND status IN (''draft'',''posted'',''reversed'',''void'')
                    )',
                    'company_8'
                );
            END IF;
        END
        $ck_lease_terminations_valid$;

        -- ==================================================
        -- Uniques (anti-duplicate)
        -- One non-void termination per lease (system rule)
        -- ==================================================
        DO $uq_lease_terminations_one_per_lease$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE schemaname='company_8' AND indexname='uq_lease_terminations_one_per_lease'
            ) THEN
                EXECUTE format(
                    'CREATE UNIQUE INDEX uq_lease_terminations_one_per_lease
                    ON %I.lease_terminations(lease_id)
                    WHERE status <> ''void''',
                    'company_8'
                );
            END IF;
        END
        $uq_lease_terminations_one_per_lease$;

        -- ==================================================
        -- Helpful indexes (lease_terminations)
        -- ==================================================
        CREATE INDEX IF NOT EXISTS company_8_lease_terminations_company_idx
        ON company_8.lease_terminations(company_id);

        CREATE INDEX IF NOT EXISTS company_8_lease_terminations_lease_date_idx
        ON company_8.lease_terminations(lease_id, termination_date);

        CREATE INDEX IF NOT EXISTS company_8_lease_terminations_posted_journal_id_idx
        ON company_8.lease_terminations(posted_journal_id);

        CREATE INDEX IF NOT EXISTS company_8_lease_terminations_status_idx
        ON company_8.lease_terminations(status);

        -- ==================================================
        -- FKs (safe-add) (lease_terminations)
        -- ==================================================
        DO $fk_lease_terminations_lease$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_lease_terminations_lease'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_terminations
                    ADD CONSTRAINT fk_lease_terminations_lease
                    FOREIGN KEY (lease_id) REFERENCES %I.leases(id)',
                    'company_8', 'company_8'
                );
            END IF;
        END
        $fk_lease_terminations_lease$;

        -- ==================================================
        -- Safe additive evolution (leases) - termination fields
        -- ==================================================
        DO $add_leases_status_and_termination$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='leases' AND column_name='status'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.leases ADD COLUMN status TEXT NOT NULL DEFAULT ''active''',
                    'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='leases' AND column_name='termination_date'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.leases ADD COLUMN termination_date DATE NULL',
                    'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='leases' AND column_name='termination_id'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.leases ADD COLUMN termination_id INT NULL',
                    'company_8'
                );
            END IF;
        END
        $add_leases_status_and_termination$;

        -- status check
        DO $ck_leases_status$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname = 'ck_leases_status'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.leases
                    ADD CONSTRAINT ck_leases_status
                    CHECK (status IN (''active'',''terminated''))',
                    'company_8'
                );
            END IF;
        END
        $ck_leases_status$;

        -- FK leases.termination_id -> lease_terminations.id
        DO $fk_leases_termination$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_leases_termination'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.leases
                    ADD CONSTRAINT fk_leases_termination
                    FOREIGN KEY (termination_id) REFERENCES %I.lease_terminations(id)',
                    'company_8', 'company_8'
                );
            END IF;
        END
        $fk_leases_termination$;

        CREATE INDEX IF NOT EXISTS company_8_leases_status_idx
        ON company_8.leases(status);

        CREATE INDEX IF NOT EXISTS company_8_leases_termination_date_idx
        ON company_8.leases(termination_date);

        -- ==================================================
        -- Safe additive evolution (lease_schedule) - versioning for modifications
        -- ==================================================
        DO $lease_schedule_add_versioning$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_schedule' AND column_name='version_no'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_schedule ADD COLUMN version_no INT NOT NULL DEFAULT 1',
                    'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_schedule' AND column_name='is_active'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_schedule ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE',
                    'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='company_8' AND table_name='lease_schedule' AND column_name='modification_id'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_schedule ADD COLUMN modification_id INT NULL',
                    'company_8'
                );
            END IF;
        END
        $lease_schedule_add_versioning$;

        -- FK lease_schedule.modification_id -> lease_modifications.id
        DO $fk_lease_schedule_modification$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_lease_schedule_modification'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lease_schedule
                    ADD CONSTRAINT fk_lease_schedule_modification
                    FOREIGN KEY (modification_id) REFERENCES %I.lease_modifications(id)',
                    'company_8', 'company_8'
                );
            END IF;
        END
        $fk_lease_schedule_modification$;

        -- Prevent duplicate period rows per lease per version (important!)
        DO $uq_lease_schedule_lease_period_version$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE schemaname = 'company_8'
                AND indexname  = 'uq_lease_schedule_lease_period_version'
            ) THEN
                EXECUTE format(
                    'CREATE UNIQUE INDEX uq_lease_schedule_lease_period_version
                    ON %I.lease_schedule(lease_id, version_no, period_no)',
                    'company_8'
                );
            END IF;
        END
        $uq_lease_schedule_lease_period_version$;

        CREATE INDEX IF NOT EXISTS company_8_lease_schedule_active_idx
        ON company_8.lease_schedule(lease_id, is_active, version_no);

        CREATE INDEX IF NOT EXISTS company_8_lease_schedule_modification_id_idx
        ON company_8.lease_schedule(modification_id);

        -- ==================================================
        -- ASSET REGISTER (PPE master)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.assets (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,

            asset_code TEXT NOT NULL,              -- unique per company
            asset_name TEXT NOT NULL,
            asset_class TEXT NOT NULL,             -- e.g. Land, Buildings, Vehicles, Plant, IT, Furniture
            asset_class_group TEXT NULL,
            category TEXT NULL,                    -- optional grouping

            location TEXT NULL,
            serial_no TEXT NULL,
            notes TEXT NULL,

            acquisition_date DATE NOT NULL,
            available_for_use_date DATE NULL,      -- start depreciating from here (or acquisition_date if NULL)
            cost NUMERIC(18,2) NOT NULL DEFAULT 0,
            residual_value NUMERIC(18,2) NOT NULL DEFAULT 0,

            depreciation_method TEXT NOT NULL DEFAULT 'SL',  -- SL|RB (straight-line / reducing balance)
            useful_life_months INT NOT NULL DEFAULT 0,       -- store months to avoid date math ambiguity

            status TEXT NOT NULL DEFAULT 'active',           -- active|disposed|held_for_sale|inactive
            disposed_date DATE NULL,

            -- default GL mapping (optional but recommended)
            asset_account_code TEXT NULL,          -- PPE cost account (e.g. 1500)
            accum_dep_account_code TEXT NULL,      -- accumulated depreciation (e.g. 1590)
            dep_expense_account_code TEXT NULL,    -- depreciation expense (e.g. 7100)
            disposal_gain_account_code TEXT NULL,  -- gain on disposal (e.g. 4300 or other income)
            disposal_loss_account_code TEXT NULL,  -- loss on disposal (e.g. 7200 or other expense)

            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ NULL
        );

        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS asset_class_group TEXT NULL;

        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS supplier_id INT NULL,
        ADD COLUMN IF NOT EXISTS acquisition_ref TEXT NULL; -- invoice/PO/receipt ref

        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS vat_input_claimable BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS vat_recovery_reason TEXT,
        ADD COLUMN IF NOT EXISTS vat_recovery_percent NUMERIC(5,2) NOT NULL DEFAULT 100;

        ALTER TABLE company_8.assets
            ADD COLUMN IF NOT EXISTS uop_usage_mode TEXT DEFAULT 'DELTA',
            ADD COLUMN IF NOT EXISTS uop_opening_reading NUMERIC(18,4);

        UPDATE company_8.assets
        SET uop_usage_mode = 'DELTA'
        WHERE uop_usage_mode IS NULL;

        ALTER TABLE company_8.assets
        ALTER COLUMN uop_usage_mode SET DEFAULT 'DELTA';

        ALTER TABLE company_8.assets
        ALTER COLUMN uop_usage_mode SET NOT NULL;
            
        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS accumulated_impairment NUMERIC(18,2) NOT NULL DEFAULT 0;

        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS accum_impairment_account_code TEXT NULL;

        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS is_qualifying_asset BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS ready_for_use_date DATE NULL;

        -- ==================================================
        -- Asset Component Accounting (IAS 16)
        -- ==================================================

        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS parent_asset_id INT NULL;

        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS is_component BOOLEAN NOT NULL DEFAULT FALSE;

        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS is_component_group BOOLEAN NOT NULL DEFAULT FALSE;

        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS component_type TEXT NULL;

        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS component_no INT NULL;

        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS component_group_name TEXT NULL;

        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS component_percentage NUMERIC(5,2) NULL;

        -- Migration: Add accounting_standard to assets
        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS accounting_standard TEXT NOT NULL DEFAULT 'ias16';

        DO $chk_accounting_standard$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n
                ON n.oid = c.connamespace
                WHERE c.conname = 'chk_accounting_standard'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.assets
                    ADD CONSTRAINT chk_accounting_standard
                    CHECK (
                        accounting_standard IN (
                            ''ias16'',
                            ''ias40'',
                            ''ias38''
                        )
                    )',
                    'company_8'
                );
            END IF;
        END $chk_accounting_standard$;

        CREATE INDEX IF NOT EXISTS idx_assets_accounting_standard
        ON company_8.assets(company_id, accounting_standard);

        -- Add index for filtering
        CREATE INDEX IF NOT EXISTS idx_assets_accounting_standard 
        ON company_8.assets (company_id, accounting_standard);

        -- IAS 38 specific: indefinite useful life flag
        ALTER TABLE company_8.assets 
        ADD COLUMN IF NOT EXISTS indefinite_useful_life BOOLEAN NOT NULL DEFAULT FALSE;

        -- IAS 40 specific: fair value model flag
        ALTER TABLE company_8.assets 
        ADD COLUMN IF NOT EXISTS fair_value_model BOOLEAN NOT NULL DEFAULT FALSE;

        -- IAS 38: development phase capitalisation tracking
        ALTER TABLE company_8.assets 
        ADD COLUMN IF NOT EXISTS is_intangible_dev_phase BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE company_8.assets 
        ADD COLUMN IF NOT EXISTS dev_cap_start_date DATE NULL;
        ALTER TABLE company_8.assets 
        ADD COLUMN IF NOT EXISTS dev_cap_end_date DATE NULL;

        -- IAS 40: rental income tracking (link to rental income account)
        ALTER TABLE company_8.assets 
        ADD COLUMN IF NOT EXISTS rental_income_account_code TEXT NULL;
        ALTER TABLE company_8.assets 
        ADD COLUMN IF NOT EXISTS fv_gain_loss_account_code TEXT NULL;  -- FV changes go to P&L under IAS 40

        -- Reclassification tracking
        ALTER TABLE company_8.assets 
        ADD COLUMN IF NOT EXISTS reclassified_from_asset_id INT NULL;
        ALTER TABLE company_8.assets 
        ADD COLUMN IF NOT EXISTS reclassified_from_standard TEXT NULL;
        ALTER TABLE company_8.assets 
        ADD COLUMN IF NOT EXISTS reclassified_date DATE NULL;
        ALTER TABLE company_8.assets 
        ADD COLUMN IF NOT EXISTS reclassified_notes TEXT NULL;

        -- optional safety: only allow the two modes
        -- ==================================================
        -- UOP usage mode rules (corrected)
        -- ==================================================

        -- 1. Allow NULL but restrict values when present
        ALTER TABLE company_8.assets
        DROP CONSTRAINT IF EXISTS assets_uop_usage_mode_chk;

        ALTER TABLE company_8.assets
        ADD CONSTRAINT assets_uop_usage_mode_chk
        CHECK (uop_usage_mode IN ('DELTA','READING'));

        ALTER TABLE company_8.assets
        DROP CONSTRAINT IF EXISTS assets_uop_usage_required_chk;

        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS entry_mode TEXT NOT NULL DEFAULT 'acquisition';

        ALTER TABLE company_8.assets
        DROP CONSTRAINT IF EXISTS ck_assets_entry_mode;

        ALTER TABLE company_8.assets
        ADD CONSTRAINT ck_assets_entry_mode
        CHECK (entry_mode IN ('acquisition','opening_balance'));

        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS opening_posted_journal_id INT NULL;

        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS approval_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        -- ==================================================
        -- ASSETS: Opening balances (migration / bring-forward)
        -- ==================================================
        DO $add_assets_opening_fields$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='assets' AND column_name='opening_as_at'
        ) THEN
            EXECUTE format('ALTER TABLE %I.assets ADD COLUMN opening_as_at DATE NULL', 'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='assets' AND column_name='opening_cost'
        ) THEN
            EXECUTE format('ALTER TABLE %I.assets ADD COLUMN opening_cost NUMERIC(18,2) NULL', 'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='assets' AND column_name='opening_accum_dep'
        ) THEN
            EXECUTE format('ALTER TABLE %I.assets ADD COLUMN opening_accum_dep NUMERIC(18,2) NULL', 'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='assets' AND column_name='opening_impairment'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.assets
            ADD COLUMN opening_impairment NUMERIC(18,2) NULL',
            'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8'
            AND table_name='assets'
            AND column_name='opening_revaluation_surplus'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.assets
            ADD COLUMN opening_revaluation_surplus NUMERIC(18,2) NULL',
            'company_8');
        END IF;
        END
        $add_assets_opening_fields$;

        DO $ck_assets_opening_valid$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_assets_opening_valid' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.assets
            ADD CONSTRAINT ck_assets_opening_valid
            CHECK (
                opening_cost IS NULL OR opening_cost >= 0
                AND opening_accum_dep IS NULL OR opening_accum_dep >= 0
                AND opening_revaluation_surplus IS NULL OR opening_revaluation_surplus >= 0
            )',
            'company_8'
            );
        END IF;
        END
        $ck_assets_opening_valid$;

        CREATE OR REPLACE FUNCTION company_8.fn_assert_asset_company()
        RETURNS trigger AS $$
        DECLARE asset_company_id INT;
        BEGIN
        IF NEW.asset_id IS NULL THEN
            RAISE EXCEPTION 'asset_id is required';
        END IF;

        SELECT company_id INTO asset_company_id
        FROM company_8.assets
        WHERE id = NEW.asset_id;

        IF asset_company_id IS NULL THEN
            RAISE EXCEPTION 'Asset % not found', NEW.asset_id;
        END IF;

        IF NEW.company_id IS NULL THEN
            NEW.company_id := asset_company_id;
        ELSIF NEW.company_id <> asset_company_id THEN
            RAISE EXCEPTION 'Company mismatch: row.company_id=% asset.company_id=% (asset_id=%)',
            NEW.company_id, asset_company_id, NEW.asset_id;
        END IF;

        RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS tr_asset_depreciation_assert_company ON company_8.asset_depreciation;
        CREATE TRIGGER tr_asset_depreciation_assert_company
        BEFORE INSERT OR UPDATE OF company_id, asset_id
        ON company_8.asset_depreciation
        FOR EACH ROW
        EXECUTE PROCEDURE company_8.fn_assert_asset_company();

        -- ==================================================
        -- ASSETS: Company consistency trigger function
        -- Ensures child.company_id matches assets.company_id for given asset_id
        -- ==================================================

        DO $tr_asset_dep_assert_company$
        BEGIN
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'company_8'
            AND table_name = 'asset_depreciation'
        ) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS tr_asset_depreciation_assert_company ON %I.asset_depreciation', 'company_8');
        EXECUTE format(
        'CREATE TRIGGER tr_asset_depreciation_assert_company
        BEFORE INSERT OR UPDATE OF company_id, asset_id
        ON %I.asset_depreciation
        FOR EACH ROW
        EXECUTE PROCEDURE %I.fn_assert_asset_company()',
        'company_8', 'company_8'
        );
        END IF;
        END
        $tr_asset_dep_assert_company$;

        DO $ck_assets_bs_code_format$
        DECLARE s text := 'company_8';
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_assets_bs_code_format'
            AND n.nspname=s
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.assets
            ADD CONSTRAINT ck_assets_bs_code_format
            CHECK (
                asset_account_code IS NULL
                OR asset_account_code ~ ''^BS_NCA_[0-9]{4}$''
            )',
            s
            );
        END IF;
        END
        $ck_assets_bs_code_format$;

        -- Add measurement basis + revaluation settings
        DO $add_assets_revaluation_fields$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='assets' AND column_name='measurement_basis'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.assets
            ADD COLUMN measurement_basis TEXT NOT NULL DEFAULT ''cost''',
            'company_8'
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='assets' AND column_name='revaluation_reserve_account_code'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.assets
            ADD COLUMN revaluation_reserve_account_code TEXT NULL',
            'company_8'
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='assets' AND column_name='revaluation_surplus_to_pnl_account_code'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.assets
            ADD COLUMN revaluation_surplus_to_pnl_account_code TEXT NULL',
            'company_8'
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='assets' AND column_name='revaluation_deficit_pnl_account_code'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.assets
            ADD COLUMN revaluation_deficit_pnl_account_code TEXT NULL',
            'company_8'
            );
        END IF;
        END
        $add_assets_revaluation_fields$;

        -- Check for measurement_basis
        DO $ck_assets_measurement_basis$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_assets_measurement_basis' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.assets
            ADD CONSTRAINT ck_assets_measurement_basis
            CHECK (measurement_basis IN (''cost'',''revaluation''))',
            'company_8'
            );
        END IF;
        END
        $ck_assets_measurement_basis$;

        -- updated_at safe-add
        DO $add_assets_updated_at$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='assets' AND column_name='updated_at'
        ) THEN
            EXECUTE format('ALTER TABLE %I.assets ADD COLUMN updated_at TIMESTAMPTZ NULL', 'company_8');
            EXECUTE format('UPDATE %I.assets SET updated_at = created_at WHERE updated_at IS NULL', 'company_8');
        END IF;
        END $add_assets_updated_at$;

        -- Uniqueness
        DO $uq_assets_company_code$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='company_8' AND indexname='uq_assets_company_code'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_assets_company_code
            ON %I.assets(company_id, asset_code)',
            'company_8'
            );
        END IF;
        END $uq_assets_company_code$;

        -- Checks
        DO $fix_ck_assets_valid$
        BEGIN
        IF EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_assets_valid' AND n.nspname='company_8'
        ) THEN
            EXECUTE format('ALTER TABLE %I.assets DROP CONSTRAINT ck_assets_valid', 'company_8');
        END IF;

        EXECUTE format(
            'ALTER TABLE %I.assets
            ADD CONSTRAINT ck_assets_valid
            CHECK (
            cost >= 0 AND residual_value >= 0
            AND useful_life_months >= 0
            AND depreciation_method IN (''SL'',''RB'',''UOP'',''APP'')
            AND status IN (''active'',''disposed'',''held_for_sale'',''inactive'')
            )',
            'company_8'
        );
        END
        $fix_ck_assets_valid$;

        -- Helpful indexes
        CREATE INDEX IF NOT EXISTS company_8_assets_company_class_idx
        ON company_8.assets(company_id, asset_class);

        CREATE INDEX IF NOT EXISTS company_8_assets_company_status_idx
        ON company_8.assets(company_id, status);

        CREATE INDEX IF NOT EXISTS company_8_assets_acq_date_idx
        ON company_8.assets(acquisition_date);

        CREATE INDEX IF NOT EXISTS asset_usage_lookup_idx
        ON company_8.asset_usage (company_id, asset_id, status, period_end DESC, id DESC);

        CREATE INDEX IF NOT EXISTS company_8_assets_company_class_group_idx
        ON company_8.assets(company_id, asset_class_group);
        
        CREATE TABLE IF NOT EXISTS company_8.asset_acquisitions (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            asset_id INT NOT NULL,

            acquisition_date DATE NOT NULL,
            posting_date DATE NULL,                         -- ✅ NEW
            amount NUMERIC(18,2) NOT NULL,

            funding_source TEXT NOT NULL DEFAULT 'cash',   -- cash|bank|ap|other
            bank_account_code TEXT NULL,                   -- if cash/bank

            credit_account_code TEXT NULL,                 -- if other/ap suspense
            reference TEXT NULL,
            notes TEXT NULL,

            supplier_id INT NULL,
            vendor_invoice_no TEXT NULL,
            grn_no TEXT NULL,
            bank_account_id INT NULL,

            status TEXT NOT NULL DEFAULT 'draft',          -- draft|posted|reversed|void
            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,

            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE company_8.asset_acquisitions
        ADD COLUMN IF NOT EXISTS vat_input_claimable BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS vat_recovery_reason TEXT,
        ADD COLUMN IF NOT EXISTS vat_recovery_percent NUMERIC(5,2) NOT NULL DEFAULT 100,
        ADD COLUMN IF NOT EXISTS non_recoverable_vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS nonrecoverable_vat_capitalized BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS nonrecoverable_vat_capitalized_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(18,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS net_amount NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS vat_rate_percent NUMERIC(8,4);

        ALTER TABLE company_8.asset_acquisitions
        ADD COLUMN IF NOT EXISTS vat_treatment TEXT NOT NULL DEFAULT 'no_vat';

        ALTER TABLE company_8.asset_acquisitions
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS approval_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        ALTER TABLE company_8.asset_acquisitions
        DROP CONSTRAINT IF EXISTS ck_asset_acq_vat_treatment;

        ALTER TABLE company_8.asset_acquisitions
        ADD CONSTRAINT ck_asset_acq_vat_treatment
        CHECK (
            vat_treatment IN ('no_vat', 'inclusive', 'exclusive')
        );

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'company_8'
                AND table_name = 'asset_acquisitions'
                AND column_name = 'supplier_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_acquisitions ADD COLUMN supplier_id INT NULL', 'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'company_8'
                AND table_name = 'asset_acquisitions'
                AND column_name = 'vendor_invoice_no'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_acquisitions ADD COLUMN vendor_invoice_no TEXT NULL', 'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'company_8'
                AND table_name = 'asset_acquisitions'
                AND column_name = 'grn_no'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_acquisitions ADD COLUMN grn_no TEXT NULL', 'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'company_8'
                AND table_name = 'asset_acquisitions'
                AND column_name = 'bank_account_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_acquisitions ADD COLUMN bank_account_id INT NULL', 'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'company_8'
                AND table_name = 'asset_acquisitions'
                AND column_name = 'posting_date'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_acquisitions ADD COLUMN posting_date DATE NULL', 'company_8');
        END IF;
        END $$;

        DO $$
        BEGIN
        -- ✅ backfill old rows so posting can work immediately
        EXECUTE format(
            'UPDATE %I.asset_acquisitions
                SET posting_date = acquisition_date
            WHERE posting_date IS NULL',
            'company_8'
        );
        END $$;

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'fk_asset_acq_asset'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_acquisitions
                ADD CONSTRAINT fk_asset_acq_asset
                FOREIGN KEY (asset_id) REFERENCES %I.assets(id)',
            'company_8', 'company_8'
            );
        END IF;
        END $$;

        -- ==================================================
        -- Assets -> Vendors
        -- ==================================================
        DO $fk_assets_supplier$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'fk_assets_supplier'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.assets
                    ADD CONSTRAINT fk_assets_supplier
                    FOREIGN KEY (supplier_id)
                    REFERENCES %I.vendors(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8'
                );
            END IF;
        END $fk_assets_supplier$;

        -- ==================================================
        -- Asset acquisitions -> Vendors
        -- ==================================================
        DO $fk_asset_acq_supplier$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'fk_asset_acq_supplier'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.asset_acquisitions
                    ADD CONSTRAINT fk_asset_acq_supplier
                    FOREIGN KEY (supplier_id)
                    REFERENCES %I.vendors(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8'
                );
            END IF;
        END $fk_asset_acq_supplier$;

        -- ==================================================
        -- Asset acquisitions -> Assets
        -- ==================================================
        DO $fk_asset_acq_asset$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'fk_asset_acq_asset'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.asset_acquisitions
                    ADD CONSTRAINT fk_asset_acq_asset
                    FOREIGN KEY (asset_id)
                    REFERENCES %I.assets(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8'
                );
            END IF;
        END $fk_asset_acq_asset$;

        -- ==================================================
        -- ASSET DEPRECIATION RUNS (posted movements)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.asset_depreciation (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            asset_id INT NOT NULL,

            period_start DATE NOT NULL,
            period_end   DATE NOT NULL,

            depreciation_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            -- snapshot balances after posting (helps disclosures)
            accumulated_depreciation NUMERIC(18,2) NOT NULL DEFAULT 0,
            carrying_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            status TEXT NOT NULL DEFAULT 'draft',     -- draft|posted|reversed|void
            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,

            created_by INT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE company_8.asset_depreciation
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS approval_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        -- ==================================================
        -- ASSET DEPRECIATION: Basis snapshot fields (safe-add)
        -- ==================================================
        DO $asset_dep_add_basis_snapshot$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='asset_depreciation' AND column_name='cost_basis'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_depreciation ADD COLUMN cost_basis NUMERIC(18,2) NULL', 'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='asset_depreciation' AND column_name='residual_value_basis'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_depreciation ADD COLUMN residual_value_basis NUMERIC(18,2) NULL', 'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='asset_depreciation' AND column_name='useful_life_months_basis'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_depreciation ADD COLUMN useful_life_months_basis INT NULL', 'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='asset_depreciation' AND column_name='depreciation_method_basis'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_depreciation ADD COLUMN depreciation_method_basis TEXT NULL', 'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='asset_depreciation' AND column_name='measurement_basis'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_depreciation ADD COLUMN measurement_basis TEXT NULL', 'company_8');
        END IF;
        END
        $asset_dep_add_basis_snapshot$;

        -- Optional check (safe)
        DO $fix_ck_asset_dep_basis_valid$
        BEGIN
        IF EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_asset_dep_basis_valid' AND n.nspname='company_8'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_depreciation DROP CONSTRAINT ck_asset_dep_basis_valid', 'company_8');
        END IF;

        EXECUTE format(
            'ALTER TABLE %I.asset_depreciation
            ADD CONSTRAINT ck_asset_dep_basis_valid
            CHECK (
                (cost_basis IS NULL OR cost_basis>=0)
                AND (residual_value_basis IS NULL OR residual_value_basis>=0)
                AND (useful_life_months_basis IS NULL OR useful_life_months_basis>=0)
                AND (
                    depreciation_method_basis IS NULL
                    OR depreciation_method_basis IN (''SL'',''RB'',''UOP'')
                )
                AND (
                    measurement_basis IS NULL
                    OR measurement_basis IN (''cost'',''revaluation'')
                )
            )',
            'company_8'
        );
        END
        $fix_ck_asset_dep_basis_valid$;

        DO $asset_dep_add_method_basis$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='asset_depreciation' AND column_name='rb_rate_percent_basis'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_depreciation ADD COLUMN rb_rate_percent_basis NUMERIC(8,4) NULL', 'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='asset_depreciation' AND column_name='uop_total_units_basis'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_depreciation ADD COLUMN uop_total_units_basis NUMERIC(18,4) NULL', 'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='asset_depreciation' AND column_name='uop_units_used_basis'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_depreciation ADD COLUMN uop_units_used_basis NUMERIC(18,4) NULL', 'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='asset_depreciation' AND column_name='uop_unit_name_basis'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_depreciation ADD COLUMN uop_unit_name_basis TEXT NULL', 'company_8');
        END IF;
        END
        $asset_dep_add_method_basis$;

        -- FKs
        DO $fk_asset_dep_asset$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_dep_asset' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_depreciation
            ADD CONSTRAINT fk_asset_dep_asset
            FOREIGN KEY (asset_id) REFERENCES %I.assets(id)',
            'company_8', 'company_8'
            );
        END IF;
        END $fk_asset_dep_asset$;

        DO $fk_asset_dep_journal$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_dep_journal' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_depreciation
            ADD CONSTRAINT fk_asset_dep_journal
            FOREIGN KEY (posted_journal_id) REFERENCES %I.journal(id)',
            'company_8', 'company_8'
            );
        END IF;
        END $fk_asset_dep_journal$;

        DO $fk_asset_dep_approval$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_asset_dep_approval'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.asset_depreciation
                    ADD CONSTRAINT fk_asset_dep_approval
                    FOREIGN KEY (approval_id)
                    REFERENCES %I.approval_requests(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8'
                );
            END IF;
        END
        $fk_asset_dep_approval$;

        -- Anti-duplicate: one dep row per asset per period (non-void)
        DO $uq_asset_dep_asset_period$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='company_8' AND indexname='uq_asset_dep_asset_period'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_asset_dep_asset_period
            ON %I.asset_depreciation(asset_id, period_start, period_end)
            WHERE status <> ''void''',
            'company_8'
            );
        END IF;
        END $uq_asset_dep_asset_period$;

        -- Checks
        DO $ck_asset_dep_valid$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_asset_dep_valid' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_depreciation
            ADD CONSTRAINT ck_asset_dep_valid
            CHECK (
                period_end >= period_start
                AND depreciation_amount >= 0
                AND accumulated_depreciation >= 0
                AND carrying_amount >= 0
                AND status IN (''draft'',''pending_review'',''posted'',''reversed'',''void'')
            )',
            'company_8'
            );
        END IF;
        END $ck_asset_dep_valid$;

        -- Indexes
        CREATE INDEX IF NOT EXISTS company_8_asset_dep_company_idx
        ON company_8.asset_depreciation(company_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_dep_asset_idx
        ON company_8.asset_depreciation(asset_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_dep_period_end_idx
        ON company_8.asset_depreciation(period_end);

        CREATE INDEX IF NOT EXISTS company_8_asset_dep_status_idx
        ON company_8.asset_depreciation(status);

        -- ==================================================
        -- ASSET ESTIMATE CHANGES (IAS 16) - useful life / residual / method
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.asset_estimate_changes (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            asset_id INT NOT NULL,

            effective_date DATE NOT NULL,
            change_type TEXT NOT NULL, -- useful_life|residual_value|method|mixed
            reason TEXT NULL,
            notes  TEXT NULL,

            old_useful_life_months INT NULL,
            new_useful_life_months INT NULL,

            old_residual_value NUMERIC(18,2) NULL,
            new_residual_value NUMERIC(18,2) NULL,

            old_depreciation_method TEXT NULL,
            new_depreciation_method TEXT NULL,

            status TEXT NOT NULL DEFAULT 'draft', -- draft|posted|reversed|void
            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,

            created_by INT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Checks
        DO $fix_ck_asset_estimate_changes_valid$
        BEGIN
        IF EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_asset_estimate_changes_valid' AND n.nspname='company_8'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_estimate_changes DROP CONSTRAINT ck_asset_estimate_changes_valid', 'company_8');
        END IF;

        EXECUTE format(
            'ALTER TABLE %I.asset_estimate_changes
            ADD CONSTRAINT ck_asset_estimate_changes_valid
            CHECK (
            effective_date IS NOT NULL
            AND change_type IN (''useful_life'',''residual_value'',''method'',''mixed'')
            AND status IN (''draft'',''posted'',''reversed'',''void'')
            AND (old_useful_life_months IS NULL OR old_useful_life_months >= 0)
            AND (new_useful_life_months IS NULL OR new_useful_life_months >= 0)
            AND (old_residual_value IS NULL OR old_residual_value >= 0)
            AND (new_residual_value IS NULL OR new_residual_value >= 0)
            AND (old_depreciation_method IS NULL OR old_depreciation_method IN (''SL'',''RB'',''UOP''))
            AND (new_depreciation_method IS NULL OR new_depreciation_method IN (''SL'',''RB'',''UOP''))
            )',
            'company_8'
        );
        END
        $fix_ck_asset_estimate_changes_valid$;

        -- Anti-duplicate: one non-void change per asset per date
        DO $uq_asset_estimate_changes_asset_date$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='company_8' AND indexname='uq_asset_estimate_changes_asset_date'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_asset_estimate_changes_asset_date
            ON %I.asset_estimate_changes(asset_id, effective_date)
            WHERE status <> ''void''',
            'company_8'
            );
        END IF;
        END
        $uq_asset_estimate_changes_asset_date$;

        -- Indexes
        CREATE INDEX IF NOT EXISTS company_8_asset_estimate_changes_company_idx
        ON company_8.asset_estimate_changes(company_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_estimate_changes_asset_date_idx
        ON company_8.asset_estimate_changes(asset_id, effective_date);

        CREATE INDEX IF NOT EXISTS company_8_asset_estimate_changes_status_idx
        ON company_8.asset_estimate_changes(status);

        CREATE INDEX IF NOT EXISTS company_8_asset_estimate_changes_posted_journal_id_idx
        ON company_8.asset_estimate_changes(posted_journal_id);

        -- FKs
        DO $fk_asset_estimate_changes_asset$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_estimate_changes_asset' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_estimate_changes
            ADD CONSTRAINT fk_asset_estimate_changes_asset
            FOREIGN KEY (asset_id) REFERENCES %I.assets(id)',
            'company_8', 'company_8'
            );
        END IF;
        END
        $fk_asset_estimate_changes_asset$;

        DO $fk_asset_estimate_changes_journal$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_estimate_changes_journal' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_estimate_changes
            ADD CONSTRAINT fk_asset_estimate_changes_journal
            FOREIGN KEY (posted_journal_id) REFERENCES %I.journal(id)',
            'company_8', 'company_8'
            );
        END IF;
        END
        $fk_asset_estimate_changes_journal$;

        -- ==================================================
        -- ASSET REVALUATIONS (IAS 16)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.asset_revaluations (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            asset_id INT NOT NULL,

            revaluation_date DATE NOT NULL,

            -- before (snapshot)
            carrying_amount_before NUMERIC(18,2) NOT NULL DEFAULT 0,
            cost_before NUMERIC(18,2) NULL,
            accum_dep_before NUMERIC(18,2) NULL,

            -- after (snapshot)
            fair_value NUMERIC(18,2) NOT NULL DEFAULT 0,
            carrying_amount_after NUMERIC(18,2) NOT NULL DEFAULT 0,
            cost_after NUMERIC(18,2) NULL,
            accum_dep_after NUMERIC(18,2) NULL,

            -- effect
            revaluation_change NUMERIC(18,2) NOT NULL DEFAULT 0, -- after - before

            -- allocation
            oci_revaluation_surplus NUMERIC(18,2) NOT NULL DEFAULT 0, -- to equity reserve (OCI)
            pnl_revaluation_gain NUMERIC(18,2) NOT NULL DEFAULT 0,    -- gain to P/L (rare, reversal)
            pnl_revaluation_loss NUMERIC(18,2) NOT NULL DEFAULT 0,    -- deficit to P/L (unless reserve exists)

            method TEXT NOT NULL DEFAULT 'gross_restated', -- gross_restated|net_restated

            reason TEXT NULL,
            notes TEXT NULL,

            status TEXT NOT NULL DEFAULT 'draft', -- draft|posted|reversed|void
            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,

            created_by INT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE company_8.asset_revaluations
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        DO $tr_asset_depreciation_company_consistency$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_trigger t
                JOIN pg_class c ON c.oid=t.tgrelid
                JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='company_8'
                AND t.tgname='tr_asset_depreciation_assert_company'
            ) THEN
                EXECUTE format(
                    'CREATE TRIGGER tr_asset_depreciation_assert_company
                    BEFORE INSERT OR UPDATE OF company_id,asset_id
                    ON %I.asset_depreciation
                    FOR EACH ROW
                    EXECUTE PROCEDURE %I.fn_assert_asset_company()',
                    'company_8',
                    'company_8'
                );
            END IF;
        END
        $tr_asset_depreciation_company_consistency$;

        -- Checks
        DO $ck_asset_revaluations_valid$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_asset_revaluations_valid'
            AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_revaluations
            ADD CONSTRAINT ck_asset_revaluations_valid
            CHECK (
                revaluation_date IS NOT NULL
                AND carrying_amount_before >= 0
                AND fair_value >= 0
                AND carrying_amount_after >= 0
                AND oci_revaluation_surplus >= 0
                AND pnl_revaluation_gain >= 0
                AND pnl_revaluation_loss >= 0
                AND status IN (''draft'',''posted'',''reversed'',''void'')
                AND method IN (''gross_restated'',''net_restated'')
            )',
            'company_8'
            );
        END IF;
        END
        $ck_asset_revaluations_valid$;

        -- Anti-duplicate: one revaluation per asset per date (non-void)
        DO $uq_asset_revaluations_asset_date$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='company_8' AND indexname='uq_asset_revaluations_asset_date'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_asset_revaluations_asset_date
            ON %I.asset_revaluations(asset_id, revaluation_date)
            WHERE status <> ''void''',
            'company_8'
            );
        END IF;
        END
        $uq_asset_revaluations_asset_date$;

        -- RB + UOP fields on assets
        DO $add_assets_dep_method_fields$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='assets' AND column_name='rb_rate_percent'
        ) THEN
            EXECUTE format('ALTER TABLE %I.assets ADD COLUMN rb_rate_percent NUMERIC(8,4) NULL', 'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='assets' AND column_name='uop_total_units'
        ) THEN
            EXECUTE format('ALTER TABLE %I.assets ADD COLUMN uop_total_units NUMERIC(18,4) NULL', 'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='assets' AND column_name='uop_unit_name'
        ) THEN
            EXECUTE format('ALTER TABLE %I.assets ADD COLUMN uop_unit_name TEXT NULL', 'company_8');
        END IF;
        END
        $add_assets_dep_method_fields$;
                
        -- Indexes
        CREATE INDEX IF NOT EXISTS company_8_asset_revaluations_company_idx
        ON company_8.asset_revaluations(company_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_revaluations_asset_date_idx
        ON company_8.asset_revaluations(asset_id, revaluation_date);

        CREATE INDEX IF NOT EXISTS company_8_asset_revaluations_status_idx
        ON company_8.asset_revaluations(status);

        CREATE INDEX IF NOT EXISTS company_8_asset_revaluations_posted_journal_id_idx
        ON company_8.asset_revaluations(posted_journal_id);

        -- FKs
        DO $fk_asset_revaluations_asset$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_revaluations_asset' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_revaluations
            ADD CONSTRAINT fk_asset_revaluations_asset
            FOREIGN KEY (asset_id) REFERENCES %I.assets(id)',
            'company_8', 'company_8'
            );
        END IF;
        END
        $fk_asset_revaluations_asset$;

        DO $fk_asset_revaluations_journal$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_revaluations_journal' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_revaluations
            ADD CONSTRAINT fk_asset_revaluations_journal
            FOREIGN KEY (posted_journal_id) REFERENCES %I.journal(id)',
            'company_8', 'company_8'
            );
        END IF;
        END
        $fk_asset_revaluations_journal$;

        -- ==================================================
        -- ASSET DISPOSALS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.asset_disposals (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            asset_id INT NOT NULL,

            disposal_date DATE NOT NULL,
            proceeds NUMERIC(18,2) NOT NULL DEFAULT 0,

            carrying_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            gain_loss NUMERIC(18,2) NOT NULL DEFAULT 0,  -- proceeds - carrying_amount

            status TEXT NOT NULL DEFAULT 'draft',  -- draft|posted|reversed|void
            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,

            reference TEXT NULL,
            notes TEXT NULL,

            created_by INT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE company_8.asset_disposals
        ADD COLUMN IF NOT EXISTS approved_by INT NULL,
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS approval_note TEXT NULL;

        ALTER TABLE company_8.asset_disposals
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        ALTER TABLE company_8.asset_disposals
        ADD COLUMN IF NOT EXISTS bank_account_code TEXT NULL;

        ALTER TABLE company_8.assets
        ADD COLUMN IF NOT EXISTS impairment_loss_account_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS impairment_reversal_account_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS held_for_sale_account_code TEXT NULL;

        ALTER TABLE company_8.asset_disposals
        ADD COLUMN IF NOT EXISTS bank_account_id INT NULL;

        ALTER TABLE company_8.asset_disposals
        ADD COLUMN IF NOT EXISTS cost_removed NUMERIC(18,2) NULL,
        ADD COLUMN IF NOT EXISTS accum_dep_removed NUMERIC(18,2) NULL,
        ADD COLUMN IF NOT EXISTS impairment_removed NUMERIC(18,2) NULL;

        CREATE INDEX IF NOT EXISTS company_8_asset_disposals_bank_account_id_idx
        ON company_8.asset_disposals(bank_account_id);

        DO $fk_asset_disp_asset$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_disp_asset' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_disposals
            ADD CONSTRAINT fk_asset_disp_asset
            FOREIGN KEY (asset_id) REFERENCES %I.assets(id)',
            'company_8', 'company_8'
            );
        END IF;
        END $fk_asset_disp_asset$;

        DO $fk_asset_disp_journal$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_disp_journal' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_disposals
            ADD CONSTRAINT fk_asset_disp_journal
            FOREIGN KEY (posted_journal_id) REFERENCES %I.journal(id)',
            'company_8', 'company_8'
            );
        END IF;
        END $fk_asset_disp_journal$;

        -- One disposal per asset (non-void)
        DO $uq_asset_disp_one_per_asset$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='company_8' AND indexname='uq_asset_disp_one_per_asset'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_asset_disp_one_per_asset
            ON %I.asset_disposals(asset_id)
            WHERE status <> ''void''',
            'company_8'
            );
        END IF;
        END $uq_asset_disp_one_per_asset$;

        DO $ck_asset_disp_valid$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_asset_disp_valid' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_disposals
            ADD CONSTRAINT ck_asset_disp_valid
            CHECK (
                proceeds >= 0
                AND carrying_amount >= 0
                AND status IN (''draft'',''posted'',''reversed'',''void'')
            )',
            'company_8'
            );
        END IF;
        END $ck_asset_disp_valid$;

        CREATE INDEX IF NOT EXISTS company_8_asset_disp_company_idx
        ON company_8.asset_disposals(company_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_disp_date_idx
        ON company_8.asset_disposals(disposal_date);

        CREATE INDEX IF NOT EXISTS company_8_asset_disp_status_idx
        ON company_8.asset_disposals(status);

        -- ============================================================
        -- IAS 36 CASH-GENERATING UNITS
        -- ============================================================

        CREATE TABLE IF NOT EXISTS company_8.asset_cgus (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            cgu_code TEXT NOT NULL,
            cgu_name TEXT NOT NULL,
            description TEXT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            source_company_id INT NULL,
            engagement_company_id INT NULL,
            engagement_id INT NULL,
            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_asset_cgus_code_uq
        ON company_8.asset_cgus(company_id, LOWER(cgu_code))
        WHERE status <> 'inactive';

        CREATE INDEX IF NOT EXISTS company_8_asset_cgus_company_idx
        ON company_8.asset_cgus(company_id, status);

        DO $ck_asset_cgus_status$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='ck_asset_cgus_status' AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.asset_cgus
                    ADD CONSTRAINT ck_asset_cgus_status
                    CHECK (status IN (''active'',''inactive''))',
                    'company_8'
                );
            END IF;
        END
        $ck_asset_cgus_status$;


        -- ============================================================
        -- CGU MEMBERS
        -- ============================================================

        CREATE TABLE IF NOT EXISTS company_8.asset_cgu_members (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            cgu_id INT NOT NULL,
            asset_id INT NOT NULL,
            allocation_basis TEXT NOT NULL DEFAULT 'carrying_amount',
            allocation_weight NUMERIC(18,6) NULL,
            included_from DATE NULL,
            included_to DATE NULL,
            notes TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_asset_cgu_members_active_uq
        ON company_8.asset_cgu_members(company_id, cgu_id, asset_id)
        WHERE included_to IS NULL;

        CREATE INDEX IF NOT EXISTS company_8_asset_cgu_members_cgu_idx
        ON company_8.asset_cgu_members(company_id, cgu_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_cgu_members_asset_idx
        ON company_8.asset_cgu_members(company_id, asset_id);

        DO $ck_asset_cgu_members_basis$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='ck_asset_cgu_members_basis' AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.asset_cgu_members
                    ADD CONSTRAINT ck_asset_cgu_members_basis
                    CHECK (
                        allocation_basis IN (''carrying_amount'',''equal'',''manual_weight'')
                        AND (allocation_basis <> ''manual_weight'' OR allocation_weight > 0)
                    )',
                    'company_8'
                );
            END IF;
        END
        $ck_asset_cgu_members_basis$;

        DO $fk_asset_cgu_members_cgu$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_asset_cgu_members_cgu' AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.asset_cgu_members
                    ADD CONSTRAINT fk_asset_cgu_members_cgu
                    FOREIGN KEY (cgu_id) REFERENCES %I.asset_cgus(id) ON DELETE CASCADE',
                    'company_8', 'company_8'
                );
            END IF;
        END
        $fk_asset_cgu_members_cgu$;

        DO $fk_asset_cgu_members_asset$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_asset_cgu_members_asset' AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.asset_cgu_members
                    ADD CONSTRAINT fk_asset_cgu_members_asset
                    FOREIGN KEY (asset_id) REFERENCES %I.assets(id)',
                    'company_8', 'company_8'
                );
            END IF;
        END
        $fk_asset_cgu_members_asset$;


        -- ============================================================
        -- IMPAIRMENTS
        -- ============================================================

        CREATE TABLE IF NOT EXISTS company_8.asset_impairments (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            target_type TEXT NOT NULL DEFAULT 'asset',
            asset_id INT NULL,
            cgu_id INT NULL,
            impairment_date DATE NOT NULL,
            event_type TEXT NOT NULL DEFAULT 'impairment_loss',
            carrying_amount_before NUMERIC(18,2) NOT NULL,
            recoverable_amount NUMERIC(18,2) NOT NULL,
            impairment_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            reversal_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            recoverable_basis TEXT NULL,
            fair_value_less_costs NUMERIC(18,2) NULL,
            value_in_use NUMERIC(18,2) NULL,
            discount_rate NUMERIC(9,6) NULL,
            growth_rate NUMERIC(9,6) NULL,
            cash_flow_period_months INT NULL,
            allocation_basis TEXT NOT NULL DEFAULT 'carrying_amount',
            reason TEXT NULL,
            notes TEXT NULL,
            status TEXT NOT NULL DEFAULT 'draft',
            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,
            source_company_id INT NULL,
            engagement_company_id INT NULL,
            engagement_id INT NULL,
            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.asset_impairments
        ALTER COLUMN asset_id DROP NOT NULL;

        ALTER TABLE company_8.asset_impairments
        ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'asset',
        ADD COLUMN IF NOT EXISTS cgu_id INT NULL,
        ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'impairment_loss',
        ADD COLUMN IF NOT EXISTS recoverable_basis TEXT NULL,
        ADD COLUMN IF NOT EXISTS fair_value_less_costs NUMERIC(18,2) NULL,
        ADD COLUMN IF NOT EXISTS value_in_use NUMERIC(18,2) NULL,
        ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(9,6) NULL,
        ADD COLUMN IF NOT EXISTS growth_rate NUMERIC(9,6) NULL,
        ADD COLUMN IF NOT EXISTS cash_flow_period_months INT NULL,
        ADD COLUMN IF NOT EXISTS allocation_basis TEXT NOT NULL DEFAULT 'carrying_amount',
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

        DO $drop_old_impairment_checks$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='ck_asset_impairments_valid' AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.asset_impairments DROP CONSTRAINT ck_asset_impairments_valid',
                    'company_8'
                );
            END IF;

            IF EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='ck_asset_impairments_math' AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.asset_impairments DROP CONSTRAINT ck_asset_impairments_math',
                    'company_8'
                );
            END IF;
        END
        $drop_old_impairment_checks$;

        DO $ck_asset_impairments_valid_v2$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='ck_asset_impairments_valid_v2' AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.asset_impairments
                    ADD CONSTRAINT ck_asset_impairments_valid_v2
                    CHECK (
                        target_type IN (''asset'',''cgu'')
                        AND event_type IN (''impairment_loss'',''impairment_reversal'')
                        AND (
                            (target_type=''asset'' AND asset_id IS NOT NULL AND cgu_id IS NULL)
                            OR
                            (target_type=''cgu'' AND cgu_id IS NOT NULL AND asset_id IS NULL)
                        )
                        AND carrying_amount_before >= 0
                        AND recoverable_amount >= 0
                        AND impairment_amount >= 0
                        AND reversal_amount >= 0
                        AND NOT (impairment_amount > 0 AND reversal_amount > 0)
                        AND allocation_basis IN (''carrying_amount'',''equal'',''manual_weight'')
                        AND status IN (''draft'',''pending_review'',''posted'',''reversed'',''void'')
                    )',
                    'company_8'
                );
            END IF;
        END
        $ck_asset_impairments_valid_v2$;

        DO $ck_asset_impairments_math_v2$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='ck_asset_impairments_math_v2' AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.asset_impairments
                    ADD CONSTRAINT ck_asset_impairments_math_v2
                    CHECK (
                        impairment_amount <= carrying_amount_before + 0.02
                        AND (
                            event_type=''impairment_reversal''
                            OR impairment_amount <= GREATEST(carrying_amount_before-recoverable_amount,0)+0.05
                        )
                    )',
                    'company_8'
                );
            END IF;
        END
        $ck_asset_impairments_math_v2$;

        DROP INDEX IF EXISTS company_8.uq_asset_impairments_asset_date;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_asset_impairments_asset_date_uq
        ON company_8.asset_impairments(company_id, asset_id, impairment_date, event_type)
        WHERE target_type='asset' AND status <> 'void';

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_asset_impairments_cgu_date_uq
        ON company_8.asset_impairments(company_id, cgu_id, impairment_date, event_type)
        WHERE target_type='cgu' AND status <> 'void';

        CREATE INDEX IF NOT EXISTS company_8_asset_impairments_target_idx
        ON company_8.asset_impairments(company_id, target_type, asset_id, cgu_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_impairments_status_idx
        ON company_8.asset_impairments(company_id, status);

        CREATE INDEX IF NOT EXISTS company_8_asset_impairments_journal_idx
        ON company_8.asset_impairments(posted_journal_id);

        DO $fk_asset_impairments_asset_v2$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_asset_impairments_asset_v2' AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.asset_impairments
                    ADD CONSTRAINT fk_asset_impairments_asset_v2
                    FOREIGN KEY (asset_id) REFERENCES %I.assets(id)',
                    'company_8', 'company_8'
                );
            END IF;
        END
        $fk_asset_impairments_asset_v2$;

        DO $fk_asset_impairments_cgu$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_asset_impairments_cgu' AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.asset_impairments
                    ADD CONSTRAINT fk_asset_impairments_cgu
                    FOREIGN KEY (cgu_id) REFERENCES %I.asset_cgus(id)',
                    'company_8', 'company_8'
                );
            END IF;
        END
        $fk_asset_impairments_cgu$;


        -- ============================================================
        -- IMPAIRMENT ALLOCATIONS
        -- ============================================================

        CREATE TABLE IF NOT EXISTS company_8.asset_impairment_allocations (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            impairment_id INT NOT NULL,
            cgu_id INT NULL,
            asset_id INT NOT NULL,
            carrying_amount_before NUMERIC(18,2) NOT NULL,
            allocation_weight NUMERIC(18,8) NOT NULL DEFAULT 0,
            allocated_impairment_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            allocated_reversal_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            carrying_amount_after NUMERIC(18,2) NOT NULL,
            loss_account_code TEXT NULL,
            contra_asset_account_code TEXT NULL,
            reversal_account_code TEXT NULL,
            notes TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_asset_impairment_allocations_uq
        ON company_8.asset_impairment_allocations(impairment_id, asset_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_impairment_allocations_impairment_idx
        ON company_8.asset_impairment_allocations(company_id, impairment_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_impairment_allocations_asset_idx
        ON company_8.asset_impairment_allocations(company_id, asset_id);

        DO $fk_asset_impairment_allocations_impairment$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_asset_impairment_allocations_impairment'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.asset_impairment_allocations
                    ADD CONSTRAINT fk_asset_impairment_allocations_impairment
                    FOREIGN KEY (impairment_id)
                    REFERENCES %I.asset_impairments(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8'
                );
            END IF;
        END
        $fk_asset_impairment_allocations_impairment$;

        DO $fk_asset_impairment_allocations_asset$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_asset_impairment_allocations_asset'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.asset_impairment_allocations
                    ADD CONSTRAINT fk_asset_impairment_allocations_asset
                    FOREIGN KEY (asset_id) REFERENCES %I.assets(id)',
                    'company_8', 'company_8'
                );
            END IF;
        END
        $fk_asset_impairment_allocations_asset$;

        -- ==================================================
        -- ASSETS HELD FOR SALE (IFRS 5)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.asset_held_for_sale (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            asset_id INT NOT NULL,

            classification_date DATE NOT NULL,

            carrying_amount NUMERIC(18,2) NOT NULL,
            fair_value_less_costs NUMERIC(18,2) NOT NULL,

            impairment_on_classification NUMERIC(18,2) NOT NULL DEFAULT 0,

            status TEXT NOT NULL DEFAULT 'active', -- active|sold|reversed

            disposal_date DATE NULL,
            proceeds NUMERIC(18,2) NULL,

            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,

            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE company_8.asset_held_for_sale
        ADD COLUMN IF NOT EXISTS cost_transferred NUMERIC(18,2) NULL,
        ADD COLUMN IF NOT EXISTS accum_dep_transferred NUMERIC(18,2) NULL,
        ADD COLUMN IF NOT EXISTS impairment_transferred NUMERIC(18,2) NULL;

        -- ==================================================
        -- IFRS 5: Constraints / Indexes / FK
        -- ==================================================

        -- Checks
        DO $ck_asset_hfs_valid$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_asset_hfs_valid'
            AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_held_for_sale
            ADD CONSTRAINT ck_asset_hfs_valid
            CHECK (
                classification_date IS NOT NULL
                AND carrying_amount >= 0
                AND fair_value_less_costs >= 0
                AND impairment_on_classification >= 0
                AND status IN (''active'',''sold'',''reversed'')
                AND (disposal_date IS NULL OR disposal_date >= classification_date)
                AND (proceeds IS NULL OR proceeds >= 0)
            )',
            'company_8'
            );
        END IF;
        END
        $ck_asset_hfs_valid$;

        -- One ACTIVE HFS per asset (you generally want this)
        DO $uq_asset_hfs_one_active$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='company_8' AND indexname='uq_asset_hfs_one_active_per_asset'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_asset_hfs_one_active_per_asset
            ON %I.asset_held_for_sale(asset_id)
            WHERE status=''active''',
            'company_8'
            );
        END IF;
        END
        $uq_asset_hfs_one_active$;

        -- Anti-duplicate: same asset cannot have two non-reversed rows on same classification_date
        DO $uq_asset_hfs_asset_classification_date$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='company_8' AND indexname='uq_asset_hfs_asset_classification_date'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_asset_hfs_asset_classification_date
            ON %I.asset_held_for_sale(asset_id, classification_date)
            WHERE status <> ''reversed''',
            'company_8'
            );
        END IF;
        END
        $uq_asset_hfs_asset_classification_date$;

        -- Indexes
        CREATE INDEX IF NOT EXISTS company_8_asset_hfs_company_idx
        ON company_8.asset_held_for_sale(company_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_hfs_asset_date_idx
        ON company_8.asset_held_for_sale(asset_id, classification_date);

        CREATE INDEX IF NOT EXISTS company_8_asset_hfs_status_idx
        ON company_8.asset_held_for_sale(status);

        CREATE INDEX IF NOT EXISTS company_8_asset_hfs_posted_journal_id_idx
        ON company_8.asset_held_for_sale(posted_journal_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_hfs_disposal_date_idx
        ON company_8.asset_held_for_sale(disposal_date);

        -- FK -> assets (safe add)
        DO $fk_asset_hfs_asset$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_hfs_asset'
            AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_held_for_sale
            ADD CONSTRAINT fk_asset_hfs_asset
            FOREIGN KEY (asset_id) REFERENCES %I.assets(id)',
            'company_8', 'company_8'
            );
        END IF;
        END
        $fk_asset_hfs_asset$;

        -- ==================================================
        -- ASSET TRANSFERS (generic reclass / location / cost centre)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.asset_transfers (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            asset_id INT NOT NULL,

            transfer_date DATE NOT NULL,

            from_asset_class TEXT NULL,
            to_asset_class   TEXT NULL,

            from_category TEXT NULL,
            to_category   TEXT NULL,

            from_location TEXT NULL,
            to_location   TEXT NULL,

            from_cost_centre TEXT NULL,
            to_cost_centre   TEXT NULL,

            reason TEXT NULL,
            notes  TEXT NULL,

            status TEXT NOT NULL DEFAULT 'posted', -- posted|void (usually no draft needed)
            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,

            created_by INT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );


        -- Checks
        DO $ck_asset_transfers_valid$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_asset_transfers_valid' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_transfers
            ADD CONSTRAINT ck_asset_transfers_valid
            CHECK (
                transfer_date IS NOT NULL
                AND status IN (''posted'',''void'')
            )',
            'company_8'
            );
        END IF;
        END
        $ck_asset_transfers_valid$;

        -- Anti-duplicate (optional): prevent same-day duplicate of same “to” state
        DO $uq_asset_transfers_asset_date$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='company_8' AND indexname='uq_asset_transfers_asset_date'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_asset_transfers_asset_date
            ON %I.asset_transfers(asset_id, transfer_date)
            WHERE status <> ''void''',
            'company_8'
            );
        END IF;
        END
        $uq_asset_transfers_asset_date$;

        -- Indexes
        CREATE INDEX IF NOT EXISTS company_8_asset_transfers_company_idx
        ON company_8.asset_transfers(company_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_transfers_asset_idx
        ON company_8.asset_transfers(asset_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_transfers_transfer_date_idx
        ON company_8.asset_transfers(transfer_date);

        CREATE INDEX IF NOT EXISTS company_8_asset_transfers_posted_journal_id_idx
        ON company_8.asset_transfers(posted_journal_id);

        -- FKs
        DO $fk_asset_transfers_asset$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_transfers_asset' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_transfers
            ADD CONSTRAINT fk_asset_transfers_asset
            FOREIGN KEY (asset_id) REFERENCES %I.assets(id)',
            'company_8','company_8'
            );
        END IF;
        END
        $fk_asset_transfers_asset$;

        DO $fk_asset_transfers_journal$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_transfers_journal' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_transfers
            ADD CONSTRAINT fk_asset_transfers_journal
            FOREIGN KEY (posted_journal_id) REFERENCES %I.journal(id)',
            'company_8','company_8'
            );
        END IF;
        END
        $fk_asset_transfers_journal$;

        -- ==================================================
        -- ASSET STANDARD TRANSFERS (IAS 16 ↔ IAS 40, IAS 16 → IFRS 5, etc.)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.asset_standard_transfers (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            asset_id INT NOT NULL,

            transfer_date DATE NOT NULL,

            from_standard TEXT NOT NULL, -- IAS16|IAS40|IFRS5|IFRS16|IAS2|Other
            to_standard   TEXT NOT NULL,

            -- carrying amount at transfer date (before)
            carrying_amount_before NUMERIC(18,2) NOT NULL DEFAULT 0,

            -- fair value optional (needed for some IAS 40 transfers)
            fair_value NUMERIC(18,2) NULL,

            -- remeasurement / difference recognised (if applicable)
            transfer_adjustment NUMERIC(18,2) NOT NULL DEFAULT 0,

            -- allocation (if any part goes OCI vs P/L)
            oci_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            pnl_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            reason TEXT NULL,
            notes  TEXT NULL,

            status TEXT NOT NULL DEFAULT 'draft', -- draft|posted|reversed|void
            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,

            created_by INT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Checks
        DO $ck_asset_standard_transfers_valid$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_asset_standard_transfers_valid' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_standard_transfers
            ADD CONSTRAINT ck_asset_standard_transfers_valid
            CHECK (
                transfer_date IS NOT NULL
                AND carrying_amount_before >= 0
                AND transfer_adjustment >= -999999999999.99 -- allow negative/positive
                AND oci_amount >= 0
                AND pnl_amount >= 0
                AND status IN (''draft'',''posted'',''reversed'',''void'')
            )',
            'company_8'
            );
        END IF;
        END
        $ck_asset_standard_transfers_valid$;

        -- Anti-duplicate: one non-void transfer per asset per date per destination standard
        DO $uq_asset_standard_transfers_asset_date_to$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='company_8' AND indexname='uq_asset_standard_transfers_asset_date_to'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_asset_standard_transfers_asset_date_to
            ON %I.asset_standard_transfers(asset_id, transfer_date, to_standard)
            WHERE status <> ''void''',
            'company_8'
            );
        END IF;
        END
        $uq_asset_standard_transfers_asset_date_to$;

        -- Indexes
        CREATE INDEX IF NOT EXISTS company_8_asset_std_transfers_company_idx
        ON company_8.asset_standard_transfers(company_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_std_transfers_asset_date_idx
        ON company_8.asset_standard_transfers(asset_id, transfer_date);

        CREATE INDEX IF NOT EXISTS company_8_asset_std_transfers_status_idx
        ON company_8.asset_standard_transfers(status);

        CREATE INDEX IF NOT EXISTS company_8_asset_std_transfers_posted_journal_id_idx
        ON company_8.asset_standard_transfers(posted_journal_id);

        -- FKs
        DO $fk_asset_standard_transfers_asset$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_standard_transfers_asset' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_standard_transfers
            ADD CONSTRAINT fk_asset_standard_transfers_asset
            FOREIGN KEY (asset_id) REFERENCES %I.assets(id)',
            'company_8','company_8'
            );
        END IF;
        END
        $fk_asset_standard_transfers_asset$;

        DO $fk_asset_standard_transfers_journal$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_standard_transfers_journal' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_standard_transfers
            ADD CONSTRAINT fk_asset_standard_transfers_journal
            FOREIGN KEY (posted_journal_id) REFERENCES %I.journal(id)',
            'company_8','company_8'
            );
        END IF;
        END
        $fk_asset_standard_transfers_journal$;

        -- ==================================================
        -- ASSET REVALUATION RESERVE LEDGER (OCI equity reserve)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.asset_revaluation_reserve (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            asset_id INT NOT NULL,

            event_date DATE NOT NULL,
            event_type TEXT NOT NULL, -- revaluation|impairment|disposal_transfer|other

            -- positive = increase reserve, negative = decrease reserve
            reserve_movement NUMERIC(18,2) NOT NULL DEFAULT 0,

            -- optional snapshot after movement (helps reporting)
            reserve_balance_after NUMERIC(18,2) NULL,

            -- linkage
            revaluation_id INT NULL,    -- link to asset_revaluations
            impairment_id  INT NULL,    -- link to asset_impairments (if you net against reserve)
            disposal_id    INT NULL,    -- link to asset_disposals (transfer reserve on disposal)
            transfer_id    INT NULL,    -- link to asset_standard_transfers (if moving to IAS40 etc.)

            equity_account_code TEXT NULL, -- e.g. 3200 (OCI / revaluation surplus)

            notes TEXT NULL,

            status TEXT NOT NULL DEFAULT 'draft', -- draft|posted|reversed|void
            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,

            created_by INT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );


        -- Checks
        DO $ck_asset_reval_reserve_valid$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_asset_reval_reserve_valid' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_revaluation_reserve
            ADD CONSTRAINT ck_asset_reval_reserve_valid
            CHECK (
                event_date IS NOT NULL
                AND event_type IN (''revaluation'',''impairment'',''disposal_transfer'',''other'')
                AND status IN (''draft'',''posted'',''reversed'',''void'')
            )',
            'company_8'
            );
        END IF;
        END
        $ck_asset_reval_reserve_valid$;

        -- Anti-duplicate: prevent multiple posted rows for same linked event
        DO $uq_asset_reval_reserve_one_per_link$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='company_8' AND indexname='uq_asset_reval_reserve_one_per_link'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_asset_reval_reserve_one_per_link
            ON %I.asset_revaluation_reserve(
                asset_id,
                COALESCE(revaluation_id,0),
                COALESCE(impairment_id,0),
                COALESCE(disposal_id,0),
                COALESCE(transfer_id,0),
                event_type
            )
            WHERE status <> ''void''',
            'company_8'
            );
        END IF;
        END
        $uq_asset_reval_reserve_one_per_link$;

        -- Indexes
        CREATE INDEX IF NOT EXISTS company_8_asset_reval_reserve_company_idx
        ON company_8.asset_revaluation_reserve(company_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_reval_reserve_asset_date_idx
        ON company_8.asset_revaluation_reserve(asset_id, event_date);

        CREATE INDEX IF NOT EXISTS company_8_asset_reval_reserve_status_idx
        ON company_8.asset_revaluation_reserve(status);

        CREATE INDEX IF NOT EXISTS company_8_asset_reval_reserve_posted_journal_id_idx
        ON company_8.asset_revaluation_reserve(posted_journal_id);

        -- FKs (safe-add)
        DO $fk_asset_reval_reserve_asset$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_reval_reserve_asset' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_revaluation_reserve
            ADD CONSTRAINT fk_asset_reval_reserve_asset
            FOREIGN KEY (asset_id) REFERENCES %I.assets(id)',
            'company_8','company_8'
            );
        END IF;
        END
        $fk_asset_reval_reserve_asset$;

        DO $fk_asset_reval_reserve_journal$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_reval_reserve_journal' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_revaluation_reserve
            ADD CONSTRAINT fk_asset_reval_reserve_journal
            FOREIGN KEY (posted_journal_id) REFERENCES %I.journal(id)',
            'company_8','company_8'
            );
        END IF;
        END
        $fk_asset_reval_reserve_journal$;

        -- Optional: FK to asset_revaluations if table exists
        DO $fk_asset_reval_reserve_revaluation$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_reval_reserve_revaluation' AND n.nspname='company_8'
        ) THEN
            IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema='company_8' AND table_name='asset_revaluations'
            ) THEN
            EXECUTE format(
                'ALTER TABLE %I.asset_revaluation_reserve
                ADD CONSTRAINT fk_asset_reval_reserve_revaluation
                FOREIGN KEY (revaluation_id) REFERENCES %I.asset_revaluations(id)',
                'company_8','company_8'
            );
            END IF;
        END IF;
        END
        $fk_asset_reval_reserve_revaluation$;

        CREATE TABLE IF NOT EXISTS company_8.asset_usage (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            asset_id INT NOT NULL,

            period_start DATE NOT NULL,
            period_end   DATE NOT NULL,

            units_used NUMERIC(18,4) NOT NULL DEFAULT 0,

            notes TEXT NULL,
            status TEXT NOT NULL DEFAULT 'posted', -- posted|void (keep simple)
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- FK (safe-add)
        DO $fk_asset_usage_asset$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_usage_asset' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.asset_usage
            ADD CONSTRAINT fk_asset_usage_asset
            FOREIGN KEY (asset_id) REFERENCES %I.assets(id)',
            'company_8','company_8'
            );
        END IF;
        END
        $fk_asset_usage_asset$;

        -- unique per asset per period (non-void)
        DO $uq_asset_usage_asset_period$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='company_8' AND indexname='uq_asset_usage_asset_period'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_asset_usage_asset_period
            ON %I.asset_usage(asset_id, period_start, period_end)
            WHERE status <> ''void''',
            'company_8'
            );
        END IF;
        END
        $uq_asset_usage_asset_period$;

        CREATE INDEX IF NOT EXISTS company_8_asset_usage_asset_idx
        ON company_8.asset_usage(asset_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_usage_period_end_idx
        ON company_8.asset_usage(period_end);

        -- ==================================================
        -- ASSET DOCUMENTS / ATTACHMENTS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.asset_documents (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            asset_id INT NOT NULL,

            doc_type TEXT NOT NULL DEFAULT 'other',  -- invoice|warranty|photo|valuation|insurance|other
            file_name TEXT NOT NULL,
            mime_type TEXT NULL,
            file_size_bytes BIGINT NULL,

            -- You choose how you store it:
            -- - file_url (S3/public URL)
            -- - storage_key (S3 key)
            -- - file_path (local path)
            file_url TEXT NULL,
            storage_key TEXT NULL,
            file_path TEXT NULL,

            reference TEXT NULL,
            notes TEXT NULL,

            uploaded_by INT NULL,
            uploaded_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Add archive columns to asset_documents (safe)
        ALTER TABLE company_8.asset_documents
        ADD COLUMN IF NOT EXISTS is_archived  BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS archived_by  INT NULL;

        CREATE INDEX IF NOT EXISTS company_8_asset_documents_archived_idx
        ON company_8.asset_documents(is_archived);

        -- Checks
        DO $ck_asset_documents_valid$
        BEGIN
        IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_namespace n ON n.oid=c.connamespace
        WHERE c.conname='ck_asset_documents_valid' AND n.nspname='company_8'
        ) THEN
        EXECUTE format(
            'ALTER TABLE %I.asset_documents
            ADD CONSTRAINT ck_asset_documents_valid
            CHECK (
            doc_type IN (''invoice'',''warranty'',''photo'',''valuation'',''insurance'',''other'')
            )',
            'company_8'
        );
        END IF;
        END $ck_asset_documents_valid$;

        -- FK -> assets
        DO $fk_asset_documents_asset$
        BEGIN
        IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
        WHERE c.conname='fk_asset_documents_asset' AND n.nspname='company_8'
        ) THEN
        EXECUTE format(
            'ALTER TABLE %I.asset_documents
            ADD CONSTRAINT fk_asset_documents_asset
            FOREIGN KEY (asset_id) REFERENCES %I.assets(id)',
            'company_8','company_8'
        );
        END IF;
        END $fk_asset_documents_asset$;

        -- Indexes
        CREATE INDEX IF NOT EXISTS company_8_asset_documents_company_idx
        ON company_8.asset_documents(company_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_documents_asset_idx
        ON company_8.asset_documents(asset_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_documents_uploaded_at_idx
        ON company_8.asset_documents(uploaded_at);

      
        DO $tr_asset_documents_company_consistency$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger t
            JOIN pg_class c ON c.oid=t.tgrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='company_8' AND t.tgname='tr_asset_documents_assert_company'
        ) THEN           
        EXECUTE format(
        'CREATE TRIGGER tr_asset_documents_assert_company
        BEFORE INSERT OR UPDATE OF company_id, asset_id
        ON %I.asset_documents
        FOR EACH ROW
        EXECUTE PROCEDURE %I.fn_assert_asset_company()',
        'company_8','company_8'
        );
        END IF;
        END $tr_asset_documents_company_consistency$;

        -- ==================================================
        -- ASSET VERIFICATIONS / STOCKTAKE
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.asset_verifications (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            asset_id INT NOT NULL,

            verification_date DATE NOT NULL,
            status TEXT NOT NULL DEFAULT 'found',   -- found|missing|damaged|disposed_confirmed
            location TEXT NULL,
            custodian TEXT NULL,

            notes TEXT NULL,
            verified_by INT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Add archive columns to asset_verifications (safe)
        ALTER TABLE company_8.asset_verifications
        ADD COLUMN IF NOT EXISTS is_archived  BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS archived_by  INT NULL;

        CREATE INDEX IF NOT EXISTS company_8_asset_verifications_archived_idx
        ON company_8.asset_verifications(is_archived);

        -- If you created the table with a CHECK, update it to allow 'void'
        DO $fix_ck_asset_verifications_valid$
        BEGIN
        IF EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_asset_verifications_valid' AND n.nspname='company_8'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_verifications DROP CONSTRAINT ck_asset_verifications_valid', 'company_8');
        END IF;

        EXECUTE format(
            'ALTER TABLE %I.asset_verifications
            ADD CONSTRAINT ck_asset_verifications_valid
            CHECK (status IN (''found'',''missing'',''damaged'',''disposed_confirmed'',''void''))',
            'company_8'
        );
        END $fix_ck_asset_verifications_valid$;

        DO $fk_asset_verifications_asset$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_verifications_asset' AND n.nspname='company_8'
        ) THEN
        EXECUTE format(
            'ALTER TABLE %I.asset_verifications
            ADD CONSTRAINT fk_asset_verifications_asset
            FOREIGN KEY (asset_id) REFERENCES %I.assets(id)',
            'company_8','company_8'
        );
        END IF;
        END $fk_asset_verifications_asset$;

        CREATE INDEX IF NOT EXISTS company_8_asset_verifications_company_idx
        ON company_8.asset_verifications(company_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_verifications_asset_date_idx
        ON company_8.asset_verifications(asset_id, verification_date);

        DO $tr_asset_verifications_company_consistency$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger t
            JOIN pg_class c ON c.oid=t.tgrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='company_8' AND t.tgname='tr_asset_verifications_assert_company'
        ) THEN
        EXECUTE format(
        'CREATE TRIGGER tr_asset_verifications_assert_company
        BEFORE INSERT OR UPDATE OF company_id, asset_id
        ON %I.asset_verifications
        FOR EACH ROW
        EXECUTE PROCEDURE %I.fn_assert_asset_company()',
        'company_8','company_8'
        );
        END IF;
        END $tr_asset_verifications_company_consistency$;

        -- ============================
        -- UOP USAGE (period units)
        -- Put this in EACH tenant schema: company_8.asset_usage
        -- ============================

        CREATE TABLE IF NOT EXISTS company_8.asset_usage (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            asset_id   INT NOT NULL,

            period_start DATE NOT NULL,
            period_end   DATE NOT NULL,

            units_used NUMERIC(18,4) NOT NULL DEFAULT 0,

            notes  TEXT NULL,
            status TEXT NOT NULL DEFAULT 'posted', -- posted|void
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Checks
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname = 'ck_asset_usage_valid' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format($sql$
            ALTER TABLE %I.asset_usage
            ADD CONSTRAINT ck_asset_usage_valid
            CHECK (
                period_end >= period_start
                AND units_used >= 0
                AND status IN ('posted','void')
            )
            $sql$, 'company_8');
        END IF;
        END $$;

        -- FK -> assets
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_usage_asset' AND n.nspname='company_8'
        ) THEN
            EXECUTE format($sql$
            ALTER TABLE %I.asset_usage
            ADD CONSTRAINT fk_asset_usage_asset
            FOREIGN KEY (asset_id) REFERENCES %I.assets(id)
            $sql$, 'company_8', 'company_8');
        END IF;
        END $$;

        -- One row per asset per period (non-void)
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'company_8' AND indexname='uq_asset_usage_asset_period'
        ) THEN
            EXECUTE format($sql$
            CREATE UNIQUE INDEX uq_asset_usage_asset_period
            ON %I.asset_usage(asset_id, period_start, period_end)
            WHERE status <> 'void'
            $sql$, 'company_8');
        END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS company_8_asset_usage_asset_idx
        ON company_8.asset_usage(asset_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_usage_period_end_idx
        ON company_8.asset_usage(period_end);

        -- Optional: company consistency trigger (ONLY if you already have fn_assert_asset_company() in the tenant schema)
        DO $$
        BEGIN
        IF EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='company_8' AND p.proname='fn_assert_asset_company'
        )
        AND NOT EXISTS (
            SELECT 1
            FROM pg_trigger t
            JOIN pg_class c ON c.oid=t.tgrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='company_8' AND t.tgname='tr_asset_usage_assert_company'
        ) THEN
            EXECUTE format($sql$
            CREATE TRIGGER tr_asset_usage_assert_company
            BEFORE INSERT OR UPDATE OF company_id, asset_id
            ON %I.asset_usage
            FOR EACH ROW
            EXECUTE PROCEDURE %I.fn_assert_asset_company()
            $sql$, 'company_8', 'company_8');
        END IF;
        END $$;

        -- tenant schema: company_8
        CREATE TABLE IF NOT EXISTS company_8.asset_subsequent_measurements (
            id BIGSERIAL PRIMARY KEY,
            company_id BIGINT NOT NULL,
            asset_id BIGINT NOT NULL,

            event_date date NOT NULL,

            -- types: add_cost | change_estimate
            event_type text NOT NULL,

            -- for add_cost (journaled)
            amount numeric(18,2) DEFAULT 0,
            debit_account_code text NULL,  -- PPE / asset account
            credit_account_code text NULL, -- bank/creditor/grni/etc

            -- for change_estimate (no journal)
            useful_life_months int NULL,
            residual_value numeric(18,2) NULL,
            depreciation_method text NULL,

            notes text NULL,

            status text NOT NULL DEFAULT 'draft',  -- draft|pending_review|posted|void
            posted_journal_id bigint NULL,
            posted_at timestamptz NULL,

            approval_id bigint NULL,
            approved_by bigint NULL,
            approved_at timestamptz NULL,
            approval_note text NULL,

            created_at timestamptz NOT NULL DEFAULT now(),
            created_by bigint NULL,
            updated_at timestamptz NULL
        );

        ALTER TABLE company_8.asset_subsequent_measurements
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'company_8'
            AND table_name   = 'asset_subsequent_measurements'
            AND column_name  = 'meta_json'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_subsequent_measurements ADD COLUMN meta_json JSONB NULL', 'company_8');
        END IF;
        END $$;
        -- -----------------------------
        -- Indexes
        -- -----------------------------
        CREATE INDEX IF NOT EXISTS company_8_asm_company_asset_date_idx
        ON company_8.asset_subsequent_measurements(company_id, asset_id, event_date);

        CREATE INDEX IF NOT EXISTS company_8_asm_company_status_idx
        ON company_8.asset_subsequent_measurements(company_id, status);

        CREATE INDEX IF NOT EXISTS company_8_asm_asset_id_idx
        ON company_8.asset_subsequent_measurements(asset_id);

        CREATE INDEX IF NOT EXISTS company_8_asm_event_date_idx
        ON company_8.asset_subsequent_measurements(event_date);

        CREATE INDEX IF NOT EXISTS company_8_asm_estimate_lookup_idx
        ON company_8.asset_subsequent_measurements(
            asset_id,
            event_date
        )
        WHERE event_type='change_estimate'
        AND status='posted';

        CREATE INDEX IF NOT EXISTS company_8_asm_meta_idx
        ON company_8.asset_subsequent_measurements
        USING gin (meta_json);

        -- -----------------------------
        -- CHECK constraint: validity + shape rules
        -- -----------------------------

        DO $$
        BEGIN
        IF EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_asset_subseq_measure_valid'
            AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I.asset_subsequent_measurements
                DROP CONSTRAINT ck_asset_subseq_measure_valid',
                'company_8'
            );
        END IF;
        END $$;

        -- 2) Replace constraint safely (upgrade-friendly)
        DO $$
        BEGIN
        -- 1) Drop old constraint if it exists (so updates actually apply)
        IF EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'ck_asset_subseq_measure_valid'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_subsequent_measurements DROP CONSTRAINT ck_asset_subseq_measure_valid', 'company_8');
        END IF;

        -- 2) Add updated constraint
        EXECUTE format($sql$
            ALTER TABLE %I.asset_subsequent_measurements
            ADD CONSTRAINT ck_asset_subseq_measure_valid
            CHECK (
            -- enums
            event_type IN (
                'add_cost',
                'change_estimate',
                'held_for_sale_classify',
                'held_for_sale_unclassify',
                'impairment_loss',
                'impairment_reversal',
                'revaluation',
                'transfer_ppe_to_ip',
                'transfer_ip_to_ppe'
            )
            AND status IN (
                'draft',
                'pending_review',
                'posted',
                'reversed',
                'void'
            )

            -- posted fields must make sense for JOURNALED event types
            AND (
                status NOT IN ('posted', 'reversed')
                OR event_type = 'change_estimate'
                OR (
                    posted_journal_id IS NOT NULL
                    AND posted_at IS NOT NULL
                )
            )

            AND (
                status IN ('draft','void')
                OR event_type<>'add_cost'
                OR (
                    COALESCE(amount,0)>0
                    AND NULLIF(TRIM(debit_account_code),'') IS NOT NULL
                    AND NULLIF(TRIM(credit_account_code),'') IS NOT NULL
                )
            )

            AND (
                status IN ('draft','void')
                OR event_type<>'change_estimate'
                OR (
                    useful_life_months IS NOT NULL
                    OR residual_value IS NOT NULL
                    OR depreciation_method IS NOT NULL
                )
            )

            -- New event types require meta_json once no longer draft
            AND (
                status IN ('draft','void')
                OR event_type IN ('add_cost','change_estimate')
                OR meta_json IS NOT NULL
            )

            -- useful life sanity (if provided)
            AND (useful_life_months IS NULL OR useful_life_months > 0)

            -- residual value sanity (if provided)
            AND (residual_value IS NULL OR residual_value >= 0)
            )
        $sql$, 'company_8');
        END $$;

        -- -----------------------------
        -- FK -> assets
        -- -----------------------------
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asm_asset' AND n.nspname='company_8'
        ) THEN
            EXECUTE format($sql$
            ALTER TABLE %I.asset_subsequent_measurements
            ADD CONSTRAINT fk_asm_asset
            FOREIGN KEY (asset_id) REFERENCES %I.assets(id)
            $sql$, 'company_8', 'company_8');
        END IF;
        END $$;

        -- -----------------------------
        -- Optional: prevent true duplicates (non-void)
        -- NOTE: do NOT include amount/accounts unless you want to block
        -- multiple capex lines on same day.
        -- This index blocks duplicates of the SAME event_type per asset per date per journal.
        -- -----------------------------
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'company_8' AND indexname='uq_asm_posted_once'
        ) THEN
            EXECUTE format($sql$
            CREATE UNIQUE INDEX uq_asm_posted_once
            ON company_8.asset_subsequent_measurements(
                asset_id,
                event_date,
                event_type,
                COALESCE(posted_journal_id,0)
            )
            WHERE status = 'posted';
            $sql$, 'company_8');
        END IF;
        END $$;

        -- -----------------------------
        -- Optional: company consistency trigger
        -- (ONLY if fn_assert_asset_company() exists in tenant schema)
        -- -----------------------------
        DO $$
        BEGIN
        IF EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='company_8' AND p.proname='fn_assert_asset_company'
        )
        AND NOT EXISTS (
            SELECT 1
            FROM pg_trigger t
            JOIN pg_class c ON c.oid=t.tgrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='company_8' AND t.tgname='tr_asm_assert_company'
        ) THEN
            EXECUTE format($sql$
            CREATE TRIGGER tr_asm_assert_company
            BEFORE INSERT OR UPDATE OF company_id, asset_id
            ON %I.asset_subsequent_measurements
            FOR EACH ROW
            EXECUTE PROCEDURE %I.fn_assert_asset_company()
            $sql$, 'company_8', 'company_8');
        END IF;
        END $$;

        -- tenant schema: company_8
        CREATE TABLE IF NOT EXISTS company_8.asset_carrying_amount_history (
            id BIGSERIAL PRIMARY KEY,
            company_id BIGINT NOT NULL,
            asset_id BIGINT NOT NULL,

            as_at date NOT NULL,              -- snapshot date (usually period_end)
            source_event text NOT NULL,       -- depreciation|revaluation|impairment|subseq|rebuild|opening

            -- components
            cost_total numeric(18,2) NOT NULL DEFAULT 0,
            reval_net  numeric(18,2) NOT NULL DEFAULT 0,
            imp_net    numeric(18,2) NOT NULL DEFAULT 0,
            accumulated_depreciation numeric(18,2) NOT NULL DEFAULT 0,

            carrying_amount numeric(18,2) NOT NULL DEFAULT 0,

            -- optional audit/deltas (not required, but helpful)
            delta_cost  numeric(18,2) NULL,
            delta_reval numeric(18,2) NULL,
            delta_imp   numeric(18,2) NULL,
            delta_dep   numeric(18,2) NULL,

            notes text NULL,

            created_at timestamptz NOT NULL DEFAULT now(),
            created_by bigint NULL
        );

        -- -----------------------------
        -- Indexes
        -- -----------------------------
        CREATE INDEX IF NOT EXISTS company_8_ach_company_asset_asat_idx
        ON company_8.asset_carrying_amount_history(company_id, asset_id, as_at DESC);

        CREATE INDEX IF NOT EXISTS company_8_ach_company_asat_idx
        ON company_8.asset_carrying_amount_history(company_id, as_at DESC);

        CREATE INDEX IF NOT EXISTS company_8_ach_asset_idx
        ON company_8.asset_carrying_amount_history(asset_id);

        -- One snapshot per asset per date (non-void not needed here; table is snapshots only)
        DO $$
        BEGIN
        IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'company_8' AND indexname = 'uq_asset_carrying_hist_asset_asat'
        ) THEN
        EXECUTE format($sql$
            CREATE UNIQUE INDEX uq_asset_carrying_hist_asset_asat
            ON %I.asset_carrying_amount_history(asset_id, as_at)
        $sql$, 'company_8');
        END IF;
        END $$;

        -- -----------------------------
        -- CHECK constraint
        -- -----------------------------
        DO $$
        BEGIN
        IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_namespace n ON n.oid=c.connamespace
        WHERE c.conname='ck_asset_carry_hist_valid' AND n.nspname='company_8'
        ) THEN
        EXECUTE format($sql$
            ALTER TABLE %I.asset_carrying_amount_history
            ADD CONSTRAINT ck_asset_carry_hist_valid
            CHECK (
                as_at IS NOT NULL

                AND source_event IN (
                    'opening',
                    'acquisition',
                    'depreciation',
                    'revaluation',
                    'impairment',

                    -- Subsequent Measurements
                    'add_cost',
                    'change_estimate',
                    'held_for_sale_classify',
                    'held_for_sale_unclassify',
                    'impairment_loss',
                    'impairment_reversal',
                    'fair_value_valuation',
                    'transfer_ppe_to_ip',
                    'transfer_ip_to_ppe',

                    -- Legacy / generic
                    'subseq',
                    'rebuild'
                )

                AND cost_total >= 0
                AND accumulated_depreciation >= 0
                AND carrying_amount >= 0
            )
        $sql$, 'company_8');
        END IF;
        END $$;

        -- -----------------------------
        -- FK -> assets
        -- -----------------------------
        DO $$
        BEGIN
        IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_namespace n ON n.oid=c.connamespace
        WHERE c.conname='fk_asset_carry_hist_asset' AND n.nspname='company_8'
        ) THEN
        EXECUTE format($sql$
            ALTER TABLE %I.asset_carrying_amount_history
            ADD CONSTRAINT fk_asset_carry_hist_asset
            FOREIGN KEY (asset_id) REFERENCES %I.assets(id)
        $sql$, 'company_8', 'company_8');
        END IF;
        END $$;

        -- -----------------------------
        -- Optional: company consistency trigger
        -- -----------------------------
        DO $$
        BEGIN
        IF EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='company_8' AND p.proname='fn_assert_asset_company'
        )
        AND NOT EXISTS (
        SELECT 1
        FROM pg_trigger t
        JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='company_8' AND t.tgname='tr_ach_assert_company'
        ) THEN
        EXECUTE format($sql$
        CREATE TRIGGER tr_ach_assert_company
        BEFORE INSERT OR UPDATE OF company_id, asset_id
        ON %I.asset_carrying_amount_history
        FOR EACH ROW
        EXECUTE PROCEDURE %I.fn_assert_asset_company()
        $sql$, 'company_8', 'company_8');
        END IF;
        END $$;

        -- -----------------------------
        -- ASSET POLICIES (tenant schema)
        -- -----------------------------
        CREATE TABLE IF NOT EXISTS company_8.asset_policies (
            company_id   bigint PRIMARY KEY,
            payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
            updated_at   timestamptz NOT NULL DEFAULT NOW(),
            updated_by   bigint NULL
        );

        -- -----------------------------
        -- Add missing columns safely (for older tenants)
        -- -----------------------------
        DO $$
        BEGIN
        -- payload_json
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'company_8' AND table_name = 'asset_policies' AND column_name = 'payload_json'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_policies ADD COLUMN payload_json jsonb NOT NULL DEFAULT ''{}''::jsonb', 'company_8');
        END IF;

        -- updated_at
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'company_8' AND table_name = 'asset_policies' AND column_name = 'updated_at'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_policies ADD COLUMN updated_at timestamptz NOT NULL DEFAULT NOW()', 'company_8');
        END IF;

        -- updated_by
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'company_8' AND table_name = 'asset_policies' AND column_name = 'updated_by'
        ) THEN
            EXECUTE format('ALTER TABLE %I.asset_policies ADD COLUMN updated_by bigint NULL', 'company_8');
        END IF;
        END $$;

        -- -----------------------------
        -- Indexes (idempotent)
        -- -----------------------------
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'company_8' AND indexname = 'asset_policies_updated_at_idx'
        ) THEN
            EXECUTE format($sql$
            CREATE INDEX asset_policies_updated_at_idx
            ON %I.asset_policies (updated_at DESC)
            $sql$, 'company_8');
        END IF;
        END $$;

        -- -----------------------------
        -- CHECK constraint (optional but good hygiene)
        -- ensures payload is always an object, not array/null
        -- -----------------------------
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_asset_policies_payload_object' AND n.nspname='company_8'
        ) THEN
            EXECUTE format($sql$
            ALTER TABLE %I.asset_policies
            ADD CONSTRAINT ck_asset_policies_payload_object
            CHECK (jsonb_typeof(payload_json) = 'object')
            $sql$, 'company_8');
        END IF;
        END $$;

        -- -----------------------------
        -- FK to companies table (ONLY if it exists in tenant schema)
        -- (skip safely if you don't have company_8.companies)
        -- -----------------------------
        DO $$
        BEGIN
        IF EXISTS (
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='company_8' AND c.relname='companies'
        )
        AND NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_asset_policies_company' AND n.nspname='company_8'
        ) THEN
            EXECUTE format($sql$
            ALTER TABLE %I.asset_policies
            ADD CONSTRAINT fk_asset_policies_company
            FOREIGN KEY (company_id) REFERENCES %I.companies(id)
            ON DELETE CASCADE
            $sql$, 'company_8', 'company_8');
        END IF;
        END $$;

        -- ==================================================
        -- ASSET VALUERS MASTER
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.asset_valuers (
            id BIGSERIAL PRIMARY KEY,
            company_id BIGINT NOT NULL,

            valuer_name TEXT NOT NULL,
            valuer_firm TEXT NULL,
            registration_no TEXT NULL,

            phone TEXT NULL,
            email TEXT NULL,
            address TEXT NULL,

            is_external BOOLEAN NOT NULL DEFAULT TRUE,
            notes TEXT NULL,

            created_by BIGINT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NULL
        );

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'ck_asset_valuers_valid'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format($sql$
                ALTER TABLE %I.asset_valuers
                ADD CONSTRAINT ck_asset_valuers_valid
                CHECK (length(btrim(valuer_name)) > 0)
            $sql$, 'company_8');
        END IF;
        END $$;

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'company_8'
            AND indexname = 'uq_asset_valuers_company_name_firm_reg'
        ) THEN
            EXECUTE format($sql$
                CREATE UNIQUE INDEX uq_asset_valuers_company_name_firm_reg
                ON %I.asset_valuers (
                    company_id,
                    lower(btrim(valuer_name)),
                    lower(btrim(coalesce(valuer_firm, ''))),
                    lower(btrim(coalesce(registration_no, '')))
                )
            $sql$, 'company_8');
        END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS company_8_asset_valuers_company_idx
        ON company_8.asset_valuers(company_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_valuers_name_idx
        ON company_8.asset_valuers(lower(valuer_name));

        CREATE INDEX IF NOT EXISTS company_8_asset_valuers_firm_idx
        ON company_8.asset_valuers(lower(coalesce(valuer_firm, '')));


        -- ==================================================
        -- ASSET REVALUATION VALUATION DETAILS / VALUER INFO
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.asset_revaluation_valuations (
            id BIGSERIAL PRIMARY KEY,
            company_id BIGINT NOT NULL,
            asset_id BIGINT NOT NULL,
            revaluation_id BIGINT NOT NULL,

            valuer_id BIGINT NULL,
            valuer_role TEXT NULL,                          -- primary_valuer|reviewer|internal_assessor|specialist|other

            valuation_date DATE NOT NULL,                  -- normally same as revaluation_date
            effective_date DATE NULL,                      -- if valuation signed later than effective date

            -- snapshot fields
            valuer_name TEXT NULL,
            valuer_firm TEXT NULL,
            valuer_registration_no TEXT NULL,
            valuer_is_external BOOLEAN NOT NULL DEFAULT TRUE,

            valuation_method TEXT NULL,                    -- market|income|cost|depreciated_replacement_cost|indexation|other
            valuation_approach TEXT NULL,                  -- optional descriptive version
            fair_value_hierarchy_level TEXT NULL,          -- level_1|level_2|level_3

            key_assumptions TEXT NULL,
            significant_inputs JSONB NULL,
            restrictions_on_title TEXT NULL,
            highest_best_use_same_as_current BOOLEAN NULL,

            source_document_id BIGINT NULL,
            report_reference TEXT NULL,
            report_date DATE NULL,

            notes TEXT NULL,

            created_by BIGINT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NULL
        );

        -- Backfill-safe alter blocks in case table already existed before valuer_id / role
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'company_8'
            AND table_name = 'asset_revaluation_valuations'
            AND column_name = 'valuer_id'
        ) THEN
            EXECUTE format($sql$
                ALTER TABLE %I.asset_revaluation_valuations
                ADD COLUMN valuer_id BIGINT NULL
            $sql$, 'company_8');
        END IF;
        END $$;

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'company_8'
            AND table_name = 'asset_revaluation_valuations'
            AND column_name = 'valuer_role'
        ) THEN
            EXECUTE format($sql$
                ALTER TABLE %I.asset_revaluation_valuations
                ADD COLUMN valuer_role TEXT NULL
            $sql$, 'company_8');
        END IF;
        END $$;

        -- Checks
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'ck_asset_revaluation_valuations_valid'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format($sql$
                ALTER TABLE %I.asset_revaluation_valuations
                ADD CONSTRAINT ck_asset_revaluation_valuations_valid
                CHECK (
                    valuation_date IS NOT NULL
                    AND (
                        valuation_method IS NULL
                        OR valuation_method IN (
                            'market',
                            'income',
                            'cost',
                            'depreciated_replacement_cost',
                            'indexation',
                            'other'
                        )
                    )
                    AND (
                        fair_value_hierarchy_level IS NULL
                        OR fair_value_hierarchy_level IN ('level_1','level_2','level_3')
                    )
                    AND (
                        valuer_role IS NULL
                        OR valuer_role IN (
                            'primary_valuer',
                            'reviewer',
                            'internal_assessor',
                            'specialist',
                            'other'
                        )
                    )
                )
            $sql$, 'company_8');
        END IF;
        END $$;

        -- FK -> assets
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'fk_asset_reval_valuations_asset'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format($sql$
                ALTER TABLE %I.asset_revaluation_valuations
                ADD CONSTRAINT fk_asset_reval_valuations_asset
                FOREIGN KEY (asset_id) REFERENCES %I.assets(id)
            $sql$, 'company_8', 'company_8');
        END IF;
        END $$;

        -- FK -> asset_revaluations
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'fk_asset_reval_valuations_revaluation'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format($sql$
                ALTER TABLE %I.asset_revaluation_valuations
                ADD CONSTRAINT fk_asset_reval_valuations_revaluation
                FOREIGN KEY (revaluation_id) REFERENCES %I.asset_revaluations(id)
                ON DELETE CASCADE
            $sql$, 'company_8', 'company_8');
        END IF;
        END $$;

        -- FK -> asset_valuers
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'fk_asset_reval_valuations_valuer'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format($sql$
                ALTER TABLE %I.asset_revaluation_valuations
                ADD CONSTRAINT fk_asset_reval_valuations_valuer
                FOREIGN KEY (valuer_id) REFERENCES %I.asset_valuers(id)
            $sql$, 'company_8', 'company_8');
        END IF;
        END $$;

        -- Optional FK -> asset_documents
        DO $$
        BEGIN
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'company_8'
            AND table_name = 'asset_documents'
        )
        AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'fk_asset_reval_valuations_document'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format($sql$
                ALTER TABLE %I.asset_revaluation_valuations
                ADD CONSTRAINT fk_asset_reval_valuations_document
                FOREIGN KEY (source_document_id) REFERENCES %I.asset_documents(id)
            $sql$, 'company_8', 'company_8');
        END IF;
        END $$;

        -- Remove old one-row-per-revaluation rule if it already exists from older migrations
        DO $$
        BEGIN
        IF EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'company_8'
            AND indexname = 'uq_asset_reval_valuations_revaluation_id'
        ) THEN
            EXECUTE format($sql$
                DROP INDEX %I.uq_asset_reval_valuations_revaluation_id
            $sql$, 'company_8');
        END IF;
        END $$;

        -- Unique: one same master valuer per revaluation
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'company_8'
            AND indexname = 'uq_asset_reval_vals_revaluation_valuer_id'
        ) THEN
            EXECUTE format($sql$
                CREATE UNIQUE INDEX uq_asset_reval_vals_revaluation_valuer_id
                ON %I.asset_revaluation_valuations(revaluation_id, valuer_id)
                WHERE valuer_id IS NOT NULL
            $sql$, 'company_8');
        END IF;
        END $$;

        -- Unique: one same snapshot valuer name/firm per revaluation when no valuer master linked
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'company_8'
            AND indexname = 'uq_asset_reval_vals_revaluation_name_firm'
        ) THEN
            EXECUTE format($sql$
                CREATE UNIQUE INDEX uq_asset_reval_vals_revaluation_name_firm
                ON %I.asset_revaluation_valuations(
                    revaluation_id,
                    lower(btrim(coalesce(valuer_name, ''))),
                    lower(btrim(coalesce(valuer_firm, '')))
                )
                WHERE valuer_id IS NULL
            $sql$, 'company_8');
        END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS company_8_asset_reval_valuations_company_idx
        ON company_8.asset_revaluation_valuations(company_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_reval_valuations_asset_idx
        ON company_8.asset_revaluation_valuations(asset_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_reval_valuations_revaluation_idx
        ON company_8.asset_revaluation_valuations(revaluation_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_reval_valuations_valuer_idx
        ON company_8.asset_revaluation_valuations(valuer_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_reval_valuations_valuation_date_idx
        ON company_8.asset_revaluation_valuations(valuation_date);

        CREATE INDEX IF NOT EXISTS company_8_asset_reval_valuations_method_idx
        ON company_8.asset_revaluation_valuations(valuation_method);

        CREATE INDEX IF NOT EXISTS company_8_asset_reval_valuations_hierarchy_idx
        ON company_8.asset_revaluation_valuations(fair_value_hierarchy_level);

        -- Basic asset/company consistency
        DO $$
        BEGIN
        IF EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'company_8'
            AND p.proname = 'fn_assert_asset_company'
        )
        AND NOT EXISTS (
            SELECT 1
            FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'company_8'
            AND t.tgname = 'tr_asset_reval_valuations_assert_company'
        ) THEN
        EXECUTE format($sql$
            CREATE TRIGGER tr_asset_reval_valuations_assert_company
            BEFORE INSERT OR UPDATE OF company_id, asset_id
            ON %I.asset_revaluation_valuations
            FOR EACH ROW
            EXECUTE PROCEDURE %I.fn_assert_asset_company()
        $sql$, 'company_8', 'company_8');
        END IF;
        END $$;

        -- Deep consistency across revaluation + valuer
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'company_8'
            AND p.proname = 'fn_assert_asset_reval_valuation_consistency'
        ) THEN
            EXECUTE format($sql$
                CREATE FUNCTION %I.fn_assert_asset_reval_valuation_consistency()
                RETURNS trigger
                LANGUAGE plpgsql
                AS $fn$
                DECLARE
                    v_asset_id BIGINT;
                    v_company_id BIGINT;
                    v_valuer_company_id BIGINT;
                BEGIN
                    SELECT r.asset_id, r.company_id
                    INTO v_asset_id, v_company_id
                    FROM %I.asset_revaluations r
                    WHERE r.id = NEW.revaluation_id;

                    IF v_asset_id IS NULL THEN
                        RAISE EXCEPTION 'Invalid revaluation_id: %%', NEW.revaluation_id;
                    END IF;

                    IF NEW.asset_id IS DISTINCT FROM v_asset_id THEN
                        RAISE EXCEPTION
                            'asset_id %% does not match asset_revaluations.asset_id %% for revaluation_id %%',
                            NEW.asset_id, v_asset_id, NEW.revaluation_id;
                    END IF;

                    IF NEW.company_id IS DISTINCT FROM v_company_id THEN
                        RAISE EXCEPTION
                            'company_id %% does not match asset_revaluations.company_id %% for revaluation_id %%',
                            NEW.company_id, v_company_id, NEW.revaluation_id;
                    END IF;

                    IF NEW.valuer_id IS NOT NULL THEN
                        SELECT av.company_id
                        INTO v_valuer_company_id
                        FROM %I.asset_valuers av
                        WHERE av.id = NEW.valuer_id;

                        IF v_valuer_company_id IS NULL THEN
                            RAISE EXCEPTION 'Invalid valuer_id: %%', NEW.valuer_id;
                        END IF;

                        IF v_valuer_company_id IS DISTINCT FROM NEW.company_id THEN
                            RAISE EXCEPTION
                                'valuer_id %% belongs to company_id %% not %%',
                                NEW.valuer_id, v_valuer_company_id, NEW.company_id;
                        END IF;
                    END IF;

                    RETURN NEW;
                END;
                $fn$
            $sql$, 'company_8', 'company_8', 'company_8');
        END IF;
        END $$;

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'company_8'
            AND t.tgname = 'tr_asset_reval_valuations_consistency'
        ) THEN
        EXECUTE format($sql$
            CREATE TRIGGER tr_asset_reval_valuations_consistency
            BEFORE INSERT OR UPDATE OF company_id, asset_id, revaluation_id, valuer_id
            ON %I.asset_revaluation_valuations
            FOR EACH ROW
            EXECUTE PROCEDURE %I.fn_assert_asset_reval_valuation_consistency()
        $sql$, 'company_8', 'company_8');
        END IF;
        END $$;

        -- =========================================================
        -- PPE MOVEMENTS VIEW
        -- Normalises PPE events into one reporting stream
        -- =========================================================
        DROP VIEW IF EXISTS company_8.vw_ppe_disclosure_by_class CASCADE;
        DROP VIEW IF EXISTS company_8.vw_ppe_movements CASCADE;

        CREATE VIEW company_8.vw_ppe_movements AS
        WITH asset_base AS (
            SELECT
                a.company_id,
                a.id AS asset_id,
                a.asset_code,
                a.asset_name,
                a.asset_class,
                a.category,
                a.acquisition_date,
                a.available_for_use_date,
                a.measurement_basis,
                a.status AS asset_status,

                COALESCE(a.opening_cost,0)::numeric(18,2)       AS opening_cost,
                COALESCE(a.opening_accum_dep,0)::numeric(18,2)  AS opening_accum_dep,
                COALESCE(a.opening_impairment,0)::numeric(18,2) AS opening_impairment,
                COALESCE(a.cost,0)::numeric(18,2)               AS current_cost,
                COALESCE(a.residual_value,0)::numeric(18,2)     AS residual_value
            FROM company_8.assets a
        ),

        -- ---------------------------------------------------------
        -- OPENING BALANCES
        -- ---------------------------------------------------------
        opening_rows AS (
            SELECT
                ab.company_id,
                ab.asset_id,
                ab.asset_code,
                ab.asset_name,
                ab.asset_class,
                ab.category,
                COALESCE(NULLIF(ab.acquisition_date::text,''), '1900-01-01')::date AS event_date,

                'opening'::text AS movement_type,
                'assets'::text  AS source_table,
                ab.asset_id::bigint AS source_id,

                ab.measurement_basis,
                NULL::text AS narrative,

                ab.opening_cost::numeric(18,2)         AS cost_delta,
                ab.opening_accum_dep::numeric(18,2)    AS accum_dep_delta,
                ab.opening_impairment::numeric(18,2)   AS impairment_delta,
                0::numeric(18,2)                       AS revaluation_reserve_delta,

                (
                    ab.opening_cost
                    - ab.opening_accum_dep
                    - ab.opening_impairment
                )::numeric(18,2) AS carrying_delta
            FROM asset_base ab
            WHERE
                ab.opening_cost <> 0
                OR ab.opening_accum_dep <> 0
                OR ab.opening_impairment <> 0
        ),

        -- ---------------------------------------------------------
        -- ACQUISITIONS
        -- ---------------------------------------------------------
        acquisition_rows AS (
            SELECT
                a.company_id,
                a.id AS asset_id,
                a.asset_code,
                a.asset_name,
                a.asset_class,
                a.category,
                ac.acquisition_date AS event_date,

                'addition'::text AS movement_type,
                'asset_acquisitions'::text AS source_table,
                ac.id::bigint AS source_id,

                a.measurement_basis,
                COALESCE(ac.reference, ac.notes)::text AS narrative,

                COALESCE(ac.amount,0)::numeric(18,2) AS cost_delta,
                0::numeric(18,2) AS accum_dep_delta,
                0::numeric(18,2) AS impairment_delta,
                0::numeric(18,2) AS revaluation_reserve_delta,
                COALESCE(ac.amount,0)::numeric(18,2) AS carrying_delta
            FROM company_8.asset_acquisitions ac
            JOIN company_8.assets a
            ON a.id = ac.asset_id
            WHERE COALESCE(ac.status,'draft') IN ('posted')
        ),

        fallback_acquisition_rows AS (
            SELECT
                a.company_id,
                a.asset_id,
                a.asset_code,
                a.asset_name,
                a.asset_class,
                a.category,
                COALESCE(a.available_for_use_date,a.acquisition_date,CURRENT_DATE)::date AS event_date,

                'addition'::text AS movement_type,
                'assets_fallback'::text AS source_table,
                a.asset_id::bigint AS source_id,

                a.measurement_basis,
                'Auto-generated from asset master'::text AS narrative,

                a.current_cost::numeric(18,2) AS cost_delta,
                0::numeric(18,2) AS accum_dep_delta,
                0::numeric(18,2) AS impairment_delta,
                0::numeric(18,2) AS revaluation_reserve_delta,
                a.current_cost::numeric(18,2) AS carrying_delta
            FROM asset_base a
            WHERE a.current_cost<>0
            AND NOT EXISTS (
                SELECT 1
                FROM company_8.asset_acquisitions ac
                WHERE ac.asset_id=a.asset_id
                    AND COALESCE(ac.status,'draft')='posted'
            )
            AND NOT (
                a.opening_cost<>0
                OR a.opening_accum_dep<>0
                OR a.opening_impairment<>0
            )
        ),

        -- ---------------------------------------------------------
        -- SUBSEQUENT MEASUREMENTS
        -- add_cost / impairment / revaluation / transfer / HFS
        -- ---------------------------------------------------------
        subseq_rows AS (
            SELECT
                a.company_id,
                a.id AS asset_id,
                a.asset_code,
                a.asset_name,
                a.asset_class,
                a.category,
                sm.event_date AS event_date,

                CASE
                    WHEN sm.event_type = 'add_cost'                 THEN 'subsequent_addition'
                    WHEN sm.event_type = 'impairment_loss'         THEN 'impairment_loss'
                    WHEN sm.event_type = 'impairment_reversal'     THEN 'impairment_reversal'
                    WHEN sm.event_type = 'revaluation'             THEN 'revaluation'
                    WHEN sm.event_type = 'held_for_sale_classify'  THEN 'held_for_sale_transfer_out'
                    WHEN sm.event_type = 'held_for_sale_unclassify'THEN 'held_for_sale_transfer_in'
                    WHEN sm.event_type = 'transfer_ppe_to_ip'      THEN 'transfer_out'
                    WHEN sm.event_type = 'transfer_ip_to_ppe'      THEN 'transfer_in'
                    WHEN sm.event_type = 'change_estimate'         THEN 'estimate_change'
                    ELSE sm.event_type
                END::text AS movement_type,

                'asset_subsequent_measurements'::text AS source_table,
                sm.id::bigint AS source_id,

                a.measurement_basis,
                sm.notes::text AS narrative,

                CASE
                    WHEN sm.event_type = 'add_cost'
                        THEN COALESCE(sm.amount,0)
                    WHEN sm.event_type = 'held_for_sale_unclassify'
                        THEN COALESCE((sm.meta_json->>'cost_delta')::numeric, 0)
                    WHEN sm.event_type = 'transfer_ip_to_ppe'
                        THEN COALESCE((sm.meta_json->>'cost_delta')::numeric, 0)
                    WHEN sm.event_type = 'transfer_ppe_to_ip'
                        THEN -COALESCE((sm.meta_json->>'cost_delta')::numeric, 0)
                    WHEN sm.event_type = 'held_for_sale_classify'
                        THEN -COALESCE((sm.meta_json->>'cost_delta')::numeric, 0)
                    ELSE 0
                END::numeric(18,2) AS cost_delta,

                CASE
                    WHEN sm.event_type = 'held_for_sale_unclassify'
                        THEN COALESCE((sm.meta_json->>'accum_dep_delta')::numeric, 0)
                    WHEN sm.event_type = 'transfer_ip_to_ppe'
                        THEN COALESCE((sm.meta_json->>'accum_dep_delta')::numeric, 0)
                    WHEN sm.event_type = 'transfer_ppe_to_ip'
                        THEN -COALESCE((sm.meta_json->>'accum_dep_delta')::numeric, 0)
                    WHEN sm.event_type = 'held_for_sale_classify'
                        THEN -COALESCE((sm.meta_json->>'accum_dep_delta')::numeric, 0)
                    WHEN sm.event_type = 'revaluation'
                        THEN COALESCE((sm.meta_json->>'accum_dep_delta')::numeric, 0)
                    ELSE 0
                END::numeric(18,2) AS accum_dep_delta,

                CASE
                    WHEN sm.event_type = 'impairment_loss'
                        THEN COALESCE(sm.amount, COALESCE((sm.meta_json->>'impairment_amount')::numeric,0))
                    WHEN sm.event_type = 'impairment_reversal'
                        THEN -COALESCE(sm.amount, COALESCE((sm.meta_json->>'reversal_amount')::numeric,0))
                    WHEN sm.event_type = 'held_for_sale_unclassify'
                        THEN COALESCE((sm.meta_json->>'impairment_delta')::numeric, 0)
                    WHEN sm.event_type = 'transfer_ip_to_ppe'
                        THEN COALESCE((sm.meta_json->>'impairment_delta')::numeric, 0)
                    WHEN sm.event_type = 'transfer_ppe_to_ip'
                        THEN -COALESCE((sm.meta_json->>'impairment_delta')::numeric, 0)
                    WHEN sm.event_type = 'held_for_sale_classify'
                        THEN -COALESCE((sm.meta_json->>'impairment_delta')::numeric, 0)
                    ELSE 0
                END::numeric(18,2) AS impairment_delta,

                CASE
                    WHEN sm.event_type = 'revaluation'
                        THEN COALESCE((sm.meta_json->>'oci_amount')::numeric, 0)
                    ELSE 0
                END::numeric(18,2) AS revaluation_reserve_delta,

                CASE
                    WHEN sm.event_type = 'add_cost'
                        THEN COALESCE(sm.amount,0)
                    WHEN sm.event_type = 'impairment_loss'
                        THEN -COALESCE(sm.amount, COALESCE((sm.meta_json->>'impairment_amount')::numeric,0))
                    WHEN sm.event_type = 'impairment_reversal'
                        THEN COALESCE(sm.amount, COALESCE((sm.meta_json->>'reversal_amount')::numeric,0))
                    WHEN sm.event_type = 'revaluation'
                        THEN COALESCE((sm.meta_json->>'carrying_delta')::numeric, COALESCE(sm.amount,0))
                    WHEN sm.event_type = 'transfer_ppe_to_ip'
                        THEN -COALESCE((sm.meta_json->>'carrying_amount')::numeric, COALESCE(sm.amount,0))
                    WHEN sm.event_type = 'transfer_ip_to_ppe'
                        THEN COALESCE((sm.meta_json->>'carrying_amount')::numeric, COALESCE(sm.amount,0))
                    WHEN sm.event_type = 'held_for_sale_classify'
                        THEN -COALESCE((sm.meta_json->>'carrying_amount')::numeric, COALESCE(sm.amount,0))
                    WHEN sm.event_type = 'held_for_sale_unclassify'
                        THEN COALESCE((sm.meta_json->>'carrying_amount')::numeric, COALESCE(sm.amount,0))
                    ELSE 0
                END::numeric(18,2) AS carrying_delta
            FROM company_8.asset_subsequent_measurements sm
            JOIN company_8.assets a
            ON a.id = sm.asset_id
            WHERE COALESCE(sm.status,'draft') IN ('posted')
        ),

        -- ---------------------------------------------------------
        -- DEPRECIATION
        -- ---------------------------------------------------------
        depreciation_rows AS (
            SELECT
                a.company_id,
                a.id AS asset_id,
                a.asset_code,
                a.asset_name,
                a.asset_class,
                a.category,
                d.period_end AS event_date,

                'depreciation'::text AS movement_type,
                'asset_depreciation'::text AS source_table,
                d.id::bigint AS source_id,

                COALESCE(d.measurement_basis, a.measurement_basis) AS measurement_basis,
                CONCAT('Depreciation ', d.period_start, ' to ', d.period_end)::text AS narrative,

                0::numeric(18,2) AS cost_delta,
                COALESCE(d.depreciation_amount,0)::numeric(18,2) AS accum_dep_delta,
                0::numeric(18,2) AS impairment_delta,
                0::numeric(18,2) AS revaluation_reserve_delta,
                (-COALESCE(d.depreciation_amount,0))::numeric(18,2) AS carrying_delta
            FROM company_8.asset_depreciation d
            JOIN company_8.assets a
            ON a.id = d.asset_id
            WHERE COALESCE(d.status,'draft') IN ('posted')
        ),

        -- ---------------------------------------------------------
        -- REVALUATIONS
        -- ---------------------------------------------------------
        revaluation_rows AS (
            SELECT
                a.company_id,
                a.id AS asset_id,
                a.asset_code,
                a.asset_name,
                a.asset_class,
                a.category,
                r.revaluation_date AS event_date,

                CASE
                    WHEN COALESCE(r.revaluation_change,0) >= 0 THEN 'revaluation_up'
                    ELSE 'revaluation_down'
                END::text AS movement_type,

                'asset_revaluations'::text AS source_table,
                r.id::bigint AS source_id,

                a.measurement_basis,
                COALESCE(r.reason, r.notes)::text AS narrative,

                COALESCE(r.cost_after,0) - COALESCE(r.cost_before,0) AS cost_delta,
                COALESCE(r.accum_dep_after,0) - COALESCE(r.accum_dep_before,0) AS accum_dep_delta,
                0::numeric(18,2) AS impairment_delta,
                COALESCE(r.oci_revaluation_surplus,0)::numeric(18,2) AS revaluation_reserve_delta,
                COALESCE(r.revaluation_change,0)::numeric(18,2) AS carrying_delta
            FROM company_8.asset_revaluations r
            JOIN company_8.assets a
            ON a.id = r.asset_id
            WHERE COALESCE(r.status,'draft') IN ('posted')
        ),

        -- ---------------------------------------------------------
        -- IMPAIRMENTS
        -- ---------------------------------------------------------
        impairment_rows AS (
            SELECT
                a.company_id,
                a.id AS asset_id,
                a.asset_code,
                a.asset_name,
                a.asset_class,
                a.category,
                i.impairment_date AS event_date,

                CASE
                    WHEN COALESCE(i.impairment_amount,0) > 0 THEN 'impairment_loss'
                    ELSE 'impairment_reversal'
                END::text AS movement_type,

                'asset_impairments'::text AS source_table,
                i.id::bigint AS source_id,

                a.measurement_basis,
                COALESCE(i.reason, i.notes)::text AS narrative,

                0::numeric(18,2) AS cost_delta,
                0::numeric(18,2) AS accum_dep_delta,

                (
                    COALESCE(i.impairment_amount,0)
                    - COALESCE(i.reversal_amount,0)
                )::numeric(18,2) AS impairment_delta,

                0::numeric(18,2) AS revaluation_reserve_delta,

                (
                    -COALESCE(i.impairment_amount,0)
                    + COALESCE(i.reversal_amount,0)
                )::numeric(18,2) AS carrying_delta
            FROM company_8.asset_impairments i
            JOIN company_8.assets a
            ON a.id = i.asset_id
            WHERE COALESCE(i.status,'draft') IN ('posted')
        ),

        -- ---------------------------------------------------------
        -- DISPOSALS
        -- Removes remaining carrying amount and related balances
        -- Uses disposal meta if later added; otherwise carrying only
        -- ---------------------------------------------------------
        disposal_rows AS (
            SELECT
                a.company_id,
                a.id AS asset_id,
                a.asset_code,
                a.asset_name,
                a.asset_class,
                a.category,
                d.disposal_date AS event_date,

                'disposal'::text AS movement_type,
                'asset_disposals'::text AS source_table,
                d.id::bigint AS source_id,

                a.measurement_basis,
                COALESCE(d.reference, d.notes)::text AS narrative,

                0::numeric(18,2) AS cost_delta,
                0::numeric(18,2) AS accum_dep_delta,
                0::numeric(18,2) AS impairment_delta,
                0::numeric(18,2) AS revaluation_reserve_delta,
                (-COALESCE(d.carrying_amount,0))::numeric(18,2) AS carrying_delta
            FROM company_8.asset_disposals d
            JOIN company_8.assets a
            ON a.id = d.asset_id
            WHERE COALESCE(d.status,'draft') IN ('posted')
        ),

        -- ---------------------------------------------------------
        -- HELD FOR SALE
        -- ---------------------------------------------------------
        hfs_rows AS (
            SELECT
                a.company_id,
                a.id AS asset_id,
                a.asset_code,
                a.asset_name,
                a.asset_class,
                a.category,
                h.classification_date AS event_date,

                'held_for_sale_transfer_out'::text AS movement_type,
                'asset_held_for_sale'::text AS source_table,
                h.id::bigint AS source_id,

                a.measurement_basis,
                NULL::text AS narrative,

                0::numeric(18,2) AS cost_delta,
                0::numeric(18,2) AS accum_dep_delta,
                COALESCE(h.impairment_on_classification,0)::numeric(18,2) AS impairment_delta,
                0::numeric(18,2) AS revaluation_reserve_delta,
                (-COALESCE(h.carrying_amount,0))::numeric(18,2) AS carrying_delta
            FROM company_8.asset_held_for_sale h
            JOIN company_8.assets a
            ON a.id = h.asset_id
            WHERE COALESCE(h.status,'active') IN ('active','sold')
        ),

        -- ---------------------------------------------------------
        -- GENERIC TRANSFERS
        -- amountless classification movement; no carrying delta by default
        -- ---------------------------------------------------------
        transfer_rows AS (
            SELECT
                a.company_id,
                a.id AS asset_id,
                a.asset_code,
                a.asset_name,
                a.asset_class,
                a.category,
                t.transfer_date AS event_date,

                'transfer'::text AS movement_type,
                'asset_transfers'::text AS source_table,
                t.id::bigint AS source_id,

                a.measurement_basis,
                COALESCE(t.reason, t.notes)::text AS narrative,

                0::numeric(18,2) AS cost_delta,
                0::numeric(18,2) AS accum_dep_delta,
                0::numeric(18,2) AS impairment_delta,
                0::numeric(18,2) AS revaluation_reserve_delta,
                0::numeric(18,2) AS carrying_delta
            FROM company_8.asset_transfers t
            JOIN company_8.assets a
            ON a.id = t.asset_id
            WHERE COALESCE(t.status,'posted') IN ('posted')
        ),

        -- ---------------------------------------------------------
        -- STANDARD TRANSFERS
        -- IAS16 <-> other standards
        -- ---------------------------------------------------------
        standard_transfer_rows AS (
            SELECT
                a.company_id,
                a.id AS asset_id,
                a.asset_code,
                a.asset_name,
                a.asset_class,
                a.category,
                st.transfer_date AS event_date,

                CASE
                    WHEN UPPER(COALESCE(st.from_standard,'')) = 'IAS16'
                    AND UPPER(COALESCE(st.to_standard,'')) <> 'IAS16'
                        THEN 'transfer_out'
                    WHEN UPPER(COALESCE(st.from_standard,'')) <> 'IAS16'
                    AND UPPER(COALESCE(st.to_standard,'')) = 'IAS16'
                        THEN 'transfer_in'
                    ELSE 'standard_transfer'
                END::text AS movement_type,

                'asset_standard_transfers'::text AS source_table,
                st.id::bigint AS source_id,

                a.measurement_basis,
                COALESCE(st.reason, st.notes)::text AS narrative,

                0::numeric(18,2) AS cost_delta,
                0::numeric(18,2) AS accum_dep_delta,
                0::numeric(18,2) AS impairment_delta,
                COALESCE(st.oci_amount,0)::numeric(18,2) AS revaluation_reserve_delta,

                CASE
                    WHEN UPPER(COALESCE(st.from_standard,'')) = 'IAS16'
                    AND UPPER(COALESCE(st.to_standard,'')) <> 'IAS16'
                        THEN -COALESCE(st.carrying_amount_before,0)
                    WHEN UPPER(COALESCE(st.from_standard,'')) <> 'IAS16'
                    AND UPPER(COALESCE(st.to_standard,'')) = 'IAS16'
                        THEN COALESCE(st.carrying_amount_before,0)
                    ELSE 0
                END::numeric(18,2) AS carrying_delta
            FROM company_8.asset_standard_transfers st
            JOIN company_8.assets a
            ON a.id = st.asset_id
            WHERE COALESCE(st.status,'draft') IN ('posted')
        ),

        -- ---------------------------------------------------------
        -- REVALUATION RESERVE LEDGER
        -- kept separate so you can disclose OCI movement even where
        -- carrying amount movement came from another source
        -- ---------------------------------------------------------
        reserve_rows AS (
            SELECT
                a.company_id,
                a.id AS asset_id,
                a.asset_code,
                a.asset_name,
                a.asset_class,
                a.category,
                rr.event_date AS event_date,

                CONCAT('reserve_', rr.event_type)::text AS movement_type,
                'asset_revaluation_reserve'::text AS source_table,
                rr.id::bigint AS source_id,

                a.measurement_basis,
                rr.notes::text AS narrative,

                0::numeric(18,2) AS cost_delta,
                0::numeric(18,2) AS accum_dep_delta,
                0::numeric(18,2) AS impairment_delta,
                COALESCE(rr.reserve_movement,0)::numeric(18,2) AS revaluation_reserve_delta,
                0::numeric(18,2) AS carrying_delta
            FROM company_8.asset_revaluation_reserve rr
            JOIN company_8.assets a
            ON a.id = rr.asset_id
            WHERE COALESCE(rr.status,'draft') IN ('posted')
        )

        SELECT * FROM opening_rows
        UNION ALL
        SELECT * FROM acquisition_rows
        UNION ALL
        SELECT * FROM fallback_acquisition_rows
        UNION ALL
        SELECT * FROM subseq_rows
        UNION ALL
        SELECT * FROM depreciation_rows
        UNION ALL
        SELECT * FROM revaluation_rows
        UNION ALL
        SELECT * FROM impairment_rows
        UNION ALL
        SELECT * FROM disposal_rows
        UNION ALL
        SELECT * FROM hfs_rows
        UNION ALL
        SELECT * FROM transfer_rows
        UNION ALL
        SELECT * FROM standard_transfer_rows
        UNION ALL
        SELECT * FROM reserve_rows;

        -- =========================================================
        -- PPE DISCLOSURE BY CLASS
        -- Aggregates normalised movements
        -- =========================================================
        DROP VIEW IF EXISTS company_8.vw_ppe_disclosure_by_class CASCADE;

        CREATE VIEW company_8.vw_ppe_disclosure_by_class AS
        SELECT
            m.company_id,
            m.asset_class,

            m.movement_type,

            SUM(COALESCE(m.cost_delta,0))::numeric(18,2)                 AS cost_amount,
            SUM(COALESCE(m.accum_dep_delta,0))::numeric(18,2)            AS accum_dep_amount,
            SUM(COALESCE(m.impairment_delta,0))::numeric(18,2)           AS impairment_amount,
            SUM(COALESCE(m.revaluation_reserve_delta,0))::numeric(18,2)  AS reserve_amount,
            SUM(COALESCE(m.carrying_delta,0))::numeric(18,2)             AS carrying_amount

        FROM company_8.vw_ppe_movements m
        GROUP BY
            m.company_id,
            m.asset_class,
            m.movement_type;

        CREATE TABLE IF NOT EXISTS company_8.asset_tax_profiles (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            asset_id INT NOT NULL,

            tax_authority_id INT NOT NULL REFERENCES public.tax_authorities(id),
            allowance_rule_id INT NULL REFERENCES public.tax_allowance_rules(id),

            tax_start_date DATE NULL,
            tax_cost NUMERIC(18,2) NULL,

            qualifying_percent NUMERIC(5,2) NOT NULL DEFAULT 100,
            private_use_percent NUMERIC(5,2) NOT NULL DEFAULT 0,

            is_tax_depreciable BOOLEAN NOT NULL DEFAULT TRUE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            notes TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NULL
        );

        ALTER TABLE company_8.asset_tax_profiles
        ADD COLUMN IF NOT EXISTS default_rule_id INT NULL,
        ADD COLUMN IF NOT EXISTS override_rule_id BIGINT NULL,
        ADD COLUMN IF NOT EXISTS rule_source TEXT NOT NULL DEFAULT 'default';

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'uq_asset_tax_profile'
                AND n.nspname = 'company_8'
            ) THEN
                ALTER TABLE company_8.asset_tax_profiles
                ADD CONSTRAINT uq_asset_tax_profile
                UNIQUE (company_id, asset_id, tax_authority_id);
            END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'fk_asset_tax_profile_asset'
                AND n.nspname = 'company_8'
            ) THEN
                ALTER TABLE company_8.asset_tax_profiles
                ADD CONSTRAINT fk_asset_tax_profile_asset
                FOREIGN KEY (asset_id)
                REFERENCES company_8.assets(id)
                ON DELETE CASCADE;
            END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'ck_asset_tax_profile_percentages'
                AND n.nspname = 'company_8'
            ) THEN
                ALTER TABLE company_8.asset_tax_profiles
                ADD CONSTRAINT ck_asset_tax_profile_percentages
                CHECK (
                    qualifying_percent BETWEEN 0 AND 100
                    AND private_use_percent BETWEEN 0 AND 100
                );
            END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n
                ON n.oid = c.connamespace
                WHERE n.nspname = 'company_8'
                AND c.conname =
                    'asset_tax_profiles_default_rule_fk'
            ) THEN
                ALTER TABLE company_8.asset_tax_profiles
                ADD CONSTRAINT asset_tax_profiles_default_rule_fk
                FOREIGN KEY (default_rule_id)
                REFERENCES public.tax_allowance_rules(id)
                ON DELETE SET NULL;
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n
                ON n.oid = c.connamespace
                WHERE n.nspname = 'company_8'
                AND c.conname =
                    'asset_tax_profiles_override_rule_fk'
            ) THEN
                ALTER TABLE company_8.asset_tax_profiles
                ADD CONSTRAINT asset_tax_profiles_override_rule_fk
                FOREIGN KEY (override_rule_id)
                REFERENCES company_8.asset_tax_rule_overrides(id)
                ON DELETE SET NULL;
            END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n
                ON n.oid = c.connamespace
                WHERE n.nspname = 'company_8'
                AND c.conname =
                    'ck_asset_tax_profile_rule_source'
            ) THEN
                ALTER TABLE company_8.asset_tax_profiles
                ADD CONSTRAINT ck_asset_tax_profile_rule_source
                CHECK (
                    rule_source IN (
                        'default',
                        'override',
                        'custom',
                        'manual'
                    )
                );
            END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS company_8.asset_tax_runs (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,

            tax_authority_id INT NOT NULL REFERENCES public.tax_authorities(id),

            tax_year INT NOT NULL,
            tax_year_start DATE NOT NULL,
            tax_year_end DATE NOT NULL,

            status TEXT NOT NULL DEFAULT 'draft',

            calculated_at TIMESTAMPTZ NULL,
            approved_at TIMESTAMPTZ NULL,
            locked_at TIMESTAMPTZ NULL,

            created_by_user_id INT NULL,
            approved_by_user_id INT NULL,

            notes TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'uq_asset_tax_run'
                AND n.nspname = 'company_8'
            ) THEN
                ALTER TABLE company_8.asset_tax_runs
                ADD CONSTRAINT uq_asset_tax_run
                UNIQUE (company_id, tax_authority_id, tax_year);
            END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'ck_asset_tax_run_status'
                AND n.nspname = 'company_8'
            ) THEN
                ALTER TABLE company_8.asset_tax_runs
                ADD CONSTRAINT ck_asset_tax_run_status
                CHECK (status IN ('draft','calculated','approved','locked','void'));
            END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'ck_asset_tax_run_dates'
                AND n.nspname = 'company_8'
            ) THEN
                ALTER TABLE company_8.asset_tax_runs
                ADD CONSTRAINT ck_asset_tax_run_dates
                CHECK (tax_year_end >= tax_year_start);
            END IF;
        END $$;


        CREATE TABLE IF NOT EXISTS company_8.asset_tax_run_lines (
            id SERIAL PRIMARY KEY,

            run_id INT NOT NULL REFERENCES company_8.asset_tax_runs(id) ON DELETE CASCADE,

            company_id INT NOT NULL,
            asset_tax_profile_id INT NOT NULL REFERENCES company_8.asset_tax_profiles(id),
            asset_id INT NOT NULL REFERENCES company_8.assets(id),

            tax_authority_id INT NOT NULL REFERENCES public.tax_authorities(id),
            allowance_rule_id INT NULL REFERENCES public.tax_allowance_rules(id),

            tax_year INT NOT NULL,

            opening_tax_wdv NUMERIC(18,2) NOT NULL DEFAULT 0,
            additions NUMERIC(18,2) NOT NULL DEFAULT 0,
            disposal_proceeds NUMERIC(18,2) NOT NULL DEFAULT 0,
            disposal_tax_value NUMERIC(18,2) NOT NULL DEFAULT 0,

            allowance_base NUMERIC(18,2) NOT NULL DEFAULT 0,

            initial_allowance NUMERIC(18,2) NOT NULL DEFAULT 0,
            annual_allowance NUMERIC(18,2) NOT NULL DEFAULT 0,
            total_capital_allowance NUMERIC(18,2) NOT NULL DEFAULT 0,

            closing_tax_wdv NUMERIC(18,2) NOT NULL DEFAULT 0,

            book_depreciation NUMERIC(18,2) NOT NULL DEFAULT 0,
            accounting_carrying_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            tax_adjustment NUMERIC(18,2) NOT NULL DEFAULT 0,
            temporary_difference NUMERIC(18,2) NULL,

            calculation_method TEXT NULL,
            rate_percent NUMERIC(8,4) NULL,

            override_reason TEXT NULL,
            notes TEXT NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.asset_tax_run_lines
        ADD COLUMN IF NOT EXISTS default_rule_id INT NULL,
        ADD COLUMN IF NOT EXISTS override_rule_id BIGINT NULL,
        ADD COLUMN IF NOT EXISTS rule_source TEXT NULL,
        ADD COLUMN IF NOT EXISTS rule_snapshot JSONB
            NOT NULL DEFAULT '{}'::jsonb;

        ALTER TABLE company_8.asset_tax_run_lines
        ADD COLUMN IF NOT EXISTS requires_review
        BOOLEAN NOT NULL DEFAULT FALSE;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'uq_asset_tax_run_line'
                AND n.nspname = 'company_8'
            ) THEN
                ALTER TABLE company_8.asset_tax_run_lines
                ADD CONSTRAINT uq_asset_tax_run_line
                UNIQUE (run_id, asset_tax_profile_id);
            END IF;
        END $$;


        CREATE TABLE IF NOT EXISTS company_8.asset_tax_adjustments (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,

            asset_tax_profile_id INT NOT NULL REFERENCES company_8.asset_tax_profiles(id),
            asset_id INT NOT NULL REFERENCES company_8.assets(id),

            tax_authority_id INT NOT NULL REFERENCES public.tax_authorities(id),
            tax_year INT NOT NULL,

            adjustment_type TEXT NOT NULL,
            amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            reason TEXT NOT NULL,

            status TEXT NOT NULL DEFAULT 'draft',

            created_by_user_id INT NULL,
            approved_by_user_id INT NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            approved_at TIMESTAMPTZ NULL
        );

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'ck_asset_tax_adj_status'
                AND n.nspname = 'company_8'
            ) THEN
                ALTER TABLE company_8.asset_tax_adjustments
                ADD CONSTRAINT ck_asset_tax_adj_status
                CHECK (status IN ('draft','approved','void'));
            END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'ck_asset_tax_adj_type'
                AND n.nspname = 'company_8'
            ) THEN
                ALTER TABLE company_8.asset_tax_adjustments
                ADD CONSTRAINT ck_asset_tax_adj_type
                CHECK (adjustment_type IN (
                    'opening_wdv',
                    'addition',
                    'disposal',
                    'allowance',
                    'private_use',
                    'other'
                ));
            END IF;
        END $$;


        CREATE INDEX IF NOT EXISTS company_8_asset_tax_profiles_asset_idx
        ON company_8.asset_tax_profiles(asset_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_tax_profiles_auth_idx
        ON company_8.asset_tax_profiles(tax_authority_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_tax_runs_year_idx
        ON company_8.asset_tax_runs(company_id, tax_authority_id, tax_year);

        CREATE INDEX IF NOT EXISTS company_8_asset_tax_run_lines_asset_idx
        ON company_8.asset_tax_run_lines(asset_id);

        CREATE INDEX IF NOT EXISTS company_8_asset_tax_adjustments_asset_year_idx
        ON company_8.asset_tax_adjustments(asset_id, tax_authority_id, tax_year);

        -- ==================================================
        -- LOANS & FINANCING
        -- ==================================================

        CREATE TABLE IF NOT EXISTS company_8.loans (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            loan_name TEXT NOT NULL,
            loan_reference TEXT NULL,
            lender_name TEXT NOT NULL,
            lender_id INT NULL,

            loan_type TEXT NOT NULL DEFAULT 'term_loan', -- term_loan|vehicle|mortgage|overdraft|director_loan|other

            start_date DATE NOT NULL,
            first_payment_date DATE NOT NULL,
            maturity_date DATE NULL,

            principal_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            annual_interest_rate NUMERIC(12,6) NOT NULL DEFAULT 0,
            interest_method TEXT NOT NULL DEFAULT 'amortised_fixed_payment',
            -- amortised_fixed_payment|straight_line_interest|interest_only|manual

            term_count INT NOT NULL DEFAULT 0,
            payment_frequency TEXT NOT NULL DEFAULT 'monthly', -- weekly|monthly|quarterly|annually
            balloon_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            fees_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            accrued_interest_opening NUMERIC(18,2) NOT NULL DEFAULT 0,

            repayment_holiday_count INT NOT NULL DEFAULT 0,
            variable_rate BOOLEAN NOT NULL DEFAULT FALSE,
            rate_review_rule TEXT NULL,

            bank_account_id INT NULL,

            interest_expense_account_code TEXT NOT NULL,
            accrued_interest_account_code TEXT NULL,
            loan_payable_current_account_code TEXT NOT NULL,
            loan_payable_noncurrent_account_code TEXT NOT NULL,
            fees_asset_account_code TEXT NULL,
            fees_expense_account_code TEXT NULL,

            currency TEXT NOT NULL,

            payment_amount NUMERIC(18,2) NULL,
            total_interest_projected NUMERIC(18,2) NOT NULL DEFAULT 0,
            total_repayment_projected NUMERIC(18,2) NOT NULL DEFAULT 0,
            next_due_date DATE NULL,

            outstanding_principal NUMERIC(18,2) NOT NULL DEFAULT 0,
            outstanding_interest NUMERIC(18,2) NOT NULL DEFAULT 0,

            status TEXT NOT NULL DEFAULT 'draft', -- draft|active|closed|restructured|void
            schedule_version INT NOT NULL DEFAULT 1,

            originated_journal_id INT NULL,
            last_reclass_journal_id INT NULL,

            last_payment_date DATE NULL,
            closed_at TIMESTAMPTZ NULL,

            notes TEXT NULL,
            agreement_reference TEXT NULL,
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,

            created_by INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Safe additive evolution (loans)
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS company_id INT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS loan_name TEXT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS loan_reference TEXT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS lender_name TEXT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS lender_id INT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS loan_type TEXT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS start_date DATE;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS first_payment_date DATE;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS maturity_date DATE;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS principal_amount NUMERIC(18,2);
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS annual_interest_rate NUMERIC(12,6);
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS interest_method TEXT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS term_count INT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS payment_frequency TEXT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS balloon_amount NUMERIC(18,2);
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS fees_amount NUMERIC(18,2);
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS accrued_interest_opening NUMERIC(18,2);
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS repayment_holiday_count INT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS variable_rate BOOLEAN;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS rate_review_rule TEXT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS bank_account_id INT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS interest_expense_account_code TEXT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS accrued_interest_account_code TEXT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS loan_payable_current_account_code TEXT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS loan_payable_noncurrent_account_code TEXT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS fees_asset_account_code TEXT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS fees_expense_account_code TEXT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS currency TEXT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(18,2);
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS total_interest_projected NUMERIC(18,2);
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS total_repayment_projected NUMERIC(18,2);
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS next_due_date DATE;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS outstanding_principal NUMERIC(18,2);
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS outstanding_interest NUMERIC(18,2);
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS status TEXT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS schedule_version INT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS originated_journal_id INT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS last_reclass_journal_id INT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS last_payment_date DATE;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS agreement_reference TEXT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS meta_json JSONB;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS created_by INT;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
        ALTER TABLE company_8.loans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
        ALTER TABLE company_8.loans
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        UPDATE company_8.loans
        SET company_id = 8
        WHERE company_id IS NULL;

        ALTER TABLE company_8.loans
        ALTER COLUMN company_id SET NOT NULL,
        ALTER COLUMN company_id SET DEFAULT 8;

        UPDATE company_8.loans
        SET variable_rate = COALESCE(variable_rate, FALSE)
        WHERE variable_rate IS NULL;

        UPDATE company_8.loans
        SET status = COALESCE(NULLIF(status,''), 'draft')
        WHERE status IS NULL OR status = '';

        UPDATE company_8.loans
        SET schedule_version = COALESCE(schedule_version, 1)
        WHERE schedule_version IS NULL;

        UPDATE company_8.loans
        SET principal_amount = COALESCE(principal_amount, 0),
            annual_interest_rate = COALESCE(annual_interest_rate, 0),
            balloon_amount = COALESCE(balloon_amount, 0),
            fees_amount = COALESCE(fees_amount, 0),
            accrued_interest_opening = COALESCE(accrued_interest_opening, 0),
            repayment_holiday_count = COALESCE(repayment_holiday_count, 0),
            total_interest_projected = COALESCE(total_interest_projected, 0),
            total_repayment_projected = COALESCE(total_repayment_projected, 0),
            outstanding_principal = COALESCE(outstanding_principal, principal_amount, 0),
            outstanding_interest = COALESCE(outstanding_interest, accrued_interest_opening, 0)
        WHERE principal_amount IS NULL
           OR annual_interest_rate IS NULL
           OR balloon_amount IS NULL
           OR fees_amount IS NULL
           OR accrued_interest_opening IS NULL
           OR repayment_holiday_count IS NULL
           OR total_interest_projected IS NULL
           OR total_repayment_projected IS NULL
           OR outstanding_principal IS NULL
           OR outstanding_interest IS NULL;

        UPDATE company_8.loans
        SET meta_json = COALESCE(meta_json, '{}'::jsonb)
        WHERE meta_json IS NULL;

        UPDATE company_8.loans
        SET created_at = COALESCE(created_at, NOW())
        WHERE created_at IS NULL;

        UPDATE company_8.loans
        SET updated_at = COALESCE(updated_at, NOW())
        WHERE updated_at IS NULL;

        ALTER TABLE company_8.loans
        ALTER COLUMN variable_rate SET NOT NULL,
        ALTER COLUMN variable_rate SET DEFAULT FALSE,
        ALTER COLUMN status SET NOT NULL,
        ALTER COLUMN status SET DEFAULT 'draft',
        ALTER COLUMN schedule_version SET NOT NULL,
        ALTER COLUMN schedule_version SET DEFAULT 1,
        ALTER COLUMN meta_json SET NOT NULL,
        ALTER COLUMN meta_json SET DEFAULT '{}'::jsonb,
        ALTER COLUMN created_at SET NOT NULL,
        ALTER COLUMN created_at SET DEFAULT NOW(),
        ALTER COLUMN updated_at SET NOT NULL,
        ALTER COLUMN updated_at SET DEFAULT NOW();

        DO $ck_loans$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_loans_valid_ck'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.loans DROP CONSTRAINT %I',
                    'company_8', 'company_8_loans_valid_ck'
                );
            END IF;

            EXECUTE format(
                'ALTER TABLE %I.loans
                 ADD CONSTRAINT %I
                 CHECK (
                    principal_amount >= 0
                    AND annual_interest_rate >= 0
                    AND balloon_amount >= 0
                    AND fees_amount >= 0
                    AND accrued_interest_opening >= 0
                    AND repayment_holiday_count >= 0
                    AND term_count > 0
                    AND outstanding_principal >= 0
                    AND outstanding_interest >= 0
                    AND payment_frequency IN (''weekly'',''monthly'',''quarterly'',''annually'')
                    AND interest_method IN (''amortised_fixed_payment'',''straight_line_interest'',''interest_only'',''manual'')
                    AND loan_type IN (''term_loan'',''vehicle'',''mortgage'',''overdraft'',''director_loan'',''other'')
                    AND status IN (''draft'',''active'',''closed'',''restructured'',''void'')
                 )',
                'company_8', 'company_8_loans_valid_ck'
            );
        END $ck_loans$;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_loans_reference_uq
        ON company_8.loans(company_id, lower(trim(loan_reference)))
        WHERE loan_reference IS NOT NULL AND trim(loan_reference) <> '';

        CREATE INDEX IF NOT EXISTS company_8_loans_status_idx
        ON company_8.loans(company_id, status);

        CREATE INDEX IF NOT EXISTS company_8_loans_lender_idx
        ON company_8.loans(company_id, lender_name);

        CREATE INDEX IF NOT EXISTS company_8_loans_due_idx
        ON company_8.loans(company_id, next_due_date);

        CREATE INDEX IF NOT EXISTS company_8_loans_bank_idx
        ON company_8.loans(company_id, bank_account_id);



        CREATE TABLE IF NOT EXISTS company_8.asset_borrowing_links (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            asset_id INT NOT NULL,
            loan_id INT NOT NULL,
            capitalization_start_date DATE NOT NULL,
            capitalization_end_date DATE NULL,
            capitalization_ratio NUMERIC(9,6) NOT NULL DEFAULT 1.0,
            status TEXT NOT NULL DEFAULT 'active',
            notes TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS company_8.asset_borrowing_costs (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            asset_id INT NOT NULL,
            loan_id INT NOT NULL,
            journal_id INT NULL,
            payment_id INT NULL,
            interest_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            capitalized_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            expensed_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            capitalization_ratio NUMERIC(9,6) NOT NULL DEFAULT 1.0,
            capitalization_date DATE NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS company_8.loan_schedules (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            loan_id INT NOT NULL,

            schedule_version INT NOT NULL DEFAULT 1,
            period_no INT NOT NULL,

            due_date DATE NOT NULL,
            opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
            scheduled_payment NUMERIC(18,2) NOT NULL DEFAULT 0,
            scheduled_interest NUMERIC(18,2) NOT NULL DEFAULT 0,
            scheduled_principal NUMERIC(18,2) NOT NULL DEFAULT 0,
            closing_balance NUMERIC(18,2) NOT NULL DEFAULT 0,

            current_portion_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            noncurrent_portion_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            payment_status TEXT NOT NULL DEFAULT 'open', -- open|partial|paid|skipped|capitalised
            paid_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            paid_interest NUMERIC(18,2) NOT NULL DEFAULT 0,
            paid_principal NUMERIC(18,2) NOT NULL DEFAULT 0,
            last_payment_date DATE NULL,

            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS company_id INT;
        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS loan_id INT;
        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS schedule_version INT;
        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS period_no INT;
        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS due_date DATE;
        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(18,2);
        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS scheduled_payment NUMERIC(18,2);
        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS scheduled_interest NUMERIC(18,2);
        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS scheduled_principal NUMERIC(18,2);
        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS closing_balance NUMERIC(18,2);
        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS current_portion_amount NUMERIC(18,2);
        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS noncurrent_portion_amount NUMERIC(18,2);
        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS payment_status TEXT;
        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(18,2);
        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS paid_interest NUMERIC(18,2);
        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS paid_principal NUMERIC(18,2);
        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS last_payment_date DATE;
        ALTER TABLE company_8.loan_schedules ADD COLUMN IF NOT EXISTS meta_json JSONB;

        UPDATE company_8.loan_schedules
        SET company_id = 8
        WHERE company_id IS NULL;

        ALTER TABLE company_8.loan_schedules
        ALTER COLUMN company_id SET NOT NULL,
        ALTER COLUMN company_id SET DEFAULT 8;

        UPDATE company_8.loan_schedules
        SET schedule_version = COALESCE(schedule_version, 1),
            opening_balance = COALESCE(opening_balance, 0),
            scheduled_payment = COALESCE(scheduled_payment, 0),
            scheduled_interest = COALESCE(scheduled_interest, 0),
            scheduled_principal = COALESCE(scheduled_principal, 0),
            closing_balance = COALESCE(closing_balance, 0),
            current_portion_amount = COALESCE(current_portion_amount, 0),
            noncurrent_portion_amount = COALESCE(noncurrent_portion_amount, 0),
            paid_amount = COALESCE(paid_amount, 0),
            paid_interest = COALESCE(paid_interest, 0),
            paid_principal = COALESCE(paid_principal, 0),
            payment_status = COALESCE(NULLIF(payment_status,''), 'open'),
            meta_json = COALESCE(meta_json, '{}'::jsonb);

        ALTER TABLE company_8.loan_schedules
        ALTER COLUMN schedule_version SET NOT NULL,
        ALTER COLUMN schedule_version SET DEFAULT 1,
        ALTER COLUMN payment_status SET NOT NULL,
        ALTER COLUMN payment_status SET DEFAULT 'open',
        ALTER COLUMN meta_json SET NOT NULL,
        ALTER COLUMN meta_json SET DEFAULT '{}'::jsonb;

        DO $ck_loan_schedules$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_loan_schedules_valid_ck'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.loan_schedules DROP CONSTRAINT %I',
                    'company_8', 'company_8_loan_schedules_valid_ck'
                );
            END IF;

            EXECUTE format(
                'ALTER TABLE %I.loan_schedules
                 ADD CONSTRAINT %I
                 CHECK (
                    period_no > 0
                    AND opening_balance >= 0
                    AND scheduled_payment >= 0
                    AND scheduled_interest >= 0
                    AND scheduled_principal >= 0
                    AND closing_balance >= 0
                    AND current_portion_amount >= 0
                    AND noncurrent_portion_amount >= 0
                    AND paid_amount >= 0
                    AND paid_interest >= 0
                    AND paid_principal >= 0
                    AND payment_status IN (''open'',''partial'',''paid'',''skipped'',''capitalised'')
                 )',
                'company_8', 'company_8_loan_schedules_valid_ck'
            );
        END $ck_loan_schedules$;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_loan_sched_ver_period_uq
        ON company_8.loan_schedules(company_id, loan_id, schedule_version, period_no);

        CREATE INDEX IF NOT EXISTS company_8_loan_sched_due_idx
        ON company_8.loan_schedules(company_id, loan_id, due_date);

        CREATE INDEX IF NOT EXISTS company_8_loan_sched_status_idx
        ON company_8.loan_schedules(company_id, payment_status);

        CREATE TABLE IF NOT EXISTS company_8.loan_payments (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            loan_id INT NOT NULL,

            payment_date DATE NOT NULL,
            amount_paid NUMERIC(18,2) NOT NULL DEFAULT 0,

            bank_account_id INT NOT NULL,
            reference TEXT NULL,
            description TEXT NULL,

            auto_calculate_split BOOLEAN NOT NULL DEFAULT TRUE,

            principal_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            interest_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            accrued_interest_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            fees_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            penalties_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            allocation_method TEXT NOT NULL DEFAULT 'schedule_order', -- schedule_order|manual
            status TEXT NOT NULL DEFAULT 'draft', -- draft|approved|posted|void|reversed

            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,

            approved_by INT NULL,
            approved_at TIMESTAMPTZ NULL,
            created_by INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            notes TEXT NULL,
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS company_id INT;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS loan_id INT;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS payment_date DATE;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(18,2);
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS bank_account_id INT;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS reference TEXT;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS auto_calculate_split BOOLEAN;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS principal_amount NUMERIC(18,2);
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS interest_amount NUMERIC(18,2);
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS accrued_interest_amount NUMERIC(18,2);
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS fees_amount NUMERIC(18,2);
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS penalties_amount NUMERIC(18,2);
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS allocation_method TEXT;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS status TEXT;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS posted_journal_id INT;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS approved_by INT;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS created_by INT;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS meta_json JSONB;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS payment_type TEXT;
        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS target_schedule_id INT;
        ALTER TABLE company_8.loan_payments
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        UPDATE company_8.loan_payments
        SET company_id = 8
        WHERE company_id IS NULL;

        ALTER TABLE company_8.loan_payments
        ALTER COLUMN company_id SET NOT NULL,
        ALTER COLUMN company_id SET DEFAULT 8;

        ALTER TABLE company_8.loan_payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
        UPDATE company_8.loan_payments
        SET updated_at = COALESCE(updated_at, NOW())
        WHERE updated_at IS NULL;

        ALTER TABLE company_8.loan_payments
        ALTER COLUMN updated_at SET NOT NULL,
        ALTER COLUMN updated_at SET DEFAULT NOW();

        UPDATE company_8.loan_payments
        SET payment_type = COALESCE(NULLIF(payment_type,''), 'standard')
        WHERE payment_type IS NULL OR payment_type = '';

        ALTER TABLE company_8.loan_payments
        ALTER COLUMN payment_type SET NOT NULL,
        ALTER COLUMN payment_type SET DEFAULT 'standard';

        UPDATE company_8.loan_payments
        SET auto_calculate_split = COALESCE(auto_calculate_split, TRUE),
            principal_amount = COALESCE(principal_amount, 0),
            interest_amount = COALESCE(interest_amount, 0),
            accrued_interest_amount = COALESCE(accrued_interest_amount, 0),
            fees_amount = COALESCE(fees_amount, 0),
            penalties_amount = COALESCE(penalties_amount, 0),
            allocation_method = COALESCE(NULLIF(allocation_method,''), 'schedule_order'),
            status = COALESCE(NULLIF(status,''), 'draft'),
            created_at = COALESCE(created_at, NOW()),
            meta_json = COALESCE(meta_json, '{}'::jsonb);

        ALTER TABLE company_8.loan_payments
        ALTER COLUMN auto_calculate_split SET NOT NULL,
        ALTER COLUMN auto_calculate_split SET DEFAULT TRUE,
        ALTER COLUMN allocation_method SET NOT NULL,
        ALTER COLUMN allocation_method SET DEFAULT 'schedule_order',
        ALTER COLUMN status SET NOT NULL,
        ALTER COLUMN status SET DEFAULT 'draft',
        ALTER COLUMN created_at SET NOT NULL,
        ALTER COLUMN created_at SET DEFAULT NOW(),
        ALTER COLUMN meta_json SET NOT NULL,
        ALTER COLUMN meta_json SET DEFAULT '{}'::jsonb;

        ALTER TABLE company_8.loan_payments
        ADD COLUMN IF NOT EXISTS primary_schedule_id INT NULL;

        DO $ck_loan_payments$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_loan_payments_valid_ck'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.loan_payments DROP CONSTRAINT %I',
                    'company_8', 'company_8_loan_payments_valid_ck'
                );
            END IF;

            EXECUTE format($sql$
                ALTER TABLE %I.loan_payments
                ADD CONSTRAINT %I
                CHECK (
                    amount_paid > 0
                    AND principal_amount >= 0
                    AND interest_amount >= 0
                    AND accrued_interest_amount >= 0
                    AND fees_amount >= 0
                    AND penalties_amount >= 0
                    AND COALESCE(allocation_method,'') IN ('schedule_order','manual')
                    AND COALESCE(payment_type,'') IN ('standard','prepayment')
                    AND COALESCE(status,'') IN ('draft','approved','posted','void','reversed')
                )
            $sql$, 'company_8', 'company_8_loan_payments_valid_ck');
        END $ck_loan_payments$;

        CREATE INDEX IF NOT EXISTS company_8_loan_payments_loan_date_idx
        ON company_8.loan_payments(company_id, loan_id, payment_date DESC);

        CREATE INDEX IF NOT EXISTS company_8_loan_payments_status_idx
        ON company_8.loan_payments(company_id, status);

        CREATE INDEX IF NOT EXISTS company_8_loan_payments_posted_journal_idx
        ON company_8.loan_payments(posted_journal_id);

        CREATE TABLE IF NOT EXISTS company_8.loan_payment_allocations (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            payment_id INT NOT NULL,
            loan_id INT NOT NULL,
            loan_schedule_id INT NULL,

            allocation_type TEXT NOT NULL, -- interest|principal|accrued_interest|fees|penalty
            amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            allocation_order INT NOT NULL DEFAULT 1,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.loan_payment_allocations ADD COLUMN IF NOT EXISTS company_id INT;
        ALTER TABLE company_8.loan_payment_allocations ADD COLUMN IF NOT EXISTS payment_id INT;
        ALTER TABLE company_8.loan_payment_allocations ADD COLUMN IF NOT EXISTS loan_id INT;
        ALTER TABLE company_8.loan_payment_allocations ADD COLUMN IF NOT EXISTS loan_schedule_id INT;
        ALTER TABLE company_8.loan_payment_allocations ADD COLUMN IF NOT EXISTS allocation_type TEXT;
        ALTER TABLE company_8.loan_payment_allocations ADD COLUMN IF NOT EXISTS amount NUMERIC(18,2);
        ALTER TABLE company_8.loan_payment_allocations ADD COLUMN IF NOT EXISTS allocation_order INT;
        ALTER TABLE company_8.loan_payment_allocations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

        UPDATE company_8.loan_payment_allocations
        SET company_id = 8
        WHERE company_id IS NULL;

        ALTER TABLE company_8.loan_payment_allocations
        ALTER COLUMN company_id SET NOT NULL,
        ALTER COLUMN company_id SET DEFAULT 8;

        UPDATE company_8.loan_payment_allocations
        SET amount = COALESCE(amount, 0),
            allocation_order = COALESCE(allocation_order, 1),
            created_at = COALESCE(created_at, NOW());

        ALTER TABLE company_8.loan_payment_allocations
        ALTER COLUMN allocation_order SET NOT NULL,
        ALTER COLUMN allocation_order SET DEFAULT 1,
        ALTER COLUMN created_at SET NOT NULL,
        ALTER COLUMN created_at SET DEFAULT NOW();

        DO $ck_loan_alloc$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_loan_payment_alloc_valid_ck'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.loan_payment_allocations DROP CONSTRAINT %I',
                    'company_8', 'company_8_loan_payment_alloc_valid_ck'
                );
            END IF;

            EXECUTE format(
                'ALTER TABLE %I.loan_payment_allocations
                 ADD CONSTRAINT %I
                 CHECK (
                    amount > 0
                    AND allocation_order > 0
                    AND allocation_type IN (''interest'',''principal'',''accrued_interest'',''fees'',''penalty'')
                 )',
                'company_8', 'company_8_loan_payment_alloc_valid_ck'
            );
        END $ck_loan_alloc$;

        CREATE INDEX IF NOT EXISTS company_8_loan_alloc_payment_idx
        ON company_8.loan_payment_allocations(company_id, payment_id);

        CREATE INDEX IF NOT EXISTS company_8_loan_alloc_schedule_idx
        ON company_8.loan_payment_allocations(company_id, loan_schedule_id);

        -- --------------------------------------------------
        -- FKs
        -- --------------------------------------------------
        DO $loan_fks$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_loans_originated_journal_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.loans
                     ADD CONSTRAINT %I
                     FOREIGN KEY (originated_journal_id)
                     REFERENCES %I.journal(id)
                     ON DELETE SET NULL',
                    'company_8', 'company_8_loans_originated_journal_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_loans_last_reclass_journal_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.loans
                     ADD CONSTRAINT %I
                     FOREIGN KEY (last_reclass_journal_id)
                     REFERENCES %I.journal(id)
                     ON DELETE SET NULL',
                    'company_8', 'company_8_loans_last_reclass_journal_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_loan_sched_loan_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.loan_schedules
                     ADD CONSTRAINT %I
                     FOREIGN KEY (loan_id)
                     REFERENCES %I.loans(id)
                     ON DELETE CASCADE',
                    'company_8', 'company_8_loan_sched_loan_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_loan_payment_loan_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.loan_payments
                     ADD CONSTRAINT %I
                     FOREIGN KEY (loan_id)
                     REFERENCES %I.loans(id)
                     ON DELETE CASCADE',
                    'company_8', 'company_8_loan_payment_loan_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_loan_payment_posted_journal_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.loan_payments
                     ADD CONSTRAINT %I
                     FOREIGN KEY (posted_journal_id)
                     REFERENCES %I.journal(id)
                     ON DELETE SET NULL',
                    'company_8', 'company_8_loan_payment_posted_journal_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_loan_alloc_payment_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.loan_payment_allocations
                     ADD CONSTRAINT %I
                     FOREIGN KEY (payment_id)
                     REFERENCES %I.loan_payments(id)
                     ON DELETE CASCADE',
                    'company_8', 'company_8_loan_alloc_payment_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_loan_alloc_loan_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.loan_payment_allocations
                     ADD CONSTRAINT %I
                     FOREIGN KEY (loan_id)
                     REFERENCES %I.loans(id)
                     ON DELETE CASCADE',
                    'company_8', 'company_8_loan_alloc_loan_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_loan_alloc_sched_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.loan_payment_allocations
                     ADD CONSTRAINT %I
                     FOREIGN KEY (loan_schedule_id)
                     REFERENCES %I.loan_schedules(id)
                     ON DELETE SET NULL',
                    'company_8', 'company_8_loan_alloc_sched_fk', 'company_8'
                );
            END IF;
        END $loan_fks$;

        -- --------------------------------------------------
        -- Optional updated_at trigger on loans
        -- --------------------------------------------------
        DO $loan_touch$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger
                WHERE tgname = 'company_8_loans_touch'
            ) THEN
                EXECUTE format(
                    'CREATE TRIGGER %I
                     BEFORE UPDATE ON %I.loans
                     FOR EACH ROW
                     EXECUTE PROCEDURE %I.touch_updated_at()',
                    'company_8_loans_touch',
                    'company_8',
                    'company_8'
                );
            END IF;
        END $loan_touch$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_loan_payment_primary_sched_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.loan_payments
                    ADD CONSTRAINT %I
                    FOREIGN KEY (primary_schedule_id)
                    REFERENCES %I.loan_schedules(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8_loan_payment_primary_sched_fk',
                    'company_8'
                );
            END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_indexes
                WHERE schemaname = 'company_8'
                AND indexname = 'company_8_loan_payments_sched_open_uq'
            ) THEN
                EXECUTE format($sql$
                    CREATE UNIQUE INDEX %I
                    ON %I.loan_payments(company_id, primary_schedule_id)
                    WHERE primary_schedule_id IS NOT NULL
                    AND status IN ('draft','approved','posted')
                $sql$, 'company_8_loan_payments_sched_open_uq', 'company_8');
            END IF;
        END $$;

        -- ==================================================
        -- SERVICE ITEMS  (FULL + SAFE EVOLVE)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.service_items (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT NULL,
            revenue_account TEXT NULL,
            cost_account TEXT NULL,
            vat_code TEXT NULL,
            unit TEXT NULL,
            price NUMERIC(18,4) NOT NULL DEFAULT 0,
            is_taxable BOOLEAN NOT NULL DEFAULT TRUE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Legacy-safe: ensure company_id exists + populated + constrained
        ALTER TABLE company_8.service_items ADD COLUMN IF NOT EXISTS company_id INT;
        UPDATE company_8.service_items SET company_id = 8 WHERE company_id IS NULL;
        ALTER TABLE company_8.service_items ALTER COLUMN company_id SET DEFAULT 8;
        ALTER TABLE company_8.service_items ALTER COLUMN company_id SET NOT NULL;

        -- Legacy-safe: common fields (in case table existed without them)
        ALTER TABLE company_8.service_items ADD COLUMN IF NOT EXISTS unit TEXT NULL;
        ALTER TABLE company_8.service_items ADD COLUMN IF NOT EXISTS price NUMERIC(18,4) NOT NULL DEFAULT 0;
        ALTER TABLE company_8.service_items ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE company_8.service_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

        -- ✅ unique service code per company (ignore blanks)
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'company_8'
            AND indexname = 'company_8_service_items_code_uniq'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX %I ON %I.service_items(company_id, lower(trim(code)))
            WHERE code IS NOT NULL AND trim(code) <> ''''',
            'company_8_service_items_code_uniq',
            'company_8'
            );
        END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS company_8_service_items_active_idx
        ON company_8.service_items(company_id, is_active);

        CREATE INDEX IF NOT EXISTS company_8_service_items_company_idx
        ON company_8.service_items(company_id);

        CREATE INDEX IF NOT EXISTS company_8_service_items_company_code_idx
        ON company_8.service_items(company_id, lower(coalesce(code,'')));

        CREATE INDEX IF NOT EXISTS company_8_service_items_company_active_idx
        ON company_8.service_items(company_id, is_active);


        -- ==================================================
        -- INVENTORY (CLEAN + UPGRADE-SAFE)
        -- ==================================================

        -- 1) Inventory items
        CREATE TABLE IF NOT EXISTS company_8.inventory_items (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            sku TEXT NOT NULL,
            name TEXT NOT NULL,

            description TEXT NULL,                -- ✅ add
            category TEXT NULL,
            unit TEXT NULL,

            inventory_account TEXT NULL,
            income_account TEXT NULL,
            cogs_account TEXT NULL,
            valuation_method TEXT NULL,           -- 'AVG' | 'FIFO'

            barcode TEXT NULL,

            sales_price NUMERIC(18,4) NOT NULL DEFAULT 0,
            purchase_cost NUMERIC(18,6) NOT NULL DEFAULT 0,  -- ✅ add (matches your code)
            vat_code TEXT NULL,

            reorder_level NUMERIC(18,4) NOT NULL DEFAULT 0,
            track_stock BOOLEAN NOT NULL DEFAULT TRUE,
            is_taxable BOOLEAN NOT NULL DEFAULT TRUE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            item_type TEXT NULL,                  -- optional
            serial_tracking BOOLEAN NOT NULL DEFAULT FALSE, -- optional

            meta JSONB NOT NULL DEFAULT '{}'::jsonb,         -- ✅ add

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Legacy-safe: ensure company_id exists and is populated (only matters for old schemas)
        ALTER TABLE company_8.inventory_items ADD COLUMN IF NOT EXISTS company_id INT;
        UPDATE company_8.inventory_items SET company_id = 8 WHERE company_id IS NULL;
        ALTER TABLE company_8.inventory_items ALTER COLUMN company_id SET DEFAULT 8;
        ALTER TABLE company_8.inventory_items ALTER COLUMN company_id SET NOT NULL;

        ALTER TABLE company_8.inventory_items
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        -- Helpful indexes
        CREATE INDEX IF NOT EXISTS company_8_inventory_items_company_active_idx
        ON company_8.inventory_items(company_id, is_active);

        CREATE INDEX IF NOT EXISTS company_8_inventory_items_company_sku_idx
        ON company_8.inventory_items(company_id, lower(coalesce(sku,'')));

        CREATE INDEX IF NOT EXISTS company_8_inventory_items_company_barcode_idx
        ON company_8.inventory_items(company_id, lower(coalesce(barcode,'')));

        ALTER TABLE company_8.inventory_items
        ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;

        ALTER TABLE company_8.inventory_items
        ADD COLUMN IF NOT EXISTS description TEXT NULL;

        ALTER TABLE company_8.inventory_items
        ADD COLUMN IF NOT EXISTS purchase_cost NUMERIC(18,6) NOT NULL DEFAULT 0;

        ALTER TABLE company_8.inventory_items
        ADD COLUMN IF NOT EXISTS item_type TEXT NULL;

        ALTER TABLE company_8.inventory_items
        ADD COLUMN IF NOT EXISTS serial_tracking BOOLEAN NOT NULL DEFAULT FALSE;

        -- SKU unique per company (ignore blanks)
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'company_8'
            AND indexname  = 'company_8_inventory_items_sku_uniq'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX %I ON %I.inventory_items(company_id, lower(trim(sku)))
            WHERE sku IS NOT NULL AND trim(sku) <> ''''',
            'company_8_inventory_items_sku_uniq',
            'company_8'
            );
        END IF;
        END $$;

        -- Barcode unique per company (ignore blanks)
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'company_8'
            AND indexname  = 'company_8_inventory_items_barcode_uniq'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX %I ON %I.inventory_items(company_id, lower(trim(barcode)))
            WHERE barcode IS NOT NULL AND trim(barcode) <> ''''',
            'company_8_inventory_items_barcode_uniq',
            'company_8'
            );
        END IF;
        END $$;

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE n.nspname='company_8' AND c.conname='company_8_items_nonneg_chk'
            ) THEN
            EXECUTE format(
                'ALTER TABLE %I.inventory_items
                ADD CONSTRAINT %I CHECK (sales_price >= 0 AND purchase_cost >= 0 AND reorder_level >= 0)',
                'company_8', 'company_8_items_nonneg_chk'
            );
        END IF;
        END $$;

        -- 2) inventory_tx
        CREATE TABLE IF NOT EXISTS company_8.inventory_tx (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            tx_date DATE NOT NULL,
            tx_type TEXT NOT NULL DEFAULT 'adjustment',  -- receipt|sale|adjustment|issue_to_job|transfer|count
            status TEXT NOT NULL DEFAULT 'draft',        -- draft|posted|void
            ref TEXT NULL,
            notes TEXT NULL,
            source TEXT NULL,                            -- ap_bill|pos|invoice|manual|job|stocktake
            source_id INT NULL,
            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,
            posted_by INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Legacy-safe
        ALTER TABLE company_8.inventory_tx ADD COLUMN IF NOT EXISTS company_id INT;
        UPDATE company_8.inventory_tx SET company_id = 8 WHERE company_id IS NULL;
        ALTER TABLE company_8.inventory_tx ALTER COLUMN company_id SET DEFAULT 8;
        ALTER TABLE company_8.inventory_tx ALTER COLUMN company_id SET NOT NULL;

        ALTER TABLE company_8.inventory_tx
        ADD COLUMN IF NOT EXISTS created_by INT NULL;

        ALTER TABLE company_8.inventory_tx
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        ALTER TABLE company_8.inventory_tx
        ADD COLUMN IF NOT EXISTS vendor_id INT NULL;

        -- Optional: link to purchase_orders header if you want header-level match
        ALTER TABLE company_8.inventory_tx
        ADD COLUMN IF NOT EXISTS po_id INT NULL;

        -- Optional: invoice reference captured at receipt time (if it came with goods)
        ALTER TABLE company_8.inventory_tx
        ADD COLUMN IF NOT EXISTS supplier_invoice_no TEXT NULL;

        -- Optional: GRNI/billing status
        ALTER TABLE company_8.inventory_tx
        ADD COLUMN IF NOT EXISTS grni_status TEXT NOT NULL DEFAULT 'unbilled';

        ALTER TABLE company_8.inventory_tx
        ADD COLUMN IF NOT EXISTS grni_type TEXT NOT NULL DEFAULT 'inventory';

        ALTER TABLE company_8.inventory_tx
        ADD COLUMN IF NOT EXISTS funding_type TEXT NOT NULL DEFAULT 'supplier_credit',
        ADD COLUMN IF NOT EXISTS bank_account_id INT NULL;

        ALTER TABLE company_8.inventory_tx
        ADD COLUMN IF NOT EXISTS bank_account_id INT NULL;

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_inventory_tx_bank_account_fk'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.inventory_tx
            ADD CONSTRAINT %I
            FOREIGN KEY (bank_account_id)
            REFERENCES %I.company_bank_accounts(id)
            ON DELETE SET NULL',
            'company_8',
            'company_8_inventory_tx_bank_account_fk',
            'company_8'
            );
        END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_inventory_tx_grni_type_ck'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.inventory_tx
                    ADD CONSTRAINT %I
                    CHECK (grni_type IN (''inventory'', ''asset''))',
                    'company_8',
                    'company_8_inventory_tx_grni_type_ck'
                );
            END IF;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_inventory_tx_receive_ref_uniq
        ON company_8.inventory_tx(company_id, lower(trim(ref)))
        WHERE lower(tx_type) = 'receipt' AND ref IS NOT NULL AND trim(ref) <> '';

        CREATE INDEX IF NOT EXISTS company_8_inventory_tx_vendor_idx
        ON company_8.inventory_tx(company_id, vendor_id, tx_type, tx_date);

        CREATE INDEX IF NOT EXISTS company_8_inventory_tx_po_idx
        ON company_8.inventory_tx(company_id, po_id);
                
        CREATE INDEX IF NOT EXISTS company_8_inventory_tx_company_date_idx
        ON company_8.inventory_tx(company_id, tx_date);

        CREATE INDEX IF NOT EXISTS company_8_inventory_tx_company_status_idx
        ON company_8.inventory_tx(company_id, status);

        CREATE INDEX IF NOT EXISTS company_8_inventory_tx_source_idx
        ON company_8.inventory_tx(company_id, source, source_id);

        -- ✅ ONE TRUE idempotency rule (drop old wrong index and recreate correct one)
        DO $$
        BEGIN
        IF EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'company_8'
            AND indexname  = 'company_8_inventory_tx_source_uniq'
        ) THEN
            EXECUTE format('DROP INDEX %I.%I', 'company_8', 'company_8_inventory_tx_source_uniq');
        END IF;

        EXECUTE format(
            'CREATE UNIQUE INDEX %I
            ON %I.inventory_tx(company_id, source, source_id)
            WHERE source IS NOT NULL AND source_id IS NOT NULL',
            'company_8_inventory_tx_source_uniq',
            'company_8'
        );
        END $$;

        -- 3) inventory_layers
        CREATE TABLE IF NOT EXISTS company_8.inventory_layers (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            item_id INT NOT NULL REFERENCES company_8.inventory_items(id),
            tx_date DATE NOT NULL,
            qty_in NUMERIC(18,4) NOT NULL DEFAULT 0,
            qty_out NUMERIC(18,4) NOT NULL DEFAULT 0,
            unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
            ref TEXT NULL,
            source TEXT NULL,
            source_id INT NULL,
            expiry_date DATE NULL,
            batch_no TEXT NULL,
            tx_id INT NULL,
            posted_journal_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Legacy-safe (only matters for old schemas)
        ALTER TABLE company_8.inventory_layers ADD COLUMN IF NOT EXISTS company_id INT;
        UPDATE company_8.inventory_layers SET company_id = 8 WHERE company_id IS NULL;
        ALTER TABLE company_8.inventory_layers ALTER COLUMN company_id SET DEFAULT 8;
        ALTER TABLE company_8.inventory_layers ALTER COLUMN company_id SET NOT NULL;

        ALTER TABLE company_8.inventory_layers
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS cost_corrected_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS cost_corrected_by_user_id INT NULL;

        CREATE INDEX IF NOT EXISTS company_8_inventory_layers_company_idx
        ON company_8.inventory_layers(company_id);

        CREATE INDEX IF NOT EXISTS company_8_inventory_layers_item_date_idx
        ON company_8.inventory_layers(company_id, item_id, tx_date);

        CREATE INDEX IF NOT EXISTS company_8_inventory_layers_tx_idx
        ON company_8.inventory_layers(company_id, tx_id);

        -- ✅ Fast idempotency checks for AVG path
        CREATE INDEX IF NOT EXISTS company_8_inventory_layers_source_idx
        ON company_8.inventory_layers(company_id, source, source_id);

        -- ✅ FIFO pick performance (your fifo_consume ORDER BY tx_date, id)
        CREATE INDEX IF NOT EXISTS company_8_layers_fifo_pick_idx
        ON company_8.inventory_layers(company_id, item_id, tx_date, id);

        -- FK: layers.tx_id -> inventory_tx.id
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE n.nspname='company_8'
            AND c.conname='company_8_layers_tx_fk'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.inventory_layers
            ADD CONSTRAINT %I
            FOREIGN KEY (tx_id)
            REFERENCES %I.inventory_tx(id)
            ON DELETE SET NULL',
            'company_8', 'company_8_layers_tx_fk', 'company_8'
            );
        END IF;
        END $$;

        -- Data quality (non-negative)
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE n.nspname='company_8' AND c.conname='company_8_layers_nonneg_chk'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.inventory_layers
            ADD CONSTRAINT %I CHECK (qty_in >= 0 AND qty_out >= 0 AND unit_cost >= 0)',
            'company_8', 'company_8_layers_nonneg_chk'
            );
        END IF;
        END $$;


        -- 4) inventory_tx_lines
        CREATE TABLE IF NOT EXISTS company_8.inventory_tx_lines (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            tx_id INT NOT NULL REFERENCES company_8.inventory_tx(id) ON DELETE CASCADE,
            line_no INT NOT NULL,
            item_id INT NOT NULL REFERENCES company_8.inventory_items(id),
            qty NUMERIC(18,4) NOT NULL DEFAULT 0,
            unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
            unit_price NUMERIC(18,4) NOT NULL DEFAULT 0,
            vat_code TEXT NULL,
            memo TEXT NULL,
            expiry_date DATE NULL,
            batch_no TEXT NULL,
            po_line_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Legacy-safe
        ALTER TABLE company_8.inventory_tx_lines ADD COLUMN IF NOT EXISTS company_id INT;
        UPDATE company_8.inventory_tx_lines SET company_id = 8 WHERE company_id IS NULL;
        ALTER TABLE company_8.inventory_tx_lines ALTER COLUMN company_id SET DEFAULT 8;
        ALTER TABLE company_8.inventory_tx_lines ALTER COLUMN company_id SET NOT NULL;
        ALTER TABLE company_8.inventory_tx
        ADD COLUMN IF NOT EXISTS funding_type TEXT NULL;

        ALTER TABLE company_8.inventory_tx_lines
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS cost_corrected_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS cost_corrected_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS cost_correction_reason TEXT NULL;

        -- ✅ make sure column exists before indexing
        ALTER TABLE company_8.inventory_tx_lines
        ADD COLUMN IF NOT EXISTS po_line_id INT NULL;

        -- Unique line per tx
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE n.nspname='company_8' AND c.conname='uq_inventory_tx_lines_tx_line'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.inventory_tx_lines
            ADD CONSTRAINT uq_inventory_tx_lines_tx_line UNIQUE (tx_id, line_no)',
            'company_8'
            );
        END IF;
        END $$;

        -- unit_cost check (NOW table exists ✅)
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE n.nspname='company_8' AND c.conname='company_8_tx_lines_unit_cost_chk'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.inventory_tx_lines
            ADD CONSTRAINT %I CHECK (unit_cost >= 0)',
            'company_8', 'company_8_tx_lines_unit_cost_chk'
            );
        END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS company_8_inventory_tx_lines_company_tx_idx
        ON company_8.inventory_tx_lines(company_id, tx_id);

        CREATE INDEX IF NOT EXISTS company_8_inventory_tx_lines_item_idx
        ON company_8.inventory_tx_lines(company_id, item_id);

        CREATE INDEX IF NOT EXISTS company_8_inv_tx_lines_po_line_idx
        ON company_8.inventory_tx_lines(company_id, po_line_id);

        -- 5) inventory_transactions (separate header table you already have)
        CREATE TABLE IF NOT EXISTS company_8.inventory_transactions (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            tx_date DATE NOT NULL,
            tx_type TEXT NOT NULL,            -- sale|purchase|adjustment|transfer|opening
            source TEXT NULL,                 -- invoice|bill|pos_summary|manual|inventory_tx
            source_id INT NULL,
            ref TEXT NULL,
            notes TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_invtx_company_date_idx
        ON company_8.inventory_transactions(company_id, tx_date);

        -- ✅ prevent double inventory posting per source (company-scoped)
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'company_8'
            AND indexname = 'company_8_invtx_source_uniq'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX %I ON %I.inventory_transactions(company_id, source, source_id)
            WHERE source IS NOT NULL AND source_id IS NOT NULL',
            'company_8_invtx_source_uniq',
            'company_8'
            );
        END IF;
        END $$;

        -- 5) purchase_orders + lines (PO matching)
        CREATE TABLE IF NOT EXISTS company_8.purchase_orders (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            vendor_id INT NOT NULL,
            po_no TEXT NULL,
            po_date DATE NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            notes TEXT NULL,
            project_id INT NULL,
            task_id INT NULL,
            requested_by INT NULL,
            approved_by INT NULL,
            approved_at TIMESTAMPTZ NULL,
            expected_delivery_date DATE NULL,
            delivery_location TEXT NULL,
            po_type TEXT NOT NULL DEFAULT 'materials',
            source TEXT NULL,
            source_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS company_8.inventory_landed_costs (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            tx_date DATE NOT NULL,
            source TEXT NULL,          -- 'bill' | 'grv' | 'manual'
            source_id INT NULL,        -- bill_id / grv_id / etc

            ref TEXT NULL,
            notes TEXT NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_ilc_company_date_idx
        ON company_8.inventory_landed_costs(company_id, tx_date);

        -- prevent double posting per source (company-scoped)
        DO $$
        BEGIN
        IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'company_8' AND indexname = 'company_8_ilc_source_uniq'
        ) THEN
        EXECUTE format(
            'CREATE UNIQUE INDEX %I ON %I.inventory_landed_costs(company_id, source, source_id)
            WHERE source IS NOT NULL AND source_id IS NOT NULL',
            'company_8_ilc_source_uniq', 'company_8'
        );
        END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS company_8.inventory_landed_cost_allocations (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            landed_cost_id INT NOT NULL,     -- FK to header
            item_id INT NOT NULL,
            layer_id INT NOT NULL,

            amount NUMERIC(18,6) NOT NULL DEFAULT 0,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_lca_lookup_idx
        ON company_8.inventory_landed_cost_allocations(company_id, landed_cost_id);

        -- idempotency at line level (prevents double allocating to same layer)
        DO $$
        BEGIN
        IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'company_8' AND indexname = 'company_8_lca_uniq'
        ) THEN
        EXECUTE format(
            'CREATE UNIQUE INDEX %I ON %I.inventory_landed_cost_allocations(company_id, landed_cost_id, layer_id)',
            'company_8_lca_uniq', 'company_8'
        );
        END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS company_8.purchase_order_lines (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            po_id INT NOT NULL REFERENCES company_8.purchase_orders(id) ON DELETE CASCADE,
            line_no INT NOT NULL,
            item_id INT NOT NULL REFERENCES company_8.inventory_items(id),
            ordered_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
            received_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
            billed_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
            unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
            vat_code TEXT NULL,
            memo TEXT NULL,
            project_id INT NULL,
            task_id INT NULL,
            cost_code_id INT NULL,
            required_date DATE NULL,
            cancelled_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
            line_status TEXT NOT NULL DEFAULT 'open',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_po_lines_uniq
        ON company_8.purchase_order_lines(po_id, line_no);

        -- FK tx_lines.po_line_id -> purchase_order_lines.id
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE n.nspname='company_8' AND c.conname='company_8_inv_tx_lines_po_line_fk'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.inventory_tx_lines
            ADD CONSTRAINT %I
            FOREIGN KEY (po_line_id)
            REFERENCES %I.purchase_order_lines(id)
            ON DELETE SET NULL',
            'company_8', 'company_8_inv_tx_lines_po_line_fk', 'company_8'
            );
        END IF;
        END $$;

        -- 6) FIFO allocations (FIFO idempotency + traceability)
        CREATE TABLE IF NOT EXISTS company_8.inventory_fifo_allocations (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            item_id INT NOT NULL REFERENCES company_8.inventory_items(id) ON DELETE CASCADE,
            layer_id INT NOT NULL REFERENCES company_8.inventory_layers(id) ON DELETE CASCADE,
            qty NUMERIC(18,4) NOT NULL,
            unit_cost NUMERIC(18,6) NOT NULL,
            source TEXT NOT NULL,
            source_id INT NOT NULL,
            source_line_id BIGINT NULL,
            posted_journal_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.inventory_fifo_allocations
        ADD COLUMN IF NOT EXISTS source_line_id BIGINT;

        ALTER TABLE company_8.inventory_fifo_allocations
        ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(18,2);

        CREATE INDEX IF NOT EXISTS company_8_fifo_alloc_source_idx
        ON company_8.inventory_fifo_allocations(company_id, source, source_id);

        CREATE INDEX IF NOT EXISTS company_8_fifo_alloc_item_idx
        ON company_8.inventory_fifo_allocations(company_id, item_id);

        DROP INDEX IF EXISTS company_8.company_8_fifo_alloc_source_uniq;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_fifo_alloc_source_line_layer_uniq
        ON company_8.inventory_fifo_allocations
        (
            company_id,
            source,
            source_id,
            source_line_id,
            item_id,
            layer_id
        )
        WHERE source IS NOT NULL
        AND source_id IS NOT NULL
        AND source_line_id IS NOT NULL;

        -- ============================================================
        -- PROJECT MANAGEMENT / JOB COSTING
        -- ============================================================
        CREATE TABLE IF NOT EXISTS company_8.projects (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            project_code TEXT NOT NULL,
            project_name TEXT NOT NULL,
            customer_id INT NULL,

            project_type TEXT NOT NULL DEFAULT 'service',
            status TEXT NOT NULL DEFAULT 'draft',

            start_date DATE NULL,
            expected_end_date DATE NULL,
            actual_end_date DATE NULL,

            contract_value NUMERIC(18,2) NOT NULL DEFAULT 0,
            budget_value NUMERIC(18,2) NOT NULL DEFAULT 0,

            billing_method TEXT NOT NULL DEFAULT 'milestone',
            wip_account_code TEXT NULL,
            revenue_account_code TEXT NULL,
            cost_account_code TEXT NULL,

            location TEXT NULL,
            description TEXT NULL,
            notes TEXT NULL,
            meta JSONB NOT NULL DEFAULT '{}'::jsonb,

            created_by INT NULL,
            approved_by INT NULL,
            approved_at TIMESTAMPTZ NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_projects_code_uniq
        ON company_8.projects(company_id, lower(trim(project_code)))
        WHERE project_code IS NOT NULL AND trim(project_code) <> '';

        CREATE INDEX IF NOT EXISTS company_8_projects_status_idx
        ON company_8.projects(company_id, status);

        CREATE INDEX IF NOT EXISTS company_8_projects_customer_idx
        ON company_8.projects(company_id, customer_id);

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_projects_status_chk'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.projects
            ADD CONSTRAINT %I
            CHECK (status IN (''draft'',''approved'',''active'',''on_hold'',''completed'',''cancelled'',''closed''))',
            'company_8',
            'company_8_projects_status_chk'
            );
        END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS company_8.project_tasks (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            project_id INT NOT NULL REFERENCES company_8.projects(id) ON DELETE CASCADE,

            task_code TEXT NULL,
            task_name TEXT NOT NULL,
            parent_task_id INT NULL,

            status TEXT NOT NULL DEFAULT 'open',
            start_date DATE NULL,
            expected_end_date DATE NULL,
            actual_end_date DATE NULL,

            budget_value NUMERIC(18,2) NOT NULL DEFAULT 0,
            progress_percent NUMERIC(9,4) NOT NULL DEFAULT 0,

            notes TEXT NULL,
            meta JSONB NOT NULL DEFAULT '{}'::jsonb,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.project_tasks
        ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

        CREATE INDEX IF NOT EXISTS company_8_project_tasks_project_idx
        ON company_8.project_tasks(company_id, project_id);

        CREATE INDEX IF NOT EXISTS company_8_project_tasks_status_idx
        ON company_8.project_tasks(company_id, status);

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_project_tasks_code_uniq
        ON company_8.project_tasks(company_id, project_id, lower(trim(task_code)))
        WHERE task_code IS NOT NULL AND trim(task_code) <> '';

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_project_tasks_name_uniq
        ON company_8.project_tasks(company_id, project_id, lower(trim(task_name)));

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_project_tasks_status_chk'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.project_tasks
            ADD CONSTRAINT %I
            CHECK (
                status IN (
                ''open'',
                ''in_progress'',
                ''blocked'',
                ''completed'',
                ''cancelled''
                )
            )',
            'company_8',
            'company_8_project_tasks_status_chk'
            );
        END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS company_8.project_cost_codes (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            code TEXT NOT NULL,
            name TEXT NOT NULL,
            cost_type TEXT NOT NULL DEFAULT 'materials',

            default_account_code TEXT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_project_cost_codes_uniq
        ON company_8.project_cost_codes(company_id, lower(trim(code)))
        WHERE code IS NOT NULL AND trim(code) <> '';

        CREATE INDEX IF NOT EXISTS company_8_project_cost_codes_active_idx
        ON company_8.project_cost_codes(company_id, is_active);

        CREATE TABLE IF NOT EXISTS company_8.project_budget_lines (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            project_id INT NOT NULL REFERENCES company_8.projects(id) ON DELETE CASCADE,
            task_id INT NULL REFERENCES company_8.project_tasks(id) ON DELETE SET NULL,
            cost_code_id INT NULL REFERENCES company_8.project_cost_codes(id) ON DELETE SET NULL,

            line_no INT NOT NULL,
            description TEXT NULL,

            budget_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
            unit_cost NUMERIC(18,6) NOT NULL DEFAULT 0,
            budget_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            source TEXT NULL,
            source_id INT NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.project_budget_lines
        ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

        ALTER TABLE company_8.project_budget_lines
        ADD COLUMN IF NOT EXISTS line_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS cost_prefix TEXT NULL,
        ADD COLUMN IF NOT EXISTS cost_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_project_budget_lines_uniq
        ON company_8.project_budget_lines(project_id, line_no);

        CREATE INDEX IF NOT EXISTS company_8_project_budget_project_idx
        ON company_8.project_budget_lines(company_id, project_id);

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_project_budget_line_no_chk'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.project_budget_lines
            ADD CONSTRAINT %I
            CHECK (line_no > 0)',
            'company_8',
            'company_8_project_budget_line_no_chk'
            );
        END IF;
        END $$;

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_project_budget_qty_chk'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.project_budget_lines
            ADD CONSTRAINT %I
            CHECK (budget_qty >= 0)',
            'company_8',
            'company_8_project_budget_qty_chk'
            );
        END IF;
        END $$;

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_project_budget_amount_chk'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.project_budget_lines
            ADD CONSTRAINT %I
            CHECK (budget_amount >= 0)',
            'company_8',
            'company_8_project_budget_amount_chk'
            );
        END IF;
        END $$;

        ALTER TABLE company_8.purchase_orders
        ADD COLUMN IF NOT EXISTS project_id INT NULL,
        ADD COLUMN IF NOT EXISTS task_id INT NULL,
        ADD COLUMN IF NOT EXISTS requested_by INT NULL,
        ADD COLUMN IF NOT EXISTS approved_by INT NULL,
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS expected_delivery_date DATE NULL,
        ADD COLUMN IF NOT EXISTS delivery_location TEXT NULL,
        ADD COLUMN IF NOT EXISTS po_type TEXT NOT NULL DEFAULT 'materials',
        ADD COLUMN IF NOT EXISTS source TEXT NULL,
        ADD COLUMN IF NOT EXISTS source_id INT NULL;

        ALTER TABLE company_8.purchase_order_lines
        ADD COLUMN IF NOT EXISTS project_id INT NULL,
        ADD COLUMN IF NOT EXISTS task_id INT NULL,
        ADD COLUMN IF NOT EXISTS cost_code_id INT NULL,
        ADD COLUMN IF NOT EXISTS requisition_line_id INT NULL,
        ADD COLUMN IF NOT EXISTS required_date DATE NULL,
        ADD COLUMN IF NOT EXISTS cancelled_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS line_status TEXT NOT NULL DEFAULT 'open';

        ALTER TABLE company_8.inventory_tx
        ADD COLUMN IF NOT EXISTS project_id INT NULL,
        ADD COLUMN IF NOT EXISTS task_id INT NULL,
        ADD COLUMN IF NOT EXISTS cost_code_id INT NULL,
        ADD COLUMN IF NOT EXISTS usage_type TEXT NULL;

        ALTER TABLE company_8.inventory_tx_lines
        ADD COLUMN IF NOT EXISTS project_id INT NULL,
        ADD COLUMN IF NOT EXISTS task_id INT NULL,
        ADD COLUMN IF NOT EXISTS cost_code_id INT NULL,
        ADD COLUMN IF NOT EXISTS usage_type TEXT NULL;

        CREATE INDEX IF NOT EXISTS company_8_po_project_idx
        ON company_8.purchase_orders(company_id, project_id);

        CREATE INDEX IF NOT EXISTS company_8_pol_project_idx
        ON company_8.purchase_order_lines(company_id, project_id, task_id, cost_code_id);

        CREATE INDEX IF NOT EXISTS company_8_inv_tx_project_idx
        ON company_8.inventory_tx(company_id, project_id, task_id, cost_code_id);

        CREATE INDEX IF NOT EXISTS company_8_inv_tx_lines_project_idx
        ON company_8.inventory_tx_lines(company_id, project_id, task_id, cost_code_id);


        -- ==================================================
        -- POS  (FULL + CORRECT ORDER; FIXES SKIPPED ALTER)
        -- ==================================================

        -- 1) pos_imports MUST COME FIRST (so later ALTER + FK won’t skip)
        CREATE TABLE IF NOT EXISTS company_8.pos_imports (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            source_name TEXT NULL,
            file_name TEXT NULL,
            file_hash TEXT NULL,
            status TEXT NOT NULL DEFAULT 'uploaded', -- uploaded|parsed|posted|failed
            error TEXT NULL,
            created_by INT NULL,
            mapping_json JSONB NULL,
            parsed_summary_id INT NULL,
            preview_json JSONB NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.pos_imports ADD COLUMN IF NOT EXISTS mapping_json JSONB NULL;
        ALTER TABLE company_8.pos_imports ADD COLUMN IF NOT EXISTS parsed_summary_id INT NULL;
        ALTER TABLE company_8.pos_imports ADD COLUMN IF NOT EXISTS preview_json JSONB NULL;

        CREATE INDEX IF NOT EXISTS company_8_pos_imports_company_idx
        ON company_8.pos_imports(company_id);

        CREATE INDEX IF NOT EXISTS company_8_pos_imports_status_idx
        ON company_8.pos_imports(company_id, status);

        -- 2) pos_summaries (then add import_id FK safely)
        CREATE TABLE IF NOT EXISTS company_8.pos_summaries (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            pos_date DATE NOT NULL,
            source_name TEXT NULL,
            gross_amount NUMERIC(18,2) DEFAULT 0,
            net_amount NUMERIC(18,2) DEFAULT 0,
            vat_amount NUMERIC(18,2) DEFAULT 0,
            posted_journal_id INT NULL,
            import_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_pos_summaries_company_idx
        ON company_8.pos_summaries(company_id);

        ALTER TABLE company_8.pos_summaries ADD COLUMN IF NOT EXISTS import_id INT NULL;

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE n.nspname='company_8'
            AND c.conname='company_8_pos_summaries_import_fk'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.pos_summaries
            ADD CONSTRAINT %I
            FOREIGN KEY (import_id)
            REFERENCES %I.pos_imports(id)
            ON DELETE SET NULL',
            'company_8',
            'company_8_pos_summaries_import_fk',
            'company_8'
            );
        END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS company_8_pos_summaries_import_idx
        ON company_8.pos_summaries(company_id, import_id);

        -- Optional but good: link pos_imports.parsed_summary_id → pos_summaries.id safely
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE n.nspname='company_8'
            AND c.conname='company_8_pos_imports_parsed_summary_fk'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.pos_imports
            ADD CONSTRAINT %I
            FOREIGN KEY (parsed_summary_id)
            REFERENCES %I.pos_summaries(id)
            ON DELETE SET NULL',
            'company_8',
            'company_8_pos_imports_parsed_summary_fk',
            'company_8'
            );
        END IF;
        END $$;

        -- 3) pos_summary_lines
        CREATE TABLE IF NOT EXISTS company_8.pos_summary_lines (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            summary_id INT NOT NULL REFERENCES company_8.pos_summaries(id) ON DELETE CASCADE,
            line_no INT NOT NULL,
            item_code TEXT NULL,
            description TEXT NULL,
            qty NUMERIC(18,4) NOT NULL DEFAULT 0,
            unit_price NUMERIC(18,4) NOT NULL DEFAULT 0,
            gross_amount NUMERIC(18,2) DEFAULT 0,
            net_amount NUMERIC(18,2) DEFAULT 0,
            vat_amount NUMERIC(18,2) DEFAULT 0,
            income_account TEXT NULL,
            cogs_account TEXT NULL,
            inventory_account TEXT NULL,
            item_type TEXT NULL,
            item_id INT NULL
        );

        CREATE INDEX IF NOT EXISTS company_8_pos_summary_lines_company_idx
            ON company_8.pos_summary_lines(company_id);

            ALTER TABLE company_8.pos_summary_lines
            ADD COLUMN IF NOT EXISTS item_type TEXT NULL,
            ADD COLUMN IF NOT EXISTS item_id INT NULL;

            CREATE INDEX IF NOT EXISTS company_8_pos_lines_item_idx
            ON company_8.pos_summary_lines(item_type, item_id);

        -- 4) pos_item_map (depends on inventory_items + service_items, so keep AFTER those tables)
        CREATE TABLE IF NOT EXISTS company_8.pos_item_map (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            source_name TEXT NULL,
            pos_item_code TEXT NOT NULL,
            barcode TEXT NULL,
            inventory_item_id INT NULL REFERENCES company_8.inventory_items(id),
            service_item_id INT NULL REFERENCES company_8.service_items(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_pos_item_map_company_idx
        ON company_8.pos_item_map(company_id);

        CREATE INDEX IF NOT EXISTS company_8_pos_item_map_lookup_idx
        ON company_8.pos_item_map(company_id, source_name, lower(pos_item_code));

        CREATE INDEX IF NOT EXISTS company_8_pos_item_map_barcode_idx
        ON company_8.pos_item_map(company_id, barcode);

        -- =========================
        -- PHASE 1: LIVE POS CORE
        -- =========================

        CREATE TABLE IF NOT EXISTS company_8.pos_terminals (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            terminal_code TEXT NOT NULL,
            name TEXT NOT NULL,
            branch_name TEXT NULL,
            location TEXT NULL,
            receipt_printer_name TEXT NULL,
            label_printer_name TEXT NULL,
            cash_drawer_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_pos_terminals_code_uniq
        ON company_8.pos_terminals(company_id, lower(trim(terminal_code)));

        CREATE TABLE IF NOT EXISTS company_8.pos_shifts (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            terminal_id INT NOT NULL REFERENCES company_8.pos_terminals(id),
            cashier_user_id INT NOT NULL,
            opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            closed_at TIMESTAMPTZ NULL,
            opening_float NUMERIC(18,2) NOT NULL DEFAULT 0,
            expected_cash NUMERIC(18,2) NOT NULL DEFAULT 0,
            counted_cash NUMERIC(18,2) NULL,
            cash_difference NUMERIC(18,2) NULL,
            status TEXT NOT NULL DEFAULT 'open', -- open|closed|void
            manager_user_id INT NULL,
            notes TEXT NULL
        );

        CREATE TABLE IF NOT EXISTS company_8.pos_shift_templates (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            shift_name TEXT NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            pattern_type TEXT NOT NULL DEFAULT 'standard',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS company_8.pos_shift_schedule (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            employee_user_id INT NOT NULL,
            shift_template_id INT NULL REFERENCES company_8.pos_shift_templates(id),
            work_date DATE NOT NULL,
            schedule_status TEXT NOT NULL DEFAULT 'scheduled',
            notes TEXT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            deleted_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS company_8.pos_staff_leave (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            employee_user_id INT NOT NULL,
            leave_type TEXT NOT NULL DEFAULT 'annual',
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            approved_by INT NULL,
            notes TEXT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            deleted_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS company_8.pos_sales (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            sale_no TEXT NOT NULL,
            sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            business_date DATE NOT NULL DEFAULT CURRENT_DATE,
            terminal_id INT NULL REFERENCES company_8.pos_terminals(id),
            shift_id INT NULL REFERENCES company_8.pos_shifts(id),
            cashier_user_id INT NULL,
            customer_id INT NULL,
            customer_name TEXT NULL,
            customer_vat_no TEXT NULL,
            customer_account_id INT NULL,
            status TEXT NOT NULL DEFAULT 'draft', -- draft|held|completed|void|refunded
            sale_type TEXT NOT NULL DEFAULT 'cash_sale', -- cash_sale|account_sale|layby|quote_conversion
            subtotal NUMERIC(18,2) NOT NULL DEFAULT 0,
            discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            net_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            gross_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            amount_paid NUMERIC(18,2) NOT NULL DEFAULT 0,
            change_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            source_invoice_id INT NULL,
            source_quote_id INT NULL,
            posted_journal_id INT NULL,
            printed_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.pos_sales
        ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(18,2) NOT NULL DEFAULT 0;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_pos_sales_no_uniq
        ON company_8.pos_sales(company_id, lower(trim(sale_no)));

        ALTER TABLE company_8.pos_sales
        ADD COLUMN IF NOT EXISTS source_order_id INT NULL;

        ALTER TABLE company_8.pos_sales
        ADD COLUMN IF NOT EXISTS posting_flow TEXT NOT NULL DEFAULT 'normal_pos';

        ALTER TABLE company_8.pos_sales
        ADD COLUMN IF NOT EXISTS offline_local_id TEXT NULL,
        ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'online',
        ADD COLUMN IF NOT EXISTS sync_error TEXT NULL,
        ADD COLUMN IF NOT EXISTS inventory_status TEXT NOT NULL DEFAULT 'not_checked';

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_pos_sales_offline_local_id_uniq
        ON company_8.pos_sales(company_id, offline_local_id)
        WHERE offline_local_id IS NOT NULL;

        CREATE TABLE IF NOT EXISTS company_8.pos_sale_lines (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            sale_id INT NOT NULL REFERENCES company_8.pos_sales(id) ON DELETE CASCADE,
            line_no INT NOT NULL,
            item_type TEXT NOT NULL DEFAULT 'inventory', -- inventory|service|misc
            item_id INT NULL REFERENCES company_8.inventory_items(id),
            barcode TEXT NULL,
            sku TEXT NULL,
            description TEXT NOT NULL,
            qty NUMERIC(18,4) NOT NULL DEFAULT 1,
            unit_price NUMERIC(18,4) NOT NULL DEFAULT 0,
            discount_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
            discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            net_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            vat_code TEXT NULL,
            vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            gross_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            cost_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            price_source TEXT NULL, -- normal|customer_price|bulk_discount|manual_override|promotion
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.pos_sale_lines
        ADD COLUMN IF NOT EXISTS inventory_check_status TEXT NOT NULL DEFAULT 'not_checked',
        ADD COLUMN IF NOT EXISTS qty_available_at_sync NUMERIC(18,4) NULL,
        ADD COLUMN IF NOT EXISTS qty_short NUMERIC(18,4) NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_pos_sale_lines_line_uniq
        ON company_8.pos_sale_lines(sale_id, line_no);

        CREATE TABLE IF NOT EXISTS company_8.pos_payments (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            sale_id INT NOT NULL REFERENCES company_8.pos_sales(id) ON DELETE CASCADE,
            shift_id INT NULL REFERENCES company_8.pos_shifts(id),
            payment_method TEXT NOT NULL, -- cash|card|eft|account|voucher|mobile_money
            amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            reference TEXT NULL,
            card_last4 TEXT NULL,
            received_amount NUMERIC(18,2) NULL,
            change_amount NUMERIC(18,2) NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.pos_payments
        ADD COLUMN IF NOT EXISTS posted_journal_id INT NULL;

        CREATE TABLE IF NOT EXISTS company_8.pos_cash_movements (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            shift_id INT NOT NULL REFERENCES company_8.pos_shifts(id),
            movement_type TEXT NOT NULL, -- float_in|cash_in|cash_out|bank_drop|correction
            amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            reason TEXT NULL,
            approved_by INT NULL,
            created_by INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS company_8.pos_barcode_labels (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            item_id INT NOT NULL REFERENCES company_8.inventory_items(id),
            barcode TEXT NOT NULL,
            label_type TEXT NOT NULL DEFAULT 'code128',
            copies INT NOT NULL DEFAULT 1,
            printed_by INT NULL,
            printed_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- =========================
        -- POS QUICK QUOTATIONS
        -- Cashier printable, no approval by default
        -- =========================

        CREATE TABLE IF NOT EXISTS company_8.pos_quotes (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            quote_no TEXT NOT NULL,
            quote_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            valid_until DATE NULL,
            terminal_id INT NULL REFERENCES company_8.pos_terminals(id),
            cashier_user_id INT NULL,
            customer_id INT NULL,
            customer_name TEXT NULL,
            customer_phone TEXT NULL,
            customer_email TEXT NULL,
            status TEXT NOT NULL DEFAULT 'draft', -- draft|printed|accepted|converted|expired|cancelled
            subtotal NUMERIC(18,2) NOT NULL DEFAULT 0,
            discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            net_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            gross_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            converted_sale_id INT NULL,
            approval_required BOOLEAN NOT NULL DEFAULT FALSE,
            approved_by INT NULL,
            approved_at TIMESTAMPTZ NULL,
            notes TEXT NULL,
            printed_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_pos_quotes_no_uniq
        ON company_8.pos_quotes(company_id, lower(trim(quote_no)));

        CREATE TABLE IF NOT EXISTS company_8.pos_quote_lines (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            quote_id INT NOT NULL REFERENCES company_8.pos_quotes(id) ON DELETE CASCADE,
            line_no INT NOT NULL,
            item_type TEXT NOT NULL DEFAULT 'inventory',
            item_id INT NULL REFERENCES company_8.inventory_items(id),
            barcode TEXT NULL,
            sku TEXT NULL,
            description TEXT NOT NULL,
            qty NUMERIC(18,4) NOT NULL DEFAULT 1,
            unit_price NUMERIC(18,4) NOT NULL DEFAULT 0,
            discount_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
            discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            net_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            vat_code TEXT NULL,
            vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            gross_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            price_source TEXT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_pos_quote_lines_line_uniq
        ON company_8.pos_quote_lines(quote_id, line_no);

        -- =========================
        -- CUSTOMER ACCOUNTS + WHOLESALE PRICING
        -- =========================

        CREATE TABLE IF NOT EXISTS company_8.pos_customer_profiles (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            customer_id INT NULL,
            customer_name TEXT NOT NULL,
            customer_type TEXT NOT NULL DEFAULT 'retail', -- retail|wholesale|account|staff
            price_level TEXT NOT NULL DEFAULT 'retail', -- retail|wholesale|vip|staff
            default_discount_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
            credit_allowed BOOLEAN NOT NULL DEFAULT FALSE,
            credit_limit NUMERIC(18,2) NOT NULL DEFAULT 0,
            current_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
            payment_terms_days INT NOT NULL DEFAULT 0,
            vat_no TEXT NULL,
            phone TEXT NULL,
            email TEXT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS company_8.pos_price_levels (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            price_level TEXT NOT NULL,
            description TEXT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_pos_price_levels_uniq
        ON company_8.pos_price_levels(company_id, lower(trim(price_level)));

        CREATE TABLE IF NOT EXISTS company_8.pos_item_prices (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            item_id INT NOT NULL REFERENCES company_8.inventory_items(id),
            price_level TEXT NOT NULL DEFAULT 'retail',
            unit_price NUMERIC(18,4) NOT NULL DEFAULT 0,
            effective_from DATE NULL,
            effective_to DATE NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_pos_item_prices_uniq
        ON company_8.pos_item_prices(company_id, item_id, lower(trim(price_level)));

        CREATE TABLE IF NOT EXISTS company_8.pos_bulk_discounts (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            item_id INT NULL REFERENCES company_8.inventory_items(id),
            category TEXT NULL,
            customer_type TEXT NULL, -- wholesale|retail|account
            min_qty NUMERIC(18,4) NOT NULL DEFAULT 0,
            discount_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
            fixed_unit_price NUMERIC(18,4) NULL,
            effective_from DATE NULL,
            effective_to DATE NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- =========================
        -- PHASE 2: RETURNS, OVERRIDES, APPROVALS
        -- =========================

        CREATE TABLE IF NOT EXISTS company_8.pos_returns (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            return_no TEXT NOT NULL,
            original_sale_id INT NULL REFERENCES company_8.pos_sales(id),
            return_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            terminal_id INT NULL REFERENCES company_8.pos_terminals(id),
            shift_id INT NULL REFERENCES company_8.pos_shifts(id),
            cashier_user_id INT NULL,
            reason TEXT NULL,
            status TEXT NOT NULL DEFAULT 'draft', -- draft|completed|void
            refund_method TEXT NULL,
            refund_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            source_credit_note_id INT NULL,
            posted_journal_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.pos_returns
        ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending_approval';

        ALTER TABLE company_8.pos_returns
        ADD COLUMN IF NOT EXISTS requires_manager_approval BOOLEAN NOT NULL DEFAULT TRUE;

        ALTER TABLE company_8.pos_returns
        ADD COLUMN IF NOT EXISTS requested_by INT NULL;

        ALTER TABLE company_8.pos_returns
        ADD COLUMN IF NOT EXISTS approved_by INT NULL;

        ALTER TABLE company_8.pos_returns
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL;

        ALTER TABLE company_8.pos_returns
        ADD COLUMN IF NOT EXISTS approval_note TEXT NULL;

        ALTER TABLE company_8.pos_returns
        ADD COLUMN IF NOT EXISTS posted_journal_id INT NULL;

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_pos_returns_posted_journal_fk'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.pos_returns
            ADD CONSTRAINT %I
            FOREIGN KEY (posted_journal_id)
            REFERENCES %I.journal(id)
            ON DELETE SET NULL',
            'company_8',
            'company_8_pos_returns_posted_journal_fk',
            'company_8'
            );
        END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS company_8.pos_return_lines (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            return_id INT NOT NULL REFERENCES company_8.pos_returns(id) ON DELETE CASCADE,
            original_sale_line_id INT NULL REFERENCES company_8.pos_sale_lines(id),
            item_id INT NULL REFERENCES company_8.inventory_items(id),
            description TEXT NOT NULL,
            qty NUMERIC(18,4) NOT NULL DEFAULT 1,
            unit_price NUMERIC(18,4) NOT NULL DEFAULT 0,
            vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            gross_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            restock BOOLEAN NOT NULL DEFAULT TRUE
        );

        CREATE TABLE IF NOT EXISTS company_8.pos_discount_approvals (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            source_type TEXT NOT NULL, -- sale|quote
            source_id INT NOT NULL,
            requested_by INT NULL,
            approved_by INT NULL,
            requested_discount_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
            requested_discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            reason TEXT NULL,
            status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|declined
            requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            decided_at TIMESTAMPTZ NULL
        );

        CREATE TABLE IF NOT EXISTS company_8.pos_price_overrides (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            source_type TEXT NOT NULL, -- sale|quote
            source_line_id INT NOT NULL,
            original_price NUMERIC(18,4) NOT NULL DEFAULT 0,
            override_price NUMERIC(18,4) NOT NULL DEFAULT 0,
            reason TEXT NULL,
            approved_by INT NULL,
            created_by INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- =========================
        -- PHASE 3: PROMOTIONS, LOYALTY, VOUCHERS, OFFLINE
        -- =========================

        CREATE TABLE IF NOT EXISTS company_8.pos_promotions (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            promo_code TEXT NOT NULL,
            name TEXT NOT NULL,
            promo_type TEXT NOT NULL, -- percent|fixed|buy_x_get_y|bundle
            discount_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
            discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            starts_at TIMESTAMPTZ NULL,
            ends_at TIMESTAMPTZ NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS company_8.pos_loyalty_accounts (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            customer_profile_id INT NOT NULL REFERENCES company_8.pos_customer_profiles(id),
            loyalty_no TEXT NOT NULL,
            points_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS company_8.pos_gift_vouchers (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            voucher_no TEXT NOT NULL,
            original_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            balance_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            issued_sale_id INT NULL REFERENCES company_8.pos_sales(id),
            status TEXT NOT NULL DEFAULT 'active', -- active|redeemed|expired|void
            expires_at DATE NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS company_8.pos_offline_batches (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            terminal_id INT NULL REFERENCES company_8.pos_terminals(id),
            batch_uuid TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending', -- pending|synced|failed
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            error TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            synced_at TIMESTAMPTZ NULL
        );

        CREATE TABLE IF NOT EXISTS company_8.pos_orders (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            order_no TEXT NOT NULL,
            order_type TEXT NOT NULL DEFAULT 'table',
            -- table|collection|delivery

            table_no TEXT NULL,

            waiter_user_id INT NULL,
            cashier_user_id INT NULL,

            customer_id INT NULL,
            customer_name TEXT NULL,
            customer_phone TEXT NULL,

            delivery_address TEXT NULL,
            delivery_notes TEXT NULL,
            driver_user_id INT NULL,
            delivery_fee NUMERIC(18,2) NOT NULL DEFAULT 0,

            status TEXT NOT NULL DEFAULT 'open',
            -- open|sent_to_kitchen|ready|out_for_delivery|completed|billed|cancelled

            subtotal NUMERIC(18,2) NOT NULL DEFAULT 0,
            discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            gross_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            source_sale_id INT NULL REFERENCES company_8.pos_sales(id),

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_pos_orders_no_uniq
        ON company_8.pos_orders(company_id, lower(trim(order_no)));

        CREATE INDEX IF NOT EXISTS company_8_pos_orders_status_idx
        ON company_8.pos_orders(company_id, status);

        CREATE INDEX IF NOT EXISTS company_8_pos_orders_waiter_idx
        ON company_8.pos_orders(company_id, waiter_user_id);

        CREATE INDEX IF NOT EXISTS company_8_pos_orders_driver_idx
        ON company_8.pos_orders(company_id, driver_user_id);

        CREATE TABLE IF NOT EXISTS company_8.pos_order_lines (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            order_id INT NOT NULL REFERENCES company_8.pos_orders(id) ON DELETE CASCADE,
            line_no INT NOT NULL,

            item_id INT NULL REFERENCES company_8.inventory_items(id),
            description TEXT NOT NULL,

            qty NUMERIC(18,4) NOT NULL DEFAULT 1,
            unit_price NUMERIC(18,4) NOT NULL DEFAULT 0,
            discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            vat_code TEXT NULL,
            vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            gross_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            notes TEXT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            -- open|sent|preparing|ready|served|cancelled

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_pos_order_lines_line_uniq
        ON company_8.pos_order_lines(order_id, line_no);

        CREATE TABLE IF NOT EXISTS company_8.pos_cost_pools (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            pool_code TEXT NOT NULL,
            pool_name TEXT NOT NULL,

            pool_type TEXT NOT NULL DEFAULT 'overhead',
            -- labour|rent|utilities|water|electricity|gas|depreciation|security|cleaning|other

            allocation_basis TEXT NOT NULL DEFAULT 'meals_sold',
            -- meals_sold|sales_value|food_cost|prep_minutes|floor_area|manual_weight

            amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,

            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            notes TEXT NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_pos_cost_pools_period_idx
        ON company_8.pos_cost_pools(company_id, period_start, period_end);

        CREATE TABLE IF NOT EXISTS company_8.pos_menu_cost_allocations (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            menu_item_id INT NOT NULL REFERENCES company_8.inventory_items(id),
            cost_pool_id INT NOT NULL REFERENCES company_8.pos_cost_pools(id) ON DELETE CASCADE,

            allocation_weight NUMERIC(18,6) NOT NULL DEFAULT 1,
            allocated_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            allocated_cost_per_unit NUMERIC(18,6) NOT NULL DEFAULT 0,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_pos_menu_alloc_item_idx
        ON company_8.pos_menu_cost_allocations(company_id, menu_item_id);

        CREATE TABLE IF NOT EXISTS company_8.pos_receipt_settings (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            receipt_title TEXT NULL,
            footer_message TEXT NULL,
            returns_policy TEXT NULL,
            refund_policy TEXT NULL,
            vat_note TEXT NULL,
            show_vat_no BOOLEAN NOT NULL DEFAULT TRUE,
            show_cashier_name BOOLEAN NOT NULL DEFAULT TRUE,
            show_customer_name BOOLEAN NOT NULL DEFAULT TRUE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.pos_receipt_settings
        ADD COLUMN IF NOT EXISTS slip_template TEXT DEFAULT 'classic';

        ALTER TABLE company_8.pos_receipt_settings
        ADD COLUMN IF NOT EXISTS order_template TEXT DEFAULT 'restaurant_order';

        ALTER TABLE company_8.pos_receipt_settings
        ADD COLUMN IF NOT EXISTS kitchen_ticket_template TEXT DEFAULT 'kitchen_ticket';

        ALTER TABLE company_8.pos_receipt_settings
        ADD COLUMN IF NOT EXISTS show_logo BOOLEAN NOT NULL DEFAULT TRUE;

        ALTER TABLE company_8.pos_receipt_settings
        ADD COLUMN IF NOT EXISTS logo_position TEXT NOT NULL DEFAULT 'top_center';

        ALTER TABLE company_8.pos_receipt_settings
        ADD COLUMN IF NOT EXISTS company_motto TEXT DEFAULT '';

        ALTER TABLE company_8.pos_receipt_settings
        ADD COLUMN IF NOT EXISTS show_motto BOOLEAN NOT NULL DEFAULT TRUE;

        ALTER TABLE company_8.pos_receipt_settings
        ADD COLUMN IF NOT EXISTS show_socials BOOLEAN NOT NULL DEFAULT FALSE;

        ALTER TABLE company_8.pos_receipt_settings
        ADD COLUMN IF NOT EXISTS whatsapp_number TEXT DEFAULT '';

        ALTER TABLE company_8.pos_receipt_settings
        ADD COLUMN IF NOT EXISTS facebook_handle TEXT DEFAULT '';

        ALTER TABLE company_8.pos_receipt_settings
        ADD COLUMN IF NOT EXISTS instagram_handle TEXT DEFAULT '';

        ALTER TABLE company_8.pos_receipt_settings
        ADD COLUMN IF NOT EXISTS pricing_tax_mode TEXT DEFAULT 'no_vat';

        ALTER TABLE company_8.pos_receipt_settings
        ADD COLUMN IF NOT EXISTS receipt_tax_display TEXT DEFAULT 'none';

        ALTER TABLE company_8.pos_receipt_settings
        ADD COLUMN IF NOT EXISTS tax_invoice_wording TEXT DEFAULT 'Receipt';
        
        CREATE UNIQUE INDEX IF NOT EXISTS company_8_pos_receipt_settings_company_uniq
        ON company_8.pos_receipt_settings(company_id)
        WHERE is_active = TRUE;

        -- =========================
        -- RESTAURANT TABLE SECTIONS
        -- =========================

        CREATE TABLE IF NOT EXISTS company_8.pos_table_sections (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            section_code TEXT NOT NULL,
            section_name TEXT NOT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_pos_table_sections_code_uniq
        ON company_8.pos_table_sections(company_id, lower(trim(section_code)));

        INSERT INTO company_8.pos_table_sections
        (
            company_id,
            section_code,
            section_name,
            sort_order,
            is_active
        )
        SELECT
            8,
            'MAIN',
            'Main Floor',
            1,
            TRUE
        WHERE NOT EXISTS (
            SELECT 1
            FROM company_8.pos_table_sections
            WHERE company_id = 8
            AND lower(trim(section_code)) = 'main'
        );

        -- =========================
        -- RESTAURANT TABLES
        -- =========================

        CREATE TABLE IF NOT EXISTS company_8.pos_tables (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            section_id INT NULL REFERENCES company_8.pos_table_sections(id) ON DELETE SET NULL,
            table_code TEXT NOT NULL,
            table_name TEXT NOT NULL,
            capacity INT NOT NULL DEFAULT 4,
            status TEXT NOT NULL DEFAULT 'available',
            waiter_user_id INT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_pos_tables_code_uniq
        ON company_8.pos_tables(company_id, lower(trim(table_code)));

        -- =========================
        -- TABLE RESERVATIONS
        -- =========================

        CREATE TABLE IF NOT EXISTS company_8.pos_table_reservations (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            table_id INT NOT NULL REFERENCES company_8.pos_tables(id) ON DELETE CASCADE,
            customer_name TEXT NOT NULL,
            customer_phone TEXT NULL,
            reservation_time TIMESTAMPTZ NOT NULL,
            guests INT NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'reserved',
            notes TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- =========================
        -- KITCHEN STATIONS
        -- =========================

        CREATE TABLE IF NOT EXISTS company_8.pos_kitchen_stations (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            station_code TEXT NOT NULL,
            station_name TEXT NOT NULL,
            printer_name TEXT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_pos_kitchen_stations_code_uniq
        ON company_8.pos_kitchen_stations(company_id, lower(trim(station_code)));

        -- =========================
        -- KITCHEN TICKETS
        -- =========================

        CREATE TABLE IF NOT EXISTS company_8.pos_kitchen_tickets (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            order_id INT NOT NULL REFERENCES company_8.pos_orders(id) ON DELETE CASCADE,
            station_id INT NOT NULL REFERENCES company_8.pos_kitchen_stations(id),
            ticket_no TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'waiting',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            started_at TIMESTAMPTZ NULL,
            completed_at TIMESTAMPTZ NULL
        );

        CREATE TABLE IF NOT EXISTS company_8.pos_kitchen_ticket_lines (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            ticket_id INT NOT NULL REFERENCES company_8.pos_kitchen_tickets(id) ON DELETE CASCADE,
            order_line_id INT NULL,
            item_id INT NULL,
            description TEXT NOT NULL,
            qty NUMERIC(18,4) NOT NULL DEFAULT 1,
            notes TEXT NULL,
            status TEXT NOT NULL DEFAULT 'waiting'
        );

        -- =========================
        -- RESTAURANT MENU ITEMS
        -- =========================

        CREATE TABLE IF NOT EXISTS company_8.pos_menu_items (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            item_id INT NULL REFERENCES company_8.inventory_items(id) ON DELETE SET NULL,

            menu_code TEXT NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'Meals',

            description TEXT NULL,
            combo_description TEXT NULL,

            price NUMERIC(18,2) NOT NULL DEFAULT 0,
            vat_code TEXT NULL,

            image_url TEXT NULL,

            is_combo BOOLEAN NOT NULL DEFAULT FALSE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            show_on_cashier BOOLEAN NOT NULL DEFAULT TRUE,
            show_on_display BOOLEAN NOT NULL DEFAULT TRUE,

            sort_order INT NOT NULL DEFAULT 0,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_pos_menu_items_code_uniq
        ON company_8.pos_menu_items(company_id, lower(trim(menu_code)));

        CREATE INDEX IF NOT EXISTS company_8_pos_menu_items_active_idx
        ON company_8.pos_menu_items(company_id, is_active, show_on_cashier);


        -- =========================
        -- MENU COMBO COMPONENTS
        -- Example: Chicken + Chips + Coleslaw
        -- =========================

        CREATE TABLE IF NOT EXISTS company_8.pos_menu_combo_components (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            menu_item_id INT NOT NULL REFERENCES company_8.pos_menu_items(id) ON DELETE CASCADE,
            component_item_id INT NULL REFERENCES company_8.inventory_items(id) ON DELETE SET NULL,

            component_name TEXT NOT NULL,
            qty NUMERIC(18,4) NOT NULL DEFAULT 1,
            uom TEXT NULL,

            sort_order INT NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_pos_menu_combo_components_menu_idx
        ON company_8.pos_menu_combo_components(company_id, menu_item_id);


        -- =========================
        -- MENU ADD-ONS
        -- Example: Extra cheese, extra chips, extra sauce
        -- =========================

        CREATE TABLE IF NOT EXISTS company_8.pos_menu_addons (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            menu_item_id INT NULL REFERENCES company_8.pos_menu_items(id) ON DELETE CASCADE,

            addon_name TEXT NOT NULL,
            addon_price NUMERIC(18,2) NOT NULL DEFAULT 0,

            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order INT NOT NULL DEFAULT 0,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_pos_menu_addons_item_idx
        ON company_8.pos_menu_addons(company_id, menu_item_id, is_active);


        -- =========================
        -- CUSTOMER MENU DISPLAY SLIDESHOW SETTINGS
        -- =========================

        CREATE TABLE IF NOT EXISTS company_8.pos_menu_display_settings (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            display_name TEXT NOT NULL DEFAULT 'Main Menu Display',
            slide_seconds INT NOT NULL DEFAULT 12,
            show_prices BOOLEAN NOT NULL DEFAULT TRUE,
            show_categories BOOLEAN NOT NULL DEFAULT TRUE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_pos_menu_display_settings_active_uniq
        ON company_8.pos_menu_display_settings(company_id)
        WHERE is_active = TRUE;


        -- =========================
        -- PACKING QUEUE
        -- Kitchen ready orders go here for packers.
        -- =========================

        CREATE TABLE IF NOT EXISTS company_8.pos_packing_queue (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            order_id INT NOT NULL REFERENCES company_8.pos_orders(id) ON DELETE CASCADE,

            queue_no TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'waiting',
            -- waiting|packing|packed|archived|cancelled

            packed_by INT NULL,
            packed_at TIMESTAMPTZ NULL,
            archived_by INT NULL,
            archived_at TIMESTAMPTZ NULL,

            notes TEXT NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_pos_packing_queue_no_uniq
        ON company_8.pos_packing_queue(company_id, lower(trim(queue_no)));

        CREATE INDEX IF NOT EXISTS company_8_pos_packing_queue_status_idx
        ON company_8.pos_packing_queue(company_id, status);

        CREATE TABLE IF NOT EXISTS company_8.pos_recipe_headers (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            menu_item_id INT NOT NULL
                REFERENCES company_8.inventory_items(id),

            recipe_name TEXT NOT NULL,

            yield_qty NUMERIC(18,4) NOT NULL DEFAULT 1,
            yield_uom TEXT NULL,

            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_pos_recipe_headers_item_idx
        ON company_8.pos_recipe_headers(company_id, menu_item_id, is_active);



        CREATE TABLE IF NOT EXISTS company_8.pos_recipe_lines (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            recipe_id INT NOT NULL
                REFERENCES company_8.pos_recipe_headers(id)
                ON DELETE CASCADE,

            ingredient_item_id INT NOT NULL
                REFERENCES company_8.inventory_items(id),

            qty_required NUMERIC(18,6) NOT NULL DEFAULT 1,
            uom TEXT NULL,

            wastage_percent NUMERIC(9,4) NOT NULL DEFAULT 0,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_pos_recipe_lines_recipe_idx
        ON company_8.pos_recipe_lines(company_id, recipe_id);

        CREATE INDEX IF NOT EXISTS company_8_pos_recipe_lines_ingredient_idx
        ON company_8.pos_recipe_lines(company_id, ingredient_item_id);

        CREATE TABLE IF NOT EXISTS company_8.pos_recipe_consumptions (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            sale_id INT NULL REFERENCES company_8.pos_sales(id),
            sale_line_id INT NULL REFERENCES company_8.pos_sale_lines(id),

            menu_item_id INT NOT NULL REFERENCES company_8.inventory_items(id),
            recipe_id INT NULL REFERENCES company_8.pos_recipe_headers(id),
            ingredient_item_id INT NOT NULL REFERENCES company_8.inventory_items(id),

            qty_sold NUMERIC(18,4) NOT NULL DEFAULT 0,
            ingredient_qty_consumed NUMERIC(18,6) NOT NULL DEFAULT 0,
            fifo_cost_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            source TEXT NOT NULL DEFAULT 'pos_sale',
            source_id INT NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_pos_recipe_cons_sale_idx
        ON company_8.pos_recipe_consumptions(company_id, sale_id, sale_line_id);

        CREATE INDEX IF NOT EXISTS company_8_pos_recipe_cons_item_idx
        ON company_8.pos_recipe_consumptions(company_id, ingredient_item_id);

        
        CREATE TABLE IF NOT EXISTS company_8.pos_staff_attendance (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            employee_user_id INT NOT NULL,
            schedule_id INT NULL REFERENCES company_8.pos_shift_schedule(id),
            clock_in_at TIMESTAMPTZ NULL,
            clock_out_at TIMESTAMPTZ NULL,
            status TEXT NOT NULL DEFAULT 'clocked_in',
            late_minutes INT NOT NULL DEFAULT 0,
            notes TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- ==================================================
        -- BANK STATEMENTS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.bank_statements (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            bank_account_id INT NOT NULL REFERENCES company_8.company_bank_accounts(id),
            statement_date DATE NOT NULL,
            opening_balance NUMERIC(18,2) DEFAULT 0,
            closing_balance NUMERIC(18,2) DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'draft',
            notes TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_bank_statements_company_account_idx
        ON company_8.bank_statements(company_id, bank_account_id);

        CREATE INDEX IF NOT EXISTS company_8_bank_statements_date_idx
        ON company_8.bank_statements(statement_date);

        -- ==================================================
        -- BANK STATEMENT LINES
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.bank_statement_lines (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            statement_id INT NOT NULL REFERENCES company_8.bank_statements(id) ON DELETE CASCADE,
            txn_date DATE NOT NULL,
            reference TEXT NULL,
            description TEXT NOT NULL,
            debit NUMERIC(18,2) DEFAULT 0,
            credit NUMERIC(18,2) DEFAULT 0,
            balance NUMERIC(18,2) NULL,
            matched_invoice_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_bank_statement_lines_statement_idx
        ON company_8.bank_statement_lines(statement_id);

        CREATE INDEX IF NOT EXISTS company_8_bank_statement_lines_invoice_idx
        ON company_8.bank_statement_lines(matched_invoice_id);

        -- ==================================================
        -- CREDIT PROFILES
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.credit_profiles (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            customer_id INT NOT NULL REFERENCES company_8.customers(id),
            requested_limit NUMERIC(18,2) DEFAULT 0,
            requested_terms TEXT NULL,
            risk_band TEXT NULL,
            status TEXT NOT NULL DEFAULT 'draft',
            approved_limit NUMERIC(18,2) NULL,
            approved_terms TEXT NULL,
            created_by_user_id INT NULL,
            created_by_role TEXT NULL,
            senior_reviewer_id INT NULL,
            senior_reviewer_role TEXT NULL,
            senior_reviewed_at TIMESTAMPTZ NULL,
            cfo_reviewer_id INT NULL,
            cfo_reviewer_role TEXT NULL,
            cfo_reviewed_at TIMESTAMPTZ NULL,
            payload JSONB NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_credit_profiles_company_customer_idx
        ON company_8.credit_profiles(company_id, customer_id);

        CREATE INDEX IF NOT EXISTS company_8_credit_profiles_status_idx
        ON company_8.credit_profiles(status);


        -- ==================================================
        -- INVOICE COUNTERS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.invoice_counters (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            key TEXT NOT NULL,
            last_no INT NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_counters_company_key
            ON company_8.invoice_counters(company_id, key);

        -- ==================================================
        -- INVOICES
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.invoices (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            customer_id INT NOT NULL REFERENCES company_8.customers(id),
            revenue_contract_id INT NULL,
            number TEXT NULL, -- draft-friendly
            invoice_date DATE NOT NULL,
            due_date DATE NULL,
            currency TEXT NULL,

            subtotal_amount NUMERIC(18,2) DEFAULT 0,
            discount_amount NUMERIC(18,2) DEFAULT 0,
            discount_rate NUMERIC(10,6) DEFAULT 0,

            other_amount NUMERIC(18,2) DEFAULT 0,

            vat_amount NUMERIC(18,2) DEFAULT 0,
            total_amount NUMERIC(18,2) DEFAULT 0,

            status TEXT NOT NULL DEFAULT 'draft',
            bank_account_id INT NULL REFERENCES company_8.company_bank_accounts(id),
            notes TEXT NULL,

            posted_journal_id INT NULL,
            reversed_journal_id INT NULL,

            reversed_at TIMESTAMPTZ NULL,
            reversed_by INT NULL,
            reversal_reason TEXT NULL,

            writeoff_journal_id INT NULL,
            written_off_at TIMESTAMPTZ NULL,
            written_off_by INT NULL,
            writeoff_reason TEXT NULL,

            issued_at TIMESTAMPTZ NULL,
            issued_by INT NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- ✅ legacy-safe: ensure these exist even if invoices table already existed
        ALTER TABLE company_8.invoices ADD COLUMN IF NOT EXISTS posted_journal_id INT NULL;
        ALTER TABLE company_8.invoices ADD COLUMN IF NOT EXISTS reversed_journal_id INT NULL;

        ALTER TABLE company_8.invoices ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(10,6) DEFAULT 0;
        ALTER TABLE company_8.invoices ADD COLUMN IF NOT EXISTS other_amount NUMERIC(18,2) DEFAULT 0;

        ALTER TABLE company_8.invoices ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ NULL;
        ALTER TABLE company_8.invoices ADD COLUMN IF NOT EXISTS reversed_by INT NULL;
        ALTER TABLE company_8.invoices ADD COLUMN IF NOT EXISTS reversal_reason TEXT NULL;

        ALTER TABLE company_8.invoices ADD COLUMN IF NOT EXISTS writeoff_journal_id INT NULL;
        ALTER TABLE company_8.invoices ADD COLUMN IF NOT EXISTS written_off_at TIMESTAMPTZ NULL;
        ALTER TABLE company_8.invoices ADD COLUMN IF NOT EXISTS written_off_by INT NULL;
        ALTER TABLE company_8.invoices ADD COLUMN IF NOT EXISTS writeoff_reason TEXT NULL;

        ALTER TABLE company_8.invoices ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ NULL;
        ALTER TABLE company_8.invoices ADD COLUMN IF NOT EXISTS issued_by INT NULL;

        ALTER TABLE company_8.invoices
        ADD COLUMN IF NOT EXISTS source TEXT NULL,
        ADD COLUMN IF NOT EXISTS source_id INT NULL,
        ADD COLUMN IF NOT EXISTS module_name TEXT NULL,
        ADD COLUMN IF NOT EXISTS posting_mode TEXT NULL,
        ADD COLUMN IF NOT EXISTS lessor_lease_id INT NULL,
        ADD COLUMN IF NOT EXISTS lessor_schedule_id INT NULL,
        ADD COLUMN IF NOT EXISTS lease_classification TEXT NULL,
        ADD COLUMN IF NOT EXISTS accounting_treatment TEXT NULL,
        ADD COLUMN IF NOT EXISTS ar_account_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS credit_account_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS vat_output_account_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        CREATE INDEX IF NOT EXISTS company_8_invoices_source_idx
        ON company_8.invoices(company_id, source, source_id);

        -- If older DB had number NOT NULL, drop it
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'company_8'
                AND table_name = 'invoices'
                AND column_name = 'number'
                AND is_nullable = 'NO'
            ) THEN
                EXECUTE format('ALTER TABLE %I.invoices ALTER COLUMN number DROP NOT NULL', 'company_8');
            END IF;
        END $$;

        -- Unique invoice number per company only when number IS NOT NULL
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_indexes
                WHERE schemaname = 'company_8'
                AND indexname = 'uq_invoices_company_number_notnull'
            ) THEN
                EXECUTE format(
                    'CREATE UNIQUE INDEX uq_invoices_company_number_notnull
                    ON %I.invoices (company_id, number)
                    WHERE number IS NOT NULL',
                    'company_8'
                );
            END IF;
        END $$;

        -- Indexes (only once each)
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'company_8'
                AND table_name = 'invoices'
                AND column_name = 'posted_journal_id'
            ) THEN
                EXECUTE format(
                    'CREATE INDEX IF NOT EXISTS %I ON %I.invoices(posted_journal_id)',
                    'company_8_invoices_posted_journal_id_idx',
                    'company_8'
                );
            END IF;
        END $$;

        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'company_8'
                AND table_name = 'invoices'
                AND column_name = 'reversed_journal_id'
            ) THEN
                EXECUTE format(
                    'CREATE INDEX IF NOT EXISTS %I ON %I.invoices(reversed_journal_id)',
                    'company_8_invoices_reversed_journal_id_idx',
                    'company_8'
                );
            END IF;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_uq_invoice_lessor_schedule
        ON company_8.invoices(company_id, lessor_schedule_id)
        WHERE lessor_schedule_id IS NOT NULL;

        -- ==================================================
        -- INVOICE LINES
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.invoice_lines (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            invoice_id INT NOT NULL,
            revenue_obligation_id INT NULL,
            line_no INT NOT NULL,
            item_name TEXT NULL,
            description TEXT NOT NULL,
            account_code TEXT NULL,
            quantity NUMERIC(18,4) DEFAULT 1,
            unit_price NUMERIC(18,4) DEFAULT 0,
            discount_amount NUMERIC(18,2) DEFAULT 0,
            net_amount NUMERIC(18,2) DEFAULT 0,
            vat_rate NUMERIC(10,6) DEFAULT 0,
            vat_amount NUMERIC(18,2) DEFAULT 0,
            total_amount NUMERIC(18,2) DEFAULT 0
        );

        -- ✅ invoice_lines: support service/inventory tagging
        ALTER TABLE company_8.invoice_lines
        ADD COLUMN IF NOT EXISTS item_type TEXT NULL,     -- service|inventory|gl
        ADD COLUMN IF NOT EXISTS item_id INT NULL,        -- references inventory_items.id or service_items.id (soft)
        ADD COLUMN IF NOT EXISTS item_code TEXT NULL,     -- sku or service code
        ADD COLUMN IF NOT EXISTS vat_code TEXT NULL;      -- STANDARD / ZERO / EXEMPT / CUSTOM etc

        ALTER TABLE company_8.invoice_lines
        ADD COLUMN IF NOT EXISTS source TEXT,
        ADD COLUMN IF NOT EXISTS source_id INT,
        ADD COLUMN IF NOT EXISTS module_name TEXT,
        ADD COLUMN IF NOT EXISTS lessor_lease_id INT,
        ADD COLUMN IF NOT EXISTS lessor_schedule_id INT,
        ADD COLUMN IF NOT EXISTS account_role TEXT,
        ADD COLUMN IF NOT EXISTS account_name TEXT,
        ADD COLUMN IF NOT EXISTS vat_account_code TEXT;

        CREATE INDEX IF NOT EXISTS company_8_invoice_lines_item_idx
        ON company_8.invoice_lines(company_id, item_type, item_id);

        DO $fk_invoice_lines$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'fk_invoice_lines_invoice'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.invoice_lines
                    ADD CONSTRAINT fk_invoice_lines_invoice
                    FOREIGN KEY (invoice_id)
                    REFERENCES %I.invoices(id)
                    ON DELETE CASCADE',
                    'company_8',
                    'company_8'
                );
            END IF;
        END $fk_invoice_lines$;

        CREATE INDEX IF NOT EXISTS company_8_invoice_lines_company_invoice_idx
        ON company_8.invoice_lines(company_id, invoice_id);


        CREATE TABLE IF NOT EXISTS company_8.receipts (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            customer_id INT NOT NULL REFERENCES company_8.customers(id),
            receipt_date DATE NOT NULL,
            amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            currency TEXT NULL,
            bank_account_id INT NULL REFERENCES company_8.company_bank_accounts(id),
            bank_ledger_code TEXT NULL,
            ar_ledger_code TEXT NULL,
            reference TEXT NULL,
            description TEXT NULL,
            created_by INT NULL,
            created_journal_id INT NULL,
            settlement_discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            writeoff_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'posted',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- ✅ Safe additive ALTERs (for legacy tenants)
        ALTER TABLE company_8.receipts
            ADD COLUMN IF NOT EXISTS created_by INT NULL,
            ADD COLUMN IF NOT EXISTS created_journal_id INT NULL,
            ADD COLUMN IF NOT EXISTS settlement_discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS writeoff_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted';

        -- ✅ one coherent receipts constraint (avoid duplicate/contradicting checks)
        DO $chk_receipts_valid$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'chk_receipts_valid'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.receipts
            ADD CONSTRAINT chk_receipts_valid
            CHECK (
                amount >= 0
                AND settlement_discount_amount >= 0
                AND writeoff_amount >= 0
            )',
            'company_8'
            );
        END IF;
        END $chk_receipts_valid$;

        -- 🧹 drop older overlapping constraints if they exist (idempotent)
        DO $drop_old_receipts_checks$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'chk_receipts_amount_nonneg' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format('ALTER TABLE %I.receipts DROP CONSTRAINT chk_receipts_amount_nonneg', 'company_8');
            END IF;

            IF EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'chk_receipts_amount_pos' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format('ALTER TABLE %I.receipts DROP CONSTRAINT chk_receipts_amount_pos', 'company_8');
            END IF;

            IF EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'chk_receipts_nonneg' AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format('ALTER TABLE %I.receipts DROP CONSTRAINT chk_receipts_nonneg', 'company_8');
            END IF;
        END
        $drop_old_receipts_checks$;

        -- (Optional) keep if you want it for safety/debugging
        DO $uq_receipts$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'uq_receipts_company_id_id'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.receipts
            ADD CONSTRAINT uq_receipts_company_id_id UNIQUE (company_id, id)',
            'company_8'
            );
        END IF;
        END $uq_receipts$;

        -- ==================================================
        -- RECEIPT ALLOCATIONS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.receipt_allocations (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            receipt_id INT NOT NULL,
            invoice_id INT NOT NULL,
            amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- ✅ allocation must be >= 0 (0 is useful during migrations;
        DO $chk_receipt_alloc_amount_nonneg$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'chk_receipt_alloc_amount_nonneg'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.receipt_allocations
            ADD CONSTRAINT chk_receipt_alloc_amount_nonneg CHECK (amount >= 0)',
            'company_8'
            );
        END IF;
        END $chk_receipt_alloc_amount_nonneg$;

        -- 🧹 drop older "amount > 0" constraint if you want to allow 0 for repair jobs
        DO $drop_ra_amount_pos$
        BEGIN
        IF EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'chk_ra_amount_pos'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format('ALTER TABLE %I.receipt_allocations DROP CONSTRAINT chk_ra_amount_pos', 'company_8');
        END IF;
        END $drop_ra_amount_pos$;

        -- ✅ FKs (single-column, reliable in per-tenant schema)
        DO $fk_ra_receipt$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'fk_ra_receipt'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.receipt_allocations
                ADD CONSTRAINT fk_ra_receipt
                FOREIGN KEY (receipt_id)
                REFERENCES %I.receipts(id)
                ON DELETE CASCADE',
            'company_8', 'company_8'
            );
        END IF;
        END $fk_ra_receipt$;

        DO $fk_ra_invoice$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'fk_ra_invoice'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.receipt_allocations
                ADD CONSTRAINT fk_ra_invoice
                FOREIGN KEY (invoice_id)
                REFERENCES %I.invoices(id)
                ON DELETE CASCADE',
            'company_8', 'company_8'
            );
        END IF;
        END $fk_ra_invoice$;

        -- ✅ Prevent duplicate rows for same receipt+invoice (recommended)
        CREATE UNIQUE INDEX IF NOT EXISTS uq_ra_company_receipt_invoice
        ON company_8.receipt_allocations(company_id, receipt_id, invoice_id);

        -- ✅ Indexes (good for statements/aging)
        CREATE INDEX IF NOT EXISTS company_8_receipts_company_customer_date_idx
        ON company_8.receipts(company_id, customer_id, receipt_date);

        CREATE INDEX IF NOT EXISTS company_8_alloc_company_invoice_idx
        ON company_8.receipt_allocations(company_id, invoice_id);

        CREATE INDEX IF NOT EXISTS company_8_alloc_company_receipt_idx
        ON company_8.receipt_allocations(company_id, receipt_id);

        -- ==================================================
        -- OPTIONAL BUT RECOMMENDED:
        -- 1) Receipt balance view (unallocated amounts)
        -- 2) Trigger to prevent allocating above receipt amount
        -- ==================================================

        CREATE OR REPLACE VIEW company_8.vw_receipt_balances AS
        SELECT
            r.company_id,
            r.id AS receipt_id,
            r.customer_id,
            r.amount::numeric(18,2) AS receipt_amount,
            COALESCE(SUM(ra.amount),0)::numeric(18,2) AS allocated_amount,
            (r.amount - COALESCE(SUM(ra.amount),0))::numeric(18,2) AS unallocated_amount
        FROM company_8.receipts r
        LEFT JOIN company_8.receipt_allocations ra
        ON ra.company_id = r.company_id
        AND ra.receipt_id = r.id
        GROUP BY r.company_id, r.id, r.customer_id, r.amount;

        CREATE OR REPLACE FUNCTION company_8.trg_check_receipt_allocation()
        RETURNS trigger AS $$
        DECLARE
            receipt_amt numeric(18,2);
            already_alloc numeric(18,2);
        BEGIN
        SELECT amount INTO receipt_amt
        FROM company_8.receipts
        WHERE company_id = NEW.company_id AND id = NEW.receipt_id;

        IF receipt_amt IS NULL THEN
            RAISE EXCEPTION 'Receipt not found';
        END IF;

        SELECT COALESCE(SUM(amount),0) INTO already_alloc
        FROM company_8.receipt_allocations
        WHERE company_id = NEW.company_id
            AND receipt_id = NEW.receipt_id
            AND id <> COALESCE(NEW.id, 0);

        IF (already_alloc + NEW.amount) > receipt_amt THEN
            RAISE EXCEPTION 'Allocation exceeds receipt amount (receipt=%, allocated=%, new=%)',
            receipt_amt, already_alloc, NEW.amount;
        END IF;

        RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS check_receipt_allocation ON company_8.receipt_allocations;

        CREATE TRIGGER check_receipt_allocation
        BEFORE INSERT OR UPDATE ON company_8.receipt_allocations
        FOR EACH ROW EXECUTE PROCEDURE company_8.trg_check_receipt_allocation();

        -- ==================================================
        -- QUOTATIONS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.quotations (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            customer_id INT NOT NULL REFERENCES company_8.customers(id),

            number TEXT NULL, -- draft-friendly quote number

            quotation_date DATE NOT NULL DEFAULT CURRENT_DATE,
            valid_until DATE NULL,                 -- expiry/terms end date

            currency TEXT NULL,
            subtotal_amount NUMERIC(18,2) DEFAULT 0,
            discount_amount NUMERIC(18,2) DEFAULT 0,
            vat_amount NUMERIC(18,2) DEFAULT 0,
            total_amount NUMERIC(18,2) DEFAULT 0,

            status TEXT NOT NULL DEFAULT 'draft',
            -- draft | issued | accepted | expired | converted | cancelled

            notes TEXT NULL,
            terms TEXT NULL,

            invoice_id INT NULL,                  -- once converted
            converted_at TIMESTAMPTZ NULL,

            issued_at TIMESTAMPTZ NULL,
            issued_by INT NULL,

            accepted_at TIMESTAMPTZ NULL,
            accepted_by INT NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.quotations
            ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(10,6) DEFAULT 0;

        -- Unique quote number per company only when number IS NOT NULL
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'company_8'
            AND indexname = 'uq_quotations_company_number_notnull'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_quotations_company_number_notnull
            ON %I.quotations (company_id, number)
            WHERE number IS NOT NULL',
            'company_8'
            );
        END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS company_8_quotations_customer_idx
        ON company_8.quotations(company_id, customer_id);

        CREATE INDEX IF NOT EXISTS company_8_quotations_status_idx
        ON company_8.quotations(company_id, status);


        -- ==================================================
        -- QUOTATION LINES
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.quotation_lines (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            quotation_id INT NOT NULL,
            line_no INT NOT NULL,

            item_name TEXT NULL,
            description TEXT NOT NULL,
            account_code TEXT NULL,  -- revenue account (optional)

            quantity NUMERIC(18,4) DEFAULT 1,
            unit_price NUMERIC(18,4) DEFAULT 0,
            discount_amount NUMERIC(18,2) DEFAULT 0,

            net_amount NUMERIC(18,2) DEFAULT 0,
            vat_rate NUMERIC(10,6) DEFAULT 0,
            vat_amount NUMERIC(18,2) DEFAULT 0,
            total_amount NUMERIC(18,2) DEFAULT 0
        );

        -- ✅ Simple FK (recommended in per-tenant schema)
        DO $fk_quotation_lines$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'fk_quotation_lines_quote'
            ) THEN
                EXECUTE format(
                'ALTER TABLE %I.quotation_lines
                    ADD CONSTRAINT fk_quotation_lines_quote
                    FOREIGN KEY (quotation_id)
                    REFERENCES %I.quotations(id)
                    ON DELETE CASCADE',
                'company_8',
                'company_8'
                );
            END IF;
        END $fk_quotation_lines$;

        CREATE INDEX IF NOT EXISTS company_8_quotation_lines_company_quote_idx
        ON company_8.quotation_lines(company_id, quotation_id);

        -- ==================================================
        -- LESSOR CONTRACTS (Operating leases / rentals)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.lessor_leases (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,

            contract_no TEXT NULL,              -- optional human ref
            contract_name TEXT NOT NULL,        -- e.g. "Office Space - Unit 12"
            customer_id INT NOT NULL,           -- reuse your existing customers table
            asset_id INT NULL,                  -- optional: link to PPE / property unit table

            start_date DATE NOT NULL,
            end_date   DATE NULL,               -- allow month-to-month

            billing_amount NUMERIC(18,2) NOT NULL DEFAULT 0,  -- gross or net? choose below
            billing_basis TEXT NOT NULL DEFAULT 'gross',      -- gross|net
            vat_rate NUMERIC(10,6) NOT NULL DEFAULT 0,

            billing_frequency TEXT NOT NULL,    -- monthly|weekly|annually|custom
            billing_timing TEXT NOT NULL DEFAULT 'arrears',   -- arrears|advance
            bill_day_of_month INT NULL,         -- for monthly billing, e.g. 1..28

            status TEXT NOT NULL DEFAULT 'active', -- active|terminated|suspended
            termination_date DATE NULL,
            notes TEXT NULL,

            -- Posting configuration
            revenue_account_code TEXT NULL,     -- rental income GL code (e.g. 4000)
            vat_output_account_code TEXT NULL,  -- VAT output (e.g. 2310)
            ar_account_code TEXT NULL,          -- Accounts receivable (e.g. 1100)
            bank_account_code TEXT NULL,        -- default receipt bank code

            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ NULL
        );

        -- Inside ensure_company_schema(), using company_8

        ALTER TABLE company_8.lessor_leases
        ADD COLUMN IF NOT EXISTS lease_classification TEXT NOT NULL DEFAULT 'operating',
        ADD COLUMN IF NOT EXISTS lessor_type TEXT NOT NULL DEFAULT 'ordinary',
        ADD COLUMN IF NOT EXISTS currency TEXT NULL,
        ADD COLUMN IF NOT EXISTS payment_terms_days INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(12,8) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS fair_value NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS carrying_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS guaranteed_residual_value NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS unguaranteed_residual_value NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS purchase_option_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS purchase_option_expected BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS initial_direct_costs NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS security_deposit_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS security_deposit_account_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS commencement_date DATE NULL,
        ADD COLUMN IF NOT EXISTS useful_life_months INT NULL,
        ADD COLUMN IF NOT EXISTS economic_life_months INT NULL,
        ADD COLUMN IF NOT EXISTS lease_term_months INT NULL,
        ADD COLUMN IF NOT EXISTS transfer_of_ownership BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS specialised_asset BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS major_part_threshold NUMERIC(10,6) DEFAULT 0.75,
        ADD COLUMN IF NOT EXISTS substantially_all_threshold NUMERIC(10,6) DEFAULT 0.90,
        ADD COLUMN IF NOT EXISTS classification_reason TEXT NULL,
        ADD COLUMN IF NOT EXISTS classification_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS finance_income_account_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS net_investment_current_account_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS net_investment_noncurrent_account_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS accrued_rental_account_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS deferred_rental_account_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS deposit_liability_account_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS disposal_gain_account_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS disposal_loss_account_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        ALTER TABLE company_8.lessor_leases
        ADD COLUMN IF NOT EXISTS commencement_journal_id INT NULL,
        ADD COLUMN IF NOT EXISTS commenced_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS commenced_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS initial_direct_cost_expense_account_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS initial_direct_cost_asset_account_code TEXT NULL;

        ALTER TABLE company_8.lessor_leases
        ADD COLUMN IF NOT EXISTS
        manufacturer_dealer_lessor BOOLEAN NOT NULL DEFAULT FALSE; 
    
        ALTER TABLE company_8.lessor_leases
        ADD COLUMN IF NOT EXISTS correction_count INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_corrected_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS last_corrected_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS last_correction_reason TEXT NULL;

        DO $fk_lessor_commencement_journal$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'fk_lessor_commencement_journal'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lessor_leases
                    ADD CONSTRAINT fk_lessor_commencement_journal
                    FOREIGN KEY (commencement_journal_id)
                    REFERENCES %I.journal(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8'
                );
            END IF;
        END
        $fk_lessor_commencement_journal$;

        DO $ck_lessor_lease_classification$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'ck_lessor_lease_classification'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lessor_leases
                    ADD CONSTRAINT ck_lessor_lease_classification
                    CHECK (
                        lease_classification IN (
                            ''operating'',
                            ''finance''
                        )
                    )',
                    'company_8'
                );
            END IF;
        END
        $ck_lessor_lease_classification$;

        DO $fk_lessor_bills_invoice$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'fk_lessor_bills_invoice'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lessor_lease_bills
                    ADD CONSTRAINT fk_lessor_bills_invoice
                    FOREIGN KEY (invoice_id)
                    REFERENCES %I.invoices(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8'
                );
            END IF;
        END
        $fk_lessor_bills_invoice$;

        DO $fk_lessor_bills_invoice_line$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'fk_lessor_bills_invoice_line'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lessor_lease_bills
                    ADD CONSTRAINT fk_lessor_bills_invoice_line
                    FOREIGN KEY (invoice_line_id)
                    REFERENCES %I.invoice_lines(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8'
                );
            END IF;
        END
        $fk_lessor_bills_invoice_line$;

        DO $fk_lessor_receipts_receipt$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'fk_lessor_receipts_receipt'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lessor_lease_receipts
                    ADD CONSTRAINT fk_lessor_receipts_receipt
                    FOREIGN KEY (receipt_id)
                    REFERENCES %I.receipts(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8'
                );
            END IF;
        END
        $fk_lessor_receipts_receipt$;


        CREATE INDEX IF NOT EXISTS company_8_lessor_leases_classification_idx
        ON company_8.lessor_leases(company_id, lease_classification, status);


        -- Safe add: updated_at
        DO $add_lessor_leases_updated_at$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='lessor_leases' AND column_name='updated_at'
        ) THEN
            EXECUTE format('ALTER TABLE %I.lessor_leases ADD COLUMN updated_at TIMESTAMPTZ NULL', 'company_8');
            EXECUTE format('UPDATE %I.lessor_leases SET updated_at = created_at WHERE updated_at IS NULL', 'company_8');
        END IF;
        END $add_lessor_leases_updated_at$;

        -- Checks
        DO $ck_lessor_leases_dates$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_lessor_leases_dates' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.lessor_leases
            ADD CONSTRAINT ck_lessor_leases_dates
            CHECK (end_date IS NULL OR end_date >= start_date)',
            'company_8'
            );
        END IF;
        END $ck_lessor_leases_dates$;

        ALTER TABLE company_8.lessor_leases
        DROP CONSTRAINT IF EXISTS ck_lessor_leases_amounts;

        ALTER TABLE company_8.lessor_leases
        ADD CONSTRAINT ck_lessor_leases_amounts
        CHECK (
            billing_amount>=0
            AND vat_rate>=0
            AND billing_basis IN ('gross','net')
            AND billing_timing IN ('arrears','advance')
            AND status IN (
                'draft',
                'active',
                'commenced',
                'suspended',
                'terminated'
            )
        );
        -- Uniqueness (avoid duplicates per company)
        DO $uq_lessor_leases_contract_no$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='company_8' AND indexname='uq_lessor_leases_company_contract_no'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_lessor_leases_company_contract_no
            ON %I.lessor_leases(company_id, COALESCE(contract_no, ''''))
            WHERE contract_no IS NOT NULL',
            'company_8'
            );
        END IF;
        END $uq_lessor_leases_contract_no$;

        -- Helpful indexes
        CREATE INDEX IF NOT EXISTS company_8_lessor_leases_company_status_idx
        ON company_8.lessor_leases(company_id, status);

        CREATE INDEX IF NOT EXISTS company_8_lessor_leases_company_dates_idx
        ON company_8.lessor_leases(company_id, start_date, end_date);

        CREATE INDEX IF NOT EXISTS company_8_lessor_leases_customer_idx
        ON company_8.lessor_leases(customer_id);

        CREATE INDEX IF NOT EXISTS company_8_lessor_leases_asset_idx
        ON company_8.lessor_leases(asset_id);

        -- FK: customer (reuse your customers table name!)
        DO $fk_lessor_leases_customer$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_lessor_leases_customer' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.lessor_leases
            ADD CONSTRAINT fk_lessor_leases_customer
            FOREIGN KEY (customer_id) REFERENCES %I.customers(id)',
            'company_8', 'company_8'
            );
        END IF;
        END $fk_lessor_leases_customer$;

        CREATE TABLE IF NOT EXISTS company_8.lessor_lease_schedule (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            lessor_lease_id INT NOT NULL,

            version_no INT NOT NULL DEFAULT 1,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            modification_id INT NULL,

            period_no INT NOT NULL,
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            payment_date DATE NOT NULL,
            due_date DATE NULL,

            contractual_net NUMERIC(18,2) NOT NULL DEFAULT 0,
            vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            contractual_gross NUMERIC(18,2) NOT NULL DEFAULT 0,

            straight_line_income NUMERIC(18,2) NOT NULL DEFAULT 0,
            initial_direct_cost_expense NUMERIC(18,2) NOT NULL DEFAULT 0,
            accrued_rental_movement NUMERIC(18,2) NOT NULL DEFAULT 0,
            deferred_rental_movement NUMERIC(18,2) NOT NULL DEFAULT 0,

            opening_net_investment NUMERIC(18,2) NOT NULL DEFAULT 0,
            finance_income NUMERIC(18,2) NOT NULL DEFAULT 0,
            principal_recovery NUMERIC(18,2) NOT NULL DEFAULT 0,
            closing_net_investment NUMERIC(18,2) NOT NULL DEFAULT 0,

            current_portion NUMERIC(18,2) NOT NULL DEFAULT 0,
            noncurrent_portion NUMERIC(18,2) NOT NULL DEFAULT 0,

            invoice_id INT NULL,
            invoice_line_id INT NULL,
            recognition_journal_id INT NULL,
            receipt_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            status TEXT NOT NULL DEFAULT 'scheduled',
            posted_at TIMESTAMPTZ NULL,
            posted_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NULL,

            FOREIGN KEY (lessor_lease_id)
            REFERENCES company_8.lessor_leases(id)
            ON DELETE CASCADE
        );

        ALTER TABLE company_8.lessor_lease_schedule
        ADD COLUMN IF NOT EXISTS recognition_journal_id INT NULL,
        ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS posted_by_user_id INT NULL;


        ALTER TABLE company_8.lessor_lease_schedule
        ADD COLUMN IF NOT EXISTS billed_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS billed_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS billing_error TEXT NULL;

        DO $fk_lessor_schedule_journal$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'fk_lessor_schedule_journal'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lessor_lease_schedule
                    ADD CONSTRAINT fk_lessor_schedule_journal
                    FOREIGN KEY (recognition_journal_id)
                    REFERENCES %I.journal(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8'
                );
            END IF;
        END
        $fk_lessor_schedule_journal$;

        DO $fk_lessor_schedule_invoice$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_lessor_schedule_invoice'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lessor_lease_schedule
                    ADD CONSTRAINT fk_lessor_schedule_invoice
                    FOREIGN KEY (invoice_id)
                    REFERENCES %I.invoices(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8'
                );
            END IF;
        END
        $fk_lessor_schedule_invoice$;

        DO $fk_lessor_schedule_invoice_line$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_lessor_schedule_invoice_line'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lessor_lease_schedule
                    ADD CONSTRAINT fk_lessor_schedule_invoice_line
                    FOREIGN KEY (invoice_line_id)
                    REFERENCES %I.invoice_lines(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8'
                );
            END IF;
        END
        $fk_lessor_schedule_invoice_line$;

        DO $fk_lessor_schedule_recognition_journal$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_lessor_schedule_recognition_journal'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lessor_lease_schedule
                    ADD CONSTRAINT fk_lessor_schedule_recognition_journal
                    FOREIGN KEY (recognition_journal_id)
                    REFERENCES %I.journal(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8'
                );
            END IF;
        END
        $fk_lessor_schedule_recognition_journal$;

        CREATE INDEX IF NOT EXISTS company_8_lessor_schedule_journal_idx
        ON company_8.lessor_lease_schedule(recognition_journal_id);

        DROP INDEX IF EXISTS company_8.company_8_uq_lessor_schedule_invoice;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_uq_lessor_schedule_invoice
        ON company_8.lessor_lease_schedule(invoice_id)
        WHERE invoice_id IS NOT NULL
        AND is_active=TRUE;


        DROP INDEX IF EXISTS company_8.company_8_uq_lessor_schedule_invoice_line;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_uq_lessor_schedule_invoice_line
        ON company_8.lessor_lease_schedule(invoice_line_id)
        WHERE invoice_line_id IS NOT NULL
        AND is_active=TRUE;

        CREATE INDEX IF NOT EXISTS
            company_8_idx_lessor_schedule_billing
        ON company_8.lessor_lease_schedule(
            company_id,
            lessor_lease_id,
            is_active,
            payment_date,
            status
        );

        CREATE INDEX IF NOT EXISTS company_8_lessor_schedule_invoice_idx
        ON company_8.lessor_lease_schedule(invoice_id);

        CREATE INDEX IF NOT EXISTS company_8_lessor_schedule_invoice_line_idx
        ON company_8.lessor_lease_schedule(invoice_line_id);

        CREATE INDEX IF NOT EXISTS company_8_lessor_schedule_recognition_journal_idx
        ON company_8.lessor_lease_schedule(recognition_journal_id);

        CREATE TABLE IF NOT EXISTS company_8.lessor_lease_adjustments (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            lessor_lease_id INT NOT NULL,
            adjustment_type TEXT NOT NULL,
            adjustment_date DATE NOT NULL,
            amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            description TEXT NULL,
            account_code TEXT NULL,
            invoice_id INT NULL,
            posted_journal_id INT NULL,
            status TEXT NOT NULL DEFAULT 'draft',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            FOREIGN KEY (lessor_lease_id)
            REFERENCES company_8.lessor_leases(id)
            ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS company_8.lessor_lease_modifications (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            lessor_lease_id INT NOT NULL,
            modification_date DATE NOT NULL,
            effective_date DATE NOT NULL,
            modification_type TEXT NOT NULL,
            reason TEXT NULL,

            old_classification TEXT NULL,
            new_classification TEXT NULL,
            separate_lease BOOLEAN NOT NULL DEFAULT FALSE,

            old_payment_amount NUMERIC(18,2) DEFAULT 0,
            new_payment_amount NUMERIC(18,2) DEFAULT 0,
            old_end_date DATE NULL,
            new_end_date DATE NULL,
            old_discount_rate NUMERIC(12,8) DEFAULT 0,
            new_discount_rate NUMERIC(12,8) DEFAULT 0,

            net_investment_before NUMERIC(18,2) DEFAULT 0,
            net_investment_after NUMERIC(18,2) DEFAULT 0,
            accrued_rental_before NUMERIC(18,2) DEFAULT 0,
            deferred_rental_before NUMERIC(18,2) DEFAULT 0,
            gain_loss_amount NUMERIC(18,2) DEFAULT 0,

            status TEXT NOT NULL DEFAULT 'draft',
            preview_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            posted_journal_id INT NULL,
            created_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            FOREIGN KEY (lessor_lease_id)
            REFERENCES company_8.lessor_leases(id)
            ON DELETE CASCADE
        );

        ALTER TABLE company_8.lessor_lease_modifications
        ADD COLUMN IF NOT EXISTS effective_date DATE NULL,
        ADD COLUMN IF NOT EXISTS modification_type TEXT NULL,
        ADD COLUMN IF NOT EXISTS old_classification TEXT NULL,
        ADD COLUMN IF NOT EXISTS new_classification TEXT NULL,
        ADD COLUMN IF NOT EXISTS separate_lease BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS old_payment_amount NUMERIC(18,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS new_payment_amount NUMERIC(18,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS old_discount_rate NUMERIC(12,8) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS new_discount_rate NUMERIC(12,8) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS net_investment_before NUMERIC(18,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS net_investment_after NUMERIC(18,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS accrued_rental_before NUMERIC(18,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS deferred_rental_before NUMERIC(18,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS gain_loss_amount NUMERIC(18,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS preview_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL;

        ALTER TABLE company_8.lessor_lease_modifications
        ADD COLUMN IF NOT EXISTS effective_date DATE NULL,
        ADD COLUMN IF NOT EXISTS modification_type TEXT NULL,
        ADD COLUMN IF NOT EXISTS reason TEXT NULL,
        ADD COLUMN IF NOT EXISTS preview_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS posted_journal_id INT NULL,
        ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS posted_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS reversed_journal_id INT NULL,
        ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

        UPDATE company_8.lessor_lease_modifications
        SET
            effective_date = COALESCE(
                effective_date,
                effective_from,
                modification_date
            ),

            modification_type = COALESCE(
                modification_type,
                change_type
            ),

            old_payment_amount = COALESCE(
                old_payment_amount,
                old_billing_amount,
                0
            ),

            new_payment_amount = COALESCE(
                new_payment_amount,
                new_billing_amount,
                0
            ),

            created_by_user_id = COALESCE(
                created_by_user_id,
                created_by
            )
        WHERE
            effective_date IS NULL
            OR modification_type IS NULL
            OR created_by_user_id IS NULL;

        ALTER TABLE company_8.lessor_lease_modifications
        ALTER COLUMN effective_date SET NOT NULL,
        ALTER COLUMN modification_type SET NOT NULL;

        -- ==================================================
        -- LESSOR BILLING RUNS (invoice schedule / generated items)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.lessor_lease_bills (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            lessor_lease_id INT NOT NULL,

            bill_period_start DATE NOT NULL,
            bill_period_end   DATE NOT NULL,
            bill_date DATE NOT NULL,            -- invoice date
            due_date  DATE NULL,

            amount_gross NUMERIC(18,2) NOT NULL DEFAULT 0,
            amount_net   NUMERIC(18,2) NOT NULL DEFAULT 0,
            vat_amount   NUMERIC(18,2) NOT NULL DEFAULT 0,
            vat_rate NUMERIC(10,6) NOT NULL DEFAULT 0,

            status TEXT NOT NULL DEFAULT 'draft',  -- draft|posted|void|paid
            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,

            ar_account_code TEXT NULL,
            revenue_account_code TEXT NULL,
            vat_output_account_code TEXT NULL,

            reference TEXT NULL,
            notes TEXT NULL,

            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE company_8.lessor_lease_bills
        ADD COLUMN IF NOT EXISTS schedule_id INT NULL,
        ADD COLUMN IF NOT EXISTS invoice_id INT NULL,
        ADD COLUMN IF NOT EXISTS invoice_line_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL;

        -- Checks
        DO $ck_lessor_lease_bills_valid$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_lessor_lease_bills_valid' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.lessor_lease_bills
            ADD CONSTRAINT ck_lessor_lease_bills_valid
            CHECK (
                bill_period_end >= bill_period_start
                AND amount_gross >= 0 AND amount_net >= 0 AND vat_amount >= 0
                AND (amount_net + vat_amount) <= (amount_gross + 0.02)
                AND status IN (''draft'',''posted'',''void'',''paid'')
            )',
            'company_8'
            );
        END IF;
        END $ck_lessor_lease_bills_valid$;

        -- Anti-duplicate: one bill per contract per bill_date (or per period)
        DO $uq_lessor_lease_bills_unique$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='company_8' AND indexname='uq_lessor_lease_bills_contract_period'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_lessor_lease_bills_contract_period
            ON %I.lessor_lease_bills(lessor_lease_id, bill_period_start, bill_period_end)
            WHERE status <> ''void''',
            'company_8'
            );
        END IF;
        END $uq_lessor_lease_bills_unique$;

        -- Indexes
        CREATE INDEX IF NOT EXISTS company_8_lessor_lease_bills_company_idx
        ON company_8.lessor_lease_bills(company_id);

        CREATE INDEX IF NOT EXISTS company_8_lessor_lease_bills_contract_idx
        ON company_8.lessor_lease_bills(lessor_lease_id);

        CREATE INDEX IF NOT EXISTS company_8_lessor_lease_bills_schedule_idx
        ON company_8.lessor_lease_bills(schedule_id);

        CREATE INDEX IF NOT EXISTS company_8_lessor_lease_bills_bill_date_idx
        ON company_8.lessor_lease_bills(bill_date);

        CREATE INDEX IF NOT EXISTS company_8_lessor_lease_bills_status_idx
        ON company_8.lessor_lease_bills(status);

        CREATE INDEX IF NOT EXISTS company_8_lessor_bills_invoice_idx
        ON company_8.lessor_lease_bills(invoice_id);

        -- FK
        DO $fk_lessor_lease_bills_contract$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_lessor_lease_bills_contract' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.lessor_lease_bills
            ADD CONSTRAINT fk_lessor_lease_bills_contract
            FOREIGN KEY (lessor_lease_id) REFERENCES %I.lessor_leases(id)',
            'company_8', 'company_8'
            );
        END IF;
        END $fk_lessor_lease_bills_contract$;

        DO $fk_lessor_lease_bills_schedule$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_lessor_lease_bills_schedule' AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                'ALTER TABLE %I.lessor_lease_bills
                ADD CONSTRAINT fk_lessor_lease_bills_schedule
                FOREIGN KEY (schedule_id) REFERENCES %I.lessor_lease_schedule(id)
                ON DELETE SET NULL',
                'company_8', 'company_8'
                );
            END IF;
        END $fk_lessor_lease_bills_schedule$;


        
        CREATE TABLE IF NOT EXISTS company_8.lessor_lease_payment_terms (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            lessor_lease_id INT NOT NULL,
            effective_from DATE NOT NULL,
            effective_to DATE NULL,
            payment_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            payment_frequency TEXT NOT NULL DEFAULT 'monthly',
            payment_timing TEXT NOT NULL DEFAULT 'arrears',
            billing_basis TEXT NOT NULL DEFAULT 'gross',
            vat_rate NUMERIC(10,6) NOT NULL DEFAULT 0,
            escalation_rate NUMERIC(12,8) NOT NULL DEFAULT 0,
            escalation_frequency TEXT NULL,
            rent_free BOOLEAN NOT NULL DEFAULT FALSE,
            variable_payment BOOLEAN NOT NULL DEFAULT FALSE,
            variable_formula JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            FOREIGN KEY (lessor_lease_id)
            REFERENCES company_8.lessor_leases(id)
            ON DELETE CASCADE
        );

        -- ==================================================
        -- LESSOR RECEIPTS (cash received from lessee)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.lessor_lease_receipts (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            lessor_lease_id INT NOT NULL,
            bill_id INT NULL,                 -- optional: allocate to a bill

            receipt_date DATE NOT NULL,
            amount_gross NUMERIC(18,2) NOT NULL DEFAULT 0,
            reference TEXT NULL,
            notes TEXT NULL,

            bank_account_code TEXT NULL,

            status TEXT NOT NULL DEFAULT 'draft', -- draft|posted|reversed|void
            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,

            reverses_receipt_id INT NULL,
            reversed_by_receipt_id INT NULL,

            created_by INT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE company_8.lessor_lease_receipts
        ADD COLUMN IF NOT EXISTS receipt_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL;

        -- Checks
        DO $ck_lessor_lease_receipts_valid$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_lessor_lease_receipts_valid' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.lessor_lease_receipts
            ADD CONSTRAINT ck_lessor_lease_receipts_valid
            CHECK (
                receipt_date IS NOT NULL
                AND amount_gross >= 0
                AND status IN (''draft'',''posted'',''reversed'',''void'')
                AND (reverses_receipt_id IS NULL OR reverses_receipt_id <> id)
            )',
            'company_8'
            );
        END IF;
        END $ck_lessor_lease_receipts_valid$;

        -- Anti-duplicate
        DO $uq_lessor_lease_receipts_unique$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='company_8' AND indexname='uq_lessor_lease_receipts_contract_date_amount_ref'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_lessor_lease_receipts_contract_date_amount_ref
            ON %I.lessor_lease_receipts(lessor_lease_id, receipt_date, amount_gross, COALESCE(reference, ''''))
            WHERE status <> ''void''',
            'company_8'
            );
        END IF;
        END $uq_lessor_lease_receipts_unique$;

        -- Indexes
        CREATE INDEX IF NOT EXISTS company_8_lessor_lease_receipts_contract_idx
        ON company_8.lessor_lease_receipts(lessor_lease_id);

        CREATE INDEX IF NOT EXISTS company_8_lessor_lease_receipts_bill_idx
        ON company_8.lessor_lease_receipts(bill_id);

        CREATE INDEX IF NOT EXISTS company_8_lessor_lease_receipts_posted_journal_id_idx
        ON company_8.lessor_lease_receipts(posted_journal_id);

        -- FKs
        DO $fk_lessor_lease_receipts_contract$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_lessor_lease_receipts_contract' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.lessor_lease_receipts
            ADD CONSTRAINT fk_lessor_lease_receipts_contract
            FOREIGN KEY (lessor_lease_id) REFERENCES %I.lessor_leases(id)',
            'company_8', 'company_8'
            );
        END IF;
        END $fk_lessor_lease_receipts_contract$;

        DO $fk_lessor_lease_receipts_bill$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_lessor_lease_receipts_bill' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.lessor_lease_receipts
            ADD CONSTRAINT fk_lessor_lease_receipts_bill
            FOREIGN KEY (bill_id) REFERENCES %I.lessor_lease_bills(id)',
            'company_8', 'company_8'
            );
        END IF;
        END $fk_lessor_lease_receipts_bill$;

        DO $add_lessor_bank_account_id_cols$
        BEGIN
        -- lessor_leases
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='company_8' AND table_name='lessor_leases') THEN
            IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='lessor_leases' AND column_name='bank_account_id'
            ) THEN
            EXECUTE format('ALTER TABLE %I.lessor_leases ADD COLUMN bank_account_id INT NULL', 'company_8');
            END IF;
        END IF;

        -- lessor_lease_receipts
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='company_8' AND table_name='lessor_lease_receipts') THEN
            IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='lessor_lease_receipts' AND column_name='bank_account_id'
            ) THEN
            EXECUTE format('ALTER TABLE %I.lessor_lease_receipts ADD COLUMN bank_account_id INT NULL', 'company_8');
            END IF;
        END IF;
        END
        $add_lessor_bank_account_id_cols$;

        -- FK to company_bank_accounts
        DO $fk_lessor_bank_account$
        BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='company_8' AND table_name='lessor_leases') THEN
            IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_lessor_leases_bank' AND n.nspname='company_8'
            ) THEN
            EXECUTE format(
                'ALTER TABLE %I.lessor_leases
                ADD CONSTRAINT fk_lessor_leases_bank
                FOREIGN KEY (bank_account_id) REFERENCES %I.company_bank_accounts(id)',
                'company_8', 'company_8'
            );
            END IF;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='company_8' AND table_name='lessor_lease_receipts') THEN
            IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_lessor_receipts_bank' AND n.nspname='company_8'
            ) THEN
            EXECUTE format(
                'ALTER TABLE %I.lessor_lease_receipts
                ADD CONSTRAINT fk_lessor_receipts_bank
                FOREIGN KEY (bank_account_id) REFERENCES %I.company_bank_accounts(id)',
                'company_8', 'company_8'
            );
            END IF;
        END IF;
        END
        $fk_lessor_bank_account$;

        CREATE INDEX IF NOT EXISTS company_8_lessor_leases_bank_account_id_idx
        ON company_8.lessor_leases(bank_account_id);

        CREATE INDEX IF NOT EXISTS company_8_lessor_receipts_bank_account_id_idx
        ON company_8.lessor_lease_receipts(bank_account_id);

        -- FKs
        DO $fk_lessor_mods_contract$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_lessor_mods_contract' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.lessor_lease_modifications
            ADD CONSTRAINT fk_lessor_mods_contract
            FOREIGN KEY (lessor_lease_id) REFERENCES %I.lessor_leases(id)',
            'company_8', 'company_8'
            );
        END IF;
        END $fk_lessor_mods_contract$;

        DO $fk_lessor_mods_posted_journal$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_lessor_mods_journal' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.lessor_lease_modifications
            ADD CONSTRAINT fk_lessor_mods_journal
            FOREIGN KEY (posted_journal_id) REFERENCES %I.journal(id)',
            'company_8', 'company_8'
            );
        END IF;
        END $fk_lessor_mods_posted_journal$;

        -- Checks
        DO $ck_lessor_mods_valid$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_lessor_mods_valid' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.lessor_lease_modifications
            ADD CONSTRAINT ck_lessor_mods_valid
            CHECK (
                modification_date IS NOT NULL
                AND change_type IN (''amount'',''vat'',''frequency'',''term'',''mixed'')
                AND status IN (''draft'',''posted'',''reversed'',''void'')
                AND apply_to_unbilled_only IN (TRUE,FALSE)
            )',
            'company_8'
            );
        END IF;
        END $ck_lessor_mods_valid$;

        -- Anti-duplicate: same contract + same date + type (non-void)
        DO $uq_lessor_mods_contract_date_type$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='company_8' AND indexname='uq_lessor_mods_contract_date_type'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_lessor_mods_contract_date_type
            ON %I.lessor_lease_modifications(lessor_lease_id, modification_date, change_type)
            WHERE status <> ''void''',
            'company_8'
            );
        END IF;
        END $uq_lessor_mods_contract_date_type$;

        -- Indexes
        CREATE INDEX IF NOT EXISTS company_8_lessor_receipts_receipt_idx
        ON company_8.lessor_lease_receipts(receipt_id);

        CREATE INDEX IF NOT EXISTS company_8_lessor_mods_company_idx
        ON company_8.lessor_lease_modifications(company_id);

        CREATE INDEX IF NOT EXISTS company_8_lessor_mods_contract_idx
        ON company_8.lessor_lease_modifications(lessor_lease_id);

        CREATE INDEX IF NOT EXISTS company_8_lessor_mods_status_idx
        ON company_8.lessor_lease_modifications(status);

        CREATE INDEX IF NOT EXISTS company_8_lessor_mods_posted_journal_id_idx
        ON company_8.lessor_lease_modifications(posted_journal_id);

        -- ==================================================
        -- LESSOR LEASE TERMINATIONS (Operating lessor)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.lessor_lease_terminations (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            lessor_lease_id INT NOT NULL,

            termination_date DATE NOT NULL,
            termination_type TEXT NOT NULL DEFAULT 'full',
            reason TEXT NULL,

            settlement_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            carrying_amount_before NUMERIC(18,2) NOT NULL DEFAULT 0,
            receivable_before NUMERIC(18,2) NOT NULL DEFAULT 0,
            accrued_rental_before NUMERIC(18,2) NOT NULL DEFAULT 0,
            deferred_rental_before NUMERIC(18,2) NOT NULL DEFAULT 0,
            gain_loss_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            preview_json JSONB NOT NULL DEFAULT '{}'::jsonb,

            posted_journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,
            posted_by_user_id INT NULL,

            reversed_journal_id INT NULL,
            reversed_at TIMESTAMPTZ NULL,

            status TEXT NOT NULL DEFAULT 'draft',

            created_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            FOREIGN KEY (lessor_lease_id)
            REFERENCES company_8.lessor_leases(id)
            ON DELETE CASCADE
        );

        ALTER TABLE company_8.lessor_lease_terminations
        ADD COLUMN IF NOT EXISTS settlement_gross NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS settlement_net NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS settlement_vat NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(10,6) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS returned_asset_value NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS net_investment_derecognised NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS accrued_rent_settled NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS deferred_rent_released NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS calculation_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS settlement_bill_id BIGINT NULL;

        UPDATE company_8.lessor_lease_terminations
        SET
            settlement_gross=CASE
                WHEN settlement_gross=0 AND COALESCE(settlement_amount,0)<>0
                THEN settlement_amount
                ELSE settlement_gross
            END,
            settlement_net=CASE
                WHEN settlement_net=0
                AND settlement_vat=0
                AND COALESCE(settlement_amount,0)<>0
                THEN settlement_amount
                ELSE settlement_net
            END,
            calculation_payload=COALESCE(
                calculation_payload,
                preview_json,
                '{}'::jsonb
            );

        DO $fk_lessor_terms_settlement_bill$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='fk_lessor_terms_settlement_bill'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lessor_lease_terminations
                    ADD CONSTRAINT fk_lessor_terms_settlement_bill
                    FOREIGN KEY (settlement_bill_id)
                    REFERENCES %I.lessor_lease_bills(id)
                    ON DELETE SET NULL',
                    'company_8','company_8'
                );
            END IF;
        END $fk_lessor_terms_settlement_bill$;

        -- FKs
        DO $fk_lessor_terms_contract$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_lessor_terms_contract' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.lessor_lease_terminations
            ADD CONSTRAINT fk_lessor_terms_contract
            FOREIGN KEY (lessor_lease_id) REFERENCES %I.lessor_leases(id)',
            'company_8', 'company_8'
            );
        END IF;
        END $fk_lessor_terms_contract$;

        DO $fk_lessor_terms_journal$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_lessor_terms_journal' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.lessor_lease_terminations
            ADD CONSTRAINT fk_lessor_terms_journal
            FOREIGN KEY (posted_journal_id) REFERENCES %I.journal(id)',
            'company_8', 'company_8'
            );
        END IF;
        END $fk_lessor_terms_journal$;

        -- Checks
        ALTER TABLE company_8.lessor_lease_terminations
        DROP CONSTRAINT IF EXISTS ck_lessor_terms_valid;

        ALTER TABLE company_8.lessor_lease_terminations
        ADD CONSTRAINT ck_lessor_terms_valid
        CHECK (
            termination_date IS NOT NULL
            AND settlement_amount>=0
            AND settlement_gross>=0
            AND settlement_net>=0
            AND settlement_vat>=0
            AND vat_rate>=0
            AND returned_asset_value>=0
            AND net_investment_derecognised>=0
            AND accrued_rent_settled>=0
            AND deferred_rent_released>=0
            AND ABS((settlement_net+settlement_vat)-settlement_gross)<=0.02
            AND termination_type IN ('full','partial')
            AND status IN ('draft','posted','reversed','void')
        );

        -- One termination per contract (non-void)
        DO $uq_lessor_terms_one_per_contract$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE schemaname='company_8' AND indexname='uq_lessor_terms_one_per_contract'
        ) THEN
            EXECUTE format(
            'CREATE UNIQUE INDEX uq_lessor_terms_one_per_contract
            ON %I.lessor_lease_terminations(lessor_lease_id)
            WHERE status <> ''void''',
            'company_8'
            );
        END IF;
        END $uq_lessor_terms_one_per_contract$;

        -- Indexes
        CREATE INDEX IF NOT EXISTS company_8_lessor_terms_company_idx
        ON company_8.lessor_lease_terminations(company_id);

        CREATE INDEX IF NOT EXISTS company_8_lessor_terms_contract_idx
        ON company_8.lessor_lease_terminations(lessor_lease_id);

        CREATE INDEX IF NOT EXISTS company_8_lessor_terms_status_idx
        ON company_8.lessor_lease_terminations(status);

        CREATE INDEX IF NOT EXISTS company_8_lessor_terms_posted_journal_id_idx
        ON company_8.lessor_lease_terminations(posted_journal_id);

        DO $add_lessor_leases_termination_cols$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='lessor_leases' AND column_name='termination_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.lessor_leases ADD COLUMN termination_id INT NULL', 'company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='lessor_leases' AND column_name='termination_date'
        ) THEN
            EXECUTE format('ALTER TABLE %I.lessor_leases ADD COLUMN termination_date DATE NULL', 'company_8');
        END IF;
        END
        $add_lessor_leases_termination_cols$;

        DO $fk_lessor_leases_termination$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='fk_lessor_leases_termination' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.lessor_leases
            ADD CONSTRAINT fk_lessor_leases_termination
            FOREIGN KEY (termination_id) REFERENCES %I.lessor_lease_terminations(id)',
            'company_8', 'company_8'
            );
        END IF;
        END
        $fk_lessor_leases_termination$;

        CREATE INDEX IF NOT EXISTS company_8_lessor_leases_termination_id_idx
        ON company_8.lessor_leases(termination_id);

        DO $add_customers_customer_type$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='customers' AND column_name='customer_type'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.customers ADD COLUMN customer_type TEXT NULL',
            'company_8'
            );
            -- optional: default existing to 'sales'
            EXECUTE format(
            'UPDATE %I.customers SET customer_type = COALESCE(customer_type, ''sales'')',
            'company_8'
            );
        END IF;
        END
        $add_customers_customer_type$;
        
        CREATE TABLE IF NOT EXISTS company_8.lessor_lease_events (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL,
            lessor_lease_id INT NOT NULL,

            event_type TEXT NOT NULL,
            event_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            effective_date DATE NULL,

            source_table TEXT NULL,
            source_id INT NULL,

            title TEXT NOT NULL,
            description TEXT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,

            created_by_user_id INT NULL,

            FOREIGN KEY (lessor_lease_id)
            REFERENCES company_8.lessor_leases(id)
            ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS company_8_lessor_events_lease_idx
        ON company_8.lessor_lease_events(
            company_id,
            lessor_lease_id,
            event_date DESC
        );

        CREATE INDEX IF NOT EXISTS company_8_lessor_mods_lease_idx
        ON company_8.lessor_lease_modifications(
            company_id,
            lessor_lease_id,
            effective_date DESC
        );

        CREATE INDEX IF NOT EXISTS company_8_lessor_terms_lease_idx
        ON company_8.lessor_lease_terminations(
            company_id,
            lessor_lease_id,
            termination_date DESC
        );

        CREATE INDEX IF NOT EXISTS company_8_lessor_schedule_versions_idx
        ON company_8.lessor_lease_schedule(
            company_id,
            lessor_lease_id,
            version_no,
            period_no
        );

        -- ==================================================
        -- PERIOD LOCKS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.period_locks (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            module TEXT NOT NULL DEFAULT 'gl',      -- gl/ar/ap/all
            lock_from DATE NOT NULL,
            lock_to DATE NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',  -- active/inactive
            reason TEXT NULL,
            created_by INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_period_locks_active_range_idx
        ON company_8.period_locks(company_id, module, status, lock_from, lock_to);
       
        CREATE INDEX IF NOT EXISTS period_locks_active_range_idx
            ON company_8.period_locks(company_id, status, module, lock_from, lock_to);

        DO $pl_chk$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'period_locks_status_chk'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.period_locks
            ADD CONSTRAINT period_locks_status_chk
            CHECK (status IN (''active'',''inactive''))',
            'company_8'
            );
        END IF;
        END
        $pl_chk$;
           
        -- ==================================================
        -- SAFE EVOLUTION: legacy tables missing company_id
        -- ==================================================
        DO $$
        BEGIN
        -- company_bank_accounts
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='company_bank_accounts' AND column_name='company_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.company_bank_accounts ADD COLUMN company_id INT', 'company_8');
            EXECUTE format('UPDATE %I.company_bank_accounts SET company_id = 8 WHERE company_id IS NULL', 'company_8', 8);
            EXECUTE format('ALTER TABLE %I.company_bank_accounts ALTER COLUMN company_id SET NOT NULL', 'company_8');
            EXECUTE format('ALTER TABLE %I.company_bank_accounts ALTER COLUMN company_id SET DEFAULT 8', 'company_8', 8);
        END IF;

        -- invoices
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='invoices' AND column_name='company_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.invoices ADD COLUMN company_id INT', 'company_8');
            EXECUTE format('UPDATE %I.invoices SET company_id = 8 WHERE company_id IS NULL', 'company_8', 8);
            EXECUTE format('ALTER TABLE %I.invoices ALTER COLUMN company_id SET NOT NULL', 'company_8');
            EXECUTE format('ALTER TABLE %I.invoices ALTER COLUMN company_id SET DEFAULT 8', 'company_8', 8);
        END IF;

        -- invoice_lines
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='invoice_lines' AND column_name='company_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.invoice_lines ADD COLUMN company_id INT', 'company_8');
            EXECUTE format('UPDATE %I.invoice_lines SET company_id = 8 WHERE company_id IS NULL', 'company_8', 8);
            EXECUTE format('ALTER TABLE %I.invoice_lines ALTER COLUMN company_id SET NOT NULL', 'company_8');
            EXECUTE format('ALTER TABLE %I.invoice_lines ALTER COLUMN company_id SET DEFAULT 8', 'company_8', 8);
        END IF;

        -- invoice_counters
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='invoice_counters' AND column_name='company_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.invoice_counters ADD COLUMN company_id INT', 'company_8');
            EXECUTE format('UPDATE %I.invoice_counters SET company_id = 8 WHERE company_id IS NULL', 'company_8', 8);
            EXECUTE format('ALTER TABLE %I.invoice_counters ALTER COLUMN company_id SET NOT NULL', 'company_8');
            EXECUTE format('ALTER TABLE %I.invoice_counters ALTER COLUMN company_id SET DEFAULT 8', 'company_8', 8);
        END IF;

        -- ==================================================
        -- receipts (legacy upgrade)
        -- ==================================================
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='receipts' AND column_name='company_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.receipts ADD COLUMN company_id INT', 'company_8');
        END IF;

        EXECUTE format('UPDATE %I.receipts SET company_id = 8 WHERE company_id IS NULL', 'company_8', 8);
        EXECUTE format('ALTER TABLE %I.receipts ALTER COLUMN company_id SET DEFAULT 8', 'company_8', 8);
        EXECUTE format('ALTER TABLE %I.receipts ALTER COLUMN company_id SET NOT NULL', 'company_8');

        -- ==================================================
        -- receipt_allocations (legacy upgrade)
        -- ==================================================
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='receipt_allocations' AND column_name='company_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.receipt_allocations ADD COLUMN company_id INT', 'company_8');
        END IF;

        EXECUTE format('UPDATE %I.receipt_allocations SET company_id = 8 WHERE company_id IS NULL', 'company_8', 8);
        EXECUTE format('ALTER TABLE %I.receipt_allocations ALTER COLUMN company_id SET DEFAULT 8', 'company_8', 8);
        EXECUTE format('ALTER TABLE %I.receipt_allocations ALTER COLUMN company_id SET NOT NULL', 'company_8');

        -- bank_statements
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='bank_statements' AND column_name='company_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.bank_statements ADD COLUMN company_id INT', 'company_8');
            EXECUTE format('UPDATE %I.bank_statements SET company_id = 8 WHERE company_id IS NULL', 'company_8', 8);
            EXECUTE format('ALTER TABLE %I.bank_statements ALTER COLUMN company_id SET NOT NULL', 'company_8');
            EXECUTE format('ALTER TABLE %I.bank_statements ALTER COLUMN company_id SET DEFAULT 8', 'company_8', 8);
        END IF;

        -- bank_statement_lines
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='bank_statement_lines' AND column_name='company_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.bank_statement_lines ADD COLUMN company_id INT', 'company_8');
            EXECUTE format('UPDATE %I.bank_statement_lines SET company_id = 8 WHERE company_id IS NULL', 'company_8', 8);
            EXECUTE format('ALTER TABLE %I.bank_statement_lines ALTER COLUMN company_id SET NOT NULL', 'company_8');
            EXECUTE format('ALTER TABLE %I.bank_statement_lines ALTER COLUMN company_id SET DEFAULT 8', 'company_8', 8);
        END IF;

        -- credit_profiles
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='credit_profiles' AND column_name='company_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.credit_profiles ADD COLUMN company_id INT', 'company_8');
            EXECUTE format('UPDATE %I.credit_profiles SET company_id = 8 WHERE company_id IS NULL', 'company_8', 8);
            EXECUTE format('ALTER TABLE %I.credit_profiles ALTER COLUMN company_id SET NOT NULL', 'company_8');
            EXECUTE format('ALTER TABLE %I.credit_profiles ALTER COLUMN company_id SET DEFAULT 8', 'company_8', 8);
        END IF;

        -- leases
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='leases' AND column_name='company_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.leases ADD COLUMN company_id INT', 'company_8');
            EXECUTE format('UPDATE %I.leases SET company_id = 8 WHERE company_id IS NULL', 'company_8', 8);
            EXECUTE format('ALTER TABLE %I.leases ALTER COLUMN company_id SET NOT NULL', 'company_8');
            EXECUTE format('ALTER TABLE %I.leases ALTER COLUMN company_id SET DEFAULT 8', 'company_8', 8);
        END IF;

        -- vendors
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='vendors' AND column_name='company_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.vendors ADD COLUMN company_id INT', 'company_8');
            EXECUTE format('UPDATE %I.vendors SET company_id = 8 WHERE company_id IS NULL', 'company_8', 8);
            EXECUTE format('ALTER TABLE %I.vendors ALTER COLUMN company_id SET NOT NULL', 'company_8');
            EXECUTE format('ALTER TABLE %I.vendors ALTER COLUMN company_id SET DEFAULT 8', 'company_8', 8);
        END IF;

        -- inventory_items
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='inventory_items' AND column_name='company_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.inventory_items ADD COLUMN company_id INT', 'company_8');
            EXECUTE format('UPDATE %I.inventory_items SET company_id = 8 WHERE company_id IS NULL', 'company_8', 8);
            EXECUTE format('ALTER TABLE %I.inventory_items ALTER COLUMN company_id SET NOT NULL', 'company_8');
            EXECUTE format('ALTER TABLE %I.inventory_items ALTER COLUMN company_id SET DEFAULT 8', 'company_8', 8);
        END IF;

        -- inventory_layers
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='inventory_layers' AND column_name='company_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.inventory_layers ADD COLUMN company_id INT', 'company_8');
            EXECUTE format('UPDATE %I.inventory_layers SET company_id = 8 WHERE company_id IS NULL', 'company_8', 8);
            EXECUTE format('ALTER TABLE %I.inventory_layers ALTER COLUMN company_id SET NOT NULL', 'company_8');
            EXECUTE format('ALTER TABLE %I.inventory_layers ALTER COLUMN company_id SET DEFAULT 8', 'company_8', 8);
        END IF;

        -- pos_summaries
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='pos_summaries' AND column_name='company_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.pos_summaries ADD COLUMN company_id INT', 'company_8');
            EXECUTE format('UPDATE %I.pos_summaries SET company_id = 8 WHERE company_id IS NULL', 'company_8', 8);
            EXECUTE format('ALTER TABLE %I.pos_summaries ALTER COLUMN company_id SET NOT NULL', 'company_8');
            EXECUTE format('ALTER TABLE %I.pos_summaries ALTER COLUMN company_id SET DEFAULT 8', 'company_8', 8);
        END IF;

        -- pos_summary_lines
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='company_8' AND table_name='pos_summary_lines' AND column_name='company_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I.pos_summary_lines ADD COLUMN company_id INT', 'company_8');
            EXECUTE format('UPDATE %I.pos_summary_lines SET company_id = 8 WHERE company_id IS NULL', 'company_8', 8);
            EXECUTE format('ALTER TABLE %I.pos_summary_lines ALTER COLUMN company_id SET NOT NULL', 'company_8');
            EXECUTE format('ALTER TABLE %I.pos_summary_lines ALTER COLUMN company_id SET DEFAULT 8', 'company_8', 8);
        END IF;

        END $$;


        -- ==================================================
        -- AUDIT TRAIL
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.audit_trail (
            id                 BIGSERIAL PRIMARY KEY,
            company_id          INT NOT NULL DEFAULT 8,

            occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            actor_user_id       INT NULL,         -- allow NULL for system/import jobs
            module              TEXT NOT NULL,
            action              TEXT NOT NULL,
            severity            TEXT NOT NULL DEFAULT 'info', -- info/warn/critical

            entity_type         TEXT NOT NULL,
            entity_id           TEXT NOT NULL,
            entity_ref          TEXT NULL,

            journal_id          INT NULL REFERENCES company_8.journal(id) ON DELETE SET NULL,
            customer_id         INT NULL REFERENCES company_8.customers(id) ON DELETE SET NULL,
            vendor_id           INT NULL REFERENCES company_8.vendors(id) ON DELETE SET NULL,
            approval_request_id BIGINT NULL REFERENCES company_8.approval_requests(id) ON DELETE SET NULL,

            amount              NUMERIC(18,2) NOT NULL DEFAULT 0,
            currency            TEXT NULL,

            before_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
            after_json   JSONB NOT NULL DEFAULT '{}'::jsonb,

            message             TEXT NULL,
            source              TEXT NULL,            -- 'ui','api','import'
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- safe additive
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS company_id INT;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS actor_user_id INT;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS module TEXT;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS action TEXT;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS severity TEXT;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS entity_type TEXT;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS entity_id TEXT;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS entity_ref TEXT;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS journal_id INT;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS customer_id INT;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS vendor_id INT;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS approval_request_id BIGINT;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS amount NUMERIC(18,2);
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS currency TEXT;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS before_json JSONB;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS after_json JSONB;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS message TEXT;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS source TEXT;
        ALTER TABLE company_8.audit_trail ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

        -- backfill/enforce company_id
        UPDATE company_8.audit_trail
        SET company_id = 8
        WHERE company_id IS NULL;

        ALTER TABLE company_8.audit_trail
        ALTER COLUMN company_id SET NOT NULL,
        ALTER COLUMN company_id SET DEFAULT 8;

        -- actor: allow NULL for system actions (safe even if already nullable)
        ALTER TABLE company_8.audit_trail
        ALTER COLUMN actor_user_id DROP NOT NULL;

        -- default/backfill json
        UPDATE company_8.audit_trail
        SET before_json = COALESCE(before_json, '{}'::jsonb)
        WHERE before_json IS NULL;

        UPDATE company_8.audit_trail
        SET after_json = COALESCE(after_json, '{}'::jsonb)
        WHERE after_json IS NULL;

        ALTER TABLE company_8.audit_trail
        ALTER COLUMN before_json SET NOT NULL,
        ALTER COLUMN before_json SET DEFAULT '{}'::jsonb,
        ALTER COLUMN after_json  SET NOT NULL,
        ALTER COLUMN after_json  SET DEFAULT '{}'::jsonb;

        -- actor FK (kept, works with NULLs)
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_audit_actor_fk' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.audit_trail
            ADD CONSTRAINT %I
            FOREIGN KEY (actor_user_id)
            REFERENCES public.users(id)
            ON DELETE RESTRICT',
            'company_8', 'company_8_audit_actor_fk'
            );
        END IF;
        END $$;

        -- checks
        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_audit_severity_ck' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.audit_trail
            ADD CONSTRAINT %I
            CHECK (severity IN (''info'',''warn'',''critical''))',
            'company_8', 'company_8_audit_severity_ck'
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_audit_amt_ck' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.audit_trail
            ADD CONSTRAINT %I
            CHECK (amount >= 0)',
            'company_8', 'company_8_audit_amt_ck'
            );
        END IF;

        -- prevent junk rows: require message OR before/after not empty
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_audit_nonempty_ck' AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.audit_trail
            ADD CONSTRAINT %I
            CHECK (
                message IS NOT NULL
                    OR before_json <> ''{}''::jsonb
                    OR after_json <> ''{}''::jsonb

            )',
            'company_8', 'company_8_audit_nonempty_ck'
            );
        END IF;
        END $$;

        -- indexes (existing + extra)
        CREATE INDEX IF NOT EXISTS company_8_audit_company_time_idx
        ON company_8.audit_trail(company_id, occurred_at DESC);

        CREATE INDEX IF NOT EXISTS company_8_audit_company_actor_idx
        ON company_8.audit_trail(company_id, actor_user_id, occurred_at DESC);

        CREATE INDEX IF NOT EXISTS company_8_audit_company_entity_idx
        ON company_8.audit_trail(company_id, entity_type, entity_id, occurred_at DESC);

        CREATE INDEX IF NOT EXISTS company_8_audit_company_module_action_idx
        ON company_8.audit_trail(company_id, module, action, occurred_at DESC);

        CREATE INDEX IF NOT EXISTS company_8_audit_module_severity_time_idx
        ON company_8.audit_trail(company_id, module, severity, occurred_at DESC);

        -- ==================================================
        -- LESSORS (IFRS 16 counterparties)
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.lessors (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            name TEXT NOT NULL,
            reg_no TEXT NULL,
            vat_no TEXT NULL,

            email TEXT NULL,
            phone TEXT NULL,
            address TEXT NULL,

            is_related_party BOOLEAN NOT NULL DEFAULT FALSE,
            active BOOLEAN NOT NULL DEFAULT TRUE,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- legacy-safe additive columns
        ALTER TABLE company_8.lessors ADD COLUMN IF NOT EXISTS company_id INT;
        ALTER TABLE company_8.lessors ADD COLUMN IF NOT EXISTS name TEXT;
        ALTER TABLE company_8.lessors ADD COLUMN IF NOT EXISTS reg_no TEXT;
        ALTER TABLE company_8.lessors ADD COLUMN IF NOT EXISTS vat_no TEXT;
        ALTER TABLE company_8.lessors ADD COLUMN IF NOT EXISTS email TEXT;
        ALTER TABLE company_8.lessors ADD COLUMN IF NOT EXISTS phone TEXT;
        ALTER TABLE company_8.lessors ADD COLUMN IF NOT EXISTS address TEXT;
        ALTER TABLE company_8.lessors ADD COLUMN IF NOT EXISTS is_related_party BOOLEAN;
        ALTER TABLE company_8.lessors ADD COLUMN IF NOT EXISTS active BOOLEAN;
        ALTER TABLE company_8.lessors ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

        -- backfill company_id + defaults
        UPDATE company_8.lessors
        SET company_id = 8
        WHERE company_id IS NULL;

        ALTER TABLE company_8.lessors
        ALTER COLUMN company_id SET NOT NULL;

        ALTER TABLE company_8.lessors
        ALTER COLUMN company_id SET DEFAULT 8;

        UPDATE company_8.lessors
        SET is_related_party = COALESCE(is_related_party, FALSE)
        WHERE is_related_party IS NULL;

        ALTER TABLE company_8.lessors
        ALTER COLUMN is_related_party SET NOT NULL;

        ALTER TABLE company_8.lessors
        ALTER COLUMN is_related_party SET DEFAULT FALSE;

        UPDATE company_8.lessors
        SET active = COALESCE(active, TRUE)
        WHERE active IS NULL;

        ALTER TABLE company_8.lessors
        ALTER COLUMN active SET NOT NULL;

        ALTER TABLE company_8.lessors
        ALTER COLUMN active SET DEFAULT TRUE;

        UPDATE company_8.lessors
        SET created_at = COALESCE(created_at, NOW())
        WHERE created_at IS NULL;

        ALTER TABLE company_8.lessors
        ALTER COLUMN created_at SET NOT NULL;

        ALTER TABLE company_8.lessors
        ALTER COLUMN created_at SET DEFAULT NOW();

        -- ==================================================
        -- Uniqueness / constraints
        -- ==================================================
        DO $uq_lessors_id_company$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'uq_lessors_id_company'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lessors ADD CONSTRAINT uq_lessors_id_company UNIQUE (id, company_id)',
                    'company_8'
                );
            END IF;
        END $uq_lessors_id_company$;

        -- Unique lessor name per company (case/space-insensitive), only for active lessors
        DO $uq_lessors_company_name$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_indexes
                WHERE schemaname = 'company_8'
                AND indexname  = 'uq_lessors_company_name_active'
            ) THEN
                EXECUTE format(
                    'CREATE UNIQUE INDEX uq_lessors_company_name_active
                    ON %I.lessors(company_id, lower(trim(name)))
                    WHERE name IS NOT NULL AND trim(name) <> '''' AND active = TRUE',
                    'company_8'
                );
            END IF;
        END $uq_lessors_company_name$;

        -- Helpful indexes for dropdown/search
        CREATE INDEX IF NOT EXISTS company_8_lessors_company_active_name_idx
        ON company_8.lessors(company_id, active, lower(trim(name)));

        CREATE INDEX IF NOT EXISTS company_8_lessors_company_active_idx
        ON company_8.lessors(company_id, active);

        CREATE INDEX IF NOT EXISTS company_8_lessors_related_party_idx
        ON company_8.lessors(company_id, is_related_party);

        -- ==================================================
        -- LESSOR CONTACTS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.lessor_contacts (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            lessor_id INT NOT NULL REFERENCES company_8.lessors(id) ON DELETE CASCADE,

            full_name TEXT NOT NULL,
            email TEXT NULL,
            phone TEXT NULL,
            phone_type TEXT NULL,
            role_title TEXT NULL,              -- e.g. Account Manager
            is_primary BOOLEAN NOT NULL DEFAULT FALSE,
            active BOOLEAN NOT NULL DEFAULT TRUE,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- legacy-safe additive
        ALTER TABLE company_8.lessor_contacts ADD COLUMN IF NOT EXISTS company_id INT;
        ALTER TABLE company_8.lessor_contacts ADD COLUMN IF NOT EXISTS lessor_id INT;
        ALTER TABLE company_8.lessor_contacts ADD COLUMN IF NOT EXISTS full_name TEXT;
        ALTER TABLE company_8.lessor_contacts ADD COLUMN IF NOT EXISTS email TEXT;
        ALTER TABLE company_8.lessor_contacts ADD COLUMN IF NOT EXISTS phone TEXT;
        ALTER TABLE company_8.lessor_contacts ADD COLUMN IF NOT EXISTS phone_type TEXT;
        ALTER TABLE company_8.lessor_contacts ADD COLUMN IF NOT EXISTS role_title TEXT;
        ALTER TABLE company_8.lessor_contacts ADD COLUMN IF NOT EXISTS is_primary BOOLEAN;
        ALTER TABLE company_8.lessor_contacts ADD COLUMN IF NOT EXISTS active BOOLEAN;
        ALTER TABLE company_8.lessor_contacts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

        -- backfill company_id
        UPDATE company_8.lessor_contacts
        SET company_id = 8
        WHERE company_id IS NULL;

        ALTER TABLE company_8.lessor_contacts
        ALTER COLUMN company_id SET NOT NULL;

        ALTER TABLE company_8.lessor_contacts
        ALTER COLUMN company_id SET DEFAULT 8;

        -- defaults
        UPDATE company_8.lessor_contacts
        SET is_primary = COALESCE(is_primary, FALSE)
        WHERE is_primary IS NULL;

        ALTER TABLE company_8.lessor_contacts
        ALTER COLUMN is_primary SET NOT NULL;

        ALTER TABLE company_8.lessor_contacts
        ALTER COLUMN is_primary SET DEFAULT FALSE;

        UPDATE company_8.lessor_contacts
        SET active = COALESCE(active, TRUE)
        WHERE active IS NULL;

        ALTER TABLE company_8.lessor_contacts
        ALTER COLUMN active SET NOT NULL;

        ALTER TABLE company_8.lessor_contacts
        ALTER COLUMN active SET DEFAULT TRUE;

        UPDATE company_8.lessor_contacts
        SET created_at = COALESCE(created_at, NOW())
        WHERE created_at IS NULL;

        ALTER TABLE company_8.lessor_contacts
        ALTER COLUMN created_at SET NOT NULL;

        ALTER TABLE company_8.lessor_contacts
        ALTER COLUMN created_at SET DEFAULT NOW();

        -- ==================================================
        -- Uniqueness / helpful indexes
        -- ==================================================

        -- Unique (id, company_id) like your other tables
        DO $uq_lessor_contacts_id_company$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'uq_lessor_contacts_id_company'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.lessor_contacts
                    ADD CONSTRAINT uq_lessor_contacts_id_company UNIQUE (id, company_id)',
                    'company_8'
                );
            END IF;
        END $uq_lessor_contacts_id_company$;

        -- Only one primary contact per lessor (active ones)
        DO $uq_lessor_contacts_primary$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_indexes
                WHERE schemaname = 'company_8'
                AND indexname  = 'uq_lessor_contacts_one_primary'
            ) THEN
                EXECUTE format(
                    'CREATE UNIQUE INDEX uq_lessor_contacts_one_primary
                    ON %I.lessor_contacts(company_id, lessor_id)
                    WHERE is_primary = TRUE AND active = TRUE',
                    'company_8'
                );
            END IF;
        END $uq_lessor_contacts_primary$;

        -- Lookup indexes
        CREATE INDEX IF NOT EXISTS company_8_lessor_contacts_lessor_idx
        ON company_8.lessor_contacts(lessor_id);

        CREATE INDEX IF NOT EXISTS company_8_lessor_contacts_company_lessor_idx
        ON company_8.lessor_contacts(company_id, lessor_id);

        CREATE INDEX IF NOT EXISTS company_8_lessor_contacts_email_idx
        ON company_8.lessor_contacts(company_id, lower(email))
        WHERE email IS NOT NULL AND trim(email) <> '';

        -- ==================================================
        -- CLIENT SUPPORT TICKETS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.support_tickets (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,          -- tenant/company
            user_id INT NULL,                 -- FK to users table if logged in
            email TEXT NOT NULL,              -- contact email
            subject TEXT NOT NULL,            -- short issue title
            description TEXT NULL,            -- detailed issue
            status TEXT NOT NULL DEFAULT 'open', -- open|in_progress|resolved|void
            priority TEXT NOT NULL DEFAULT 'normal', -- low|normal|high|urgent

            assigned_to INT NULL,             -- FK to support_users table
            resolved_at TIMESTAMPTZ NULL,

            notes TEXT NULL,                  -- internal notes
            created_by INT NULL,              -- who logged it
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS company_8_support_company_idx
        ON company_8.support_tickets(company_id);

        CREATE INDEX IF NOT EXISTS company_8_support_status_idx
        ON company_8.support_tickets(status);

        CREATE INDEX IF NOT EXISTS company_8_support_priority_idx
        ON company_8.support_tickets(priority);

        CREATE INDEX IF NOT EXISTS company_8_support_assigned_idx
        ON company_8.support_tickets(assigned_to);

        -- Checks
        DO $ck_support_valid$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='ck_support_valid' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.support_tickets
            ADD CONSTRAINT ck_support_valid
            CHECK (
                status IN (''open'',''in_progress'',''resolved'',''void'')
                AND priority IN (''low'',''normal'',''high'',''urgent'')
            )',
            'company_8'
            );
        END IF;
        END $ck_support_valid$;

        -- ==================================================
        -- OPTIONAL: shared "touch updated_at" trigger function
        -- ==================================================
        CREATE OR REPLACE FUNCTION company_8.touch_updated_at()
        RETURNS trigger AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END; $$ LANGUAGE plpgsql;

        -- ==================================================
        -- IFRS 15: REVENUE CONTRACTS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.revenue_contracts (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            customer_id INT NULL,
            contract_number TEXT NOT NULL,
            contract_title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft',          -- draft/active/suspended/completed/terminated/cancelled
            contract_currency TEXT NOT NULL,

            contract_date DATE NOT NULL,
            start_date DATE NULL,
            end_date DATE NULL,

            billing_method TEXT NOT NULL DEFAULT 'milestone', -- milestone/progress/periodic/manual
            transaction_price NUMERIC(18,2) NOT NULL DEFAULT 0,
            variable_consideration_est NUMERIC(18,2) NOT NULL DEFAULT 0,
            variable_consideration_constrained NUMERIC(18,2) NOT NULL DEFAULT 0,
            financing_component_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            has_significant_financing_component BOOLEAN NOT NULL DEFAULT FALSE,
            is_over_time BOOLEAN NOT NULL DEFAULT TRUE,

            revenue_status TEXT NOT NULL DEFAULT 'not_started', -- not_started/in_progress/fully_recognized
            billing_status TEXT NOT NULL DEFAULT 'unbilled',    -- unbilled/partially_billed/fully_billed
            cash_status TEXT NOT NULL DEFAULT 'uncollected',    -- uncollected/partially_collected/fully_collected

            contract_asset_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
            contract_liability_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
            accounts_receivable_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
            recognized_revenue_to_date NUMERIC(18,2) NOT NULL DEFAULT 0,
            billed_to_date NUMERIC(18,2) NOT NULL DEFAULT 0,
            cash_received_to_date NUMERIC(18,2) NOT NULL DEFAULT 0,

            source_quote_id INT NULL,
            source_sales_order_id INT NULL,

            approval_status TEXT NOT NULL DEFAULT 'draft',      -- draft/pending_approval/approved/rejected
            approved_by_user_id INT NULL,
            approved_at TIMESTAMPTZ NULL,

            notes TEXT NULL,
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,

            created_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.revenue_contracts ADD COLUMN IF NOT EXISTS payload_json JSONB;
        ALTER TABLE company_8.revenue_contracts ADD COLUMN IF NOT EXISTS approval_status TEXT;
        ALTER TABLE company_8.revenue_contracts ADD COLUMN IF NOT EXISTS approved_by_user_id INT;
        ALTER TABLE company_8.revenue_contracts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
        ALTER TABLE company_8.revenue_contracts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        ALTER TABLE company_8.revenue_contracts
        ADD COLUMN IF NOT EXISTS approval_status TEXT,
        ADD COLUMN IF NOT EXISTS approved_by_user_id INT,
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

        UPDATE company_8.revenue_contracts
        SET approval_status = CASE
        WHEN approval_status IS NOT NULL AND approval_status <> '' THEN approval_status
        WHEN status IN ('active', 'completed', 'suspended', 'terminated', 'cancelled') THEN 'approved'
        ELSE 'draft'
        END
        WHERE approval_status IS NULL OR approval_status = '';

        ALTER TABLE company_8.revenue_contracts
        ALTER COLUMN approval_status SET DEFAULT 'draft',
        ALTER COLUMN approval_status SET NOT NULL;
        
        UPDATE company_8.revenue_contracts
        SET payload_json = COALESCE(payload_json, '{}'::jsonb)
        WHERE payload_json IS NULL;

        ALTER TABLE company_8.revenue_contracts
        ALTER COLUMN payload_json SET NOT NULL,
        ALTER COLUMN payload_json SET DEFAULT '{}'::jsonb;

        ALTER TABLE company_8.revenue_contracts
        ADD COLUMN IF NOT EXISTS contract_position_type TEXT;

        ALTER TABLE company_8.revenue_contracts
        ADD COLUMN IF NOT EXISTS contract_position_type TEXT;

        ALTER TABLE company_8.revenue_contracts
        ADD COLUMN IF NOT EXISTS contract_position_amount NUMERIC(18,2);

        UPDATE company_8.revenue_contracts
        SET contract_position_type = 'neutral'
        WHERE contract_position_type IS NULL;

        ALTER TABLE company_8.revenue_contracts
        ADD COLUMN IF NOT EXISTS project_id INT NULL;

        ALTER TABLE company_8.revenue_contracts
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_revenue_contracts_position_ck'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                'ALTER TABLE %I.revenue_contracts
                ADD CONSTRAINT %I
                CHECK (contract_position_type IN (''asset'',''liability'',''neutral''))',
                'company_8',
                'company_8_revenue_contracts_position_ck'
                );
            END IF;
        END $$;

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='company_8_revenue_contracts_status_ck' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.revenue_contracts
            ADD CONSTRAINT %I
            CHECK (status IN (''draft'',''active'',''suspended'',''completed'',''terminated'',''cancelled''))',
            'company_8','company_8_revenue_contracts_status_ck');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='company_8_revenue_contracts_approval_ck' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.revenue_contracts
            ADD CONSTRAINT %I
            CHECK (approval_status IN (''draft'',''pending_approval'',''approved'',''rejected''))',
            'company_8','company_8_revenue_contracts_approval_ck');
        END IF;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_revenue_contracts_contract_no_uq
        ON company_8.revenue_contracts(company_id, contract_number);

        CREATE INDEX IF NOT EXISTS company_8_revenue_contracts_customer_idx
        ON company_8.revenue_contracts(customer_id);

        CREATE INDEX IF NOT EXISTS company_8_revenue_contracts_status_idx
        ON company_8.revenue_contracts(company_id, status, contract_date DESC);

        CREATE INDEX IF NOT EXISTS company_8_revenue_contracts_approval_status_idx
        ON company_8.revenue_contracts(company_id, approval_status, created_at DESC);

        CREATE INDEX IF NOT EXISTS company_8_revenue_contracts_project_idx
        ON company_8.revenue_contracts(company_id, project_id);

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='company_8_revenue_contracts_approved_by_fk' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.revenue_contracts
            ADD CONSTRAINT %I
            FOREIGN KEY (approved_by_user_id)
            REFERENCES public.users(id)
            ON DELETE SET NULL',
            'company_8','company_8_revenue_contracts_approved_by_fk');
        END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_revenue_contracts_status_approval_consistency_ck'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                'ALTER TABLE %I.revenue_contracts
                ADD CONSTRAINT %I
                CHECK (
                    NOT (approval_status = ''rejected'' AND status IN (''active'',''completed''))
                )',
                'company_8',
                'company_8_revenue_contracts_status_approval_consistency_ck'
                );
            END IF;
        END $$;

        DO $revenue_contracts_customer_fk$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_revenue_contracts_customer_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.revenue_contracts
                    ADD CONSTRAINT %I
                    FOREIGN KEY (customer_id)
                    REFERENCES %I.customers(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8_revenue_contracts_customer_fk',
                    'company_8'
                );
            END IF;
        END $revenue_contracts_customer_fk$;

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'company_8_revenue_contracts_project_fk'
            AND n.nspname = 'company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.revenue_contracts
            ADD CONSTRAINT %I
            FOREIGN KEY (project_id)
            REFERENCES %I.projects(id)
            ON DELETE SET NULL',
            'company_8',
            'company_8_revenue_contracts_project_fk',
            'company_8'
            );
        END IF;
        END $$;

        -- ==================================================
        -- IFRS 15: CONTRACT VERSIONS / MODIFICATIONS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.revenue_contract_versions (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            contract_id BIGINT NOT NULL,

            version_no INT NOT NULL,
            effective_date DATE NOT NULL,
            version_reason TEXT NOT NULL DEFAULT 'initial', -- initial/modification/re-estimate/catch_up/termination

            transaction_price NUMERIC(18,2) NOT NULL DEFAULT 0,
            allocated_revenue_total NUMERIC(18,2) NOT NULL DEFAULT 0,
            expected_cost_total NUMERIC(18,2) NOT NULL DEFAULT 0,

            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.revenue_contracts
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_revenue_contract_versions_uq
        ON company_8.revenue_contract_versions(contract_id, version_no);

        CREATE INDEX IF NOT EXISTS company_8_revenue_contract_versions_effective_idx
        ON company_8.revenue_contract_versions(contract_id, effective_date DESC);

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='company_8_revenue_contract_versions_contract_fk' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.revenue_contract_versions
            ADD CONSTRAINT %I
            FOREIGN KEY (contract_id) REFERENCES %I.revenue_contracts(id)
            ON DELETE CASCADE',
            'company_8','company_8_revenue_contract_versions_contract_fk','company_8');
        END IF;
        END $$;

        -- ==================================================
        -- IFRS 15: PERFORMANCE OBLIGATIONS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.revenue_obligations (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            contract_id BIGINT NOT NULL,

            obligation_code TEXT NOT NULL,
            obligation_name TEXT NOT NULL,
            distinct_flag BOOLEAN NOT NULL DEFAULT TRUE,

            recognition_timing TEXT NOT NULL DEFAULT 'over_time'
                CHECK (recognition_timing IN ('over_time', 'point_in_time')),

            progress_method TEXT NULL
                CHECK (
                    progress_method IS NULL OR
                    progress_method IN (
                        'cost_to_cost',
                        'milestone',
                        'units',
                        'time_elapsed',
                        'manual',
                        'units_delivered'
                    )
                ),

            obligation_status TEXT NOT NULL DEFAULT 'draft'
                CHECK (obligation_status IN ('draft', 'active', 'completed', 'cancelled')),

            standalone_selling_price NUMERIC(18,2) NOT NULL DEFAULT 0,
            allocated_transaction_price NUMERIC(18,2) NOT NULL DEFAULT 0,

            expected_total_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
            actual_cost_to_date NUMERIC(18,2) NOT NULL DEFAULT 0,
            progress_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
            revenue_to_date NUMERIC(18,2) NOT NULL DEFAULT 0,

            recognized_at_point_in_time_date DATE NULL,
            recognition_trigger TEXT NULL,

            satisfaction_status TEXT NOT NULL DEFAULT 'pending'
                CHECK (satisfaction_status IN ('pending', 'satisfied', 'reversed')),

            satisfied_at DATE NULL,
            satisfaction_evidence_ref TEXT NULL,
            satisfaction_confirmed_by_user_id BIGINT NULL,

            notes TEXT NULL,
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CONSTRAINT company_8_revenue_obligations_timing_chk
            CHECK (
                (
                    recognition_timing = 'over_time'
                    AND progress_method IS NOT NULL
                    AND recognized_at_point_in_time_date IS NULL
                )
                OR
                (
                    recognition_timing = 'point_in_time'
                    AND progress_method IS NULL
                    AND recognition_trigger IS NOT NULL
                    AND BTRIM(recognition_trigger) <> ''
                )
            ),

            CONSTRAINT company_8_revenue_obligations_satisfaction_chk
            CHECK (
                (
                    recognition_timing = 'over_time'
                    AND satisfaction_status = 'pending'
                    AND satisfied_at IS NULL
                )
                OR
                (
                    recognition_timing = 'point_in_time'
                    AND (
                        satisfaction_status = 'pending'
                        OR (
                            satisfaction_status IN ('satisfied', 'reversed')
                            AND satisfied_at IS NOT NULL
                        )
                    )
                )
            )
        );

        ALTER TABLE company_8.revenue_obligations
        ADD COLUMN IF NOT EXISTS satisfaction_status TEXT NOT NULL DEFAULT 'pending';

        ALTER TABLE company_8.revenue_obligations
        ADD COLUMN IF NOT EXISTS satisfied_at DATE NULL;

        ALTER TABLE company_8.revenue_obligations
        ADD COLUMN IF NOT EXISTS satisfaction_evidence_ref TEXT NULL;

        ALTER TABLE company_8.revenue_obligations
        ADD COLUMN IF NOT EXISTS satisfaction_confirmed_by_user_id BIGINT NULL;
        ALTER TABLE company_8.revenue_contracts
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS company_8_revenue_obligations_code_uq
        ON company_8.revenue_obligations(contract_id, obligation_code);

        CREATE INDEX IF NOT EXISTS company_8_revenue_obligations_contract_idx
        ON company_8.revenue_obligations(contract_id, obligation_status);

        CREATE INDEX IF NOT EXISTS company_8_revenue_obligations_satisfaction_idx
        ON company_8.revenue_obligations(contract_id, recognition_timing, satisfaction_status, satisfied_at);

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_revenue_obligations_contract_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.revenue_obligations
                    ADD CONSTRAINT %I
                    FOREIGN KEY (contract_id) REFERENCES %I.revenue_contracts(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_revenue_obligations_contract_fk', 'company_8'
                );
            END IF;
        END $$;

        -- ==================================================
        -- IFRS 15: BILLINGS / CASH / PROGRESS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.revenue_billing_events (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            contract_id BIGINT NOT NULL,
            obligation_id BIGINT NULL,

            event_date DATE NOT NULL,
            event_type TEXT NOT NULL DEFAULT 'invoice', -- invoice/credit_note/debit_note/manual
            source_invoice_id INT NULL,
            amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            currency TEXT NOT NULL,
            notes TEXT NULL,
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE company_8.revenue_contracts
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;
        CREATE INDEX IF NOT EXISTS company_8_revenue_billing_events_contract_date_idx
        ON company_8.revenue_billing_events(contract_id, event_date DESC);

        CREATE TABLE IF NOT EXISTS company_8.revenue_cash_events (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            contract_id BIGINT NOT NULL,
            obligation_id BIGINT NULL,

            event_date DATE NOT NULL,
            event_type TEXT NOT NULL DEFAULT 'receipt', -- receipt/refund/manual
            source_receipt_id INT NULL,
            amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            currency TEXT NOT NULL,
            notes TEXT NULL,
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.revenue_contracts
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        CREATE INDEX IF NOT EXISTS company_8_revenue_cash_events_contract_date_idx
        ON company_8.revenue_cash_events(contract_id, event_date DESC);

        CREATE TABLE IF NOT EXISTS company_8.revenue_progress_updates (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            contract_id BIGINT NOT NULL,
            obligation_id BIGINT NOT NULL,

            period_end DATE NOT NULL,
            update_type TEXT NOT NULL DEFAULT 'cost_to_cost', -- cost_to_cost/milestone/units/manual
            expected_total_cost NUMERIC(18,2) NULL,
            actual_cost_to_date NUMERIC(18,2) NULL,
            progress_percent NUMERIC(9,4) NULL,
            units_done NUMERIC(18,4) NULL,
            units_total NUMERIC(18,4) NULL,
            milestone_code TEXT NULL,
            certified_by_user_id INT NULL,

            notes TEXT NULL,
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.revenue_contracts
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_revenue_progress_updates_uq
        ON company_8.revenue_progress_updates(obligation_id, period_end, update_type);

        CREATE INDEX IF NOT EXISTS company_8_revenue_progress_updates_contract_idx
        ON company_8.revenue_progress_updates(contract_id, period_end DESC);

        -- ==================================================
        -- IFRS 15: RECOGNITION RUNS / JOURNALS
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.revenue_recognition_runs (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            contract_id BIGINT NULL,

            run_scope TEXT NOT NULL DEFAULT 'company', -- company/contract/obligation
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft',      -- draft/posted/reversed/void
            run_reason TEXT NOT NULL DEFAULT 'period_end', -- period_end/manual/modification/catch_up

            journal_id INT NULL,
            total_revenue_delta NUMERIC(18,2) NOT NULL DEFAULT 0,
            total_contract_asset_delta NUMERIC(18,2) NOT NULL DEFAULT 0,
            total_contract_liability_delta NUMERIC(18,2) NOT NULL DEFAULT 0,

            requested_by_user_id INT NULL,
            posted_by_user_id INT NULL,
            posted_at TIMESTAMPTZ NULL,

            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE company_8.revenue_contracts
        ADD COLUMN IF NOT EXISTS source_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_company_id INT NULL,
        ADD COLUMN IF NOT EXISTS engagement_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL;

        CREATE INDEX IF NOT EXISTS company_8_revenue_recognition_runs_period_idx
        ON company_8.revenue_recognition_runs(company_id, period_end DESC, status);

        CREATE TABLE IF NOT EXISTS company_8.revenue_recognition_entries (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            run_id BIGINT NOT NULL,
            contract_id BIGINT NOT NULL,
            obligation_id BIGINT NULL,

            period_start DATE NOT NULL,
            period_end DATE NOT NULL,

            revenue_required_to_date NUMERIC(18,2) NOT NULL DEFAULT 0,
            revenue_previously_recognized NUMERIC(18,2) NOT NULL DEFAULT 0,
            revenue_delta_this_run NUMERIC(18,2) NOT NULL DEFAULT 0,

            billed_to_date NUMERIC(18,2) NOT NULL DEFAULT 0,
            cash_received_to_date NUMERIC(18,2) NOT NULL DEFAULT 0,
            contract_asset_delta NUMERIC(18,2) NOT NULL DEFAULT 0,
            contract_liability_delta NUMERIC(18,2) NOT NULL DEFAULT 0,

            source_basis TEXT NOT NULL DEFAULT 'system',
            notes TEXT NULL,
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_revenue_recognition_entries_run_idx
        ON company_8.revenue_recognition_entries(run_id);

        CREATE INDEX IF NOT EXISTS company_8_revenue_recognition_entries_contract_idx
        ON company_8.revenue_recognition_entries(contract_id, period_end DESC);

        DO $$
        BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='company_8_revenue_billing_events_contract_fk' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.revenue_billing_events
            ADD CONSTRAINT %I
            FOREIGN KEY (contract_id) REFERENCES %I.revenue_contracts(id)
            ON DELETE CASCADE',
            'company_8','company_8_revenue_billing_events_contract_fk','company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='company_8_revenue_cash_events_contract_fk' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.revenue_cash_events
            ADD CONSTRAINT %I
            FOREIGN KEY (contract_id) REFERENCES %I.revenue_contracts(id)
            ON DELETE CASCADE',
            'company_8','company_8_revenue_cash_events_contract_fk','company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='company_8_revenue_progress_updates_obligation_fk' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.revenue_progress_updates
            ADD CONSTRAINT %I
            FOREIGN KEY (obligation_id) REFERENCES %I.revenue_obligations(id)
            ON DELETE CASCADE',
            'company_8','company_8_revenue_progress_updates_obligation_fk','company_8');
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
            WHERE c.conname='company_8_revenue_recognition_entries_run_fk' AND n.nspname='company_8'
        ) THEN
            EXECUTE format(
            'ALTER TABLE %I.revenue_recognition_entries
            ADD CONSTRAINT %I
            FOREIGN KEY (run_id) REFERENCES %I.revenue_recognition_runs(id)
            ON DELETE CASCADE',
            'company_8','company_8_revenue_recognition_entries_run_fk','company_8');
        END IF;
        END $$;

        -- ============================================================
        -- IFRS 15 / IAS 12: REVENUE CONTRACT TAX PROFILES
        -- One profile per contract and tax authority
        -- ============================================================

        CREATE TABLE IF NOT EXISTS company_8.revenue_contract_tax_profiles (
            id BIGSERIAL PRIMARY KEY,

            company_id INT NOT NULL,
            contract_id BIGINT NOT NULL,

            tax_authority_id INT NOT NULL,
            treatment_rule_id BIGINT NULL,

            tax_treatment_method TEXT NOT NULL
                DEFAULT 'requires_review',

            taxable_revenue_to_date NUMERIC(18,2)
                NOT NULL DEFAULT 0,

            tax_base_override NUMERIC(18,2) NULL,
            override_reason TEXT NULL,

            review_status TEXT NOT NULL
                DEFAULT 'requires_review',

            effective_from DATE NOT NULL
                DEFAULT DATE '1900-01-01',

            effective_to DATE NULL,

            notes TEXT NULL,

            payload_json JSONB NOT NULL
                DEFAULT '{}'::jsonb,

            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CONSTRAINT company_8_revenue_contract_tax_profiles_method_ck
            CHECK (
                tax_treatment_method IN (
                    'accounting_recognition',
                    'billing',
                    'cash_received',
                    'receipt_or_accrual',
                    'upfront_taxation',
                    'completion',
                    'manual',
                    'requires_review'
                )
            ),

            CONSTRAINT company_8_revenue_contract_tax_profiles_status_ck
            CHECK (
                review_status IN (
                    'requires_review',
                    'configured',
                    'approved',
                    'inactive'
                )
            ),

            CONSTRAINT company_8_revenue_contract_tax_profiles_dates_ck
            CHECK (
                effective_to IS NULL
                OR effective_to >= effective_from
            ),

            CONSTRAINT company_8_revenue_contract_tax_profiles_taxable_ck
            CHECK (
                taxable_revenue_to_date >= 0
            ),

            CONSTRAINT company_8_revenue_contract_tax_profiles_override_ck
            CHECK (
                tax_base_override IS NULL
                OR tax_base_override >= 0
            ),

            CONSTRAINT company_8_revenue_contract_tax_profiles_uq
            UNIQUE (
                company_id,
                contract_id,
                tax_authority_id,
                effective_from
            )
        );

        CREATE INDEX IF NOT EXISTS company_8_revenue_tax_profiles_contract_idx
        ON company_8.revenue_contract_tax_profiles (
            company_id,
            contract_id
        );

        CREATE INDEX IF NOT EXISTS company_8_revenue_tax_profiles_authority_idx
        ON company_8.revenue_contract_tax_profiles (
            company_id,
            tax_authority_id,
            review_status
        );

        CREATE INDEX IF NOT EXISTS company_8_revenue_tax_profiles_rule_idx
        ON company_8.revenue_contract_tax_profiles (
            treatment_rule_id
        );

        CREATE INDEX IF NOT EXISTS company_8_revenue_tax_profiles_effective_idx
        ON company_8.revenue_contract_tax_profiles (
            company_id,
            effective_from,
            effective_to
        );

        DO $revenue_contract_tax_profiles_contract_fk$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n
                    ON n.oid = c.connamespace
                WHERE c.conname =
                    'company_8_revenue_contract_tax_profiles_contract_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.revenue_contract_tax_profiles
                    ADD CONSTRAINT %I
                    FOREIGN KEY (contract_id)
                    REFERENCES %I.revenue_contracts(id)
                    ON DELETE CASCADE',
                    'company_8',
                    'company_8_revenue_contract_tax_profiles_contract_fk',
                    'company_8'
                );
            END IF;
        END
        $revenue_contract_tax_profiles_contract_fk$;

        DO $revenue_contract_tax_profiles_authority_fk$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n
                    ON n.oid = c.connamespace
                WHERE c.conname =
                    'company_8_revenue_contract_tax_profiles_authority_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.revenue_contract_tax_profiles
                    ADD CONSTRAINT %I
                    FOREIGN KEY (tax_authority_id)
                    REFERENCES public.tax_authorities(id)
                    ON DELETE RESTRICT',
                    'company_8',
                    'company_8_revenue_contract_tax_profiles_authority_fk'
                );
            END IF;
        END
        $revenue_contract_tax_profiles_authority_fk$;

        DO $revenue_contract_tax_profiles_rule_fk$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n
                    ON n.oid = c.connamespace
                WHERE c.conname =
                    'company_8_revenue_contract_tax_profiles_rule_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.revenue_contract_tax_profiles
                    ADD CONSTRAINT %I
                    FOREIGN KEY (treatment_rule_id)
                    REFERENCES public.revenue_tax_treatment_rules(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8_revenue_contract_tax_profiles_rule_fk'
                );
            END IF;
        END
        $revenue_contract_tax_profiles_rule_fk$;

        -- ==================================================
        -- ACCRUALS & DEFERRALS: MASTER ITEMS
        -- Covers:
        -- prepaid_expense
        -- deferred_expense
        -- deferred_income
        -- accrued_income
        -- accrued_expense
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.accrual_deferral_items (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            item_number TEXT NOT NULL,
            item_title TEXT NOT NULL,

            item_type TEXT NOT NULL DEFAULT 'prepaid_expense',
            -- prepaid_expense / deferred_expense / deferred_income / accrued_income / accrued_expense

            status TEXT NOT NULL DEFAULT 'draft',
            -- draft / active / suspended / completed / cancelled / terminated

            counterparty_type TEXT NULL,
            -- customer / supplier / employee / other

            customer_id INT NULL,
            supplier_id INT NULL,
            employee_id INT NULL,

            currency TEXT NOT NULL,

            transaction_date DATE NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,

            original_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            recognized_to_date NUMERIC(18,2) NOT NULL DEFAULT 0,
            remaining_balance NUMERIC(18,2) NOT NULL DEFAULT 0,

            recognition_method TEXT NOT NULL DEFAULT 'straight_line',
            -- straight_line / manual / units / milestone

            frequency TEXT NOT NULL DEFAULT 'monthly',
            -- monthly / quarterly / annually / once / manual

            balance_account TEXT NULL,
            balance_account_role TEXT NULL,

            recognition_account TEXT NULL,
            recognition_account_role TEXT NULL,

            settlement_account TEXT NULL,
            settlement_role TEXT NULL,

            tax_account TEXT NULL,
            vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            tax_mode TEXT NOT NULL DEFAULT 'exclusive',
            -- exclusive / inclusive / no_vat

            source_invoice_id INT NULL,
            source_bill_id INT NULL,
            source_receipt_id INT NULL,
            source_payment_id INT NULL,
            source_journal_id INT NULL,

            approval_status TEXT NOT NULL DEFAULT 'draft',
            approved_by_user_id INT NULL,
            approved_at TIMESTAMPTZ NULL,

            notes TEXT NULL,
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,

            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE company_8.accrual_deferral_items
        ADD COLUMN IF NOT EXISTS item_number TEXT,
        ADD COLUMN IF NOT EXISTS item_title TEXT,
        ADD COLUMN IF NOT EXISTS item_type TEXT,
        ADD COLUMN IF NOT EXISTS status TEXT,
        ADD COLUMN IF NOT EXISTS counterparty_type TEXT,
        ADD COLUMN IF NOT EXISTS customer_id INT NULL,
        ADD COLUMN IF NOT EXISTS supplier_id INT NULL,
        ADD COLUMN IF NOT EXISTS employee_id INT NULL,
        ADD COLUMN IF NOT EXISTS currency TEXT,
        ADD COLUMN IF NOT EXISTS transaction_date DATE,
        ADD COLUMN IF NOT EXISTS start_date DATE,
        ADD COLUMN IF NOT EXISTS end_date DATE,
        ADD COLUMN IF NOT EXISTS original_amount NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS recognized_to_date NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS remaining_balance NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS recognition_method TEXT,
        ADD COLUMN IF NOT EXISTS frequency TEXT,
        ADD COLUMN IF NOT EXISTS balance_account TEXT,
        ADD COLUMN IF NOT EXISTS recognition_account TEXT,
        ADD COLUMN IF NOT EXISTS tax_account TEXT NULL,
        ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS tax_mode TEXT,
        ADD COLUMN IF NOT EXISTS source_invoice_id INT NULL,
        ADD COLUMN IF NOT EXISTS source_bill_id INT NULL,
        ADD COLUMN IF NOT EXISTS source_receipt_id INT NULL,
        ADD COLUMN IF NOT EXISTS source_payment_id INT NULL,
        ADD COLUMN IF NOT EXISTS source_journal_id INT NULL,
        ADD COLUMN IF NOT EXISTS balance_account_role TEXT NULL,
        ADD COLUMN IF NOT EXISTS recognition_account_role TEXT NULL,
        ADD COLUMN IF NOT EXISTS settlement_account TEXT NULL,
        ADD COLUMN IF NOT EXISTS settlement_role TEXT NULL,

        ADD COLUMN IF NOT EXISTS initial_journal_id INT NULL,
        ADD COLUMN IF NOT EXISTS initial_posted_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS initial_posted_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS approval_status TEXT,
        ADD COLUMN IF NOT EXISTS approved_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS notes TEXT NULL,
        ADD COLUMN IF NOT EXISTS payload_json JSONB,
        ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS updated_by_user_id INT NULL,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

        ALTER TABLE company_8.accrual_deferral_items
        ADD COLUMN IF NOT EXISTS tax_treatment_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS tax_base_override NUMERIC(18,2) NULL,
        ADD COLUMN IF NOT EXISTS manual_tax_base NUMERIC(18,2) NULL,
        ADD COLUMN IF NOT EXISTS tax_treatment_notes TEXT NULL;

        ALTER TABLE company_8.accrual_deferral_items
        ADD COLUMN IF NOT EXISTS source_revenue_contract_id BIGINT NULL,
        ADD COLUMN IF NOT EXISTS source_performance_obligation_id BIGINT NULL,
        ADD COLUMN IF NOT EXISTS source_billing_id BIGINT NULL;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_accrual_deferral_items_type_ck'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                'ALTER TABLE %I.accrual_deferral_items
                ADD CONSTRAINT %I
                CHECK (item_type IN (
                    ''prepaid_expense'',
                    ''deferred_expense'',
                    ''deferred_income'',
                    ''accrued_income'',
                    ''accrued_expense''
                ))',
                'company_8', 'company_8_accrual_deferral_items_type_ck');
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_accrual_deferral_items_status_ck'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                'ALTER TABLE %I.accrual_deferral_items
                ADD CONSTRAINT %I
                CHECK (status IN (
                    ''draft'',
                    ''active'',
                    ''suspended'',
                    ''completed'',
                    ''cancelled'',
                    ''terminated''
                ))',
                'company_8', 'company_8_accrual_deferral_items_status_ck');
            END IF;
        END $$;

        DO $$
        BEGIN
            IF to_regclass(
                'company_8.revenue_contracts'
            ) IS NOT NULL
            AND NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n
                    ON n.oid = c.connamespace
                WHERE c.conname =
                    'company_8_ad_revenue_contract_fk'
                AND n.nspname = 'company_8'
            ) THEN
                ALTER TABLE company_8.accrual_deferral_items
                ADD CONSTRAINT company_8_ad_revenue_contract_fk
                FOREIGN KEY (source_revenue_contract_id)
                REFERENCES company_8.revenue_contracts(id)
                ON DELETE SET NULL;
            END IF;
        END $$;

        CREATE UNIQUE INDEX IF NOT EXISTS
        company_8_ad_source_revenue_billing_uq
        ON company_8.accrual_deferral_items (
            company_id,
            source_revenue_contract_id,
            source_billing_id
        )
        WHERE source_revenue_contract_id IS NOT NULL
        AND source_billing_id IS NOT NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_accrual_deferral_items_no_uq
        ON company_8.accrual_deferral_items(company_id, item_number);

        CREATE INDEX IF NOT EXISTS company_8_accrual_deferral_items_type_idx
        ON company_8.accrual_deferral_items(company_id, item_type, status);

        CREATE INDEX IF NOT EXISTS company_8_accrual_deferral_items_dates_idx
        ON company_8.accrual_deferral_items(company_id, start_date, end_date);

        CREATE INDEX IF NOT EXISTS company_8_accrual_deferral_items_approval_idx
        ON company_8.accrual_deferral_items(company_id, approval_status, created_at DESC);
        -- ==================================================
        -- ACCRUALS & DEFERRALS: SCHEDULE LINES
        -- One line per month/period
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.accrual_deferral_schedule_lines (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            item_id BIGINT NOT NULL,

            line_no INT NOT NULL,
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            recognition_date DATE NOT NULL,

            opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
            recognition_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            closing_balance NUMERIC(18,2) NOT NULL DEFAULT 0,

            status TEXT NOT NULL DEFAULT 'pending',
            -- pending / posted / skipped / reversed / void

            journal_id INT NULL,
            posted_at TIMESTAMPTZ NULL,
            posted_by_user_id INT NULL,

            notes TEXT NULL,
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_accrual_deferral_schedule_lines_uq
        ON company_8.accrual_deferral_schedule_lines(item_id, line_no);

        CREATE INDEX IF NOT EXISTS company_8_accrual_deferral_schedule_lines_period_idx
        ON company_8.accrual_deferral_schedule_lines(company_id, recognition_date, status);

        CREATE INDEX IF NOT EXISTS company_8_accrual_deferral_schedule_lines_item_idx
        ON company_8.accrual_deferral_schedule_lines(item_id, period_end);
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_accrual_deferral_schedule_lines_item_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                'ALTER TABLE %I.accrual_deferral_schedule_lines
                ADD CONSTRAINT %I
                FOREIGN KEY (item_id)
                REFERENCES %I.accrual_deferral_items(id)
                ON DELETE CASCADE',
                'company_8', 'company_8_accrual_deferral_schedule_lines_item_fk', 'company_8');
            END IF;
        END $$;
        -- ==================================================
        -- ACCRUALS & DEFERRALS: POSTING RUNS
        -- Month-end or manual runs
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.accrual_deferral_runs (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            item_id BIGINT NULL,

            run_scope TEXT NOT NULL DEFAULT 'company',
            -- company / item / type

            item_type TEXT NULL,

            period_start DATE NOT NULL,
            period_end DATE NOT NULL,

            status TEXT NOT NULL DEFAULT 'draft',
            -- draft / posted / reversed / void

            run_reason TEXT NOT NULL DEFAULT 'period_end',
            -- period_end / manual / catch_up / termination / reversal

            journal_id INT NULL,

            total_recognition_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            total_asset_movement NUMERIC(18,2) NOT NULL DEFAULT 0,
            total_liability_movement NUMERIC(18,2) NOT NULL DEFAULT 0,

            requested_by_user_id INT NULL,
            posted_by_user_id INT NULL,
            posted_at TIMESTAMPTZ NULL,

            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_accrual_deferral_runs_period_idx
        ON company_8.accrual_deferral_runs(company_id, period_end DESC, status);

        CREATE INDEX IF NOT EXISTS company_8_accrual_deferral_runs_item_idx
        ON company_8.accrual_deferral_runs(item_id, period_end DESC);
        -- ==================================================
        -- ACCRUALS & DEFERRALS: POSTING ENTRIES
        -- Detail behind each run
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.accrual_deferral_entries (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            run_id BIGINT NOT NULL,
            item_id BIGINT NOT NULL,
            schedule_line_id BIGINT NULL,

            period_start DATE NOT NULL,
            period_end DATE NOT NULL,

            item_type TEXT NOT NULL,

            opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
            recognition_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            closing_balance NUMERIC(18,2) NOT NULL DEFAULT 0,

            debit_account TEXT NOT NULL,
            credit_account TEXT NOT NULL,

            source_basis TEXT NOT NULL DEFAULT 'system',
            -- system / manual / catch_up / reversal

            notes TEXT NULL,
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_accrual_deferral_entries_run_idx
        ON company_8.accrual_deferral_entries(run_id);

        CREATE INDEX IF NOT EXISTS company_8_accrual_deferral_entries_item_idx
        ON company_8.accrual_deferral_entries(item_id, period_end DESC);
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_accrual_deferral_entries_run_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                'ALTER TABLE %I.accrual_deferral_entries
                ADD CONSTRAINT %I
                FOREIGN KEY (run_id)
                REFERENCES %I.accrual_deferral_runs(id)
                ON DELETE CASCADE',
                'company_8', 'company_8_accrual_deferral_entries_run_fk', 'company_8');
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_accrual_deferral_entries_item_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                'ALTER TABLE %I.accrual_deferral_entries
                ADD CONSTRAINT %I
                FOREIGN KEY (item_id)
                REFERENCES %I.accrual_deferral_items(id)
                ON DELETE CASCADE',
                'company_8', 'company_8_accrual_deferral_entries_item_fk', 'company_8');
            END IF;
        END $$;
        -- ==================================================
        -- ACCRUALS & DEFERRALS: SOURCE EVENTS / MOVEMENTS
        -- Tracks initial recognition, adjustments, reversals, additions
        -- ==================================================
        CREATE TABLE IF NOT EXISTS company_8.accrual_deferral_events (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            item_id BIGINT NOT NULL,

            event_date DATE NOT NULL,

            event_type TEXT NOT NULL DEFAULT 'initial',
            -- initial / adjustment / addition / reduction / termination / reversal / manual

            amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            currency TEXT NOT NULL,

            source_invoice_id INT NULL,
            source_bill_id INT NULL,
            source_receipt_id INT NULL,
            source_payment_id INT NULL,
            source_journal_id INT NULL,
            originating_journal_id INT NULL,

            notes TEXT NULL,
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,

            created_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_accrual_deferral_events_item_date_idx
        ON company_8.accrual_deferral_events(item_id, event_date DESC);

        CREATE TABLE IF NOT EXISTS company_8.accounting_policies (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL,

            policy_type TEXT NOT NULL,
            policy_key TEXT NOT NULL,

            category_name TEXT NULL,
            measurement_basis TEXT NULL,
            recognition_basis TEXT NULL,
            depreciation_method TEXT NULL,
            useful_life_min NUMERIC(10,2) NULL,
            useful_life_max NUMERIC(10,2) NULL,

            revenue_recognition_timing TEXT NULL,
            revenue_progress_method TEXT NULL,
            wording_style TEXT NULL,

            policy_text_override TEXT NULL,
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            UNIQUE(company_id, policy_type, policy_key)
        );

        CREATE TABLE IF NOT EXISTS company_8.financial_statement_notes (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL,

            note_key TEXT NOT NULL,
            note_title TEXT NOT NULL,

            period_from DATE NULL,
            period_to DATE NULL,

            content_text TEXT NOT NULL,
            system_draft TEXT NULL,

            source TEXT NOT NULL DEFAULT 'system'
                CHECK (source IN ('system', 'user', 'hybrid')),

            is_custom BOOLEAN NOT NULL DEFAULT FALSE,
            last_generated_hash TEXT NULL,
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            UNIQUE(company_id, note_key, period_from, period_to)
        );

        -- ==================================================
        -- IFRS 9 / FINANCIAL INSTRUMENTS
        -- ==================================================

        -- 1) Central financial instrument register
        CREATE TABLE IF NOT EXISTS company_8.ifrs9_financial_instruments (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            instrument_name TEXT NOT NULL,
            instrument_reference TEXT NULL,

            instrument_type TEXT NOT NULL,
            -- loan_payable|trade_receivable|loan_receivable|staff_loan|director_loan|
            -- deposit_asset|deposit_liability|investment|bond|note_receivable|
            -- trade_payable|other_financial_asset|other_financial_liability

            source_table TEXT NULL,
            source_id INT NULL,

            loan_id INT NULL,
            customer_id INT NULL,
            vendor_id INT NULL,
            invoice_id INT NULL,
            bill_id INT NULL,

            counterparty_name TEXT NULL,
            counterparty_type TEXT NULL, -- customer|vendor|bank|employee|director|shareholder|other

            recognition_date DATE NOT NULL,
            derecognition_date DATE NULL,

            currency TEXT NOT NULL,

            original_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            carrying_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            classification_status TEXT NOT NULL DEFAULT 'unclassified',
            measurement_category TEXT NULL,
            -- amortised_cost|fvoci|fvpl

            business_model TEXT NULL,
            -- hold_to_collect|hold_to_collect_and_sell|other

            sppi_result TEXT NULL,
            -- pass|fail|not_applicable

            effective_interest_rate NUMERIC(12,6) NULL,
            contractual_interest_rate NUMERIC(12,6) NULL,

            status TEXT NOT NULL DEFAULT 'active',
            -- active|derecognised|written_off|closed|void

            created_by INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        -- Safe additive evolution
        ALTER TABLE company_8.ifrs9_financial_instruments
        ADD COLUMN IF NOT EXISTS company_id INT,
        ADD COLUMN IF NOT EXISTS instrument_name TEXT,
        ADD COLUMN IF NOT EXISTS instrument_reference TEXT,
        ADD COLUMN IF NOT EXISTS instrument_type TEXT,
        ADD COLUMN IF NOT EXISTS source_table TEXT,
        ADD COLUMN IF NOT EXISTS source_id INT,
        ADD COLUMN IF NOT EXISTS loan_id INT,
        ADD COLUMN IF NOT EXISTS customer_id INT,
        ADD COLUMN IF NOT EXISTS vendor_id INT,
        ADD COLUMN IF NOT EXISTS invoice_id INT,
        ADD COLUMN IF NOT EXISTS bill_id INT,
        ADD COLUMN IF NOT EXISTS counterparty_name TEXT,
        ADD COLUMN IF NOT EXISTS counterparty_type TEXT,
        ADD COLUMN IF NOT EXISTS recognition_date DATE,
        ADD COLUMN IF NOT EXISTS derecognition_date DATE,
        ADD COLUMN IF NOT EXISTS currency TEXT,
        ADD COLUMN IF NOT EXISTS original_amount NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS carrying_amount NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS classification_status TEXT,
        ADD COLUMN IF NOT EXISTS measurement_category TEXT,
        ADD COLUMN IF NOT EXISTS business_model TEXT,
        ADD COLUMN IF NOT EXISTS sppi_result TEXT,
        ADD COLUMN IF NOT EXISTS effective_interest_rate NUMERIC(12,6),
        ADD COLUMN IF NOT EXISTS contractual_interest_rate NUMERIC(12,6),
        ADD COLUMN IF NOT EXISTS status TEXT,
        ADD COLUMN IF NOT EXISTS created_by INT,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS meta_json JSONB;

        UPDATE company_8.ifrs9_financial_instruments
        SET company_id = 8
        WHERE company_id IS NULL;

        ALTER TABLE company_8.ifrs9_financial_instruments
        ALTER COLUMN company_id SET NOT NULL,
        ALTER COLUMN company_id SET DEFAULT 8;

        UPDATE company_8.ifrs9_financial_instruments
        SET original_amount = COALESCE(original_amount, 0),
            carrying_amount = COALESCE(carrying_amount, 0),
            classification_status = COALESCE(NULLIF(classification_status,''), 'unclassified'),
            status = COALESCE(NULLIF(status,''), 'active'),
            currency = COALESCE(NULLIF(currency,''), 'USD'),
            meta_json = COALESCE(meta_json, '{}'::jsonb),
            created_at = COALESCE(created_at, NOW()),
            updated_at = COALESCE(updated_at, NOW());

        ALTER TABLE company_8.ifrs9_financial_instruments
        ALTER COLUMN original_amount SET NOT NULL,
        ALTER COLUMN original_amount SET DEFAULT 0,
        ALTER COLUMN carrying_amount SET NOT NULL,
        ALTER COLUMN carrying_amount SET DEFAULT 0,
        ALTER COLUMN classification_status SET NOT NULL,
        ALTER COLUMN classification_status SET DEFAULT 'unclassified',
        ALTER COLUMN status SET NOT NULL,
        ALTER COLUMN status SET DEFAULT 'active',
        ALTER COLUMN currency SET NOT NULL,
        ALTER COLUMN currency SET DEFAULT 'USD',
        ALTER COLUMN meta_json SET NOT NULL,
        ALTER COLUMN meta_json SET DEFAULT '{}'::jsonb,
        ALTER COLUMN created_at SET NOT NULL,
        ALTER COLUMN created_at SET DEFAULT NOW(),
        ALTER COLUMN updated_at SET NOT NULL,
        ALTER COLUMN updated_at SET DEFAULT NOW();

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_instr_valid_ck'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_financial_instruments
                    ADD CONSTRAINT %I
                    CHECK (
                        original_amount >= 0
                        AND carrying_amount >= 0
                        AND instrument_type IN (
                            ''loan_payable'',
                            ''trade_receivable'',
                            ''loan_receivable'',
                            ''staff_loan'',
                            ''director_loan'',
                            ''deposit_asset'',
                            ''deposit_liability'',
                            ''investment'',
                            ''bond'',
                            ''note_receivable'',
                            ''trade_payable'',
                            ''other_financial_asset'',
                            ''other_financial_liability''
                        )
                        AND classification_status IN (
                            ''unclassified'',
                            ''classified'',
                            ''review_required'',
                            ''approved''
                        )
                        AND (
                            measurement_category IS NULL
                            OR measurement_category IN (''amortised_cost'',''fvoci'',''fvpl'')
                        )
                        AND (
                            business_model IS NULL
                            OR business_model IN (
                                ''hold_to_collect'',
                                ''hold_to_collect_and_sell'',
                                ''other''
                            )
                        )
                        AND (
                            sppi_result IS NULL
                            OR sppi_result IN (''pass'',''fail'',''not_applicable'')
                        )
                        AND status IN (''active'',''derecognised'',''written_off'',''closed'',''void'')
                    )',
                    'company_8', 'company_8_ifrs9_instr_valid_ck'
                );
            END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_instr_company_idx
        ON company_8.ifrs9_financial_instruments(company_id);

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_instr_type_idx
        ON company_8.ifrs9_financial_instruments(company_id, instrument_type);

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_instr_source_idx
        ON company_8.ifrs9_financial_instruments(company_id, source_table, source_id);

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_instr_loan_idx
        ON company_8.ifrs9_financial_instruments(company_id, loan_id);

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_instr_customer_idx
        ON company_8.ifrs9_financial_instruments(company_id, customer_id);

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_instr_vendor_idx
        ON company_8.ifrs9_financial_instruments(company_id, vendor_id);

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_ifrs9_instr_source_uq
        ON company_8.ifrs9_financial_instruments(company_id, source_table, source_id)
        WHERE source_table IS NOT NULL AND source_id IS NOT NULL;

        -- FKs where existing tables are known
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_instr_loan_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_financial_instruments
                    ADD CONSTRAINT %I
                    FOREIGN KEY (loan_id)
                    REFERENCES %I.loans(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_ifrs9_instr_loan_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_instr_customer_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_financial_instruments
                    ADD CONSTRAINT %I
                    FOREIGN KEY (customer_id)
                    REFERENCES %I.customers(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_ifrs9_instr_customer_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_instr_vendor_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_financial_instruments
                    ADD CONSTRAINT %I
                    FOREIGN KEY (vendor_id)
                    REFERENCES %I.vendors(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_ifrs9_instr_vendor_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_instr_bill_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_financial_instruments
                    ADD CONSTRAINT %I
                    FOREIGN KEY (bill_id)
                    REFERENCES %I.bills(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_ifrs9_instr_bill_fk', 'company_8'
                );
            END IF;
        END $$;


        -- 2) IFRS 9 classification history
        CREATE TABLE IF NOT EXISTS company_8.ifrs9_classifications (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            instrument_id INT NOT NULL,

            classification_date DATE NOT NULL,
            business_model TEXT NOT NULL,
            sppi_result TEXT NOT NULL,
            measurement_category TEXT NOT NULL,

            reason TEXT NULL,
            approved_by INT NULL,
            approved_at TIMESTAMPTZ NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_class_instr_idx
        ON company_8.ifrs9_classifications(company_id, instrument_id, classification_date DESC);

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_class_instr_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_classifications
                    ADD CONSTRAINT %I
                    FOREIGN KEY (instrument_id)
                    REFERENCES %I.ifrs9_financial_instruments(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_ifrs9_class_instr_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_class_valid_ck'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_classifications
                    ADD CONSTRAINT %I
                    CHECK (
                        business_model IN (''hold_to_collect'',''hold_to_collect_and_sell'',''other'')
                        AND sppi_result IN (''pass'',''fail'',''not_applicable'')
                        AND measurement_category IN (''amortised_cost'',''fvoci'',''fvpl'')
                    )',
                    'company_8', 'company_8_ifrs9_class_valid_ck'
                );
            END IF;
        END $$;


        -- 3) Effective interest / amortised cost setup
        CREATE TABLE IF NOT EXISTS company_8.ifrs9_effective_interest_terms (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            instrument_id INT NOT NULL,

            effective_date DATE NOT NULL,
            contractual_rate NUMERIC(12,6) NOT NULL DEFAULT 0,
            effective_interest_rate NUMERIC(12,6) NOT NULL DEFAULT 0,

            transaction_costs NUMERIC(18,2) NOT NULL DEFAULT 0,
            fees_received NUMERIC(18,2) NOT NULL DEFAULT 0,
            fees_paid NUMERIC(18,2) NOT NULL DEFAULT 0,
            premium_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            calculation_method TEXT NOT NULL DEFAULT 'system',
            -- system|manual

            notes TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_eir_instr_idx
        ON company_8.ifrs9_effective_interest_terms(company_id, instrument_id, effective_date DESC);

        ALTER TABLE company_8.ifrs9_effective_interest_terms
        ADD COLUMN IF NOT EXISTS initial_principal NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS initial_carrying_amount NUMERIC(18,2),
        ADD COLUMN IF NOT EXISTS maturity_date DATE,
        ADD COLUMN IF NOT EXISTS payment_frequency TEXT,
        ADD COLUMN IF NOT EXISTS periods_per_year INT,
        ADD COLUMN IF NOT EXISTS total_periods INT,
        ADD COLUMN IF NOT EXISTS cashflows_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS calculated_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS calculated_by INT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

        UPDATE company_8.ifrs9_effective_interest_terms
        SET initial_principal=COALESCE(initial_principal,0),
            initial_carrying_amount=COALESCE(initial_carrying_amount,0),
            cashflows_json=COALESCE(cashflows_json,'[]'::jsonb),
            updated_at=COALESCE(updated_at,NOW());

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_ifrs9_eir_active_date_uq
        ON company_8.ifrs9_effective_interest_terms(
            company_id,
            instrument_id,
            effective_date
        );

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_eir_instr_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_effective_interest_terms
                    ADD CONSTRAINT %I
                    FOREIGN KEY (instrument_id)
                    REFERENCES %I.ifrs9_financial_instruments(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_ifrs9_eir_instr_fk', 'company_8'
                );
            END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_eir_valid_ck'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_effective_interest_terms
                    ADD CONSTRAINT %I CHECK (
                        contractual_rate >= 0
                        AND effective_interest_rate > -1
                        AND transaction_costs >= 0
                        AND fees_received >= 0
                        AND fees_paid >= 0
                        AND premium_amount >= 0
                        AND discount_amount >= 0
                        AND COALESCE(initial_principal,0) >= 0
                        AND COALESCE(initial_carrying_amount,0) >= 0
                        AND (
                            payment_frequency IS NULL
                            OR payment_frequency IN (
                                ''monthly'',
                                ''quarterly'',
                                ''semi_annual'',
                                ''annual'',
                                ''irregular''
                            )
                        )
                        AND (
                            periods_per_year IS NULL
                            OR periods_per_year > 0
                        )
                        AND (
                            total_periods IS NULL
                            OR total_periods > 0
                        )
                        AND calculation_method IN (
                            ''system'',
                            ''manual''
                        )
                    )',
                    'company_8',
                    'company_8_ifrs9_eir_valid_ck'
                );
            END IF;
        END $$;

        -- 4) Period amortised cost runs
        CREATE TABLE IF NOT EXISTS company_8.ifrs9_amortised_cost_runs (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            instrument_id INT NOT NULL,

            run_date DATE NOT NULL,
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,

            opening_carrying_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            interest_income NUMERIC(18,2) NOT NULL DEFAULT 0,
            interest_expense NUMERIC(18,2) NOT NULL DEFAULT 0,
            cash_received NUMERIC(18,2) NOT NULL DEFAULT 0,
            cash_paid NUMERIC(18,2) NOT NULL DEFAULT 0,
            fees_amortised NUMERIC(18,2) NOT NULL DEFAULT 0,
            closing_carrying_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            journal_id INT NULL,
            status TEXT NOT NULL DEFAULT 'draft',
            -- draft|posted|reversed|void

            created_by INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        ALTER TABLE company_8.ifrs9_amortised_cost_runs
        ADD COLUMN IF NOT EXISTS effective_interest_rate NUMERIC(12,6),
        ADD COLUMN IF NOT EXISTS day_count INT,
        ADD COLUMN IF NOT EXISTS day_count_basis TEXT NOT NULL DEFAULT 'actual_365',
        ADD COLUMN IF NOT EXISTS contractual_cashflow NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS reversal_journal_id INT,
        ADD COLUMN IF NOT EXISTS posted_by INT,
        ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS reversed_by INT,
        ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

        UPDATE company_8.ifrs9_amortised_cost_runs
        SET contractual_cashflow=COALESCE(contractual_cashflow,0),
            day_count_basis=COALESCE(
                NULLIF(day_count_basis,''),
                'actual_365'
            ),
            updated_at=COALESCE(updated_at,NOW());

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_amort_runs_instr_idx
        ON company_8.ifrs9_amortised_cost_runs(company_id, instrument_id, period_end DESC);

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_amort_runs_journal_idx
        ON company_8.ifrs9_amortised_cost_runs(journal_id);

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_ifrs9_amort_run_period_uq
        ON company_8.ifrs9_amortised_cost_runs(
            company_id,
            instrument_id,
            period_start,
            period_end
        )
        WHERE status IN ('draft','posted');

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_amort_run_status_idx
        ON company_8.ifrs9_amortised_cost_runs(
            company_id,
            status,
            period_end DESC
        );

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_amort_instr_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_amortised_cost_runs
                    ADD CONSTRAINT %I
                    FOREIGN KEY (instrument_id)
                    REFERENCES %I.ifrs9_financial_instruments(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_ifrs9_amort_instr_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_amort_journal_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_amortised_cost_runs
                    ADD CONSTRAINT %I
                    FOREIGN KEY (journal_id)
                    REFERENCES %I.journal(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_ifrs9_amort_journal_fk', 'company_8'
                );
            END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_amort_run_valid_ck'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_amortised_cost_runs
                    ADD CONSTRAINT %I CHECK (
                        period_end >= period_start
                        AND opening_carrying_amount >= 0
                        AND interest_income >= 0
                        AND interest_expense >= 0
                        AND cash_received >= 0
                        AND cash_paid >= 0
                        AND fees_amortised >= 0
                        AND closing_carrying_amount >= 0
                        AND contractual_cashflow >= 0
                        AND (
                            day_count IS NULL
                            OR day_count >= 0
                        )
                        AND day_count_basis IN (
                            ''actual_365'',
                            ''actual_360'',
                            ''30_360''
                        )
                        AND status IN (
                            ''draft'',
                            ''posted'',
                            ''reversed'',
                            ''void''
                        )
                    )',
                    'company_8',
                    'company_8_ifrs9_amort_run_valid_ck'
                );
            END IF;
        END $$;

        -- 5) ECL model profiles
        CREATE TABLE IF NOT EXISTS company_8.ifrs9_ecl_models (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            model_name TEXT NOT NULL,
            model_type TEXT NOT NULL DEFAULT 'simplified',
            -- simplified|general|manual

            applies_to TEXT NOT NULL DEFAULT 'trade_receivable',
            -- trade_receivable|loan_receivable|deposit_asset|other_financial_asset|all

            basis TEXT NOT NULL DEFAULT 'provision_matrix',
            -- provision_matrix|pd_lgd_ead|manual

            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            created_by INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        ALTER TABLE company_8.ifrs9_ecl_models
        ADD COLUMN IF NOT EXISTS effective_from DATE,
        ADD COLUMN IF NOT EXISTS effective_to DATE,
        ADD COLUMN IF NOT EXISTS version_no INT NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'draft',
        ADD COLUMN IF NOT EXISTS approved_by INT,
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS review_date DATE,
        ADD COLUMN IF NOT EXISTS model_owner TEXT;

        UPDATE company_8.ifrs9_ecl_models
        SET version_no = COALESCE(version_no, 1),
            approval_status = COALESCE(
                NULLIF(approval_status, ''),
                'draft'
            )
        WHERE version_no IS NULL
        OR approval_status IS NULL
        OR approval_status = '';
        
        CREATE INDEX IF NOT EXISTS company_8_ifrs9_ecl_models_company_idx
        ON company_8.ifrs9_ecl_models(company_id, is_active);

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_ecl_model_status_ck'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_ecl_models
                    ADD CONSTRAINT %I
                    CHECK (
                        model_type IN (
                            ''simplified'',
                            ''general'',
                            ''manual''
                        )
                        AND basis IN (
                            ''provision_matrix'',
                            ''pd_lgd_ead'',
                            ''manual''
                        )
                        AND approval_status IN (
                            ''draft'',
                            ''approved'',
                            ''rejected'',
                            ''retired''
                        )
                        AND version_no > 0
                        AND (
                            effective_to IS NULL
                            OR effective_from IS NULL
                            OR effective_to >= effective_from
                        )
                    )',
                    'company_8',
                    'company_8_ifrs9_ecl_model_status_ck'
                );
            END IF;
        END $$;

        -- 6) ECL provision matrix bands
        CREATE TABLE IF NOT EXISTS company_8.ifrs9_ecl_matrix_bands (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            model_id INT NOT NULL,

            band_label TEXT NOT NULL,
            days_from INT NOT NULL DEFAULT 0,
            days_to INT NULL,

            loss_rate NUMERIC(12,6) NOT NULL DEFAULT 0,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_ecl_matrix_model_idx
        ON company_8.ifrs9_ecl_matrix_bands(company_id, model_id, days_from);

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_matrix_model_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_ecl_matrix_bands
                    ADD CONSTRAINT %I
                    FOREIGN KEY (model_id)
                    REFERENCES %I.ifrs9_ecl_models(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_ifrs9_matrix_model_fk', 'company_8'
                );
            END IF;
        END $$;


        -- 7) ECL calculation runs
        CREATE TABLE IF NOT EXISTS company_8.ifrs9_ecl_runs (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            model_id INT NULL,

            run_date DATE NOT NULL,
            reporting_date DATE NOT NULL,

            run_type TEXT NOT NULL DEFAULT 'period_end',
            -- monthly|quarterly|year_end|period_end|manual

            total_exposure NUMERIC(18,2) NOT NULL DEFAULT 0,
            total_ecl NUMERIC(18,2) NOT NULL DEFAULT 0,

            journal_id INT NULL,

            status TEXT NOT NULL DEFAULT 'draft',
            -- draft|posted|reversed|void

            created_by INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        ALTER TABLE company_8.ifrs9_ecl_runs
        ADD COLUMN IF NOT EXISTS reversal_journal_id INT,
        ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS reversed_by INT,
        ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
        ADD COLUMN IF NOT EXISTS version_no INT NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS supersedes_run_id INT,
        ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS locked_by INT;

        UPDATE company_8.ifrs9_ecl_runs
        SET version_no = COALESCE(version_no, 1)
        WHERE version_no IS NULL;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_ecl_run_model_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_ecl_runs
                    ADD CONSTRAINT %I
                    FOREIGN KEY (model_id)
                    REFERENCES %I.ifrs9_ecl_models(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_ifrs9_ecl_run_model_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_ecl_run_journal_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_ecl_runs
                    ADD CONSTRAINT %I
                    FOREIGN KEY (journal_id)
                    REFERENCES %I.journal(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_ifrs9_ecl_run_journal_fk', 'company_8'
                );
            END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_ecl_reversal_journal_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_ecl_runs
                    ADD CONSTRAINT %I
                    FOREIGN KEY (reversal_journal_id)
                    REFERENCES %I.journal(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8_ifrs9_ecl_reversal_journal_fk',
                    'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_ecl_supersedes_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_ecl_runs
                    ADD CONSTRAINT %I
                    FOREIGN KEY (supersedes_run_id)
                    REFERENCES %I.ifrs9_ecl_runs(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8_ifrs9_ecl_supersedes_fk',
                    'company_8'
                );
            END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_ecl_runs_status_idx
        ON company_8.ifrs9_ecl_runs(company_id, status, reporting_date DESC);

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_ecl_runs_reversal_journal_idx
        ON company_8.ifrs9_ecl_runs(reversal_journal_id);

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_ifrs9_ecl_runs_active_date_uq
        ON company_8.ifrs9_ecl_runs(company_id, model_id, reporting_date)
        WHERE status IN ('draft', 'posted');

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_ecl_runs_date_idx
        ON company_8.ifrs9_ecl_runs(company_id, reporting_date DESC);

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_ecl_runs_journal_idx
        ON company_8.ifrs9_ecl_runs(journal_id);

        
        -- 8) ECL calculation lines
        CREATE TABLE IF NOT EXISTS company_8.ifrs9_ecl_run_lines (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            run_id INT NOT NULL,
            instrument_id INT NOT NULL,

            invoice_id INT NULL,
            customer_id INT NULL,

            days_past_due INT NOT NULL DEFAULT 0,
            ageing_band TEXT NULL,

            stage INT NOT NULL DEFAULT 1,
            -- 1|2|3

            gross_exposure NUMERIC(18,2) NOT NULL DEFAULT 0,
            loss_rate NUMERIC(12,6) NOT NULL DEFAULT 0,

            pd NUMERIC(12,6) NULL,
            lgd NUMERIC(12,6) NULL,
            ead NUMERIC(18,2) NULL,

            expected_credit_loss NUMERIC(18,2) NOT NULL DEFAULT 0,
            previous_ecl NUMERIC(18,2) NOT NULL DEFAULT 0,
            movement_ecl NUMERIC(18,2) NOT NULL DEFAULT 0,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_ecl_lines_run_idx
        ON company_8.ifrs9_ecl_run_lines(company_id, run_id);

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_ecl_lines_instr_idx
        ON company_8.ifrs9_ecl_run_lines(company_id, instrument_id);

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_ecl_lines_customer_idx
        ON company_8.ifrs9_ecl_run_lines(company_id, customer_id);

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_ecl_line_run_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_ecl_run_lines
                    ADD CONSTRAINT %I
                    FOREIGN KEY (run_id)
                    REFERENCES %I.ifrs9_ecl_runs(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_ifrs9_ecl_line_run_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_ecl_line_instr_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_ecl_run_lines
                    ADD CONSTRAINT %I
                    FOREIGN KEY (instrument_id)
                    REFERENCES %I.ifrs9_financial_instruments(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_ifrs9_ecl_line_instr_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_ecl_line_customer_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_ecl_run_lines
                    ADD CONSTRAINT %I
                    FOREIGN KEY (customer_id)
                    REFERENCES %I.customers(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_ifrs9_ecl_line_customer_fk', 'company_8'
                );
            END IF;
        END $$;


        -- 9) Loan / financial liability modifications
        CREATE TABLE IF NOT EXISTS company_8.ifrs9_modifications (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            instrument_id INT NOT NULL,

            modification_date DATE NOT NULL,
            modification_type TEXT NOT NULL DEFAULT 'cashflow_change',
            -- cashflow_change|rate_change|term_extension|concession|restructure|other

            old_carrying_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            revised_cashflow_pv NUMERIC(18,2) NOT NULL DEFAULT 0,
            modification_gain_loss NUMERIC(18,2) NOT NULL DEFAULT 0,

            substantial_modification BOOLEAN NOT NULL DEFAULT FALSE,
            derecognition_required BOOLEAN NOT NULL DEFAULT FALSE,

            journal_id INT NULL,
            reason TEXT NULL,

            created_by INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        ALTER TABLE company_8.ifrs9_modifications
        ADD COLUMN IF NOT EXISTS original_effective_interest_rate NUMERIC(12,6),
        ADD COLUMN IF NOT EXISTS revised_contractual_rate NUMERIC(12,6),
        ADD COLUMN IF NOT EXISTS revised_maturity_date DATE,
        ADD COLUMN IF NOT EXISTS revised_cashflows_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS percentage_change NUMERIC(12,6),
        ADD COLUMN IF NOT EXISTS journal_status TEXT NOT NULL DEFAULT 'draft',
        ADD COLUMN IF NOT EXISTS posted_by INT,
        ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS reversal_journal_id INT,
        ADD COLUMN IF NOT EXISTS reversed_by INT,
        ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

        UPDATE company_8.ifrs9_modifications
        SET revised_cashflows_json=COALESCE(
                revised_cashflows_json,
                '[]'::jsonb
            ),
            journal_status=COALESCE(
                NULLIF(journal_status,''),
                'draft'
            ),
            updated_at=COALESCE(updated_at,NOW());

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_mod_instr_idx
        ON company_8.ifrs9_modifications(company_id, instrument_id, modification_date DESC);

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_modification_status_idx
        ON company_8.ifrs9_modifications(
            company_id,
            journal_status,
            modification_date DESC
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_ifrs9_modification_active_date_uq
        ON company_8.ifrs9_modifications(
            company_id,
            instrument_id,
            modification_date
        )
        WHERE journal_status IN ('draft','posted');

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_modification_valid_ck'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_modifications
                    ADD CONSTRAINT %I CHECK (
                        old_carrying_amount >= 0
                        AND revised_cashflow_pv >= 0
                        AND (
                            original_effective_interest_rate IS NULL
                            OR original_effective_interest_rate > -1
                        )
                        AND (
                            percentage_change IS NULL
                            OR percentage_change >= 0
                        )
                        AND modification_type IN (
                            ''cashflow_change'',
                            ''rate_change'',
                            ''term_extension'',
                            ''term_reduction'',
                            ''payment_deferral'',
                            ''other''
                        )
                        AND journal_status IN (
                            ''draft'',
                            ''posted'',
                            ''reversed'',
                            ''void''
                        )
                    )',
                    'company_8',
                    'company_8_ifrs9_modification_valid_ck'
                );
            END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_mod_instr_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_modifications
                    ADD CONSTRAINT %I
                    FOREIGN KEY (instrument_id)
                    REFERENCES %I.ifrs9_financial_instruments(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_ifrs9_mod_instr_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_mod_journal_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_modifications
                    ADD CONSTRAINT %I
                    FOREIGN KEY (journal_id)
                    REFERENCES %I.journal(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_ifrs9_mod_journal_fk', 'company_8'
                );
            END IF;
        END $$;


        -- 10) Derecognition
        CREATE TABLE IF NOT EXISTS company_8.ifrs9_derecognitions (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            instrument_id INT NOT NULL,

            derecognition_date DATE NOT NULL,
            reason TEXT NOT NULL,
            carrying_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            consideration_received NUMERIC(18,2) NOT NULL DEFAULT 0,
            consideration_paid NUMERIC(18,2) NOT NULL DEFAULT 0,
            gain_loss NUMERIC(18,2) NOT NULL DEFAULT 0,

            journal_id INT NULL,

            created_by INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        ALTER TABLE company_8.ifrs9_derecognitions
        ADD COLUMN IF NOT EXISTS derecognition_type TEXT NOT NULL DEFAULT 'settlement',
        ADD COLUMN IF NOT EXISTS is_financial_asset BOOLEAN,
        ADD COLUMN IF NOT EXISTS settlement_account_code TEXT,
        ADD COLUMN IF NOT EXISTS allowance_released NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS oci_reclassified NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS modification_id INT,
        ADD COLUMN IF NOT EXISTS replacement_instrument_id INT,
        ADD COLUMN IF NOT EXISTS create_replacement_instrument BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS replacement_instrument_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS journal_status TEXT NOT NULL DEFAULT 'draft',
        ADD COLUMN IF NOT EXISTS posted_by INT,
        ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS reversal_journal_id INT,
        ADD COLUMN IF NOT EXISTS reversed_by INT,
        ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

        UPDATE company_8.ifrs9_derecognitions
        SET allowance_released=COALESCE(allowance_released,0),
            oci_reclassified=COALESCE(oci_reclassified,0),
            create_replacement_instrument=COALESCE(
                create_replacement_instrument,
                FALSE
            ),
            replacement_instrument_json=COALESCE(
                replacement_instrument_json,
                '{}'::jsonb
            ),
            journal_status=COALESCE(
                NULLIF(journal_status,''),
                'draft'
            ),
            updated_at=COALESCE(updated_at,NOW());

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_derec_status_idx
        ON company_8.ifrs9_derecognitions(
            company_id,
            journal_status,
            derecognition_date DESC
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_ifrs9_derec_active_instr_uq
        ON company_8.ifrs9_derecognitions(
            company_id,
            instrument_id
        )
        WHERE journal_status IN ('draft','posted');

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_derec_instr_idx
        ON company_8.ifrs9_derecognitions(company_id, instrument_id, derecognition_date DESC);

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_derec_instr_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_derecognitions
                    ADD CONSTRAINT %I
                    FOREIGN KEY (instrument_id)
                    REFERENCES %I.ifrs9_financial_instruments(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_ifrs9_derec_instr_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_derec_journal_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_derecognitions
                    ADD CONSTRAINT %I
                    FOREIGN KEY (journal_id)
                    REFERENCES %I.journal(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_ifrs9_derec_journal_fk', 'company_8'
                );
            END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n
                ON n.oid=c.connamespace
                WHERE c.conname=
                    'company_8_ifrs9_derec_modification_fk'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_derecognitions
                    ADD CONSTRAINT %I
                    FOREIGN KEY (modification_id)
                    REFERENCES %I.ifrs9_modifications(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8_ifrs9_derec_modification_fk',
                    'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n
                ON n.oid=c.connamespace
                WHERE c.conname=
                    'company_8_ifrs9_derec_replacement_fk'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_derecognitions
                    ADD CONSTRAINT %I
                    FOREIGN KEY (replacement_instrument_id)
                    REFERENCES %I.ifrs9_financial_instruments(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8_ifrs9_derec_replacement_fk',
                    'company_8'
                );
            END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n
                ON n.oid=c.connamespace
                WHERE c.conname=
                    'company_8_ifrs9_derecognition_valid_ck'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_derecognitions
                    ADD CONSTRAINT %I CHECK (
                        carrying_amount >= 0
                        AND consideration_received >= 0
                        AND consideration_paid >= 0
                        AND allowance_released >= 0
                        AND derecognition_type IN (
                            ''settlement'',
                            ''sale'',
                            ''transfer'',
                            ''expiry'',
                            ''cancellation'',
                            ''substantial_modification'',
                            ''other''
                        )
                        AND journal_status IN (
                            ''draft'',
                            ''posted'',
                            ''reversed'',
                            ''void''
                        )
                    )',
                    'company_8',
                    'company_8_ifrs9_derecognition_valid_ck'
                );
            END IF;
        END $$;

        -- 11) Fair value measurement runs
        CREATE TABLE IF NOT EXISTS company_8.ifrs9_fair_value_measurements (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            instrument_id INT NOT NULL,

            valuation_date DATE NOT NULL,
            previous_carrying_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            fair_value NUMERIC(18,2) NOT NULL DEFAULT 0,
            fair_value_gain_loss NUMERIC(18,2) NOT NULL DEFAULT 0,

            fair_value_level TEXT NOT NULL DEFAULT 'level_3',
            -- level_1|level_2|level_3

            gain_loss_destination TEXT NOT NULL DEFAULT 'profit_or_loss',
            -- profit_or_loss|oci

            valuation_method TEXT NULL,
            evidence_reference TEXT NULL,

            journal_id INT NULL,

            created_by INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        ALTER TABLE company_8.ifrs9_fair_value_measurements
        ADD COLUMN IF NOT EXISTS measurement_category TEXT,
        ADD COLUMN IF NOT EXISTS valuation_method TEXT,
        ADD COLUMN IF NOT EXISTS valuation_source TEXT,
        ADD COLUMN IF NOT EXISTS market_reference TEXT,
        ADD COLUMN IF NOT EXISTS observable_inputs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS unobservable_inputs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS sensitivity_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS gain_loss_destination TEXT,
        ADD COLUMN IF NOT EXISTS oci_reserve_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS journal_status TEXT NOT NULL DEFAULT 'draft',
        ADD COLUMN IF NOT EXISTS posted_by INT,
        ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS reversal_journal_id INT,
        ADD COLUMN IF NOT EXISTS reversed_by INT,
        ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

        UPDATE company_8.ifrs9_fair_value_measurements
        SET observable_inputs_json=COALESCE(
                observable_inputs_json,
                '{}'::jsonb
            ),
            unobservable_inputs_json=COALESCE(
                unobservable_inputs_json,
                '{}'::jsonb
            ),
            sensitivity_json=COALESCE(
                sensitivity_json,
                '{}'::jsonb
            ),
            oci_reserve_amount=COALESCE(
                oci_reserve_amount,
                0
            ),
            journal_status=COALESCE(
                NULLIF(journal_status, ''),
                'draft'
            ),
            updated_at=COALESCE(
                updated_at,
                NOW()
            );

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_fv_instr_idx
        ON company_8.ifrs9_fair_value_measurements(company_id, instrument_id, valuation_date DESC);

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_fv_measurement_instr_idx
        ON company_8.ifrs9_fair_value_measurements(
            company_id,
            instrument_id,
            valuation_date DESC
        );

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_fv_measurement_status_idx
        ON company_8.ifrs9_fair_value_measurements(
            company_id,
            journal_status,
            valuation_date DESC
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_ifrs9_fv_active_date_uq
        ON company_8.ifrs9_fair_value_measurements(
            company_id,
            instrument_id,
            valuation_date
        )
        WHERE journal_status IN ('draft', 'posted');

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_fv_instr_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_fair_value_measurements
                    ADD CONSTRAINT %I
                    FOREIGN KEY (instrument_id)
                    REFERENCES %I.ifrs9_financial_instruments(id)
                    ON DELETE CASCADE',
                    'company_8', 'company_8_ifrs9_fv_instr_fk', 'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_fv_journal_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_fair_value_measurements
                    ADD CONSTRAINT %I
                    FOREIGN KEY (journal_id)
                    REFERENCES %I.journal(id)
                    ON DELETE SET NULL',
                    'company_8', 'company_8_ifrs9_fv_journal_fk', 'company_8'
                );
            END IF;
        END $$;

        DO $ifrs9_fv_measurement_valid_ck$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n
                ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_fv_measurement_valid_ck'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_fair_value_measurements
                    ADD CONSTRAINT %I
                    CHECK (
                        previous_carrying_amount >= 0
                        AND fair_value >= 0
                        AND ABS(
                            fair_value_gain_loss
                            - (fair_value - previous_carrying_amount)
                        ) <= 0.02
                        AND fair_value_level IN (
                            ''level_1'',
                            ''level_2'',
                            ''level_3''
                        )
                        AND gain_loss_destination IN (
                            ''profit_or_loss'',
                            ''oci''
                        )
                        AND journal_status IN (
                            ''draft'',
                            ''posted'',
                            ''reversed'',
                            ''void''
                        )
                        AND (
                            measurement_category IS NULL
                            OR measurement_category IN (
                                ''fvpl'',
                                ''fvoci''
                            )
                        )
                    )',
                    'company_8',
                    'company_8_ifrs9_fv_measurement_valid_ck'
                );
            END IF;
        END $ifrs9_fv_measurement_valid_ck$;

        -- 12) IFRS 9 account mapping
        CREATE TABLE IF NOT EXISTS company_8.ifrs9_account_mappings (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            mapping_key TEXT NOT NULL,
            account_code TEXT NOT NULL,

            description TEXT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_ifrs9_mapping_key_uq
        ON company_8.ifrs9_account_mappings(company_id, mapping_key)
        WHERE is_active = TRUE;


        -- 13) Disclosure snapshots / note builder support
        CREATE TABLE IF NOT EXISTS company_8.ifrs9_disclosure_snapshots (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            financial_year INT NOT NULL,
            reporting_date DATE NOT NULL,

            amortised_cost_assets NUMERIC(18,2) NOT NULL DEFAULT 0,
            fvoci_assets NUMERIC(18,2) NOT NULL DEFAULT 0,
            fvpl_assets NUMERIC(18,2) NOT NULL DEFAULT 0,

            amortised_cost_liabilities NUMERIC(18,2) NOT NULL DEFAULT 0,
            fvpl_liabilities NUMERIC(18,2) NOT NULL DEFAULT 0,

            trade_receivables_gross NUMERIC(18,2) NOT NULL DEFAULT 0,
            trade_receivables_ecl NUMERIC(18,2) NOT NULL DEFAULT 0,
            trade_receivables_net NUMERIC(18,2) NOT NULL DEFAULT 0,

            ecl_opening NUMERIC(18,2) NOT NULL DEFAULT 0,
            ecl_charge NUMERIC(18,2) NOT NULL DEFAULT 0,
            ecl_writeoffs NUMERIC(18,2) NOT NULL DEFAULT 0,
            ecl_closing NUMERIC(18,2) NOT NULL DEFAULT 0,

            liquidity_risk_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            credit_risk_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            market_risk_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            fair_value_json JSONB NOT NULL DEFAULT '{}'::jsonb,

            generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            generated_by INT NULL,
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_ifrs9_disclosure_year_uq
        ON company_8.ifrs9_disclosure_snapshots(company_id, financial_year, reporting_date);

        CREATE TABLE IF NOT EXISTS company_8.ifrs9_writeoffs (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            instrument_id INT NULL,
            customer_id INT NULL,
            invoice_id INT NULL,

            writeoff_date DATE NOT NULL,
            gross_receivable_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            allowance_used NUMERIC(18,2) NOT NULL DEFAULT 0,
            additional_loss NUMERIC(18,2) NOT NULL DEFAULT 0,
            writeoff_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            recovered_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            reason TEXT NOT NULL,
            approval_status TEXT NOT NULL DEFAULT 'draft',
            status TEXT NOT NULL DEFAULT 'draft',

            journal_id INT NULL,
            reversal_journal_id INT NULL,

            created_by INT NULL,
            approved_by INT NULL,
            posted_by INT NULL,

            approved_at TIMESTAMPTZ NULL,
            posted_at TIMESTAMPTZ NULL,
            reversed_at TIMESTAMPTZ NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE TABLE IF NOT EXISTS company_8.ifrs9_writeoff_recoveries (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            writeoff_id INT NOT NULL,

            recovery_date DATE NOT NULL,
            recovery_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            payment_reference TEXT NULL,
            notes TEXT NULL,

            journal_id INT NULL,
            status TEXT NOT NULL DEFAULT 'draft',

            created_by INT NULL,
            posted_by INT NULL,
            posted_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_writeoffs_company_idx
        ON company_8.ifrs9_writeoffs(company_id, writeoff_date DESC);

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_writeoffs_invoice_idx
        ON company_8.ifrs9_writeoffs(company_id, invoice_id);

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_writeoffs_instrument_idx
        ON company_8.ifrs9_writeoffs(company_id, instrument_id);

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_writeoff_recovery_idx
        ON company_8.ifrs9_writeoff_recoveries(company_id, writeoff_id);

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_ifrs9_writeoffs_active_invoice_uq
        ON company_8.ifrs9_writeoffs(company_id, invoice_id)
        WHERE invoice_id IS NOT NULL
        AND status IN ('draft', 'approved', 'posted');

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_writeoff_instrument_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_writeoffs
                    ADD CONSTRAINT %I
                    FOREIGN KEY (instrument_id)
                    REFERENCES %I.ifrs9_financial_instruments(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8_ifrs9_writeoff_instrument_fk',
                    'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_writeoff_customer_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_writeoffs
                    ADD CONSTRAINT %I
                    FOREIGN KEY (customer_id)
                    REFERENCES %I.customers(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8_ifrs9_writeoff_customer_fk',
                    'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_writeoff_recovery_fk'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_writeoff_recoveries
                    ADD CONSTRAINT %I
                    FOREIGN KEY (writeoff_id)
                    REFERENCES %I.ifrs9_writeoffs(id)
                    ON DELETE CASCADE',
                    'company_8',
                    'company_8_ifrs9_writeoff_recovery_fk',
                    'company_8'
                );
            END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'company_8_ifrs9_writeoff_amount_ck'
                AND n.nspname = 'company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_writeoffs
                    ADD CONSTRAINT %I CHECK (
                        gross_receivable_amount >= 0
                        AND allowance_used >= 0
                        AND additional_loss >= 0
                        AND writeoff_amount > 0
                        AND recovered_amount >= 0
                        AND allowance_used + additional_loss = writeoff_amount
                        AND recovered_amount <= writeoff_amount
                        AND approval_status IN (
                            ''draft'',''approved'',''rejected''
                        )
                        AND status IN (
                            ''draft'',''approved'',''posted'',''reversed'',''void''
                        )
                    )',
                    'company_8',
                    'company_8_ifrs9_writeoff_amount_ck'
                );
            END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS company_8.ifrs9_general_ecl_models (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            model_name TEXT NOT NULL,
            model_code TEXT NULL,
            applies_to TEXT NOT NULL DEFAULT 'loan_receivable',

            default_definition_days INT NOT NULL DEFAULT 90,
            stage_2_days_past_due INT NOT NULL DEFAULT 30,
            cure_period_days INT NOT NULL DEFAULT 90,

            sicr_method TEXT NOT NULL DEFAULT 'combined',
            lifetime_horizon_months INT NOT NULL DEFAULT 120,
            twelve_month_horizon_months INT NOT NULL DEFAULT 12,

            discount_basis TEXT NOT NULL DEFAULT 'effective_interest_rate',
            scenario_method TEXT NOT NULL DEFAULT 'probability_weighted',

            is_active BOOLEAN NOT NULL DEFAULT FALSE,
            approval_status TEXT NOT NULL DEFAULT 'draft',

            effective_from DATE NULL,
            effective_to DATE NULL,
            review_date DATE NULL,

            model_owner TEXT NULL,
            version_no INT NOT NULL DEFAULT 1,

            created_by INT NULL,
            approved_by INT NULL,
            approved_at TIMESTAMPTZ NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_ifrs9_general_ecl_model_code_uq
        ON company_8.ifrs9_general_ecl_models(
            company_id,
            LOWER(model_code)
        )
        WHERE model_code IS NOT NULL;

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_general_ecl_model_active_idx
        ON company_8.ifrs9_general_ecl_models(
            company_id,
            is_active,
            applies_to
        );

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_general_ecl_model_ck'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_general_ecl_models
                    ADD CONSTRAINT %I CHECK (
                        applies_to IN (
                            ''loan_receivable'',
                            ''staff_loan'',
                            ''director_loan'',
                            ''deposit_asset'',
                            ''bond'',
                            ''note_receivable'',
                            ''other_financial_asset'',
                            ''fvoci_debt''
                        )
                        AND sicr_method IN (
                            ''days_past_due'',
                            ''credit_rating'',
                            ''pd_change'',
                            ''watchlist'',
                            ''combined''
                        )
                        AND discount_basis IN (
                            ''effective_interest_rate'',
                            ''credit_adjusted_eir''
                        )
                        AND scenario_method IN (
                            ''probability_weighted'',
                            ''single_base_case''
                        )
                        AND approval_status IN (
                            ''draft'',
                            ''approved'',
                            ''rejected'',
                            ''retired''
                        )
                        AND default_definition_days > 0
                        AND stage_2_days_past_due >= 0
                        AND cure_period_days >= 0
                        AND lifetime_horizon_months > 0
                        AND twelve_month_horizon_months > 0
                        AND version_no > 0
                        AND (
                            effective_to IS NULL
                            OR effective_from IS NULL
                            OR effective_to >= effective_from
                        )
                    )',
                    'company_8',
                    'company_8_ifrs9_general_ecl_model_ck'
                );
            END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS company_8.ifrs9_general_ecl_scenarios (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            model_id INT NOT NULL,

            scenario_code TEXT NOT NULL,
            scenario_name TEXT NOT NULL,

            scenario_type TEXT NOT NULL DEFAULT 'base',
            probability_weight NUMERIC(12,8) NOT NULL DEFAULT 0,

            pd_multiplier NUMERIC(12,8) NOT NULL DEFAULT 1,
            lgd_multiplier NUMERIC(12,8) NOT NULL DEFAULT 1,
            ead_multiplier NUMERIC(12,8) NOT NULL DEFAULT 1,

            macroeconomic_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            assumptions TEXT NULL,

            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            created_by INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_ifrs9_general_ecl_scenario_code_uq
        ON company_8.ifrs9_general_ecl_scenarios(
            company_id,
            model_id,
            LOWER(scenario_code)
        );

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_general_ecl_scenario_model_idx
        ON company_8.ifrs9_general_ecl_scenarios(
            company_id,
            model_id,
            is_active
        );

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_general_ecl_scenario_model_fk'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_general_ecl_scenarios
                    ADD CONSTRAINT %I
                    FOREIGN KEY (model_id)
                    REFERENCES %I.ifrs9_general_ecl_models(id)
                    ON DELETE CASCADE',
                    'company_8',
                    'company_8_ifrs9_general_ecl_scenario_model_fk',
                    'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_general_ecl_scenario_ck'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_general_ecl_scenarios
                    ADD CONSTRAINT %I CHECK (
                        scenario_type IN (
                            ''base'',
                            ''upside'',
                            ''downside'',
                            ''severe''
                        )
                        AND probability_weight >= 0
                        AND probability_weight <= 1
                        AND pd_multiplier >= 0
                        AND lgd_multiplier >= 0
                        AND ead_multiplier >= 0
                    )',
                    'company_8',
                    'company_8_ifrs9_general_ecl_scenario_ck'
                );
            END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS company_8.ifrs9_general_ecl_pd_curves (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            model_id INT NOT NULL,

            rating_grade TEXT NOT NULL,
            period_month INT NOT NULL,

            marginal_pd NUMERIC(12,8) NOT NULL DEFAULT 0,
            cumulative_pd NUMERIC(12,8) NOT NULL DEFAULT 0,

            effective_from DATE NULL,
            effective_to DATE NULL,

            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            created_by INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_ifrs9_general_pd_curve_uq
        ON company_8.ifrs9_general_ecl_pd_curves(
            company_id,
            model_id,
            rating_grade,
            period_month
        )
        WHERE is_active=TRUE;

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_general_pd_curve_model_idx
        ON company_8.ifrs9_general_ecl_pd_curves(
            company_id,
            model_id,
            rating_grade
        );

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_general_pd_model_fk'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_general_ecl_pd_curves
                    ADD CONSTRAINT %I
                    FOREIGN KEY (model_id)
                    REFERENCES %I.ifrs9_general_ecl_models(id)
                    ON DELETE CASCADE',
                    'company_8',
                    'company_8_ifrs9_general_pd_model_fk',
                    'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_general_pd_curve_ck'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_general_ecl_pd_curves
                    ADD CONSTRAINT %I CHECK (
                        period_month > 0
                        AND marginal_pd >= 0
                        AND marginal_pd <= 1
                        AND cumulative_pd >= 0
                        AND cumulative_pd <= 1
                        AND (
                            effective_to IS NULL
                            OR effective_from IS NULL
                            OR effective_to >= effective_from
                        )
                    )',
                    'company_8',
                    'company_8_ifrs9_general_pd_curve_ck'
                );
            END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS company_8.ifrs9_general_ecl_lgd_assumptions (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            model_id INT NOT NULL,

            lgd_code TEXT NOT NULL,
            lgd_name TEXT NOT NULL,

            instrument_type TEXT NULL,
            collateral_type TEXT NULL,
            seniority TEXT NULL,

            base_lgd NUMERIC(12,8) NOT NULL DEFAULT 0,
            recovery_rate NUMERIC(12,8) NOT NULL DEFAULT 0,
            recovery_cost_rate NUMERIC(12,8) NOT NULL DEFAULT 0,

            recovery_delay_months INT NOT NULL DEFAULT 0,

            effective_from DATE NULL,
            effective_to DATE NULL,

            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            created_by INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_ifrs9_general_lgd_code_uq
        ON company_8.ifrs9_general_ecl_lgd_assumptions(
            company_id,
            model_id,
            LOWER(lgd_code)
        )
        WHERE is_active=TRUE;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_general_lgd_model_fk'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_general_ecl_lgd_assumptions
                    ADD CONSTRAINT %I
                    FOREIGN KEY (model_id)
                    REFERENCES %I.ifrs9_general_ecl_models(id)
                    ON DELETE CASCADE',
                    'company_8',
                    'company_8_ifrs9_general_lgd_model_fk',
                    'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_general_lgd_ck'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_general_ecl_lgd_assumptions
                    ADD CONSTRAINT %I CHECK (
                        base_lgd >= 0
                        AND base_lgd <= 1
                        AND recovery_rate >= 0
                        AND recovery_rate <= 1
                        AND recovery_cost_rate >= 0
                        AND recovery_cost_rate <= 1
                        AND recovery_delay_months >= 0
                        AND (
                            effective_to IS NULL
                            OR effective_from IS NULL
                            OR effective_to >= effective_from
                        )
                    )',
                    'company_8',
                    'company_8_ifrs9_general_lgd_ck'
                );
            END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS company_8.ifrs9_credit_risk_profiles (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            instrument_id INT NOT NULL,

            general_model_id INT NULL,

            origination_rating TEXT NULL,
            current_rating TEXT NULL,

            origination_lifetime_pd NUMERIC(12,8) NULL,
            current_lifetime_pd NUMERIC(12,8) NULL,

            origination_twelve_month_pd NUMERIC(12,8) NULL,
            current_twelve_month_pd NUMERIC(12,8) NULL,

            lgd_assumption_id INT NULL,
            override_lgd NUMERIC(12,8) NULL,

            credit_limit NUMERIC(18,2) NOT NULL DEFAULT 0,
            undrawn_commitment NUMERIC(18,2) NOT NULL DEFAULT 0,
            credit_conversion_factor NUMERIC(12,8) NOT NULL DEFAULT 1,

            collateral_value NUMERIC(18,2) NOT NULL DEFAULT 0,
            collateral_type TEXT NULL,
            guarantee_value NUMERIC(18,2) NOT NULL DEFAULT 0,

            watchlist BOOLEAN NOT NULL DEFAULT FALSE,
            forbearance BOOLEAN NOT NULL DEFAULT FALSE,
            default_flag BOOLEAN NOT NULL DEFAULT FALSE,
            credit_impaired BOOLEAN NOT NULL DEFAULT FALSE,

            default_date DATE NULL,
            cure_date DATE NULL,

            created_by INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_ifrs9_credit_profile_instr_uq
        ON company_8.ifrs9_credit_risk_profiles(
            company_id,
            instrument_id
        );

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_credit_profile_instr_fk'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_credit_risk_profiles
                    ADD CONSTRAINT %I
                    FOREIGN KEY (instrument_id)
                    REFERENCES %I.ifrs9_financial_instruments(id)
                    ON DELETE CASCADE',
                    'company_8',
                    'company_8_ifrs9_credit_profile_instr_fk',
                    'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_credit_profile_model_fk'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_credit_risk_profiles
                    ADD CONSTRAINT %I
                    FOREIGN KEY (general_model_id)
                    REFERENCES %I.ifrs9_general_ecl_models(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8_ifrs9_credit_profile_model_fk',
                    'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_credit_profile_lgd_fk'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_credit_risk_profiles
                    ADD CONSTRAINT %I
                    FOREIGN KEY (lgd_assumption_id)
                    REFERENCES %I.ifrs9_general_ecl_lgd_assumptions(id)
                    ON DELETE SET NULL',
                    'company_8',
                    'company_8_ifrs9_credit_profile_lgd_fk',
                    'company_8'
                );
            END IF;
        END $$;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_credit_profile_ck'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_credit_risk_profiles
                    ADD CONSTRAINT %I CHECK (
                        COALESCE(origination_lifetime_pd,0) BETWEEN 0 AND 1
                        AND COALESCE(current_lifetime_pd,0) BETWEEN 0 AND 1
                        AND COALESCE(origination_twelve_month_pd,0) BETWEEN 0 AND 1
                        AND COALESCE(current_twelve_month_pd,0) BETWEEN 0 AND 1
                        AND COALESCE(override_lgd,0) BETWEEN 0 AND 1
                        AND credit_limit >= 0
                        AND undrawn_commitment >= 0
                        AND credit_conversion_factor BETWEEN 0 AND 1
                        AND collateral_value >= 0
                        AND guarantee_value >= 0
                    )',
                    'company_8',
                    'company_8_ifrs9_credit_profile_ck'
                );
            END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS company_8.ifrs9_stage_assessments (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            instrument_id INT NOT NULL,
            model_id INT NOT NULL,

            assessment_date DATE NOT NULL,

            previous_stage INT NULL,
            assessed_stage INT NOT NULL,

            days_past_due INT NOT NULL DEFAULT 0,

            sicr BOOLEAN NOT NULL DEFAULT FALSE,
            default_flag BOOLEAN NOT NULL DEFAULT FALSE,
            credit_impaired BOOLEAN NOT NULL DEFAULT FALSE,

            quantitative_sicr BOOLEAN NOT NULL DEFAULT FALSE,
            qualitative_sicr BOOLEAN NOT NULL DEFAULT FALSE,
            backstop_sicr BOOLEAN NOT NULL DEFAULT FALSE,

            pd_ratio NUMERIC(18,8) NULL,
            rating_deterioration_steps INT NOT NULL DEFAULT 0,

            watchlist BOOLEAN NOT NULL DEFAULT FALSE,
            forbearance BOOLEAN NOT NULL DEFAULT FALSE,

            cure_period_satisfied BOOLEAN NOT NULL DEFAULT FALSE,

            assessment_reason TEXT NULL,
            override_stage INT NULL,
            override_reason TEXT NULL,

            status TEXT NOT NULL DEFAULT 'draft',

            created_by INT NULL,
            approved_by INT NULL,
            approved_at TIMESTAMPTZ NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );

        CREATE UNIQUE INDEX IF NOT EXISTS company_8_ifrs9_stage_assessment_date_uq
        ON company_8.ifrs9_stage_assessments(
            company_id,
            instrument_id,
            assessment_date
        )
        WHERE status IN ('draft','approved');

        CREATE INDEX IF NOT EXISTS company_8_ifrs9_stage_assessment_stage_idx
        ON company_8.ifrs9_stage_assessments(
            company_id,
            assessed_stage,
            assessment_date DESC
        );

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_stage_assessment_instr_fk'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_stage_assessments
                    ADD CONSTRAINT %I
                    FOREIGN KEY (instrument_id)
                    REFERENCES %I.ifrs9_financial_instruments(id)
                    ON DELETE CASCADE',
                    'company_8',
                    'company_8_ifrs9_stage_assessment_instr_fk',
                    'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_stage_assessment_model_fk'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_stage_assessments
                    ADD CONSTRAINT %I
                    FOREIGN KEY (model_id)
                    REFERENCES %I.ifrs9_general_ecl_models(id)
                    ON DELETE RESTRICT',
                    'company_8',
                    'company_8_ifrs9_stage_assessment_model_fk',
                    'company_8'
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid=c.connamespace
                WHERE c.conname='company_8_ifrs9_stage_assessment_ck'
                AND n.nspname='company_8'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.ifrs9_stage_assessments
                    ADD CONSTRAINT %I CHECK (
                        assessed_stage IN (1,2,3)
                        AND (
                            previous_stage IS NULL
                            OR previous_stage IN (1,2,3)
                        )
                        AND (
                            override_stage IS NULL
                            OR override_stage IN (1,2,3)
                        )
                        AND days_past_due >= 0
                        AND rating_deterioration_steps >= 0
                        AND status IN (
                            ''draft'',
                            ''approved'',
                            ''superseded'',
                            ''void''
                        )
                    )',
                    'company_8',
                    'company_8_ifrs9_stage_assessment_ck'
                );
            END IF;
        END $$;

        CREATE TABLE IF NOT EXISTS company_8.deferred_tax_runs (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            reporting_date DATE NOT NULL,
            tax_authority_id INT NULL,
            tax_rate NUMERIC(8,4) NOT NULL,

            status TEXT NOT NULL DEFAULT 'draft',

            total_taxable_difference NUMERIC(18,2) NOT NULL DEFAULT 0,
            total_deductible_difference NUMERIC(18,2) NOT NULL DEFAULT 0,

            gross_dta NUMERIC(18,2) NOT NULL DEFAULT 0,
            gross_dtl NUMERIC(18,2) NOT NULL DEFAULT 0,

            recognized_dta NUMERIC(18,2) NOT NULL DEFAULT 0,
            recognized_dtl NUMERIC(18,2) NOT NULL DEFAULT 0,
            unrecognized_dta NUMERIC(18,2) NOT NULL DEFAULT 0,

            net_deferred_tax NUMERIC(18,2) NOT NULL DEFAULT 0,

            journal_id INT NULL,
            reversed_by_journal_id INT NULL,

            created_by_user_id INT NULL,
            reviewed_by_user_id INT NULL,
            approved_by_user_id INT NULL,

            reviewed_at TIMESTAMPTZ NULL,
            approved_at TIMESTAMPTZ NULL,
            posted_at TIMESTAMPTZ NULL,

            calculation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CONSTRAINT ck_deferred_tax_runs_status
                CHECK (
                    status IN (
                        'draft',
                        'reviewed',
                        'approved',
                        'posted',
                        'reversed',
                        'void'
                    )
                )
        );    

        ALTER TABLE company_8.deferred_tax_runs
        ADD COLUMN IF NOT EXISTS recognized_dtl
            NUMERIC(18,2) NOT NULL DEFAULT 0;

        ALTER TABLE company_8.deferred_tax_runs
        DROP CONSTRAINT IF EXISTS uq_deferred_tax_run;

        ALTER TABLE company_8.deferred_tax_runs
        DROP CONSTRAINT IF EXISTS
            deferred_tax_runs_company_id_reporting_date_key;

        CREATE UNIQUE INDEX IF NOT EXISTS
            company_8_deferred_tax_active_run_uq
        ON company_8.deferred_tax_runs (
            company_id,
            reporting_date,
            tax_authority_id
        )
        WHERE status <> 'void';

        CREATE INDEX IF NOT EXISTS
            company_8_deferred_tax_runs_date_idx
        ON company_8.deferred_tax_runs (
            company_id,
            reporting_date DESC
        );


        CREATE TABLE IF NOT EXISTS company_8.deferred_tax_run_lines (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            run_id BIGINT NOT NULL,

            source_module TEXT NOT NULL,
            source_table TEXT NULL,
            source_type TEXT NOT NULL,
            source_id BIGINT NULL,
            source_line_id BIGINT NULL,

            description TEXT NOT NULL,
            balance_type TEXT NOT NULL,

            carrying_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            tax_base NUMERIC(18,2) NOT NULL DEFAULT 0,

            temporary_difference NUMERIC(18,2) NOT NULL DEFAULT 0,
            difference_type TEXT NOT NULL,

            tax_rate NUMERIC(8,4) NOT NULL,
            gross_deferred_tax NUMERIC(18,2) NOT NULL DEFAULT 0,

            recognition_percent NUMERIC(8,4) NOT NULL DEFAULT 100,
            recognized_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            unrecognized_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            recognition_destination TEXT NOT NULL DEFAULT 'profit_or_loss',

            tax_treatment_code TEXT NULL,
            reversal_pattern TEXT NULL,
            expected_reversal_date DATE NULL,

            is_manual BOOLEAN NOT NULL DEFAULT FALSE,
            calculation_json JSONB NOT NULL DEFAULT '{}'::jsonb,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CONSTRAINT ck_deferred_tax_line_balance_type
                CHECK (
                    balance_type IN (
                        'asset',
                        'liability',
                        'tax_loss',
                        'tax_credit'
                    )
                ),

            CONSTRAINT ck_deferred_tax_line_difference_type
                CHECK (
                    difference_type IN (
                        'taxable',
                        'deductible',
                        'tax_loss',
                        'tax_credit',
                        'none'
                    )
                ),

            CONSTRAINT ck_deferred_tax_line_destination
                CHECK (
                    recognition_destination IN (
                        'profit_or_loss',
                        'oci',
                        'equity',
                        'business_combination'
                    )
                ),

            CONSTRAINT ck_deferred_tax_recognition_percent
                CHECK (
                    recognition_percent BETWEEN 0 AND 100
                )
        );

        ALTER TABLE company_8.deferred_tax_run_lines
        ADD COLUMN IF NOT EXISTS scan_status TEXT
            NOT NULL DEFAULT 'resolved',
        ADD COLUMN IF NOT EXISTS resolution_message TEXT NULL,
        ADD COLUMN IF NOT EXISTS bs_account_code TEXT NULL,
        ADD COLUMN IF NOT EXISTS bs_carrying_amount NUMERIC(18,2) NULL;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n
                ON n.oid = c.connamespace
                WHERE n.nspname = 'company_8'
                AND c.conname = 'ck_deferred_tax_scan_status'
            ) THEN
                ALTER TABLE company_8.deferred_tax_run_lines
                ADD CONSTRAINT ck_deferred_tax_scan_status
                CHECK (
                    scan_status IN (
                        'resolved',
                        'requires_review',
                        'excluded',
                        'reconciliation_error'
                    )
                );
            END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS company_8_deferred_tax_scan_status_idx
        ON company_8.deferred_tax_run_lines (
            company_id,
            run_id,
            scan_status
        );

        CREATE INDEX IF NOT EXISTS company_8_deferred_tax_bs_account_idx
        ON company_8.deferred_tax_run_lines (
            company_id,
            bs_account_code
        )
        WHERE bs_account_code IS NOT NULL;

        CREATE INDEX IF NOT EXISTS
            company_8_deferred_tax_lines_run_idx
        ON company_8.deferred_tax_run_lines (
            company_id,
            run_id
        );



        CREATE TABLE IF NOT EXISTS company_8.deferred_tax_tax_base_overrides (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,

            source_module TEXT NOT NULL,
            source_type TEXT NOT NULL,
            source_id BIGINT NULL,

            effective_date DATE NOT NULL,

            tax_base NUMERIC(18,2) NOT NULL,
            reason TEXT NOT NULL,
            supporting_reference TEXT NULL,

            created_by_user_id INT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS company_8.deferred_tax_recognition_assessments (
            id BIGSERIAL PRIMARY KEY,
            company_id INT NOT NULL DEFAULT 8,
            run_id BIGINT NOT NULL,

            assessment_type TEXT NOT NULL,
            available_deductible_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            forecast_taxable_profit NUMERIC(18,2) NOT NULL DEFAULT 0,
            recognized_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            unrecognized_amount NUMERIC(18,2) NOT NULL DEFAULT 0,

            conclusion TEXT NULL,
            evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,

            assessed_by_user_id INT NULL,
            assessed_at TIMESTAMPTZ NULL,

            CONSTRAINT ck_deferred_tax_assessment_type
                CHECK (
                    assessment_type IN (
                        'deductible_temporary_differences',
                        'tax_losses',
                        'tax_credits',
                        'investment_exemption'
                    )
                )
        );

        CREATE INDEX IF NOT EXISTS
            company_8_deferred_tax_assessment_run_idx
        ON company_8.deferred_tax_recognition_assessments (
            company_id,
            run_id
        );

        CREATE TABLE IF NOT EXISTS company_8.asset_tax_rule_overrides (
            id BIGSERIAL PRIMARY KEY,

            company_id INT NOT NULL DEFAULT 8,
            tax_authority_id INT NOT NULL
                REFERENCES public.tax_authorities(id),

            default_rule_id INT NULL
                REFERENCES public.tax_allowance_rules(id)
                ON DELETE SET NULL,

            rule_code TEXT NOT NULL,
            rule_name TEXT NOT NULL,

            asset_category_hint TEXT NULL,

            method TEXT NOT NULL DEFAULT 'WDV',

            rate_percent NUMERIC(8,4) NULL,
            useful_life_years NUMERIC(8,2) NULL,

            initial_allowance_percent NUMERIC(8,4) NULL,
            annual_allowance_percent NUMERIC(8,4) NULL,

            effective_from DATE NOT NULL
                DEFAULT DATE '1900-01-01',

            effective_to DATE NULL,

            override_type TEXT NOT NULL DEFAULT 'custom',

            notes TEXT NULL,

            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            is_deleted BOOLEAN NOT NULL DEFAULT FALSE,

            created_by_user_id INT NULL,
            updated_by_user_id INT NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CONSTRAINT ck_asset_tax_rule_override_method
                CHECK (
                    method IN (
                        'WDV',
                        'SL',
                        'IMMEDIATE',
                        'CUSTOM'
                    )
                ),

            CONSTRAINT ck_asset_tax_rule_override_type
                CHECK (
                    override_type IN (
                        'override',
                        'custom',
                        'disabled_default'
                    )
                ),

            CONSTRAINT uq_asset_tax_rule_override
                UNIQUE (
                    company_id,
                    tax_authority_id,
                    rule_code,
                    effective_from
                )
        );
    
        CREATE INDEX IF NOT EXISTS
        company_8_asset_tax_rule_override_authority_idx
        ON company_8.asset_tax_rule_overrides (
            company_id,
            tax_authority_id,
            is_active
        );

        CREATE INDEX IF NOT EXISTS
        company_8_asset_tax_rule_override_default_idx
        ON company_8.asset_tax_rule_overrides (
            default_rule_id
        )
        WHERE default_rule_id IS NOT NULL;
        