from flask import Blueprint, current_app, make_response, request
from BackEnd.Services.auth_middleware import require_auth, _corsify
from BackEnd.Services.db_service import db_service
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.practitioner.practitioner_engagements import _json_err,_json_ok

resource_planning_bp = Blueprint("resource_planning", __name__)


def _parse_bool(v, default=False):
    if v is None:
        return default
    return str(v).strip().lower() in ("1", "true", "yes", "y", "on")


def _parse_int(v):
    if v in (None, "", "null", "undefined"):
        return None
    return int(v)


@resource_planning_bp.route(
    "/api/companies/<int:cid>/resource-planning",
    methods=["GET", "OPTIONS"],
)
@require_auth
def resource_planning_dashboard_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        q = (request.args.get("q") or "").strip()
        role_on_engagement = (request.args.get("role_on_engagement") or "").strip().lower()
        active_only = _parse_bool(request.args.get("active_only"), True)
        horizon_days = _parse_int(request.args.get("horizon_days")) or 60
        limit = _parse_int(request.args.get("limit")) or 100
        offset = _parse_int(request.args.get("offset")) or 0

        with db_service._conn_cursor() as (conn, cur):
            summary = db_service.get_resource_planning_summary(
                cur,
                company_id,
                q=q,
                role_on_engagement=role_on_engagement,
                active_only=active_only,
                horizon_days=horizon_days,
            )
            peaks = db_service.list_resource_planning_peaks(
                cur,
                company_id,
                q=q,
                role_on_engagement=role_on_engagement,
                active_only=active_only,
                horizon_days=horizon_days,
                limit=limit,
                offset=offset,
            )
            coverage_gaps = db_service.list_resource_planning_coverage_gaps(
                cur,
                company_id,
                q=q,
                active_only=active_only,
                horizon_days=horizon_days,
                limit=limit,
                offset=offset,
            )
            reallocation = db_service.list_resource_planning_reallocation_opportunities(
                cur,
                company_id,
                q=q,
                role_on_engagement=role_on_engagement,
                active_only=active_only,
                horizon_days=horizon_days,
                limit=limit,
                offset=offset,
            )
            schedule = db_service.list_resource_planning_schedule(
                cur,
                company_id,
                q=q,
                role_on_engagement=role_on_engagement,
                active_only=active_only,
                horizon_days=horizon_days,
                limit=limit,
                offset=offset,
            )

        return _json_ok({
            "summary": summary or {},
            "peaks": peaks or [],
            "coverage_gaps": coverage_gaps or [],
            "reallocation_opportunities": reallocation or [],
            "schedule": schedule or [],
        })

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("resource_planning_dashboard_route failed")
        return _json_err(str(e), 500)


@resource_planning_bp.route(
    "/api/companies/<int:cid>/resource-planning/summary",
    methods=["GET", "OPTIONS"],
)
@require_auth
def resource_planning_summary_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        q = (request.args.get("q") or "").strip()
        role_on_engagement = (request.args.get("role_on_engagement") or "").strip().lower()
        active_only = _parse_bool(request.args.get("active_only"), True)
        horizon_days = _parse_int(request.args.get("horizon_days")) or 60

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_resource_planning_summary(
                cur,
                company_id,
                q=q,
                role_on_engagement=role_on_engagement,
                active_only=active_only,
                horizon_days=horizon_days,
            )

        return _json_ok(row or {})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("resource_planning_summary_route failed")
        return _json_err(str(e), 500)


@resource_planning_bp.route(
    "/api/companies/<int:cid>/resource-planning/peaks",
    methods=["GET", "OPTIONS"],
)
@require_auth
def resource_planning_peaks_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        q = (request.args.get("q") or "").strip()
        role_on_engagement = (request.args.get("role_on_engagement") or "").strip().lower()
        active_only = _parse_bool(request.args.get("active_only"), True)
        horizon_days = _parse_int(request.args.get("horizon_days")) or 60
        limit = _parse_int(request.args.get("limit")) or 100
        offset = _parse_int(request.args.get("offset")) or 0

        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_resource_planning_peaks(
                cur,
                company_id,
                q=q,
                role_on_engagement=role_on_engagement,
                active_only=active_only,
                horizon_days=horizon_days,
                limit=limit,
                offset=offset,
            )

        return _json_ok(rows or [])

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("resource_planning_peaks_route failed")
        return _json_err(str(e), 500)


@resource_planning_bp.route(
    "/api/companies/<int:cid>/resource-planning/coverage-gaps",
    methods=["GET", "OPTIONS"],
)
@require_auth
def resource_planning_coverage_gaps_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        q = (request.args.get("q") or "").strip()
        active_only = _parse_bool(request.args.get("active_only"), True)
        horizon_days = _parse_int(request.args.get("horizon_days")) or 60
        limit = _parse_int(request.args.get("limit")) or 100
        offset = _parse_int(request.args.get("offset")) or 0

        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_resource_planning_coverage_gaps(
                cur,
                company_id,
                q=q,
                active_only=active_only,
                horizon_days=horizon_days,
                limit=limit,
                offset=offset,
            )

        return _json_ok(rows or [])

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("resource_planning_coverage_gaps_route failed")
        return _json_err(str(e), 500)


@resource_planning_bp.route(
    "/api/companies/<int:cid>/resource-planning/reallocation-opportunities",
    methods=["GET", "OPTIONS"],
)
@require_auth
def resource_planning_reallocation_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        q = (request.args.get("q") or "").strip()
        role_on_engagement = (request.args.get("role_on_engagement") or "").strip().lower()
        active_only = _parse_bool(request.args.get("active_only"), True)
        horizon_days = _parse_int(request.args.get("horizon_days")) or 60
        limit = _parse_int(request.args.get("limit")) or 100
        offset = _parse_int(request.args.get("offset")) or 0

        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_resource_planning_reallocation_opportunities(
                cur,
                company_id,
                q=q,
                role_on_engagement=role_on_engagement,
                active_only=active_only,
                horizon_days=horizon_days,
                limit=limit,
                offset=offset,
            )

        return _json_ok(rows or [])

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("resource_planning_reallocation_route failed")
        return _json_err(str(e), 500)


@resource_planning_bp.route(
    "/api/companies/<int:cid>/resource-planning/schedule",
    methods=["GET", "OPTIONS"],
)
@require_auth
def resource_planning_schedule_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        q = (request.args.get("q") or "").strip()
        role_on_engagement = (request.args.get("role_on_engagement") or "").strip().lower()
        active_only = _parse_bool(request.args.get("active_only"), True)
        horizon_days = _parse_int(request.args.get("horizon_days")) or 60
        only_overloaded = _parse_bool(request.args.get("only_overloaded"), False)
        only_available = _parse_bool(request.args.get("only_available"), False)
        limit = _parse_int(request.args.get("limit")) or 100
        offset = _parse_int(request.args.get("offset")) or 0

        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_resource_planning_schedule(
                cur,
                company_id,
                q=q,
                role_on_engagement=role_on_engagement,
                active_only=active_only,
                horizon_days=horizon_days,
                only_overloaded=only_overloaded,
                only_available=only_available,
                limit=limit,
                offset=offset,
            )

        return _json_ok(rows or [])

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("resource_planning_schedule_route failed")
        return _json_err(str(e), 500)