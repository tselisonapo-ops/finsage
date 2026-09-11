import json
import os
import smtplib
import ssl

from email.message import EmailMessage


class NotificationService:
    def __init__(self, db):
        self.db = db

    # ============================================================
    # NOTIFICATIONS
    # ============================================================

    def create_notification(
        self,
        *,
        notification_type,
        title,
        message,
        severity="info",
        control_user_id=None,
        ticket_id=None,
        system_event_id=None,
        company_id=None,
        metadata=None,
        send_email=True,
        recipient_email=None,
    ):
        metadata = metadata or {}

        row = self.db.fetch_one(
            """
            INSERT INTO control.notifications (
                notification_type,
                title,
                message,
                severity,
                control_user_id,
                ticket_id,
                system_event_id,
                company_id,
                metadata
            )
            VALUES (
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s::JSONB
            )
            RETURNING id
            """,
            (
                notification_type,
                title,
                message,
                severity,
                control_user_id,
                ticket_id,
                system_event_id,
                company_id,
                json.dumps(metadata, default=str),
            ),
        )

        notification_id = row["id"] if row else None

        if not notification_id:
            return None

        if send_email and recipient_email:
            self.send_notification_email(
                notification_id=notification_id,
                recipient_email=recipient_email,
                subject=title,
                message=message,
                ticket_id=ticket_id,
            )

        return self.get_notification(notification_id)

    # ============================================================
    # READ
    # ============================================================

    def get_notification(self, notification_id):
        return self.db.fetch_one(
            """
            SELECT
                id,
                notification_type,
                title,
                message,
                severity,
                control_user_id,
                ticket_id,
                system_event_id,
                company_id,
                metadata,
                is_read,
                read_at,
                created_at
            FROM control.notifications
            WHERE id = %s
            LIMIT 1
            """,
            (notification_id,),
        )

    def get_notifications(
        self,
        control_user_id,
        limit=50,
        unread_only=False,
    ):
        limit = max(1, min(int(limit or 50), 200))

        if unread_only:
            return self.db.fetch_all(
                """
                SELECT
                    id,
                    notification_type,
                    title,
                    message,
                    severity,
                    control_user_id,
                    ticket_id,
                    system_event_id,
                    company_id,
                    metadata,
                    is_read,
                    read_at,
                    created_at
                FROM control.notifications
                WHERE control_user_id = %s
                  AND is_read = FALSE
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (
                    control_user_id,
                    limit,
                ),
            )

        return self.db.fetch_all(
            """
            SELECT
                id,
                notification_type,
                title,
                message,
                severity,
                control_user_id,
                ticket_id,
                system_event_id,
                company_id,
                metadata,
                is_read,
                read_at,
                created_at
            FROM control.notifications
            WHERE control_user_id = %s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (
                control_user_id,
                limit,
            ),
        )

    def get_unread_count(self, control_user_id):
        row = self.db.fetch_one(
            """
            SELECT COUNT(*) AS unread_count
            FROM control.notifications
            WHERE control_user_id = %s
              AND is_read = FALSE
            """,
            (control_user_id,),
        )

        return int(row["unread_count"] or 0) if row else 0

    def mark_notification_read(
        self,
        notification_id,
        control_user_id,
    ):
        self.db.execute_sql(
            """
            UPDATE control.notifications
            SET
                is_read = TRUE,
                read_at = NOW()
            WHERE id = %s
              AND control_user_id = %s
            """,
            (
                notification_id,
                control_user_id,
            ),
        )

        return self.get_notification(notification_id)

    def mark_all_notifications_read(
        self,
        control_user_id,
    ):
        self.db.execute_sql(
            """
            UPDATE control.notifications
            SET
                is_read = TRUE,
                read_at = NOW()
            WHERE control_user_id = %s
              AND is_read = FALSE
            """,
            (control_user_id,),
        )

        return {
            "success": True,
            "unread_count": 0,
        }

    # ============================================================
    # PREFERENCES
    # ============================================================

    def get_preferences(self, control_user_id):
        row = self.db.fetch_one(
            """
            SELECT
                id,
                control_user_id,
                email_enabled,
                in_app_enabled,
                system_health_enabled,
                ticket_enabled,
                subscription_enabled,
                security_enabled,
                created_at,
                updated_at
            FROM control.notification_preferences
            WHERE control_user_id = %s
            LIMIT 1
            """,
            (control_user_id,),
        )

        if row:
            return row

        self.db.fetch_one(
            """
            INSERT INTO control.notification_preferences (
                control_user_id
            )
            VALUES (%s)
            ON CONFLICT (control_user_id)
            DO NOTHING
            RETURNING id
            """,
            (control_user_id,),
        )

        return self.db.fetch_one(
            """
            SELECT
                id,
                control_user_id,
                email_enabled,
                in_app_enabled,
                system_health_enabled,
                ticket_enabled,
                subscription_enabled,
                security_enabled,
                created_at,
                updated_at
            FROM control.notification_preferences
            WHERE control_user_id = %s
            LIMIT 1
            """,
            (control_user_id,),
        )

    def update_preferences(
        self,
        control_user_id,
        data,
    ):
        current = self.get_preferences(control_user_id)

        email_enabled = data.get(
            "email_enabled",
            current["email_enabled"],
        )

        in_app_enabled = data.get(
            "in_app_enabled",
            current["in_app_enabled"],
        )

        system_health_enabled = data.get(
            "system_health_enabled",
            current["system_health_enabled"],
        )

        ticket_enabled = data.get(
            "ticket_enabled",
            current["ticket_enabled"],
        )

        subscription_enabled = data.get(
            "subscription_enabled",
            current["subscription_enabled"],
        )

        security_enabled = data.get(
            "security_enabled",
            current["security_enabled"],
        )

        self.db.execute_sql(
            """
            UPDATE control.notification_preferences
            SET
                email_enabled = %s,
                in_app_enabled = %s,
                system_health_enabled = %s,
                ticket_enabled = %s,
                subscription_enabled = %s,
                security_enabled = %s,
                updated_at = NOW()
            WHERE control_user_id = %s
            """,
            (
                bool(email_enabled),
                bool(in_app_enabled),
                bool(system_health_enabled),
                bool(ticket_enabled),
                bool(subscription_enabled),
                bool(security_enabled),
                control_user_id,
            ),
        )

        return self.get_preferences(control_user_id)

    # ============================================================
    # EMAIL
    # ============================================================

    def send_notification_email(
        self,
        *,
        notification_id,
        recipient_email,
        subject,
        message,
        ticket_id=None,
    ):
        log = self.db.fetch_one(
            """
            INSERT INTO control.notification_log (
                ticket_id,
                recipient_email,
                channel,
                subject,
                status
            )
            VALUES (
                %s,
                %s,
                'email',
                %s,
                'pending'
            )
            RETURNING id
            """,
            (
                ticket_id,
                recipient_email,
                subject,
            ),
        )

        log_id = log["id"] if log else None

        try:
            provider_message_id = self._send_email(
                recipient_email=recipient_email,
                subject=subject,
                body=message,
            )

            self.db.execute_sql(
                """
                UPDATE control.notification_log
                SET
                    status = 'sent',
                    provider_message_id = %s,
                    sent_at = NOW()
                WHERE id = %s
                """,
                (
                    provider_message_id,
                    log_id,
                ),
            )

            return {
                "success": True,
                "notification_id": notification_id,
                "log_id": log_id,
                "status": "sent",
                "provider_message_id": provider_message_id,
            }

        except Exception as exc:
            self.db.execute_sql(
                """
                UPDATE control.notification_log
                SET
                    status = 'failed',
                    error_message = %s
                WHERE id = %s
                """,
                (
                    str(exc),
                    log_id,
                ),
            )

            return {
                "success": False,
                "notification_id": notification_id,
                "log_id": log_id,
                "status": "failed",
                "error": str(exc),
            }

    def _send_email(
        self,
        *,
        recipient_email,
        subject,
        body,
    ):
        host = os.getenv("FINSAGE_SMTP_HOST")
        port = int(
            os.getenv(
                "FINSAGE_SMTP_PORT",
                "587",
            )
        )

        username = os.getenv("FINSAGE_SMTP_USERNAME")
        password = os.getenv("FINSAGE_SMTP_PASSWORD")

        from_email = os.getenv(
            "FINSAGE_SMTP_FROM",
            username,
        )

        use_ssl = (
            os.getenv(
                "FINSAGE_SMTP_SSL",
                "false",
            ).lower()
            in ("1", "true", "yes")
        )

        use_starttls = (
            os.getenv(
                "FINSAGE_SMTP_STARTTLS",
                "true",
            ).lower()
            in ("1", "true", "yes")
        )

        if not host:
            raise RuntimeError(
                "FINSAGE_SMTP_HOST is not configured."
            )

        if not from_email:
            raise RuntimeError(
                "FINSAGE_SMTP_FROM or FINSAGE_SMTP_USERNAME "
                "is required."
            )

        message = EmailMessage()

        message["From"] = from_email
        message["To"] = recipient_email
        message["Subject"] = subject

        message.set_content(body)

        if use_ssl:
            with smtplib.SMTP_SSL(
                host,
                port,
                timeout=20,
                context=ssl.create_default_context(),
            ) as smtp:
                if username and password:
                    smtp.login(
                        username,
                        password,
                    )

                smtp.send_message(message)

        else:
            with smtplib.SMTP(
                host,
                port,
                timeout=20,
            ) as smtp:
                smtp.ehlo()

                if use_starttls:
                    smtp.starttls(
                        context=ssl.create_default_context()
                    )
                    smtp.ehlo()

                if username and password:
                    smtp.login(
                        username,
                        password,
                    )

                smtp.send_message(message)

        return None