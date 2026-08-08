from flask import Blueprint, current_app, g, jsonify, request
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.db_service import db_service

consolidation_bp = Blueprint("consolidation", __name__)


def _company_access(company_id: int):
    user = getattr(g, "current_user", None)

    if not user:
        return None, (jsonify({"message": "Not authenticated"}), 401)

    if int(user.get("company_id") or 0) != int(company_id):
        return user, (
            jsonify({"message": "Not authorised for this company"}),
            403,
        )

    return user, None

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs",
    methods=["GET"],
)
@require_auth
def api_list_consolidation_runs(company_id: int):
    _, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        status = (request.args.get("status") or "").strip() or None

        rows = db_service.list_group_consolidation_runs(
            company_id,
            status=status,
        )

        return jsonify({
            "items": rows,
            "count": len(rows),
        }), 200

    except Exception as e:
        current_app.logger.exception("api_list_consolidation_runs failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs",
    methods=["POST"],
)
@require_auth
def api_create_consolidation_run(company_id: int):
    user, deny = _company_access(company_id)
    if deny:
        return deny

    data = request.get_json(silent=True) or {}

    for key in ("period_start", "period_end", "reporting_date"):
        if not data.get(key):
            return jsonify({"message": f"{key} is required"}), 400

    try:
        row = db_service.create_group_consolidation_run(
            company_id=company_id,
            period_start=data["period_start"],
            period_end=data["period_end"],
            reporting_date=data["reporting_date"],
            reporting_currency=data.get("reporting_currency"),
            run_name=data.get("run_name"),
            notes=data.get("notes"),
            user_id=user.get("id"),
        )

        return jsonify({
            "message": "Consolidation run created",
            "run": row,
        }), 201

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_create_consolidation_run failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>",
    methods=["GET"],
)
@require_auth
def api_get_consolidation_run(company_id: int, run_id: int):
    _, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        row = db_service.get_group_consolidation_run(company_id, run_id)

        if not row:
            return jsonify({"message": "Consolidation run not found"}), 404

        return jsonify(row), 200

    except Exception as e:
        current_app.logger.exception("api_get_consolidation_run failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>",
    methods=["PATCH"],
)
@require_auth
def api_update_consolidation_run(company_id: int, run_id: int):
    _, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        row = db_service.update_group_consolidation_run(
            company_id,
            run_id,
            request.get_json(silent=True) or {},
        )

        return jsonify({
            "message": "Consolidation run updated",
            "run": row,
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_update_consolidation_run failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/prepare",
    methods=["POST"],
)
@require_auth
def api_prepare_consolidation_run(company_id: int, run_id: int):
    user, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        row = db_service.prepare_group_consolidation_run(
            company_id,
            run_id,
            user_id=user.get("id"),
        )

        full = db_service.get_group_consolidation_run(
            company_id,
            run_id,
        )

        return jsonify({
            "message": "Consolidation run prepared",
            "run": row,
            "data": full,
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_prepare_consolidation_run failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/trial-balances",
    methods=["GET"],
)
@require_auth
def api_group_tb_summary(company_id: int, run_id: int):
    _, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        out = db_service.get_group_tb_summary(company_id, run_id)
        return jsonify(out), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_group_tb_summary failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/entities/<int:run_entity_id>/trial-balance/load",
    methods=["POST"],
)
@require_auth
def api_load_group_entity_tb(
    company_id: int,
    run_id: int,
    run_entity_id: int,
):
    user, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        out = db_service.load_group_entity_trial_balance(
            company_id,
            run_id,
            run_entity_id,
            user_id=user.get("id"),
        )

        return jsonify({
            "message": "Trial balance loaded",
            "data": out,
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_load_group_entity_tb failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/trial-balances/load-all",
    methods=["POST"],
)
@require_auth
def api_load_all_group_tbs(company_id: int, run_id: int):
    user, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        out = db_service.load_all_group_trial_balances(
            company_id,
            run_id,
            user_id=user.get("id"),
        )

        return jsonify({
            "message": (
                f"{out['loaded']} trial balance(s) loaded"
                + (
                    f", {out['failed']} failed"
                    if out["failed"]
                    else ""
                )
            ),
            "data": out,
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_load_all_group_tbs failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/entities/<int:run_entity_id>/trial-balance",
    methods=["GET"],
)
@require_auth
def api_get_group_entity_tb(
    company_id: int,
    run_id: int,
    run_entity_id: int,
):
    _, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        out = db_service.get_group_entity_trial_balance(
            company_id,
            run_id,
            run_entity_id,
        )
        return jsonify(out), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 404
    except Exception as e:
        current_app.logger.exception("api_get_group_entity_tb failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/group-coa",
    methods=["GET"],
)
@require_auth
def api_list_group_coa(company_id: int):
    _, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        rows = db_service.list_group_coa(company_id)
        return jsonify({"items": rows}), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_list_group_coa failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/group-coa/bootstrap",
    methods=["POST"],
)
@require_auth
def api_bootstrap_group_coa(company_id: int):
    user, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        out = db_service.bootstrap_group_coa_from_parent(
            company_id,
            user_id=user.get("id"),
        )

        return jsonify({
            "message": (
                f"Group COA ready: {out['inserted']} added, "
                f"{out['updated']} refreshed"
            ),
            "data": out,
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_bootstrap_group_coa failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/group-coa",
    methods=["POST"],
)
@require_auth
def api_create_group_coa_account(company_id: int):
    user, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        row = db_service.create_group_coa_account(
            company_id,
            request.get_json(silent=True) or {},
            user_id=user.get("id"),
        )

        return jsonify({
            "message": "Group account created",
            "account": row,
        }), 201

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_create_group_coa_account failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/group-coa/<int:account_id>",
    methods=["PATCH"],
)
@require_auth
def api_update_group_coa_account(
    company_id: int,
    account_id: int,
):
    _, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        row = db_service.update_group_coa_account(
            company_id,
            account_id,
            request.get_json(silent=True) or {},
        )

        return jsonify({
            "message": "Group account updated",
            "account": row,
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_update_group_coa_account failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/account-mapping",
    methods=["GET"],
)
@require_auth
def api_group_mapping_workspace(company_id: int, run_id: int):
    _, deny = _company_access(company_id)
    if deny:
        return deny

    entity_id = request.args.get("entity_company_id")
    unmapped_only = str(
        request.args.get("unmapped_only") or ""
    ).lower() in {"1", "true", "yes"}

    try:
        out = db_service.get_group_mapping_workspace(
            company_id,
            run_id,
            entity_company_id=(
                int(entity_id)
                if entity_id else None
            ),
            unmapped_only=unmapped_only,
        )

        return jsonify(out), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_group_mapping_workspace failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/account-mapping/auto",
    methods=["POST"],
)
@require_auth
def api_auto_map_group_accounts(company_id: int, run_id: int):
    user, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        out = db_service.auto_map_group_accounts(
            company_id,
            run_id,
            user_id=user.get("id"),
        )

        return jsonify({
            "message": f"{out['mapped']} account(s) mapped",
            "data": out,
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_auto_map_group_accounts failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/account-mapping/<int:tb_line_id>",
    methods=["PATCH"],
)
@require_auth
def api_save_group_account_mapping(
    company_id: int,
    run_id: int,
    tb_line_id: int,
):
    user, deny = _company_access(company_id)
    if deny:
        return deny

    data = request.get_json(silent=True) or {}

    try:
        group_account_id = int(
            data.get("group_account_id") or 0
        )
    except Exception:
        group_account_id = 0

    if not group_account_id:
        return jsonify({
            "message": "group_account_id is required"
        }), 400

    try:
        out = db_service.save_group_account_mapping(
            company_id,
            run_id,
            tb_line_id,
            group_account_id,
            user_id=user.get("id"),
        )

        return jsonify({
            "message": "Account mapping saved",
            "data": out,
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_save_group_account_mapping failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/"
    "runs/<int:run_id>/account-mapping/"
    "<int:tb_line_id>/create-account",
    methods=["POST"],
)
@require_auth
def api_create_and_map_group_account(
    company_id: int,
    run_id: int,
    tb_line_id: int,
):
    user, deny = _company_access(company_id)
    if deny:
        return deny

    data = request.get_json(silent=True) or {}

    try:
        out = db_service.create_and_map_group_account(
            company_id,
            run_id,
            tb_line_id,
            data,
            user_id=user.get("id"),
        )

        return jsonify({
            "message": "Group account created and mapped",
            "data": out,
        }), 201

    except ValueError as e:
        return jsonify({"message": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "api_create_and_map_group_account failed"
        )
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/"
    "runs/<int:run_id>/preconsolidation/validate",
    methods=["GET"],
)
@require_auth
def api_validate_group_preconsolidation(
    company_id: int,
    run_id: int,
):
    _, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        out = db_service.validate_group_preconsolidation(
            company_id,
            run_id,
        )
        return jsonify(out), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "api_validate_group_preconsolidation failed"
        )
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/"
    "runs/<int:run_id>/preconsolidation/generate",
    methods=["POST"],
)
@require_auth
def api_generate_group_preconsolidation(
    company_id: int,
    run_id: int,
):
    user, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        out = db_service.generate_group_preconsolidation_tb(
            company_id,
            run_id,
            user_id=user.get("id"),
        )

        return jsonify({
            "message": "Pre-consolidation trial balance generated",
            "data": out,
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "api_generate_group_preconsolidation failed"
        )
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/"
    "runs/<int:run_id>/preconsolidation",
    methods=["GET"],
)
@require_auth
def api_get_group_preconsolidation(
    company_id: int,
    run_id: int,
):
    _, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        out = db_service.get_group_preconsolidation_tb(
            company_id,
            run_id,
        )
        return jsonify(out), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "api_get_group_preconsolidation failed"
        )
        return jsonify({"message": str(e)}), 500