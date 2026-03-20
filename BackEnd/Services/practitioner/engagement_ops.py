
from flask import Blueprint, request, make_response, current_app
from BackEnd.Services.auth_middleware import require_auth, _corsify
from BackEnd.Services.db_service import db_service
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.practitioner.practitioner_engagements import _can_manage_engagements, _parse_int, _json_ok, _json_err
from BackEnd.Services.assets.ppe_reporting import _audit_safe

engagement_ops_bp = Blueprint("engagement_ops_bp", __name__)


# =========================================================
# small helpers
# =========================================================

def _parse_bool(value, default=None):
    if value is None:
        return default
    s = str(value).strip().lower()
    if s in ("1", "true", "yes", "y", "on"):
        return True
    if s in ("0", "false", "no", "n", "off"):
        return False
    return default


def _parse_limit(value, default=200, max_value=1000):
    try:
        n = int(value or default)
    except Exception:
        n = default
    return max(1, min(max_value, n))


def _parse_offset(value, default=0):
    try:
        n = int(value or default)
    except Exception:
        n = default
    return max(0, n)

def _eng_audit(
    *,
    cur,
    company_id: int,
    payload: dict,
    action: str,
    entity_type: str,
    entity_id,
    entity_ref: str | None = None,
    amount: float = 0.0,
    currency: str | None = None,
    before_json: dict | None = None,
    after_json: dict | None = None,
    message: str | None = None,
):
    _audit_safe(
        company_id=company_id,
        payload=payload,
        module="engagements",
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        entity_ref=entity_ref,
        amount=amount,
        currency=currency,
        before_json=before_json,
        after_json=after_json,
        message=message,
        cur=cur,
    )

# =========================================================
# REPORTING ITEMS
# =========================================================

@engagement_ops_bp.route("/api/companies/<int:cid>/engagements/<int:engagement_id>/reporting-items", methods=["GET", "POST", "OPTIONS"])
@require_auth
def engagement_reporting_items_collection_route(cid: int, engagement_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if request.method == "GET":
            with db_service._conn_cursor() as (conn, cur):
                rows = db_service.list_engagement_reporting_items(
                    cur,
                    company_id,
                    engagement_id=engagement_id,
                    item_type=(request.args.get("item_type") or "").strip().lower(),
                    status=(request.args.get("status") or "").strip().lower(),
                    owner_user_id=_parse_int(request.args.get("owner_user_id")),
                    reviewer_user_id=_parse_int(request.args.get("reviewer_user_id")),
                    q=(request.args.get("q") or "").strip(),
                    active_only=_parse_bool(request.args.get("active_only"), True),
                    limit=_parse_limit(request.args.get("limit"), 200),
                    offset=_parse_offset(request.args.get("offset"), 0),
                )
            return _json_ok({"rows": rows})

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to manage reporting items.", 403)

        body = request.get_json(silent=True) or {}
        item_type = (body.get("item_type") or "").strip().lower()
        item_name = (body.get("item_name") or "").strip()

        if not item_type:
            return _json_err("item_type is required.", 400)
        if not item_name:
            return _json_err("item_name is required.", 400)

        with db_service._conn_cursor() as (conn, cur):
            item_id = db_service.create_engagement_reporting_item(
                cur,
                company_id,
                engagement_id=engagement_id,
                item_type=item_type,
                item_name=item_name,
                item_code=(body.get("item_code") or "").strip() or None,
                description=(body.get("description") or "").strip() or None,
                owner_user_id=_parse_int(body.get("owner_user_id")),
                reviewer_user_id=_parse_int(body.get("reviewer_user_id")),
                due_date=body.get("due_date"),
                prepared_at=body.get("prepared_at"),
                reviewed_at=body.get("reviewed_at"),
                completed_at=body.get("completed_at"),
                status=(body.get("status") or "not_started").strip().lower(),
                priority=(body.get("priority") or "normal").strip().lower(),
                version_no=_parse_int(body.get("version_no")) or 1,
                sort_order=_parse_int(body.get("sort_order")) or 0,
                notes=(body.get("notes") or "").strip() or None,
                created_by_user_id=_parse_int(payload.get("id")),
            )
            row = db_service.get_engagement_reporting_item(
                cur,
                company_id,
                reporting_item_id=item_id,
            )

            _eng_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action="create_reporting_item",
                entity_type="engagement_reporting_item",
                entity_id=item_id,
                entity_ref=(row.get("item_name") or item_name or f"REPORTING-ITEM-{item_id}"),
                before_json={"request": body},
                after_json=row,
                message=f"Created reporting item {item_id}",
            )

        return _json_ok({"row": row}, 201)

    except Exception as e:
        current_app.logger.exception("engagement_reporting_items_collection_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-reporting-items/<int:item_id>", methods=["GET", "PATCH", "OPTIONS"])
@require_auth
def engagement_reporting_item_detail_route(cid: int, item_id: int):
    current_app.logger.warning(
        "HIT reporting-items route method=%s path=%s",
        request.method,
        request.path,
    )
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if request.method == "GET":
            with db_service._conn_cursor() as (conn, cur):
                row = db_service.get_engagement_reporting_item(
                    cur,
                    company_id,
                    reporting_item_id=item_id,
                )
            if not row:
                return _json_err("Reporting item not found.", 404)
            return _json_ok({"row": row})

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to update reporting items.", 403)

        body = request.get_json(silent=True) or {}
        with db_service._conn_cursor() as (conn, cur):
            before_row = db_service.get_engagement_reporting_item(
                cur,
                company_id,
                reporting_item_id=item_id,
            )
            if not before_row:
                return _json_err("Reporting item not found.", 404)

            updated_id = db_service.update_engagement_reporting_item(
                cur,
                company_id,
                reporting_item_id=item_id,
                updated_by_user_id=_parse_int(payload.get("id")),
                item_type=(body.get("item_type") or "").strip().lower() or None,
                item_code=(body.get("item_code") or "").strip() or None,
                item_name=(body.get("item_name") or "").strip() or None,
                description=(body.get("description") or "").strip() or None,
                owner_user_id=_parse_int(body.get("owner_user_id")),
                reviewer_user_id=_parse_int(body.get("reviewer_user_id")),
                due_date=body.get("due_date"),
                prepared_at=body.get("prepared_at"),
                reviewed_at=body.get("reviewed_at"),
                completed_at=body.get("completed_at"),
                status=(body.get("status") or "").strip().lower() or None,
                priority=(body.get("priority") or "").strip().lower() or None,
                version_no=_parse_int(body.get("version_no")),
                sort_order=_parse_int(body.get("sort_order")),
                notes=(body.get("notes") or "").strip() or None,
                is_active=_parse_bool(body.get("is_active"), None),
            )
            if not updated_id:
                return _json_err("Reporting item not found.", 404)

            row = db_service.get_engagement_reporting_item(
                cur,
                company_id,
                reporting_item_id=item_id,
            )

            _eng_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action="update_reporting_item",
                entity_type="engagement_reporting_item",
                entity_id=item_id,
                entity_ref=(row.get("item_name") or before_row.get("item_name") or f"REPORTING-ITEM-{item_id}"),
                before_json=before_row,
                after_json=row,
                message=f"Updated reporting item {item_id}",
            )

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("engagement_reporting_item_detail_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-reporting-items/<int:item_id>/status", methods=["POST", "OPTIONS"])
@require_auth
def set_engagement_reporting_item_status_route(cid: int, item_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to update reporting item status.", 403)

        body = request.get_json(silent=True) or {}
        status = (body.get("status") or "").strip().lower()
        if not status:
            return _json_err("status is required.", 400)

        with db_service._conn_cursor() as (conn, cur):
            before_row = db_service.get_engagement_reporting_item(cur, company_id, reporting_item_id=item_id)
            if not before_row:
                return _json_err("Reporting item not found.", 404)

            updated_id = db_service.set_engagement_reporting_item_status(
                cur,
                company_id,
                reporting_item_id=item_id,
                status=status,
                updated_by_user_id=_parse_int(payload.get("id")),
                completed_at=body.get("completed_at"),
            )
            if not updated_id:
                return _json_err("Reporting item not found.", 404)

            row = db_service.get_engagement_reporting_item(cur, company_id, reporting_item_id=item_id)

            _eng_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action="set_reporting_item_status",
                entity_type="engagement_reporting_item",
                entity_id=item_id,
                entity_ref=(row.get("item_name") or before_row.get("item_name") or f"REPORTING-ITEM-{item_id}"),
                before_json=before_row,
                after_json=row,
                message=f"Changed reporting item {item_id} status to {status}",
            )
        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("set_engagement_reporting_item_status_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-reporting-items/<int:item_id>/deactivate", methods=["POST", "OPTIONS"])
@require_auth
def deactivate_engagement_reporting_item_route(cid: int, item_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to deactivate reporting items.", 403)

        with db_service._conn_cursor() as (conn, cur):
            before_row = db_service.get_engagement_reporting_item(cur, company_id, reporting_item_id=item_id)
            if not before_row:
                return _json_err("Reporting item not found.", 404)

            updated_id = db_service.deactivate_engagement_reporting_item(
                cur,
                company_id,
                reporting_item_id=item_id,
                updated_by_user_id=_parse_int(payload.get("id")),
            )
            if not updated_id:
                return _json_err("Reporting item not found.", 404)

            row = db_service.get_engagement_reporting_item(cur, company_id, reporting_item_id=item_id)

            _eng_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action="deactivate_reporting_item",
                entity_type="engagement_reporting_item",
                entity_id=item_id,
                entity_ref=(row.get("item_name") or before_row.get("item_name") or f"REPORTING-ITEM-{item_id}"),
                before_json=before_row,
                after_json=row,
                message=f"Deactivated reporting item {item_id}",
            )
        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("deactivate_engagement_reporting_item_route failed")
        return _json_err(str(e), 500)


# =========================================================
# DELIVERABLES
# =========================================================

@engagement_ops_bp.route("/api/companies/<int:cid>/engagements/<int:engagement_id>/deliverables", methods=["GET", "POST", "OPTIONS"])
@require_auth
def engagement_deliverables_collection_route(cid: int, engagement_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if request.method == "GET":
            with db_service._conn_cursor() as (conn, cur):
                rows = db_service.list_engagement_deliverables(
                    cur,
                    company_id,
                    engagement_id=engagement_id,
                    status=(request.args.get("status") or "").strip().lower(),
                    priority=(request.args.get("priority") or "").strip().lower(),
                    assigned_user_id=_parse_int(request.args.get("assigned_user_id")),
                    reviewer_user_id=_parse_int(request.args.get("reviewer_user_id")),
                    deliverable_type=(request.args.get("deliverable_type") or "").strip().lower(),
                    q=(request.args.get("q") or "").strip(),
                    active_only=_parse_bool(request.args.get("active_only"), True),
                    limit=_parse_limit(request.args.get("limit"), 200),
                    offset=_parse_offset(request.args.get("offset"), 0),
                )
            return _json_ok({"rows": rows})

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to manage deliverables.", 403)

        body = request.get_json(silent=True) or {}
        deliverable_name = (body.get("deliverable_name") or "").strip()
        if not deliverable_name:
            return _json_err("deliverable_name is required.", 400)

        with db_service._conn_cursor() as (conn, cur):
            deliverable_id = db_service.create_engagement_deliverable(
                cur,
                company_id,
                engagement_id=engagement_id,
                deliverable_name=deliverable_name,
                deliverable_code=(body.get("deliverable_code") or "").strip() or None,
                deliverable_type=(body.get("deliverable_type") or "").strip().lower() or None,
                requested_from=(body.get("requested_from") or "").strip() or None,
                assigned_user_id=_parse_int(body.get("assigned_user_id")),
                reviewer_user_id=_parse_int(body.get("reviewer_user_id")),
                due_date=body.get("due_date"),
                received_date=body.get("received_date"),
                status=(body.get("status") or "not_started").strip().lower(),
                priority=(body.get("priority") or "normal").strip().lower(),
                notes=(body.get("notes") or "").strip() or None,
                document_count=_parse_int(body.get("document_count")) or 0,
                created_by_user_id=_parse_int(payload.get("id")),
            )
            row = db_service.get_engagement_deliverable(
                cur,
                company_id,
                deliverable_id=deliverable_id,
            )

        return _json_ok({"row": row}, 201)

    except Exception as e:
        current_app.logger.exception("engagement_deliverables_collection_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-deliverables/<int:deliverable_id>", methods=["GET", "PATCH", "OPTIONS"])
@require_auth
def engagement_deliverable_detail_route(cid: int, deliverable_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if request.method == "GET":
            with db_service._conn_cursor() as (conn, cur):
                row = db_service.get_engagement_deliverable(cur, company_id, deliverable_id=deliverable_id)
            if not row:
                return _json_err("Deliverable not found.", 404)
            return _json_ok({"row": row})

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to update deliverables.", 403)

        body = request.get_json(silent=True) or {}
        with db_service._conn_cursor() as (conn, cur):
            updated_id = db_service.update_engagement_deliverable(
                cur,
                company_id,
                deliverable_id=deliverable_id,
                updated_by_user_id=_parse_int(payload.get("id")),
                deliverable_code=(body.get("deliverable_code") or "").strip() or None,
                deliverable_name=(body.get("deliverable_name") or "").strip() or None,
                deliverable_type=(body.get("deliverable_type") or "").strip().lower() or None,
                requested_from=(body.get("requested_from") or "").strip() or None,
                assigned_user_id=_parse_int(body.get("assigned_user_id")),
                reviewer_user_id=_parse_int(body.get("reviewer_user_id")),
                due_date=body.get("due_date"),
                received_date=body.get("received_date"),
                status=(body.get("status") or "").strip().lower() or None,
                priority=(body.get("priority") or "").strip().lower() or None,
                notes=(body.get("notes") or "").strip() or None,
                document_count=_parse_int(body.get("document_count")),
                is_active=_parse_bool(body.get("is_active"), None),
            )
            if not updated_id:
                return _json_err("Deliverable not found.", 404)

            row = db_service.get_engagement_deliverable(cur, company_id, deliverable_id=deliverable_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("engagement_deliverable_detail_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-deliverables/<int:deliverable_id>/status", methods=["POST", "OPTIONS"])
@require_auth
def set_engagement_deliverable_status_route(cid: int, deliverable_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to update deliverable status.", 403)

        body = request.get_json(silent=True) or {}
        status = (body.get("status") or "").strip().lower()
        if not status:
            return _json_err("status is required.", 400)

        with db_service._conn_cursor() as (conn, cur):
            updated_id = db_service.set_engagement_deliverable_status(
                cur,
                company_id,
                deliverable_id=deliverable_id,
                status=status,
                updated_by_user_id=_parse_int(payload.get("id")),
                received_date=body.get("received_date"),
            )
            if not updated_id:
                return _json_err("Deliverable not found.", 404)

            row = db_service.get_engagement_deliverable(cur, company_id, deliverable_id=deliverable_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("set_engagement_deliverable_status_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-deliverables/<int:deliverable_id>/deactivate", methods=["POST", "OPTIONS"])
@require_auth
def deactivate_engagement_deliverable_route(cid: int, deliverable_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to deactivate deliverables.", 403)

        with db_service._conn_cursor() as (conn, cur):
            updated_id = db_service.deactivate_engagement_deliverable(
                cur,
                company_id,
                deliverable_id=deliverable_id,
                updated_by_user_id=_parse_int(payload.get("id")),
            )
            if not updated_id:
                return _json_err("Deliverable not found.", 404)

            row = db_service.get_engagement_deliverable(cur, company_id, deliverable_id=deliverable_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("deactivate_engagement_deliverable_route failed")
        return _json_err(str(e), 500)


# =========================================================
# POSTING ACTIVITY
# =========================================================

@engagement_ops_bp.route("/api/companies/<int:cid>/engagements/<int:engagement_id>/posting-activity", methods=["GET", "POST", "OPTIONS"])
@require_auth
def engagement_posting_activity_collection_route(cid: int, engagement_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if request.method == "GET":
            with db_service._conn_cursor() as (conn, cur):
                rows = db_service.list_engagement_posting_activity(
                    cur,
                    company_id,
                    engagement_id=engagement_id,
                    module_name=(request.args.get("module_name") or "").strip().lower(),
                    event_type=(request.args.get("event_type") or "").strip().lower(),
                    status=(request.args.get("status") or "").strip().lower(),
                    prepared_by_user_id=_parse_int(request.args.get("prepared_by_user_id")),
                    reviewer_user_id=_parse_int(request.args.get("reviewer_user_id")),
                    date_from=request.args.get("date_from"),
                    date_to=request.args.get("date_to"),
                    q=(request.args.get("q") or "").strip(),
                    active_only=_parse_bool(request.args.get("active_only"), True),
                    limit=_parse_limit(request.args.get("limit"), 200),
                    offset=_parse_offset(request.args.get("offset"), 0),
                )
            return _json_ok({"rows": rows})

        # allow manual creation only if you want it
        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to manage posting activity.", 403)

        body = request.get_json(silent=True) or {}
        module_name = (body.get("module_name") or "").strip().lower()
        event_type = (body.get("event_type") or "").strip().lower()
        description = (body.get("description") or "").strip()

        if not module_name:
            return _json_err("module_name is required.", 400)
        if not event_type:
            return _json_err("event_type is required.", 400)
        if not description:
            return _json_err("description is required.", 400)

        with db_service._conn_cursor() as (conn, cur):
            row_id = db_service.create_engagement_posting_activity(
                cur,
                company_id,
                engagement_id=engagement_id,
                posting_date=body.get("posting_date"),
                module_name=module_name,
                event_type=event_type,
                description=description,
                reference_no=(body.get("reference_no") or "").strip() or None,
                prepared_by_user_id=_parse_int(body.get("prepared_by_user_id")),
                reviewer_user_id=_parse_int(body.get("reviewer_user_id")),
                status=(body.get("status") or "draft").strip().lower(),
                amount=body.get("amount"),
                currency_code=(body.get("currency_code") or "ZAR").strip().upper(),
                source_table=(body.get("source_table") or "").strip() or None,
                source_id=_parse_int(body.get("source_id")),
                notes=(body.get("notes") or "").strip() or None,
                created_by_user_id=_parse_int(payload.get("id")),
            )
            row = db_service.get_engagement_posting_activity(
                cur,
                company_id,
                posting_activity_id=row_id,
            )

        return _json_ok({"row": row}, 201)

    except Exception as e:
        current_app.logger.exception("engagement_posting_activity_collection_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-posting-activity/<int:posting_activity_id>", methods=["GET", "PATCH", "OPTIONS"])
@require_auth
def engagement_posting_activity_detail_route(cid: int, posting_activity_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if request.method == "GET":
            with db_service._conn_cursor() as (conn, cur):
                row = db_service.get_engagement_posting_activity(
                    cur,
                    company_id,
                    posting_activity_id=posting_activity_id,
                )
            if not row:
                return _json_err("Posting activity not found.", 404)
            return _json_ok({"row": row})

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to update posting activity.", 403)

        body = request.get_json(silent=True) or {}
        with db_service._conn_cursor() as (conn, cur):
            updated_id = db_service.update_engagement_posting_activity(
                cur,
                company_id,
                posting_activity_id=posting_activity_id,
                updated_by_user_id=_parse_int(payload.get("id")),
                posting_date=body.get("posting_date"),
                module_name=(body.get("module_name") or "").strip().lower() or None,
                event_type=(body.get("event_type") or "").strip().lower() or None,
                reference_no=(body.get("reference_no") or "").strip() or None,
                description=(body.get("description") or "").strip() or None,
                prepared_by_user_id=_parse_int(body.get("prepared_by_user_id")),
                reviewer_user_id=_parse_int(body.get("reviewer_user_id")),
                status=(body.get("status") or "").strip().lower() or None,
                amount=body.get("amount"),
                currency_code=(body.get("currency_code") or "").strip().upper() or None,
                source_table=(body.get("source_table") or "").strip() or None,
                source_id=_parse_int(body.get("source_id")),
                notes=(body.get("notes") or "").strip() or None,
                is_active=_parse_bool(body.get("is_active"), None),
            )
            if not updated_id:
                return _json_err("Posting activity not found.", 404)

            row = db_service.get_engagement_posting_activity(cur, company_id, posting_activity_id=posting_activity_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("engagement_posting_activity_detail_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-posting-activity/<int:posting_activity_id>/status", methods=["POST", "OPTIONS"])
@require_auth
def set_engagement_posting_activity_status_route(cid: int, posting_activity_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to update posting activity status.", 403)

        body = request.get_json(silent=True) or {}
        status = (body.get("status") or "").strip().lower()
        if not status:
            return _json_err("status is required.", 400)

        with db_service._conn_cursor() as (conn, cur):
            updated_id = db_service.set_engagement_posting_activity_status(
                cur,
                company_id,
                posting_activity_id=posting_activity_id,
                status=status,
                updated_by_user_id=_parse_int(payload.get("id")),
                reviewer_user_id=_parse_int(body.get("reviewer_user_id")),
            )
            if not updated_id:
                return _json_err("Posting activity not found.", 404)

            row = db_service.get_engagement_posting_activity(cur, company_id, posting_activity_id=posting_activity_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("set_engagement_posting_activity_status_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-posting-activity/<int:posting_activity_id>/deactivate", methods=["POST", "OPTIONS"])
@require_auth
def deactivate_engagement_posting_activity_route(cid: int, posting_activity_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to deactivate posting activity.", 403)

        with db_service._conn_cursor() as (conn, cur):
            updated_id = db_service.deactivate_engagement_posting_activity(
                cur,
                company_id,
                posting_activity_id=posting_activity_id,
                updated_by_user_id=_parse_int(payload.get("id")),
            )
            if not updated_id:
                return _json_err("Posting activity not found.", 404)

            row = db_service.get_engagement_posting_activity(cur, company_id, posting_activity_id=posting_activity_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("deactivate_engagement_posting_activity_route failed")
        return _json_err(str(e), 500)


# =========================================================
# MONTHLY CLOSE TASKS
# =========================================================

@engagement_ops_bp.route("/api/companies/<int:cid>/engagements/<int:engagement_id>/monthly-close-tasks", methods=["GET", "POST", "OPTIONS"])
@require_auth
def engagement_monthly_close_tasks_collection_route(cid: int, engagement_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if request.method == "GET":
            with db_service._conn_cursor() as (conn, cur):
                rows = db_service.list_engagement_monthly_close_tasks(
                    cur,
                    company_id,
                    engagement_id=engagement_id,
                    close_period=request.args.get("close_period"),
                    status=(request.args.get("status") or "").strip().lower(),
                    priority=(request.args.get("priority") or "").strip().lower(),
                    owner_user_id=_parse_int(request.args.get("owner_user_id")),
                    reviewer_user_id=_parse_int(request.args.get("reviewer_user_id")),
                    q=(request.args.get("q") or "").strip(),
                    active_only=_parse_bool(request.args.get("active_only"), True),
                    limit=_parse_limit(request.args.get("limit"), 200),
                    offset=_parse_offset(request.args.get("offset"), 0),
                )
            return _json_ok({"rows": rows})

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to manage monthly close tasks.", 403)

        body = request.get_json(silent=True) or {}
        close_period = body.get("close_period")
        task_name = (body.get("task_name") or "").strip()

        if not close_period:
            return _json_err("close_period is required.", 400)
        if not task_name:
            return _json_err("task_name is required.", 400)

        with db_service._conn_cursor() as (conn, cur):
            task_id = db_service.create_engagement_monthly_close_task(
                cur,
                company_id,
                engagement_id=engagement_id,
                close_period=close_period,
                task_name=task_name,
                task_code=(body.get("task_code") or "").strip() or None,
                description=(body.get("description") or "").strip() or None,
                owner_user_id=_parse_int(body.get("owner_user_id")),
                reviewer_user_id=_parse_int(body.get("reviewer_user_id")),
                due_date=body.get("due_date"),
                completed_at=body.get("completed_at"),
                status=(body.get("status") or "not_started").strip().lower(),
                priority=(body.get("priority") or "normal").strip().lower(),
                notes=(body.get("notes") or "").strip() or None,
                sort_order=_parse_int(body.get("sort_order")) or 0,
                created_by_user_id=_parse_int(payload.get("id")),
            )
            row = db_service.get_engagement_monthly_close_task(cur, company_id, monthly_close_task_id=task_id)

        return _json_ok({"row": row}, 201)

    except Exception as e:
        current_app.logger.exception("engagement_monthly_close_tasks_collection_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-monthly-close-tasks/<int:task_id>", methods=["GET", "PATCH", "OPTIONS"])
@require_auth
def engagement_monthly_close_task_detail_route(cid: int, task_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if request.method == "GET":
            with db_service._conn_cursor() as (conn, cur):
                row = db_service.get_engagement_monthly_close_task(cur, company_id, monthly_close_task_id=task_id)
            if not row:
                return _json_err("Monthly close task not found.", 404)
            return _json_ok({"row": row})

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to update monthly close tasks.", 403)

        body = request.get_json(silent=True) or {}
        with db_service._conn_cursor() as (conn, cur):
            updated_id = db_service.update_engagement_monthly_close_task(
                cur,
                company_id,
                monthly_close_task_id=task_id,
                updated_by_user_id=_parse_int(payload.get("id")),
                close_period=body.get("close_period"),
                task_code=(body.get("task_code") or "").strip() or None,
                task_name=(body.get("task_name") or "").strip() or None,
                description=(body.get("description") or "").strip() or None,
                owner_user_id=_parse_int(body.get("owner_user_id")),
                reviewer_user_id=_parse_int(body.get("reviewer_user_id")),
                due_date=body.get("due_date"),
                completed_at=body.get("completed_at"),
                status=(body.get("status") or "").strip().lower() or None,
                priority=(body.get("priority") or "").strip().lower() or None,
                notes=(body.get("notes") or "").strip() or None,
                sort_order=_parse_int(body.get("sort_order")),
                is_active=_parse_bool(body.get("is_active"), None),
            )
            if not updated_id:
                return _json_err("Monthly close task not found.", 404)

            row = db_service.get_engagement_monthly_close_task(cur, company_id, monthly_close_task_id=task_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("engagement_monthly_close_task_detail_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-monthly-close-tasks/<int:task_id>/status", methods=["POST", "OPTIONS"])
@require_auth
def set_engagement_monthly_close_task_status_route(cid: int, task_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to update monthly close task status.", 403)

        body = request.get_json(silent=True) or {}
        status = (body.get("status") or "").strip().lower()
        if not status:
            return _json_err("status is required.", 400)

        with db_service._conn_cursor() as (conn, cur):
            updated_id = db_service.set_engagement_monthly_close_task_status(
                cur,
                company_id,
                monthly_close_task_id=task_id,
                status=status,
                updated_by_user_id=_parse_int(payload.get("id")),
                completed_at=body.get("completed_at"),
            )
            if not updated_id:
                return _json_err("Monthly close task not found.", 404)

            row = db_service.get_engagement_monthly_close_task(cur, company_id, monthly_close_task_id=task_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("set_engagement_monthly_close_task_status_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-monthly-close-tasks/<int:task_id>/deactivate", methods=["POST", "OPTIONS"])
@require_auth
def deactivate_engagement_monthly_close_task_route(cid: int, task_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to deactivate monthly close tasks.", 403)

        with db_service._conn_cursor() as (conn, cur):
            updated_id = db_service.deactivate_engagement_monthly_close_task(
                cur,
                company_id,
                monthly_close_task_id=task_id,
                updated_by_user_id=_parse_int(payload.get("id")),
            )
            if not updated_id:
                return _json_err("Monthly close task not found.", 404)

            row = db_service.get_engagement_monthly_close_task(cur, company_id, monthly_close_task_id=task_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("deactivate_engagement_monthly_close_task_route failed")
        return _json_err(str(e), 500)


# =========================================================
# YEAR-END TASKS
# =========================================================

@engagement_ops_bp.route("/api/companies/<int:cid>/engagements/<int:engagement_id>/year-end-tasks", methods=["GET", "POST", "OPTIONS"])
@require_auth
def engagement_year_end_tasks_collection_route(cid: int, engagement_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if request.method == "GET":
            with db_service._conn_cursor() as (conn, cur):
                rows = db_service.list_engagement_year_end_tasks(
                    cur,
                    company_id,
                    engagement_id=engagement_id,
                    reporting_year_end=request.args.get("reporting_year_end"),
                    status=(request.args.get("status") or "").strip().lower(),
                    priority=(request.args.get("priority") or "").strip().lower(),
                    owner_user_id=_parse_int(request.args.get("owner_user_id")),
                    reviewer_user_id=_parse_int(request.args.get("reviewer_user_id")),
                    q=(request.args.get("q") or "").strip(),
                    active_only=_parse_bool(request.args.get("active_only"), True),
                    limit=_parse_limit(request.args.get("limit"), 200),
                    offset=_parse_offset(request.args.get("offset"), 0),
                )
            return _json_ok({"rows": rows})

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to manage year-end tasks.", 403)

        body = request.get_json(silent=True) or {}
        reporting_year_end = body.get("reporting_year_end")
        task_name = (body.get("task_name") or "").strip()

        if not reporting_year_end:
            return _json_err("reporting_year_end is required.", 400)
        if not task_name:
            return _json_err("task_name is required.", 400)

        with db_service._conn_cursor() as (conn, cur):
            task_id = db_service.create_engagement_year_end_task(
                cur,
                company_id,
                engagement_id=engagement_id,
                reporting_year_end=reporting_year_end,
                task_name=task_name,
                task_code=(body.get("task_code") or "").strip() or None,
                description=(body.get("description") or "").strip() or None,
                owner_user_id=_parse_int(body.get("owner_user_id")),
                reviewer_user_id=_parse_int(body.get("reviewer_user_id")),
                due_date=body.get("due_date"),
                completed_at=body.get("completed_at"),
                status=(body.get("status") or "not_started").strip().lower(),
                priority=(body.get("priority") or "normal").strip().lower(),
                notes=(body.get("notes") or "").strip() or None,
                sort_order=_parse_int(body.get("sort_order")) or 0,
                created_by_user_id=_parse_int(payload.get("id")),
            )
            row = db_service.get_engagement_year_end_task(cur, company_id, year_end_task_id=task_id)

        return _json_ok({"row": row}, 201)

    except Exception as e:
        current_app.logger.exception("engagement_year_end_tasks_collection_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-year-end-tasks/<int:task_id>", methods=["GET", "PATCH", "OPTIONS"])
@require_auth
def engagement_year_end_task_detail_route(cid: int, task_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if request.method == "GET":
            with db_service._conn_cursor() as (conn, cur):
                row = db_service.get_engagement_year_end_task(cur, company_id, year_end_task_id=task_id)
            if not row:
                return _json_err("Year-end task not found.", 404)
            return _json_ok({"row": row})

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to update year-end tasks.", 403)

        body = request.get_json(silent=True) or {}
        with db_service._conn_cursor() as (conn, cur):
            updated_id = db_service.update_engagement_year_end_task(
                cur,
                company_id,
                year_end_task_id=task_id,
                updated_by_user_id=_parse_int(payload.get("id")),
                reporting_year_end=body.get("reporting_year_end"),
                task_code=(body.get("task_code") or "").strip() or None,
                task_name=(body.get("task_name") or "").strip() or None,
                description=(body.get("description") or "").strip() or None,
                owner_user_id=_parse_int(body.get("owner_user_id")),
                reviewer_user_id=_parse_int(body.get("reviewer_user_id")),
                due_date=body.get("due_date"),
                completed_at=body.get("completed_at"),
                status=(body.get("status") or "").strip().lower() or None,
                priority=(body.get("priority") or "").strip().lower() or None,
                notes=(body.get("notes") or "").strip() or None,
                sort_order=_parse_int(body.get("sort_order")),
                is_active=_parse_bool(body.get("is_active"), None),
            )
            if not updated_id:
                return _json_err("Year-end task not found.", 404)

            row = db_service.get_engagement_year_end_task(cur, company_id, year_end_task_id=task_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("engagement_year_end_task_detail_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-year-end-tasks/<int:task_id>/status", methods=["POST", "OPTIONS"])
@require_auth
def set_engagement_year_end_task_status_route(cid: int, task_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to update year-end task status.", 403)

        body = request.get_json(silent=True) or {}
        status = (body.get("status") or "").strip().lower()
        if not status:
            return _json_err("status is required.", 400)

        with db_service._conn_cursor() as (conn, cur):
            updated_id = db_service.set_engagement_year_end_task_status(
                cur,
                company_id,
                year_end_task_id=task_id,
                status=status,
                updated_by_user_id=_parse_int(payload.get("id")),
                completed_at=body.get("completed_at"),
            )
            if not updated_id:
                return _json_err("Year-end task not found.", 404)

            row = db_service.get_engagement_year_end_task(cur, company_id, year_end_task_id=task_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("set_engagement_year_end_task_status_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-year-end-tasks/<int:task_id>/deactivate", methods=["POST", "OPTIONS"])
@require_auth
def deactivate_engagement_year_end_task_route(cid: int, task_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to deactivate year-end tasks.", 403)

        with db_service._conn_cursor() as (conn, cur):
            updated_id = db_service.deactivate_engagement_year_end_task(
                cur,
                company_id,
                year_end_task_id=task_id,
                updated_by_user_id=_parse_int(payload.get("id")),
            )
            if not updated_id:
                return _json_err("Year-end task not found.", 404)

            row = db_service.get_engagement_year_end_task(cur, company_id, year_end_task_id=task_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("deactivate_engagement_year_end_task_route failed")
        return _json_err(str(e), 500)


# =========================================================
# SIGNOFF STEPS
# =========================================================

@engagement_ops_bp.route("/api/companies/<int:cid>/engagements/<int:engagement_id>/signoff-steps", methods=["GET", "POST", "OPTIONS"])
@require_auth
def engagement_signoff_steps_collection_route(cid: int, engagement_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if request.method == "GET":
            with db_service._conn_cursor() as (conn, cur):
                rows = db_service.list_engagement_signoff_steps(
                    cur,
                    company_id,
                    engagement_id=engagement_id,
                    reporting_year_end=request.args.get("reporting_year_end"),
                    status=(request.args.get("status") or "").strip().lower(),
                    assigned_user_id=_parse_int(request.args.get("assigned_user_id")),
                    active_only=_parse_bool(request.args.get("active_only"), True),
                    limit=_parse_limit(request.args.get("limit"), 100),
                    offset=_parse_offset(request.args.get("offset"), 0),
                )
            return _json_ok({"rows": rows})

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to manage signoff steps.", 403)

        body = request.get_json(silent=True) or {}
        reporting_year_end = body.get("reporting_year_end")
        step_code = (body.get("step_code") or "").strip().lower()
        step_name = (body.get("step_name") or "").strip()

        if not reporting_year_end:
            return _json_err("reporting_year_end is required.", 400)
        if not step_code:
            return _json_err("step_code is required.", 400)
        if not step_name:
            return _json_err("step_name is required.", 400)

        with db_service._conn_cursor() as (conn, cur):
            step_id = db_service.create_engagement_signoff_step(
                cur,
                company_id,
                engagement_id=engagement_id,
                reporting_year_end=reporting_year_end,
                step_code=step_code,
                step_name=step_name,
                assigned_user_id=_parse_int(body.get("assigned_user_id")),
                due_date=body.get("due_date"),
                completed_at=body.get("completed_at"),
                status=(body.get("status") or "not_started").strip().lower(),
                notes=(body.get("notes") or "").strip() or None,
                sort_order=_parse_int(body.get("sort_order")) or 0,
                is_required=_parse_bool(body.get("is_required"), True),
                created_by_user_id=_parse_int(payload.get("id")),
            )
            row = db_service.get_engagement_signoff_step(cur, company_id, signoff_step_id=step_id)

        return _json_ok({"row": row}, 201)

    except Exception as e:
        current_app.logger.exception("engagement_signoff_steps_collection_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-signoff-steps/<int:step_id>", methods=["GET", "PATCH", "OPTIONS"])
@require_auth
def engagement_signoff_step_detail_route(cid: int, step_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if request.method == "GET":
            with db_service._conn_cursor() as (conn, cur):
                row = db_service.get_engagement_signoff_step(cur, company_id, signoff_step_id=step_id)
            if not row:
                return _json_err("Signoff step not found.", 404)
            return _json_ok({"row": row})

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to update signoff steps.", 403)

        body = request.get_json(silent=True) or {}
        with db_service._conn_cursor() as (conn, cur):
            updated_id = db_service.update_engagement_signoff_step(
                cur,
                company_id,
                signoff_step_id=step_id,
                updated_by_user_id=_parse_int(payload.get("id")),
                reporting_year_end=body.get("reporting_year_end"),
                step_code=(body.get("step_code") or "").strip().lower() or None,
                step_name=(body.get("step_name") or "").strip() or None,
                assigned_user_id=_parse_int(body.get("assigned_user_id")),
                due_date=body.get("due_date"),
                completed_at=body.get("completed_at"),
                status=(body.get("status") or "").strip().lower() or None,
                notes=(body.get("notes") or "").strip() or None,
                sort_order=_parse_int(body.get("sort_order")),
                is_required=_parse_bool(body.get("is_required"), None),
                is_active=_parse_bool(body.get("is_active"), None),
            )
            if not updated_id:
                return _json_err("Signoff step not found.", 404)

            row = db_service.get_engagement_signoff_step(cur, company_id, signoff_step_id=step_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("engagement_signoff_step_detail_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-signoff-steps/<int:step_id>/status", methods=["POST", "OPTIONS"])
@require_auth
def set_engagement_signoff_step_status_route(cid: int, step_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to update signoff step status.", 403)

        body = request.get_json(silent=True) or {}
        status = (body.get("status") or "").strip().lower()
        if not status:
            return _json_err("status is required.", 400)

        with db_service._conn_cursor() as (conn, cur):
            updated_id = db_service.set_engagement_signoff_step_status(
                cur,
                company_id,
                signoff_step_id=step_id,
                status=status,
                updated_by_user_id=_parse_int(payload.get("id")),
                completed_at=body.get("completed_at"),
            )
            if not updated_id:
                return _json_err("Signoff step not found.", 404)

            row = db_service.get_engagement_signoff_step(cur, company_id, signoff_step_id=step_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("set_engagement_signoff_step_status_route failed")
        return _json_err(str(e), 500)


@engagement_ops_bp.route("/api/companies/<int:cid>/engagement-signoff-steps/<int:step_id>/deactivate", methods=["POST", "OPTIONS"])
@require_auth
def deactivate_engagement_signoff_step_route(cid: int, step_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to deactivate signoff steps.", 403)

        with db_service._conn_cursor() as (conn, cur):
            updated_id = db_service.deactivate_engagement_signoff_step(
                cur,
                company_id,
                signoff_step_id=step_id,
                updated_by_user_id=_parse_int(payload.get("id")),
            )
            if not updated_id:
                return _json_err("Signoff step not found.", 404)

            row = db_service.get_engagement_signoff_step(cur, company_id, signoff_step_id=step_id)

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("deactivate_engagement_signoff_step_route failed")
        return _json_err(str(e), 500)