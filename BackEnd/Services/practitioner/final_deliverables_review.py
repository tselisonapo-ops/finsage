from flask import Blueprint, current_app, make_response, request
from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth,_corsify
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.practitioner.practitioner_engagements import _json_ok, _json_err


final_deliverables_review_bp = Blueprint("final_deliverables_review", __name__)


def _fd_bool(v, default=False):
    if v is None:
        return default
    return str(v).strip().lower() in ("1", "true", "yes", "y", "on")


def _fd_int(v):
    if v in (None, "", "null", "undefined"):
        return None
    return int(v)


@final_deliverables_review_bp.route(
    "/api/companies/<int:cid>/final-deliverables-review/summary",
    methods=["GET", "OPTIONS"],
)
@require_auth
def final_deliverables_review_summary_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        q = (request.args.get("q") or "").strip()
        status = (request.args.get("status") or "").strip().lower()
        risk_band = (request.args.get("risk_band") or "").strip().lower()
        active_only = _fd_bool(request.args.get("active_only"), True)

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_final_deliverables_review_summary(
                cur,
                company_id,
                q=q,
                status=status,
                risk_band=risk_band,
                active_only=active_only,
            )

        return _json_ok(row or {})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("final_deliverables_review_summary_route failed")
        return _json_err(str(e), 500)


@final_deliverables_review_bp.route(
    "/api/companies/<int:cid>/final-deliverables-review/list",
    methods=["GET", "OPTIONS"],
)
@require_auth
def final_deliverables_review_list_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        q = (request.args.get("q") or "").strip()
        status = (request.args.get("status") or "").strip().lower()
        risk_band = (request.args.get("risk_band") or "").strip().lower()
        ready_only = _fd_bool(request.args.get("ready_only"), False)
        blockers_only = _fd_bool(request.args.get("blockers_only"), False)
        active_only = _fd_bool(request.args.get("active_only"), True)
        limit = _fd_int(request.args.get("limit")) or 100
        offset = _fd_int(request.args.get("offset")) or 0

        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_final_deliverables_review(
                cur,
                company_id,
                q=q,
                status=status,
                risk_band=risk_band,
                ready_only=ready_only,
                blockers_only=blockers_only,
                active_only=active_only,
                limit=limit,
                offset=offset,
            )

        return _json_ok(rows or [])

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("final_deliverables_review_list_route failed")
        return _json_err(str(e), 500)


@final_deliverables_review_bp.route(
    "/api/companies/<int:cid>/final-deliverables-review/<int:engagement_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def final_deliverables_review_detail_route(cid: int, engagement_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(
            payload,
            company_id,
            db_service=db_service,
            engagement_id=engagement_id,
        )
        if deny:
            return deny

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_final_deliverables_review_detail(
                cur,
                company_id,
                engagement_id=engagement_id,
            )

        if not row:
            return _json_err("Final deliverables review item not found.", 404)

        return _json_ok(row)

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("final_deliverables_review_detail_route failed")
        return _json_err(str(e), 500)