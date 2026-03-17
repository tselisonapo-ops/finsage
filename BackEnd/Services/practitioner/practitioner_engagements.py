from flask import current_app
from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth, make_response, _corsify
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from flask import Blueprint, request, jsonify, make_response

engagements_bp = Blueprint("engagements", __name__)


def _json_ok(data=None, status=200):
    body = {"ok": True}
    if isinstance(data, dict):
        body.update(data)
    elif data is not None:
        body["data"] = data
    return _corsify(make_response(jsonify(body), status))


def _json_err(message, status=400, **extra):
    body = {"ok": False, "error": message}
    if extra:
        body.update(extra)
    return _corsify(make_response(jsonify(body), status))


def _get_reporting_service():
    # replace this with however you access your reporting/service layer
    svc = getattr(current_app, "reporting_service", None)
    if svc is None:
        svc = getattr(current_app, "reporting", None)
    if svc is None:
        raise RuntimeError("Reporting service not configured")
    return svc


def _user_role_from_payload(payload: dict) -> str:
    return str(
        payload.get("role")
        or payload.get("user_role")
        or payload.get("role_name")
        or ""
    ).strip().lower()


def _can_manage_engagements(payload: dict) -> bool:
    role = _user_role_from_payload(payload)
    return role in {
        "owner",
        "admin",
        "audit_manager",
        "client_service_manager",
        "audit_partner",
        "engagement_partner",
    }


def _can_close_engagements(payload: dict) -> bool:
    role = _user_role_from_payload(payload)
    return role in {
        "owner",
        "admin",
        "audit_partner",
        "engagement_partner",
    }


def _parse_int(value, default=None):
    if value in (None, "", "null"):
        return default
    try:
        return int(value)
    except Exception:
        return default


def _parse_bool(value, default=None):
    if value in (None, ""):
        return default
    if isinstance(value, bool):
        return value
    s = str(value).strip().lower()
    if s in {"1", "true", "yes", "y", "on"}:
        return True
    if s in {"0", "false", "no", "n", "off"}:
        return False
    return default


@engagements_bp.route("/api/companies/<int:cid>/engagements", methods=["POST", "OPTIONS"])
@require_auth
def create_engagement_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)

        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to create engagements.", 403)

        body = request.get_json(silent=True) or {}

        customer_id = _parse_int(body.get("customer_id"))
        target_company_id = _parse_int(body.get("target_company_id"))
        engagement_name = (body.get("engagement_name") or "").strip()
        engagement_type = (body.get("engagement_type") or "").strip().lower()

        if not customer_id:
            return _json_err("customer_id is required.", 400)
        if not engagement_name:
            return _json_err("engagement_name is required.", 400)
        if not engagement_type:
            return _json_err("engagement_type is required.", 400)

        requires_target_company = engagement_type in {"bookkeeping", "compilation", "audit", "tax"}
        if requires_target_company and not target_company_id:
            return _json_err("target_company_id is required for this engagement type.", 400)

        with db_service._conn_cursor() as (conn, cur):
            engagement_id = db_service.create_engagement(
                cur,
                company_id,
                customer_id=customer_id,
                target_company_id=target_company_id,
                engagement_name=engagement_name,
                engagement_type=engagement_type,
                engagement_code=(body.get("engagement_code") or "").strip() or None,
                status=(body.get("status") or "draft").strip().lower(),
                governance_mode=(body.get("governance_mode") or "").strip().lower() or None,
                reporting_cycle=(body.get("reporting_cycle") or "").strip().lower() or None,
                due_date=body.get("due_date"),
                start_date=body.get("start_date"),
                end_date=body.get("end_date"),
                manager_user_id=_parse_int(body.get("manager_user_id")),
                partner_user_id=_parse_int(body.get("partner_user_id")),
                description=(body.get("description") or "").strip() or None,
                scope_summary=(body.get("scope_summary") or "").strip() or None,
                fiscal_year_end=body.get("fiscal_year_end"),
                priority=(body.get("priority") or "normal").strip().lower(),
                workflow_stage=(body.get("workflow_stage") or "planning").strip().lower(),
                created_by_user_id=_parse_int(payload.get("id")),
            )

            row = db_service.get_engagement(cur, company_id, engagement_id=engagement_id)

        return _json_ok({"row": row}, 201)

    except Exception as e:
        current_app.logger.exception("create_engagement_route failed")
        return _json_err(str(e), 500)

@engagements_bp.route("/api/companies/<int:cid>/engagements", methods=["GET", "OPTIONS"])
@require_auth
def list_engagements_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)

        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        status = (request.args.get("status") or "").strip()
        engagement_type = (request.args.get("engagement_type") or "").strip()
        customer_id = _parse_int(request.args.get("customer_id"))
        q = (request.args.get("q") or "").strip()
        limit = _parse_int(request.args.get("limit"), 100)
        offset = _parse_int(request.args.get("offset"), 0)

        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_engagements(
                cur,
                company_id,
                status=status,
                engagement_type=engagement_type,
                customer_id=customer_id,
                q=q,
                limit=limit,
                offset=offset,
            )

        return _json_ok({"rows": rows})

    except Exception as e:
        current_app.logger.exception("list_engagements_route failed")
        return _json_err(str(e), 500)


@engagements_bp.route("/api/companies/<int:cid>/engagements/<int:engagement_id>", methods=["GET", "OPTIONS"])
@require_auth
def get_engagement_route(cid: int, engagement_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)

        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_engagement(cur, company_id, engagement_id=engagement_id)
            if not row:
                return _json_err("Engagement not found.", 404)

            team = db_service.list_engagement_team(cur, company_id, engagement_id=engagement_id, active_only=False)

        return _json_ok({"row": row, "team": team})

    except Exception as e:
        current_app.logger.exception("get_engagement_route failed")
        return _json_err(str(e), 500)


@engagements_bp.route("/api/companies/<int:cid>/engagements/<int:engagement_id>", methods=["PATCH", "OPTIONS"])
@require_auth
def update_engagement_route(cid: int, engagement_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)

        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to update engagements.", 403)

        body = request.get_json(silent=True) or {}

        with db_service._conn_cursor() as (conn, cur):
            out_id = db_service.update_engagement(
                cur,
                company_id,
                engagement_id=engagement_id,
                updated_by_user_id=_parse_int(payload.get("id")),
                engagement_code=body.get("engagement_code"),
                engagement_name=body.get("engagement_name"),
                engagement_type=body.get("engagement_type"),
                status=body.get("status"),
                governance_mode=body.get("governance_mode"),
                reporting_cycle=body.get("reporting_cycle"),
                due_date=body.get("due_date"),
                start_date=body.get("start_date"),
                end_date=body.get("end_date"),
                manager_user_id=_parse_int(body.get("manager_user_id")),
                partner_user_id=_parse_int(body.get("partner_user_id")),
                description=body.get("description"),
                scope_summary=body.get("scope_summary"),
                fiscal_year_end=body.get("fiscal_year_end"),
                priority=body.get("priority"),
                workflow_stage=body.get("workflow_stage"),
                is_active=_parse_bool(body.get("is_active")),
            )

            if not out_id:
                return _json_err("Engagement not found.", 404)

            if "manager_user_id" in body or "partner_user_id" in body:
                db_service.assign_manager_and_partner(
                    cur,
                    company_id,
                    engagement_id=engagement_id,
                    manager_user_id=_parse_int(body.get("manager_user_id")),
                    partner_user_id=_parse_int(body.get("partner_user_id")),
                    updated_by_user_id=_parse_int(payload.get("id")),
                )

            row = db_service.get_engagement(cur, company_id, engagement_id=engagement_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("update_engagement_route failed")
        return _json_err(str(e), 500)


@engagements_bp.route("/api/companies/<int:cid>/engagements/<int:engagement_id>/status", methods=["POST", "OPTIONS"])
@require_auth
def set_engagement_status_route(cid: int, engagement_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)

        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        body = request.get_json(silent=True) or {}
        status = (body.get("status") or "").strip().lower()
        if not status:
            return _json_err("status is required.", 400)

        closing_statuses = {"completed", "archived", "cancelled"}
        if status in closing_statuses and not _can_close_engagements(payload):
            return _json_err("You do not have permission to set this status.", 403)

        if status not in closing_statuses and not _can_manage_engagements(payload):
            return _json_err("You do not have permission to update engagement status.", 403)

        with db_service._conn_cursor() as (conn, cur):
            out_id = db_service.set_engagement_status(
                cur,
                company_id,
                engagement_id=engagement_id,
                status=status,
                updated_by_user_id=_parse_int(payload.get("id")),
            )
            if not out_id:
                return _json_err("Engagement not found.", 404)

            row = db_service.get_engagement(cur, company_id, engagement_id=engagement_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("set_engagement_status_route failed")
        return _json_err(str(e), 500)


@engagements_bp.route("/api/companies/<int:cid>/engagements/<int:engagement_id>/team", methods=["POST", "OPTIONS"])
@require_auth
def add_engagement_team_member_route(cid: int, engagement_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)

        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to manage engagement team.", 403)

        body = request.get_json(silent=True) or {}

        user_id = _parse_int(body.get("user_id"))
        role_on_engagement = (body.get("role_on_engagement") or "").strip().lower()

        if not user_id:
            return _json_err("user_id is required.", 400)
        if not role_on_engagement:
            return _json_err("role_on_engagement is required.", 400)

        with db_service._conn_cursor() as (conn, cur):
            parent = db_service.get_engagement(cur, company_id, engagement_id=engagement_id)
            if not parent:
                return _json_err("Engagement not found.", 404)

            team_id = db_service.add_engagement_team_member(
                cur,
                company_id,
                engagement_id=engagement_id,
                user_id=user_id,
                role_on_engagement=role_on_engagement,
                allocation_percent=body.get("allocation_percent"),
                start_date=body.get("start_date"),
                end_date=body.get("end_date"),
                notes=body.get("notes"),
            )

            team = db_service.list_engagement_team(cur, company_id, engagement_id=engagement_id, active_only=False)

        return _json_ok({"id": team_id, "rows": team}, 201)

    except Exception as e:
        current_app.logger.exception("add_engagement_team_member_route failed")
        return _json_err(str(e), 500)


@engagements_bp.route("/api/companies/<int:cid>/engagements/<int:engagement_id>/team", methods=["GET", "OPTIONS"])
@require_auth
def list_engagement_team_route(cid: int, engagement_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)

        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        active_only = _parse_bool(request.args.get("active_only"), True)

        with db_service._conn_cursor() as (conn, cur):
            parent = db_service.get_engagement(cur, company_id, engagement_id=engagement_id)
            if not parent:
                return _json_err("Engagement not found.", 404)

            rows = db_service.list_engagement_team(
                cur,
                company_id,
                engagement_id=engagement_id,
                active_only=active_only,
            )

        return _json_ok({"rows": rows})

    except Exception as e:
        current_app.logger.exception("list_engagement_team_route failed")
        return _json_err(str(e), 500)


@engagements_bp.route("/api/companies/<int:cid>/engagements/team/<int:engagement_team_id>/deactivate", methods=["POST", "OPTIONS"])
@require_auth
def deactivate_engagement_team_member_route(cid: int, engagement_team_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)

        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to manage engagement team.", 403)

        svc = _get_reporting_service()

        with db_service._conn_cursor() as (conn, cur):
            out_id = db_service.deactivate_engagement_team_member(
                cur,
                company_id,
                engagement_team_id=engagement_team_id,
            )
            if not out_id:
                return _json_err("Engagement team record not found.", 404)

        return _json_ok({"id": out_id})

    except Exception as e:
        current_app.logger.exception("deactivate_engagement_team_member_route failed")
        return _json_err(str(e), 500)