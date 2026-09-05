# FinSage Control — Schema Migration Runner
"""
Ensures the `control.*` schema exists before the Flask app serves any request.

The entire DDL lives inline in `ensure_control_schema()` below as an f-string,
so the schema name (`control`) is parameterised in ONE place and substituted
everywhere via `{schema}`. No external .sql file is read at runtime — this
module is fully self-contained.

Idempotent: safe to call on every startup. Probes information_schema first
and skips the migration if `control.support_agents` already exists.

WHO CALLS THIS
--------------
`ensure_control_schema(db_service)` is called from EXACTLY ONE place:
`ControlService.ensure_schema()` (a method on the ControlService class in
`backend/services/control_service.py`). Nothing else in the codebase calls
this function directly.

`register_control_blueprints(app)` in `backend/__init__.py` calls
`ControlService(db_service).ensure_schema()` once per Flask process at app
startup, right after all the blueprints are registered. That function runs
exactly once when the Flask app is created in your app factory, so the
migration runs once per process boot — and thanks to the idempotency probe,
it is a no-op on subsequent restarts once the schema is in place.

MULTI-WORKER NOTE
-----------------
If you run gunicorn with `--workers 4`, all 4 workers will call this on
startup. The migration itself is safe under concurrent execution (every
CREATE uses IF NOT EXISTS, every INSERT uses ON CONFLICT DO NOTHING, every
TRIGGER is guarded by a pg_trigger probe), so concurrent runs will not
corrupt anything. For real migration orchestration (serialised, versioned,
with a migration_log table), switch to Alembic or Flyway later.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def ensure_control_schema(db_service) -> None:
    """
    Create the `control.*` schema, tables, enums, functions, triggers and seed
    data if they don't already exist. Runs the full migration exactly once per
    database; subsequent calls are a no-op.

    The schema name is parameterised as `schema = "control"` so you can rename
    it in one place if you ever need to (e.g. `control_staging` for tests).

    Requirements on `db_service`:
      - `fetch_one(sql, params=None)` returning a dict (or None)
      - `execute_ddl(sql)` accepting a multi-statement SQL string.
        psycopg2's `cursor.execute` does this natively. If your db_service
        only exposes `execute_sql(sql, params=None)`, rename the call below
        (one line).
    """
    schema = "control"

    # ── Idempotency probe ─────────────────────────────────────────────
    # Pick `support_agents` as the migration marker — it is the very first
    # table the migration creates, so if it exists, the migration has either
    # fully run before or is mid-way through (in which case the SQL's own
    # IF NOT EXISTS / ON CONFLICT DO NOTHING clauses make a re-run safe).
    try:
        row = db_service.fetch_one(f"""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = '{schema}'
                  AND table_name   = 'support_agents'
            ) AS exists
        """)
        if row and row.get("exists"):
            logger.info(
                "ensure_control_schema: %s.support_agents already exists — "
                "skipping migration", schema
            )
            return
    except Exception as exc:
        logger.warning(
            "ensure_control_schema: probe failed (%s); attempting migration "
            "anyway", exc
        )

    # ── Full migration DDL ────────────────────────────────────────────
    # NOTE on the f-string: PL/pgSQL uses `$$ ... $$` delimiters (not braces)
    # for function bodies and anonymous DO blocks, so the only `{` `}` in
    # this string are the intended `{schema}` substitutions. No escaping
    # needed.
    sql = f"""
-- ============================================================
-- FinSage Control — Release 1 MVP Database Schema
-- Schema: {schema}  (separate from FinSage operational data)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS {schema};

-- ────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE {schema}.ticket_type AS ENUM (
        'support', 'bug', 'feature_request', 'access_issue',
        'billing', 'incident', 'training'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE {schema}.ticket_status AS ENUM (
        'new', 'triaged', 'assigned', 'in_progress',
        'waiting_customer', 'resolved', 'closed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE {schema}.priority_level AS ENUM (
        'p1_critical', 'p2_high', 'p3_medium', 'p4_low'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE {schema}.message_channel AS ENUM (
        'customer', 'internal'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE {schema}.agent_role AS ENUM (
        'admin', 'senior_agent', 'agent', 'viewer'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────
-- 1. SUPPORT AGENTS (Control users)
-- ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS {schema}.support_agents (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES public.users(id),
    display_name    VARCHAR(200) NOT NULL,
    role            {schema}.agent_role NOT NULL DEFAULT 'agent',
    team_id         INTEGER REFERENCES {schema}.teams(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    max_tickets     INTEGER DEFAULT 15,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- ────────────────────────────────────────────
-- 2. TEAMS
-- ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS {schema}.teams (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200) NOT NULL UNIQUE,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- 3. TICKET CATEGORIES
-- ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS {schema}.categories (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200) NOT NULL UNIQUE,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- 4. SLA DEFINITIONS
-- ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS {schema}.slas (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(200) NOT NULL UNIQUE,
    priority        {schema}.priority_level NOT NULL,
    response_minutes INTEGER NOT NULL DEFAULT 60,
    resolution_hours  INTEGER NOT NULL DEFAULT 24,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- 5. TICKETS (core table)
-- ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS {schema}.tickets (
    id                  SERIAL PRIMARY KEY,
    ticket_number       VARCHAR(50) NOT NULL UNIQUE,
    ticket_type         {schema}.ticket_type NOT NULL DEFAULT 'support',
    subject             VARCHAR(500) NOT NULL,
    description         TEXT NOT NULL,

    -- Customer context (READ from FinSage, not written)
    company_id          INTEGER,                  -- public.companies.id
    company_name        VARCHAR(500),             -- denormalised for speed
    user_id             INTEGER,                  -- public.users.id (who reported)
    user_email          VARCHAR(500),             -- denormalised
    user_name           VARCHAR(500),             -- denormalised
    product             VARCHAR(50) DEFAULT 'finsage',  -- 'finsage' | 'nexus'
    module_code         VARCHAR(100),             -- e.g. 'general_ledger'
    page_code           VARCHAR(200),             -- e.g. 'journal_entry'
    action_code         VARCHAR(100),             -- e.g. 'post'
    transaction_ref     VARCHAR(200),             -- e.g. 'JV-2026-00452'
    error_ref           VARCHAR(200),             -- e.g. 'ERR-91X72'
    app_version         VARCHAR(50),              -- e.g. '3.4.2'
    support_context     JSONB,                    -- full context snapshot

    -- Ticket management
    status              {schema}.ticket_status NOT NULL DEFAULT 'new',
    priority            {schema}.priority_level NOT NULL DEFAULT 'p3_medium',
    category_id         INTEGER REFERENCES {schema}.categories(id),
    assigned_agent_id   INTEGER REFERENCES {schema}.support_agents(id),
    sla_id              INTEGER REFERENCES {schema}.slas(id),

    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    triaged_at          TIMESTAMPTZ,
    assigned_at         TIMESTAMPTZ,
    first_response_at   TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ,
    closed_at           TIMESTAMPTZ,

    -- Meta
    created_by          INTEGER REFERENCES {schema}.support_agents(id),
    resolution_notes    TEXT,
    tags                TEXT[],
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tickets_status ON {schema}.tickets(status) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON {schema}.tickets(assigned_agent_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_tickets_company ON {schema}.tickets(company_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON {schema}.tickets(priority) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_tickets_created ON {schema}.tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_type ON {schema}.tickets(ticket_type) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_tickets_number ON {schema}.tickets(ticket_number);

-- ────────────────────────────────────────────
-- 6. TICKET MESSAGES (customer-visible)
-- ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS {schema}.ticket_messages (
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER NOT NULL REFERENCES {schema}.tickets(id) ON DELETE CASCADE,
    is_from_customer BOOLEAN NOT NULL DEFAULT TRUE,
    sender_name     VARCHAR(200) NOT NULL,
    sender_email    VARCHAR(500),
    body            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      INTEGER   -- NULL if customer, agent id if from support
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON {schema}.ticket_messages(ticket_id, created_at);

-- ────────────────────────────────────────────
-- 7. TICKET NOTES (internal only)
-- ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS {schema}.ticket_notes (
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER NOT NULL REFERENCES {schema}.tickets(id) ON DELETE CASCADE,
    agent_id        INTEGER NOT NULL REFERENCES {schema}.support_agents(id),
    body            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_notes_ticket ON {schema}.ticket_notes(ticket_id, created_at);

-- ────────────────────────────────────────────
-- 8. TICKET ATTACHMENTS
-- ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS {schema}.ticket_attachments (
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER NOT NULL REFERENCES {schema}.tickets(id) ON DELETE CASCADE,
    file_name       VARCHAR(500) NOT NULL,
    file_type       VARCHAR(100),
    file_size       INTEGER,
    file_url        TEXT NOT NULL,
    uploaded_by     INTEGER,              -- agent_id or NULL for customer
    is_internal     BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE = internal note attachment
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- 9. TICKET HISTORY (audit trail)
-- ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS {schema}.ticket_history (
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER NOT NULL REFERENCES {schema}.tickets(id) ON DELETE CASCADE,
    field           VARCHAR(100) NOT NULL,    -- e.g. 'status', 'assigned_agent_id', 'priority'
    old_value       TEXT,
    new_value       TEXT,
    changed_by      INTEGER NOT NULL REFERENCES {schema}.support_agents(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket ON {schema}.ticket_history(ticket_id, created_at);

-- ────────────────────────────────────────────
-- 10. TICKET-LINKS (incident linking, later)
-- ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS {schema}.ticket_links (
    id              SERIAL PRIMARY KEY,
    source_ticket_id   INTEGER NOT NULL REFERENCES {schema}.tickets(id),
    target_ticket_id   INTEGER NOT NULL REFERENCES {schema}.tickets(id),
    link_type       VARCHAR(50) NOT NULL DEFAULT 'related',  -- 'related', 'duplicate', 'incident'
    created_by      INTEGER REFERENCES {schema}.support_agents(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_ticket_id, target_ticket_id, link_type)
);

-- ────────────────────────────────────────────
-- 11. CUSTOMER SNAPSHOT (read model for fast loading)
-- ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS {schema}.customer_snapshot (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL,           -- public.companies.id
    company_name        VARCHAR(500) NOT NULL,
    product             VARCHAR(50) DEFAULT 'finsage',
    status              VARCHAR(50),                -- active/inactive
    account_type        VARCHAR(100),
    user_count          INTEGER DEFAULT 0,
    active_user_count   INTEGER DEFAULT 0,
    enabled_modules     JSONB DEFAULT '[]',
    last_login_at       TIMESTAMPTZ,
    last_transaction_at TIMESTAMPTZ,
    last_error_at       TIMESTAMPTZ,
    open_ticket_count   INTEGER DEFAULT 0,
    total_ticket_count  INTEGER DEFAULT 0,
    app_version         VARCHAR(50),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, product)
);

CREATE INDEX IF NOT EXISTS idx_customer_snapshot_name ON {schema}.customer_snapshot(company_name);
CREATE INDEX IF NOT EXISTS idx_customer_snapshot_product ON {schema}.customer_snapshot(product);

-- ────────────────────────────────────────────
-- 12. NOTIFICATION LOG (for customer comms tracking)
-- ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS {schema}.notification_log (
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER REFERENCES {schema}.tickets(id),
    company_id      INTEGER,
    channel         VARCHAR(50) NOT NULL,         -- 'email', 'in_app', 'sms'
    recipient       VARCHAR(500) NOT NULL,
    subject         VARCHAR(500),
    body            TEXT,
    status          VARCHAR(50) DEFAULT 'sent',   -- 'sent', 'failed', 'pending'
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- SEED DATA
-- ────────────────────────────────────────────

-- Default categories
INSERT INTO {schema}.categories (name, description, sort_order) VALUES
    ('General Ledger', 'GL, journals, chart of accounts, trial balance', 1),
    ('Accounts Payable', 'Vendor invoices, payments, age analysis', 2),
    ('Accounts Receivable', 'Customer invoices, receipts, statements', 3),
    ('Payroll', 'Employees, payroll runs, tax filings', 4),
    ('Fixed Assets', 'Asset register, depreciation', 5),
    ('IFRS 16 Leases', 'Lessee/Lessor lease accounting', 6),
    ('Revenue (IFRS 15)', 'Contracts, obligations, recognition', 7),
    ('IFRS 9 / IAS 12', 'Financial instruments, ECL, deferred tax', 8),
    ('Banking', 'Bank accounts, reconciliation, payments', 9),
    ('Reporting', 'Financial statements, disclosures', 10),
    ('User Access', 'Permissions, roles, login issues', 11),
    ('Billing', 'Subscriptions, payments, invoices', 12),
    ('Procurement', 'Purchase orders, requisitions, vendors (Nexus)', 13),
    ('Data Import/Export', 'CSV/Excel imports, data migration', 14),
    ('Other', 'Unclassified issues', 99)
ON CONFLICT (name) DO NOTHING;

-- Default SLAs
INSERT INTO {schema}.slas (name, priority, response_minutes, resolution_hours) VALUES
    ('P1 Critical', 'p1_critical', 15, 4),
    ('P2 High',     'p2_high',     60, 8),
    ('P3 Medium',   'p3_medium',   240, 24),
    ('P4 Low',      'p4_low',      1440, 72)
ON CONFLICT (name) DO NOTHING;

-- Default teams
INSERT INTO {schema}.teams (name, description) VALUES
    ('Support',       'Front-line customer support'),
    ('Engineering',   'Bug investigation and fixes'),
    ('Product',       'Feature requests and roadmap'),
    ('Billing',       'Subscription and payment issues')
ON CONFLICT (name) DO NOTHING;

-- Ticket number sequence
CREATE SEQUENCE IF NOT EXISTS {schema}.ticket_number_seq
    START WITH 1
    INCREMENT BY 1;

-- Function to generate ticket numbers: FS-2026-000001
CREATE OR REPLACE FUNCTION {schema}.generate_ticket_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    next_num INTEGER;
    year_part VARCHAR(4);
    num_part  VARCHAR(10);
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');
    next_num  := nextval('{schema}.ticket_number_seq');
    num_part  := LPAD(next_num::TEXT, 6, '0');
    RETURN 'FS-' || year_part || '-' || num_part;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────
-- GRANTS (adjust roles as needed)
-- ────────────────────────────────────────────

-- Read access to FinSage public schema for Control
GRANT USAGE ON SCHEMA public TO CURRENT_USER;
GRANT SELECT ON public.companies TO CURRENT_USER;
GRANT SELECT ON public.users TO CURRENT_USER;
GRANT SELECT ON public.company_users TO CURRENT_USER;
GRANT SELECT ON public.roles TO CURRENT_USER;
GRANT SELECT ON public.user_roles TO CURRENT_USER;

-- Full access on {schema} schema
GRANT ALL ON SCHEMA {schema} TO CURRENT_USER;
GRANT ALL ON ALL TABLES IN SCHEMA {schema} TO CURRENT_USER;
GRANT ALL ON ALL SEQUENCES IN SCHEMA {schema} TO CURRENT_USER;

-- ────────────────────────────────────────────
-- UPDATED_AT TRIGGER FUNCTION
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION {schema}.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- NOTE: PostgreSQL has no "CREATE TRIGGER IF NOT EXISTS".
-- Each trigger below is wrapped in a DO block that checks pg_trigger first,
-- so the whole migration is safely re-runnable.

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_tickets_updated'
          AND tgrelid = '{schema}.tickets'::regclass
    ) THEN
        CREATE TRIGGER trg_tickets_updated
            BEFORE UPDATE ON {schema}.tickets
            FOR EACH ROW EXECUTE FUNCTION {schema}.update_updated_at();
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_ticket_notes_updated'
          AND tgrelid = '{schema}.ticket_notes'::regclass
    ) THEN
        CREATE TRIGGER trg_ticket_notes_updated
            BEFORE UPDATE ON {schema}.ticket_notes
            FOR EACH ROW EXECUTE FUNCTION {schema}.update_updated_at();
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_customer_snapshot_updated'
          AND tgrelid = '{schema}.customer_snapshot'::regclass
    ) THEN
        CREATE TRIGGER trg_customer_snapshot_updated
            BEFORE UPDATE ON {schema}.customer_snapshot
            FOR EACH ROW EXECUTE FUNCTION {schema}.update_updated_at();
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_support_agents_updated'
          AND tgrelid = '{schema}.support_agents'::regclass
    ) THEN
        CREATE TRIGGER trg_support_agents_updated
            BEFORE UPDATE ON {schema}.support_agents
            FOR EACH ROW EXECUTE FUNCTION {schema}.update_updated_at();
    END IF;
END $$;
"""

    logger.info("ensure_control_schema: running migration for schema '%s'", schema)
    db_service.execute_ddl(sql)
    logger.info("ensure_control_schema: migration complete")
