from flask import Blueprint, request, make_response, current_app
from BackEnd.Services.auth_middleware import require_auth, _corsify
from BackEnd.Services.db_service import db_service
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.practitioner.practitioner_engagements import _can_manage_engagements
from BackEnd.Services.assets.ppe_reporting import _audit_safe

engagement_working_papers_bp = Blueprint("engagement_working_papers", __name__)


def _json_ok(payload=None, status=200):
    from flask import jsonify
    return _corsify(make_response(jsonify(payload or {"ok": True}), status))


def _json_err(message: str, status=400):
    from flask import jsonify
    return _corsify(make_response(jsonify({"ok": False, "error": message}), status))


def _parse_int(v):
    try:
        if v in (None, "", "null"):
            return None
        return int(v)
    except Exception:
        return None


def _parse_bool(v, default=None):
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    if s in ("1", "true", "yes", "y", "on"):
        return True
    if s in ("0", "false", "no", "n", "off"):
        return False
    return default

def _wp_audit(
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
        module="engagements",
        action=action,
        entity_type="engagement_working_paper",
        entity_id=str(entity_id),
        entity_ref=entity_ref,
        before_json=before_json,
        after_json=after_json,
        message=message,
        cur=cur,
    )

@engagement_working_papers_bp.route(
    "/api/companies/<int:cid>/engagement-working-papers",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def engagement_working_papers_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if request.method == "GET":
            customer_id = _parse_int(request.args.get("customer_id"))
            engagement_id = _parse_int(request.args.get("engagement_id"))
            paper_section = (request.args.get("paper_section") or "").strip().lower() or None
            paper_type = (request.args.get("paper_type") or "").strip().lower() or None
            status = (request.args.get("status") or "").strip().lower() or None
            priority = (request.args.get("priority") or "").strip().lower() or None
            mine_only = _parse_bool(request.args.get("mine_only"), False)
            q = (request.args.get("q") or "").strip() or None
            limit = _parse_int(request.args.get("limit")) or 100
            offset = _parse_int(request.args.get("offset")) or 0

            with db_service._conn_cursor() as (conn, cur):
                rows = db_service.list_engagement_working_papers(
                    cur,
                    company_id,
                    customer_id=customer_id,
                    engagement_id=engagement_id,
                    paper_section=paper_section,
                    paper_type=paper_type,
                    status=status,
                    priority=priority,
                    mine_only=bool(mine_only),
                    current_user_id=_parse_int(payload.get("id")),
                    q=q,
                    limit=limit,
                    offset=offset,
                )

            return _json_ok({"rows": rows})

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to create working papers.", 403)

        body = request.get_json(silent=True) or {}

        engagement_id = _parse_int(body.get("engagement_id"))
        paper_name = (body.get("paper_name") or "").strip()
        paper_section = (body.get("paper_section") or "").strip().lower()

        if not engagement_id:
            return _json_err("engagement_id is required.", 400)
        if not paper_name:
            return _json_err("paper_name is required.", 400)
        if not paper_section:
            return _json_err("paper_section is required.", 400)

        with db_service._conn_cursor() as (conn, cur):
            new_id = db_service.create_engagement_working_paper(
                cur,
                company_id,
                engagement_id=engagement_id,
                created_by_user_id=_parse_int(payload.get("id")),
                paper_code=(body.get("paper_code") or "").strip() or None,
                paper_name=paper_name,
                paper_section=paper_section,
                paper_type=(body.get("paper_type") or "").strip().lower() or "working_paper",
                status=(body.get("status") or "").strip().lower() or "not_started",
                priority=(body.get("priority") or "").strip().lower() or "normal",
                preparer_user_id=_parse_int(body.get("preparer_user_id")),
                reviewer_user_id=_parse_int(body.get("reviewer_user_id")),
                due_date=body.get("due_date"),
                prepared_at=body.get("prepared_at"),
                reviewed_at=body.get("reviewed_at"),
                cleared_at=body.get("cleared_at"),
                version_no=_parse_int(body.get("version_no")) or 1,
                document_count=_parse_int(body.get("document_count")) or 0,
                linked_reporting_item_id=_parse_int(body.get("linked_reporting_item_id")),
                linked_deliverable_id=_parse_int(body.get("linked_deliverable_id")),
                notes=(body.get("notes") or "").strip() or None,
                review_notes=(body.get("review_notes") or "").strip() or None,
            )
            row = db_service.get_engagement_working_paper(
                cur,
                company_id,
                working_paper_id=new_id,
            )

            _wp_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action="create_working_paper",
                entity_id=new_id,
                entity_ref=(row.get("paper_name") or paper_name or f"WORKING-PAPER-{new_id}"),
                before_json={"request": body},
                after_json=row,
                message=f"Created working paper {new_id}",
            )

        return _json_ok({"row": row}, 201)

    except Exception as e:
        current_app.logger.exception("engagement_working_papers_route failed")
        return _json_err(str(e), 500)
    
@engagement_working_papers_bp.route(
    "/api/companies/<int:cid>/engagement-working-papers/<int:working_paper_id>",
    methods=["GET", "PATCH", "OPTIONS"],
)
@require_auth
def engagement_working_paper_detail_route(cid: int, working_paper_id: int):
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
                row = db_service.get_engagement_working_paper(
                    cur,
                    company_id,
                    working_paper_id=working_paper_id,
                )
            if not row:
                return _json_err("Working paper not found.", 404)
            return _json_ok({"row": row})

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to update working papers.", 403)

        body = request.get_json(silent=True) or {}

        with db_service._conn_cursor() as (conn, cur):
            before_row = db_service.get_engagement_working_paper(
                cur,
                company_id,
                working_paper_id=working_paper_id,
            )
            if not before_row:
                return _json_err("Working paper not found.", 404)

            updated_id = db_service.update_engagement_working_paper(
                cur,
                company_id,
                working_paper_id=working_paper_id,
                updated_by_user_id=_parse_int(payload.get("id")),
                paper_code=(body.get("paper_code") or "").strip() or None,
                paper_name=(body.get("paper_name") or "").strip() or None,
                paper_section=(body.get("paper_section") or "").strip().lower() or None,
                paper_type=(body.get("paper_type") or "").strip().lower() or None,
                status=(body.get("status") or "").strip().lower() or None,
                priority=(body.get("priority") or "").strip().lower() or None,
                preparer_user_id=_parse_int(body.get("preparer_user_id")),
                reviewer_user_id=_parse_int(body.get("reviewer_user_id")),
                due_date=body.get("due_date"),
                prepared_at=body.get("prepared_at"),
                reviewed_at=body.get("reviewed_at"),
                cleared_at=body.get("cleared_at"),
                version_no=_parse_int(body.get("version_no")),
                document_count=_parse_int(body.get("document_count")),
                linked_reporting_item_id=_parse_int(body.get("linked_reporting_item_id")),
                linked_deliverable_id=_parse_int(body.get("linked_deliverable_id")),
                notes=(body.get("notes") or "").strip() or None,
                review_notes=(body.get("review_notes") or "").strip() or None,
                is_active=_parse_bool(body.get("is_active"), None),
            )
            if not updated_id:
                return _json_err("Working paper not found.", 404)

            row = db_service.get_engagement_working_paper(
                cur,
                company_id,
                working_paper_id=working_paper_id,
            )

            _wp_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action="update_working_paper",
                entity_id=working_paper_id,
                entity_ref=(row.get("paper_name") or before_row.get("paper_name") or f"WORKING-PAPER-{working_paper_id}"),
                before_json=before_row,
                after_json=row,
                message=f"Updated working paper {working_paper_id}",
            )

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("engagement_working_paper_detail_route failed")
        return _json_err(str(e), 500)
    
@engagement_working_papers_bp.route(
    "/api/companies/<int:cid>/engagement-working-papers/<int:working_paper_id>/status",
    methods=["POST", "OPTIONS"],
)
@require_auth
def set_engagement_working_paper_status_route(cid: int, working_paper_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to update working paper status.", 403)

        body = request.get_json(silent=True) or {}
        status = (body.get("status") or "").strip().lower()
        if not status:
            return _json_err("status is required.", 400)

        with db_service._conn_cursor() as (conn, cur):
            before_row = db_service.get_engagement_working_paper(
                cur,
                company_id,
                working_paper_id=working_paper_id,
            )
            if not before_row:
                return _json_err("Working paper not found.", 404)

            updated_id = db_service.set_engagement_working_paper_status(
                cur,
                company_id,
                working_paper_id=working_paper_id,
                status=status,
                updated_by_user_id=_parse_int(payload.get("id")),
                prepared_at=body.get("prepared_at"),
                reviewed_at=body.get("reviewed_at"),
                cleared_at=body.get("cleared_at"),
            )
            if not updated_id:
                return _json_err("Working paper not found.", 404)

            row = db_service.get_engagement_working_paper(
                cur,
                company_id,
                working_paper_id=working_paper_id,
            )

            _wp_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action="set_working_paper_status",
                entity_id=working_paper_id,
                entity_ref=(row.get("paper_name") or before_row.get("paper_name") or f"WORKING-PAPER-{working_paper_id}"),
                before_json=before_row,
                after_json=row,
                message=f"Changed working paper {working_paper_id} status to {status}",
            )

        return _json_ok({"row": row})
    
    except Exception as e:
        current_app.logger.exception("set_engagement_working_paper_status_route failed")
        return _json_err(str(e), 500)
    
@engagement_working_papers_bp.route(
    "/api/companies/<int:cid>/engagement-working-papers/<int:working_paper_id>/deactivate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def deactivate_engagement_working_paper_route(cid: int, working_paper_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        if not _can_manage_engagements(payload):
            return _json_err("You do not have permission to deactivate working papers.", 403)

        with db_service._conn_cursor() as (conn, cur):
            before_row = db_service.get_engagement_working_paper(
                cur,
                company_id,
                working_paper_id=working_paper_id,
            )
            if not before_row:
                return _json_err("Working paper not found.", 404)

            updated_id = db_service.deactivate_engagement_working_paper(
                cur,
                company_id,
                working_paper_id=working_paper_id,
                updated_by_user_id=_parse_int(payload.get("id")),
            )
            if not updated_id:
                return _json_err("Working paper not found.", 404)

            row = db_service.get_engagement_working_paper(
                cur,
                company_id,
                working_paper_id=working_paper_id,
            ) or {
                **before_row,
                "is_active": False,
            }

            _wp_audit(
                cur=cur,
                company_id=company_id,
                payload=payload,
                action="deactivate_working_paper",
                entity_id=working_paper_id,
                entity_ref=(
                    row.get("paper_name")
                    or before_row.get("paper_name")
                    or f"WORKING-PAPER-{working_paper_id}"
                ),
                before_json=before_row,
                after_json=row,
                message=f"Deactivated working paper {working_paper_id}",
            )

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("deactivate_engagement_working_paper_route failed")
        return _json_err(str(e), 500)
    
@engagement_working_papers_bp.route(
    "/api/companies/<int:cid>/engagement-working-papers/summary",
    methods=["GET", "OPTIONS"],
)
@require_auth
def engagement_working_papers_summary_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(payload, company_id)
        if deny:
            return deny

        customer_id = _parse_int(request.args.get("customer_id"))
        engagement_id = _parse_int(request.args.get("engagement_id"))

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_engagement_working_papers_summary(
                cur,
                company_id,
                customer_id=customer_id,
                engagement_id=engagement_id,
                current_user_id=_parse_int(payload.get("id")),
            )

        return _json_ok({"row": row})

    except Exception as e:
        current_app.logger.exception("engagement_working_papers_summary_route failed")
        return _json_err(str(e), 500)
    
