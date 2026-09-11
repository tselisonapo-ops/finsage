from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional


class AutomationService:
    def __init__(self, db, control_service):
        self.db = db
        self.control_service = control_service

    def _now(self):
        return datetime.now(timezone.utc)

    def _json(self, value):
        if value is None:
            return {}
        return value

    def get_sla(self, priority):
        return self.db.fetch_one(
            """
            SELECT
                id,
                name,
                priority,
                response_minutes,
                resolution_hours,
                is_active
            FROM control.slas
            WHERE priority = %s
              AND is_active = TRUE
            LIMIT 1
            """,
            (priority,),
        )

    def get_open_tickets(self):
        return self.db.fetch_all(
            """
            SELECT
                t.*,
                s.name AS sla_name,
                s.response_minutes,
                s.resolution_hours
            FROM control.tickets t
            LEFT JOIN control.slas s
                ON s.id = t.sla_id
            WHERE COALESCE(t.is_deleted, FALSE) = FALSE
              AND t.status NOT IN ('resolved', 'closed', 'cancelled')
            ORDER BY t.created_at ASC
            """
        )

    def ensure_ticket_sla(self, ticket):
        if ticket.get("sla_id"):
            return ticket

        sla = self.get_sla(ticket.get("priority"))

        if not sla:
            return ticket

        self.db.execute(
            """
            UPDATE control.tickets
            SET sla_id = %s
            WHERE id = %s
              AND sla_id IS NULL
            """,
            (sla["id"], ticket["id"]),
        )

        ticket["sla_id"] = sla["id"]
        ticket["sla_name"] = sla["name"]
        ticket["response_minutes"] = sla["response_minutes"]
        ticket["resolution_hours"] = sla["resolution_hours"]

        return ticket

    def create_tickets_from_system_errors(self):
        events = self.db.fetch_all(
            """
            SELECT
                id,
                event_code,
                severity,
                status,
                message,
                exception_type,
                exception_message,
                created_at
            FROM control.system_events
            WHERE status = 'open'
              AND ticket_id IS NULL
            ORDER BY created_at ASC
            LIMIT 100
            """
        )

        created = []

        for event in events:
            ticket = self._create_system_error_ticket(event)

            if ticket:
                created.append(ticket)

        return {
            "checked": len(events),
            "created": len(created),
            "tickets": created,
        }

    def _create_system_error_ticket(self, event):
        severity_to_priority = {
            "p1_critical": "p1_critical",
            "p2_high": "p2_high",
            "p3_medium": "p3_medium",
            "p4_low": "p4_low",
        }

        priority = severity_to_priority.get(
            event.get("severity"),
            "p3_medium",
        )

        existing = self.db.fetch_one(
            """
            SELECT id
            FROM control.tickets
            WHERE error_ref = %s
              AND COALESCE(is_deleted, FALSE) = FALSE
            ORDER BY id DESC
            LIMIT 1
            """,
            (str(event["id"]),),
        )

        if existing:
            self.db.execute(
                """
                UPDATE control.system_events
                SET ticket_id = %s
                WHERE id = %s
                  AND ticket_id IS NULL
                """,
                (existing["id"], event["id"]),
            )
            return None

        ticket = self.control_service.create_ticket(
            {
                "ticket_type": "system_error",
                "subject": (
                    f"System Error: "
                    f"{event.get('event_code') or event.get('message')}"
                )[:500],
                "description": (
                    event.get("exception_message")
                    or event.get("message")
                    or "Automated system error."
                ),
                "priority": priority,
                "product": "finsage",
                "error_ref": str(event["id"]),
                "support_context": {
                    "source": "system_error_automation",
                    "system_event_id": event["id"],
                    "event_code": event.get("event_code"),
                    "severity": event.get("severity"),
                },
                "tags": [
                    "automated",
                    "system_error",
                ],
            }
        )

        if not ticket:
            return None

        ticket_id = ticket.get("id")

        if not ticket_id:
            return None

        self.db.execute(
            """
            UPDATE control.system_events
            SET ticket_id = %s
            WHERE id = %s
            """,
            (ticket_id, event["id"]),
        )

        self.control_service.audit(
            action="automation.system_error_ticket_created",
            entity_type="ticket",
            entity_id=ticket_id,
            description=(
                "Automation created a Control ticket "
                "from a system error."
            ),
            metadata={
                "system_event_id": event["id"],
                "event_code": event.get("event_code"),
                "priority": priority,
            },
        )

        return ticket

    def monitor_slas(self):
        tickets = self.get_open_tickets()

        warnings = []
        breaches = []

        now = self._now()

        for ticket in tickets:
            ticket = self.ensure_ticket_sla(ticket)

            created_at = ticket.get("created_at")

            if not created_at:
                continue

            if created_at.tzinfo is None:
                created_at = created_at.replace(
                    tzinfo=timezone.utc
                )

            response_minutes = ticket.get("response_minutes")
            resolution_hours = ticket.get("resolution_hours")

            if not response_minutes or not resolution_hours:
                continue

            response_deadline = (
                created_at +
                timedelta(minutes=int(response_minutes))
            )

            resolution_deadline = (
                created_at +
                timedelta(hours=int(resolution_hours))
            )

            if (
                not ticket.get("first_response_at")
                and now >= response_deadline
            ):
                breaches.append({
                    "ticket_id": ticket["id"],
                    "ticket_number": ticket["ticket_number"],
                    "type": "response",
                    "deadline": response_deadline.isoformat(),
                })

            elif (
                not ticket.get("first_response_at")
                and now >= response_deadline - timedelta(
                    minutes=max(5, int(response_minutes) // 2)
                )
            ):
                warnings.append({
                    "ticket_id": ticket["id"],
                    "ticket_number": ticket["ticket_number"],
                    "type": "response",
                    "deadline": response_deadline.isoformat(),
                })

            if now >= resolution_deadline:
                breaches.append({
                    "ticket_id": ticket["id"],
                    "ticket_number": ticket["ticket_number"],
                    "type": "resolution",
                    "deadline": resolution_deadline.isoformat(),
                })
            elif now >= resolution_deadline - timedelta(
                minutes=max(
                    15,
                    int(resolution_hours * 60) // 4,
                )
            ):
                warnings.append({
                    "ticket_id": ticket["id"],
                    "ticket_number": ticket["ticket_number"],
                    "type": "resolution",
                    "deadline": resolution_deadline.isoformat(),
                })

        return {
            "checked": len(tickets),
            "warnings": warnings,
            "breaches": breaches,
        }

    def escalate_tickets(self):
        tickets = self.get_open_tickets()
        escalated = []

        now = self._now()

        for ticket in tickets:
            ticket = self.ensure_ticket_sla(ticket)

            created_at = ticket.get("created_at")

            if not created_at:
                continue

            if created_at.tzinfo is None:
                created_at = created_at.replace(
                    tzinfo=timezone.utc
                )

            resolution_hours = ticket.get("resolution_hours")

            if not resolution_hours:
                continue

            deadline = (
                created_at +
                timedelta(hours=int(resolution_hours))
            )

            if now < deadline:
                continue

            result = self._escalate_ticket(
                ticket,
                reason="resolution_sla_breach",
            )

            if result:
                escalated.append(result)

        return {
            "checked": len(tickets),
            "escalated": len(escalated),
            "tickets": escalated,
        }

    def _escalate_ticket(self, ticket, reason):
        previous_priority = ticket.get("priority")

        next_priority = {
            "p4_low": "p3_medium",
            "p3_medium": "p2_high",
            "p2_high": "p1_critical",
            "p1_critical": "p1_critical",
        }.get(
            previous_priority,
            "p3_medium",
        )

        if next_priority == previous_priority:
            return None

        duplicate = self.db.fetch_one(
            """
            SELECT id
            FROM control.ticket_escalations
            WHERE ticket_id = %s
              AND reason = %s
            ORDER BY id DESC
            LIMIT 1
            """,
            (
                ticket["id"],
                reason,
            ),
        )

        if duplicate:
            return None

        new_sla = self.get_sla(next_priority)

        self.db.execute(
            """
            UPDATE control.tickets
            SET
                priority = %s,
                sla_id = %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            (
                next_priority,
                new_sla["id"] if new_sla else None,
                ticket["id"],
            ),
        )

        escalation = self.db.fetch_one(
            """
            INSERT INTO control.ticket_escalations (
                ticket_id,
                escalation_level,
                reason,
                previous_agent_id,
                new_agent_id,
                previous_priority,
                new_priority,
                notes
            )
            VALUES (
                %s,
                COALESCE(
                    (
                        SELECT MAX(escalation_level) + 1
                        FROM control.ticket_escalations
                        WHERE ticket_id = %s
                    ),
                    1
                ),
                %s,
                %s,
                NULL,
                %s,
                %s,
                %s
            )
            RETURNING *
            """,
            (
                ticket["id"],
                ticket["id"],
                reason,
                ticket.get("assigned_agent_id"),
                previous_priority,
                next_priority,
                "Automatic SLA escalation.",
            ),
        )

        self.control_service.audit(
            action="automation.ticket_escalated",
            entity_type="ticket",
            entity_id=ticket["id"],
            description=(
                "Automation escalated a ticket "
                "after an SLA breach."
            ),
            before_data={
                "priority": previous_priority,
                "assigned_agent_id": ticket.get(
                    "assigned_agent_id"
                ),
            },
            after_data={
                "priority": next_priority,
            },
            metadata={
                "reason": reason,
                "escalation_id": (
                    escalation.get("id")
                    if escalation
                    else None
                ),
            },
        )

        return escalation

    def run(self, job_code=None):
        jobs = self.db.fetch_all(
            """
            SELECT *
            FROM control.automation_jobs
            WHERE is_active = TRUE
              AND (
                    %s IS NULL
                    OR job_code = %s
              )
            ORDER BY id
            """,
            (job_code, job_code),
        )

        results = []

        for job in jobs:
            started = self._now()

            run = self.db.fetch_one(
                """
                INSERT INTO control.automation_runs (
                    job_id,
                    status,
                    started_at
                )
                VALUES (%s, 'running', %s)
                RETURNING id
                """,
                (
                    job["id"],
                    started,
                ),
            )

            run_id = run["id"]

            try:
                if job["job_code"] == "ticket_automation":
                    result = self.create_tickets_from_system_errors()

                elif job["job_code"] == "sla_monitor":
                    result = self.monitor_slas()

                elif job["job_code"] == "ticket_escalation":
                    result = self.escalate_tickets()

                else:
                    result = {
                        "status": "skipped",
                        "reason": "Unknown automation job.",
                    }

                completed = self._now()

                duration_ms = int(
                    (completed - started).total_seconds() * 1000
                )

                self.db.execute(
                    """
                    UPDATE control.automation_runs
                    SET
                        status = 'completed',
                        completed_at = %s,
                        duration_ms = %s,
                        result_data = %s::jsonb
                    WHERE id = %s
                    """,
                    (
                        completed,
                        duration_ms,
                        self.db.json_dumps(result),
                        run_id,
                    ),
                )

                self.db.execute(
                    """
                    UPDATE control.automation_jobs
                    SET
                        last_run_at = %s,
                        next_run_at = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        completed,
                        completed + timedelta(
                            minutes=job["interval_minutes"]
                        ),
                        job["id"],
                    ),
                )

                results.append({
                    "job_code": job["job_code"],
                    "run_id": run_id,
                    "status": "completed",
                    "result": result,
                })

            except Exception as exc:
                completed = self._now()

                duration_ms = int(
                    (completed - started).total_seconds() * 1000
                )

                self.db.execute(
                    """
                    UPDATE control.automation_runs
                    SET
                        status = 'failed',
                        completed_at = %s,
                        duration_ms = %s,
                        error_message = %s
                    WHERE id = %s
                    """,
                    (
                        completed,
                        duration_ms,
                        str(exc),
                        run_id,
                    ),
                )

                results.append({
                    "job_code": job["job_code"],
                    "run_id": run_id,
                    "status": "failed",
                    "error": str(exc),
                })

        return {
            "jobs": results,
            "count": len(results),
        }