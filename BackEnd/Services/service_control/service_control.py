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
import os
import json
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from BackEnd.Services.control.notifications import NotificationService
from BackEnd.Services.control.audit import AuditService
from BackEnd.Services.control.automation import AutomationService
class ControlService:
    """Service layer for FinSage Control operations."""

    def __init__(self, db_service):
        self.db = db_service
        self.notification_service = NotificationService(self.db)
        self.audit_service = AuditService(self.db)
        self.automation_service = AutomationService(
            self.db,
            self,
        )

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

    def get_system_errors(
        self,
        *,
        limit: int = 50,
        unresolved_only: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Return recent Control system errors.

        System events contain the grouped error information while
        the latest occurrence provides the most recent request details.
        """

        limit = max(1, min(int(limit or 50), 200))

        status_clause = "WHERE se.status = 'open'" if unresolved_only else ""

        return self.db.fetch_all(
            f"""
            SELECT
                se.id,
                se.event_code,
                se.severity,
                se.status,
                se.source,
                se.product,
                se.module_code,
                se.page_code,
                se.action_code,
                se.company_id,
                se.company_name,
                se.user_id,
                se.user_email,
                se.error_ref,
                se.transaction_ref,
                se.message,
                se.exception_type,
                se.stack_trace,
                se.context,
                se.occurrence_count,
                se.first_seen_at,
                se.last_seen_at,
                se.resolved_at,
                se.ticket_id,
                (
                    SELECT json_build_object(
                        'id', eo.id,
                        'occurred_at', eo.occurred_at,
                        'request_path', eo.request_path,
                        'http_method', eo.http_method,
                        'http_status', eo.http_status,
                        'error_message', eo.error_message
                    )
                    FROM control.event_occurrences eo
                    WHERE eo.event_id = se.id
                    ORDER BY eo.id DESC
                    LIMIT 1
                ) AS latest_occurrence
            FROM control.system_events se
            {status_clause}
            ORDER BY se.last_seen_at DESC
            LIMIT %s
            """,
            (limit,),
        )

    def get_system_errors(
        self,
        *,
        limit: int = 50,
        unresolved_only: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Return recent system errors.

        system_events stores the grouped error while the latest
        occurrence provides the most recent request information.
        """

        limit = max(1, min(int(limit or 50), 200))

        status_clause = (
            "WHERE se.status = 'open'"
            if unresolved_only
            else ""
        )

        return self.db.fetch_all(
            f"""
            SELECT
                se.id,
                se.event_code,
                se.severity,
                se.status,
                se.source,
                se.product,
                se.module_code,
                se.page_code,
                se.action_code,
                se.company_id,
                se.company_name,
                se.user_id,
                se.user_email,
                se.error_ref,
                se.transaction_ref,
                se.message,
                se.exception_type,
                se.stack_trace,
                se.context,
                se.occurrence_count,
                se.first_seen_at,
                se.last_seen_at,
                se.resolved_at,
                se.ticket_id,
                (
                    SELECT json_build_object(
                        'id', eo.id,
                        'occurred_at', eo.occurred_at,
                        'request_path', eo.request_path,
                        'http_method', eo.http_method,
                        'http_status', eo.http_status,
                        'error_message', eo.error_message,
                        'context', eo.context
                    )
                    FROM control.event_occurrences eo
                    WHERE eo.event_id = se.id
                    ORDER BY eo.id DESC
                    LIMIT 1
                ) AS latest_occurrence
            FROM control.system_events se
            {status_clause}
            ORDER BY se.last_seen_at DESC
            LIMIT %s
            """,
            (limit,),
        )


    def get_system_error(
        self,
        event_id: int,
    ) -> Optional[Dict[str, Any]]:
        """
        Return a single system error together with its latest occurrence.
        """

        return self.db.fetch_one(
            """
            SELECT
                se.id,
                se.event_code,
                se.severity,
                se.status,
                se.source,
                se.product,
                se.module_code,
                se.page_code,
                se.action_code,
                se.company_id,
                se.company_name,
                se.user_id,
                se.user_email,
                se.error_ref,
                se.transaction_ref,
                se.message,
                se.exception_type,
                se.stack_trace,
                se.context,
                se.occurrence_count,
                se.first_seen_at,
                se.last_seen_at,
                se.resolved_at,
                se.ticket_id,
                (
                    SELECT json_build_object(
                        'id', eo.id,
                        'occurred_at', eo.occurred_at,
                        'request_path', eo.request_path,
                        'http_method', eo.http_method,
                        'http_status', eo.http_status,
                        'error_message', eo.error_message,
                        'context', eo.context
                    )
                    FROM control.event_occurrences eo
                    WHERE eo.event_id = se.id
                    ORDER BY eo.id DESC
                    LIMIT 1
                ) AS latest_occurrence
            FROM control.system_events se
            WHERE se.id = %s
            LIMIT 1
            """,
            (event_id,),
        )


    def get_system_error_occurrences(
        self,
        event_id: int,
        *,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """
        Return individual occurrences for a grouped system error.
        """

        limit = max(1, min(int(limit or 100), 500))

        return self.db.fetch_all(
            """
            SELECT
                id,
                event_id,
                occurred_at,
                company_id,
                request_path,
                http_method,
                http_status,
                error_message,
                context
            FROM control.event_occurrences
            WHERE event_id = %s
            ORDER BY occurred_at DESC
            LIMIT %s
            """,
            (
                event_id,
                limit,
            ),
        )


    def resolve_system_error(
        self,
        event_id: int,
    ) -> Optional[Dict[str, Any]]:
        """
        Mark a system error as resolved.
        """

        self.db.execute_sql(
            """
            UPDATE control.system_events
            SET
                status = 'resolved',
                resolved_at = NOW()
            WHERE id = %s
            """,
            (event_id,),
        )

        return self.get_system_error(event_id)


    def reopen_system_error(
        self,
        event_id: int,
    ) -> Optional[Dict[str, Any]]:
        """
        Reopen a previously resolved system error.
        """

        self.db.execute_sql(
            """
            UPDATE control.system_events
            SET
                status = 'open',
                resolved_at = NULL
            WHERE id = %s
            """,
            (event_id,),
        )

        return self.get_system_error(event_id)

    # ============================================================
    # PHASE 7 — SYSTEM HEALTH
    # ============================================================

    def get_system_checks(self, active_only=True):
        """
        Return configured Control system-health checks.
        """

        where = "WHERE is_active = TRUE" if active_only else ""

        return self.db.fetch_all(
            f"""
            SELECT
                id,
                code,
                name,
                description,
                check_type,
                interval_minutes,
                is_active,
                creates_ticket,
                priority,
                created_at,
                updated_at
            FROM control.system_checks
            {where}
            ORDER BY id
            """
        )


    def get_system_check(self, check_code):
        """
        Return one configured system-health check.
        """

        return self.db.fetch_one(
            """
            SELECT
                id,
                code,
                name,
                description,
                check_type,
                interval_minutes,
                is_active,
                creates_ticket,
                priority,
                created_at,
                updated_at
            FROM control.system_checks
            WHERE code = %s
            LIMIT 1
            """,
            (check_code,),
        )


    def get_latest_system_check_runs(self):
        """
        Return the latest run for every configured system-health check.
        """

        return self.db.fetch_all(
            """
            SELECT
                sc.id AS check_id,
                sc.code,
                sc.name,
                sc.description,
                sc.check_type,
                sc.interval_minutes,
                sc.is_active,
                sc.creates_ticket,
                sc.priority,
                scr.id AS run_id,
                scr.status,
                scr.result_summary,
                scr.result_data,
                scr.started_at,
                scr.completed_at,
                scr.duration_ms,
                scr.error_message,
                scr.ticket_id
            FROM control.system_checks sc
            LEFT JOIN LATERAL (
                SELECT
                    id,
                    status,
                    result_summary,
                    result_data,
                    started_at,
                    completed_at,
                    duration_ms,
                    error_message,
                    ticket_id
                FROM control.system_check_runs
                WHERE check_id = sc.id
                ORDER BY started_at DESC
                LIMIT 1
            ) scr ON TRUE
            WHERE sc.is_active = TRUE
            ORDER BY sc.id
            """
        )


    def get_system_check_runs(self, check_id=None, limit=50):
        """
        Return recent health-check execution history.
        """

        limit = max(1, min(int(limit or 50), 500))

        if check_id:
            return self.db.fetch_all(
                """
                SELECT
                    id,
                    check_id,
                    status,
                    result_summary,
                    result_data,
                    started_at,
                    completed_at,
                    duration_ms,
                    error_message,
                    ticket_id
                FROM control.system_check_runs
                WHERE check_id = %s
                ORDER BY started_at DESC
                LIMIT %s
                """,
                (check_id, limit),
            )

        return self.db.fetch_all(
            """
            SELECT
                scr.id,
                scr.check_id,
                sc.code,
                sc.name,
                scr.status,
                scr.result_summary,
                scr.result_data,
                scr.started_at,
                scr.completed_at,
                scr.duration_ms,
                scr.error_message,
                scr.ticket_id
            FROM control.system_check_runs scr
            JOIN control.system_checks sc
                ON sc.id = scr.check_id
            ORDER BY scr.started_at DESC
            LIMIT %s
            """,
            (limit,),
        )


    def _system_health_database_check(self):
        """
        Check database connectivity and response time.
        """

        started = datetime.now(timezone.utc)

        try:
            row = self.db.fetch_one(
                """
                SELECT
                    1 AS connected,
                    NOW() AS database_time
                """
            )

            completed = datetime.now(timezone.utc)
            duration_ms = int(
                (completed - started).total_seconds() * 1000
            )

            return {
                "status": "healthy",
                "summary": "Database connection is healthy.",
                "data": {
                    "connected": bool(row),
                    "database_time": (
                        row.get("database_time")
                        if row else None
                    ),
                    "response_time_ms": duration_ms,
                },
                "error": None,
            }

        except Exception as exc:
            completed = datetime.now(timezone.utc)
            duration_ms = int(
                (completed - started).total_seconds() * 1000
            )

            return {
                "status": "failed",
                "summary": "Database connectivity check failed.",
                "data": {
                    "response_time_ms": duration_ms,
                },
                "error": str(exc),
            }


    def _system_health_company_count_check(self):
        """
        Monitor the number of active FinSage companies.
        """

        row = self.db.fetch_one(
            """
            SELECT
                COUNT(*) AS total_companies
            FROM public.companies
            WHERE COALESCE(is_active, TRUE) = TRUE
            """
        )

        total = int(row["total_companies"] or 0) if row else 0

        return {
            "status": "healthy",
            "summary": f"{total} active companies.",
            "data": {
                "active_companies": total,
            },
            "error": None,
        }


    def _system_health_subscription_check(self):
        """
        Monitor subscription visibility.

        This check remains safe while Phase 5 subscription tables
        are being introduced. A missing table is reported as a
        warning rather than crashing the health runner.
        """

        exists = self.db.fetch_one(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = 'company_subscriptions'
            ) AS exists
            """
        )

        if not exists or not exists["exists"]:
            return {
                "status": "warning",
                "summary": "Subscription table is not available yet.",
                "data": {
                    "table_available": False,
                },
                "error": None,
            }

        row = self.db.fetch_one(
            """
            SELECT
                COUNT(*) FILTER (
                    WHERE status IN ('active', 'trialing')
                ) AS active_or_trial,
                COUNT(*) FILTER (
                    WHERE status = 'active'
                ) AS active,
                COUNT(*) FILTER (
                    WHERE status = 'trialing'
                ) AS trialing,
                COUNT(*) FILTER (
                    WHERE status = 'expired'
                ) AS expired,
                COUNT(*) AS total
            FROM public.company_subscriptions
            """
        )

        data = {
            "table_available": True,
            "total": int(row["total"] or 0),
            "active": int(row["active"] or 0),
            "trialing": int(row["trialing"] or 0),
            "expired": int(row["expired"] or 0),
        }

        return {
            "status": "healthy",
            "summary": (
                f"{data['active']} active, "
                f"{data['trialing']} trial, "
                f"{data['expired']} expired subscriptions."
            ),
            "data": data,
            "error": None,
        }


    def _system_health_recent_errors_check(self):
        """
        Check for recurring open system errors.
        """

        row = self.db.fetch_one(
            """
            SELECT
                COUNT(*) AS open_errors,
                COALESCE(
                    SUM(occurrence_count),
                    0
                ) AS total_occurrences
            FROM control.system_events
            WHERE status = 'open'
            """
        )

        open_errors = int(row["open_errors"] or 0) if row else 0
        total_occurrences = (
            int(row["total_occurrences"] or 0)
            if row else 0
        )

        if open_errors == 0:
            status = "healthy"
            summary = "No open system errors."
        elif open_errors <= 5:
            status = "warning"
            summary = f"{open_errors} open system errors."
        else:
            status = "failed"
            summary = f"{open_errors} open system errors."

        return {
            "status": status,
            "summary": summary,
            "data": {
                "open_errors": open_errors,
                "total_occurrences": total_occurrences,
            },
            "error": None,
        }


    def _run_system_health_check(self, check):
        """
        Execute one configured system-health check.
        """

        check_type = check["check_type"]

        if check_type == "database":
            return self._system_health_database_check()

        if check_type == "companies":
            return self._system_health_company_count_check()

        if check_type == "subscriptions":
            return self._system_health_subscription_check()

        if check_type == "system_events":
            return self._system_health_recent_errors_check()

        return {
            "status": "failed",
            "summary": f"Unsupported health check type: {check_type}",
            "data": {
                "check_type": check_type,
            },
            "error": f"Unsupported health check type: {check_type}",
        }


    def _system_health_create_ticket(
        self,
        check,
        result,
        run_id,
        agent_id=None,
    ):
        """
        Create a Control ticket for a failed health check when
        the check definition allows ticket creation.
        """

        if not check.get("creates_ticket"):
            return None

        if result["status"] not in ("failed", "warning"):
            return None

        existing = self.db.fetch_one(
            """
            SELECT id
            FROM control.tickets
            WHERE is_deleted = FALSE
              AND ticket_type = 'system_error'
              AND support_context->>'source' = 'system_health'
              AND support_context->>'check_code' = %s
              AND status NOT IN ('resolved', 'closed')
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (check["code"],),
        )

        if existing:
            return existing["id"]

        ticket = self.create_ticket(
            {
                "ticket_type": "system_error",
                "subject": f"System Health: {check['name']}",
                "description": result["summary"],
                "priority": check["priority"],
                "product": "finsage",
                "module": "system_health",
                "page": "system_health",
                "error_ref": f"health_check:{check['code']}",
                "support_context": {
                    "source": "system_health",
                    "check_code": check["code"],
                    "check_name": check["name"],
                    "run_id": run_id,
                    "result": result,
                },
                "tags": [
                    "system_health",
                    check["code"],
                ],
            },
            agent_id=agent_id,
        )

        return ticket["id"] if ticket else None


    def run_system_health_checks(
        self,
        *,
        check_code=None,
        force=False,
        agent_id=None,
    ):
        """
        Execute active system-health checks and record every run.

        If check_code is supplied, only that check is executed.
        Otherwise all active checks are executed.

        When force=False, a check is skipped if it has already
        been successfully/unsuccessfully executed within its
        configured interval.
        """

        if check_code:
            checks = [
                self.get_system_check(check_code)
            ]

            checks = [
                check for check in checks
                if check and check["is_active"]
            ]
        else:
            checks = self.get_system_checks(active_only=True)

        results = []

        for check in checks:
            now = datetime.now(timezone.utc)

            if not force:
                recent = self.db.fetch_one(
                    """
                    SELECT started_at
                    FROM control.system_check_runs
                    WHERE check_id = %s
                    ORDER BY started_at DESC
                    LIMIT 1
                    """,
                    (check["id"],),
                )

                if recent and recent.get("started_at"):
                    elapsed_minutes = (
                        now - recent["started_at"]
                    ).total_seconds() / 60

                    if elapsed_minutes < check["interval_minutes"]:
                        results.append({
                            "check_id": check["id"],
                            "code": check["code"],
                            "status": "skipped",
                            "summary": (
                                "Check skipped because its "
                                "configured interval has not elapsed."
                            ),
                        })
                        continue

            started_at = datetime.now(timezone.utc)

            run = self.db.fetch_one(
                """
                INSERT INTO control.system_check_runs (
                    check_id,
                    status,
                    result_summary,
                    result_data,
                    started_at
                )
                VALUES (
                    %s,
                    'running',
                    %s,
                    %s::JSONB,
                    %s
                )
                RETURNING id
                """,
                (
                    check["id"],
                    "Health check started.",
                    json.dumps({
                        "check_code": check["code"],
                    }, default=str),
                    started_at,
                ),
            )

            run_id = run["id"]

            try:
                result = self._run_system_health_check(check)

                completed_at = datetime.now(timezone.utc)
                duration_ms = int(
                    (
                        completed_at - started_at
                    ).total_seconds() * 1000
                )

                ticket_id = self._system_health_create_ticket(
                    check,
                    result,
                    run_id,
                    agent_id=agent_id,
                )

                notification_id = (
                    self._system_health_create_notification(
                        check,
                        result,
                        run_id,
                        ticket_id=ticket_id,
                        agent_id=agent_id,
                    )
                )

                self.db.execute_sql(
                    """
                    UPDATE control.system_check_runs
                    SET
                        status = %s,
                        result_summary = %s,
                        result_data = %s::JSONB,
                        completed_at = %s,
                        duration_ms = %s,
                        error_message = %s,
                        ticket_id = %s
                    WHERE id = %s
                    """,
                    (
                        result["status"],
                        result["summary"],
                        json.dumps(
                            result.get("data") or {},
                            default=str,
                        ),
                        completed_at,
                        duration_ms,
                        result.get("error"),
                        ticket_id,
                        run_id,
                    ),
                )

                results.append({
                    "run_id": run_id,
                    "check_id": check["id"],
                    "code": check["code"],
                    "status": result["status"],
                    "summary": result["summary"],
                    "data": result.get("data") or {},
                    "duration_ms": duration_ms,
                    "ticket_id": ticket_id,
                    "notification_id": notification_id,
                })

            except Exception as exc:
                completed_at = datetime.now(timezone.utc)
                duration_ms = int(
                    (
                        completed_at - started_at
                    ).total_seconds() * 1000
                )

                error_message = str(exc)

                self.db.execute_sql(
                    """
                    UPDATE control.system_check_runs
                    SET
                        status = 'failed',
                        result_summary = %s,
                        result_data = %s::JSONB,
                        completed_at = %s,
                        duration_ms = %s,
                        error_message = %s
                    WHERE id = %s
                    """,
                    (
                        "System health check execution failed.",
                        json.dumps({
                            "check_code": check["code"],
                        }),
                        completed_at,
                        duration_ms,
                        error_message,
                        run_id,
                    ),
                )

                results.append({
                    "run_id": run_id,
                    "check_id": check["id"],
                    "code": check["code"],
                    "status": "failed",
                    "summary": (
                        "System health check execution failed."
                    ),
                    "duration_ms": duration_ms,
                    "error": error_message,
                })

        return {
            "results": results,
            "count": len(results),
        }


    def get_system_health(self):
        """
        Return the current System Health dashboard state.
        """

        checks = self.get_latest_system_check_runs()

        healthy = sum(
            1 for row in checks
            if row.get("status") == "healthy"
        )

        warnings = sum(
            1 for row in checks
            if row.get("status") == "warning"
        )

        failed = sum(
            1 for row in checks
            if row.get("status") == "failed"
        )

        not_run = sum(
            1 for row in checks
            if not row.get("run_id")
        )

        if failed:
            overall_status = "failed"
        elif warnings:
            overall_status = "warning"
        elif not_run:
            overall_status = "not_run"
        else:
            overall_status = "healthy"

        return {
            "overall_status": overall_status,
            "summary": {
                "total": len(checks),
                "healthy": healthy,
                "warning": warnings,
                "failed": failed,
                "not_run": not_run,
            },
            "checks": checks,
        }

    def _system_health_create_notification(
        self,
        check,
        result,
        run_id,
        ticket_id=None,
        agent_id=None,
    ):
        if result["status"] not in (
            "failed",
            "warning",
        ):
            return None

        notification_type = (
            "system_health_failed"
            if result["status"] == "failed"
            else "system_health_warning"
        )

        severity = (
            "critical"
            if result["status"] == "failed"
            else "warning"
        )

        title = (
            "System Health Alert: "
            f"{check['name']}"
        )

        message = result["summary"]

        metadata = {
            "source": "system_health",
            "check_code": check["code"],
            "check_name": check["name"],
            "run_id": run_id,
            "result": result,
        }

        existing = self.db.fetch_one(
            """
            SELECT id
            FROM control.notifications
            WHERE notification_type = %s
            AND metadata->>'check_code' = %s
            AND metadata->>'run_id' = %s
            LIMIT 1
            """,
            (
                notification_type,
                check["code"],
                str(run_id),
            ),
        )

        if existing:
            return existing["id"]

        recipient_email = os.getenv(
            "FINSAGE_ALERT_EMAIL"
        )

        notification = (
            self.notification_service.create_notification(
                notification_type=notification_type,
                title=title,
                message=message,
                severity=severity,
                control_user_id=agent_id,
                ticket_id=ticket_id,
                metadata=metadata,
                send_email=bool(recipient_email),
                recipient_email=recipient_email,
            )
        )

        return (
            notification["id"]
            if notification
            else None
        )

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
        """Read-only Customer / Company 360 ecosystem view."""

        company = self.db.fetch_one("""
            SELECT
                c.id AS company_id,
                c.name AS company_name,
                c.client_code,
                c.system_company_code,
                c.industry,
                c.sub_industry,
                c.currency,
                c.country,
                c.organization_type,
                c.entity_kind,

                c.company_reg_no,
                c.tin,
                c.vat,

                c.company_email,
                c.company_phone,
                c.physical_address,
                c.postal_address,
                c.logo_url,

                c.is_active,
                c.created_at AS company_created_at,
                c.owner_user_id,

                c.created_via,
                c.source_customer_company_id,
                c.provisioning_context,

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

        # ---------------------------------------------------------
        # Users
        # ---------------------------------------------------------

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

            ORDER BY
                u.first_name,
                u.last_name,
                u.email
        """, (company_id,))

        # ---------------------------------------------------------
        # Control tickets
        # ---------------------------------------------------------

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
                t.updated_at,
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
                    WHERE status NOT IN ('resolved', 'closed')
                ) AS open,

                COUNT(*) FILTER (
                    WHERE status = 'new'
                ) AS new,

                COUNT(*) FILTER (
                    WHERE priority = 'p1_critical'
                    AND status NOT IN ('resolved', 'closed')
                ) AS critical,

                COUNT(*) AS total

            FROM control.tickets

            WHERE company_id = %s
            AND is_deleted = FALSE
        """, (company_id,))

        # ---------------------------------------------------------
        # Corporate relationships
        #
        # IMPORTANT:
        # These are NOT provisioning relationships.
        # ---------------------------------------------------------

        related_parties = self.db.fetch_all("""
            SELECT
                cr.id AS relationship_id,

                CASE
                    WHEN cr.parent_company_id = %s
                        THEN 'outbound'
                    ELSE 'inbound'
                END AS relationship_direction,

                CASE
                    WHEN cr.parent_company_id = %s
                        THEN cr.child_company_id
                    ELSE cr.parent_company_id
                END AS related_company_id,

                CASE
                    WHEN cr.parent_company_id = %s
                        THEN child.name
                    ELSE parent.name
                END AS related_company_name,

                cr.relationship_type,
                cr.ownership_percent,
                cr.voting_percent,
                cr.effective_interest_percent,
                cr.nci_percent,
                cr.control_basis,
                cr.consolidation_method,
                cr.effective_from,
                cr.effective_to,
                cr.acquisition_date,
                cr.disposal_date,
                cr.reporting_currency,
                cr.functional_currency,
                cr.include_in_group_reporting,
                cr.is_direct_ownership,
                cr.ultimate_parent_company_id,
                cr.last_reviewed_at

            FROM public.company_relationships cr

            JOIN public.companies parent
                ON parent.id = cr.parent_company_id

            JOIN public.companies child
                ON child.id = cr.child_company_id

            WHERE (
                cr.parent_company_id = %s
                OR cr.child_company_id = %s
            )

            AND cr.is_active = TRUE

            ORDER BY
                related_company_name ASC
        """, (
            company_id,
            company_id,
            company_id,
            company_id,
            company_id,
        ))

        # ---------------------------------------------------------
        # Companies provisioned by this company
        #
        # This is deliberately separate from corporate
        # company_relationships.
        # ---------------------------------------------------------

        provisioned_companies = self.db.fetch_all("""
            SELECT
                c.id AS company_id,
                c.name AS company_name,
                c.system_company_code,
                c.client_code,
                c.industry,
                c.sub_industry,
                c.currency,
                c.country,
                c.organization_type,
                c.entity_kind,
                c.is_active,
                c.created_at AS company_created_at,
                c.created_via,
                c.source_customer_company_id,
                c.provisioning_context

            FROM public.companies c

            WHERE c.source_customer_company_id = %s
            AND c.created_via = 'firm_client_provisioning'

            ORDER BY
                c.name ASC
        """, (company_id,))

        # ---------------------------------------------------------
        # Source company / provisioning parent
        # ---------------------------------------------------------

        source_company = None

        if company.get("source_customer_company_id"):
            source_company = self.db.fetch_one("""
                SELECT
                    c.id AS company_id,
                    c.name AS company_name,
                    c.system_company_code,
                    c.client_code,
                    c.industry,
                    c.sub_industry,
                    c.currency,
                    c.country,
                    c.organization_type,
                    c.entity_kind,
                    c.is_active,
                    c.created_at AS company_created_at
                FROM public.companies c
                WHERE c.id = %s
            """, (
                company["source_customer_company_id"],
            ))

        # ---------------------------------------------------------
        # Internal branches
        # ---------------------------------------------------------

        branches = self.db.fetch_all("""
            SELECT
                b.id AS branch_id,
                b.name,
                b.code,
                b.country,
                b.address,
                b.phone,
                b.email,
                b.manager_user_id,
                b.is_active,
                b.created_at

            FROM public.company_branches b

            WHERE b.company_id = %s

            ORDER BY
                b.name ASC
        """, (company_id,))

        # ---------------------------------------------------------
        # Company segments
        # ---------------------------------------------------------

        segments = self.db.fetch_all("""
            SELECT
                s.id AS segment_id,
                s.name,
                s.code,
                s.segment_type,
                s.description,
                s.is_active,
                s.created_at

            FROM public.company_segments s

            WHERE s.company_id = %s

            ORDER BY
                s.segment_type ASC,
                s.name ASC
        """, (company_id,))

        # ---------------------------------------------------------
        # Engagements
        #
        # Engagements live in the company's own schema.
        # Example: company_34.engagements
        # ---------------------------------------------------------

        engagements = []

        engagement_schema = f"company_{int(company_id)}"

        schema_exists = self.db.fetch_one("""
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.schemata
                WHERE schema_name = %s
            ) AS exists
        """, (engagement_schema,))

        if schema_exists and schema_exists.get("exists"):
            table_exists = self.db.fetch_one("""
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = %s
                    AND table_name = 'engagements'
                ) AS exists
            """, (engagement_schema,))

            if table_exists and table_exists.get("exists"):
                engagements = self.db.fetch_all(f"""
                    SELECT
                        id,
                        company_id,
                        customer_id,
                        target_company_id,
                        engagement_code,
                        engagement_name,
                        engagement_type,
                        status,
                        governance_mode,
                        reporting_cycle,
                        due_date,
                        start_date,
                        end_date,
                        manager_user_id,
                        partner_user_id,
                        created_by_user_id,
                        updated_by_user_id,
                        description,
                        scope_summary,
                        fiscal_year_end,
                        priority,
                        workflow_stage,
                        is_active,
                        created_at,
                        updated_at,
                        requires_workspace,
                        workspace_status,
                        workspace_source,
                        target_company_source

                    FROM "{engagement_schema}".engagements

                    WHERE is_active = TRUE

                    ORDER BY
                        due_date ASC NULLS LAST,
                        created_at DESC

                    LIMIT 100
                """)

        # ---------------------------------------------------------
        # Final Customer 360 response
        # ---------------------------------------------------------

        return {
            "company": company,
            "users": users,
            "tickets": tickets,
            "customer_support_tickets": self.get_company_support_tickets(company_id),
            "ticket_stats": ticket_stats or {
                "open": 0,
                "new": 0,
                "critical": 0,
                "total": 0,
            },
            "related_parties": related_parties,
            "provisioned_companies": provisioned_companies,
            "source_company": source_company,
            "branches": branches,
            "segments": segments,
            "engagements": engagements,
        }

    def get_company_subscription(
        self,
        company_id: int
    ) -> Optional[Dict[str, Any]]:
        """Read the current subscription for a company."""

        row = self.db.fetch_one("""
            SELECT
                cs.id AS subscription_id,
                cs.company_id,

                sp.id AS plan_id,
                sp.plan_code,
                sp.plan_name,
                sp.description AS plan_description,

                cs.status,
                cs.billing_status,
                cs.billing_interval,

                cs.currency,
                cs.amount,

                cs.started_at,
                cs.trial_ends_at,

                cs.current_period_start,
                cs.current_period_end,
                cs.next_billing_at,

                cs.cancelled_at,
                cs.cancellation_effective_at,

                cs.suspended_at,
                cs.resumed_at,

                cs.external_subscription_id,
                cs.external_customer_id,
                cs.payment_provider,

                cs.metadata,

                cs.created_at,
                cs.updated_at

            FROM public.company_subscriptions cs

            JOIN public.subscription_plans sp
                ON sp.id = cs.plan_id

            WHERE cs.company_id = %s

            ORDER BY
                cs.created_at DESC

            LIMIT 1
        """, (company_id,))

        return row

    def get_subscription_billing(
        self,
        company_id: int,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """Read subscription billing history for a company."""

        limit = min(max(limit, 1), 100)

        return self.db.fetch_all("""
            SELECT
                sb.id AS billing_id,
                sb.subscription_id,
                sb.company_id,

                sb.billing_reference,
                sb.invoice_reference,

                sb.billing_status,

                sb.amount,
                sb.currency,

                sb.billing_period_start,
                sb.billing_period_end,

                sb.due_at,
                sb.paid_at,
                sb.failed_at,

                sb.payment_provider,
                sb.external_payment_id,

                sb.failure_reason,

                sb.created_at,
                sb.updated_at

            FROM public.subscription_billing sb

            WHERE sb.company_id = %s

            ORDER BY
                sb.created_at DESC

            LIMIT %s
        """, (company_id, limit))

    def get_subscription_events(
        self,
        company_id: int,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Read subscription lifecycle events for a company."""

        limit = min(max(limit, 1), 100)

        return self.db.fetch_all("""
            SELECT
                se.id AS event_id,
                se.subscription_id,
                se.company_id,

                se.event_type,
                se.event_status,
                se.event_reference,

                se.occurred_at,
                se.effective_at,

                se.description,
                se.metadata,

                se.created_at

            FROM public.subscription_events se

            WHERE se.company_id = %s

            ORDER BY
                se.occurred_at DESC

            LIMIT %s
        """, (company_id, limit))

    def get_subscription_visibility(
        self,
        company_id: int
    ) -> Optional[Dict[str, Any]]:
        """Complete read-only subscription visibility for a company."""

        company = self.db.fetch_one("""
            SELECT
                id AS company_id,
                name AS company_name,
                currency,
                is_active
            FROM public.companies
            WHERE id = %s
        """, (company_id,))

        if not company:
            return None

        subscription = self.get_company_subscription(company_id)

        billing = self.get_subscription_billing(
            company_id,
            limit=20
        )

        events = self.get_subscription_events(
            company_id,
            limit=50
        )

        return {
            "company": company,
            "subscription": subscription,
            "billing": billing,
            "events": events,
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

    def get_company_support_tickets(
        self,
        company_id: int,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Read customer-created support tickets from the company's schema."""

        schema = f"company_{int(company_id)}"

        exists = self.db.fetch_one(
            """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = %s
                    AND table_name = 'support_tickets'
                ) AS exists
            """,
            (schema,)
        )

        if not exists or not exists["exists"]:
            return []

        limit = max(1, min(int(limit), 100))

        return self.db.fetch_all(
            f"""
                SELECT
                    id,
                    company_id,
                    user_id,
                    email,
                    subject,
                    description,
                    status,
                    priority,
                    assigned_to,
                    resolved_at,
                    notes,
                    created_by,
                    created_at,
                    updated_at
                FROM {schema}.support_tickets
                WHERE company_id = %s
                ORDER BY created_at DESC
                LIMIT %s
            """,
            (company_id, limit)
        )

    def create_ticket_from_customer_ticket(
        self,
        company_id: int,
        support_ticket_id: int,
        agent_id: int
    ) -> Optional[Dict[str, Any]]:
        """Create a Control ticket from a customer-side support ticket."""

        schema = f"company_{int(company_id)}"

        exists = self.db.fetch_one(
            """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = %s
                    AND table_name = 'support_tickets'
                ) AS exists
            """,
            (schema,)
        )

        if not exists or not exists["exists"]:
            return None

        source = self.db.fetch_one(
            f"""
                SELECT
                    id,
                    company_id,
                    user_id,
                    email,
                    subject,
                    description,
                    status,
                    priority,
                    assigned_to,
                    notes,
                    created_by,
                    created_at,
                    updated_at
                FROM {schema}.support_tickets
                WHERE id = %s
                AND company_id = %s
            """,
            (support_ticket_id, company_id)
        )

        if not source:
            return None

        company = self.db.fetch_one(
            """
                SELECT id, name
                FROM public.companies
                WHERE id = %s
            """,
            (company_id,)
        )

        priority_map = {
            "low": "p4_low",
            "normal": "p3_medium",
            "high": "p2_high",
            "urgent": "p1_critical",
        }

        ticket_data = {
            "ticket_type": "support",
            "subject": source["subject"],
            "description": source["description"] or "Customer support request.",
            "company_id": company_id,
            "company_name": company["name"] if company else None,
            "user_id": source["user_id"],
            "user_email": source["email"],
            "user_name": None,
            "product": "finsage",
            "priority": priority_map.get(
                source["priority"],
                "p3_medium"
            ),
            "support_context": {
                "source": "customer_support_ticket",
                "source_schema": schema,
                "source_ticket_id": source["id"],
            },
        }

        return self.create_ticket(
            ticket_data,
            agent_id=agent_id
        )

    def create_ticket_from_system_error(self, event_id, agent_id):
        event_id = int(event_id)

        event = self.get_system_error(event_id)

        if not event:
            raise ValueError("System error not found")

        if event.get("ticket_id"):
            return self.get_ticket(event["ticket_id"])

        occurrence = event.get("latest_occurrence") or {}

        ticket_data = {
            "ticket_type": "system_error",
            "subject": (
                event.get("message")
                or event.get("event_code")
                or f"System error #{event_id}"
            ),
            "description": event.get("message"),
            "priority": event.get("severity", "p2_high"),
            "company_id": event.get("company_id"),
            "company_name": event.get("company_name"),
            "user_id": event.get("user_id"),
            "user_email": event.get("user_email"),
            "product": event.get("product", "finsage"),
            "module_code": event.get("module_code"),
            "page_code": event.get("page_code"),
            "action_code": event.get("action_code"),
            "transaction_ref": event.get("transaction_ref"),
            "error_ref": event.get("error_ref"),
            "support_context": {
                "source": "system_error",
                "system_event_id": event_id,
                "event_code": event.get("event_code"),
                "exception_type": event.get("exception_type"),
                "occurrence_count": event.get("occurrence_count"),
                "request_path": occurrence.get("request_path"),
                "http_method": occurrence.get("http_method"),
                "http_status": occurrence.get("http_status"),
            },
        }

        ticket = self.create_ticket(
            ticket_data,
            agent_id=agent_id,
        )

        self.db.execute_sql(
            """
            UPDATE control.system_events
            SET
                ticket_id = %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            (ticket["id"], event_id),
        )

        return ticket

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
        assigned_agent_id = data.get("assigned_agent_id")
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
                assigned_agent_id,
                created_by,
                tags,
                assigned_at
            )
            VALUES (
                %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s
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
            data.get("assigned_agent_id"),
            agent_id,
            tags,
            datetime.now(timezone.utc) if data.get("assigned_agent_id") else None,
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

    def audit(
        self,
        *,
        action,
        entity_type=None,
        entity_id=None,
        description=None,
        before_data=None,
        after_data=None,
        metadata=None,
        request=None,
        control_user_id=None,
    ):
        if request is not None:
            ip_address = request.headers.get(
                "X-Forwarded-For",
                request.remote_addr,
            )

            if ip_address and "," in ip_address:
                ip_address = (
                    ip_address.split(",")[0].strip()
                )

            user_agent = request.headers.get(
                "User-Agent"
            )
        else:
            ip_address = None
            user_agent = None

        return self.audit_service.record(
            control_user_id=control_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            description=description,
            ip_address=ip_address,
            user_agent=user_agent,
            before_data=before_data,
            after_data=after_data,
            metadata=metadata,
        )

    # register_agent() intentionally removed.
    #
    # Control users must be explicitly provisioned in
    # control.control_users. A normal FinSage user must never become
    # a Control user automatically by logging in.