from flask import Blueprint, current_app, make_response, request
from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth, _corsify
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.practitioner.practitioner_engagements import _json_err, _json_ok
from BackEnd.Services.practitioner.action_center import _can_action_workflow, _action_center_audit

approval_center_bp = Blueprint("approval_center", __name__)


def _ac_bool(v, default=False):
    if v is None:
        return default
    return str(v).strip().lower() in ("1", "true", "yes", "y", "on")


def _ac_int(v):
    if v in (None, "", "null", "undefined"):
        return None
    return int(v)


@approval_center_bp.route(
    "/api/companies/<int:cid>/approval-center/summary",
    methods=["GET", "OPTIONS"],
)
@require_auth
def approval_center_summary_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        q = (request.args.get("q") or "").strip()
        queue_type = (request.args.get("queue_type") or "").strip().lower()
        status = (request.args.get("status") or "").strip().lower()
        ready_only = _ac_bool(request.args.get("ready_only"), False)
        blockers_only = _ac_bool(request.args.get("blockers_only"), False)
        active_only = _ac_bool(request.args.get("active_only"), True)

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_approval_center_summary(
                cur,
                company_id,
                q=q,
                queue_type=queue_type,
                status=status,
                ready_only=ready_only,
                blockers_only=blockers_only,
                active_only=active_only,
            )

        return _json_ok(row or {})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("approval_center_summary_route failed")
        return _json_err(str(e), 500)


@approval_center_bp.route(
    "/api/companies/<int:cid>/approval-center/list",
    methods=["GET", "OPTIONS"],
)
@require_auth
def approval_center_list_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        q = (request.args.get("q") or "").strip()
        queue_type = (request.args.get("queue_type") or "").strip().lower()
        status = (request.args.get("status") or "").strip().lower()
        ready_only = _ac_bool(request.args.get("ready_only"), False)
        blockers_only = _ac_bool(request.args.get("blockers_only"), False)
        active_only = _ac_bool(request.args.get("active_only"), True)
        limit = _ac_int(request.args.get("limit")) or 100
        offset = _ac_int(request.args.get("offset")) or 0

        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_approval_center_items(
                cur,
                company_id,
                q=q,
                queue_type=queue_type,
                status=status,
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
        current_app.logger.exception("approval_center_list_route failed")
        return _json_err(str(e), 500)


@approval_center_bp.route(
    "/api/companies/<int:cid>/approval-center/<queue_type>/<int:source_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def approval_center_detail_route(cid: int, queue_type: str, source_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_approval_center_item_detail(
                cur,
                company_id,
                queue_type=(queue_type or "").strip().lower(),
                source_id=source_id,
            )

        if not row:
            return _json_err("Approval center item not found.", 404)

        return _json_ok(row)

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("approval_center_detail_route failed")
        return _json_err(str(e), 500)


@approval_center_bp.route(
    "/api/companies/<int:cid>/approval-center/<queue_type>/<int:source_id>/action",
    methods=["POST", "OPTIONS"],
)
@require_auth
def approval_center_action_route(cid: int, queue_type: str, source_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        if not _can_action_workflow(payload):
            return _json_err("You do not have permission to perform this action.", 403)

        body = request.get_json(silent=True) or {}
        action = (body.get("action") or "").strip().lower()
        comment = (body.get("comment") or "").strip()
        due_date = body.get("due_date")

        if action not in ("approve", "return", "escalate", "release"):
            return _json_err("Unsupported action.", 400)

        user_id = _ac_int(payload.get("id"))
        if not user_id:
            return _json_err("Invalid user context.", 401)

        with db_service._conn_cursor() as (conn, cur):
            before_row = db_service.get_approval_center_item_detail(
                cur,
                company_id,
                queue_type=(queue_type or "").strip().lower(),
                source_id=source_id,
            )
            if not before_row:
                return _json_err("Approval item not found.", 404)

            updated = db_service.apply_approval_center_action(
                cur,
                company_id,
                queue_type=(queue_type or "").strip().lower(),
                source_id=source_id,
                action=action,
                actor_user_id=user_id,
                comment=comment,
                due_date=due_date,
            )
            if not updated:
                return _json_err("Approval item not found.", 404)

            after_row = db_service.get_approval_center_item_detail(
                cur,
                company_id,
                queue_type=(queue_type or "").strip().lower(),
                source_id=source_id,
            )

            _action_center_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action=f"approval_center_{action}",
                entity_id=f"{queue_type}:{source_id}",
                entity_ref=f"{queue_type}:{source_id}",
                before_json=before_row,
                after_json=after_row,
                message=f"Applied action '{action}' to approval item {queue_type}:{source_id}",
            )

        return _json_ok({
            "updated": True,
            "queue_type": queue_type,
            "source_id": source_id,
            "action": action,
            "row": after_row,
        })

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("approval_center_action_route failed")
        return _json_err(str(e), 500)