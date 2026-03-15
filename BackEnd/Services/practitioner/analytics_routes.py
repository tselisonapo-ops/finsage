# BackEnd/Services/analytics_routes.py
from flask import Blueprint
from flask import Blueprint, current_app, make_response, request
from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth, _corsify
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.practitioner.practitioner_engagements import _json_err, _json_ok

analytics_bp = Blueprint("analytics_bp", __name__)


def _parse_int(value):
    try:
        return int(value) if value not in (None, "", "null") else None
    except Exception:
        return None


def _can_view_analytics(payload: dict) -> bool:
    perms = payload.get("permissions") or {}
    role = (payload.get("role") or "").strip().lower()

    return (
        role in {"owner", "partner", "manager", "admin", "super_admin"}
        or perms.get("can_access_practitioner_dashboard")
        or perms.get("can_manage_engagements")
        or perms.get("can_access_enterprise_dashboard")
    )

@analytics_bp.route("/api/companies/<int:cid>/analytics/overview", methods=["GET", "OPTIONS"])
@require_auth
def get_analytics_overview_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_view_analytics(payload):
            return _json_err("You do not have permission to view analytics.", 403)

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_analytics_overview(cur, company_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("get_analytics_overview_route failed")
        return _json_err(str(e), 500)
    
@analytics_bp.route("/api/companies/<int:cid>/analytics/engagement-profitability", methods=["GET", "OPTIONS"])
@require_auth
def get_engagement_profitability_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_view_analytics(payload):
            return _json_err("You do not have permission to view engagement profitability analytics.", 403)

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_engagement_profitability_summary(cur, company_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("get_engagement_profitability_route failed")
        return _json_err(str(e), 500)
    
@analytics_bp.route("/api/companies/<int:cid>/analytics/engagement-profitability/rows", methods=["GET", "OPTIONS"])
@require_auth
def list_engagement_profitability_rows_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_view_analytics(payload):
            return _json_err("You do not have permission to view engagement profitability rows.", 403)

        status = (request.args.get("status") or "").strip().lower() or None
        engagement_type = (request.args.get("engagement_type") or "").strip().lower() or None
        priority = (request.args.get("priority") or "").strip().lower() or None
        manager_user_id = _parse_int(request.args.get("manager_user_id"))

        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_engagement_profitability_rows(
                cur,
                company_id,
                status=status,
                engagement_type=engagement_type,
                manager_user_id=manager_user_id,
                priority=priority,
            )

        return _json_ok({"rows": rows})

    except Exception as e:
        current_app.logger.exception("list_engagement_profitability_rows_route failed")
        return _json_err(str(e), 500)

@analytics_bp.route("/api/companies/<int:cid>/analytics/client-service-trends", methods=["GET", "OPTIONS"])
@require_auth
def get_client_service_trends_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_view_analytics(payload):
            return _json_err("You do not have permission to view client service trends.", 403)

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_client_service_trends_summary(cur, company_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("get_client_service_trends_route failed")
        return _json_err(str(e), 500)
    
@analytics_bp.route("/api/companies/<int:cid>/analytics/client-service-trends/rows", methods=["GET", "OPTIONS"])
@require_auth
def list_client_service_trends_rows_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_view_analytics(payload):
            return _json_err("You do not have permission to view client service trend rows.", 403)

        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_client_service_trends_rows(cur, company_id)

        return _json_ok({"rows": rows})

    except Exception as e:
        current_app.logger.exception("list_client_service_trends_rows_route failed")
        return _json_err(str(e), 500)
    
@analytics_bp.route("/api/companies/<int:cid>/analytics/risk-alerts", methods=["GET", "OPTIONS"])
@require_auth
def get_risk_alerts_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_view_analytics(payload):
            return _json_err("You do not have permission to view risk alerts.", 403)

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_risk_alerts_summary(cur, company_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("get_risk_alerts_route failed")
        return _json_err(str(e), 500)
    
@analytics_bp.route("/api/companies/<int:cid>/analytics/risk-alerts/rows", methods=["GET", "OPTIONS"])
@require_auth
def list_risk_alert_rows_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_view_analytics(payload):
            return _json_err("You do not have permission to view risk alert rows.", 403)

        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_risk_alert_rows(cur, company_id)

        return _json_ok({"rows": rows})

    except Exception as e:
        current_app.logger.exception("list_risk_alert_rows_route failed")
        return _json_err(str(e), 500)
    
