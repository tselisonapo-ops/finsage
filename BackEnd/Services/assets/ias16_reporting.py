# ppe_reporting_blueprint.py

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from BackEnd.Services.period_core import resolve_company_period
from flask import Blueprint, jsonify, request, current_app
from BackEnd.Services.auth_middleware import require_auth
# adjust these imports to your project
# from your_project.services.db_service import db_service
# from your_project.db import get_db_connection

ppe_reporting_bp = Blueprint(
    "ppe_reporting",
    __name__,
    url_prefix="/api/companies/<int:company_id>/ppe",
)


def _parse_date(value: str | None, field_name: str) -> date:
    if not value:
        raise ValueError(f"{field_name} is required (YYYY-MM-DD)")
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except Exception as exc:
        raise ValueError(f"Invalid {field_name}: {value}") from exc


def _parse_optional_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in ("1", "true", "yes", "y", "on")


def _parse_asset_classes(args) -> list[str] | None:
    # supports:
    # ?asset_class=Buildings&asset_class=Vehicles
    # or ?asset_classes=Buildings,Vehicles
    vals = args.getlist("asset_class")
    csv_val = args.get("asset_classes")
    if csv_val:
        vals.extend([x.strip() for x in csv_val.split(",") if x.strip()])
    vals = [v for v in vals if v]
    return vals or None


def _ok(data: Any, status: int = 200):
    return jsonify({"ok": True, "data": data}), status


def _err(message: str, status: int = 400, **extra):
    payload = {"ok": False, "message": message}
    if extra:
        payload.update(extra)
    return jsonify(payload), status


def _get_services():
    """
    Replace this with however your app exposes services.
    """
    db_service = current_app.config["DB_SERVICE"]
    get_db_connection = current_app.config["GET_DB_CONNECTION"]
    get_trial_balance_fn = current_app.config.get("GET_TRIAL_BALANCE_FN")
    return db_service, get_db_connection, get_trial_balance_fn


@ppe_reporting_bp.post("/reporting/refresh")
@require_auth
def refresh_reporting_views(company_id: int):
    db_service, get_db_connection, _ = _get_services()
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        db_service.ensure_ppe_reporting_views(cur, company_id)
        conn.commit()
        return _ok({"message": "PPE reporting views refreshed"})
    except Exception as exc:
        if conn:
            conn.rollback()
        return _err("Failed to refresh PPE reporting views", 500, error=str(exc))
    finally:
        if conn:
            conn.close()


@ppe_reporting_bp.get("/disclosure")
@require_auth
def get_disclosure(company_id: int):
    db_service, get_db_connection, _ = _get_services()
    conn = None
    try:
        start_date = _parse_date(request.args.get("start_date"), "start_date")
        end_date = _parse_date(request.args.get("end_date"), "end_date")
        asset_classes = _parse_asset_classes(request.args)

        conn = get_db_connection()
        cur = conn.cursor()

        data = db_service.get_ppe_disclosure_by_class(
            cur,
            company_id,
            start_date,
            end_date,
            asset_classes=asset_classes,
        )
        return _ok(data)
    except ValueError as exc:
        return _err(str(exc), 400)
    except Exception as exc:
        return _err("Failed to load PPE disclosure", 500, error=str(exc))
    finally:
        if conn:
            conn.close()


@ppe_reporting_bp.get("/note-payload")
@require_auth
def get_note_payload(company_id: int):
    db_service, get_db_connection, _ = _get_services()
    conn = None
    try:
        start_raw = request.args.get("start_date")
        end_raw = request.args.get("end_date")
        preset = request.args.get("preset")
        asset_classes = _parse_asset_classes(request.args)

        if start_raw and end_raw:
            start_date = _parse_date(start_raw, "start_date")
            end_date = _parse_date(end_raw, "end_date")
            period_meta = {
                "preset": None,
                "label": f"{start_date.isoformat()} → {end_date.isoformat()}",
                "period": {
                    "from": start_date.isoformat(),
                    "to": end_date.isoformat(),
                },
            }
        elif preset:
            start_date, end_date, period_meta = resolve_company_period(
                db_service,
                company_id,
                request,
                mode="range",
            )
        else:
            raise ValueError("Provide start_date/end_date or preset")

        conn = get_db_connection()
        cur = conn.cursor()

        data = db_service.get_ppe_note_payload(
            cur,
            company_id,
            start_date,
            end_date,
            asset_classes=asset_classes,
        )

        # optional: return period meta so frontend can show the resolved range
        if isinstance(data, dict):
            data["period_meta"] = period_meta

        return _ok(data)

    except ValueError as exc:
        return _err(str(exc), 400)
    except Exception as exc:
        return _err("Failed to load PPE note payload", 500, error=str(exc))
    finally:
        if conn:
            conn.close()

@ppe_reporting_bp.get("/note-table")
@require_auth
def get_note_table(company_id: int):
    db_service, get_db_connection, _ = _get_services()
    conn = None
    try:
        start_date = _parse_date(request.args.get("start_date"), "start_date")
        end_date = _parse_date(request.args.get("end_date"), "end_date")
        asset_classes = _parse_asset_classes(request.args)

        conn = get_db_connection()
        cur = conn.cursor()

        data = db_service.get_ppe_note_table(
            cur,
            company_id,
            start_date,
            end_date,
            asset_classes=asset_classes,
        )
        return _ok(data)
    except ValueError as exc:
        return _err(str(exc), 400)
    except Exception as exc:
        return _err("Failed to load PPE note table", 500, error=str(exc))
    finally:
        if conn:
            conn.close()


@ppe_reporting_bp.get("/note-sections")
@require_auth
def get_note_sections(company_id: int):
    db_service, get_db_connection, _ = _get_services()
    conn = None
    try:
        start_date = _parse_date(request.args.get("start_date"), "start_date")
        end_date = _parse_date(request.args.get("end_date"), "end_date")
        asset_classes = _parse_asset_classes(request.args)

        conn = get_db_connection()
        cur = conn.cursor()

        data = db_service.get_ppe_note_sections(
            cur,
            company_id,
            start_date,
            end_date,
            asset_classes=asset_classes,
        )
        return _ok(data)
    except ValueError as exc:
        return _err(str(exc), 400)
    except Exception as exc:
        return _err("Failed to load PPE note sections", 500, error=str(exc))
    finally:
        if conn:
            conn.close()


@ppe_reporting_bp.get("/note-summary")
@require_auth
def get_note_summary(company_id: int):
    db_service, get_db_connection, _ = _get_services()
    conn = None
    try:
        start_date = _parse_date(request.args.get("start_date"), "start_date")
        end_date = _parse_date(request.args.get("end_date"), "end_date")
        asset_classes = _parse_asset_classes(request.args)

        conn = get_db_connection()
        cur = conn.cursor()

        data = db_service.get_ppe_note_summary(
            cur,
            company_id,
            start_date,
            end_date,
            asset_classes=asset_classes,
        )
        return _ok(data)
    except ValueError as exc:
        return _err(str(exc), 400)
    except Exception as exc:
        return _err("Failed to load PPE note summary", 500, error=str(exc))
    finally:
        if conn:
            conn.close()


@ppe_reporting_bp.get("/revaluation-note")
@require_auth
def get_revaluation_note(company_id: int):
    db_service, get_db_connection, _ = _get_services()
    conn = None
    try:
        start_date = _parse_date(request.args.get("start_date"), "start_date")
        end_date = _parse_date(request.args.get("end_date"), "end_date")
        asset_class = request.args.get("asset_class")

        conn = get_db_connection()
        cur = conn.cursor()

        data = db_service.get_ppe_revaluation_note(
            cur,
            company_id,
            start_date,
            end_date,
            asset_class=asset_class,
        )
        return _ok(data)
    except ValueError as exc:
        return _err(str(exc), 400)
    except Exception as exc:
        return _err("Failed to load PPE revaluation note", 500, error=str(exc))
    finally:
        if conn:
            conn.close()


@ppe_reporting_bp.get("/asset/<int:asset_id>/rollforward")
@require_auth
def get_asset_rollforward(company_id: int, asset_id: int):
    db_service, get_db_connection, _ = _get_services()
    conn = None
    try:
        start_date = _parse_date(request.args.get("start_date"), "start_date")
        end_date = _parse_date(request.args.get("end_date"), "end_date")
        include_opening_history = _parse_optional_bool(
            request.args.get("include_opening_history"),
            default=True,
        )

        conn = get_db_connection()
        cur = conn.cursor()

        data = db_service.get_ppe_asset_rollforward(
            cur,
            company_id,
            asset_id,
            start_date,
            end_date,
            include_opening_history=include_opening_history,
        )
        return _ok(data)
    except ValueError as exc:
        return _err(str(exc), 400)
    except Exception as exc:
        return _err("Failed to load asset rollforward", 500, error=str(exc))
    finally:
        if conn:
            conn.close()


@ppe_reporting_bp.get("/mapping-gaps")
@require_auth
def get_mapping_gaps(company_id: int):
    db_service, get_db_connection, _ = _get_services()
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        data = db_service.get_ppe_mapping_gaps(cur, company_id)
        return _ok(data)
    except Exception as exc:
        return _err("Failed to load PPE mapping gaps", 500, error=str(exc))
    finally:
        if conn:
            conn.close()


@ppe_reporting_bp.get("/orphan-codes")
@require_auth
def get_orphan_codes(company_id: int):
    db_service, get_db_connection, get_trial_balance_fn = _get_services()
    conn = None
    try:
        if get_trial_balance_fn is None:
            return _err("GET_TRIAL_BALANCE_FN is not configured", 500)

        as_of = _parse_date(request.args.get("as_of"), "as_of")

        conn = get_db_connection()
        cur = conn.cursor()

        data = db_service.get_ppe_orphan_mapped_codes(
            cur,
            company_id,
            as_of,
            get_trial_balance_fn=get_trial_balance_fn,
        )
        return _ok(data)
    except ValueError as exc:
        return _err(str(exc), 400)
    except Exception as exc:
        return _err("Failed to load orphan mapped codes", 500, error=str(exc))
    finally:
        if conn:
            conn.close()


@ppe_reporting_bp.get("/integrity-audit")
@require_auth
def get_integrity_audit(company_id: int):
    db_service, get_db_connection, get_trial_balance_fn = _get_services()
    conn = None
    try:
        as_of = _parse_date(request.args.get("as_of"), "as_of")
        start_raw = request.args.get("start_date")
        start_date = _parse_date(start_raw, "start_date") if start_raw else None

        conn = get_db_connection()
        cur = conn.cursor()

        data = db_service.audit_ppe_note_integrity(
            cur,
            company_id,
            as_of,
            start_date=start_date,
            get_trial_balance_fn=get_trial_balance_fn,
        )
        return _ok(data)
    except ValueError as exc:
        return _err(str(exc), 400)
    except Exception as exc:
        return _err("Failed to run PPE integrity audit", 500, error=str(exc))
    finally:
        if conn:
            conn.close()


@ppe_reporting_bp.get("/event-split-gaps")
@require_auth
def get_event_split_gaps(company_id: int):
    db_service, get_db_connection, _ = _get_services()
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        data = db_service.get_ppe_event_split_gaps(cur, company_id)
        return _ok(data)
    except Exception as exc:
        return _err("Failed to load PPE event split gaps", 500, error=str(exc))
    finally:
        if conn:
            conn.close()


@ppe_reporting_bp.post("/backfill-event-splits")
@require_auth
def backfill_event_splits(company_id: int):
    db_service, get_db_connection, _ = _get_services()
    conn = None
    try:
        payload = request.get_json(silent=True) or {}
        dry_run = bool(payload.get("dry_run", True))
        only_missing = bool(payload.get("only_missing", True))

        conn = get_db_connection()
        cur = conn.cursor()

        data = db_service.backfill_ppe_event_splits(
            cur,
            company_id,
            only_missing=only_missing,
            dry_run=dry_run,
        )

        if not dry_run:
            conn.commit()
        else:
            conn.rollback()

        return _ok(data)
    except Exception as exc:
        if conn:
            conn.rollback()
        return _err("Failed to backfill PPE event splits", 500, error=str(exc))
    finally:
        if conn:
            conn.close()