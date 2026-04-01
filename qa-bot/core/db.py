from __future__ import annotations

from typing import Any

import psycopg2
import psycopg2.extras

from config.settings import settings


class DB:
    def __init__(self) -> None:
        self.conn = psycopg2.connect(
            host=settings.db_host,
            port=settings.db_port,
            dbname=settings.db_name,
            user=settings.db_user,
            password=settings.db_password,
            cursor_factory=psycopg2.extras.RealDictCursor,
        )
        self.conn.autocommit = True

    def fetch_one(self, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        with self.conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            return dict(row) if row else None

    def fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self.conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            return [dict(r) for r in rows]

    def close(self) -> None:
        self.conn.close()

    @staticmethod
    def schema_name(company_id: int) -> str:
        return f"company_{company_id}"

    def get_journal(self, company_id: int, journal_id: int) -> dict[str, Any] | None:
        schema = self.schema_name(company_id)
        sql = f"""
            SELECT *
            FROM {schema}.journal
            WHERE company_id = %s
              AND id = %s
        """
        return self.fetch_one(sql, (company_id, journal_id))

    def get_journal_lines(self, company_id: int, journal_id: int) -> list[dict[str, Any]]:
        schema = self.schema_name(company_id)
        sql = f"""
            SELECT *
            FROM {schema}.journal_lines
            WHERE company_id = %s
              AND journal_id = %s
            ORDER BY id
        """
        return self.fetch_all(sql, (company_id, journal_id))

    def trial_balance_totals(self, company_id: int) -> dict[str, Any]:
        schema = self.schema_name(company_id)
        sql = f"""
            SELECT
                COALESCE(SUM(debit), 0)  AS total_debit,
                COALESCE(SUM(credit), 0) AS total_credit
            FROM {schema}.journal_lines
            WHERE company_id = %s
        """
        return self.fetch_one(sql, (company_id,)) or {"total_debit": 0, "total_credit": 0}