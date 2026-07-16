# app/ppe/service.py
from BackEnd.Services.assets.tenants import company_schema
from BackEnd.Services.assets.ppe_db import fetchall, fetchone
from decimal import Decimal
from datetime import date
from BackEnd.Services.assets.posting import generate_single_asset_depreciation
from flask import current_app
import json
from decimal import Decimal, ROUND_HALF_UP

IMPAIRMENT_EVENTS = {"impairment_loss", "impairment_reversal"}
IMPAIRMENT_TARGETS = {"asset", "cgu"}
ALLOCATION_BASES = {"carrying_amount", "equal", "manual_weight"}


def _q(schema: str, sql: str) -> str:
    return sql.replace("{schema}", schema)

VAT_RATE = Decimal("0.15")

def _q2(x):
    return Decimal(str(x or 0)).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

def _vat_split(gross):
    gross = Decimal(str(gross or 0))

    if gross <= 0:
        return Decimal("0.00"), Decimal("0.00"), gross

    net = (
        gross / (Decimal("1.00") + VAT_RATE)
    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    vat = (
        gross - net
    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    return net, vat, gross

def get_asset_with_balances(cur, company_id, asset_id, as_at=None):
    schema = company_schema(company_id)
    as_at = as_at or date.today()

    cur.execute(_q(schema, """
      WITH base AS (
        SELECT a.*
        FROM {schema}.assets a
        WHERE a.company_id=%s AND a.id=%s
        LIMIT 1
      ),

      -- Posted acquisition cost hitting the asset account
      gl_cost_acq AS (
        SELECT
          COALESCE(SUM(jl.debit - jl.credit), 0)::numeric(18,2) AS amt
        FROM {schema}.asset_acquisitions acq
        JOIN {schema}.journal j
          ON j.id = acq.posted_journal_id
        JOIN {schema}.journal_lines jl
          ON jl.journal_id = j.id
        JOIN base a
          ON a.id = acq.asset_id
        WHERE acq.company_id = a.company_id
          AND acq.asset_id    = a.id
          AND lower(acq.status) = 'posted'
          AND acq.acquisition_date <= %s
          AND jl.account_code = a.asset_account_code
      ),

      -- Posted subsequent add_cost hitting the asset account
      gl_cost_add AS (
        SELECT
          COALESCE(SUM(jl.debit - jl.credit), 0)::numeric(18,2) AS amt
        FROM {schema}.asset_subsequent_measurements sm
        JOIN {schema}.journal j
          ON j.id = sm.posted_journal_id
        JOIN {schema}.journal_lines jl
          ON jl.journal_id = j.id
        JOIN base a
          ON a.id = sm.asset_id
        WHERE sm.company_id = a.company_id
          AND sm.asset_id    = a.id
          AND lower(sm.status) = 'posted'
          AND lower(sm.event_type) = 'add_cost'
          AND sm.event_date <= %s
          AND jl.account_code = a.asset_account_code
      ),

      gl_cost AS (
        SELECT (acq.amt + addc.amt)::numeric(18,2) AS cost_gl
        FROM gl_cost_acq acq
        CROSS JOIN gl_cost_add addc
      ),

      has_posted AS (
        SELECT EXISTS(
          SELECT 1
          FROM {schema}.asset_acquisitions acq
          WHERE acq.company_id=%s
            AND acq.asset_id=%s
            AND lower(acq.status)='posted'
            AND acq.acquisition_date <= %s
        )
        OR EXISTS(
          SELECT 1
          FROM {schema}.asset_subsequent_measurements sm
          WHERE sm.company_id=%s
            AND sm.asset_id=%s
            AND lower(sm.status)='posted'
            AND lower(sm.event_type)='add_cost'
            AND sm.event_date <= %s
        ) AS any_posted
      )

      SELECT
        a.*,

        -- COST TOTAL:
        -- If anything has posted to the asset account (acq or add_cost),
        -- treat GL as the truth and don't double-count a.cost.
        (
          COALESCE(a.opening_cost, 0)::numeric
          + COALESCE(gl.cost_gl, 0)::numeric
          + CASE
              WHEN hp.any_posted THEN 0::numeric
              ELSE COALESCE(a.cost, 0)::numeric
            END
        )::numeric(18,2) AS cost_total,

        -- accumulated depreciation (latest posted accumulated as-at)
        COALESCE((
          SELECT d.accumulated_depreciation::numeric(18,2)
          FROM {schema}.asset_depreciation d
          WHERE d.company_id=a.company_id
            AND d.asset_id=a.id
            AND d.status='posted'
            AND d.period_end <= %s
          ORDER BY d.period_end DESC, d.id DESC
          LIMIT 1
        ), COALESCE(a.opening_accum_dep,0))::numeric(18,2) AS accumulated_depreciation,

        -- reval + impairment (net)
        COALESCE((
          SELECT SUM(COALESCE(r.revaluation_change,0)::numeric)
          FROM {schema}.asset_revaluations r
          WHERE r.company_id=a.company_id
            AND r.asset_id=a.id
            AND r.status='posted'
            AND r.revaluation_date <= %s
        ),0)::numeric(18,2) AS reval_net,

        COALESCE((
          SELECT SUM(
            COALESCE(i.impairment_amount,0)::numeric - COALESCE(i.reversal_amount,0)::numeric
          )
          FROM {schema}.asset_impairments i
          WHERE i.company_id=a.company_id
            AND i.asset_id=a.id
            AND i.status='posted'
            AND i.impairment_date <= %s
        ),0)::numeric(18,2) AS imp_net,

        -- Carrying amount uses corrected cost_total
        GREATEST(
          0,
          (
            (
              (
                COALESCE(a.opening_cost,0)::numeric
                + COALESCE(gl.cost_gl,0)::numeric
                + CASE WHEN hp.any_posted THEN 0::numeric ELSE COALESCE(a.cost,0)::numeric END
              )
              + COALESCE((
                SELECT SUM(COALESCE(r.revaluation_change,0)::numeric)
                FROM {schema}.asset_revaluations r
                WHERE r.company_id=a.company_id
                  AND r.asset_id=a.id
                  AND r.status='posted'
                  AND r.revaluation_date <= %s
              ),0)
            )
            - COALESCE((
                SELECT d.accumulated_depreciation::numeric
                FROM {schema}.asset_depreciation d
                WHERE d.company_id=a.company_id
                  AND d.asset_id=a.id
                  AND d.status='posted'
                  AND d.period_end <= %s
                ORDER BY d.period_end DESC, d.id DESC
                LIMIT 1
            ), COALESCE(a.opening_accum_dep,0))
            - COALESCE(a.opening_impairment,0)
            - COALESCE((
                SELECT SUM(
                  COALESCE(i.impairment_amount,0)::numeric - COALESCE(i.reversal_amount,0)::numeric
                )
                FROM {schema}.asset_impairments i
                WHERE i.company_id=a.company_id
                  AND i.asset_id=a.id
                  AND i.status='posted'
                  AND i.impairment_date <= %s
            ),0)
          )
        )::numeric(18,2) AS carrying_amount,

        -- aliases
        (GREATEST(0, (
          (
            (
              COALESCE(a.opening_cost,0)::numeric
              + COALESCE(gl.cost_gl,0)::numeric
              + CASE WHEN hp.any_posted THEN 0::numeric ELSE COALESCE(a.cost,0)::numeric END
            )
            + COALESCE((
              SELECT SUM(COALESCE(r.revaluation_change,0)::numeric)
              FROM {schema}.asset_revaluations r
              WHERE r.company_id=a.company_id
                AND r.asset_id=a.id
                AND r.status='posted'
                AND r.revaluation_date <= %s
            ),0)
          )
          - COALESCE((
              SELECT d.accumulated_depreciation::numeric
              FROM {schema}.asset_depreciation d
              WHERE d.company_id=a.company_id
                AND d.asset_id=a.id
                AND d.status='posted'
                AND d.period_end <= %s
              ORDER BY d.period_end DESC, d.id DESC
              LIMIT 1
          ), COALESCE(a.opening_accum_dep,0))
          - COALESCE(a.opening_impairment,0)
          - COALESCE((
              SELECT SUM(
                COALESCE(i.impairment_amount,0)::numeric - COALESCE(i.reversal_amount,0)::numeric
              )
              FROM {schema}.asset_impairments i
              WHERE i.company_id=a.company_id
                AND i.asset_id=a.id
                AND i.status='posted'
                AND i.impairment_date <= %s
          ),0)
        )))::numeric(18,2) AS nbv,

        COALESCE((
          SELECT d.accumulated_depreciation::numeric(18,2)
          FROM {schema}.asset_depreciation d
          WHERE d.company_id=a.company_id
            AND d.asset_id=a.id
            AND d.status='posted'
            AND d.period_end <= %s
          ORDER BY d.period_end DESC, d.id DESC
          LIMIT 1
        ), COALESCE(a.opening_accum_dep,0))::numeric(18,2) AS acc_dep

      FROM base a
      CROSS JOIN gl_cost gl
      CROSS JOIN has_posted hp
    """), (
        company_id, asset_id,
        as_at,                 # gl_cost_acq
        as_at,                 # gl_cost_add
        company_id, asset_id, as_at,     # has_posted (acq)
        company_id, asset_id, as_at,     # has_posted (add_cost)
        as_at, as_at, as_at,             # dep/reval/imp
        as_at, as_at, as_at,             # carrying components
        as_at, as_at, as_at,             # nbv components
        as_at                           # acc_dep
    ))

    return fetchone(cur)

def get_asset(cur, company_id, asset_id):
    rows = list_assets(
        cur,
        company_id,
        status=None,
        asset_class=None,
        q=None,
        limit=1,
        offset=0,
        as_at=date.today()
    )

    for r in rows:
        if int(r.get("id")) == int(asset_id):
            return r

    return None

def create_subsequent_measurement(cur, company_id, payload):
    schema = company_schema(company_id)

    cur.execute(_q(schema, """
        INSERT INTO {schema}.asset_subsequent_measurements(
            company_id, asset_id, event_date, event_type, amount,
            debit_account_code, credit_account_code,
            useful_life_months, residual_value, depreciation_method,
            notes, status, meta_json,
            source_company_id, engagement_company_id, engagement_id,
            created_by_user_id, updated_by_user_id
        )
        VALUES (
            %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
            COALESCE(%s,'draft'),%s::jsonb,%s,%s,%s,%s,%s
        )
        RETURNING id
    """), (
        company_id,
        payload["asset_id"],
        payload["event_date"],
        payload["event_type"],
        payload.get("amount", 0),
        payload.get("debit_account_code"),
        payload.get("credit_account_code"),
        payload.get("useful_life_months"),
        payload.get("residual_value"),
        payload.get("depreciation_method"),
        payload.get("notes"),
        payload.get("status"),
        json.dumps(payload.get("meta_json") or {}),
        payload.get("source_company_id"),
        payload.get("engagement_company_id"),
        payload.get("engagement_id"),
        payload.get("created_by_user_id"),
        payload.get("updated_by_user_id"),
    ))

    return int(cur.fetchone()["id"])

def fetch_asset_row(cur, company_id: int, asset_id: int) -> dict:
    schema = company_schema(company_id)
    cur.execute(_q(schema, """
      SELECT *
      FROM {schema}.assets
      WHERE company_id=%s AND id=%s
      LIMIT 1
    """), (company_id, asset_id))
    a = cur.fetchone()
    if not a:
        raise ValueError("Asset not found")
    return a

def get_subsequent_measurement(cur, company_id: int, sm_id: int):
    schema = company_schema(company_id)
    cur.execute(_q(schema, """
        SELECT *
        FROM {schema}.asset_subsequent_measurements
        WHERE company_id=%s AND id=%s
        LIMIT 1
    """), (company_id, sm_id))
    return fetchone(cur)

def update_subsequent_measurement(cur, company_id: int, sm_id: int, patch: dict):
    schema = company_schema(company_id)

    # whitelist columns you allow
    cols = [
        "asset_id","event_date","event_type",
        "amount","debit_account_code","credit_account_code",
        "useful_life_months","residual_value","depreciation_method",
        "notes",
    ]

    sets = []
    params = []
    for c in cols:
        if c in patch:
            sets.append(f"{c}=%s")
            params.append(patch.get(c))

    if not sets:
        return True

    params.extend([company_id, sm_id])

    cur.execute(_q(schema, f"""
        UPDATE {{schema}}.asset_subsequent_measurements
        SET {", ".join(sets)},
            updated_at=NOW()
        WHERE company_id=%s AND id=%s
          AND status='draft'
    """), tuple(params))

    return True

def reclassify_asset(cur, company_id, asset_id, new_standard, reclassification_date, notes=None):
    """Reclassify an asset between IAS 16 ↔ IAS 40 (IAS 40.50)"""
    schema = company_schema(company_id)

    # Fetch current asset
    cur.execute(_q(schema, """
        SELECT * FROM {schema}.assets
        WHERE company_id = %s AND id = %s
    """), (company_id, asset_id))
    asset = fetchone(cur)
    if not asset:
        raise Exception("Asset not found")

    current_standard = (asset.get("accounting_standard") or "ias16").strip().lower()

    if current_standard == new_standard:
        raise Exception(f"Asset is already under {new_standard.upper()}")

    valid_transitions = {("ias16", "ias40"), ("ias40", "ias16")}
    if (current_standard, new_standard) not in valid_transitions:
        raise Exception("Invalid reclassification path. Only IAS 16 ↔ IAS 40 allowed.")

    # Update the asset record
    cur.execute(_q(schema, """
        UPDATE {schema}.assets SET
            accounting_standard = %s,
            reclassified_from_standard = %s,
            reclassified_date = %s,
            reclassified_notes = %s,
            updated_at = NOW()
        WHERE company_id = %s AND id = %s
    """), (new_standard, current_standard, reclassification_date, notes, company_id, asset_id))

    return asset

def list_assets(cur, company_id, status=None, asset_class=None, q=None, limit=50, offset=0, as_at=None, accounting_standard=None):
    schema = company_schema(company_id)
    as_at = as_at or date.today()

    where = ["a.company_id=%s"]
    params = [company_id]

    if status:
        where.append("a.status=%s")
        params.append(status)

    if asset_class:
        where.append("a.asset_class=%s")
        params.append(asset_class)

    if accounting_standard:
        where.append("a.accounting_standard=%s")
        params.append(accounting_standard)

    if q:
        where.append("(a.asset_code ILIKE %s OR a.asset_name ILIKE %s)")
        params += [f"%{q}%", f"%{q}%"]

    sql = _q(schema, f"""
        WITH base AS (
            SELECT a.*
            FROM {{schema}}.assets a
            WHERE {" AND ".join(where)}
        ),

        posted_flags AS (
            SELECT acq.asset_id, TRUE AS any_posted
            FROM {{schema}}.asset_acquisitions acq
            JOIN base b ON b.id = acq.asset_id
            WHERE LOWER(acq.status) = 'posted'
              AND acq.acquisition_date <= %s
            GROUP BY acq.asset_id

            UNION

            SELECT b.id AS asset_id, TRUE AS any_posted
            FROM base b
            WHERE
                b.entry_mode = 'opening_balance'
                OR b.opening_as_at IS NOT NULL
                OR COALESCE(b.opening_accum_dep, 0) > 0
        ),

        gl_cost AS (
            SELECT
                a.id AS asset_id,
                SUM(jl.debit - jl.credit)::numeric(18,2) AS cost_gl
            FROM base a
            JOIN {schema}.journal_lines jl
            ON jl.account_code = a.asset_account_code
            JOIN {schema}.journal j
            ON j.id = jl.journal_id
            AND j.company_id = a.company_id
            WHERE j.company_id = %s
            AND j.date <= %s
            AND COALESCE(j.is_reversal, FALSE) = FALSE
            AND (
                (
                    j.source = 'asset_acquisition'
                    AND j.source_id IN (
                        SELECT acq.id
                        FROM {schema}.asset_acquisitions acq
                        WHERE acq.company_id = a.company_id
                            AND acq.asset_id = a.id
                            AND LOWER(acq.status) = 'posted'
                    )
                )
                OR
                (
                    j.source = 'bill'
                    AND j.source_id IN (
                        SELECT b.id
                        FROM {schema}.bills b
                        WHERE b.company_id = a.company_id
                            AND b.asset_id = a.id
                            AND b.asset_acquisition_id IS NOT NULL
                            AND LOWER(b.status) = 'posted'
                    )
                )
            )
            GROUP BY a.id
        ),

        hfs AS (
            SELECT DISTINCT ON (h.asset_id)
                h.asset_id,
                h.id AS hfs_id,
                h.classification_date AS hfs_classification_date,
                h.status AS hfs_status,
                h.posted_journal_id AS hfs_posted_journal_id
            FROM {{schema}}.asset_held_for_sale h
            JOIN base b ON b.id = h.asset_id
            WHERE h.company_id = %s
              AND h.status = 'posted'
              AND h.classification_date <= %s
            ORDER BY h.asset_id, h.classification_date DESC, h.id DESC
        )

        SELECT
            b.*,
            LOWER(COALESCE(b.measurement_basis, 'cost')) AS measurement_model_flag,

            CASE
                WHEN LOWER(COALESCE(b.measurement_basis, 'cost')) = 'revaluation'
                THEN TRUE ELSE FALSE
            END AS uses_revaluation_model,

            CASE
                WHEN UPPER(COALESCE(b.depreciation_method, '')) IN ('APP', 'NONE', 'NOT_DEPRECIATED')
                THEN TRUE ELSE FALSE
            END AS is_non_depreciable,
            hfs.hfs_id,
            hfs.hfs_classification_date,
            hfs.hfs_status,
            hfs.hfs_posted_journal_id,
            (hfs.hfs_id IS NOT NULL) AS is_held_for_sale,

            (
                CASE
                    WHEN b.entry_mode = 'opening_balance'
                    OR b.opening_as_at IS NOT NULL
                    THEN COALESCE(NULLIF(b.opening_cost, 0), b.cost, 0)::numeric
                    ELSE (
                        COALESCE(gc.cost_gl, 0)::numeric
                        + CASE
                            WHEN COALESCE(gc.cost_gl, 0) <> 0 THEN 0::numeric
                            ELSE COALESCE(b.cost, 0)::numeric
                        END
                    )
                END
            )::numeric(18,2) AS cost_total,

            COALESCE((
                SELECT d.accumulated_depreciation::numeric(18,2)
                FROM {{schema}}.asset_depreciation d
                WHERE d.company_id = b.company_id
                  AND d.asset_id = b.id
                  AND d.status = 'posted'
                  AND d.period_end <= %s
                ORDER BY d.period_end DESC, d.id DESC
                LIMIT 1
            ), COALESCE(b.opening_accum_dep, 0))::numeric(18,2) AS accumulated_depreciation,

            COALESCE((
                SELECT SUM(COALESCE(r.revaluation_change, 0)::numeric)
                FROM {{schema}}.asset_revaluations r
                WHERE r.company_id = b.company_id
                  AND r.asset_id = b.id
                  AND r.status = 'posted'
                  AND r.revaluation_date <= %s
            ), 0)::numeric(18,2) AS reval_net,

            COALESCE((
                SELECT SUM(
                    COALESCE(i.impairment_amount, 0)::numeric
                    - COALESCE(i.reversal_amount, 0)::numeric
                )
                FROM {{schema}}.asset_impairments i
                WHERE i.company_id = b.company_id
                  AND i.asset_id = b.id
                  AND i.status = 'posted'
                  AND i.impairment_date <= %s
            ), 0)::numeric(18,2) AS imp_net,

            GREATEST(
                0,
                (
                    (
                        (
                            CASE
                                WHEN b.entry_mode = 'opening_balance'
                                OR b.opening_as_at IS NOT NULL
                                THEN COALESCE(NULLIF(b.opening_cost, 0), b.cost, 0)::numeric
                                ELSE (
                                    COALESCE(gc.cost_gl, 0)::numeric
                                    + CASE
                                        WHEN COALESCE(gc.cost_gl, 0) <> 0 THEN 0::numeric
                                        ELSE COALESCE(b.cost, 0)::numeric
                                    END
                                )
                            END
                        )
                        + COALESCE((
                            SELECT SUM(COALESCE(r.revaluation_change, 0)::numeric)
                            FROM {{schema}}.asset_revaluations r
                            WHERE r.company_id = b.company_id
                              AND r.asset_id = b.id
                              AND r.status = 'posted'
                              AND r.revaluation_date <= %s
                        ), 0)
                    )
                    - COALESCE((
                        SELECT d.accumulated_depreciation::numeric
                        FROM {{schema}}.asset_depreciation d
                        WHERE d.company_id = b.company_id
                          AND d.asset_id = b.id
                          AND d.status = 'posted'
                          AND d.period_end <= %s
                        ORDER BY d.period_end DESC, d.id DESC
                        LIMIT 1
                    ), COALESCE(b.opening_accum_dep, 0))
                    - COALESCE(b.opening_impairment, 0)
                    - COALESCE((
                        SELECT SUM(
                            COALESCE(i.impairment_amount, 0)::numeric
                            - COALESCE(i.reversal_amount, 0)::numeric
                        )
                        FROM {{schema}}.asset_impairments i
                        WHERE i.company_id = b.company_id
                          AND i.asset_id = b.id
                          AND i.status = 'posted'
                          AND i.impairment_date <= %s
                    ), 0)
                )
            )::numeric(18,2) AS carrying_amount,

            GREATEST(
                0,
                (
                    (
                        (
                            CASE
                                WHEN b.entry_mode = 'opening_balance'
                                OR b.opening_as_at IS NOT NULL
                                THEN COALESCE(NULLIF(b.opening_cost, 0), b.cost, 0)::numeric
                                ELSE (
                                    COALESCE(gc.cost_gl, 0)::numeric
                                    + CASE
                                        WHEN COALESCE(gc.cost_gl, 0) <> 0 THEN 0::numeric
                                        ELSE COALESCE(b.cost, 0)::numeric
                                    END
                                )
                            END
                        )
                        + COALESCE((
                            SELECT SUM(COALESCE(r.revaluation_change, 0)::numeric)
                            FROM {{schema}}.asset_revaluations r
                            WHERE r.company_id = b.company_id
                              AND r.asset_id = b.id
                              AND r.status = 'posted'
                              AND r.revaluation_date <= %s
                        ), 0)
                    )
                    - COALESCE((
                        SELECT d.accumulated_depreciation::numeric
                        FROM {{schema}}.asset_depreciation d
                        WHERE d.company_id = b.company_id
                          AND d.asset_id = b.id
                          AND d.status = 'posted'
                          AND d.period_end <= %s
                        ORDER BY d.period_end DESC, d.id DESC
                        LIMIT 1
                    ), COALESCE(b.opening_accum_dep, 0))
                    - COALESCE(b.opening_impairment, 0)
                    - COALESCE((
                        SELECT SUM(
                            COALESCE(i.impairment_amount, 0)::numeric
                            - COALESCE(i.reversal_amount, 0)::numeric
                        )
                        FROM {{schema}}.asset_impairments i
                        WHERE i.company_id = b.company_id
                          AND i.asset_id = b.id
                          AND i.status = 'posted'
                          AND i.impairment_date <= %s
                    ), 0)
                )
            )::numeric(18,2) AS nbv,

            COALESCE((
                SELECT d.accumulated_depreciation::numeric(18,2)
                FROM {{schema}}.asset_depreciation d
                WHERE d.company_id = b.company_id
                  AND d.asset_id = b.id
                  AND d.status = 'posted'
                  AND d.period_end <= %s
                ORDER BY d.period_end DESC, d.id DESC
                LIMIT 1
            ), COALESCE(b.opening_accum_dep, 0))::numeric(18,2) AS acc_dep

        FROM base b
        LEFT JOIN posted_flags pf ON pf.asset_id = b.id
        LEFT JOIN gl_cost gc ON gc.asset_id = b.id
        LEFT JOIN hfs ON hfs.asset_id = b.id

        WHERE COALESCE(pf.any_posted, FALSE) = TRUE

        ORDER BY b.id DESC
        LIMIT %s OFFSET %s
    """)

    cur.execute(sql, (
        *params,

        as_at,       # posted_flags acquisition cutoff

        company_id,  # gl_cost company
        as_at,       # gl_cost journal date cutoff

        company_id,  # hfs company
        as_at,       # hfs cutoff

        as_at,       # accumulated_depreciation
        as_at,       # reval_net
        as_at,       # imp_net

        as_at,       # carrying revaluation
        as_at,       # carrying depreciation
        as_at,       # carrying impairment

        as_at,       # nbv revaluation
        as_at,       # nbv depreciation
        as_at,       # nbv impairment

        as_at,       # acc_dep

        limit,
        offset,
    ))

    rows = fetchall(cur)
    return collapse_component_assets_for_register(cur, schema, company_id, rows, as_at=as_at)

def collapse_component_assets_for_register(cur, schema: str, company_id: int, rows: list[dict], as_at=None) -> list[dict]:
    parent_ids = sorted({
        int(r.get("parent_asset_id"))
        for r in rows
        if r.get("parent_asset_id") and bool(r.get("is_component"))
    })

    if not parent_ids:
        return [r for r in rows if not bool(r.get("is_component"))]

    cur.execute(_q(schema, """
        SELECT *
        FROM {schema}.assets
        WHERE company_id = %s
          AND id = ANY(%s)
    """), (company_id, parent_ids))

    parents = {
        int(p["id"]): p
        for p in fetchall(cur)
    }

    grouped = {}
    standalone = []

    for r in rows:
        if bool(r.get("is_component")) and r.get("parent_asset_id"):
            pid = int(r["parent_asset_id"])
            grouped.setdefault(pid, []).append(r)
        else:
            standalone.append(r)

    out = []

    for pid, comps in grouped.items():
        parent = parents.get(pid)
        if not parent:
            continue

        # ✅ fetch ALL components, not only components present in current list page
        cur.execute(_q(schema, """
            SELECT
                a.*,

                COALESCE((
                    SELECT SUM(jl.debit - jl.credit)::numeric
                    FROM {schema}.journal_lines jl
                    JOIN {schema}.journal j ON j.id = jl.journal_id
                    WHERE j.company_id = a.company_id
                    AND j.date <= %s
                    AND COALESCE(j.is_reversal, FALSE) = FALSE
                    AND jl.account_code = a.asset_account_code
                    AND j.source = 'asset_acquisition'
                    AND j.source_id IN (
                        SELECT acq.id
                        FROM {schema}.asset_acquisitions acq
                        WHERE acq.company_id = a.company_id
                            AND acq.asset_id = a.id
                            AND LOWER(acq.status) = 'posted'
                    )
                ), a.cost, 0)::numeric(18,2) AS cost_total,

                COALESCE((
                    SELECT d.accumulated_depreciation::numeric
                    FROM {schema}.asset_depreciation d
                    WHERE d.company_id = a.company_id
                    AND d.asset_id = a.id
                    AND d.status = 'posted'
                    ORDER BY d.period_end DESC, d.id DESC
                    LIMIT 1
                ), COALESCE(a.opening_accum_dep, 0))::numeric(18,2) AS acc_dep

            FROM {schema}.assets a
            WHERE a.company_id = %s
            AND a.parent_asset_id = %s
            AND COALESCE(a.is_component, FALSE) = TRUE
            ORDER BY a.component_no NULLS LAST, a.id
        """), (as_at, company_id, pid))

        comps = fetchall(cur) or []

        total_cost = sum(float(c.get("cost_total") or c.get("cost") or 0) for c in comps)
        total_acc_dep = sum(float(c.get("acc_dep") or 0) for c in comps)
        total_carrying = total_cost - total_acc_dep

        row = dict(parent)
        row.update({
            "id": pid,
            "asset_id": pid,
            "asset_name": parent.get("asset_name"),
            "asset_code": parent.get("asset_code"),
            "asset_class": parent.get("asset_class") or "Land and buildings",
            "asset_class_group": parent.get("asset_class_group") or "Land and buildings",
            "is_component_group": True,
            "is_component": False,
            "cost_total": total_cost,
            "cost": total_cost,
            "accumulated_depreciation": total_acc_dep,
            "acc_dep": total_acc_dep,
            "carrying_amount": total_carrying,
            "nbv": total_carrying,
            "components": comps,
            "component_count": len(comps),
            "status": parent.get("status") or "active",
        })

        out.append(row)

    out.extend([r for r in standalone if not bool(r.get("is_component"))])

    return sorted(out, key=lambda x: int(x.get("id") or 0), reverse=True)

def is_asset_class_potentially_qualifying(asset: dict) -> bool:
    txt = " ".join([
        str(asset.get("asset_name") or ""),
        str(asset.get("asset_class") or ""),
        str(asset.get("asset_class_group") or ""),
        str(asset.get("category") or ""),
        str(asset.get("notes") or ""),
    ]).lower()

    qualifying_keywords = (
        "building",
        "construction",
        "project",
        "development",
        "plant",
        "factory",
        "warehouse",
        "mine",
        "mining",
        "infrastructure",
        "leasehold improvement",
        "major installation",
        "work in progress",
        "wip",
        "asset under construction",
    )

    excluded_keywords = (
        "laptop",
        "computer",
        "printer",
        "phone",
        "furniture",
        "motor vehicle",
        "vehicle",
        "car",
        "bakkie",
        "truck",
        "tools",
        "small equipment",
    )

    if any(k in txt for k in excluded_keywords):
        return False

    return any(k in txt for k in qualifying_keywords)

def normalize_asset_class_group(asset_class="", asset_name="", category=""):
    text = " ".join([
        str(asset_class or ""),
        str(asset_name or ""),
        str(category or ""),
    ]).lower()

    rules = [
        ("Land and buildings", ["land", "building", "property", "premises", "warehouse"]),
        ("Mining equipment", ["mining", "mine", "haul truck", "dump truck", "excavator", "crusher", "drill rig"]),
        ("Construction equipment", ["construction", "tlb", "backhoe", "back dipper", "grader", "loader", "dozer", "bulldozer", "cement mixer"]),
        ("Heavy vehicles", ["lorry", "lorries", "truck", "trucks", "tipper", "heavy vehicle"]),
        ("Vehicles", ["vehicle", "car", "bakkie", "van", "pickup", "motor"]),
        ("Manufacturing equipment", ["manufacturing", "production", "factory", "machine", "machinery", "plant"]),
        ("Computer equipment", ["computer", "laptop", "server", "printer", "scanner", "it equipment"]),
        ("Office equipment", ["office equipment", "photocopier", "copier", "telephone", "projector"]),
        ("Furniture and fittings", ["furniture", "fittings", "desk", "chair", "boardroom"]),
        ("Tools and small equipment", ["tool", "tools", "small equipment"]),
        ("Leasehold improvements", ["leasehold", "improvement", "renovation"]),
        ("Investment property - Land", ["investment property land", "investment land"]),
        ("Investment property - Buildings", ["investment property building", "investment building", "investment property"]),
        ("Goodwill", ["goodwill"]),
        ("Patents", ["patent"]),
        ("Copyrights", ["copyright"]),
        ("Trademarks", ["trademark"]),
        ("Software", ["software"]),
        ("Licences", ["licence", "license"]),
        ("Franchises", ["franchise"]),
        ("Research and development", ["research and development", "r&d", "randd"]),
        ("Other intangible assets", ["intangible"]),
    ]

    for group, keywords in rules:
        if any(k in text for k in keywords):
            return group

    return "Other PPE"

def create_compound_asset_acquisition(cur, company_id: int, payload: dict, actor_user_id=None) -> dict:
    components = payload.get("components") or []

    if len(components) < 2:
        raise ValueError("Compound acquisition requires at least two components.")

    total_cost = Decimal(str(payload.get("cost") or 0))
    component_total = sum(Decimal(str(c.get("cost") or 0)) for c in components)

    if total_cost <= 0:
        raise ValueError("Total cost must be greater than 0.")

    if component_total.quantize(Decimal("0.01")) != total_cost.quantize(Decimal("0.01")):
        raise ValueError("Component costs must equal total cost.")

    vat_claimable = bool(payload.get("vat_input_claimable"))

    vat_rate = Decimal(str(
        payload.get("vat_rate")
        or payload.get("tax_rate")
        or payload.get("vat_percent")
        or 15
    ))

    vat_factor = Decimal("1") + (vat_rate / Decimal("100"))

    def _money(x):
        return Decimal(str(x or 0)).quantize(Decimal("0.01"))

    def capitalised_cost(gross):
        gross = Decimal(str(gross or 0))
        if vat_claimable:
            return (gross / vat_factor).quantize(Decimal("0.01"))
        return gross.quantize(Decimal("0.01"))

    base_code = str(payload.get("asset_code") or "").strip()
    base_name = str(payload.get("asset_name") or "").strip()

    if not base_code:
        raise ValueError("asset_code is required.")
    if not base_name:
        raise ValueError("asset_name is required.")

    # Parent/group asset: register grouping only
    parent_payload = dict(payload)
    parent_payload.update({
        "asset_code": base_code,
        "asset_name": base_name,
        "asset_class": "Land and buildings",
        "asset_class_group": "Land and buildings",
        "cost": capitalised_cost(total_cost),
        "residual_value": Decimal("0"),
        "depreciation_method": "APP",
        "useful_life_months": 0,
        "rb_rate_percent": None,
        "uop_total_units": None,
        "uop_unit_name": None,
        "uop_usage_mode": None,
        "uop_opening_reading": None,
        "is_component_group": True,
        "is_component": False,
        "parent_asset_id": None,
        "component_type": "group",
        "component_no": 0,
        "created_by_user_id": actor_user_id,
        "updated_by_user_id": actor_user_id,
        "status": "active",
    })

    parent_id = create_asset(cur, company_id, parent_payload)

    child_ids = []
    acquisition_ids = []

    for idx, component in enumerate(components, start=1):
        ctype = str(component.get("component_type") or "").strip().lower()
        if not ctype:
            raise ValueError("Each component requires component_type.")

        gross_cost = Decimal(str(component.get("cost") or 0))
        comp_cost = capitalised_cost(gross_cost)

        if gross_cost <= 0:
            raise ValueError(f"{ctype} component cost must be greater than 0.")

        child_payload = dict(payload)
        child_payload.update(component)

        child_payload.update({
            "asset_code": f"{base_code}-{idx:02d}",
            "asset_name": component.get("asset_name") or f"{base_name} - {ctype.title()}",
            "asset_class": component.get("asset_class") or ctype.title(),
            "asset_class_group": component.get("asset_class_group") or ctype.title(),
            "cost": comp_cost,
            "residual_value": Decimal(str(component.get("residual_value") or 0)),
            "parent_asset_id": parent_id,
            "is_component": True,
            "is_component_group": False,
            "component_no": idx,
            "component_type": ctype,
            "created_by_user_id": actor_user_id,
            "updated_by_user_id": actor_user_id,
            "status": "active",
        })

        if ctype == "land":
            child_payload["depreciation_method"] = "APP"
            child_payload["useful_life_months"] = 0
            child_payload["rb_rate_percent"] = None
            child_payload["uop_total_units"] = None
            child_payload["uop_unit_name"] = None
            child_payload["uop_usage_mode"] = None
            child_payload["uop_opening_reading"] = None

        child_id = create_asset(cur, company_id, child_payload)
        child_ids.append(child_id)

        acq_payload = dict(payload.get("acquisition") or {})
        acq_payload.update({
            "acquisition_date": payload.get("acquisition_date"),
            "posting_date": payload.get("posting_date"),
            "amount": gross_cost,
            "reference": payload.get("reference") or payload.get("acquisition_ref") or f"COMP-ASSET-{parent_id}",
            "notes": payload.get("notes"),
            "status": "draft",
            "supplier_id": payload.get("supplier_id"),
            "vendor_invoice_no": payload.get("vendor_invoice_no"),
            "grn_no": payload.get("grn_no"),
            "bank_account_id": payload.get("bank_account_id"),
            "funding_source": payload.get("funding_source") or "bank_cash",
            "credit_account_code": payload.get("other_credit_account_code") or payload.get("credit_account_code"),
            "vat_input_claimable": payload.get("vat_input_claimable"),
            "vat_recovery_reason": payload.get("vat_recovery_reason"),
            "vat_recovery_percent": payload.get("vat_recovery_percent"),
            "source_company_id": payload.get("source_company_id"),
            "engagement_company_id": payload.get("engagement_company_id"),
            "engagement_id": payload.get("engagement_id"),
            "created_by_user_id": actor_user_id,
            "updated_by_user_id": actor_user_id,
        })

        acq_id = create_acquisition(cur, company_id, child_id, acq_payload)
        acquisition_ids.append(acq_id)

    return {
        "parent_asset_id": int(parent_id),
        "component_asset_ids": [int(x) for x in child_ids],
        "acquisition_ids": [int(x) for x in acquisition_ids],
    }

def ensure_asset_tax_profile_for_asset_cur(cur, company_id: int, asset_id: int):
    schema = company_schema(company_id)

    # temporary default until company tax setting is available
    tax_code = "RSL"

    cur.execute("""
        SELECT id
        FROM public.tax_authorities
        WHERE code = %s
          AND is_active = TRUE
        LIMIT 1
    """, (tax_code,))

    ta = cur.fetchone()
    if not ta:
        return None

    cur.execute(_q(schema, """
        INSERT INTO {schema}.asset_tax_profiles (
            company_id,
            asset_id,
            tax_authority_id,
            tax_start_date,
            tax_cost,
            notes
        )
        SELECT
            a.company_id,
            a.id,
            %s,
            COALESCE(a.available_for_use_date, a.acquisition_date),
            COALESCE(a.opening_cost, a.cost),
            'Auto-created from asset register'
        FROM {schema}.assets a
        WHERE a.id = %s
          AND a.company_id = %s
          AND NOT EXISTS (
              SELECT 1
              FROM {schema}.asset_tax_profiles p
              WHERE p.company_id = a.company_id
                AND p.asset_id = a.id
                AND p.tax_authority_id = %s
          )
        RETURNING id
    """), (ta["id"], asset_id, company_id, ta["id"]))

    row = cur.fetchone()
    return row["id"] if row else None

def create_asset(cur, company_id, payload):
    schema = company_schema(company_id)

    # ----------------------------
    # Entry mode
    # ----------------------------
    entry_mode = (payload.get("entry_mode") or "acquisition").strip().lower()
    if entry_mode not in ("acquisition", "opening_balance"):
        raise Exception("Invalid entry_mode. Use 'acquisition' or 'opening_balance'.")

    # ----------------------------
    # Depreciation validation
    # ----------------------------
    m = (payload.get("depreciation_method") or "SL").upper()

    if m == "SL":
        if int(payload.get("useful_life_months") or 0) <= 0:
            raise Exception("useful_life_months required for Straight-line")

    elif m == "RB":
        if Decimal(str(payload.get("rb_rate_percent") or 0)) <= 0:
            raise Exception("rb_rate_percent required for Reducing balance")

    elif m == "UOP":
        if Decimal(str(payload.get("uop_total_units") or 0)) <= 0:
            raise Exception("uop_total_units required for Units of Production")

    elif m in ("APP", "NONE", "NOT_DEPRECIATED"):
        m = "APP"
        payload["depreciation_method"] = "APP"
        payload["useful_life_months"] = 0
        payload["rb_rate_percent"] = None
        payload["uop_total_units"] = None
        payload["uop_unit_name"] = None
    else:
        raise Exception("Invalid depreciation_method") 

    # ----------------------------
    # UOP usage config
    # ----------------------------
    uop_usage_mode = (payload.get("uop_usage_mode") or "DELTA").upper()
    if uop_usage_mode not in ("DELTA", "READING"):
        raise Exception("Invalid uop_usage_mode. Use 'DELTA' or 'READING'.")

    uop_opening_reading = payload.get("uop_opening_reading", None)
    if uop_opening_reading in ("", None):
        uop_opening_reading = None
    else:
        uop_opening_reading = Decimal(str(uop_opening_reading))
        if uop_opening_reading < 0:
            raise Exception("uop_opening_reading must be 0 or more.")

    if m != "UOP":
        uop_usage_mode = None
        uop_opening_reading = None
    else:
        if uop_usage_mode == "READING" and uop_opening_reading is None:
            raise Exception("uop_opening_reading is required when uop_usage_mode is READING.")

    # ----------------------------
    # Opening balance fields
    # ----------------------------
    entered_cost = Decimal(str(payload.get("cost") or 0))

    if entry_mode == "opening_balance":
        cost = entered_cost

        if opening_cost is None:
            opening_cost = cost
    else:
        cost = Decimal("0.00")

    residual_value = Decimal(str(payload.get("residual_value") or 0))

    opening_as_at = payload.get("opening_as_at") or None

    opening_cost = payload.get("opening_cost", None)
    if opening_cost in ("", None):
        opening_cost = None
    else:
        opening_cost = Decimal(str(opening_cost))

    opening_accum_dep = payload.get("opening_accum_dep", None)
    if opening_accum_dep in ("", None):
        opening_accum_dep = None
    else:
        opening_accum_dep = Decimal(str(opening_accum_dep))

    opening_impairment = payload.get("opening_impairment", None)
    if opening_impairment in ("", None):
        opening_impairment = None
    else:
        opening_impairment = Decimal(str(opening_impairment))

    validation_cost = entered_cost

    if validation_cost < 0:
        raise Exception("cost cannot be negative")

    if residual_value < 0:
        raise Exception("residual_value cannot be negative")

    if validation_cost > 0 and residual_value > validation_cost:
        raise Exception("residual_value cannot exceed cost")

    if entry_mode == "opening_balance":
        if not opening_as_at:
            raise Exception("opening_as_at is required for opening balance assets")

        if opening_accum_dep is None:
            raise Exception("opening_accum_dep is required for opening balance assets")

        if opening_accum_dep < 0:
            raise Exception("opening_accum_dep cannot be negative")

        if opening_accum_dep > cost:
            raise Exception("opening_accum_dep cannot exceed historical cost")

        if opening_impairment is not None and opening_impairment < 0:
            raise Exception("opening_impairment cannot be negative")

        if opening_cost is None:
            opening_cost = cost

    else:
        # normal acquisition asset
        opening_as_at = None
        opening_cost = None
        opening_accum_dep = None
        opening_impairment = None

    asset_class = str(payload.get("asset_class") or "").strip()
    measurement_basis = (
        payload.get("measurement_basis")
        or payload.get("measurement_model")
        or "cost"
    ).strip().lower()

    if measurement_basis not in ("cost", "revaluation"):
        raise Exception("Invalid measurement_basis. Use 'cost' or 'revaluation'.")
    asset_name = str(payload.get("asset_name") or "").strip()
    category = str(payload.get("category") or "").strip() or None
    vat_input_claimable = bool(payload.get("vat_input_claimable") or False)
    vat_recovery_reason = (payload.get("vat_recovery_reason") or "").strip() or None
    vat_recovery_percent = Decimal(str(payload.get("vat_recovery_percent") or (100 if vat_input_claimable else 0)))
    # IAS 23 qualifying asset policy
    if payload.get("is_qualifying_asset") is True:
        if not is_asset_class_potentially_qualifying(payload):
            # OPTION 1 (recommended): soft warning
            current_app.logger.warning(
                f"[IAS23] Asset marked qualifying but does not match policy: {asset_name}"
            )

            # OPTION 2 (strict mode) – only if you want enforcement
            # raise Exception("This asset does not meet qualifying asset policy criteria.")

    if not asset_class:
        raise Exception("asset_class is required")

    asset_class_group = str(payload.get("asset_class_group") or "").strip()
    if not asset_class_group:
        asset_class_group = normalize_asset_class_group(
            asset_class=asset_class,
            asset_name=asset_name,
            category=category or "",
        )

    # ----------------------------
    # Accounting standard (IAS 16 / IAS 40 / IAS 38)
    # ----------------------------
    accounting_standard = str(payload.get("accounting_standard") or "ias16").strip().lower()
    if accounting_standard not in ("ias16", "ias40", "ias38"):
        accounting_standard = "ias16"

    # Auto-derive from class_group if not explicitly sent
    if not payload.get("accounting_standard"):
        _acg = asset_class_group.lower()
        if "investment property" in _acg:
            accounting_standard = "ias40"
        elif any(k in _acg for k in (
            "goodwill", "patent", "copyright", "trademark", "software",
            "licence", "license", "franchise", "customer list",
            "research and development", "intangible",
        )):
            accounting_standard = "ias38"
        else:
            accounting_standard = "ias16"

    # IAS 38: residual value is ALWAYS zero
    if accounting_standard == "ias38":
        residual_value = Decimal("0")
        if payload.get("residual_value") and Decimal(str(payload["residual_value"])) != 0:
            current_app.logger.warning(
                f"[IAS38] Residual value forced to 0 for intangible asset: {asset_name}"
            )

    # IAS 40 fair value model: no depreciation
    fair_value_model = bool(payload.get("fair_value_model") or False)
    if accounting_standard == "ias40" and fair_value_model:
        m = "APP"
        payload["depreciation_method"] = "APP"
        payload["useful_life_months"] = 0
        payload["rb_rate_percent"] = None
        payload["uop_total_units"] = None
        payload["uop_unit_name"] = None
        residual_value = Decimal("0")

    # IAS 38 indefinite useful life: no amortisation
    indefinite_useful_life = bool(payload.get("indefinite_useful_life") or False)
    if accounting_standard == "ias38" and indefinite_useful_life:
        m = "APP"
        payload["depreciation_method"] = "APP"
        payload["useful_life_months"] = 0
        payload["rb_rate_percent"] = None
        payload["uop_total_units"] = None
        payload["uop_unit_name"] = None
        
    # ----------------------------
    # INSERT
    # ----------------------------
    cur.execute(_q(schema, """
      INSERT INTO {schema}.assets(
        company_id,
        asset_code, asset_name, asset_class, asset_class_group,
        parent_asset_id, is_component, is_component_group, component_type, component_no,
        category, location, serial_no, notes,
        source_company_id,
        engagement_company_id,
        engagement_id,
        created_by_user_id,
        updated_by_user_id,
        acquisition_date, available_for_use_date, cost, residual_value,
        vat_recovery_percent,
        vat_input_claimable,
        vat_recovery_reason,
        depreciation_method, useful_life_months,
        rb_rate_percent,
        uop_total_units, uop_unit_name,
        uop_usage_mode, uop_opening_reading,

        -- opening-balance fields
        opening_as_at, opening_cost, opening_accum_dep, opening_impairment,

        status,
        supplier_id, acquisition_ref,
        asset_account_code, accum_dep_account_code, dep_expense_account_code,
        disposal_gain_account_code, disposal_loss_account_code,
        measurement_basis, revaluation_reserve_account_code,
        revaluation_surplus_to_pnl_account_code, revaluation_deficit_pnl_account_code,
        impairment_loss_account_code, impairment_reversal_account_code,
        held_for_sale_account_code,
        is_qualifying_asset, ready_for_use_date,

        -- IAS 40 / IAS 38 fields
        accounting_standard,
        indefinite_useful_life,
        is_intangible_dev_phase,
        dev_cap_start_date,
        dev_cap_end_date,
        fair_value_model,
        rental_income_account_code,
        fv_gain_loss_account_code
        )
        VALUES (
            %s,
            %s,%s,%s,%s,
            %s,%s,%s,%s,%s,
            %s,%s,%s,%s,
            %s, %s, %s, %s, %s,
            %s,%s,%s,%s,
            %s,%s,%s,%s,
            %s,
            %s,%s,
            %s,%s,%s,

            %s,%s,%s,%s,

            %s,
            %s,%s,
            %s,%s,%s,
            %s,%s,
            COALESCE(%s,'cost'), %s,
            %s,%s,
            %s,%s,%s,
            %s,%s,

            -- IAS 40 / IAS 38 values
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s
        )
      RETURNING id
    """), 
        (
            company_id,
            payload["asset_code"], asset_name, asset_class, asset_class_group,
            payload.get("parent_asset_id"),
            bool(payload.get("is_component") or False),
            bool(payload.get("is_component_group") or False),
            payload.get("component_type"),
            payload.get("component_no"),
            category, payload.get("location"), payload.get("serial_no"), payload.get("notes"),
            payload.get("source_company_id"),
            payload.get("engagement_company_id"),
            payload.get("engagement_id"),
            payload.get("created_by_user_id"),
            payload.get("updated_by_user_id"),
            payload["acquisition_date"], payload.get("available_for_use_date"),
            cost, residual_value,
            vat_recovery_percent,
            vat_input_claimable,
            vat_recovery_reason,
            m, 
            payload.get("useful_life_months", 0),
            payload.get("rb_rate_percent"),
            payload.get("uop_total_units"), payload.get("uop_unit_name"),
            uop_usage_mode, uop_opening_reading,

            opening_as_at, opening_cost, opening_accum_dep, opening_impairment,

            "active",
            payload.get("supplier_id"),
            payload.get("acquisition_ref"),
            payload.get("asset_account_code"),
            payload.get("accum_dep_account_code"),
            payload.get("dep_expense_account_code"),
            payload.get("disposal_gain_account_code"),
            payload.get("disposal_loss_account_code"),
            measurement_basis,
            payload.get("revaluation_reserve_account_code"),
            payload.get("revaluation_surplus_to_pnl_account_code"),
            payload.get("revaluation_deficit_pnl_account_code"),
            payload.get("impairment_loss_account_code"),
            payload.get("impairment_reversal_account_code"),
            payload.get("held_for_sale_account_code"),
            bool(payload.get("is_qualifying_asset") or False),
            payload.get("ready_for_use_date"),

            accounting_standard,
            indefinite_useful_life,
            bool(payload.get("is_intangible_dev_phase") or False),
            payload.get("dev_cap_start_date") or None,
            payload.get("dev_cap_end_date") or None,
            fair_value_model,
            payload.get("rental_income_account_code") or None,
            payload.get("fv_gain_loss_account_code") or None,
        ))
    asset_id = cur.fetchone()["id"]

    try:
        profile_id = ensure_asset_tax_profile_for_asset_cur(
            cur,
            company_id,
            asset_id,
        )

        current_app.logger.info(
            "Asset tax profile created asset_id=%s profile_id=%s",
            asset_id,
            profile_id,
        )

    except Exception:
        current_app.logger.exception(
            "Failed creating asset tax profile for asset_id=%s",
            asset_id,
        )

    return asset_id

# ✅ whitelist for safe updates
_ASSET_UPDATE_ALLOWED = {
    "asset_code", "asset_name", "asset_class", "asset_class_group", "category",
    "parent_asset_id",
    "is_component",
    "is_component_group",
    "component_type",
    "component_no",
    "location", "serial_no", "notes",
    "acquisition_date", "available_for_use_date",
    "cost", "residual_value", "vat_input_claimable",
    "vat_recovery_reason", "vat_recovery_percent",
    "depreciation_method", "useful_life_months",
    "rb_rate_percent", "uop_total_units", "uop_unit_name",
    "status", "disposed_date",
    "supplier_id", "acquisition_ref",
    "opening_as_at", "opening_cost", "opening_accum_dep", "opening_impairment",
    "asset_account_code", "accum_dep_account_code", "dep_expense_account_code",
    "disposal_gain_account_code", "disposal_loss_account_code",
    "measurement_basis", "measurement_model",
    "revaluation_reserve_account_code",
    "revaluation_surplus_to_pnl_account_code",
    "revaluation_deficit_pnl_account_code",
    "impairment_loss_account_code",
    "impairment_reversal_account_code",
    "held_for_sale_account_code",
    "is_qualifying_asset", "ready_for_use_date",
    "accounting_standard",
    "indefinite_useful_life",
    "is_intangible_dev_phase",
    "dev_cap_start_date",
    "dev_cap_end_date",
    "fair_value_model",
    "rental_income_account_code",
    "fv_gain_loss_account_code",
}

def update_asset(cur, company_id, asset_id, payload):
    schema = company_schema(company_id)
    payload = payload or {}

    cur.execute(_q(schema, """
      SELECT
        acquisition_date,
        available_for_use_date,
        ready_for_use_date,
        is_qualifying_asset,
        depreciation_method,
        useful_life_months,
        rb_rate_percent,
        uop_total_units
      FROM {schema}.assets
      WHERE company_id=%s AND id=%s
    """), (company_id, asset_id))
    current = cur.fetchone()
    if not current:
        raise Exception("asset not found")

    # IAS 23 / borrowing costs mapping
    if "available_for_use_date" in payload and "ready_for_use_date" not in payload:
        payload["ready_for_use_date"] = payload.get("available_for_use_date")

    if "ready_for_use_date" in payload and "available_for_use_date" not in payload:
        payload["available_for_use_date"] = payload.get("ready_for_use_date")

    if "is_qualifying_asset" in payload:
        payload["is_qualifying_asset"] = bool(payload.get("is_qualifying_asset"))

    # IAS 23 qualifying asset policy
    if payload.get("is_qualifying_asset") is True:
        check_payload = {**current, **payload}

        if not is_asset_class_potentially_qualifying(check_payload):
            current_app.logger.warning(
                f"[IAS23] Asset {asset_id} marked qualifying but does not match policy"
            )

    dep_method = (payload.get("depreciation_method") or current.get("depreciation_method") or "SL").upper()

    useful_life = payload.get("useful_life_months", current.get("useful_life_months"))
    rb_rate = payload.get("rb_rate_percent", current.get("rb_rate_percent"))
    uop_total = payload.get("uop_total_units", current.get("uop_total_units"))

    acquisition_date = payload.get("acquisition_date")
    available_for_use_date = payload.get("available_for_use_date")
    ready_for_use_date = payload.get("ready_for_use_date")

    if not acquisition_date:
        acquisition_date = current.get("acquisition_date")

    if available_for_use_date in ("", None):
        available_for_use_date = current.get("available_for_use_date")

    payload["acquisition_date"] = acquisition_date
    payload["available_for_use_date"] = available_for_use_date

    if ready_for_use_date in ("", None):
        ready_for_use_date = current.get("ready_for_use_date") or available_for_use_date

    payload["ready_for_use_date"] = ready_for_use_date

    if not acquisition_date:
        raise Exception("acquisition_date is required")

    if dep_method == "SL":
        if int(useful_life or 0) <= 0:
            raise Exception("useful_life_months required for Straight-line (SL)")
    elif dep_method == "RB":
        if Decimal(rb_rate or 0) <= 0:
            raise Exception("rb_rate_percent required for Reducing balance (RB)")
    elif dep_method == "UOP":
        if Decimal(uop_total or 0) <= 0:
            raise Exception("uop_total_units required for Units of Production (UOP)")
    else:
        raise Exception("invalid depreciation_method")

    sets = []
    params = []

    for k, v in payload.items():
        if k not in _ASSET_UPDATE_ALLOWED:
            continue

        if k == "depreciation_method" and v is not None:
            v = str(v).upper()

        if k == "acquisition_date" and not v:
            v = current.get("acquisition_date")

        if k == "available_for_use_date" and v == "":
            v = current.get("available_for_use_date")

        sets.append(f"{k}=%s")
        params.append(v)

    if not sets:
        return False

    sets.append("updated_at=NOW()")

    sql = _q(schema, f"""
      UPDATE {{schema}}.assets
      SET {", ".join(sets)}
      WHERE company_id=%s AND id=%s
    """)
    params += [company_id, asset_id]

    cur.execute(sql, params)
    return cur.rowcount > 0

# ---------- Acquisitions ---------
from decimal import Decimal, ROUND_HALF_UP

VAT_RATE = Decimal("0.15")

def _D(x) -> Decimal:
    try:
        return Decimal(str(x or "0"))
    except Exception:
        return Decimal("0")

def _q2(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

def list_asset_components(cur, company_id: int, parent_asset_id: int) -> list[dict]:
    schema = company_schema(company_id)

    cur.execute(_q(schema, """
        SELECT *
        FROM {schema}.assets
        WHERE company_id = %s
          AND parent_asset_id = %s
          AND COALESCE(is_component, FALSE) = TRUE
        ORDER BY component_no NULLS LAST, id
    """), (company_id, parent_asset_id))

    return cur.fetchall() or []

def create_acquisition(cur, company_id, asset_id, payload):
    schema = company_schema(company_id)
    payload = payload or {}

    # ----------------------------
    # funding_source normalize
    # ----------------------------
    funding = (payload.get("funding_source") or payload.get("funding") or "cash")
    funding = str(funding).strip().lower()

    # keep legacy inputs working
    if funding in ("bank", "cash"):
        funding = "bank_cash"
    if funding == "ap":
        funding = "vendor_credit"

    allowed = {"bank_cash", "vendor_credit", "grni", "other"}
    if funding not in allowed:
        raise Exception(f"invalid funding_source: {funding}")

    # ----------------------------
    # amount + VAT meaning rules
    # ----------------------------
    amt = _D(payload.get("amount"))
    if amt <= 0:
        raise Exception("amount must be > 0")
    if not payload.get("acquisition_date"):
        raise Exception("acquisition_date is required")

    # ----------------------------
    # VAT treatment and amount meaning
    # ----------------------------
    vat_treatment = str(
        payload.get("vat_treatment") or "no_vat"
    ).strip().lower()

    if vat_treatment not in {"no_vat", "inclusive", "exclusive"}:
        raise Exception(
            "vat_treatment must be no_vat, inclusive or exclusive"
        )

    vat_input_claimable = bool(payload.get("vat_input_claimable") or False)

    vat_recovery_reason = (
        payload.get("vat_recovery_reason") or ""
    ).strip() or None

    vat_recovery_percent = Decimal(
        str(
            payload.get("vat_recovery_percent")
            or (100 if vat_input_claimable else 0)
        )
    )

    if vat_recovery_percent < 0 or vat_recovery_percent > 100:
        raise Exception("vat_recovery_percent must be between 0 and 100")

    if vat_input_claimable and not vat_recovery_reason:
        raise Exception("vat_recovery_reason is required")

    if not vat_input_claimable:
        vat_recovery_reason = None
        vat_recovery_percent = Decimal("0")

    recoverable_vat = Decimal("0.00")
    non_recoverable_vat = Decimal("0.00")
    vat_amount = Decimal("0.00")
    net_amount = Decimal("0.00")
    gross_amount = Decimal("0.00")
    capitalized_amount = Decimal("0.00")

    if funding == "grni":
        # GRNI is posted net because the supplier invoice has not yet been received.
        if vat_treatment != "no_vat":
            raise Exception("GRNI must use vat_treatment='no_vat'")

        gross_amount = _q2(amt)
        capitalized_amount = gross_amount
        net_amount = capitalized_amount
        vat_amount = Decimal("0.00")

    elif vat_treatment == "no_vat":
        gross_amount = _q2(amt)
        capitalized_amount = gross_amount
        net_amount = capitalized_amount
        vat_amount = Decimal("0.00")
        non_recoverable_vat = Decimal("0.00")

    elif vat_treatment == "inclusive":
        gross_amount = _q2(amt)

        net_excluding_vat, total_vat, _ = _vat_split(gross_amount)

        recoverable_vat = _q2(
            total_vat
            * vat_recovery_percent
            / Decimal("100")
        )

        non_recoverable_vat = _q2(
            total_vat - recoverable_vat
        )

        capitalized_amount = _q2(
            net_excluding_vat + non_recoverable_vat
        )

        net_amount = capitalized_amount
        vat_amount = recoverable_vat

    elif vat_treatment == "exclusive":
        net_excluding_vat = _q2(amt)

        # Use your configured VAT rate here.
        total_vat = _q2(
            net_excluding_vat * VAT_RATE
        )

        recoverable_vat = _q2(
            total_vat
            * vat_recovery_percent
            / Decimal("100")
        )

        non_recoverable_vat = _q2(
            total_vat - recoverable_vat
        )

        gross_amount = _q2(
            net_excluding_vat + total_vat
        )

        capitalized_amount = _q2(
            net_excluding_vat + non_recoverable_vat
        )

        net_amount = capitalized_amount
        vat_amount = recoverable_vat

    # Keep amount as the entered transaction amount.
    payload["amount"] = str(_q2(amt))

    # ----------------------------
    # vendor / invoice / GRN rules
    # ----------------------------
    supplier_id = payload.get("supplier_id") or payload.get("vendor_id")
    supplier_id = int(supplier_id) if supplier_id else None

    vendor_invoice_no = (
        (payload.get("vendor_invoice_no") or payload.get("invoice_no") or payload.get("invoice_number") or "")
    ).strip() or None

    grn_no = (
        (payload.get("grn_no") or payload.get("grn_number") or payload.get("grn_ref") or "")
    ).strip() or None

    if funding in ("vendor_credit", "grni"):
        if not supplier_id or supplier_id <= 0:
            raise Exception("supplier_id required for vendor_credit/grni funding_source")

    if funding == "vendor_credit" and not vendor_invoice_no:
        raise Exception("vendor_invoice_no required for vendor_credit")

    if funding == "grni" and not grn_no:
        raise Exception("grn_no required for grni")

    # ----------------------------
    # bank / other rules
    # ----------------------------
    bank_account_code = (payload.get("bank_account_code") or "").strip() or None
    credit_account_code = (payload.get("credit_account_code") or "").strip() or None

    bank_account_id = int(payload.get("bank_account_id") or 0) or None

    if funding == "bank_cash":
        if not bank_account_id:
            raise Exception("bank_account_id required for bank_cash funding_source")

        # ✅ IMPORTANT: fix table name to match your system
        # If your actual table is FROM {schema}.company_bank_accounts, use that (most consistent with your UI).
        if not bank_account_code:
            cur.execute(_q(schema, """
              SELECT ledger_account_code
              FROM {schema}.company_bank_accounts
              WHERE id=%s
              LIMIT 1
            """), (bank_account_id,))
            r = cur.fetchone() or {}
            bank_account_code = (r.get("ledger_account_code") or "").strip() or None

        if not bank_account_code:
            raise Exception("Selected bank_account_id has no ledger_account_code mapping")

    if funding == "other" and not credit_account_code:
        raise Exception("credit_account_code required for other funding_source")

    # ----------------------------
    # Insert
    posting_date = payload.get("posting_date") or payload.get("acquisition_date")
    if not posting_date:
        raise Exception("posting_date is required")

    cur.execute(_q(schema, """
        INSERT INTO {schema}.asset_acquisitions(
            company_id,
            asset_id,

            source_company_id,
            engagement_company_id,
            engagement_id,
            created_by_user_id,
            updated_by_user_id,

            posting_date,
            acquisition_date,
            amount,
            vat_treatment,

            net_amount,
            vat_amount,
            gross_amount,
            vat_input_claimable,
            vat_recovery_reason,
            vat_recovery_percent,
            non_recoverable_vat_amount,

            funding_source,
            bank_account_id,
            bank_account_code,
            credit_account_code,

            supplier_id,
            vendor_invoice_no,
            grn_no,

            reference,
            notes,
            status
        )
        VALUES (
            %s,%s,

            %s,%s,%s,%s,%s,

            %s,%s,%s,%s,

            %s,%s,%s,%s,%s,%s,%s,

            %s,%s,%s,%s,

            %s,%s,%s,

            %s,%s,COALESCE(%s,'draft')
        )
        RETURNING id
    """), (
        company_id,
        asset_id,

        payload.get("source_company_id"),
        payload.get("engagement_company_id"),
        payload.get("engagement_id"),
        payload.get("created_by_user_id"),
        payload.get("updated_by_user_id"),

        posting_date,
        payload["acquisition_date"],
        payload["amount"],
        vat_treatment,

        net_amount,
        vat_amount,
        gross_amount,
        vat_input_claimable,
        vat_recovery_reason,
        vat_recovery_percent,
        non_recoverable_vat,

        funding,
        bank_account_id,
        bank_account_code,
        credit_account_code,

        supplier_id,
        vendor_invoice_no,
        grn_no,

        payload.get("reference"),
        payload.get("notes"),
        payload.get("status", "draft"),
    ))

    row = cur.fetchone()
    return (row.get("id") if isinstance(row, dict) else row[0])

def update_acquisition_draft(cur, company_id: int, acq_id: int, payload: dict, *, actor_user_id=None):
    schema = company_schema(company_id)
    payload = payload or {}

    cur.execute(_q(schema, """
        SELECT *
        FROM {schema}.asset_acquisitions
        WHERE company_id=%s AND id=%s
        FOR UPDATE
    """), (company_id, acq_id))

    acq = fetchone(cur)
    if not acq:
        raise Exception("Asset acquisition not found")

    if acq.get("status") == "posted" or acq.get("posted_journal_id"):
        raise Exception("Posted acquisition cannot be edited")

    funding = (payload.get("funding_source") or acq.get("funding_source") or "bank_cash")
    funding = str(funding).strip().lower()

    if funding in ("bank", "cash"):
        funding = "bank_cash"
    if funding == "ap":
        funding = "vendor_credit"

    allowed = {"bank_cash", "vendor_credit", "grni", "other"}
    if funding not in allowed:
        raise Exception(f"invalid funding_source: {funding}")

    amt = _D(payload.get("amount", acq.get("amount")))
    if amt <= 0:
        raise Exception("amount must be > 0")

    acquisition_date = payload.get("acquisition_date") or acq.get("acquisition_date")
    posting_date = payload.get("posting_date") or acq.get("posting_date") or acquisition_date

    if not acquisition_date:
        raise Exception("acquisition_date is required")
    if not posting_date:
        raise Exception("posting_date is required")

    amount_is_gross = payload.get("amount_is_gross")
    if amount_is_gross is None:
        amount_is_gross = funding != "grni"
    amount_is_gross = bool(amount_is_gross)

    vat_input_claimable = bool(payload.get("vat_input_claimable", acq.get("vat_input_claimable") or False))
    vat_recovery_reason = (
        payload.get("vat_recovery_reason")
        or acq.get("vat_recovery_reason")
        or ""
    )
    vat_recovery_reason = str(vat_recovery_reason).strip() or None

    if not vat_recovery_reason:
        raise Exception("vat_recovery_reason is required")

    vat_recovery_percent = Decimal(str(
        payload.get(
            "vat_recovery_percent",
            acq.get("vat_recovery_percent") if acq.get("vat_recovery_percent") is not None else (100 if vat_input_claimable else 0)
        )
    ))

    if vat_recovery_percent < 0 or vat_recovery_percent > 100:
        raise Exception("vat_recovery_percent must be between 0 and 100")

    net_amount = Decimal("0.00")
    vat_amount = Decimal("0.00")
    gross_amount = Decimal("0.00")
    non_recoverable_vat = Decimal("0.00")

    if funding == "grni":
        if amount_is_gross:
            raise Exception("GRNI amount must be NET. Set amount_is_gross=false or capture net amount.")

        net_amount = _q2(amt)
        gross_amount = net_amount
        vat_amount = Decimal("0.00")
        non_recoverable_vat = Decimal("0.00")
        stored_amount = str(net_amount)

    else:
        if not amount_is_gross:
            raise Exception("For bank_cash/vendor_credit/other, amount must be VAT-inclusive gross.")

        gross_amount = _q2(amt)
        net_calc, vat_calc, _ = _vat_split(gross_amount)

        recoverable_vat = _q2(vat_calc * vat_recovery_percent / Decimal("100"))
        non_recoverable_vat = _q2(vat_calc - recoverable_vat)

        net_amount = _q2(net_calc + non_recoverable_vat)
        vat_amount = recoverable_vat
        stored_amount = str(gross_amount)

    supplier_id = payload.get("supplier_id", acq.get("supplier_id"))
    supplier_id = int(supplier_id) if supplier_id else None

    vendor_invoice_no = (
        payload.get("vendor_invoice_no")
        or payload.get("invoice_no")
        or payload.get("invoice_number")
        or acq.get("vendor_invoice_no")
        or ""
    )
    vendor_invoice_no = str(vendor_invoice_no).strip() or None

    grn_no = (
        payload.get("grn_no")
        or payload.get("grn_number")
        or payload.get("grn_ref")
        or acq.get("grn_no")
        or ""
    )
    grn_no = str(grn_no).strip() or None

    if funding in ("vendor_credit", "grni"):
        if not supplier_id or supplier_id <= 0:
            raise Exception("supplier_id required for vendor_credit/grni funding_source")

    if funding == "vendor_credit" and not vendor_invoice_no:
        raise Exception("vendor_invoice_no required for vendor_credit")

    if funding == "grni" and not grn_no:
        raise Exception("grn_no required for grni")

    bank_account_id = payload.get("bank_account_id", acq.get("bank_account_id"))
    bank_account_id = int(bank_account_id) if bank_account_id else None

    bank_account_code = (
        payload.get("bank_account_code")
        or acq.get("bank_account_code")
        or ""
    )
    bank_account_code = str(bank_account_code).strip() or None

    credit_account_code = (
        payload.get("credit_account_code")
        or acq.get("credit_account_code")
        or ""
    )
    credit_account_code = str(credit_account_code).strip() or None

    if funding == "bank_cash":
        if not bank_account_id:
            raise Exception("bank_account_id required for bank_cash funding_source")

        if not bank_account_code:
            cur.execute(_q(schema, """
                SELECT ledger_account_code
                FROM {schema}.company_bank_accounts
                WHERE id=%s
                LIMIT 1
            """), (bank_account_id,))
            r = cur.fetchone() or {}
            bank_account_code = (r.get("ledger_account_code") or "").strip() or None

        if not bank_account_code:
            raise Exception("Selected bank_account_id has no ledger_account_code mapping")

    if funding == "other" and not credit_account_code:
        raise Exception("credit_account_code required for other funding_source")

    reference = (
        payload.get("reference")
        or acq.get("reference")
        or f"ASSET-{acq.get('asset_id')}"
    )
    reference = str(reference).strip() or None

    notes = payload.get("notes", acq.get("notes"))
    status = payload.get("status") or acq.get("status") or "draft"

    cur.execute(_q(schema, """
        UPDATE {schema}.asset_acquisitions
        SET
            posting_date=%s,
            acquisition_date=%s,
            amount=%s,

            net_amount=%s,
            vat_amount=%s,
            gross_amount=%s,
            vat_input_claimable=%s,
            vat_recovery_reason=%s,
            vat_recovery_percent=%s,
            non_recoverable_vat_amount=%s,

            funding_source=%s,
            bank_account_id=%s,
            bank_account_code=%s,
            credit_account_code=%s,

            supplier_id=%s,
            vendor_invoice_no=%s,
            grn_no=%s,

            reference=%s,
            notes=%s,
            status=%s,
            updated_by_user_id=%s,
            updated_at=NOW()
        WHERE company_id=%s AND id=%s
        RETURNING *
    """), (
        posting_date,
        acquisition_date,
        stored_amount,

        net_amount,
        vat_amount,
        gross_amount,
        vat_input_claimable,
        vat_recovery_reason,
        vat_recovery_percent,
        non_recoverable_vat,

        funding,
        bank_account_id,
        bank_account_code,
        credit_account_code,

        supplier_id,
        vendor_invoice_no,
        grn_no,

        reference,
        notes,
        status,
        actor_user_id,

        company_id,
        acq_id,
    ))

    return fetchone(cur)

def patch_acquisition_posting_fields(cur, company_id, acq_id, *, posting_date=None, reference=None):
    schema = company_schema(company_id)

    sets = []
    params = []

    if posting_date:
        sets.append("posting_date = COALESCE(posting_date, %s)")
        params.append(posting_date)

    if reference:
        sets.append("reference = COALESCE(NULLIF(reference, ''), %s)")
        params.append(reference)

    if not sets:
        return False

    params.extend([company_id, acq_id])

    cur.execute(_q(schema, f"""
      UPDATE {{schema}}.asset_acquisitions
      SET {", ".join(sets)}
      WHERE company_id=%s AND id=%s
    """), tuple(params))

    return cur.rowcount > 0

def list_acquisitions(cur, company_id, asset_id):
    schema = company_schema(company_id)
    cur.execute(_q(schema, """
      SELECT * FROM {schema}.asset_acquisitions
      WHERE company_id=%s AND asset_id=%s
      ORDER BY acquisition_date DESC, id DESC
    """), (company_id, asset_id))
    return fetchall(cur)

def get_latest_acquisition_for_asset(cur, company_id, asset_id):
    schema = company_schema(company_id)
    cur.execute(_q(schema, """
      SELECT *
      FROM {schema}.asset_acquisitions
      WHERE company_id=%s AND asset_id=%s
      ORDER BY acquisition_date DESC, id DESC
      LIMIT 1
    """), (company_id, asset_id))
    return fetchone(cur)

def get_acquisition(cur, company_id, acq_id):
    schema = company_schema(company_id)
    cur.execute(_q(schema, """
      SELECT *
      FROM {schema}.asset_acquisitions
      WHERE company_id=%s AND id=%s
      LIMIT 1
    """), (company_id, acq_id))
    return fetchone(cur)

# -------------------------
# DEPRECIATION (CRUD)
# -------------------------

def get_depreciation(cur, company_id, dep_id):
    schema = company_schema(company_id)
    cur.execute(_q(schema, "SELECT * FROM {schema}.asset_depreciation WHERE company_id=%s AND id=%s"),
                (company_id, dep_id))
    return fetchone(cur)

def create_depreciation(cur, company_id, payload):
    schema = company_schema(company_id)

    asset_id = int(payload["asset_id"])
    ps = payload["period_start"]
    pe = payload["period_end"]
    created_by = payload.get("created_by")

    dep_id = generate_single_asset_depreciation(cur, company_id, asset_id, ps, pe)

    if not dep_id:
        raise Exception("No depreciation generated for this period (not eligible, duplicate, or amount=0).")

    if created_by:
        cur.execute(_q(schema, """
          UPDATE {schema}.asset_depreciation
          SET created_by=%s
          WHERE company_id=%s AND id=%s
        """), (created_by, company_id, dep_id))

    return dep_id


def list_depreciation(cur, company_id, asset_id=None, status=None, period_end=None, limit=100, offset=0):
    schema = company_schema(company_id)

    where = ["d.company_id = %s"]
    params = [company_id]

    if asset_id:
        where.append("d.asset_id = %s")
        params.append(asset_id)

    if status:
        where.append("d.status = %s")
        params.append(status)

    if period_end:
        where.append("d.period_end = %s")
        params.append(period_end)

    params += [limit, offset]

    cur.execute(_q(schema, f"""
      SELECT
        d.*,
        a.asset_code,
        a.asset_name,
        a.asset_class,
        a.dep_expense_account_code,
        a.accum_dep_account_code
      FROM {{schema}}.asset_depreciation d
      JOIN {{schema}}.assets a ON a.id = d.asset_id
      WHERE {" AND ".join(where)}
      ORDER BY d.period_end DESC, d.id DESC
      LIMIT %s OFFSET %s
    """), params)

    return cur.fetchall()

def void_depreciation(cur, company_id, dep_id):
    schema = company_schema(company_id)

    cur.execute(_q(schema, """
      UPDATE {schema}.asset_depreciation
      SET status='void'
      WHERE company_id=%s AND id=%s AND status <> 'posted'
      RETURNING id
    """), (company_id, dep_id))

    row = cur.fetchone()
    if not row:
        raise ValueError("Depreciation record not found or already posted.")
    return row["id"]


# -------------------------
# REVALUATIONS (CRUD)
# -------------------------
def list_revaluations(cur, company_id, asset_id=None, status=None, limit=100, offset=0):
    schema = company_schema(company_id)
    where = ["company_id=%s"]
    params = [company_id]
    if asset_id:
        where.append("asset_id=%s")
        params.append(asset_id)
    if status:
        where.append("status=%s")
        params.append(status)

    cur.execute(_q(schema, f"""
      SELECT * FROM {{schema}}.asset_revaluations
      WHERE {" AND ".join(where)}
      ORDER BY revaluation_date DESC, id DESC
      LIMIT %s OFFSET %s
    """), (*params, limit, offset))
    return fetchall(cur)

def get_revaluation(cur, company_id, reval_id):
    schema = company_schema(company_id)
    cur.execute(_q(schema, "SELECT * FROM {schema}.asset_revaluations WHERE company_id=%s AND id=%s"),
                (company_id, reval_id))
    return fetchone(cur)

def create_revaluation(cur, company_id, payload):
    schema = company_schema(company_id)

    # ✅ Validate required fields first
    if not payload.get("asset_id"):
        raise ValueError("asset_id is required")

    if not payload.get("revaluation_date"):
        raise ValueError("revaluation_date is required")

    cur.execute(_q(schema, """
      INSERT INTO {schema}.asset_revaluations(
        company_id, asset_id, revaluation_date,
        carrying_amount_before, cost_before, accum_dep_before,
        fair_value, carrying_amount_after, cost_after, accum_dep_after,
        revaluation_change,
        oci_revaluation_surplus, pnl_revaluation_gain, pnl_revaluation_loss,
        method, reason, notes, status, created_by
      )
      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,COALESCE(%s,'gross_restated'),%s,%s,COALESCE(%s,'draft'),%s)
      RETURNING id
    """), (
      company_id,
      payload["asset_id"],
      payload["revaluation_date"],
      payload.get("carrying_amount_before", 0),
      payload.get("cost_before"),
      payload.get("accum_dep_before"),
      payload.get("fair_value", 0),
      payload.get("carrying_amount_after", 0),
      payload.get("cost_after"),
      payload.get("accum_dep_after"),
      payload.get("revaluation_change", 0),
      payload.get("oci_revaluation_surplus", 0),
      payload.get("pnl_revaluation_gain", 0),
      payload.get("pnl_revaluation_loss", 0),
      payload.get("method", "gross_restated"),
      payload.get("reason"),
      payload.get("notes"),
      payload.get("status", "draft"),
      payload.get("created_by"),
    ))

    return cur.fetchone()["id"]

def void_revaluation(cur, company_id, reval_id):
    schema = company_schema(company_id)
    cur.execute(_q(schema, """
      UPDATE {schema}.asset_revaluations
      SET status='void'
      WHERE company_id=%s AND id=%s AND status <> 'posted'
    """), (company_id, reval_id))

def create_group_revaluation_drafts(cur, company_id, payload, *, user=None):
    from . import posting
    schema = company_schema(company_id)

    group_asset_id = int(payload.get("group_asset_id") or payload.get("asset_id") or 0)
    if not group_asset_id:
        raise ValueError("group_asset_id is required")

    if not payload.get("revaluation_date"):
        raise ValueError("revaluation_date is required")

    parent = get_asset(cur, company_id, group_asset_id)
    if not parent or not bool(parent.get("is_component_group")):
        raise ValueError("Selected asset is not a component group")

    components = list_asset_components(cur, company_id, group_asset_id)
    if not components:
        raise ValueError("No component assets found for this group")

    component_values = payload.get("components") or {}
    ids = []

    policy_doc = posting.company_asset_rules(company_id)

    for comp in components:
        comp_id = str(comp["id"])
        component_input = component_values.get(comp_id) or {}

        fair_value = component_input.get("fair_value")
        if fair_value is None:
            fair_value = (component_input.get("meta_json") or {}).get("fair_value")

        if not fair_value or Decimal(str(fair_value)) <= 0:
            raise ValueError(f"Fair value is required for component {comp.get('asset_name')}")

        comp_payload = {
            "asset_id": int(comp["id"]),
            "event_type": "revaluation",
            "event_date": payload.get("revaluation_date"),
            "meta_json": {
                "fair_value": Decimal(str(fair_value)),
                "reason": payload.get("reason") or payload.get("notes"),
            },
            "notes": payload.get("notes"),
        }

        preview = posting.build_sm_preview(
            company_id=company_id,
            asset_row=comp,
            payload=comp_payload,
            policy=policy_doc,
            cur=cur,
            schema=schema,
            user=user,
        )

        impact = preview.get("impact") or {}

        before = Decimal(str(
            impact.get("carrying_amount_before")
            or impact.get("carrying_before")
            or 0
        ))

        after = Decimal(str(
            impact.get("carrying_amount_after")
            or impact.get("carrying_after")
            or fair_value
        ))

        delta = after - before

        new_id = create_revaluation(cur, company_id, {
            "asset_id": int(comp["id"]),
            "revaluation_date": payload.get("revaluation_date"),
            "carrying_amount_before": before,
            "cost_before": comp.get("cost"),
            "accum_dep_before": comp.get("accumulated_depreciation") or comp.get("acc_dep") or 0,
            "fair_value": after,
            "carrying_amount_after": after,
            "revaluation_change": delta,
            "oci_revaluation_surplus": delta if delta > 0 else 0,
            "pnl_revaluation_gain": 0,
            "pnl_revaluation_loss": abs(delta) if delta < 0 else 0,
            "method": payload.get("method") or "gross_restated",
            "reason": payload.get("reason"),
            "notes": payload.get("notes"),
            "status": "draft",
            "created_by": payload.get("created_by"),
        })

        ids.append(int(new_id))

    return {
        "group_asset_id": group_asset_id,
        "component_revaluation_ids": ids,
        "id": ids[0] if ids else None,
    }

# -------------------------
# IMPAIRMENTS (CRUD)
# -------------------------

def _imp_D(value):
    try:
        return Decimal(str(value or 0))
    except Exception:
        return Decimal("0")


def _imp_q2(value):
    return _imp_D(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _asset_carrying_amount_for_impairment(asset):
    for key in ("carrying_amount", "carrying_value", "nbv", "net_book_value"):
        value = asset.get(key)
        if value not in (None, ""):
            return _imp_q2(value)

    cost = _imp_D(asset.get("cost") or asset.get("opening_cost") or asset.get("gross_carrying_amount"))
    dep = _imp_D(asset.get("accumulated_depreciation") or asset.get("acc_dep") or asset.get("opening_accum_dep"))
    impairment = _imp_D(asset.get("accumulated_impairment") or asset.get("opening_impairment"))
    return _imp_q2(cost - dep - impairment)


# ============================================================
# CGU CRUD
# ============================================================

def list_cgus(cur, company_id, status="active"):
    schema = company_schema(company_id)
    where = ["c.company_id=%s"]
    params = [company_id]

    if status:
        where.append("c.status=%s")
        params.append(status)

    cur.execute(_q(schema, f"""
        SELECT c.*, COUNT(m.id) FILTER (WHERE m.included_to IS NULL) AS member_count
        FROM {{schema}}.asset_cgus c
        LEFT JOIN {{schema}}.asset_cgu_members m
          ON m.company_id=c.company_id AND m.cgu_id=c.id
        WHERE {" AND ".join(where)}
        GROUP BY c.id
        ORDER BY c.cgu_name, c.id
    """), tuple(params))

    return fetchall(cur)


def get_cgu(cur, company_id, cgu_id, as_at=None, for_update=False):
    schema = company_schema(company_id)
    lock = "FOR UPDATE" if for_update else ""

    cur.execute(_q(schema, f"""
        SELECT *
        FROM {{schema}}.asset_cgus
        WHERE company_id=%s AND id=%s
        {lock}
    """), (company_id, cgu_id))

    cgu = fetchone(cur)
    if not cgu:
        return None

    params = [company_id, cgu_id]

    if as_at:
        date_filter = """
            AND (m.included_from IS NULL OR m.included_from <= %s)
            AND (m.included_to IS NULL OR m.included_to >= %s)
        """
        params.extend([as_at, as_at])
    else:
        date_filter = "AND m.included_to IS NULL"

    cur.execute(_q(schema, f"""
        SELECT
            m.id AS membership_id,
            m.cgu_id,
            m.asset_id,
            m.allocation_basis,
            m.allocation_weight,
            m.included_from,
            m.included_to,
            m.notes AS membership_notes,
            a.*
        FROM {{schema}}.asset_cgu_members m
        JOIN {{schema}}.assets a
          ON a.company_id=m.company_id AND a.id=m.asset_id
        WHERE m.company_id=%s AND m.cgu_id=%s
        {date_filter}
        ORDER BY a.asset_name, a.id
    """), tuple(params))

    cgu["members"] = fetchall(cur)
    return cgu


def create_cgu(cur, company_id, payload):
    schema = company_schema(company_id)
    code = str(payload.get("cgu_code") or "").strip()
    name = str(payload.get("cgu_name") or "").strip()

    if not code:
        raise ValueError("cgu_code is required")
    if not name:
        raise ValueError("cgu_name is required")

    cur.execute(_q(schema, """
        INSERT INTO {schema}.asset_cgus(
            company_id, cgu_code, cgu_name, description, status,
            source_company_id, engagement_company_id, engagement_id,
            created_by_user_id, updated_by_user_id
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """), (
        company_id, code, name, payload.get("description"), payload.get("status") or "active",
        payload.get("source_company_id"), payload.get("engagement_company_id"),
        payload.get("engagement_id"), payload.get("created_by_user_id"),
        payload.get("updated_by_user_id"),
    ))

    cgu_id = int(cur.fetchone()["id"])
    replace_cgu_members(cur, company_id, cgu_id, payload.get("members") or [])
    return cgu_id


def update_cgu(cur, company_id, cgu_id, payload):
    schema = company_schema(company_id)

    if not get_cgu(cur, company_id, cgu_id, for_update=True):
        raise ValueError("CGU not found")

    cur.execute(_q(schema, """
        UPDATE {schema}.asset_cgus
        SET cgu_code=COALESCE(%s,cgu_code),
            cgu_name=COALESCE(%s,cgu_name),
            description=COALESCE(%s,description),
            status=COALESCE(%s,status),
            updated_by_user_id=COALESCE(%s,updated_by_user_id),
            updated_at=NOW()
        WHERE company_id=%s AND id=%s
    """), (
        payload.get("cgu_code"), payload.get("cgu_name"), payload.get("description"),
        payload.get("status"), payload.get("updated_by_user_id"), company_id, cgu_id,
    ))

    if "members" in payload:
        replace_cgu_members(cur, company_id, cgu_id, payload.get("members") or [])


def _clean_cgu_members(members):
    if not isinstance(members, list):
        raise ValueError("members must be an array")

    cleaned = {}
    for item in members:
        item = item or {}
        asset_id = int(item.get("asset_id") or 0)
        if asset_id <= 0:
            continue

        basis = str(item.get("allocation_basis") or "carrying_amount").strip().lower()
        weight = item.get("allocation_weight")

        if basis not in ALLOCATION_BASES:
            raise ValueError(f"Invalid allocation basis for asset {asset_id}")
        if basis == "manual_weight" and _imp_D(weight) <= 0:
            raise ValueError(f"Allocation weight must be greater than zero for asset {asset_id}")

        cleaned[asset_id] = {
            "asset_id": asset_id,
            "allocation_basis": basis,
            "allocation_weight": weight,
            "included_from": item.get("included_from"),
            "notes": item.get("notes"),
        }

    if not cleaned:
        raise ValueError("A CGU must have at least one asset")

    return list(cleaned.values())


def replace_cgu_members(cur, company_id, cgu_id, members):
    schema = company_schema(company_id)
    members = _clean_cgu_members(members)
    asset_ids = [row["asset_id"] for row in members]

    cur.execute(_q(schema, """
        SELECT id FROM {schema}.assets
        WHERE company_id=%s AND id=ANY(%s)
    """), (company_id, asset_ids))

    found = {int(row["id"]) for row in fetchall(cur)}
    missing = sorted(set(asset_ids) - found)

    if missing:
        raise ValueError(f"Invalid asset ids: {missing}")

    cur.execute(_q(schema, """
        UPDATE {schema}.asset_cgu_members
        SET included_to=CURRENT_DATE
        WHERE company_id=%s AND cgu_id=%s AND included_to IS NULL
    """), (company_id, cgu_id))

    for row in members:
        cur.execute(_q(schema, """
            INSERT INTO {schema}.asset_cgu_members(
                company_id, cgu_id, asset_id, allocation_basis,
                allocation_weight, included_from, notes
            )
            VALUES (%s,%s,%s,%s,%s,COALESCE(%s,CURRENT_DATE),%s)
        """), (
            company_id, cgu_id, row["asset_id"], row["allocation_basis"],
            row["allocation_weight"], row["included_from"], row["notes"],
        ))


# ============================================================
# IMPAIRMENT TARGETS AND ALLOCATION
# ============================================================

def _get_impairment_target_rows(cur, company_id, payload):
    schema = company_schema(company_id)
    target_type = str(payload.get("target_type") or "asset").strip().lower()
    impairment_date = payload.get("impairment_date")
    basis = str(payload.get("allocation_basis") or "carrying_amount").strip().lower()

    if target_type not in IMPAIRMENT_TARGETS:
        raise ValueError("target_type must be asset or cgu")
    if basis not in ALLOCATION_BASES:
        raise ValueError("Invalid allocation_basis")

    if target_type == "asset":
        asset_id = int(payload.get("asset_id") or 0)
        if not asset_id:
            raise ValueError("asset_id is required")

        cur.execute(_q(schema, """
            SELECT * FROM {schema}.assets
            WHERE company_id=%s AND id=%s
        """), (company_id, asset_id))

        asset = fetchone(cur)
        if not asset:
            raise ValueError("Asset not found")

        carrying = _asset_carrying_amount_for_impairment(asset)
        return [{
            "asset_id": asset_id,
            "asset": asset,
            "carrying_amount_before": carrying,
            "allocation_weight": Decimal("1"),
        }]

    cgu_id = int(payload.get("cgu_id") or 0)
    if not cgu_id:
        raise ValueError("cgu_id is required")

    cgu = get_cgu(cur, company_id, cgu_id, as_at=impairment_date)
    if not cgu:
        raise ValueError("CGU not found")
    if cgu.get("status") != "active":
        raise ValueError("CGU is not active")

    manual = payload.get("allocations") or {}
    rows = []

    for asset in cgu.get("members") or []:
        carrying = _asset_carrying_amount_for_impairment(asset)
        if carrying <= 0:
            continue

        asset_id = int(asset["asset_id"])
        supplied = manual.get(str(asset_id)) or manual.get(asset_id) or {}

        if basis == "equal":
            weight = Decimal("1")
        elif basis == "manual_weight":
            weight = _imp_D(supplied.get("allocation_weight") or asset.get("allocation_weight"))
            if weight <= 0:
                raise ValueError(f"Manual weight is required for {asset.get('asset_name') or asset_id}")
        else:
            weight = carrying

        rows.append({
            "asset_id": asset_id,
            "asset": asset,
            "carrying_amount_before": carrying,
            "allocation_weight": weight,
        })

    if not rows:
        raise ValueError("CGU has no assets with a positive carrying amount")

    return rows


def _allocate_amount_by_weight(total, rows):
    total = _imp_q2(total)
    total_weight = sum((_imp_D(row["allocation_weight"]) for row in rows), Decimal("0"))

    if total_weight <= 0:
        raise ValueError("Allocation weights must total more than zero")

    allocated = {}
    running_total = Decimal("0")

    for row in rows:
        asset_id = int(row["asset_id"])
        amount = _imp_q2(total * _imp_D(row["allocation_weight"]) / total_weight)
        allocated[asset_id] = amount
        running_total += amount

    difference = total - running_total
    if difference:
        first_asset_id = int(rows[0]["asset_id"])
        allocated[first_asset_id] += difference

    return allocated


def _event_total(payload, event_type, carrying_total):
    if event_type == "impairment_loss":
        entered = _imp_q2(payload.get("impairment_amount"))
        recoverable = _imp_q2(payload.get("recoverable_amount"))
        total = entered if entered > 0 else max(Decimal("0"), carrying_total - recoverable)

        if total <= 0:
            raise ValueError("Recoverable amount is not below carrying amount")
        if total > carrying_total:
            raise ValueError("Impairment cannot exceed carrying amount")

        return total

    total = _imp_q2(payload.get("reversal_amount"))
    maximum = _imp_q2(payload.get("maximum_reversal_amount"))

    if total <= 0:
        raise ValueError("reversal_amount must be greater than zero")
    if maximum > 0 and total > maximum:
        raise ValueError(f"Reversal exceeds the permitted maximum of {maximum}")

    return total


def _manual_or_weighted_allocations(payload, rows, event_type, total):
    supplied = payload.get("allocations") or {}
    key = "allocated_impairment_amount" if event_type == "impairment_loss" else "allocated_reversal_amount"

    has_manual = any(
        _imp_D((supplied.get(str(row["asset_id"])) or {}).get(key)) > 0
        for row in rows
    )

    if not has_manual:
        return _allocate_amount_by_weight(total, rows)

    amounts = {
        int(row["asset_id"]): _imp_q2((supplied.get(str(row["asset_id"])) or {}).get(key))
        for row in rows
    }

    entered_total = _imp_q2(sum(amounts.values(), Decimal("0")))
    if entered_total != _imp_q2(total):
        raise ValueError(f"Manual allocations must total {_imp_q2(total)}; current total is {entered_total}")

    return amounts


def build_impairment_allocations(cur, company_id, payload):
    event_type = str(payload.get("event_type") or "impairment_loss").strip().lower()

    if event_type not in IMPAIRMENT_EVENTS:
        raise ValueError("Invalid impairment event type")
    if not payload.get("impairment_date"):
        raise ValueError("impairment_date is required")

    rows = _get_impairment_target_rows(cur, company_id, payload)
    carrying_total = _imp_q2(sum((row["carrying_amount_before"] for row in rows), Decimal("0")))
    total = _event_total(payload, event_type, carrying_total)
    amounts = _manual_or_weighted_allocations(payload, rows, event_type, total)

    allocations = []
    for row in rows:
        amount = _imp_q2(amounts[int(row["asset_id"])])
        carrying = _imp_q2(row["carrying_amount_before"])

        if event_type == "impairment_loss" and amount > carrying:
            name = row["asset"].get("asset_name") or row["asset_id"]
            raise ValueError(f"Allocated impairment exceeds carrying amount for {name}")

        loss = amount if event_type == "impairment_loss" else Decimal("0")
        reversal = amount if event_type == "impairment_reversal" else Decimal("0")

        allocations.append({
            **row,
            "allocated_impairment_amount": loss,
            "allocated_reversal_amount": reversal,
            "carrying_amount_after": _imp_q2(carrying - loss + reversal),
        })

    return {
        "target_type": str(payload.get("target_type") or "asset").strip().lower(),
        "event_type": event_type,
        "carrying_amount_before": carrying_total,
        "recoverable_amount": _imp_q2(payload.get("recoverable_amount")),
        "impairment_amount": total if event_type == "impairment_loss" else Decimal("0"),
        "reversal_amount": total if event_type == "impairment_reversal" else Decimal("0"),
        "allocations": allocations,
    }


# ============================================================
# IMPAIRMENT CRUD
# ============================================================

def list_impairments(
    cur, company_id, asset_id=None, cgu_id=None,
    target_type=None, status=None, limit=100, offset=0
):
    schema = company_schema(company_id)
    where = ["i.company_id=%s"]
    params = [company_id]

    if asset_id:
        where.append("""
            (
                i.asset_id=%s OR EXISTS (
                    SELECT 1
                    FROM {schema}.asset_impairment_allocations x
                    WHERE x.company_id=i.company_id
                      AND x.impairment_id=i.id
                      AND x.asset_id=%s
                )
            )
        """)
        params.extend([asset_id, asset_id])

    if cgu_id:
        where.append("i.cgu_id=%s")
        params.append(cgu_id)
    if target_type:
        where.append("i.target_type=%s")
        params.append(target_type)
    if status:
        where.append("i.status=%s")
        params.append(status)

    cur.execute(_q(schema, f"""
        SELECT i.*, a.asset_code, a.asset_name, c.cgu_code, c.cgu_name
        FROM {{schema}}.asset_impairments i
        LEFT JOIN {{schema}}.assets a
          ON a.company_id=i.company_id AND a.id=i.asset_id
        LEFT JOIN {{schema}}.asset_cgus c
          ON c.company_id=i.company_id AND c.id=i.cgu_id
        WHERE {" AND ".join(where)}
        ORDER BY i.impairment_date DESC, i.id DESC
        LIMIT %s OFFSET %s
    """), (*params, limit, offset))

    return fetchall(cur)


def get_impairment(cur, company_id, imp_id, for_update=False):
    schema = company_schema(company_id)

    lock = "FOR UPDATE OF i" if for_update else ""

    cur.execute(_q(schema, f"""
        SELECT
            i.*,
            a.asset_code,
            a.asset_name,
            c.cgu_code,
            c.cgu_name
        FROM {{schema}}.asset_impairments i

        LEFT JOIN {{schema}}.assets a
          ON a.company_id=i.company_id
         AND a.id=i.asset_id

        LEFT JOIN {{schema}}.asset_cgus c
          ON c.company_id=i.company_id
         AND c.id=i.cgu_id

        WHERE i.company_id=%s
          AND i.id=%s

        {lock}
    """), (company_id, imp_id))

    impairment = fetchone(cur)
    if not impairment:
        return None

    cur.execute(_q(schema, """
        SELECT
            x.*,
            a.asset_code,
            a.asset_name
        FROM {schema}.asset_impairment_allocations x
        JOIN {schema}.assets a
          ON a.company_id=x.company_id
         AND a.id=x.asset_id
        WHERE x.company_id=%s
          AND x.impairment_id=%s
        ORDER BY a.asset_name, a.id
    """), (company_id, imp_id))

    impairment["allocations"] = fetchall(cur)
    return impairment

def _insert_impairment_allocations(cur, company_id, impairment_id, cgu_id, rows, notes=None):
    schema = company_schema(company_id)

    for row in rows:
        cur.execute(_q(schema, """
            INSERT INTO {schema}.asset_impairment_allocations(
                company_id, impairment_id, cgu_id, asset_id,
                carrying_amount_before, allocation_weight,
                allocated_impairment_amount, allocated_reversal_amount,
                carrying_amount_after, notes
            )
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """), (
            company_id, impairment_id, cgu_id, row["asset_id"],
            row["carrying_amount_before"], row["allocation_weight"],
            row["allocated_impairment_amount"], row["allocated_reversal_amount"],
            row["carrying_amount_after"], notes,
        ))


def create_impairment(cur, company_id, payload):
    schema = company_schema(company_id)
    calc = build_impairment_allocations(cur, company_id, payload)
    is_cgu = calc["target_type"] == "cgu"
    asset_id = int(payload.get("asset_id") or 0) or None
    cgu_id = int(payload.get("cgu_id") or 0) or None

    cur.execute(_q(schema, """
        INSERT INTO {schema}.asset_impairments(
            company_id, target_type, asset_id, cgu_id,
            impairment_date, event_type,
            carrying_amount_before, recoverable_amount,
            impairment_amount, reversal_amount,
            recoverable_basis, fair_value_less_costs, value_in_use,
            discount_rate, growth_rate, cash_flow_period_months,
            allocation_basis, reason, notes, status,
            source_company_id, engagement_company_id, engagement_id,
            created_by_user_id, updated_by_user_id
        )
        VALUES (
            %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
            %s,%s,%s,%s,%s,%s,%s,%s,%s,COALESCE(%s,'draft'),
            %s,%s,%s,%s,%s
        )
        RETURNING id
    """), (
        company_id, calc["target_type"], None if is_cgu else asset_id, cgu_id if is_cgu else None,
        payload["impairment_date"], calc["event_type"],
        calc["carrying_amount_before"], calc["recoverable_amount"],
        calc["impairment_amount"], calc["reversal_amount"],
        payload.get("recoverable_basis"), payload.get("fair_value_less_costs"),
        payload.get("value_in_use"), payload.get("discount_rate"),
        payload.get("growth_rate"), payload.get("cash_flow_period_months"),
        payload.get("allocation_basis") or "carrying_amount",
        payload.get("reason"), payload.get("notes"), payload.get("status"),
        payload.get("source_company_id"), payload.get("engagement_company_id"),
        payload.get("engagement_id"), payload.get("created_by_user_id"),
        payload.get("updated_by_user_id"),
    ))

    impairment_id = int(cur.fetchone()["id"])
    _insert_impairment_allocations(
        cur, company_id, impairment_id,
        cgu_id if is_cgu else None,
        calc["allocations"], payload.get("notes")
    )
    return impairment_id


def update_impairment(cur, company_id, imp_id, payload):
    schema = company_schema(company_id)
    current = get_impairment(cur, company_id, imp_id, for_update=True)

    if not current:
        raise ValueError("Impairment not found")
    if current.get("status") not in {"draft", "pending_review"}:
        raise ValueError("Only draft or pending-review impairments can be edited")

    merged = {**current, **(payload or {})}
    calc = build_impairment_allocations(cur, company_id, merged)
    is_cgu = calc["target_type"] == "cgu"
    asset_id = int(merged.get("asset_id") or 0) or None
    cgu_id = int(merged.get("cgu_id") or 0) or None

    cur.execute(_q(schema, """
        UPDATE {schema}.asset_impairments
        SET target_type=%s, asset_id=%s, cgu_id=%s,
            impairment_date=%s, event_type=%s,
            carrying_amount_before=%s, recoverable_amount=%s,
            impairment_amount=%s, reversal_amount=%s,
            recoverable_basis=%s, fair_value_less_costs=%s, value_in_use=%s,
            discount_rate=%s, growth_rate=%s, cash_flow_period_months=%s,
            allocation_basis=%s, reason=%s, notes=%s,
            updated_by_user_id=%s, updated_at=NOW()
        WHERE company_id=%s AND id=%s
    """), (
        calc["target_type"], None if is_cgu else asset_id, cgu_id if is_cgu else None,
        merged["impairment_date"], calc["event_type"],
        calc["carrying_amount_before"], calc["recoverable_amount"],
        calc["impairment_amount"], calc["reversal_amount"],
        merged.get("recoverable_basis"), merged.get("fair_value_less_costs"),
        merged.get("value_in_use"), merged.get("discount_rate"),
        merged.get("growth_rate"), merged.get("cash_flow_period_months"),
        merged.get("allocation_basis") or "carrying_amount",
        merged.get("reason"), merged.get("notes"), merged.get("updated_by_user_id"),
        company_id, imp_id,
    ))

    cur.execute(_q(schema, """
        DELETE FROM {schema}.asset_impairment_allocations
        WHERE company_id=%s AND impairment_id=%s
    """), (company_id, imp_id))

    _insert_impairment_allocations(
        cur, company_id, imp_id,
        cgu_id if is_cgu else None,
        calc["allocations"], merged.get("notes")
    )


def void_impairment(cur, company_id, imp_id):
    schema = company_schema(company_id)

    cur.execute(_q(schema, """
        UPDATE {schema}.asset_impairments
        SET status='void', updated_at=NOW()
        WHERE company_id=%s AND id=%s
          AND status IN ('draft','pending_review')
    """), (company_id, imp_id))

    if cur.rowcount != 1:
        raise ValueError("Only draft or pending-review impairments can be voided")
# -------------------------
# DISPOSALS (CRUD)
# -------------------------
def list_disposals(cur, company_id, asset_id=None, status=None, limit=100, offset=0):
    schema = company_schema(company_id)
    where = ["company_id=%s"]
    params = [company_id]
    if asset_id:
        where.append("asset_id=%s")
        params.append(asset_id)
    if status:
        where.append("status=%s")
        params.append(status)

    cur.execute(_q(schema, f"""
      SELECT * FROM {{schema}}.asset_disposals
      WHERE {" AND ".join(where)}
      ORDER BY disposal_date DESC, id DESC
      LIMIT %s OFFSET %s
    """), (*params, limit, offset))
    return fetchall(cur)

def get_disposal(cur, company_id, disp_id):
    schema = company_schema(company_id)
    cur.execute(_q(schema, "SELECT * FROM {schema}.asset_disposals WHERE company_id=%s AND id=%s"),
                (company_id, disp_id))
    return fetchone(cur)

def create_disposal(cur, company_id, payload):
    schema = company_schema(company_id)
    cur.execute(_q(schema, """
      INSERT INTO {schema}.asset_disposals(
        company_id, asset_id,
        disposal_date, proceeds,
        carrying_amount, gain_loss,
        reference, notes, status,
        bank_account_code
      )
      VALUES (%s,%s,%s,%s,COALESCE(%s,0),COALESCE(%s,0),%s,%s,COALESCE(%s,'draft'),%s)
      RETURNING id
    """), (
      company_id, payload["asset_id"],
      payload["disposal_date"], payload.get("proceeds", 0),
      payload.get("carrying_amount"),
      payload.get("gain_loss"),
      payload.get("reference"),
      payload.get("notes"),
      payload.get("status","draft"),
      payload.get("bank_account_code"),
    ))
    return cur.fetchone()["id"]

def void_disposal(cur, company_id, disp_id):
    schema = company_schema(company_id)
    cur.execute(_q(schema, """
      UPDATE {schema}.asset_disposals
      SET status='void'
      WHERE company_id=%s AND id=%s AND status <> 'posted'
    """), (company_id, disp_id))

# -------------------------
# HELD FOR SALE (CRUD)
# -------------------------
def list_hfs(cur, company_id, asset_id=None, status=None, limit=100, offset=0):
    schema = company_schema(company_id)
    where = ["company_id=%s"]
    params = [company_id]
    if asset_id:
        where.append("asset_id=%s")
        params.append(asset_id)
    if status:
        where.append("status=%s")
        params.append(status)

    cur.execute(_q(schema, f"""
      SELECT * FROM {{schema}}.asset_held_for_sale
      WHERE {" AND ".join(where)}
      ORDER BY classification_date DESC, id DESC
      LIMIT %s OFFSET %s
    """), (*params, limit, offset))
    return fetchall(cur)

def get_hfs(cur, company_id, hfs_id):
    schema = company_schema(company_id)
    cur.execute(_q(schema, "SELECT * FROM {schema}.asset_held_for_sale WHERE company_id=%s AND id=%s"),
                (company_id, hfs_id))
    return fetchone(cur)

def create_hfs(cur, company_id, payload):
    schema = company_schema(company_id)
    cur.execute(_q(schema, """
      INSERT INTO {schema}.asset_held_for_sale(
        company_id, asset_id,
        classification_date,
        carrying_amount, fair_value_less_costs,
        impairment_on_classification,
        status, disposal_date, proceeds
      )
      VALUES (%s,%s,%s,%s,%s,%s,COALESCE(%s,'active'),%s,%s)
      RETURNING id
    """), (
      company_id, payload["asset_id"],
      payload["classification_date"],
      payload["carrying_amount"], payload["fair_value_less_costs"],
      payload.get("impairment_on_classification", 0),
      payload.get("status","active"),
      payload.get("disposal_date"),
      payload.get("proceeds"),
    ))
    return cur.fetchone()["id"]

def reverse_hfs(cur, company_id, hfs_id):
    schema = company_schema(company_id)
    cur.execute(_q(schema, """
      UPDATE {schema}.asset_held_for_sale
      SET status='reversed'
      WHERE company_id=%s AND id=%s AND status='active'
    """), (company_id, hfs_id))

# -------------------------
# TRANSFERS (CRUD)
# -------------------------
def list_transfers(cur, company_id, asset_id=None, limit=100, offset=0):
    schema = company_schema(company_id)
    where = ["company_id=%s"]
    params = [company_id]
    if asset_id:
        where.append("asset_id=%s")
        params.append(asset_id)

    cur.execute(_q(schema, f"""
      SELECT * FROM {{schema}}.asset_transfers
      WHERE {" AND ".join(where)}
      ORDER BY transfer_date DESC, id DESC
      LIMIT %s OFFSET %s
    """), (*params, limit, offset))
    return fetchall(cur)

def create_transfer(cur, company_id, payload):
    schema = company_schema(company_id)
    cur.execute(_q(schema, """
      INSERT INTO {schema}.asset_transfers(
        company_id, asset_id, transfer_date,
        from_asset_class, to_asset_class,
        from_category, to_category,
        from_location, to_location,
        from_cost_centre, to_cost_centre,
        reason, notes, status
      )
      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,COALESCE(%s,'posted'))
      RETURNING id
    """), (
      company_id, payload["asset_id"], payload["transfer_date"],
      payload.get("from_asset_class"), payload.get("to_asset_class"),
      payload.get("from_category"), payload.get("to_category"),
      payload.get("from_location"), payload.get("to_location"),
      payload.get("from_cost_centre"), payload.get("to_cost_centre"),
      payload.get("reason"), payload.get("notes"),
      payload.get("status","posted"),
    ))
    return cur.fetchone()["id"]

# -------------------------
# STANDARD TRANSFERS (CRUD)
# -------------------------
def list_standard_transfers(cur, company_id, asset_id=None, status=None, limit=100, offset=0):
    schema = company_schema(company_id)
    where = ["company_id=%s"]
    params = [company_id]
    if asset_id:
        where.append("asset_id=%s")
        params.append(asset_id)
    if status:
        where.append("status=%s")
        params.append(status)

    cur.execute(_q(schema, f"""
      SELECT * FROM {{schema}}.asset_standard_transfers
      WHERE {" AND ".join(where)}
      ORDER BY transfer_date DESC, id DESC
      LIMIT %s OFFSET %s
    """), (*params, limit, offset))
    return fetchall(cur)

def create_standard_transfer(cur, company_id, payload):
    schema = company_schema(company_id)
    cur.execute(_q(schema, """
      INSERT INTO {schema}.asset_standard_transfers(
        company_id, asset_id, transfer_date,
        from_standard, to_standard,
        carrying_amount_before, fair_value,
        transfer_adjustment, oci_amount, pnl_amount,
        reason, notes, status, created_by
      )
      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,COALESCE(%s,'draft'),%s)
      RETURNING id
    """), (
      company_id, payload["asset_id"], payload["transfer_date"],
      payload["from_standard"], payload["to_standard"],
      payload.get("carrying_amount_before", 0),
      payload.get("fair_value"),
      payload.get("transfer_adjustment", 0),
      payload.get("oci_amount", 0),
      payload.get("pnl_amount", 0),
      payload.get("reason"),
      payload.get("notes"),
      payload.get("status","draft"),
      payload.get("created_by"),
    ))
    return cur.fetchone()["id"]

def void_standard_transfer(cur, company_id, tr_id):
    schema = company_schema(company_id)
    cur.execute(_q(schema, """
      UPDATE {schema}.asset_standard_transfers
      SET status='void'
      WHERE company_id=%s AND id=%s AND status <> 'posted'
    """), (company_id, tr_id))

def _table_exists(cur, schema: str, table: str) -> bool:
    cur.execute("""
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema=%s AND table_name=%s
        LIMIT 1
    """, (schema, table))
    return cur.fetchone() is not None

def _col_exists(cur, schema: str, table: str, column: str) -> bool:
    cur.execute("""
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema=%s
          AND table_name=%s
          AND column_name=%s
        LIMIT 1
    """, (schema, table, column))
    return cur.fetchone() is not None

def _ensure_col(cur, schema: str, table: str, column: str, ddl_type: str, *, default_sql: str | None = None, not_null: bool = False):
    """
    Ensures a column exists. If missing, adds it.
    ddl_type examples: "boolean", "timestamptz", "int", "text"
    default_sql examples: "false", "NOW()", "0"
    """
    if not _table_exists(cur, schema, table):
        return False  # table missing, can't add columns

    # Build the ADD COLUMN clause
    parts = [f"ALTER TABLE {schema}.{table} ADD COLUMN IF NOT EXISTS {column} {ddl_type}"]
    if default_sql is not None:
        parts[-1] += f" DEFAULT {default_sql}"
    if not_null:
        parts[-1] += " NOT NULL"

    cur.execute(parts[0])
    return True 

def list_asset_activity(
    cur,
    company_id: int,
    asset_id: int,
    *,
    include_archived: bool = False,
    limit: int = 250,
    offset: int = 0
):
    """
    ✅ Safe across tenant schemas:
    - Includes only tables that exist
    - Includes only columns that exist (archival fields etc.)
    - Avoids relation/column does not exist crashes
    """
    schema = company_schema(company_id)

    unions: list[str] = []
    union_params: list[tuple[int, int]] = []  # one (company_id, asset_id) per union

    def add_union(sql_block: str):
        unions.append(sql_block)
        union_params.append((company_id, asset_id))

    def t_exists(t: str) -> bool:
        return _table_exists(cur, schema, t)

    def c_exists(t: str, c: str) -> bool:
        return _col_exists(cur, schema, t, c)

    def archived_filter(alias: str, table: str, col: str = "is_archived") -> str:
        """
        Returns a safe archival WHERE fragment.
        If column doesn't exist, returns "" (cannot filter).
        """
        if include_archived:
            return ""
        if c_exists(table, col):
            return f" AND {alias}.{col}=FALSE"
        return ""

    # -----------------------------
    # ACQUISITIONS
    # -----------------------------
    if t_exists("asset_acquisitions"):
        add_union(f"""
          SELECT
            ac.acquisition_date::date AS event_date,
            'acquisition'::text       AS event_type,
            ac.status::text           AS status,
            ac.amount::numeric(18,2)  AS amount,
            COALESCE(ac.vendor_invoice_no, ac.grn_no, ac.reference)::text AS reference,
            ac.posted_journal_id::int AS posted_journal_id,
            'asset_acquisitions'::text AS source_table,
            ac.id::int                AS source_id,
            jsonb_build_object(
              'funding_source', ac.funding_source,
              'supplier_id', ac.supplier_id,
              'bank_account_code', ac.bank_account_code,
              'credit_account_code', ac.credit_account_code,
              'notes', ac.notes
            ) AS meta
          FROM {schema}.asset_acquisitions ac
          WHERE ac.company_id=%s AND ac.asset_id=%s
        """)

    # -----------------------------
    # DEPRECIATION
    # -----------------------------
    if t_exists("asset_depreciation"):
        add_union(f"""
          SELECT
            d.period_end::date AS event_date,
            'depreciation'::text AS event_type,
            d.status::text AS status,
            d.depreciation_amount::numeric(18,2) AS amount,
            (d.period_start::text || ' .. ' || d.period_end::text)::text AS reference,
            d.posted_journal_id::int AS posted_journal_id,
            'asset_depreciation'::text AS source_table,
            d.id::int AS source_id,
            jsonb_build_object(
              'period_start', d.period_start,
              'period_end', d.period_end,
              'accumulated_depreciation', d.accumulated_depreciation,
              'carrying_amount', d.carrying_amount,
              'method_basis', d.depreciation_method_basis,
              'measurement_basis', d.measurement_basis
            ) AS meta
          FROM {schema}.asset_depreciation d
          WHERE d.company_id=%s AND d.asset_id=%s
        """)

    # -----------------------------
    # REVALUATIONS
    # -----------------------------
    if t_exists("asset_revaluations"):
        add_union(f"""
          SELECT
            r.revaluation_date::date AS event_date,
            'revaluation'::text AS event_type,
            r.status::text AS status,
            r.revaluation_change::numeric(18,2) AS amount,
            NULL::text AS reference,
            r.posted_journal_id::int AS posted_journal_id,
            'asset_revaluations'::text AS source_table,
            r.id::int AS source_id,
            jsonb_build_object(
              'fair_value', r.fair_value,
              'carrying_before', r.carrying_amount_before,
              'carrying_after', r.carrying_amount_after,
              'oci_surplus', r.oci_revaluation_surplus,
              'pnl_gain', r.pnl_revaluation_gain,
              'pnl_loss', r.pnl_revaluation_loss,
              'method', r.method,
              'reason', r.reason
            ) AS meta
          FROM {schema}.asset_revaluations r
          WHERE r.company_id=%s AND r.asset_id=%s
        """)

    # -----------------------------
    # IMPAIRMENTS
    # -----------------------------
    if t_exists("asset_impairments"):
        add_union(f"""
          SELECT
            i.impairment_date::date AS event_date,
            'impairment'::text AS event_type,
            i.status::text AS status,
            i.impairment_amount::numeric(18,2) AS amount,
            NULL::text AS reference,
            i.posted_journal_id::int AS posted_journal_id,
            'asset_impairments'::text AS source_table,
            i.id::int AS source_id,
            jsonb_build_object(
              'carrying_before', i.carrying_amount_before,
              'recoverable_amount', i.recoverable_amount,
              'reversal_amount', i.reversal_amount,
              'reason', i.reason
            ) AS meta
          FROM {schema}.asset_impairments i
          WHERE i.company_id=%s AND i.asset_id=%s
        """)

    # -----------------------------
    # DISPOSALS
    # -----------------------------
    if t_exists("asset_disposals"):
        add_union(f"""
          SELECT
            disp.disposal_date::date AS event_date,
            'disposal'::text AS event_type,
            disp.status::text AS status,
            disp.proceeds::numeric(18,2) AS amount,
            disp.reference::text AS reference,
            disp.posted_journal_id::int AS posted_journal_id,
            'asset_disposals'::text AS source_table,
            disp.id::int AS source_id,
            jsonb_build_object(
              'carrying_amount', disp.carrying_amount,
              'gain_loss', disp.gain_loss,
              'bank_account_code', disp.bank_account_code,
              'notes', disp.notes
            ) AS meta
          FROM {schema}.asset_disposals disp
          WHERE disp.company_id=%s AND disp.asset_id=%s
        """)

    # -----------------------------
    # HELD FOR SALE
    # -----------------------------
    if t_exists("asset_held_for_sale"):
        add_union(f"""
          SELECT
            h.classification_date::date AS event_date,
            'held_for_sale'::text AS event_type,
            h.status::text AS status,
            h.carrying_amount::numeric(18,2) AS amount,
            NULL::text AS reference,
            h.posted_journal_id::int AS posted_journal_id,
            'asset_held_for_sale'::text AS source_table,
            h.id::int AS source_id,
            jsonb_build_object(
              'fair_value_less_costs', h.fair_value_less_costs,
              'impairment_on_classification', h.impairment_on_classification,
              'disposal_date', h.disposal_date,
              'proceeds', h.proceeds
            ) AS meta
          FROM {schema}.asset_held_for_sale h
          WHERE h.company_id=%s AND h.asset_id=%s
        """)

    # -----------------------------
    # TRANSFERS
    # -----------------------------
    if t_exists("asset_transfers"):
        add_union(f"""
          SELECT
            t.transfer_date::date AS event_date,
            'transfer'::text AS event_type,
            t.status::text AS status,
            0::numeric(18,2) AS amount,
            NULL::text AS reference,
            t.posted_journal_id::int AS posted_journal_id,
            'asset_transfers'::text AS source_table,
            t.id::int AS source_id,
            jsonb_build_object(
              'from_class', t.from_asset_class,
              'to_class', t.to_asset_class,
              'from_location', t.from_location,
              'to_location', t.to_location,
              'from_cost_centre', t.from_cost_centre,
              'to_cost_centre', t.to_cost_centre,
              'reason', t.reason
            ) AS meta
          FROM {schema}.asset_transfers t
          WHERE t.company_id=%s AND t.asset_id=%s
        """)

    # -----------------------------
    # STANDARD TRANSFERS
    # -----------------------------
    if t_exists("asset_standard_transfers"):
        add_union(f"""
          SELECT
            st.transfer_date::date AS event_date,
            'standard_transfer'::text AS event_type,
            st.status::text AS status,
            st.transfer_adjustment::numeric(18,2) AS amount,
            NULL::text AS reference,
            st.posted_journal_id::int AS posted_journal_id,
            'asset_standard_transfers'::text AS source_table,
            st.id::int AS source_id,
            jsonb_build_object(
              'from_standard', st.from_standard,
              'to_standard', st.to_standard,
              'carrying_before', st.carrying_amount_before,
              'fair_value', st.fair_value,
              'oci_amount', st.oci_amount,
              'pnl_amount', st.pnl_amount,
              'reason', st.reason
            ) AS meta
          FROM {schema}.asset_standard_transfers st
          WHERE st.company_id=%s AND st.asset_id=%s
        """)

    # -----------------------------
    # UOP USAGE
    # -----------------------------
    if t_exists("asset_usage"):
        add_union(f"""
          SELECT
            u.period_end::date AS event_date,
            'usage'::text AS event_type,
            u.status::text AS status,
            u.units_used::numeric(18,4) AS amount,
            (u.period_start::text || ' .. ' || u.period_end::text)::text AS reference,
            NULL::int AS posted_journal_id,
            'asset_usage'::text AS source_table,
            u.id::int AS source_id,
            jsonb_build_object(
              'period_start', u.period_start,
              'period_end', u.period_end,
              'notes', u.notes
            ) AS meta
          FROM {schema}.asset_usage u
          WHERE u.company_id=%s AND u.asset_id=%s
        """)

    # -----------------------------
    # REVALUATION RESERVE LEDGER
    # -----------------------------
    if t_exists("asset_revaluation_reserve"):
        add_union(f"""
          SELECT
            rr.event_date::date AS event_date,
            'revaluation_reserve'::text AS event_type,
            rr.status::text AS status,
            rr.reserve_movement::numeric(18,2) AS amount,
            rr.event_type::text AS reference,
            rr.posted_journal_id::int AS posted_journal_id,
            'asset_revaluation_reserve'::text AS source_table,
            rr.id::int AS source_id,
            jsonb_build_object(
              'reserve_balance_after', rr.reserve_balance_after,
              'equity_account_code', rr.equity_account_code,
              'revaluation_id', rr.revaluation_id,
              'impairment_id', rr.impairment_id,
              'disposal_id', rr.disposal_id,
              'transfer_id', rr.transfer_id,
              'notes', rr.notes
            ) AS meta
          FROM {schema}.asset_revaluation_reserve rr
          WHERE rr.company_id=%s AND rr.asset_id=%s
        """)

    # -----------------------------
    # OPTIONAL: VERIFICATIONS (archival cols may not exist)
    # -----------------------------
    if t_exists("asset_verifications"):
        ver_filter = archived_filter("v", "asset_verifications", "is_archived")

        meta_parts = [
            "'custodian', v.custodian",
            "'notes', v.notes",
            "'verified_by', v.verified_by",
        ]
        if c_exists("asset_verifications", "is_archived"):
            meta_parts.append("'is_archived', v.is_archived")
        if c_exists("asset_verifications", "archived_at"):
            meta_parts.append("'archived_at', v.archived_at")
        if c_exists("asset_verifications", "archived_by"):
            meta_parts.append("'archived_by', v.archived_by")

        add_union(f"""
          SELECT
            v.verification_date::date AS event_date,
            'verification'::text AS event_type,
            v.status::text AS status,
            0::numeric(18,2) AS amount,
            v.location::text AS reference,
            NULL::int AS posted_journal_id,
            'asset_verifications'::text AS source_table,
            v.id::int AS source_id,
            jsonb_build_object({", ".join(meta_parts)}) AS meta
          FROM {schema}.asset_verifications v
          WHERE v.company_id=%s AND v.asset_id=%s {ver_filter}
        """)

    # -----------------------------
    # OPTIONAL: DOCUMENTS (archival cols may not exist)
    # -----------------------------
    if t_exists("asset_documents"):
        docs_filter = archived_filter("doc", "asset_documents", "is_archived")

        meta_parts = [
            "'doc_type', doc.doc_type",
            "'file_url', doc.file_url",
            "'storage_key', doc.storage_key",
            "'file_path', doc.file_path",
            "'mime_type', doc.mime_type",
            "'file_size_bytes', doc.file_size_bytes",
            "'reference', doc.reference",
            "'notes', doc.notes",
        ]
        # only add archival fields if they exist
        if c_exists("asset_documents", "is_archived"):
            meta_parts.append("'is_archived', doc.is_archived")
        if c_exists("asset_documents", "archived_at"):
            meta_parts.append("'archived_at', doc.archived_at")
        if c_exists("asset_documents", "archived_by"):
            meta_parts.append("'archived_by', doc.archived_by")

        # status expression must also be safe if is_archived missing
        if c_exists("asset_documents", "is_archived"):
            status_expr = "CASE WHEN doc.is_archived THEN 'archived' ELSE 'posted' END::text"
        else:
            status_expr = "'posted'::text"

        add_union(f"""
          SELECT
            doc.uploaded_at::date AS event_date,
            'document'::text AS event_type,
            {status_expr} AS status,
            0::numeric(18,2) AS amount,
            doc.file_name::text AS reference,
            NULL::int AS posted_journal_id,
            'asset_documents'::text AS source_table,
            doc.id::int AS source_id,
            jsonb_build_object({", ".join(meta_parts)}) AS meta
          FROM {schema}.asset_documents doc
          WHERE doc.company_id=%s AND doc.asset_id=%s {docs_filter}
        """)

    # If nothing exists in this tenant yet, return empty safely
    if not unions:
        return []

    sql = f"""
      SELECT *
      FROM (
        {" UNION ALL ".join(unions)}
      ) x
      ORDER BY event_date DESC, event_type ASC, source_id DESC
      LIMIT %s OFFSET %s;
    """

    params: list = []
    for (cid, aid) in union_params:
        params += [cid, aid]
    params += [limit, offset]

    cur.execute(sql, params)
    return cur.fetchall()

def list_asset_documents(
    cur,
    company_id: int,
    asset_id: int,
    *,
    doc_type=None,
    q=None,
    include_archived: bool = False,
    limit=100,
    offset=0
):
    schema = company_schema(company_id)

    where = ["company_id=%s", "asset_id=%s"]
    params = [company_id, asset_id]

    has_arch = _has_col(cur, schema, "asset_documents", "is_archived")

    if not include_archived and has_arch:
        where.append("is_archived=FALSE")

    if doc_type:
        where.append("doc_type=%s")
        params.append(doc_type)

    if q:
        where.append("(file_name ILIKE %s OR COALESCE(reference,'') ILIKE %s OR COALESCE(notes,'') ILIKE %s)")
        qq = f"%{q}%"
        params.extend([qq, qq, qq])

    sql = _q(schema, f"""
      SELECT *
      FROM {{schema}}.asset_documents
      WHERE {" AND ".join(where)}
      ORDER BY uploaded_at DESC, id DESC
      LIMIT %s OFFSET %s
    """)

    params.extend([limit, offset])
    cur.execute(sql, params)
    return cur.fetchall()

def get_asset_document(cur, company_id: int, asset_id: int, doc_id: int):
    schema = company_schema(company_id)
    cur.execute(
        _q(schema, "SELECT * FROM {schema}.asset_documents WHERE company_id=%s AND asset_id=%s AND id=%s"),
        [company_id, asset_id, doc_id],
    )
    return cur.fetchone()

def _has_col(cur, schema: str, table: str, col: str) -> bool:
    cur.execute("""
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema=%s AND table_name=%s AND column_name=%s
      LIMIT 1
    """, (schema, table, col))
    return cur.fetchone() is not None

def create_asset_document(cur, company_id: int, asset_id: int, payload: dict):
    schema = company_schema(company_id)

    doc_type = (payload.get("doc_type") or "other").strip().lower()
    file_name = (payload.get("file_name") or "").strip()
    if not file_name:
        raise Exception("file_name is required")

    mime_type = payload.get("mime_type")
    size_bytes = payload.get("file_size_bytes")
    file_url = payload.get("file_url")
    storage_key = payload.get("storage_key")
    file_path = payload.get("file_path")
    reference = payload.get("reference")
    notes = payload.get("notes")
    uploaded_by = payload.get("uploaded_by")

    cur.execute(
        _q(schema, """
        INSERT INTO {schema}.asset_documents(
          company_id, asset_id, doc_type, file_name, mime_type, file_size_bytes,
          file_url, storage_key, file_path, reference, notes, uploaded_by
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
        """),
        [company_id, asset_id, doc_type, file_name, mime_type, size_bytes,
         file_url, storage_key, file_path, reference, notes, uploaded_by],
    )
    return int(cur.fetchone()["id"])


def delete_asset_document(cur, company_id: int, asset_id: int, doc_id: int):
    schema = company_schema(company_id)
    cur.execute(
        _q(schema, "DELETE FROM {schema}.asset_documents WHERE company_id=%s AND asset_id=%s AND id=%s"),
        [company_id, asset_id, doc_id],
    )

    return True

def get_asset_verification(cur, company_id: int, asset_id: int, ver_id: int):
    schema = company_schema(company_id)
    cur.execute(
        _q(schema, "SELECT * FROM {schema}.asset_verifications WHERE company_id=%s AND asset_id=%s AND id=%s"),
        [company_id, asset_id, ver_id],
    )
    return cur.fetchone()


def create_asset_verification(cur, company_id: int, asset_id: int, payload: dict):
    schema = company_schema(company_id)

    vdate = payload.get("verification_date")
    if not vdate:
        raise Exception("verification_date is required")

    status = (payload.get("status") or "found").strip().lower()
    location = payload.get("location")
    custodian = payload.get("custodian")
    notes = payload.get("notes")
    verified_by = payload.get("verified_by")

    cur.execute(
        _q(schema, """
        INSERT INTO {schema}.asset_verifications(
          company_id, asset_id, verification_date, status, location, custodian, notes, verified_by
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
        """),
        [company_id, asset_id, vdate, status, location, custodian, notes, verified_by],
    )
    return int(cur.fetchone()["id"])

def void_asset_verification(cur, company_id: int, asset_id: int, ver_id: int):
    schema = company_schema(company_id)
    cur.execute(
        _q(schema, """
        UPDATE {schema}.asset_verifications
        SET status='void'
        WHERE company_id=%s AND asset_id=%s AND id=%s
        """),
        [company_id, asset_id, ver_id],
    )
    return True


def archive_asset_document(cur, company_id: int, asset_id: int, doc_id: int, actor_user_id: int):
    schema = company_schema(company_id)
    cur.execute(
        _q(schema, """
        UPDATE {schema}.asset_documents
        SET is_archived=TRUE, archived_at=NOW(), archived_by=%s
        WHERE company_id=%s AND asset_id=%s AND id=%s
        """),
        [actor_user_id, company_id, asset_id, doc_id],
    )
    return True

def unarchive_asset_document(cur, company_id: int, asset_id: int, doc_id: int, actor_user_id: int):
    schema = company_schema(company_id)
    cur.execute(
        _q(schema, """
        UPDATE {schema}.asset_documents
        SET is_archived=FALSE, archived_at=NULL, archived_by=NULL
        WHERE company_id=%s AND asset_id=%s AND id=%s
        """),
        [company_id, asset_id, doc_id],
    )
    return True


def list_asset_verifications(
    cur,
    company_id: int,
    asset_id: int,
    *,
    status=None,
    include_archived: bool = False,
    limit=100,
    offset=0
):
    schema = company_schema(company_id)

    where = ["company_id=%s", "asset_id=%s"]
    params = [company_id, asset_id]

    has_arch = _has_col(cur, schema, "asset_verifications", "is_archived")

    if not include_archived and has_arch:
        where.append("is_archived=FALSE")

    if status:
        where.append("status=%s")
        params.append(status)

    sql = _q(schema, f"""
      SELECT *
      FROM {{schema}}.asset_verifications
      WHERE {" AND ".join(where)}
      ORDER BY verification_date DESC, id DESC
      LIMIT %s OFFSET %s
    """)

    params.extend([limit, offset])
    cur.execute(sql, params)
    return cur.fetchall()

def archive_asset_verification(cur, company_id: int, asset_id: int, ver_id: int, actor_user_id: int):
    schema = company_schema(company_id)
    cur.execute(
        _q(schema, """
        UPDATE {schema}.asset_verifications
        SET is_archived=TRUE, archived_at=NOW(), archived_by=%s
        WHERE company_id=%s AND asset_id=%s AND id=%s
        """),
        [actor_user_id, company_id, asset_id, ver_id],
    )
    return True

def unarchive_asset_verification(cur, company_id: int, asset_id: int, ver_id: int, actor_user_id: int):
    schema = company_schema(company_id)
    cur.execute(
        _q(schema, """
        UPDATE {schema}.asset_verifications
        SET is_archived=FALSE, archived_at=NULL, archived_by=NULL
        WHERE company_id=%s AND asset_id=%s AND id=%s
        """),
        [company_id, asset_id, ver_id],
    )
    return True

def update_asset_document(cur, company_id: int, asset_id: int, doc_id: int, payload: dict):
    """
    Updates editable fields on an asset document.
    - Only updates fields provided in payload.
    - Keeps tenant safety using {schema}.
    """
    schema = company_schema(company_id)

    # Editable fields (add/remove if your table differs)
    editable = {
        "doc_type",
        "file_name",
        "mime_type",
        "file_size_bytes",
        "file_url",
        "storage_key",
        "file_path",
        "reference",
        "notes",
        "uploaded_by",
    }

    sets = []
    params = []

    for k in editable:
        if k in payload:
            sets.append(f"{k}=%s")
            v = payload.get(k)

            # normalize a couple common ones
            if k == "doc_type" and v is not None:
                v = str(v).strip().lower()
            if k == "file_name" and v is not None:
                v = str(v).strip()

            params.append(v)

    if not sets:
        # nothing to update
        return get_asset_document(cur, company_id, asset_id, doc_id)

    sql = _q(schema, f"""
      UPDATE {{schema}}.asset_documents
      SET {", ".join(sets)}
      WHERE company_id=%s AND asset_id=%s AND id=%s
      RETURNING *
    """)

    params.extend([company_id, asset_id, doc_id])
    cur.execute(sql, params)
    return cur.fetchone()


def update_asset_verification(cur, company_id: int, asset_id: int, ver_id: int, payload: dict):
    """
    Updates editable fields on an asset verification.
    - Only updates fields provided in payload.
    - Keeps tenant safety using {schema}.
    """
    schema = company_schema(company_id)

    editable = {
        "verification_date",
        "status",
        "location",
        "custodian",
        "notes",
        "verified_by",
    }

    sets = []
    params = []

    for k in editable:
        if k in payload:
            sets.append(f"{k}=%s")
            v = payload.get(k)

            # normalize status
            if k == "status" and v is not None:
                v = str(v).strip().lower()

            params.append(v)

    if not sets:
        return get_asset_verification(cur, company_id, asset_id, ver_id)

    sql = _q(schema, f"""
      UPDATE {{schema}}.asset_verifications
      SET {", ".join(sets)}
      WHERE company_id=%s AND asset_id=%s AND id=%s
      RETURNING *
    """)

    params.extend([company_id, asset_id, ver_id])
    cur.execute(sql, params)
    return cur.fetchone()
