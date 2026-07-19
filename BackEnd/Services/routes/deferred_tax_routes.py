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
    
@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/runs/<int:run_id>/scan",
    methods=["POST", "OPTIONS"],
)
@require_auth
def deferred_tax_scan(cid: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = _auth_context(cid)
        if deny:
            return deny

        row = db_service.deferred_tax_scan_run(
            company_id,
            run_id,
            user_id,
        )

        _audit(
            company_id,
            user_id=user_id,
            action="scan_deferred_tax_run",
            entity_type="deferred_tax_run",
            entity_id=run_id,
            after_json={"scan_summary": row.get("scan_summary")},
            message=f"Scanned balance sheet for deferred tax run {run_id}",
        )

        return jsonify({
            "ok": True,
            "data": row,
        }), 200

    except Exception as e:
        current_app.logger.exception("deferred_tax_scan failed")
        return jsonify({
            "ok": False,
            "error": str(e),
        }), 400

@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/settings",
    methods=["GET", "PUT", "OPTIONS"],
)
@require_auth
def deferred_tax_settings(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = _auth_context(cid)
        if deny:
            return deny

        if request.method == "GET":
            row = db_service.deferred_tax_get_settings(company_id)
            return jsonify({"ok": True, "data": row}), 200

        body = request.get_json(silent=True) or {}

        row = db_service.deferred_tax_update_settings(
            company_id,
            body,
        )

        _audit(
            company_id,
            user_id=user_id,
            action="update_deferred_tax_settings",
            entity_type="company",
            entity_id=company_id,
            after_json={"settings": row},
        )

        return jsonify({"ok": True, "data": row}), 200

    except Exception as e:
        current_app.logger.exception(
            "deferred_tax_settings failed"
        )
        return jsonify({
            "ok": False,
            "error": str(e),
        }), 400
    
@deferred_tax_bp.get(
    "/api/companies/<int:cid>/deferred-tax/authorities"
)
@require_auth
def deferred_tax_authorities(cid: int):
    company_id, _, deny = _auth_context(cid)
    if deny:
        return deny

    rows = db_service.deferred_tax_list_authorities()

    return jsonify({
        "ok": True,
        "data": rows,
    }), 200

@deferred_tax_bp.get(
    "/api/companies/<int:cid>/deferred-tax/allowance-rules"
)
@require_auth
def deferred_tax_allowance_rules(cid: int):
    company_id, _, deny = _auth_context(cid)
    if deny:
        return deny

    authority_id = request.args.get(
        "tax_authority_id",
        type=int,
    )

    if not authority_id:
        settings = db_service.deferred_tax_get_settings(
            company_id
        )
        authority_id = settings.get("tax_authority_id")

    rows = db_service.deferred_tax_list_allowance_rules(
        authority_id
    ) if authority_id else []

    return jsonify({
        "ok": True,
        "data": rows,
    }), 200

@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/"
    "revenue-tax-rules",
    methods=["GET", "OPTIONS"],
)
@require_auth
def deferred_tax_revenue_tax_rules(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, _, deny = _auth_context(cid)
        if deny:
            return deny

        authority_id = request.args.get(
            "tax_authority_id",
            type=int,
        )

        if not authority_id:
            settings = (
                db_service.deferred_tax_get_settings(
                    company_id
                )
            )

            authority_id = settings.get(
                "tax_authority_id"
            )

        item_type = (
            request.args.get(
                "revenue_item_type"
            )
            or ""
        ).strip() or None

        as_at = (
            request.args.get("as_at")
            or ""
        ).strip() or None

        rows = db_service.revenue_tax_rules_list(
            tax_authority_id=authority_id,
            revenue_item_type=item_type,
            active_only=True,
            as_at=as_at,
        ) or []

        return jsonify({
            "ok": True,
            "data": rows,
        }), 200

    except Exception as e:
        current_app.logger.exception(
            "deferred_tax_revenue_tax_rules failed"
        )

        return _error_response(str(e))
    
@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/"
    "revenue-contract-tax-profiles",
    methods=["GET", "OPTIONS"],
)
@require_auth
def deferred_tax_revenue_profiles(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, _, deny = _auth_context(cid)
        if deny:
            return deny

        db_service.ensure_company_schema(
            company_id
        )

        contract_id = request.args.get(
            "contract_id",
            type=int,
        )

        authority_id = request.args.get(
            "tax_authority_id",
            type=int,
        )

        review_status = (
            request.args.get("review_status")
            or ""
        ).strip() or None

        as_at = (
            request.args.get("as_at")
            or ""
        ).strip() or None

        rows = (
            db_service
            .revenue_contract_tax_profiles_list(
                company_id=company_id,
                contract_id=contract_id,
                tax_authority_id=authority_id,
                review_status=review_status,
                as_at=as_at,
            )
        ) or []

        return jsonify({
            "ok": True,
            "data": rows,
        }), 200

    except Exception as e:
        current_app.logger.exception(
            "deferred_tax_revenue_profiles failed"
        )

        return _error_response(str(e))
    
@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/"
    "revenue-contract-tax-profiles/<int:profile_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def deferred_tax_revenue_profile_get(
    cid: int,
    profile_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, _, deny = _auth_context(cid)
        if deny:
            return deny

        row = (
            db_service
            .revenue_contract_tax_profile_get(
                company_id=company_id,
                profile_id=profile_id,
            )
        )

        if not row:
            return _error_response(
                "Revenue contract tax profile "
                "not found.",
                404,
            )

        return jsonify({
            "ok": True,
            "data": row,
        }), 200

    except Exception as e:
        current_app.logger.exception(
            "deferred_tax_revenue_profile_get "
            "failed"
        )

        return _error_response(str(e))
    
@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/"
    "revenue-contracts/<int:contract_id>/"
    "tax-profile",
    methods=["POST", "OPTIONS"],
)
@require_auth
def deferred_tax_revenue_profile_ensure(
    cid: int,
    contract_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = (
            _auth_context(cid)
        )

        if deny:
            return deny

        db_service.ensure_company_schema(
            company_id
        )

        body = request.get_json(
            silent=True
        ) or {}

        authority_id = body.get(
            "tax_authority_id"
        )

        if authority_id not in (
            None,
            "",
            0,
            "0",
        ):
            authority_id = int(authority_id)
        else:
            authority_id = None

        row = (
            db_service
            .revenue_contract_tax_profile_ensure(
                company_id=company_id,
                contract_id=contract_id,
                tax_authority_id=authority_id,
                user_id=user_id,
            )
        )

        _audit(
            company_id,
            user_id=user_id,
            action=(
                "ensure_revenue_contract_"
                "tax_profile"
            ),
            entity_type=(
                "revenue_contract_tax_profile"
            ),
            entity_id=row.get("id"),
            entity_ref=(
                f"contract:{contract_id}"
            ),
            after_json={
                "profile": row,
            },
            message=(
                "Created or confirmed revenue "
                f"tax profile for contract "
                f"{contract_id}"
            ),
        )

        return jsonify({
            "ok": True,
            "data": row,
        }), 200

    except ValueError as e:
        return _error_response(str(e), 400)

    except Exception as e:
        current_app.logger.exception(
            "deferred_tax_revenue_profile_ensure "
            "failed"
        )

        return _error_response(str(e))
    
@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/"
    "revenue-contract-tax-profiles/<int:profile_id>",
    methods=["PUT", "PATCH", "OPTIONS"],
)
@require_auth
def deferred_tax_revenue_profile_update(
    cid: int,
    profile_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = (
            _auth_context(cid)
        )

        if deny:
            return deny

        body = request.get_json(
            silent=True
        ) or {}

        before = (
            db_service
            .revenue_contract_tax_profile_get(
                company_id=company_id,
                profile_id=profile_id,
            )
        )

        if not before:
            return _error_response(
                "Revenue contract tax profile "
                "not found.",
                404,
            )

        row = (
            db_service
            .revenue_contract_tax_profile_update(
                company_id=company_id,
                profile_id=profile_id,
                payload=body,
                user_id=user_id,
            )
        )

        after = (
            db_service
            .revenue_contract_tax_profile_get(
                company_id=company_id,
                profile_id=profile_id,
            )
        ) or row

        _audit(
            company_id,
            user_id=user_id,
            action=(
                "update_revenue_contract_"
                "tax_profile"
            ),
            entity_type=(
                "revenue_contract_tax_profile"
            ),
            entity_id=profile_id,
            entity_ref=(
                before.get("contract_number")
                or str(
                    before.get("contract_id")
                    or ""
                )
            ),
            before_json={
                "profile": before,
            },
            after_json={
                "profile": after,
            },
            message=(
                "Updated revenue contract tax "
                f"profile {profile_id}"
            ),
        )

        return jsonify({
            "ok": True,
            "data": after,
        }), 200

    except ValueError as e:
        return _error_response(str(e), 400)

    except Exception as e:
        current_app.logger.exception(
            "deferred_tax_revenue_profile_update "
            "failed"
        )

        return _error_response(str(e))
    
@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/"
    "revenue-contract-tax-profiles/"
    "<int:profile_id>/calculate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def deferred_tax_revenue_profile_calculate(
    cid: int,
    profile_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, _, deny = (
            _auth_context(cid)
        )

        if deny:
            return deny

        profile = (
            db_service
            .revenue_contract_tax_profile_get(
                company_id=company_id,
                profile_id=profile_id,
            )
        )

        if not profile:
            return _error_response(
                "Revenue contract tax profile "
                "not found.",
                404,
            )

        contract = {
            "recognized_revenue_to_date":
                profile.get(
                    "recognized_revenue_to_date"
                ),
            "billed_to_date":
                profile.get("billed_to_date"),
            "cash_received_to_date":
                profile.get(
                    "cash_received_to_date"
                ),
        }

        result = (
            db_service
            .revenue_contract_tax_base_calculate(
                contract=contract,
                profile=profile,
            )
        )

        return jsonify({
            "ok": True,
            "data": result,
        }), 200

    except ValueError as e:
        return _error_response(str(e), 400)

    except Exception as e:
        current_app.logger.exception(
            "deferred_tax_revenue_profile_"
            "calculate failed"
        )

        return _error_response(str(e))
    
@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/"
    "asset-tax-runs/<int:run_id>/calculate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def asset_tax_calculate_run(cid: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = _auth_context(cid)
        if deny:
            return deny

        db_service.ensure_company_schema(company_id)

        result = db_service.asset_tax_calculate_run(
            company_id=company_id,
            run_id=run_id,
        )

        _audit(
            company_id,
            user_id=user_id,
            action="calculate_asset_tax_run",
            entity_type="asset_tax_run",
            entity_id=run_id,
            after_json={
                "run": result.get("run"),
                "line_count": result.get("line_count"),
                "review_count": result.get("review_count"),
            },
            message=f"Calculated asset tax run {run_id}",
        )

        return jsonify({
            "ok": True,
            "data": result,
        }), 200

    except ValueError as e:
        return _error_response(str(e), 400)

    except Exception as e:
        current_app.logger.exception(
            "asset_tax_calculate_run failed"
        )
        return _error_response(str(e), 500)
    
@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/asset-tax-runs",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def asset_tax_runs(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = _auth_context(cid)
        if deny:
            return deny

        db_service.ensure_company_schema(company_id)

        if request.method == "GET":
            rows = db_service.asset_tax_list_runs(
                company_id=company_id,
            ) or []

            return jsonify({
                "ok": True,
                "data": rows,
            }), 200

        body = request.get_json(silent=True) or {}

        row = db_service.asset_tax_create_run(
            company_id=company_id,
            payload=body,
            user_id=user_id,
        )

        _audit(
            company_id,
            user_id=user_id,
            action="create_asset_tax_run",
            entity_type="asset_tax_run",
            entity_id=row.get("id"),
            entity_ref=str(row.get("tax_year") or ""),
            after_json={"run": row},
            message=f"Created asset tax run for {row.get('tax_year')}",
        )

        return jsonify({
            "ok": True,
            "data": row,
        }), 201

    except ValueError as e:
        return _error_response(str(e), 400)

    except Exception as e:
        current_app.logger.exception(
            "asset_tax_runs failed"
        )
        return _error_response(str(e), 500)
    
@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/runs/<int:run_id>/preview-post",
    methods=["POST", "OPTIONS"],
)
@require_auth
def deferred_tax_preview_post(cid: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, user_id, deny = _auth_context(cid)
        if deny:
            return deny

        body = request.get_json(silent=True) or {}

        row = db_service.preview_deferred_tax_posting(
            company_id=company_id,
            run_id=run_id,
            posting_date=body.get("posting_date"),
            reference=body.get("reference"),
            description=body.get("description"),
            user_id=user_id,
        )

        return jsonify({
            "ok": True,
            "data": row,
        }), 200

    except Exception as e:
        current_app.logger.exception(
            "deferred_tax_preview_post failed"
        )
        return _error_response(str(e))
    
@deferred_tax_bp.route(
    "/api/companies/<int:cid>/deferred-tax/"
    "asset-tax-runs/<int:run_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def asset_tax_get_run(cid: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id, _, deny = _auth_context(cid)
        if deny:
            return deny

        db_service.ensure_company_schema(company_id)

        row = db_service.asset_tax_get_run(
            company_id=company_id,
            run_id=run_id,
        )

        if not row:
            return _error_response(
                "Capital allowance run not found.",
                404,
            )

        return jsonify({
            "ok": True,
            "data": row,
        }), 200

    except ValueError as e:
        return _error_response(str(e), 404)

    except Exception as e:
        current_app.logger.exception(
            "asset_tax_get_run failed"
        )
        return _error_response(str(e), 500)