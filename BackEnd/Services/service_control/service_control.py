# FinSage Control — Database Service Layer
"""
All database operations for the Control module.
Reads from FinSage/Nexus operational tables (READ-ONLY).
Writes only to the control.* schema.

Control identity:
  - control.control_users is the source of truth for Control users.
  - Control users are NOT public.users.
  - Control users are NOT auto-created on login.

BUGFIXES preserved:
  B. add_ticket_note() returns agent_name as a string.
  C. update_ticket_note / delete_ticket_note require ticket_id.
  D. generate_ticket_number() raises if SQL returns no value.
  E. get_ticket_history() uses LEFT JOIN for system-side history.
  F. update_ticket() serialises list/dict history values with json.dumps.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional


class ControlService:
    """Service layer for FinSage Control operations."""

    def __init__(self, db_service):
        self.db = db_service

    # ────────────────────────────────────────
    # SCHEMA ENSURE
    # ────────────────────────────────────────

    def ensure_schema(self) -> None:
        """
        Ensure the control.* schema, tables, enums, functions, triggers
        and seed data exist.

        This is the single entry point for Control schema migration.
        """
        from BackEnd.Services.service_control.migrations import ensure_control_schema
        ensure_control_schema(self.db)

    # ────────────────────────────────────────
    # SYSTEM ERROR MONITORING
    # ────────────────────────────────────────

    def record_system_error(
        self,
        *,
        event_code: str,
        severity: str = "p2_high",
        source: str = "flask",
        product: str = "finsage",
        module_code: Optional[str] = None,
        page_code: Optional[str] = None,
        action_code: Optional[str] = None,
        company_id: Optional[int] = None,
        company_name: Optional[str] = None,
        user_id: Optional[int] = None,
        user_email: Optional[str] = None,
        error_ref: Optional[str] = None,
        transaction_ref: Optional[str] = None,
        message: Optional[str] = None,
        exception_type: Optional[str] = None,
        stack_trace: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        request_path: Optional[str] = None,
        http_method: Optional[str] = None,
        http_status: Optional[int] = 500,
    ) -> Optional[Dict[str, Any]]:
        """
        Record an application/system error in Control.

        Repeated failures are grouped into an open system event,
        while every individual occurrence is preserved in
        control.event_occurrences.

        Monitoring failures must never interfere with the
        original application request/error.
        """

        try:
            context_json = (
                json.dumps(context, default=str)
                if context is not None
                else None
            )

            event = self.db.fetch_one(
                """
                SELECT id
                FROM control.system_events
                WHERE event_code = %s
                  AND COALESCE(exception_type, '') = COALESCE(%s, '')
                  AND COALESCE(module_code, '') = COALESCE(%s, '')
                  AND status = 'open'
                ORDER BY last_seen_at DESC
                LIMIT 1
                """,
                (
                    event_code,
                    exception_type,
                    module_code,
                )
            )

            if event:
                event_id = event["id"]

                self.db.execute_sql(
                    """
                    UPDATE control.system_events
                    SET
                        occurrence_count = occurrence_count + 1,
                        last_seen_at = NOW(),
                        company_id = COALESCE(%s, company_id),
                        company_name = COALESCE(%s, company_name),
                        user_id = COALESCE(%s, user_id),
                        user_email = COALESCE(%s, user_email),
                        message = COALESCE(%s, message),
                        stack_trace = COALESCE(%s, stack_trace),
                        context = COALESCE(%s::JSONB, context)
                    WHERE id = %s
                    """,
                    (
                        company_id,
                        company_name,
                        user_id,
                        user_email,
                        message,
                        stack_trace,
                        context_json,
                        event_id,
                    )
                )

            else:
                event = self.db.fetch_one(
                    """
                    INSERT INTO control.system_events (
                        event_code,
                        severity,
                        status,
                        source,
                        product,
                        module_code,
                        page_code,
                        action_code,
                        company_id,
                        company_name,
                        user_id,
                        user_email,
                        error_ref,
                        transaction_ref,
                        message,
                        exception_type,
                        stack_trace,
                        context,
                        occurrence_count
                    )
                    VALUES (
                        %s, %s, 'open', %s, %s,
                        %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s,
                        %s, %s, %s,
                        %s::JSONB,
                        1
                    )
                    RETURNING id
                    """,
                    (
                        event_code,
                        severity,
                        source,
                        product,
                        module_code,
                        page_code,
                        action_code,
                        company_id,
                        company_name,
                        user_id,
                        user_email,
                        error_ref,
                        transaction_ref,
                        message,
                        exception_type,
                        stack_trace,
                        context_json,
                    )
                )

                event_id = event["id"]

            self.db.execute_sql(
                """
                INSERT INTO control.event_occurrences (
                    event_id,
                    occurred_at,
                    company_id,
                    request_path,
                    http_method,
                    http_status,
                    error_message,
                    context
                )
                VALUES (
                    %s,
                    NOW(),
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s::JSONB
                )
                """,
                (
                    event_id,
                    company_id,
                    request_path,
                    http_method,
                    http_status,
                    message,
                    context_json,
                )
            )

            return self.db.fetch_one(
                """
                SELECT *
                FROM control.system_events
                WHERE id = %s
                """,
                (event_id,)
            )

        except Exception:
            # Monitoring must NEVER replace or interfere with
            # the original application error.
            return None
        
    # ────────────────────────────────────────
    # TICKET NUMBER GENERATION
    # ────────────────────────────────────────

    def generate_ticket_number(self) -> str:
        """
        Generate a new ticket number via the SQL function.

        Raises RuntimeError if the function returns no value.
        """
        row = self.db.fetch_one(
            "SELECT control.generate_ticket_number() AS num"
        )

        if not row or not row.get("num"):
            raise RuntimeError(
                "control.generate_ticket_number() returned no value "
                "— check the DB connection and function definition"
            )

        return row["num"]

    # ────────────────────────────────────────
    # DASHBOARD
    # ────────────────────────────────────────

    def get_dashboard_stats(self) -> Dict[str, Any]:
        """Aggregate stats for the Control dashboard."""

        stats = self.db.fetch_one("""
            SELECT
                COUNT(*) FILTER (
                    WHERE status NOT IN ('resolved','closed')
                    AND is_deleted = FALSE
                ) AS open_tickets,

                COUNT(*) FILTER (
                    WHERE priority = 'p1_critical'
                    AND status NOT IN ('resolved','closed')
                    AND is_deleted = FALSE
                ) AS critical_tickets,

                COUNT(*) FILTER (
                    WHERE status = 'new'
                    AND is_deleted = FALSE
                ) AS new_tickets,

                COUNT(*) FILTER (
                    WHERE status = 'in_progress'
                    AND is_deleted = FALSE
                ) AS in_progress,

                COUNT(*) FILTER (
                    WHERE status = 'waiting_customer'
                    AND is_deleted = FALSE
                ) AS waiting_customer,

                COUNT(*) FILTER (
                    WHERE DATE(created_at) = CURRENT_DATE
                    AND is_deleted = FALSE
                ) AS created_today,

                COUNT(*) FILTER (
                    WHERE DATE(resolved_at) = CURRENT_DATE
                    AND is_deleted = FALSE
                ) AS resolved_today,

                COUNT(*) FILTER (
                    WHERE status NOT IN ('resolved','closed')
                    AND is_deleted = FALSE
                    AND first_response_at IS NULL
                ) AS unresponded,

                COUNT(*) FILTER (
                    WHERE is_deleted = FALSE
                ) AS total_tickets,

                COUNT(DISTINCT company_id) FILTER (
                    WHERE is_deleted = FALSE
                ) AS total_companies_served

            FROM control.tickets
        """)

        modules = self.db.fetch_all("""
            SELECT
                COALESCE(module_code, 'Unspecified') AS module,
                COUNT(*) AS count
            FROM control.tickets
            WHERE is_deleted = FALSE
            GROUP BY module_code
            ORDER BY count DESC
            LIMIT 8
        """)

        types = self.db.fetch_all("""
            SELECT ticket_type, COUNT(*) AS count
            FROM control.tickets
            WHERE is_deleted = FALSE
            GROUP BY ticket_type
            ORDER BY count DESC
        """)

        recent = self.db.fetch_all("""
            SELECT
                id,
                ticket_number,
                subject,
                status,
                priority,
                company_name,
                created_at
            FROM control.tickets
            WHERE is_deleted = FALSE
            ORDER BY created_at DESC
            LIMIT 10
        """)

        # Control workload now comes directly from control_users.
        agents = self.db.fetch_all("""
            SELECT
                cu.id,
                cu.display_name,
                cu.email,
                cu.role,
                COUNT(t.id) FILTER (
                    WHERE t.status NOT IN ('resolved','closed')
                    AND t.is_deleted = FALSE
                ) AS open_count
            FROM control.control_users cu
            LEFT JOIN control.tickets t
                ON t.assigned_agent_id = cu.id
            WHERE cu.is_active = TRUE
            GROUP BY
                cu.id,
                cu.display_name,
                cu.email,
                cu.role
            ORDER BY open_count DESC
        """)

        sla_stats = self.db.fetch_one("""
            SELECT
                COUNT(*) FILTER (
                    WHERE t.first_response_at IS NOT NULL
                    AND t.created_at
                        + (s.response_minutes || ' minutes')::INTERVAL
                        >= t.first_response_at
                    AND t.is_deleted = FALSE
                )::FLOAT
                /
                NULLIF(
                    COUNT(*) FILTER (
                        WHERE t.first_response_at IS NOT NULL
                        AND t.is_deleted = FALSE
                    ),
                    0
                ) * 100 AS sla_compliance_pct

            FROM control.tickets t
            LEFT JOIN control.slas s
                ON s.id = t.sla_id
        """)

        return {
            "open_tickets": stats["open_tickets"] or 0,
            "critical_tickets": stats["critical_tickets"] or 0,
            "new_tickets": stats["new_tickets"] or 0,
            "in_progress": stats["in_progress"] or 0,
            "waiting_customer": stats["waiting_customer"] or 0,
            "created_today": stats["created_today"] or 0,
            "resolved_today": stats["resolved_today"] or 0,
            "unresponded": stats["unresponded"] or 0,
            "total_tickets": stats["total_tickets"] or 0,
            "total_companies_served": stats["total_companies_served"] or 0,
            "sla_compliance_pct": round(
                sla_stats["sla_compliance_pct"] or 100,
                1
            ),
            "top_modules": modules,
            "ticket_types": types,
            "recent_tickets": recent,
            "agent_workload": agents,
        }

    # ────────────────────────────────────────
    # CUSTOMERS
    # ────────────────────────────────────────

    def get_customers(
        self,
        search: str = "",
        page: int = 1,
        per_page: int = 20
    ) -> Dict[str, Any]:
        """List FinSage companies with Control metadata."""

        offset = (page - 1) * per_page
        params: list = []
        where = ["c.is_active = TRUE"]

        if search:
            where.append(
                "(c.name ILIKE %s OR c.id::TEXT ILIKE %s)"
            )
            s = f"%{search}%"
            params.extend([s, s])

        where_clause = " AND ".join(where)

        total = self.db.fetch_one(
            f"""
                SELECT COUNT(*) AS cnt
                FROM public.companies c
                WHERE {where_clause}
            """,
            tuple(params)
        )["cnt"]

        rows = self.db.fetch_all(
            f"""
                SELECT
                    c.id AS company_id,
                    c.name AS company_name,
                    c.industry,
                    c.sub_industry,
                    c.currency,
                    c.created_at AS company_created_at,
                    c.is_active,

                    (
                        SELECT COUNT(*)
                        FROM public.company_users cu
                        WHERE cu.company_id = c.id
                        AND cu.is_active = TRUE
                    ) AS user_count,

                    cs.open_ticket_count,
                    cs.total_ticket_count,
                    cs.last_login_at,
                    cs.enabled_modules,
                    cs.app_version

                FROM public.companies c

                LEFT JOIN control.customer_snapshot cs
                    ON cs.company_id = c.id
                    AND cs.product = 'finsage'

                WHERE {where_clause}

                ORDER BY c.name ASC
                LIMIT %s OFFSET %s
            """,
            tuple(params + [per_page, offset])
        )

        return {
            "customers": rows,
            "total": total,
            "page": page,
            "per_page": per_page,
        }

    def get_customer_360(
        self,
        company_id: int
    ) -> Optional[Dict[str, Any]]:
        """Full Customer 360 view for a single company."""

        company = self.db.fetch_one("""
            SELECT
                c.id AS company_id,
                c.name AS company_name,
                c.industry,
                c.sub_industry,
                c.currency,
                c.is_active,
                c.created_at AS company_created_at,
                c.owner_user_id,

                cs.enabled_modules,
                cs.app_version,
                cs.last_login_at,
                cs.last_transaction_at,
                cs.last_error_at,
                cs.open_ticket_count,
                cs.total_ticket_count

            FROM public.companies c

            LEFT JOIN control.customer_snapshot cs
                ON cs.company_id = c.id
                AND cs.product = 'finsage'

            WHERE c.id = %s
        """, (company_id,))

        if not company:
            return None

        users = self.db.fetch_all("""
            SELECT
                u.id AS user_id,
                u.email,
                u.first_name,
                u.last_name,
                u.is_active,
                cu.user_role,
                cu.is_active AS company_user_active,
                cu.last_login_at

            FROM public.company_users cu
            JOIN public.users u
                ON u.id = cu.user_id

            WHERE cu.company_id = %s

            ORDER BY u.first_name, u.last_name
        """, (company_id,))

        tickets = self.db.fetch_all("""
            SELECT
                t.id,
                t.ticket_number,
                t.subject,
                t.status,
                t.priority,
                t.ticket_type,
                t.module_code,
                t.created_at,
                t.assigned_agent_id,
                cu.display_name AS agent_name

            FROM control.tickets t

            LEFT JOIN control.control_users cu
                ON cu.id = t.assigned_agent_id

            WHERE t.company_id = %s
            AND t.is_deleted = FALSE

            ORDER BY t.created_at DESC
            LIMIT 50
        """, (company_id,))

        ticket_stats = self.db.fetch_one("""
            SELECT
                COUNT(*) FILTER (
                    WHERE status NOT IN ('resolved','closed')
                ) AS open,

                COUNT(*) FILTER (
                    WHERE status = 'new'
                ) AS new,

                COUNT(*) FILTER (
                    WHERE priority = 'p1_critical'
                    AND status NOT IN ('resolved','closed')
                ) AS critical,

                COUNT(*) AS total

            FROM control.tickets

            WHERE company_id = %s
            AND is_deleted = FALSE
        """, (company_id,))

        return {
            **company,
            "users": users,
            "tickets": tickets,
            "ticket_stats": ticket_stats,
        }

    # ────────────────────────────────────────
    # TICKETS
    # ────────────────────────────────────────

    def get_tickets(
        self,
        filters: Dict[str, Any] = None,
        page: int = 1,
        per_page: int = 20
    ) -> Dict[str, Any]:
        """List tickets with filtering."""

        filters = filters or {}
        offset = (page - 1) * per_page
        params: list = []
        where = ["t.is_deleted = FALSE"]

        if filters.get("status"):
            where.append("t.status = %s")
            params.append(filters["status"])

        if filters.get("priority"):
            where.append("t.priority = %s")
            params.append(filters["priority"])

        if filters.get("ticket_type"):
            where.append("t.ticket_type = %s")
            params.append(filters["ticket_type"])

        if filters.get("category_id"):
            where.append("t.category_id = %s")
            params.append(int(filters["category_id"]))

        if filters.get("assigned_agent_id"):
            where.append("t.assigned_agent_id = %s")
            params.append(int(filters["assigned_agent_id"]))

        if filters.get("company_id"):
            where.append("t.company_id = %s")
            params.append(int(filters["company_id"]))

        if filters.get("search"):
            where.append("""
                (
                    t.subject ILIKE %s
                    OR t.ticket_number ILIKE %s
                    OR t.company_name ILIKE %s
                )
            """)
            s = f"%{filters['search']}%"
            params.extend([s, s, s])

        where_clause = " AND ".join(where)

        total = self.db.fetch_one(
            f"""
                SELECT COUNT(*) AS cnt
                FROM control.tickets t
                WHERE {where_clause}
            """,
            tuple(params)
        )["cnt"]

        rows = self.db.fetch_all(
            f"""
                SELECT
                    t.id,
                    t.ticket_number,
                    t.ticket_type,
                    t.subject,
                    t.description,
                    t.status,
                    t.priority,
                    t.company_id,
                    t.company_name,
                    t.user_name,
                    t.user_email,
                    t.product,
                    t.module_code,
                    t.page_code,
                    t.transaction_ref,
                    t.error_ref,
                    t.app_version,
                    t.assigned_agent_id,
                    t.category_id,
                    t.created_at,
                    t.updated_at,
                    t.triaged_at,
                    t.assigned_at,
                    t.first_response_at,
                    t.resolved_at,
                    t.closed_at,
                    t.support_context,
                    t.tags,

                    cu.display_name AS agent_name,
                    cat.name AS category_name

                FROM control.tickets t

                LEFT JOIN control.control_users cu
                    ON cu.id = t.assigned_agent_id

                LEFT JOIN control.categories cat
                    ON cat.id = t.category_id

                WHERE {where_clause}

                ORDER BY
                    CASE t.priority
                        WHEN 'p1_critical' THEN 1
                        WHEN 'p2_high' THEN 2
                        WHEN 'p3_medium' THEN 3
                        WHEN 'p4_low' THEN 4
                    END,
                    t.created_at DESC

                LIMIT %s OFFSET %s
            """,
            tuple(params + [per_page, offset])
        )

        return {
            "tickets": rows,
            "total": total,
            "page": page,
            "per_page": per_page,
        }

    def get_ticket(
        self,
        ticket_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get a single ticket with full details."""

        return self.db.fetch_one("""
            SELECT
                t.*,
                cu.display_name AS agent_name,
                cat.name AS category_name

            FROM control.tickets t

            LEFT JOIN control.control_users cu
                ON cu.id = t.assigned_agent_id

            LEFT JOIN control.categories cat
                ON cat.id = t.category_id

            WHERE t.id = %s
            AND t.is_deleted = FALSE
        """, (ticket_id,))

    def create_ticket(
        self,
        data: Dict[str, Any],
        agent_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Create a new ticket."""

        ticket_number = self.generate_ticket_number()

        sla_id = None

        if data.get("priority"):
            sla = self.db.fetch_one(
                """
                    SELECT id
                    FROM control.slas
                    WHERE priority = %s
                    AND is_active = TRUE
                    LIMIT 1
                """,
                (data["priority"],)
            )

            if sla:
                sla_id = sla["id"]

        support_context = data.get("support_context")
        if support_context is not None:
            support_context = json.dumps(
                support_context,
                default=str
            )

        tags = data.get("tags")
        if tags is not None:
            tags = json.dumps(
                tags,
                default=str
            )

        row = self.db.fetch_one("""
            INSERT INTO control.tickets (
                ticket_number,
                ticket_type,
                subject,
                description,
                company_id,
                company_name,
                user_id,
                user_email,
                user_name,
                product,
                module_code,
                page_code,
                action_code,
                transaction_ref,
                error_ref,
                app_version,
                support_context,
                status,
                priority,
                category_id,
                sla_id,
                created_by,
                tags
            )
            VALUES (
                %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s
            )
            RETURNING *
        """, (
            ticket_number,
            data.get("ticket_type", "support"),
            data["subject"],
            data["description"],
            data.get("company_id"),
            data.get("company_name"),
            data.get("user_id"),
            data.get("user_email"),
            data.get("user_name"),
            data.get("product", "finsage"),
            data.get("module_code"),
            data.get("page_code"),
            data.get("action_code"),
            data.get("transaction_ref"),
            data.get("error_ref"),
            data.get("app_version"),
            support_context,
            data.get("status", "new"),
            data.get("priority", "p3_medium"),
            data.get("category_id"),
            sla_id,
            agent_id,
            tags,
        ))

        return row

    @staticmethod
    def _serialise_history_value(
        v: Any
    ) -> Optional[str]:
        """
        Convert a field value to TEXT for ticket_history.

        Lists and dicts are JSON encoded.
        None remains None.
        Scalars are converted to strings.
        """
        if v is None:
            return None

        if isinstance(v, (list, dict)):
            return json.dumps(v, default=str)

        return str(v)

    def update_ticket(
        self,
        ticket_id: int,
        data: Dict[str, Any],
        agent_id: int
    ) -> Optional[Dict[str, Any]]:
        """Update a ticket and record history for changed fields."""

        ticket = self.get_ticket(ticket_id)

        if not ticket:
            return None

        allowed_fields = {
            "status",
            "priority",
            "subject",
            "description",
            "assigned_agent_id",
            "category_id",
            "resolution_notes",
            "tags",
            "module_code",
            "page_code",
            "transaction_ref",
            "error_ref",
            "company_id",
            "company_name",
            "user_name",
            "user_email",
        }

        updates = []
        params = []
        history_entries = []

        for field, new_value in data.items():
            if field not in allowed_fields:
                continue

            old_value = ticket.get(field)

            if old_value != new_value:
                db_value = new_value

                if field == "tags" and new_value is not None:
                    db_value = json.dumps(
                        new_value,
                        default=str
                    )

                updates.append(f"{field} = %s")
                params.append(db_value)

                history_entries.append((
                    field,
                    self._serialise_history_value(old_value),
                    self._serialise_history_value(new_value),
                ))

        # Auto-set timestamps.
        if "status" in data:
            new_status = data["status"]

            if (
                new_status == "triaged"
                and not ticket["triaged_at"]
            ):
                updates.append("triaged_at = NOW()")

            if (
                "assigned_agent_id" in data
                and new_status in ("assigned", "in_progress")
                and not ticket["assigned_at"]
            ):
                updates.append("assigned_at = NOW()")

            if (
                new_status == "resolved"
                and not ticket["resolved_at"]
            ):
                updates.append("resolved_at = NOW()")

            if (
                new_status == "closed"
                and not ticket["closed_at"]
            ):
                updates.append("closed_at = NOW()")

        # Auto-assign SLA on priority change.
        if "priority" in data:
            sla = self.db.fetch_one(
                """
                    SELECT id
                    FROM control.slas
                    WHERE priority = %s
                    AND is_active = TRUE
                    LIMIT 1
                """,
                (data["priority"],)
            )

            if sla:
                updates.append("sla_id = %s")
                params.append(sla["id"])

        if not updates:
            return ticket

        params.append(ticket_id)

        self.db.execute_sql(
            f"""
                UPDATE control.tickets
                SET {', '.join(updates)}
                WHERE id = %s
            """,
            tuple(params)
        )

        # Write history.
        for field, old_val, new_val in history_entries:
            self.db.execute_sql("""
                INSERT INTO control.ticket_history (
                    ticket_id,
                    field,
                    old_value,
                    new_value,
                    changed_by
                )
                VALUES (%s, %s, %s, %s, %s)
            """, (
                ticket_id,
                field,
                old_val,
                new_val,
                agent_id
            ))

        return self.get_ticket(ticket_id)

    def delete_ticket(
        self,
        ticket_id: int,
        agent_id: int
    ) -> bool:
        """Soft-delete a ticket."""

        self.db.execute_sql(
            """
                UPDATE control.tickets
                SET is_deleted = TRUE
                WHERE id = %s
            """,
            (ticket_id,)
        )

        self.db.execute_sql("""
            INSERT INTO control.ticket_history (
                ticket_id,
                field,
                old_value,
                new_value,
                changed_by
            )
            VALUES (
                %s,
                'is_deleted',
                'FALSE',
                'TRUE',
                %s
            )
        """, (ticket_id, agent_id))

        return True

    # ────────────────────────────────────────
    # TICKET MESSAGES
    # ────────────────────────────────────────

    def get_ticket_messages(
        self,
        ticket_id: int
    ) -> List[Dict[str, Any]]:
        return self.db.fetch_all("""
            SELECT
                id,
                ticket_id,
                is_from_customer,
                sender_name,
                sender_email,
                body,
                created_at,
                created_by
            FROM control.ticket_messages
            WHERE ticket_id = %s
            ORDER BY created_at ASC
        """, (ticket_id,))

    def add_ticket_message(
        self,
        ticket_id: int,
        data: Dict[str, Any],
        agent_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Add a message.

        agent_id supplied:
            Control user / support message.

        agent_id is None:
            Customer/system-originated message.
        """

        from_customer = agent_id is None

        row = self.db.fetch_one("""
            INSERT INTO control.ticket_messages (
                ticket_id,
                is_from_customer,
                sender_name,
                sender_email,
                body,
                created_by
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (
            ticket_id,
            from_customer,
            data["sender_name"],
            data.get("sender_email"),
            data["body"],
            agent_id,
        ))

        if not from_customer and agent_id:
            self.db.execute_sql("""
                UPDATE control.tickets
                SET first_response_at = NOW()
                WHERE id = %s
                AND first_response_at IS NULL
            """, (ticket_id,))

        return row

    # ────────────────────────────────────────
    # TICKET NOTES
    # ────────────────────────────────────────

    def get_ticket_notes(
        self,
        ticket_id: int
    ) -> List[Dict[str, Any]]:
        return self.db.fetch_all("""
            SELECT
                n.id,
                n.ticket_id,
                n.body,
                n.created_at,
                n.updated_at,
                cu.display_name AS agent_name,
                cu.id AS agent_id

            FROM control.ticket_notes n

            JOIN control.control_users cu
                ON cu.id = n.agent_id

            WHERE n.ticket_id = %s

            ORDER BY n.created_at ASC
        """, (ticket_id,))

    def add_ticket_note(
        self,
        ticket_id: int,
        body: str,
        agent_id: int
    ) -> Dict[str, Any]:
        """
        Insert an internal note.

        Returns agent_name as a plain string.
        """

        row = self.db.fetch_one("""
            INSERT INTO control.ticket_notes (
                ticket_id,
                agent_id,
                body
            )
            VALUES (%s, %s, %s)
            RETURNING *
        """, (
            ticket_id,
            agent_id,
            body
        ))

        agent = self.db.fetch_one(
            """
                SELECT display_name
                FROM control.control_users
                WHERE id = %s
            """,
            (agent_id,)
        )

        row["agent_name"] = (
            agent["display_name"]
            if agent
            else None
        )

        return row

    def update_ticket_note(
        self,
        ticket_id: int,
        note_id: int,
        body: str,
        agent_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Update an internal note.

        Requires:
            - ticket_id
            - note_id
            - original agent_id
        """

        self.db.execute_sql(
            """
                UPDATE control.ticket_notes
                SET body = %s
                WHERE id = %s
                AND ticket_id = %s
                AND agent_id = %s
            """,
            (
                body,
                note_id,
                ticket_id,
                agent_id
            )
        )

        return self.db.fetch_one(
            """
                SELECT *
                FROM control.ticket_notes
                WHERE id = %s
                AND ticket_id = %s
            """,
            (
                note_id,
                ticket_id
            )
        )

    def delete_ticket_note(
        self,
        ticket_id: int,
        note_id: int,
        agent_id: int
    ) -> bool:
        """
        Delete an internal note.

        Requires ticket_id + note_id + original author.
        """

        self.db.execute_sql(
            """
                DELETE FROM control.ticket_notes
                WHERE id = %s
                AND ticket_id = %s
                AND agent_id = %s
            """,
            (
                note_id,
                ticket_id,
                agent_id
            )
        )

        return True

    # ────────────────────────────────────────
    # TICKET HISTORY
    # ────────────────────────────────────────

    def get_ticket_history(
        self,
        ticket_id: int
    ) -> List[Dict[str, Any]]:
        """
        Audit trail for a ticket.

        LEFT JOIN is intentional because changed_by may be NULL for
        system-generated changes.
        """

        return self.db.fetch_all("""
            SELECT
                h.id,
                h.field,
                h.old_value,
                h.new_value,
                h.created_at,
                cu.display_name AS changed_by_name

            FROM control.ticket_history h

            LEFT JOIN control.control_users cu
                ON cu.id = h.changed_by

            WHERE h.ticket_id = %s

            ORDER BY h.created_at ASC
        """, (ticket_id,))

    # ────────────────────────────────────────
    # SETTINGS: CONTROL USERS
    # ────────────────────────────────────────

    def get_agents(
        self,
        include_inactive: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Return Control users for assignment/workload management.

        Kept as get_agents() for frontend compatibility.
        The underlying identity is now control.control_users.
        """

        q = """
            SELECT
                cu.*,
                t.name AS team_name
            FROM control.control_users cu

            LEFT JOIN control.teams t
                ON t.id = cu.team_id
        """

        if not include_inactive:
            q += " WHERE cu.is_active = TRUE"

        q += """
            ORDER BY
                cu.display_name NULLS LAST,
                cu.email
        """

        return self.db.fetch_all(q)

    def create_agent(
        self,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Create a Control user.

        Kept as create_agent() for existing frontend/API compatibility.
        """

        return self.db.fetch_one("""
            INSERT INTO control.control_users (
                email,
                password_hash,
                display_name,
                first_name,
                last_name,
                role,
                team_id,
                max_tickets,
                is_active
            )
            VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s
            )
            RETURNING *
        """, (
            data["email"],
            data["password_hash"],
            data.get("display_name"),
            data.get("first_name"),
            data.get("last_name"),
            data.get("role", "agent"),
            data.get("team_id"),
            data.get("max_tickets", 15),
            data.get("is_active", True),
        ))

    def update_agent(
        self,
        agent_id: int,
        data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update a Control user."""

        sets = []
        params = []

        for f in (
            "email",
            "display_name",
            "first_name",
            "last_name",
            "role",
            "team_id",
            "max_tickets",
            "is_active",
        ):
            if f in data:
                sets.append(f"{f} = %s")
                params.append(data[f])

        if "password_hash" in data and data["password_hash"]:
            sets.append("password_hash = %s")
            params.append(data["password_hash"])

        if not sets:
            return None

        sets.append("updated_at = CURRENT_TIMESTAMP")

        params.append(agent_id)

        self.db.execute_sql(
            f"""
                UPDATE control.control_users
                SET {', '.join(sets)}
                WHERE id = %s
            """,
            tuple(params)
        )

        return self.db.fetch_one(
            """
                SELECT *
                FROM control.control_users
                WHERE id = %s
            """,
            (agent_id,)
        )

    # ────────────────────────────────────────
    # SETTINGS: TEAMS
    # ────────────────────────────────────────

    def get_teams(self) -> List[Dict[str, Any]]:
        return self.db.fetch_all("""
            SELECT
                t.*,
                COUNT(cu.id) AS agent_count

            FROM control.teams t

            LEFT JOIN control.control_users cu
                ON cu.team_id = t.id
                AND cu.is_active = TRUE

            GROUP BY t.id

            ORDER BY t.name
        """)

    def create_team(
        self,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        return self.db.fetch_one("""
            INSERT INTO control.teams (
                name,
                description
            )
            VALUES (%s, %s)
            RETURNING *
        """, (
            data["name"],
            data.get("description")
        ))

    def update_team(
        self,
        team_id: int,
        data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        sets = []
        params = []

        for f in (
            "name",
            "description",
            "is_active"
        ):
            if f in data:
                sets.append(f"{f} = %s")
                params.append(data[f])

        if not sets:
            return None

        sets.append("updated_at = CURRENT_TIMESTAMP")
        params.append(team_id)

        self.db.execute_sql(
            f"""
                UPDATE control.teams
                SET {', '.join(sets)}
                WHERE id = %s
            """,
            tuple(params)
        )

        return self.db.fetch_one(
            """
                SELECT *
                FROM control.teams
                WHERE id = %s
            """,
            (team_id,)
        )

    # ────────────────────────────────────────
    # SETTINGS: CATEGORIES
    # ────────────────────────────────────────

    def get_categories(self) -> List[Dict[str, Any]]:
        return self.db.fetch_all("""
            SELECT
                c.*,
                COUNT(t.id) AS ticket_count

            FROM control.categories c

            LEFT JOIN control.tickets t
                ON t.category_id = c.id
                AND t.is_deleted = FALSE

            GROUP BY c.id

            ORDER BY
                c.sort_order,
                c.name
        """)

    def create_category(
        self,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        return self.db.fetch_one("""
            INSERT INTO control.categories (
                name,
                description,
                sort_order
            )
            VALUES (%s, %s, %s)
            RETURNING *
        """, (
            data["name"],
            data.get("description"),
            data.get("sort_order", 0)
        ))

    def update_category(
        self,
        cat_id: int,
        data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        sets = []
        params = []

        for f in (
            "name",
            "description",
            "is_active",
            "sort_order"
        ):
            if f in data:
                sets.append(f"{f} = %s")
                params.append(data[f])

        if not sets:
            return None

        sets.append("updated_at = CURRENT_TIMESTAMP")
        params.append(cat_id)

        self.db.execute_sql(
            f"""
                UPDATE control.categories
                SET {', '.join(sets)}
                WHERE id = %s
            """,
            tuple(params)
        )

        return self.db.fetch_one(
            """
                SELECT *
                FROM control.categories
                WHERE id = %s
            """,
            (cat_id,)
        )

    # ────────────────────────────────────────
    # SETTINGS: SLAS
    # ────────────────────────────────────────

    def get_slas(self) -> List[Dict[str, Any]]:
        return self.db.fetch_all("""
            SELECT *
            FROM control.slas
            ORDER BY priority
        """)

    def update_sla(
        self,
        sla_id: int,
        data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        sets = []
        params = []

        for f in (
            "name",
            "response_minutes",
            "resolution_hours",
            "is_active"
        ):
            if f in data:
                sets.append(f"{f} = %s")
                params.append(data[f])

        if not sets:
            return None

        sets.append("updated_at = CURRENT_TIMESTAMP")
        params.append(sla_id)

        self.db.execute_sql(
            f"""
                UPDATE control.slas
                SET {', '.join(sets)}
                WHERE id = %s
            """,
            tuple(params)
        )

        return self.db.fetch_one(
            """
                SELECT *
                FROM control.slas
                WHERE id = %s
            """,
            (sla_id,)
        )

    # ────────────────────────────────────────
    # CONTROL AUTH HELPERS
    # ────────────────────────────────────────

    def get_control_user(
        self,
        control_user_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get an active Control user by Control identity ID."""

        return self.db.fetch_one("""
            SELECT
                cu.*,
                t.name AS team_name

            FROM control.control_users cu

            LEFT JOIN control.teams t
                ON t.id = cu.team_id

            WHERE cu.id = %s
            AND cu.is_active = TRUE
        """, (int(control_user_id),))

    def get_agent_by_user_id(
        self,
        user_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Compatibility wrapper.

        Control no longer uses public.users. The argument is now treated
        as a Control user ID so existing callers do not immediately break.
        """

        return self.get_control_user(user_id)

    # register_agent() intentionally removed.
    #
    # Control users must be explicitly provisioned in
    # control.control_users. A normal FinSage user must never become
    # a Control user automatically by logging in.