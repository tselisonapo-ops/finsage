# BackEnd/Services/service_control/migrations.py
"""
FinSage Control — Database Schema Migrations

Control is a system-level application inside the main FinSage Flask app.

IMPORTANT:
- Control authentication is independent of public.users.
- Control users live in control.control_users.
- Control does not automatically create users during login.
- Operational FinSage/Nexus tables are READ-ONLY to Control.
- Control writes only to control.*.
- Migrations are versioned through control.schema_migrations.
"""

from __future__ import annotations

from typing import Any


CONTROL_SCHEMA = "control"


# ============================================================
# PUBLIC ENTRY POINT
# ============================================================

def ensure_control_schema(db_service) -> None:
    """
    Apply all pending Control migrations.

    Safe to call at application startup.

    Unlike the old implementation, this does NOT use the existence
    of a single table as proof that the entire schema is current.
    """

    _ensure_schema_migrations_table(db_service)

    applied = {
        row["version"]
        for row in db_service.fetch_all(
            """
            SELECT version
            FROM control.schema_migrations
            """
        )
    }

    migrations = [
        ("001_initial_control_schema", _migration_001_initial_control_schema),
    ]

    for version, migration_fn in migrations:
        if version in applied:
            continue

        migration_fn(db_service)

        db_service.execute_sql(
            """
            INSERT INTO control.schema_migrations
                (version, applied_at)
            VALUES
                (%s, NOW())
            ON CONFLICT (version) DO NOTHING
            """,
            (version,),
        )


# ============================================================
# MIGRATION TRACKING
# ============================================================

def _ensure_schema_migrations_table(db_service) -> None:
    db_service.execute_sql(
        """
        CREATE SCHEMA IF NOT EXISTS control;

        CREATE TABLE IF NOT EXISTS control.schema_migrations (
            id          SERIAL PRIMARY KEY,
            version     VARCHAR(150) NOT NULL UNIQUE,
            applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )


# ============================================================
# 001 — INITIAL CONTROL SCHEMA
# ============================================================

def _migration_001_initial_control_schema(db_service) -> None:
    """
    Initial Control schema.

    This creates the complete foundation for:
      - Control authentication
      - Control RBAC
      - support teams
      - tickets
      - ticket messages
      - internal notes
      - ticket history
      - customer snapshots
      - notifications
      - system events
      - system checks
      - subscription monitoring
      - Control audit logging
    """

    sql = """
    -- ========================================================
    -- SCHEMA
    -- ========================================================

    CREATE SCHEMA IF NOT EXISTS control;


    -- ========================================================
    -- ENUM TYPES
    -- PostgreSQL 9.6 compatible
    -- ========================================================

    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = 'ticket_type'
              AND n.nspname = 'control'
        ) THEN
            CREATE TYPE control.ticket_type AS ENUM (
                'support',
                'system_error',
                'bug',
                'feature_request',
                'billing',
                'account',
                'security',
                'data_issue',
                'other'
            );
        END IF;
    END
    $$;


    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = 'ticket_status'
              AND n.nspname = 'control'
        ) THEN
            CREATE TYPE control.ticket_status AS ENUM (
                'new',
                'triaged',
                'assigned',
                'in_progress',
                'waiting_customer',
                'resolved',
                'closed'
            );
        END IF;
    END
    $$;


    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = 'priority_level'
              AND n.nspname = 'control'
        ) THEN
            CREATE TYPE control.priority_level AS ENUM (
                'p1_critical',
                'p2_high',
                'p3_medium',
                'p4_low'
            );
        END IF;
    END
    $$;


    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = 'message_channel'
              AND n.nspname = 'control'
        ) THEN
            CREATE TYPE control.message_channel AS ENUM (
                'portal',
                'email',
                'system',
                'phone',
                'other'
            );
        END IF;
    END
    $$;


    -- ========================================================
    -- CONTROL USERS
    --
    -- Completely independent from public.users.
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.control_users (
        id                  SERIAL PRIMARY KEY,

        email               VARCHAR(320) NOT NULL UNIQUE,
        password_hash       TEXT NOT NULL,

        display_name        VARCHAR(200) NOT NULL,

        role                VARCHAR(50) NOT NULL DEFAULT 'agent',

        team_id             INTEGER,

        max_tickets         INTEGER NOT NULL DEFAULT 15,

        is_active            BOOLEAN NOT NULL DEFAULT TRUE,

        last_login_at       TIMESTAMPTZ,

        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    -- ========================================================
    -- TEAMS
    -- Created BEFORE control_users.team_id FK.
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.teams (
        id              SERIAL PRIMARY KEY,

        name            VARCHAR(150) NOT NULL UNIQUE,
        description     TEXT,

        is_active       BOOLEAN NOT NULL DEFAULT TRUE,

        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'control_users_team_id_fkey'
        ) THEN
            ALTER TABLE control.control_users
                ADD CONSTRAINT control_users_team_id_fkey
                FOREIGN KEY (team_id)
                REFERENCES control.teams(id)
                ON DELETE SET NULL;
        END IF;
    END
    $$;


    -- ========================================================
    -- RBAC
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.roles (
        id              SERIAL PRIMARY KEY,

        code            VARCHAR(80) NOT NULL UNIQUE,
        name            VARCHAR(150) NOT NULL,
        description     TEXT,

        is_system_role  BOOLEAN NOT NULL DEFAULT TRUE,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,

        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    CREATE TABLE IF NOT EXISTS control.permissions (
        id              SERIAL PRIMARY KEY,

        code            VARCHAR(120) NOT NULL UNIQUE,
        name            VARCHAR(200) NOT NULL,
        description     TEXT,

        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    CREATE TABLE IF NOT EXISTS control.user_roles (
        control_user_id INTEGER NOT NULL
            REFERENCES control.control_users(id)
            ON DELETE CASCADE,

        role_id         INTEGER NOT NULL
            REFERENCES control.roles(id)
            ON DELETE CASCADE,

        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        PRIMARY KEY (control_user_id, role_id)
    );


    CREATE TABLE IF NOT EXISTS control.role_permissions (
        role_id         INTEGER NOT NULL
            REFERENCES control.roles(id)
            ON DELETE CASCADE,

        permission_id   INTEGER NOT NULL
            REFERENCES control.permissions(id)
            ON DELETE CASCADE,

        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        PRIMARY KEY (role_id, permission_id)
    );


    -- ========================================================
    -- TICKET CATEGORIES
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.categories (
        id              SERIAL PRIMARY KEY,

        name            VARCHAR(150) NOT NULL UNIQUE,
        description     TEXT,

        sort_order      INTEGER NOT NULL DEFAULT 0,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,

        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    -- ========================================================
    -- SLA DEFINITIONS
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.slas (
        id                  SERIAL PRIMARY KEY,

        name                VARCHAR(150) NOT NULL,
        priority            control.priority_level NOT NULL UNIQUE,

        response_minutes    INTEGER NOT NULL DEFAULT 240,
        resolution_hours    INTEGER NOT NULL DEFAULT 48,

        is_active           BOOLEAN NOT NULL DEFAULT TRUE,

        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    -- ========================================================
    -- TICKETS
    -- ========================================================

    CREATE SEQUENCE IF NOT EXISTS control.ticket_number_seq
        START WITH 1
        INCREMENT BY 1
        MINVALUE 1;


    CREATE TABLE IF NOT EXISTS control.tickets (
        id                  SERIAL PRIMARY KEY,

        ticket_number       VARCHAR(50) NOT NULL UNIQUE,

        ticket_type         control.ticket_type NOT NULL DEFAULT 'support',

        subject             VARCHAR(500) NOT NULL,
        description         TEXT NOT NULL,

        status              control.ticket_status NOT NULL DEFAULT 'new',
        priority            control.priority_level NOT NULL DEFAULT 'p3_medium',

        -- FinSage company context
        company_id          INTEGER,
        company_name        VARCHAR(300),

        -- FinSage user context.
        -- These are references for context only; there is deliberately
        -- NO foreign key into public.users.
        user_id             INTEGER,
        user_email          VARCHAR(320),
        user_name           VARCHAR(250),

        product             VARCHAR(100) NOT NULL DEFAULT 'finsage',
        module_code         VARCHAR(150),
        page_code           VARCHAR(150),
        action_code         VARCHAR(150),

        transaction_ref     VARCHAR(250),
        error_ref           VARCHAR(250),
        app_version         VARCHAR(100),

        support_context     JSONB,
        tags                JSONB,

        category_id         INTEGER
            REFERENCES control.categories(id)
            ON DELETE SET NULL,

        sla_id              INTEGER
            REFERENCES control.slas(id)
            ON DELETE SET NULL,

        -- Control user IDs
        assigned_agent_id   INTEGER
            REFERENCES control.control_users(id)
            ON DELETE SET NULL,

        created_by          INTEGER
            REFERENCES control.control_users(id)
            ON DELETE SET NULL,

        resolution_notes    TEXT,

        is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,

        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        triaged_at          TIMESTAMPTZ,
        assigned_at         TIMESTAMPTZ,
        first_response_at   TIMESTAMPTZ,
        resolved_at         TIMESTAMPTZ,
        closed_at           TIMESTAMPTZ
    );


    -- ========================================================
    -- TICKET MESSAGES
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.ticket_messages (
        id                  SERIAL PRIMARY KEY,

        ticket_id           INTEGER NOT NULL
            REFERENCES control.tickets(id)
            ON DELETE CASCADE,

        is_from_customer    BOOLEAN NOT NULL DEFAULT FALSE,

        sender_name         VARCHAR(250) NOT NULL,
        sender_email        VARCHAR(320),

        body                TEXT NOT NULL,

        channel             control.message_channel NOT NULL DEFAULT 'portal',

        created_by          INTEGER
            REFERENCES control.control_users(id)
            ON DELETE SET NULL,

        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    -- ========================================================
    -- INTERNAL TICKET NOTES
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.ticket_notes (
        id                  SERIAL PRIMARY KEY,

        ticket_id           INTEGER NOT NULL
            REFERENCES control.tickets(id)
            ON DELETE CASCADE,

        agent_id            INTEGER NOT NULL
            REFERENCES control.control_users(id)
            ON DELETE RESTRICT,

        body                TEXT NOT NULL,

        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    -- ========================================================
    -- TICKET HISTORY
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.ticket_history (
        id                  SERIAL PRIMARY KEY,

        ticket_id           INTEGER NOT NULL
            REFERENCES control.tickets(id)
            ON DELETE CASCADE,

        field               VARCHAR(150) NOT NULL,

        old_value           TEXT,
        new_value           TEXT,

        changed_by          INTEGER
            REFERENCES control.control_users(id)
            ON DELETE SET NULL,

        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    -- ========================================================
    -- TICKET ATTACHMENTS
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.ticket_attachments (
        id                  SERIAL PRIMARY KEY,

        ticket_id           INTEGER NOT NULL
            REFERENCES control.tickets(id)
            ON DELETE CASCADE,

        file_name           VARCHAR(500) NOT NULL,
        file_path           TEXT,
        mime_type           VARCHAR(200),
        file_size           BIGINT,

        uploaded_by         INTEGER
            REFERENCES control.control_users(id)
            ON DELETE SET NULL,

        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    -- ========================================================
    -- TICKET LINKS
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.ticket_links (
        id                  SERIAL PRIMARY KEY,

        ticket_id           INTEGER NOT NULL
            REFERENCES control.tickets(id)
            ON DELETE CASCADE,

        linked_ticket_id    INTEGER
            REFERENCES control.tickets(id)
            ON DELETE CASCADE,

        relationship        VARCHAR(80) NOT NULL DEFAULT 'related',

        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        UNIQUE(ticket_id, linked_ticket_id, relationship)
    );


    -- ========================================================
    -- CUSTOMER SNAPSHOT
    --
    -- Control can maintain an operational snapshot without modifying
    -- FinSage operational tables.
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.customer_snapshot (
        id                  SERIAL PRIMARY KEY,

        company_id          INTEGER NOT NULL,
        product             VARCHAR(100) NOT NULL DEFAULT 'finsage',

        enabled_modules     JSONB,
        app_version         VARCHAR(100),

        last_login_at       TIMESTAMPTZ,
        last_transaction_at TIMESTAMPTZ,
        last_error_at       TIMESTAMPTZ,

        open_ticket_count   INTEGER NOT NULL DEFAULT 0,
        total_ticket_count  INTEGER NOT NULL DEFAULT 0,

        subscription_status VARCHAR(80),
        subscription_plan   VARCHAR(150),
        subscription_end    DATE,

        snapshot_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        UNIQUE(company_id, product)
    );


    -- ========================================================
    -- NOTIFICATION LOG
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.notification_log (
        id                  SERIAL PRIMARY KEY,

        ticket_id           INTEGER
            REFERENCES control.tickets(id)
            ON DELETE SET NULL,

        recipient_email     VARCHAR(320),
        channel             VARCHAR(50) NOT NULL DEFAULT 'email',

        subject             TEXT,
        status              VARCHAR(50) NOT NULL DEFAULT 'pending',

        provider_message_id VARCHAR(300),
        error_message       TEXT,

        sent_at             TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- ============================================================
    -- PHASE 8 — NOTIFICATIONS
    -- ============================================================

    CREATE TABLE IF NOT EXISTS control.notifications (
        id                          BIGSERIAL PRIMARY KEY,

        notification_type          VARCHAR(100) NOT NULL,
        title                       TEXT NOT NULL,
        message                     TEXT NOT NULL,

        severity                    VARCHAR(30) NOT NULL DEFAULT 'info',

        control_user_id             INTEGER NULL,

        ticket_id                   INTEGER NULL
            REFERENCES control.tickets(id)
            ON DELETE SET NULL,

        system_event_id             INTEGER NULL
            REFERENCES control.system_events(id)
            ON DELETE SET NULL,

        company_id                  INTEGER NULL,

        metadata                    JSONB NOT NULL DEFAULT '{}'::JSONB,

        is_read                     BOOLEAN NOT NULL DEFAULT FALSE,
        read_at                     TIMESTAMPTZ NULL,

        created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_control_notifications_user
        ON control.notifications(control_user_id);

    CREATE INDEX IF NOT EXISTS idx_control_notifications_unread
        ON control.notifications(control_user_id, is_read);

    CREATE INDEX IF NOT EXISTS idx_control_notifications_created
        ON control.notifications(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_control_notifications_type
        ON control.notifications(notification_type);

    CREATE INDEX IF NOT EXISTS idx_control_notifications_ticket
        ON control.notifications(ticket_id);

    CREATE INDEX IF NOT EXISTS idx_control_notifications_system_event
        ON control.notifications(system_event_id);


    CREATE TABLE IF NOT EXISTS control.notification_preferences (
        id                          BIGSERIAL PRIMARY KEY,

        control_user_id             INTEGER NOT NULL,

        email_enabled               BOOLEAN NOT NULL DEFAULT TRUE,
        in_app_enabled              BOOLEAN NOT NULL DEFAULT TRUE,

        system_health_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
        ticket_enabled              BOOLEAN NOT NULL DEFAULT TRUE,
        subscription_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
        security_enabled            BOOLEAN NOT NULL DEFAULT TRUE,

        created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT uq_control_notification_preferences_user
            UNIQUE (control_user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_control_notification_preferences_user
        ON control.notification_preferences(control_user_id);

    -- ========================================================
    -- SYSTEM EVENTS
    --
    -- Receives application/system failures and important events.
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.system_events (
        id                  BIGSERIAL PRIMARY KEY,

        event_code          VARCHAR(200) NOT NULL,

        severity            control.priority_level
                            NOT NULL DEFAULT 'p3_medium',

        status              VARCHAR(50)
                            NOT NULL DEFAULT 'open',

        source              VARCHAR(150),
        product             VARCHAR(100)
                            NOT NULL DEFAULT 'finsage',

        module_code         VARCHAR(150),
        page_code           VARCHAR(150),
        action_code         VARCHAR(150),

        company_id          INTEGER,
        company_name        VARCHAR(300),

        user_id             INTEGER,
        user_email          VARCHAR(320),

        error_ref           VARCHAR(250),
        transaction_ref     VARCHAR(250),

        message             TEXT,
        exception_type      VARCHAR(300),
        stack_trace         TEXT,

        context             JSONB,

        occurrence_count    INTEGER NOT NULL DEFAULT 1,

        first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        resolved_at         TIMESTAMPTZ,

        ticket_id           INTEGER
            REFERENCES control.tickets(id)
            ON DELETE SET NULL,

        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    -- ========================================================
    -- EVENT OCCURRENCES
    --
    -- Stores individual occurrences without forcing every occurrence
    -- to become its own ticket.
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.event_occurrences (
        id                  BIGSERIAL PRIMARY KEY,

        event_id            BIGINT NOT NULL
            REFERENCES control.system_events(id)
            ON DELETE CASCADE,

        occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        company_id          INTEGER,

        request_path        TEXT,
        http_method         VARCHAR(20),
        http_status         INTEGER,

        error_message       TEXT,

        context             JSONB
    );


    -- ========================================================
    -- SYSTEM CHECK DEFINITIONS
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.system_checks (
        id                  SERIAL PRIMARY KEY,

        code                VARCHAR(150) NOT NULL UNIQUE,
        name                VARCHAR(250) NOT NULL,
        description         TEXT,

        check_type          VARCHAR(80) NOT NULL DEFAULT 'system',

        interval_minutes    INTEGER NOT NULL DEFAULT 60,

        is_active           BOOLEAN NOT NULL DEFAULT TRUE,

        creates_ticket      BOOLEAN NOT NULL DEFAULT FALSE,

        priority            control.priority_level
                            NOT NULL DEFAULT 'p3_medium',

        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    -- ========================================================
    -- SYSTEM CHECK RUNS
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.system_check_runs (
        id                  BIGSERIAL PRIMARY KEY,

        check_id            INTEGER NOT NULL
            REFERENCES control.system_checks(id)
            ON DELETE CASCADE,

        status              VARCHAR(50) NOT NULL,

        result_summary      TEXT,
        result_data         JSONB,

        started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at        TIMESTAMPTZ,

        duration_ms         INTEGER,

        error_message       TEXT,

        ticket_id           INTEGER
            REFERENCES control.tickets(id)
            ON DELETE SET NULL
    );


    -- ========================================================
    -- SUBSCRIPTION SNAPSHOT
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.subscription_snapshot (
        id                  BIGSERIAL PRIMARY KEY,

        company_id          INTEGER NOT NULL UNIQUE,
        company_name        VARCHAR(300),

        subscription_status VARCHAR(80),
        plan_code           VARCHAR(100),
        plan_name           VARCHAR(200),

        trial_start_date    DATE,
        trial_end_date      DATE,

        subscription_start  DATE,
        subscription_end    DATE,

        is_active            BOOLEAN NOT NULL DEFAULT TRUE,

        amount               NUMERIC(18,2),
        currency             VARCHAR(10),

        last_payment_at      TIMESTAMPTZ,

        snapshot_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        metadata             JSONB
    );


    -- ========================================================
    -- CONTROL AUDIT LOG
    -- ========================================================

    CREATE TABLE IF NOT EXISTS control.audit_log (
        id                  BIGSERIAL PRIMARY KEY,

        control_user_id     INTEGER
            REFERENCES control.control_users(id)
            ON DELETE SET NULL,

        action               VARCHAR(150) NOT NULL,

        entity_type          VARCHAR(100),
        entity_id            BIGINT,

        description          TEXT,

        ip_address           INET,
        user_agent           TEXT,

        before_data          JSONB,
        after_data           JSONB,
        metadata             JSONB,

        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    -- ========================================================
    -- INDEXES
    -- ========================================================

    CREATE INDEX IF NOT EXISTS idx_control_users_active
        ON control.control_users(is_active);

    CREATE INDEX IF NOT EXISTS idx_control_users_team
        ON control.control_users(team_id);

    CREATE INDEX IF NOT EXISTS idx_control_user_roles_user
        ON control.user_roles(control_user_id);

    CREATE INDEX IF NOT EXISTS idx_control_role_permissions_role
        ON control.role_permissions(role_id);

    CREATE INDEX IF NOT EXISTS idx_control_tickets_status
        ON control.tickets(status);

    CREATE INDEX IF NOT EXISTS idx_control_tickets_priority
        ON control.tickets(priority);

    CREATE INDEX IF NOT EXISTS idx_control_tickets_company
        ON control.tickets(company_id);

    CREATE INDEX IF NOT EXISTS idx_control_tickets_assigned_agent
        ON control.tickets(assigned_agent_id);

    CREATE INDEX IF NOT EXISTS idx_control_tickets_created_at
        ON control.tickets(created_at);

    CREATE INDEX IF NOT EXISTS idx_control_ticket_messages_ticket
        ON control.ticket_messages(ticket_id);

    CREATE INDEX IF NOT EXISTS idx_control_ticket_notes_ticket
        ON control.ticket_notes(ticket_id);

    CREATE INDEX IF NOT EXISTS idx_control_ticket_history_ticket
        ON control.ticket_history(ticket_id);

    CREATE INDEX IF NOT EXISTS idx_control_system_events_code
        ON control.system_events(event_code);

    CREATE INDEX IF NOT EXISTS idx_control_system_events_company
        ON control.system_events(company_id);

    CREATE INDEX IF NOT EXISTS idx_control_system_events_last_seen
        ON control.system_events(last_seen_at);

    CREATE INDEX IF NOT EXISTS idx_control_event_occurrences_event
        ON control.event_occurrences(event_id);

    CREATE INDEX IF NOT EXISTS idx_control_check_runs_check
        ON control.system_check_runs(check_id);

    CREATE INDEX IF NOT EXISTS idx_control_check_runs_started
        ON control.system_check_runs(started_at);

    CREATE INDEX IF NOT EXISTS idx_control_audit_log_user
        ON control.audit_log(control_user_id);

    CREATE INDEX IF NOT EXISTS idx_control_audit_log_created
        ON control.audit_log(created_at);

    -- ============================================================
    -- PHASE 9 — AUDIT TRAIL INDEXES
    -- ============================================================

    CREATE INDEX IF NOT EXISTS idx_control_audit_log_action
        ON control.audit_log(action);

    CREATE INDEX IF NOT EXISTS idx_control_audit_log_entity
        ON control.audit_log(entity_type, entity_id);

    CREATE INDEX IF NOT EXISTS idx_control_audit_log_user_created
        ON control.audit_log(control_user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_control_audit_log_created_desc
        ON control.audit_log(created_at DESC);

    -- ========================================================
    -- TICKET NUMBER FUNCTION
    -- ========================================================

    CREATE OR REPLACE FUNCTION control.generate_ticket_number()
    RETURNS TEXT
    LANGUAGE plpgsql
    AS $func$
    DECLARE
        next_number BIGINT;
    BEGIN
        next_number := nextval('control.ticket_number_seq');

        RETURN 'FS-' ||
               TO_CHAR(CURRENT_DATE, 'YYYY') ||
               '-' ||
               LPAD(next_number::TEXT, 6, '0');
    END;
    $func$;


    -- ========================================================
    -- UPDATED_AT FUNCTION
    -- ========================================================

    CREATE OR REPLACE FUNCTION control.set_updated_at()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $func$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $func$;


    -- ========================================================
    -- UPDATED_AT TRIGGERS
    -- ========================================================

    DROP TRIGGER IF EXISTS trg_control_users_updated_at
        ON control.control_users;

    CREATE TRIGGER trg_control_users_updated_at
    BEFORE UPDATE ON control.control_users
    FOR EACH ROW
    EXECUTE PROCEDURE control.set_updated_at();


    DROP TRIGGER IF EXISTS trg_control_teams_updated_at
        ON control.teams;

    CREATE TRIGGER trg_control_teams_updated_at
    BEFORE UPDATE ON control.teams
    FOR EACH ROW
    EXECUTE PROCEDURE control.set_updated_at();


    DROP TRIGGER IF EXISTS trg_control_categories_updated_at
        ON control.categories;

    CREATE TRIGGER trg_control_categories_updated_at
    BEFORE UPDATE ON control.categories
    FOR EACH ROW
    EXECUTE PROCEDURE control.set_updated_at();


    DROP TRIGGER IF EXISTS trg_control_slas_updated_at
        ON control.slas;

    CREATE TRIGGER trg_control_slas_updated_at
    BEFORE UPDATE ON control.slas
    FOR EACH ROW
    EXECUTE PROCEDURE control.set_updated_at();


    DROP TRIGGER IF EXISTS trg_control_tickets_updated_at
        ON control.tickets;

    CREATE TRIGGER trg_control_tickets_updated_at
    BEFORE UPDATE ON control.tickets
    FOR EACH ROW
    EXECUTE PROCEDURE control.set_updated_at();


    DROP TRIGGER IF EXISTS trg_control_ticket_notes_updated_at
        ON control.ticket_notes;

    CREATE TRIGGER trg_control_ticket_notes_updated_at
    BEFORE UPDATE ON control.ticket_notes
    FOR EACH ROW
    EXECUTE PROCEDURE control.set_updated_at();


    DROP TRIGGER IF EXISTS trg_control_system_checks_updated_at
        ON control.system_checks;

    CREATE TRIGGER trg_control_system_checks_updated_at
    BEFORE UPDATE ON control.system_checks
    FOR EACH ROW
    EXECUTE PROCEDURE control.set_updated_at();


    -- ========================================================
    -- SEED TEAMS
    -- ========================================================

    INSERT INTO control.teams
        (name, description)
    VALUES
        ('Support', 'General FinSage customer support'),
        ('Technical', 'Technical and application support'),
        ('Finance', 'Accounting and finance support'),
        ('Management', 'Control management and escalation')
    ON CONFLICT (name) DO NOTHING;


    -- ========================================================
    -- SEED ROLES
    -- ========================================================

    INSERT INTO control.roles
        (code, name, description, is_system_role)
    VALUES
        (
            'admin',
            'Administrator',
            'Full Control system access',
            TRUE
        ),
        (
            'manager',
            'Manager',
            'Manage tickets, agents, teams and support operations',
            TRUE
        ),
        (
            'agent',
            'Agent',
            'Work and resolve support tickets',
            TRUE
        ),
        (
            'viewer',
            'Viewer',
            'Read-only Control access',
            TRUE
        )
    ON CONFLICT (code) DO NOTHING;


    -- ========================================================
    -- SEED PERMISSIONS
    -- ========================================================

    INSERT INTO control.permissions
        (code, name, description)
    VALUES
        ('dashboard.view', 'View Dashboard', 'View Control dashboard'),
        ('tickets.view', 'View Tickets', 'View support tickets'),
        ('tickets.create', 'Create Tickets', 'Create support tickets'),
        ('tickets.edit', 'Edit Tickets', 'Edit support tickets'),
        ('tickets.delete', 'Delete Tickets', 'Soft-delete tickets'),
        ('tickets.assign', 'Assign Tickets', 'Assign tickets to Control users'),
        ('tickets.resolve', 'Resolve Tickets', 'Resolve support tickets'),
        ('tickets.notes', 'Ticket Notes', 'Create and manage internal notes'),
        ('customers.view', 'View Customers', 'View customer/company information'),
        ('agents.view', 'View Agents', 'View Control users'),
        ('agents.manage', 'Manage Agents', 'Create and manage Control users'),
        ('teams.view', 'View Teams', 'View support teams'),
        ('teams.manage', 'Manage Teams', 'Create and manage support teams'),
        ('categories.manage', 'Manage Categories', 'Manage ticket categories'),
        ('sla.view', 'View SLAs', 'View SLA configuration'),
        ('sla.manage', 'Manage SLAs', 'Manage SLA configuration'),
        ('settings.view', 'View Settings', 'View Control settings'),
        ('settings.manage', 'Manage Settings', 'Manage Control settings'),
        ('system_events.view', 'View System Events', 'View application system events'),
        ('system_checks.view', 'View System Checks', 'View system health checks'),
        ('system_checks.run', 'Run System Checks', 'Run system health checks'),
        ('audit.view', 'View Audit Log', 'View Control audit history')
    ON CONFLICT (code) DO NOTHING;


    -- ========================================================
    -- ROLE → PERMISSIONS
    -- ========================================================

    INSERT INTO control.role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM control.roles r
    CROSS JOIN control.permissions p
    WHERE r.code = 'admin'
    ON CONFLICT DO NOTHING;


    INSERT INTO control.role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM control.roles r
    JOIN control.permissions p
      ON p.code IN (
          'dashboard.view',
          'tickets.view',
          'tickets.create',
          'tickets.edit',
          'tickets.assign',
          'tickets.resolve',
          'tickets.notes',
          'customers.view',
          'agents.view',
          'agents.manage',
          'teams.view',
          'teams.manage',
          'categories.manage',
          'sla.view',
          'sla.manage',
          'settings.view',
          'system_events.view',
          'system_checks.view',
          'system_checks.run',
          'audit.view'
      )
    WHERE r.code = 'manager'
    ON CONFLICT DO NOTHING;


    INSERT INTO control.role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM control.roles r
    JOIN control.permissions p
      ON p.code IN (
          'dashboard.view',
          'tickets.view',
          'tickets.create',
          'tickets.edit',
          'tickets.resolve',
          'tickets.notes',
          'customers.view',
          'agents.view',
          'teams.view',
          'sla.view',
          'system_events.view',
          'system_checks.view'
      )
    WHERE r.code = 'agent'
    ON CONFLICT DO NOTHING;


    INSERT INTO control.role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM control.roles r
    JOIN control.permissions p
      ON p.code IN (
          'dashboard.view',
          'tickets.view',
          'customers.view',
          'agents.view',
          'teams.view',
          'sla.view',
          'system_events.view',
          'system_checks.view'
      )
    WHERE r.code = 'viewer'
    ON CONFLICT DO NOTHING;


    -- ========================================================
    -- DEFAULT SLAs
    -- ========================================================

    INSERT INTO control.slas
        (name, priority, response_minutes, resolution_hours)
    VALUES
        ('Critical', 'p1_critical', 15, 4),
        ('High', 'p2_high', 60, 12),
        ('Medium', 'p3_medium', 240, 48),
        ('Low', 'p4_low', 480, 120)
    ON CONFLICT (priority) DO NOTHING;


    -- ========================================================
    -- DEFAULT CATEGORIES
    -- ========================================================

    INSERT INTO control.categories
        (name, description, sort_order)
    VALUES
        ('Application Error', 'Errors generated by the FinSage application', 10),
        ('Accounting', 'Accounting and financial reporting issues', 20),
        ('Payroll', 'Payroll and statutory processing issues', 30),
        ('Inventory', 'Inventory and stock-related issues', 40),
        ('Fixed Assets', 'IAS 16, IAS 40 and IAS 38 issues', 50),
        ('Leases', 'IFRS 16 lease issues', 60),
        ('Tax', 'Tax and statutory issues', 70),
        ('User Account', 'User authentication and account issues', 80),
        ('Subscription', 'Subscription and billing issues', 90),
        ('Data Issue', 'Data integrity or migration issues', 100),
        ('Other', 'Other support matters', 999)
    ON CONFLICT (name) DO NOTHING;


    -- ========================================================
    -- DEFAULT SYSTEM CHECKS
    -- ========================================================

    INSERT INTO control.system_checks
        (code, name, description, check_type, interval_minutes, creates_ticket, priority)
    VALUES
        (
            'database_connectivity',
            'Database Connectivity',
            'Verify that the FinSage database is reachable',
            'database',
            5,
            TRUE,
            'p1_critical'
        ),
        (
            'company_count',
            'Company Count',
            'Monitor the number of active FinSage companies',
            'companies',
            60,
            FALSE,
            'p3_medium'
        ),
        (
            'subscription_status',
            'Subscription Status',
            'Monitor active, trial and expired subscriptions',
            'subscriptions',
            60,
            FALSE,
            'p2_high'
        ),
        (
            'recent_system_errors',
            'Recent System Errors',
            'Check for recurring application errors',
            'system_events',
            15,
            TRUE,
            'p2_high'
        )
    ON CONFLICT (code) DO NOTHING;


    -- ========================================================
    -- CONTROL READ ACCESS TO OPERATIONAL DATA
    --
    -- These are intentionally SELECT-only.
    -- ========================================================

    GRANT USAGE ON SCHEMA public TO CURRENT_USER;

    GRANT SELECT ON
        public.companies,
        public.users,
        public.company_users
    TO CURRENT_USER;


    -- ========================================================
    -- CONTROL SCHEMA PRIVILEGES
    -- ========================================================

    GRANT USAGE ON SCHEMA control TO CURRENT_USER;

    GRANT SELECT, INSERT, UPDATE, DELETE
    ON ALL TABLES IN SCHEMA control
    TO CURRENT_USER;

    GRANT USAGE, SELECT
    ON ALL SEQUENCES IN SCHEMA control
    TO CURRENT_USER;


    -- ========================================================
    -- FUTURE DEFAULT PRIVILEGES
    -- ========================================================

    ALTER DEFAULT PRIVILEGES IN SCHEMA control
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO CURRENT_USER;

    ALTER DEFAULT PRIVILEGES IN SCHEMA control
        GRANT USAGE, SELECT ON SEQUENCES TO CURRENT_USER;

    CREATE TABLE IF NOT EXISTS control.slas (
        id                  SERIAL PRIMARY KEY,
        name                VARCHAR(150) NOT NULL,
        priority            control.priority_level NOT NULL,
        first_response_minutes INTEGER NOT NULL DEFAULT 60,
        resolution_minutes    INTEGER NOT NULL DEFAULT 1440,
        escalation_minutes    INTEGER NOT NULL DEFAULT 30,
        warning_minutes       INTEGER NOT NULL DEFAULT 30,
        is_active             BOOLEAN NOT NULL DEFAULT TRUE,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_control_slas_priority_active
        ON control.slas(priority)
        WHERE is_active = TRUE;


    CREATE TABLE IF NOT EXISTS control.automation_jobs (
        id                  SERIAL PRIMARY KEY,
        job_code            VARCHAR(100) NOT NULL UNIQUE,
        name                VARCHAR(150) NOT NULL,
        description         TEXT,
        interval_minutes   INTEGER NOT NULL DEFAULT 5,
        is_active            BOOLEAN NOT NULL DEFAULT TRUE,
        last_run_at         TIMESTAMPTZ,
        next_run_at         TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );


    CREATE TABLE IF NOT EXISTS control.automation_runs (
        id                  BIGSERIAL PRIMARY KEY,
        job_id              INTEGER REFERENCES control.automation_jobs(id)
                            ON DELETE SET NULL,
        status              VARCHAR(30) NOT NULL DEFAULT 'running',
        started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at        TIMESTAMPTZ,
        duration_ms         INTEGER,
        result_data         JSONB NOT NULL DEFAULT '{}'::JSONB,
        error_message       TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_control_automation_runs_job
        ON control.automation_runs(job_id);

    CREATE INDEX IF NOT EXISTS idx_control_automation_runs_started
        ON control.automation_runs(started_at DESC);


    CREATE TABLE IF NOT EXISTS control.ticket_escalations (
        id                  BIGSERIAL PRIMARY KEY,
        ticket_id           INTEGER NOT NULL
                            REFERENCES control.tickets(id)
                            ON DELETE CASCADE,
        escalation_level    INTEGER NOT NULL DEFAULT 1,
        reason              VARCHAR(100) NOT NULL,
        previous_agent_id   INTEGER
                            REFERENCES control.control_users(id)
                            ON DELETE SET NULL,
        new_agent_id        INTEGER
                            REFERENCES control.control_users(id)
                            ON DELETE SET NULL,
        previous_priority   control.priority_level,
        new_priority        control.priority_level,
        notes               TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_control_ticket_escalations_ticket
        ON control.ticket_escalations(ticket_id);

    CREATE INDEX IF NOT EXISTS idx_control_ticket_escalations_created
        ON control.ticket_escalations(created_at DESC);
    """

    db_service.execute_sql(sql)