from flask import Blueprint, request, current_app, make_response, jsonify
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.practitioner.practitioner_engagements import _corsify, _json_ok, _json_err
from BackEnd.Services.db_service import db_service
from BackEnd.Services.assets.ppe_reporting import _audit_safe

review_queue_bp = Blueprint("review_queue", __name__)

REVIEW_QUEUE_TYPES = {
    "reporting_item",
    "deliverable",
    "posting_activity",
    "monthly_close",
    "year_end",
    "signoff",
}


def _parse_int(value, default=None):
    try:
        if value in (None, "", "null"):
            return default
        return int(value)
    except Exception:
        return default


def _parse_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def _deny_if_wrong_company(
    payload,
    company_id: int,
    *,
    db_service,
    engagement_id: int | None = None,
):
    role = (payload.get("role") or "").strip().lower()
    if role == "admin":
        return None

    user_id = payload.get("user_id") or payload.get("sub")
    try:
        user_id = int(user_id) if user_id is not None else None
    except Exception:
        user_id = None

    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    try:
        target_company_id = int(company_id)
    except Exception:
        return jsonify({"ok": False, "error": "AUTH|invalid_company_id"}), 400

    token_company_id = payload.get("token_company_id", payload.get("company_id"))
    try:
        token_company_id = int(token_company_id) if token_company_id is not None else None
    except Exception:
        token_company_id = None

    allowed_company_ids = (
        payload.get("token_allowed_company_ids")
        or payload.get("allowed_company_ids")
        or []
    )
    try:
        allowed_company_ids = [int(x) for x in allowed_company_ids]
    except Exception:
        allowed_company_ids = []

    # direct access
    if target_company_id == token_company_id:
        return None

    if target_company_id in allowed_company_ids:
        return None

    # delegated access through engagement workspaces
    candidate_home_company_ids = []
    if token_company_id is not None:
        candidate_home_company_ids.append(token_company_id)

    for cid in allowed_company_ids:
        if cid not in candidate_home_company_ids:
            candidate_home_company_ids.append(cid)

    for home_company_id in candidate_home_company_ids:
        try:
            with db_service._conn_cursor() as (_, cur):
                delegated_ok = db_service.user_has_delegated_company_access(
                    cur,
                    user_id=user_id,
                    company_id=home_company_id,
                    target_company_id=target_company_id,
                    engagement_id=engagement_id,
                )
            if delegated_ok:
                return None
        except Exception as e:
            print("DELEGATED ACCESS CHECK FAILED", {
                "user_id": user_id,
                "home_company_id": home_company_id,
                "target_company_id": target_company_id,
                "engagement_id": engagement_id,
                "error": str(e),
            })

    return jsonify({"ok": False, "error": "Access denied for this company"}), 403


def _can_manage_review_queue(payload: dict) -> bool:
    role = (payload.get("user_role") or payload.get("role") or "").strip().lower()
    access_level = (payload.get("access_level") or "").strip().lower()

    return role in {
        "admin",
        "manager",
        "partner",
        "reviewer",
        "supervisor",
    } or access_level in {
        "admin",
        "manager",
        "partner",
        "reviewer",
    }

def _review_queue_audit(
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
        module="review_queue",
        action=action,
        entity_type="review_queue_item",
        entity_id=str(entity_id),
        entity_ref=entity_ref,
        before_json=before_json,
        after_json=after_json,
        message=message,
        cur=cur,
    )

def _queue_item_ref(row: dict | None, queue_type: str, source_id: int) -> str:
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

def _validate_queue_type(queue_type: str):
    qt = (queue_type or "").strip().lower()
    if qt not in REVIEW_QUEUE_TYPES:
        return None
    return qt


@review_queue_bp.route("/api/companies/<int:cid>/review-queue/summary", methods=["GET", "OPTIONS"])
@require_auth
def review_queue_summary_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        engagement_id = _parse_int(request.args.get("engagement_id"))

        deny = _deny_if_wrong_company(
            payload,
            int(company_id),
            db_service=db_service,
            engagement_id=engagement_id,
        )
        if deny:
            return deny

        customer_id = _parse_int(request.args.get("customer_id"))
        current_user_id = _parse_int(payload.get("id"))

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_review_queue_summary(
                cur,
                company_id,
                customer_id=customer_id,
                engagement_id=engagement_id,
                current_user_id=current_user_id,
            )

        return _json_ok({"row": row or {}})

    except Exception as e:
        current_app.logger.exception("review_queue_summary_route failed")
        return _json_err(str(e), 500)


@review_queue_bp.route("/api/companies/<int:cid>/review-queue/items", methods=["GET", "OPTIONS"])
@require_auth
def review_queue_items_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        engagement_id = _parse_int(request.args.get("engagement_id"))

        deny = _deny_if_wrong_company(
            payload,
            int(company_id),
            db_service=db_service,
            engagement_id=engagement_id,
        )
        if deny:
            return deny

        queue_type = request.args.get("queue_type")
        if queue_type:
            queue_type = _validate_queue_type(queue_type)
            if not queue_type:
                return _json_err("Invalid queue_type.", 400)

        customer_id = _parse_int(request.args.get("customer_id"))
        engagement_id = _parse_int(request.args.get("engagement_id"))
        status = (request.args.get("status") or "").strip().lower() or None
        priority = (request.args.get("priority") or "").strip().lower() or None
        mine_only = _parse_bool(request.args.get("mine_only"), False)
        q = (request.args.get("q") or "").strip() or None
        limit = _parse_int(request.args.get("limit"), 100)
        offset = _parse_int(request.args.get("offset"), 0)
        current_user_id = _parse_int(payload.get("id"))

        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_review_queue_items(
                cur,
                company_id,
                customer_id=customer_id,
                engagement_id=engagement_id,
                queue_type=queue_type,
                status=status,
                priority=priority,
                mine_only=mine_only,
                current_user_id=current_user_id,
                q=q,
                limit=limit,
                offset=offset,
            )

        return _json_ok({"rows": rows or []})

    except Exception as e:
        current_app.logger.exception("review_queue_items_route failed")
        return _json_err(str(e), 500)


@review_queue_bp.route(
    "/api/companies/<int:cid>/review-queue/items/<string:queue_type>/<int:source_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def review_queue_item_detail_route(cid: int, queue_type: str, source_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        engagement_id = _parse_int(request.args.get("engagement_id"))

        deny = _deny_if_wrong_company(
            payload,
            int(company_id),
            db_service=db_service,
            engagement_id=engagement_id,
        )
        if deny:
            return deny

        queue_type = _validate_queue_type(queue_type)
        if not queue_type:
            return _json_err("Invalid queue_type.", 400)

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_review_queue_item_detail(
                cur,
                company_id,
                queue_type=queue_type,
                source_id=source_id,
            )

        if not row:
            return _json_err("Review queue item not found.", 404)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("review_queue_item_detail_route failed")
        return _json_err(str(e), 500)


@review_queue_bp.route(
    "/api/companies/<int:cid>/review-queue/items/<string:queue_type>/<int:source_id>/status",
    methods=["POST", "OPTIONS"],
)
@require_auth
def review_queue_item_status_route(cid: int, queue_type: str, source_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        engagement_id = _parse_int(request.args.get("engagement_id"))

        deny = _deny_if_wrong_company(
            payload,
            int(company_id),
            db_service=db_service,
            engagement_id=engagement_id,
        )
        if deny:
            return deny

        if not _can_manage_review_queue(payload):
            return _json_err("You do not have permission to update review queue items.", 403)

        queue_type = _validate_queue_type(queue_type)
        if not queue_type:
            return _json_err("Invalid queue_type.", 400)

        body = request.get_json(silent=True) or {}
        status = (body.get("status") or "").strip().lower()
        completed_at = body.get("completed_at")

        if not status:
            return _json_err("status is required.", 400)

        with db_service._conn_cursor() as (conn, cur):
            before_row = db_service.get_review_queue_item_detail(
                cur,
                company_id,
                queue_type=queue_type,
                source_id=source_id,
            )
            if not before_row:
                return _json_err("Review queue item not found.", 404)

            updated_id = db_service.set_review_queue_item_status(
                cur,
                company_id,
                queue_type=queue_type,
                source_id=source_id,
                status=status,
                updated_by_user_id=_parse_int(payload.get("id")),
                completed_at=completed_at,
            )
            if not updated_id:
                return _json_err("Review queue item not found.", 404)

            row = db_service.get_review_queue_item_detail(
                cur,
                company_id,
                queue_type=queue_type,
                source_id=source_id,
            ) or {
                **before_row,
                "status": status,
                "completed_at": completed_at,
            }

            _review_queue_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action="set_review_queue_item_status",
                entity_id=f"{queue_type}:{source_id}",
                entity_ref=_queue_item_ref(row, queue_type, source_id),
                before_json=before_row,
                after_json=row,
                message=f"Changed review queue item {queue_type}:{source_id} status to {status}",
            )

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("review_queue_item_status_route failed")
        return _json_err(str(e), 500)

@review_queue_bp.route(
    "/api/companies/<int:cid>/review-queue/items/<string:queue_type>/<int:source_id>/assign",
    methods=["POST", "OPTIONS"],
)
@require_auth
def review_queue_item_assign_route(cid: int, queue_type: str, source_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        engagement_id = _parse_int(request.args.get("engagement_id"))

        deny = _deny_if_wrong_company(
            payload,
            int(company_id),
            db_service=db_service,
            engagement_id=engagement_id,
        )
        if deny:
            return deny

        if not _can_manage_review_queue(payload):
            return _json_err("You do not have permission to assign review queue items.", 403)

        queue_type = _validate_queue_type(queue_type)
        if not queue_type:
            return _json_err("Invalid queue_type.", 400)

        body = request.get_json(silent=True) or {}

        with db_service._conn_cursor() as (conn, cur):
            before_row = db_service.get_review_queue_item_detail(
                cur,
                company_id,
                queue_type=queue_type,
                source_id=source_id,
            )
            if not before_row:
                return _json_err("Review queue item not found.", 404)

            updated_id = db_service.assign_review_queue_item(
                cur,
                company_id,
                queue_type=queue_type,
                source_id=source_id,
                assigned_user_id=_parse_int(body.get("assigned_user_id")),
                reviewer_user_id=_parse_int(body.get("reviewer_user_id")),
                updated_by_user_id=_parse_int(payload.get("id")),
            )
            if not updated_id:
                return _json_err("Review queue item not found.", 404)

            row = db_service.get_review_queue_item_detail(
                cur,
                company_id,
                queue_type=queue_type,
                source_id=source_id,
            ) or {
                **before_row,
                "assigned_user_id": _parse_int(body.get("assigned_user_id")),
                "reviewer_user_id": _parse_int(body.get("reviewer_user_id")),
            }

            _review_queue_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action="assign_review_queue_item",
                entity_id=f"{queue_type}:{source_id}",
                entity_ref=_queue_item_ref(row, queue_type, source_id),
                before_json=before_row,
                after_json=row,
                message=f"Assigned review queue item {queue_type}:{source_id}",
            )

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("review_queue_item_assign_route failed")
        return _json_err(str(e), 500)

@review_queue_bp.route(
    "/api/companies/<int:cid>/review-queue/items/<string:queue_type>/<int:source_id>/deactivate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def review_queue_item_deactivate_route(cid: int, queue_type: str, source_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        engagement_id = _parse_int(request.args.get("engagement_id"))

        deny = _deny_if_wrong_company(
            payload,
            int(company_id),
            db_service=db_service,
            engagement_id=engagement_id,
        )
        if deny:
            return deny

        if not _can_manage_review_queue(payload):
            return _json_err("You do not have permission to deactivate review queue items.", 403)

        queue_type = _validate_queue_type(queue_type)
        if not queue_type:
            return _json_err("Invalid queue_type.", 400)

        with db_service._conn_cursor() as (conn, cur):
            before_row = db_service.get_review_queue_item_detail(
                cur,
                company_id,
                queue_type=queue_type,
                source_id=source_id,
            )
            if not before_row:
                return _json_err("Review queue item not found.", 404)

            updated_id = db_service.deactivate_review_queue_item(
                cur,
                company_id,
                queue_type=queue_type,
                source_id=source_id,
                updated_by_user_id=_parse_int(payload.get("id")),
            )
            if not updated_id:
                return _json_err("Review queue item not found.", 404)

            row = db_service.get_review_queue_item_detail(
                cur,
                company_id,
                queue_type=queue_type,
                source_id=source_id,
            ) or {
                **before_row,
                "is_active": False,
            }

            _review_queue_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action="deactivate_review_queue_item",
                entity_id=f"{queue_type}:{source_id}",
                entity_ref=_queue_item_ref(row, queue_type, source_id),
                before_json=before_row,
                after_json=row,
                message=f"Deactivated review queue item {queue_type}:{source_id}",
            )

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("review_queue_item_deactivate_route failed")
        return _json_err(str(e), 500)