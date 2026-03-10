# BackEnd/Services/assets/ppe_db.py
import os
import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from typing import Optional, Iterator

def _get_dsn() -> str:
    dsn = os.environ.get("MASTER_DB_DSN") or os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("Missing MASTER_DB_DSN (or DATABASE_URL) in environment")
    return dsn

def _tenant_schema(company_id: int) -> str:
    return f"company_{int(company_id)}"

@contextmanager
def get_conn(company_id: Optional[int] = None) -> Iterator[psycopg2.extensions.connection]:
    """
    If company_id is provided, sets the session search_path to that tenant schema.
    Use company_id for ALL tenant tables like assets/depreciation/etc.
    """
    conn = psycopg2.connect(_get_dsn())
    try:
        # return dict rows by default
        conn.cursor_factory = psycopg2.extras.RealDictCursor

        if company_id is not None:
            schema = _tenant_schema(company_id)

            with conn.cursor() as cur:
                # ✅ Safe schema switch
                cur.execute('SET search_path TO %s, public', (schema,))
            conn.commit()

            # ✅ ENSURE PPE TABLES EXIST
            ensure_ppe_tables(conn, company_id)

        yield conn

    finally:
        conn.close()


def fetchall(cur):
    rows = cur.fetchall()
    return [dict(r) for r in rows]

def fetchone(cur):
    row = cur.fetchone()
    return dict(row) if row else None


# add this module-level cache so we don't run ensure every request
# ------------------------------------------------------------
# PPE schema ensure (runs once per schema per process)
# ------------------------------------------------------------
_SCHEMA_ENSURED: set[str] = set()

def ensure_ppe_tables(conn, company_id: int):
    schema = _tenant_schema(company_id)

    # prevent re-running every request
    if schema in _SCHEMA_ENSURED:
        return

    with conn.cursor() as cur:

        # -------------------------------------------------
        # asset_grni_links
        # -------------------------------------------------
        cur.execute(f"""
        CREATE TABLE IF NOT EXISTS {schema}.asset_grni_links (
            id SERIAL PRIMARY KEY,
            company_id INT NOT NULL,

            asset_id INT NOT NULL,
            receipt_tx_id INT NOT NULL,

            amount NUMERIC(18,2) NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """)

        # indexes
        cur.execute(f"""
        CREATE INDEX IF NOT EXISTS asset_grni_links_asset_idx
        ON {schema}.asset_grni_links(company_id, asset_id);
        """)

        cur.execute(f"""
        CREATE INDEX IF NOT EXISTS asset_grni_links_tx_idx
        ON {schema}.asset_grni_links(company_id, receipt_tx_id);
        """)

        # FK → assets
        cur.execute(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'fk_asset_grni_asset'
                AND n.nspname = '{schema}'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.asset_grni_links
                    ADD CONSTRAINT fk_asset_grni_asset
                    FOREIGN KEY (asset_id)
                    REFERENCES %I.assets(id)',
                    '{schema}',
                    '{schema}'
                );
            END IF;
        END $$;

        """)

        # FK → inventory_tx
        cur.execute(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE c.conname = 'fk_asset_grni_tx'
                AND n.nspname = '{schema}'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.asset_grni_links
                    ADD CONSTRAINT fk_asset_grni_tx
                    FOREIGN KEY (receipt_tx_id)
                    REFERENCES %I.inventory_tx(id)',
                    '{schema}',
                    '{schema}'
                );
            END IF;
        END $$;

        """)

    conn.commit()
    _SCHEMA_ENSURED.add(schema)
