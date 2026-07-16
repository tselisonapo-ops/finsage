from flask import Blueprint, current_app, jsonify, make_response, request

from BackEnd.Services.auth_middleware import _corsify, require_auth
from BackEnd.Services.db_service import db_service
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company


deferred_tax_bp = Blueprint("deferred_tax_bp", __name__)


def _auth_context(cid: int):
    company_id = int(cid)
    payload = getattr(request, "jwt_payload", {}) or {}

    deny = _deny_if_wrong_company(
        payload,
        company_id,
        db_service=db_service,
    )
    if deny:
        return company_id, None, deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    return company_id, user_id, None


def _error_response(message: str, status: int = 400):
    return jsonify({"ok": False, "error": message}), status


def _audit(
    company_id: int,
    *,
    user_id,
    action: str,
    entity_type: str,
    entity_id,
    entity_ref=None,
    before_json=None,
    after_json=None,
    message=None,
    severity: str = "info",
):
    try:
        db_service.audit_log(
            company_id,
            actor_user_id=user_id,
            module="deferred_tax",
            action=action,
            severity=severity,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            entity_ref=entity_ref,
            before_json=before_json or {},
            after_json=after_json or {},
            message=message or action.replace("_", " ").title(),
            source="api",
        )
    except Exception:
        current_app.logger.exception(
            "audit_log failed for deferred tax action=%s",
            action,
        )


@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/runs",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def deferred_tax_runs(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = _auth_context(cid)
        if deny:
            return deny

        db_service.ensure_company_schema(company_id)

        if request.method == "GET":
            rows = db_service.deferred_tax_list_runs(
                company_id=company_id,
                status=(request.args.get("status") or "").strip() or None,
                reporting_date=(request.args.get("reporting_date") or "").strip() or None,
            ) or []
            return jsonify({"ok": True, "data": rows}), 200

        body = request.get_json(silent=True) or {}
        row = db_service.deferred_tax_create_run(
            company_id=company_id,
            payload=body,
            user_id=user_id,
        )

        _audit(
            company_id,
            user_id=user_id,
            action="create_deferred_tax_run",
            entity_type="deferred_tax_run",
            entity_id=row.get("id"),
            entity_ref=str(row.get("reporting_date") or ""),
            after_json={"run": row},
            message=f"Created deferred tax run for {row.get('reporting_date')}",
        )
        return jsonify({"ok": True, "data": row}), 201

    except Exception as e:
        current_app.logger.exception("deferred_tax_runs failed")
        return _error_response(str(e))


@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/runs/<int:run_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def deferred_tax_get_run(cid: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, _, deny = _auth_context(cid)
        if deny:
            return deny

        db_service.ensure_company_schema(company_id)
        row = db_service.deferred_tax_get_run(company_id=company_id, run_id=run_id)
        return jsonify({"ok": True, "data": row}), 200

    except ValueError as e:
        return _error_response(str(e), 404)
    except Exception as e:
        current_app.logger.exception("deferred_tax_get_run failed")
        return _error_response(str(e))


@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/runs/<int:run_id>/lines",
    methods=["POST", "OPTIONS"],
)
@require_auth
def deferred_tax_add_line(cid: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = _auth_context(cid)
        if deny:
            return deny

        body = request.get_json(silent=True) or {}
        row = db_service.deferred_tax_add_line(
            company_id=company_id,
            run_id=run_id,
            payload=body,
        )

        _audit(
            company_id,
            user_id=user_id,
            action="add_deferred_tax_line",
            entity_type="deferred_tax_run_line",
            entity_id=row.get("id"),
            entity_ref=row.get("description"),
            after_json={"line": row},
            message=f"Added deferred tax line to run {run_id}",
        )
        return jsonify({"ok": True, "data": row}), 201

    except Exception as e:
        current_app.logger.exception("deferred_tax_add_line failed")
        return _error_response(str(e))


@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/runs/<int:run_id>/lines/<int:line_id>",
    methods=["DELETE", "OPTIONS"],
)
@require_auth
def deferred_tax_delete_line(cid: int, run_id: int, line_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = _auth_context(cid)
        if deny:
            return deny

        db_service.deferred_tax_delete_line(
            company_id=company_id,
            run_id=run_id,
            line_id=line_id,
        )

        _audit(
            company_id,
            user_id=user_id,
            action="delete_deferred_tax_line",
            entity_type="deferred_tax_run_line",
            entity_id=line_id,
            entity_ref=f"run:{run_id}",
            after_json={"deleted": True, "run_id": run_id, "line_id": line_id},
            message=f"Deleted deferred tax line {line_id} from run {run_id}",
            severity="warning",
        )
        return jsonify({"ok": True, "id": line_id}), 200

    except ValueError as e:
        return _error_response(str(e), 404)
    except Exception as e:
        current_app.logger.exception("deferred_tax_delete_line failed")
        return _error_response(str(e))


@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/runs/<int:run_id>/recalculate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def deferred_tax_recalculate(cid: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = _auth_context(cid)
        if deny:
            return deny

        row = db_service.deferred_tax_refresh_totals(
            company_id=company_id,
            run_id=run_id,
        )
        _audit(
            company_id,
            user_id=user_id,
            action="recalculate_deferred_tax_run",
            entity_type="deferred_tax_run",
            entity_id=run_id,
            after_json={"run": row},
            message=f"Recalculated deferred tax run {run_id}",
        )
        return jsonify({"ok": True, "data": row}), 200

    except Exception as e:
        current_app.logger.exception("deferred_tax_recalculate failed")
        return _error_response(str(e))


@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/runs/<int:run_id>/review",
    methods=["POST", "OPTIONS"],
)
@require_auth
def deferred_tax_review(cid: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = _auth_context(cid)
        if deny:
            return deny

        row = db_service.deferred_tax_review_run(
            company_id=company_id,
            run_id=run_id,
            user_id=user_id,
        )
        _audit(
            company_id,
            user_id=user_id,
            action="review_deferred_tax_run",
            entity_type="deferred_tax_run",
            entity_id=run_id,
            after_json={"status": row.get("status")},
            message=f"Reviewed deferred tax run {run_id}",
        )
        return jsonify({"ok": True, "data": row}), 200

    except Exception as e:
        current_app.logger.exception("deferred_tax_review failed")
        return _error_response(str(e))


@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/runs/<int:run_id>/approve",
    methods=["POST", "OPTIONS"],
)
@require_auth
def deferred_tax_approve(cid: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = _auth_context(cid)
        if deny:
            return deny

        row = db_service.deferred_tax_approve_run(
            company_id=company_id,
            run_id=run_id,
            user_id=user_id,
        )
        _audit(
            company_id,
            user_id=user_id,
            action="approve_deferred_tax_run",
            entity_type="deferred_tax_run",
            entity_id=run_id,
            after_json={"status": row.get("status")},
            message=f"Approved deferred tax run {run_id}",
        )
        return jsonify({"ok": True, "data": row}), 200

    except Exception as e:
        current_app.logger.exception("deferred_tax_approve failed")
        return _error_response(str(e))


@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/runs/<int:run_id>/void",
    methods=["POST", "OPTIONS"],
)
@require_auth
def deferred_tax_void(cid: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = _auth_context(cid)
        if deny:
            return deny

        row = db_service.deferred_tax_void_run(
            company_id=company_id,
            run_id=run_id,
        )
        _audit(
            company_id,
            user_id=user_id,
            action="void_deferred_tax_run",
            entity_type="deferred_tax_run",
            entity_id=run_id,
            after_json={"status": row.get("status")},
            message=f"Voided deferred tax run {run_id}",
            severity="warning",
        )
        return jsonify({"ok": True, "data": row}), 200

    except Exception as e:
        current_app.logger.exception("deferred_tax_void failed")
        return _error_response(str(e))


@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/tax-base-overrides",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def deferred_tax_overrides(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = _auth_context(cid)
        if deny:
            return deny

        if request.method == "GET":
            source_id = request.args.get("source_id")
            source_id = int(source_id) if source_id and source_id.isdigit() else None

            rows = db_service.deferred_tax_list_overrides(
                company_id=company_id,
                source_module=(request.args.get("source_module") or "").strip() or None,
                source_type=(request.args.get("source_type") or "").strip() or None,
                source_id=source_id,
            ) or []
            return jsonify({"ok": True, "data": rows}), 200

        body = request.get_json(silent=True) or {}
        row = db_service.deferred_tax_save_override(
            company_id=company_id,
            payload=body,
            user_id=user_id,
        )

        _audit(
            company_id,
            user_id=user_id,
            action="save_deferred_tax_base_override",
            entity_type="deferred_tax_tax_base_override",
            entity_id=row.get("id"),
            entity_ref=(
                f"{row.get('source_module')}:"
                f"{row.get('source_type')}:"
                f"{row.get('source_id')}"
            ),
            after_json={"override": row},
            message=f"Saved deferred tax-base override {row.get('id')}",
        )
        return jsonify({"ok": True, "data": row}), 201

    except Exception as e:
        current_app.logger.exception("deferred_tax_overrides failed")
        return _error_response(str(e))


@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/runs/<int:run_id>/recognition-assessment",
    methods=["POST", "OPTIONS"],
)
@require_auth
def deferred_tax_recognition_assessment(cid: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = _auth_context(cid)
        if deny:
            return deny

        body = request.get_json(silent=True) or {}
        row = db_service.deferred_tax_save_recognition_assessment(
            company_id=company_id,
            run_id=run_id,
            payload=body,
            user_id=user_id,
        )

        _audit(
            company_id,
            user_id=user_id,
            action="save_deferred_tax_recognition_assessment",
            entity_type="deferred_tax_recognition_assessment",
            entity_id=row.get("id"),
            entity_ref=row.get("assessment_type"),
            after_json={"assessment": row},
            message=f"Saved deferred tax recognition assessment for run {run_id}",
        )
        return jsonify({"ok": True, "data": row}), 201

    except Exception as e:
        current_app.logger.exception(
            "deferred_tax_recognition_assessment failed"
        )
        return _error_response(str(e))
    
@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/runs/"
    "<int:run_id>/return-to-draft",
    methods=["POST", "OPTIONS"],
)
@require_auth
def deferred_tax_return_to_draft(cid: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = _auth_context(cid)
        if deny:
            return deny

        row = db_service.deferred_tax_return_to_draft(
            company_id,
            run_id,
        )

        return jsonify({
            "ok": True,
            "data": row,
        }), 200

    except Exception as e:
        current_app.logger.exception(
            "deferred_tax_return_to_draft failed"
        )
        return jsonify({
            "ok": False,
            "error": str(e),
        }), 400
    
@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/runs/<int:run_id>/post",
    methods=["POST", "OPTIONS"],
)
@require_auth
def deferred_tax_post(cid: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = _auth_context(cid)
        if deny:
            return deny

        row = db_service.deferred_tax_post_run(
            company_id,
            run_id,
            user_id,
        )

        return jsonify({
            "ok": True,
            "data": row,
        }), 200

    except Exception as e:
        current_app.logger.exception("deferred_tax_post failed")
        return jsonify({
            "ok": False,
            "error": str(e),
        }), 400