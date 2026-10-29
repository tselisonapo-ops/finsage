"""
FinSage — subscription DB compat
================================

One tiny seam the subscription modules agree on for raw connections.

WHY THIS EXISTS
---------------
DatabaseService (BackEnd/Services/db_service.py) exposes:

    .transaction()          context manager (conn, cur) — autocommit/rollback
    ._conn_cursor(ddl=...)  internal pooled cursor
    .pool                   psycopg2 SimpleConnectionPool

...but NO public get_conn(). The billing / practice / jobs code owns its
own connection lifecycle (explicit commit / rollback / close-in-finally,
sometimes multiple partial commits inside one flow), which does not fit
transaction()'s single commit-on-exit shape.

get_conn() therefore returns a DEDICATED (non-pooled) psycopg2 connection
from the service's DSN. The caller's existing pattern is exactly right
for this style:

    conn = get_conn(self.db)
    try:
        with conn.cursor() as cur:
            ...
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

These are low-frequency commercial operations (signup, commit, upgrade,
renewals, the daily job) — a fresh connection per call is negligible
overhead and completely free of pool-checkout leaks.
"""

import os
import logging

log = logging.getLogger("finsage.subscription.db")


def get_conn(db_service):
    """
    Dedicated raw psycopg2 connection for subscription flows.

    DSN resolution order:
      1. db_service.dsn          (the running DatabaseService — always
                                  consistent with the app's own DB)
      2. MASTER_DB_DSN env       (CLI fallback, e.g. the daily job run
                                  outside the app process)
    """
    dsn = getattr(db_service, "dsn", None)

    if not dsn:
        dsn = os.getenv("MASTER_DB_DSN")
    if not dsn:
        raise RuntimeError(
            "get_conn: db_service has no .dsn and MASTER_DB_DSN is not set"
        )

    import psycopg2  # lazy — keeps module import-safe without the driver

    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    return conn
