from flask import Blueprint
from flask import Blueprint, current_app, make_response, request, jsonify
from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth, _corsify
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.practitioner.practitioner_engagements import _json_err, _json_ok
from BackEnd.Services.assets.ppe_reporting import _audit_safe


action_center_bp = Blueprint("action_center", __name__)

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


def _user_role_from_payload(payload: dict) -> str:
    return str(
        payload.get("role")
        or payload.get("user_role")
        or payload.get("role_name")
        or ""
    ).strip().lower()


def _can_access_action_center(payload: dict) -> bool:
    role = _user_role_from_payload(payload)
    return role in {
        "owner",
        "admin",
        "audit_manager",
        "client_service_manager",
        "audit_partner",
        "engagement_partner",
        "manager",
        "partner",
        "reviewer",
        "preparer",
    }


def _can_action_workflow(payload: dict) -> bool:
    role = _user_role_from_payload(payload)
    return role in {
        "owner",
        "admin",
        "audit_manager",
        "client_service_manager",
        "audit_partner",
        "engagement_partner",
        "manager",
        "partner",
        "reviewer",
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


def _validate_queue_type(queue_type: str | None):
    allowed = {
        "reporting_item",
        "deliverable",
        "posting_activity",
        "monthly_close",
        "year_end",
        "signoff",
    }
    if not queue_type:
        return None
    if queue_type not in allowed:
        return f"Unsupported queue_type '{queue_type}'."
    return None

def _action_center_audit(
    *,
    cur,
    company_id: int,
    payload: dict,
    action: str,
    entity_id,
    entity_ref: str | None = None,
    before_json: dict | None = None,
    after_json: dict | None = None,
    message: str | None = None,
):
    _audit_safe(
        company_id=company_id,
        payload=payload,
        module="action_center",
        action=action,
        entity_type="action_center_item",
        entity_id=str(entity_id),
        entity_ref=entity_ref,
        before_json=before_json,
        after_json=after_json,
        message=message,
        cur=cur,
    )

def _action_center_item_ref(row: dict | None, queue_type: str, source_id: int) -> str:
    row = row or {}
    return (
        row.get("item_name")
        or row.get("deliverable_name")
        or row.get("task_name")
        or row.get("step_name")
        or row.get("description")
        or row.get("reference_no")
        or f"{queue_type}:{source_id}"
    )
  
def _dispatch_action(cur, company_id: int, queue_type: str, source_id: int, action: str, user_id: int):
    queue_type = (queue_type or "").strip().lower()
    action = (action or "").strip().lower()

    if queue_type == "reporting_item":
        status_map = {
            "start": "in_progress",
            "review": "in_review",
            "approve": "approved",
            "complete": "completed",
            "return": "returned",
            "block": "blocked",
        }
        status = status_map.get(action)
        if not status:
            raise ValueError("Unsupported action for reporting_item.")
        return db_service.set_engagement_reporting_item_status(
            cur,
            company_id,
            reporting_item_id=source_id,
            status=status,
            updated_by_user_id=user_id,
        )

    if queue_type == "deliverable":
        status_map = {
            "request": "requested",
            "receive": "received",
            "review": "in_review",
            "complete": "completed",
        }
        status = status_map.get(action)
        if not status:
            raise ValueError("Unsupported action for deliverable.")
        return db_service.set_engagement_deliverable_status(
            cur,
            company_id,
            deliverable_id=source_id,
            status=status,
            updated_by_user_id=user_id,
        )

    if queue_type == "posting_activity":
        status_map = {
            "review": "in_review",
            "approve": "approved",
            "post": "posted",
            "return": "returned",
            "reject": "rejected",
        }
        status = status_map.get(action)
        if not status:
            raise ValueError("Unsupported action for posting_activity.")
        return db_service.set_engagement_posting_activity_status(
            cur,
            company_id,
            posting_activity_id=source_id,
            status=status,
            updated_by_user_id=user_id,
        )

    if queue_type == "monthly_close":
        status_map = {
            "start": "in_progress",
            "review": "in_review",
            "complete": "completed",
            "block": "blocked",
            "skip": "skipped",
        }
        status = status_map.get(action)
        if not status:
            raise ValueError("Unsupported action for monthly_close.")
        return db_service.set_engagement_monthly_close_task_status(
            cur,
            company_id,
            monthly_close_task_id=source_id,
            status=status,
            updated_by_user_id=user_id,
        )

    if queue_type == "year_end":
        status_map = {
            "start": "in_progress",
            "review": "in_review",
            "complete": "completed",
            "block": "blocked",
            "waive": "waived",
        }
        status = status_map.get(action)
        if not status:
            raise ValueError("Unsupported action for year_end.")
        return db_service.set_engagement_year_end_task_status(
            cur,
            company_id,
            year_end_task_id=source_id,
            status=status,
            updated_by_user_id=user_id,
        )

    if queue_type == "signoff":
        status_map = {
            "start": "in_progress",
            "complete": "completed",
            "block": "blocked",
            "waive": "waived",
        }
        status = status_map.get(action)
        if not status:
            raise ValueError("Unsupported action for signoff.")
        return db_service.set_engagement_signoff_step_status(
            cur,
            company_id,
            signoff_step_id=source_id,
            status=status,
            updated_by_user_id=user_id,
        )

    raise ValueError("Unsupported queue_type.")
    

@action_center_bp.route("/api/companies/<int:cid>/action-center/summary", methods=["GET", "OPTIONS"])
@require_auth
def get_action_center_summary_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)

        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_access_action_center(payload):
            return _json_err("You do not have permission to access Action Center.", 403)

        customer_id = _parse_int(request.args.get("customer_id"))
        engagement_id = _parse_int(request.args.get("engagement_id"))
        mine_only = _parse_bool(request.args.get("mine"), False)

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_action_center_summary(
                cur,
                company_id,
                customer_id=customer_id,
                engagement_id=engagement_id,
                current_user_id=_parse_int(payload.get("id")),
                mine_only=mine_only,
            )

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("get_action_center_summary_route failed")
        return _json_err(str(e), 500)
    

@action_center_bp.route("/api/companies/<int:cid>/action-center/queue", methods=["GET", "OPTIONS"])
@require_auth
def list_action_center_queue_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)

        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_access_action_center(payload):
            return _json_err("You do not have permission to access Action Center.", 403)

        customer_id = _parse_int(request.args.get("customer_id"))
        engagement_id = _parse_int(request.args.get("engagement_id"))
        queue_type = (request.args.get("queue_type") or "").strip().lower() or None
        status = (request.args.get("status") or "").strip().lower() or None
        priority = (request.args.get("priority") or "").strip().lower() or None
        q = (request.args.get("q") or "").strip() or None
        mine_only = _parse_bool(request.args.get("mine"), False)
        limit = _parse_int(request.args.get("limit"), 100)
        offset = _parse_int(request.args.get("offset"), 0)

        err = _validate_queue_type(queue_type)
        if err:
            return _json_err(err, 400)

        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_action_center_queue(
                cur,
                company_id,
                customer_id=customer_id,
                engagement_id=engagement_id,
                queue_type=queue_type,
                status=status,
                priority=priority,
                mine_only=mine_only,
                current_user_id=_parse_int(payload.get("id")),
                q=q,
                limit=limit,
                offset=offset,
            )

        return _json_ok({"rows": rows})

    except Exception as e:
        current_app.logger.exception("list_action_center_queue_route failed")
        return _json_err(str(e), 500)
    
@action_center_bp.route("/api/companies/<int:cid>/action-center/items/<queue_type>/<int:source_id>/action", methods=["POST", "OPTIONS"])
@require_auth
def action_center_item_action_route(cid: int, queue_type: str, source_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)

        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_action_workflow(payload):
            return _json_err("You do not have permission to perform this action.", 403)

        queue_type = (queue_type or "").strip().lower()
        err = _validate_queue_type(queue_type)
        if err:
            return _json_err(err, 400)

        body = request.get_json(silent=True) or {}
        action = (body.get("action") or "").strip().lower()
        if not action:
            return _json_err("action is required.", 400)

        user_id = _parse_int(payload.get("id"))
        if not user_id:
            return _json_err("Invalid user context.", 401)

        with db_service._conn_cursor() as (conn, cur):
            before_row = db_service.get_review_queue_item_detail(
                cur,
                company_id,
                queue_type=queue_type,
                source_id=source_id,
            )
            if not before_row:
                return _json_err("Action target not found.", 404)

            out_id = _dispatch_action(
                cur,
                company_id=company_id,
                queue_type=queue_type,
                source_id=source_id,
                action=action,
                user_id=user_id,
            )

            if not out_id:
                return _json_err("Action target not found.", 404)

            after_row = db_service.get_review_queue_item_detail(
                cur,
                company_id,
                queue_type=queue_type,
                source_id=source_id,
            ) or {
                **before_row,
                "last_action": action,
            }

            _action_center_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action=f"action_center_{action}",
                entity_id=f"{queue_type}:{source_id}",
                entity_ref=_action_center_item_ref(after_row, queue_type, source_id),
                before_json=before_row,
                after_json=after_row,
                message=f"Applied action '{action}' to {queue_type}:{source_id}",
            )

        return _json_ok({
            "queue_type": queue_type,
            "source_id": source_id,
            "action": action,
            "updated": True,
            "row": after_row,
        })

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("action_center_item_action_route failed")
        return _json_err(str(e), 500)