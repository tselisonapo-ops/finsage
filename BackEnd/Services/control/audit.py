import json


class AuditService:
    def __init__(self, db):
        self.db = db

    def record(
        self,
        *,
        control_user_id=None,
        action,
        entity_type=None,
        entity_id=None,
        description=None,
        ip_address=None,
        user_agent=None,
        before_data=None,
        after_data=None,
        metadata=None,
    ):
        """
        Record a Control audit event.

        Audit failure must never break the operation
        that generated the audit event.
        """

        try:
            row = self.db.fetch_one(
                """
                INSERT INTO control.audit_log (
                    control_user_id,
                    action,
                    entity_type,
                    entity_id,
                    description,
                    ip_address,
                    user_agent,
                    before_data,
                    after_data,
                    metadata
                )
                VALUES (
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s::INET,
                    %s::JSONB,
                    %s::JSONB,
                    %s::JSONB
                )
                RETURNING id
                """,
                (
                    control_user_id,
                    action,
                    entity_type,
                    entity_id,
                    description,
                    ip_address,
                    user_agent,
                    json.dumps(
                        before_data,
                        default=str,
                    )
                    if before_data is not None
                    else None,
                    json.dumps(
                        after_data,
                        default=str,
                    )
                    if after_data is not None
                    else None,
                    json.dumps(
                        metadata,
                        default=str,
                    )
                    if metadata is not None
                    else None,
                ),
            )

            return row["id"] if row else None

        except Exception:
            return None

    def get_event(self, audit_id):
        return self.db.fetch_one(
            """
            SELECT
                a.id,
                a.control_user_id,
                u.display_name AS control_user_name,
                u.email AS control_user_email,
                a.action,
                a.entity_type,
                a.entity_id,
                a.description,
                a.ip_address,
                a.user_agent,
                a.before_data,
                a.after_data,
                a.metadata,
                a.created_at
            FROM control.audit_log a
            LEFT JOIN control.control_users u
                ON u.id = a.control_user_id
            WHERE a.id = %s
            LIMIT 1
            """,
            (audit_id,),
        )

    def get_events(
        self,
        *,
        limit=50,
        offset=0,
        control_user_id=None,
        action=None,
        entity_type=None,
        entity_id=None,
        company_id=None,
        date_from=None,
        date_to=None,
    ):
        limit = max(
            1,
            min(int(limit or 50), 200),
        )

        offset = max(
            0,
            int(offset or 0),
        )

        conditions = []
        params = []

        if control_user_id is not None:
            conditions.append(
                "a.control_user_id = %s"
            )
            params.append(control_user_id)

        if action:
            conditions.append(
                "a.action = %s"
            )
            params.append(action)

        if entity_type:
            conditions.append(
                "a.entity_type = %s"
            )
            params.append(entity_type)

        if entity_id is not None:
            conditions.append(
                "a.entity_id = %s"
            )
            params.append(entity_id)

        if company_id is not None:
            conditions.append(
                """
                (
                    a.metadata->>'company_id' = %s
                    OR a.metadata->>'companyId' = %s
                )
                """
            )
            params.extend([
                str(company_id),
                str(company_id),
            ])

        if date_from:
            conditions.append(
                "a.created_at >= %s"
            )
            params.append(date_from)

        if date_to:
            conditions.append(
                "a.created_at <= %s"
            )
            params.append(date_to)

        where_sql = ""

        if conditions:
            where_sql = (
                "WHERE "
                + " AND ".join(conditions)
            )

        rows = self.db.fetch_all(
            f"""
            SELECT
                a.id,
                a.control_user_id,
                u.display_name AS control_user_name,
                u.email AS control_user_email,
                a.action,
                a.entity_type,
                a.entity_id,
                a.description,
                a.ip_address,
                a.user_agent,
                a.before_data,
                a.after_data,
                a.metadata,
                a.created_at
            FROM control.audit_log a
            LEFT JOIN control.control_users u
                ON u.id = a.control_user_id
            {where_sql}
            ORDER BY a.created_at DESC
            LIMIT %s
            OFFSET %s
            """,
            tuple(params + [
                limit,
                offset,
            ]),
        )

        count_row = self.db.fetch_one(
            f"""
            SELECT COUNT(*) AS total
            FROM control.audit_log a
            {where_sql}
            """,
            tuple(params),
        )

        total = (
            int(count_row["total"] or 0)
            if count_row
            else 0
        )

        return {
            "items": rows,
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    def get_actions(self):
        rows = self.db.fetch_all(
            """
            SELECT DISTINCT action
            FROM control.audit_log
            ORDER BY action
            """
        )

        return [
            row["action"]
            for row in rows
        ]

    def get_entity_types(self):
        rows = self.db.fetch_all(
            """
            SELECT DISTINCT entity_type
            FROM control.audit_log
            WHERE entity_type IS NOT NULL
            ORDER BY entity_type
            """
        )

        return [
            row["entity_type"]
            for row in rows
        ]