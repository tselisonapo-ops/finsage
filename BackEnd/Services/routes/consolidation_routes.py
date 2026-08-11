from flask import Blueprint, current_app, g, jsonify, request
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.db_service import db_service
from BackEnd.Services.utils.view_token import verify_report_export_token
from BackEnd.Services.reporting.statement_exporters import (
    export_statement_pdf,
    export_statement_xlsx,
)
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

def _deny_group_export_access(
    company_id: int,
    run_id: int,
    expected_report_key: str,
):
    token = (request.args.get("t") or "").strip()

    if not token:
        return jsonify({
            "ok":False,
            "error":"Missing export token",
        }),401

    verified = verify_report_export_token(token)

    if not verified:
        return jsonify({
            "ok":False,
            "error":"Invalid or expired export token",
        }),401

    if int(verified.get("company_id") or 0)!=int(company_id):
        return jsonify({
            "ok":False,
            "error":"Token company mismatch",
        }),403

    if str(verified.get("report_key") or "")!=expected_report_key:
        return jsonify({
            "ok":False,
            "error":"Token report mismatch",
        }),403

    return None

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

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/"
    "runs/<int:run_id>/adjustments",
    methods=["GET"],
)
@require_auth
def api_list_group_adjustments(company_id: int, run_id: int):
    _, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        rows = db_service.list_group_adjustments(
            company_id,
            run_id,
        )
        return jsonify({"items": rows}), 200

    except Exception as e:
        current_app.logger.exception(
            "api_list_group_adjustments failed"
        )
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/"
    "runs/<int:run_id>/adjustments",
    methods=["POST"],
)
@require_auth
def api_create_group_adjustment(company_id: int, run_id: int):
    user, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        out = db_service.create_group_adjustment(
            company_id,
            run_id,
            request.get_json(silent=True) or {},
            user_id=user.get("id"),
        )

        return jsonify({
            "message": "Consolidation adjustment created",
            "data": out,
        }), 201

    except ValueError as e:
        return jsonify({"message": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "api_create_group_adjustment failed"
        )
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/"
    "runs/<int:run_id>/adjustments/<int:adjustment_id>",
    methods=["GET"],
)
@require_auth
def api_get_group_adjustment(
    company_id: int,
    run_id: int,
    adjustment_id: int,
):
    _, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        out = db_service.get_group_adjustment(
            company_id,
            run_id,
            adjustment_id,
        )

        if not out:
            return jsonify({"message": "Adjustment not found"}), 404

        return jsonify(out), 200

    except Exception as e:
        current_app.logger.exception(
            "api_get_group_adjustment failed"
        )
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/"
    "runs/<int:run_id>/adjustments/<int:adjustment_id>/status",
    methods=["POST"],
)
@require_auth
def api_set_group_adjustment_status(
    company_id: int,
    run_id: int,
    adjustment_id: int,
):
    user, deny = _company_access(company_id)
    if deny:
        return deny

    data = request.get_json(silent=True) or {}
    status = (data.get("status") or "").strip().lower()

    if status not in {"draft", "reviewed", "approved"}:
        return jsonify({"message": "Invalid target status"}), 400

    try:
        row = db_service.set_group_adjustment_status(
            company_id,
            run_id,
            adjustment_id,
            status,
            user_id=user.get("id"),
        )

        return jsonify({
            "message": f"Adjustment moved to {status}",
            "journal": row,
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "api_set_group_adjustment_status failed"
        )
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/"
    "runs/<int:run_id>/adjustments/<int:adjustment_id>",
    methods=["DELETE"],
)
@require_auth
def api_delete_group_adjustment(
    company_id: int,
    run_id: int,
    adjustment_id: int,
):
    _, deny = _company_access(company_id)
    if deny:
        return deny

    try:
        db_service.delete_group_adjustment(
            company_id,
            run_id,
            adjustment_id,
        )

        return jsonify({
            "message": "Adjustment deleted"
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400

    except Exception as e:
        current_app.logger.exception(
            "api_delete_group_adjustment failed"
        )
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/intercompany",
    methods=["GET"],
)
@require_auth
def api_group_intercompany_workspace(company_id: int, run_id: int):
    _, deny = _company_access(company_id)
    if deny: return deny
    try:
        return jsonify(db_service.get_group_intercompany_workspace(company_id, run_id)), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_group_intercompany_workspace failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/intercompany/balances",
    methods=["POST"],
)
@require_auth
def api_save_group_intercompany_balance(company_id: int, run_id: int):
    user, deny = _company_access(company_id)
    if deny: return deny
    try:
        row = db_service.save_group_intercompany_balance(
            company_id, run_id, request.get_json(silent=True) or {},
            user_id=user.get("id"),
        )
        return jsonify({"message": "Intercompany balance added", "balance": row}), 201
    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_save_group_intercompany_balance failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/intercompany/balances/<int:balance_id>",
    methods=["DELETE"],
)
@require_auth
def api_delete_group_intercompany_balance(company_id: int, run_id: int, balance_id: int):
    _, deny = _company_access(company_id)
    if deny: return deny
    try:
        db_service.delete_group_intercompany_balance(company_id, run_id, balance_id)
        return jsonify({"message": "Intercompany balance removed"}), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_delete_group_intercompany_balance failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/intercompany/rules",
    methods=["POST"],
)
@require_auth
def api_save_group_intercompany_rule(company_id: int):
    user, deny = _company_access(company_id)
    if deny: return deny
    try:
        row = db_service.save_group_intercompany_rule(
            company_id, request.get_json(silent=True) or {},
            user_id=user.get("id"),
        )
        return jsonify({"message": "Intercompany rule saved", "rule": row}), 201
    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_save_group_intercompany_rule failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/intercompany/apply-rules",
    methods=["POST"],
)
@require_auth
def api_apply_group_intercompany_rules(company_id: int, run_id: int):
    user, deny = _company_access(company_id)
    if deny: return deny
    try:
        out = db_service.apply_group_intercompany_rules(
            company_id, run_id, user_id=user.get("id")
        )
        return jsonify({"message": f"{out['created']} balance(s) created from rules", "data": out}), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_apply_group_intercompany_rules failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/intercompany/auto-match",
    methods=["POST"],
)
@require_auth
def api_auto_match_group_intercompany(company_id: int, run_id: int):
    user, deny = _company_access(company_id)
    if deny: return deny
    try:
        out = db_service.auto_match_group_intercompany(
            company_id, run_id, user_id=user.get("id")
        )
        return jsonify({"message": f"{out['matches_created']} match(es) created", "data": out}), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_auto_match_group_intercompany failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/eliminations",
    methods=["GET"],
)
@require_auth
def api_list_group_eliminations(company_id: int, run_id: int):
    _, deny = _company_access(company_id)
    if deny: return deny

    try:
        rows = db_service.list_group_eliminations(company_id, run_id)
        return jsonify({"items": rows}), 200
    except Exception as e:
        current_app.logger.exception("api_list_group_eliminations failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/eliminations/generate",
    methods=["POST"],
)
@require_auth
def api_generate_group_eliminations(company_id: int, run_id: int):
    user, deny = _company_access(company_id)
    if deny: return deny

    try:
        out = db_service.generate_group_eliminations(
            company_id,
            run_id,
            user_id=user.get("id"),
        )

        return jsonify({
            "message": f"{out['created']} elimination(s) generated",
            "data": out,
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_generate_group_eliminations failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/eliminations/<int:elimination_id>",
    methods=["GET"],
)
@require_auth
def api_get_group_elimination(company_id: int, run_id: int, elimination_id: int):
    _, deny = _company_access(company_id)
    if deny: return deny

    try:
        out = db_service.get_group_elimination(
            company_id,
            run_id,
            elimination_id,
        )

        if not out:
            return jsonify({"message": "Elimination not found"}), 404

        return jsonify(out), 200
    except Exception as e:
        current_app.logger.exception("api_get_group_elimination failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/eliminations/<int:elimination_id>/status",
    methods=["POST"],
)
@require_auth
def api_set_group_elimination_status(
    company_id: int,
    run_id: int,
    elimination_id: int,
):
    user, deny = _company_access(company_id)
    if deny: return deny

    data = request.get_json(silent=True) or {}
    status = (data.get("status") or "").strip().lower()

    if status not in {"draft", "reviewed", "approved"}:
        return jsonify({"message": "Invalid elimination status"}), 400

    try:
        row = db_service.set_group_elimination_status(
            company_id,
            run_id,
            elimination_id,
            status,
            user_id=user.get("id"),
        )

        return jsonify({
            "message": f"Elimination moved to {status}",
            "journal": row,
        }), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_set_group_elimination_status failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/eliminations/<int:elimination_id>",
    methods=["DELETE"],
)
@require_auth
def api_void_group_elimination(company_id: int, run_id: int, elimination_id: int):
    _, deny = _company_access(company_id)
    if deny: return deny

    try:
        row = db_service.void_group_elimination(
            company_id,
            run_id,
            elimination_id,
        )

        return jsonify({
            "message": "Elimination voided",
            "journal": row,
        }), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_void_group_elimination failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/adjusted-tb/validate",
    methods=["GET"],
)
@require_auth
def api_validate_group_adjusted_tb(company_id: int, run_id: int):
    _, deny = _company_access(company_id)
    if deny: return deny

    try:
        return jsonify(
            db_service.validate_group_adjusted_tb(company_id, run_id)
        ), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_validate_group_adjusted_tb failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/adjusted-tb/generate",
    methods=["POST"],
)
@require_auth
def api_generate_group_adjusted_tb(company_id: int, run_id: int):
    user, deny = _company_access(company_id)
    if deny: return deny

    try:
        out = db_service.generate_group_adjusted_tb(
            company_id,
            run_id,
            user_id=user.get("id"),
        )

        return jsonify({
            "message": "Adjusted Group Trial Balance generated",
            "data": out,
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_generate_group_adjusted_tb failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/adjusted-tb",
    methods=["GET"],
)
@require_auth
def api_get_group_adjusted_tb(company_id: int, run_id: int):
    _, deny = _company_access(company_id)
    if deny: return deny

    try:
        return jsonify(
            db_service.get_group_adjusted_tb(company_id, run_id)
        ), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_get_group_adjusted_tb failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/adjusted-tb/accounts/<int:group_account_id>",
    methods=["GET"],
)
@require_auth
def api_group_adjusted_tb_account_detail(
    company_id: int,
    run_id: int,
    group_account_id: int,
):
    _, deny = _company_access(company_id)
    if deny: return deny

    try:
        return jsonify(
            db_service.get_group_adjusted_tb_account_detail(
                company_id,
                run_id,
                group_account_id,
            )
        ), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 404
    except Exception as e:
        current_app.logger.exception("api_group_adjusted_tb_account_detail failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/acquisition/prepare",
    methods=["POST"],
)
@require_auth
def api_prepare_group_acquisition(company_id: int, run_id: int):
    user, deny = _company_access(company_id)
    if deny: return deny

    try:
        out = db_service.prepare_group_acquisition_workpapers(
            company_id, run_id, user_id=user.get("id")
        )
        return jsonify({
            "message": f"{out['workpapers_prepared']} acquisition workpaper(s) prepared",
            "data": out,
        }), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_prepare_group_acquisition failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/acquisition",
    methods=["GET"],
)
@require_auth
def api_group_acquisition_workspace(company_id: int, run_id: int):
    _, deny = _company_access(company_id)
    if deny: return deny

    try:
        return jsonify(
            db_service.get_group_acquisition_workspace(company_id, run_id)
        ), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_group_acquisition_workspace failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/acquisition/<int:workpaper_id>",
    methods=["GET","PATCH"],
)
@require_auth
def api_group_acquisition_workpaper(
    company_id: int,
    run_id: int,
    workpaper_id: int,
):
    _, deny = _company_access(company_id)
    if deny: return deny

    try:
        if request.method == "GET":
            out = db_service.get_group_acquisition_workpaper(
                company_id, run_id, workpaper_id
            )
            if not out:
                return jsonify({"message": "Acquisition workpaper not found"}), 404
            return jsonify(out), 200

        out = db_service.save_group_acquisition_workpaper(
            company_id,
            run_id,
            workpaper_id,
            request.get_json(silent=True) or {},
        )
        return jsonify({
            "message": "Acquisition workpaper saved",
            "data": out,
        }), 200

    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_group_acquisition_workpaper failed")
        return jsonify({"message": str(e)}), 500


@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/acquisition/<int:workpaper_id>/calculate",
    methods=["POST"],
)
@require_auth
def api_calculate_group_acquisition(
    company_id: int,
    run_id: int,
    workpaper_id: int,
):
    _, deny = _company_access(company_id)
    if deny: return deny

    try:
        row = db_service.calculate_group_acquisition_workpaper(
            company_id, run_id, workpaper_id
        )
        return jsonify({
            "message": "Acquisition workpaper calculated",
            "workpaper": row,
        }), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_calculate_group_acquisition failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/acquisition/<int:workpaper_id>/status",
    methods=["POST"],
)
@require_auth
def api_group_acquisition_status(
    company_id: int,
    run_id: int,
    workpaper_id: int,
):
    user, deny = _company_access(company_id)
    if deny: return deny

    status = (
        (request.get_json(silent=True) or {}).get("status") or ""
    ).strip().lower()

    if status not in {"calculated","reviewed","approved"}:
        return jsonify({"message": "Invalid workpaper status"}), 400

    try:
        row = db_service.set_group_acquisition_workpaper_status(
            company_id,
            run_id,
            workpaper_id,
            status,
            user_id=user.get("id"),
        )
        return jsonify({
            "message": f"Acquisition workpaper moved to {status}",
            "workpaper": row,
        }), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 400
    except Exception as e:
        current_app.logger.exception("api_group_acquisition_status failed")
        return jsonify({"message": str(e)}), 500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/equity-method/prepare",
    methods=["POST"],
)
@require_auth
def api_prepare_group_equity_method(company_id: int,run_id: int):
    user,deny = _company_access(company_id)
    if deny: return deny

    try:
        out = db_service.prepare_group_equity_method_workpapers(
            company_id,run_id,user_id=user.get("id")
        )
        return jsonify({
            "message": f"{out['workpapers_prepared']} equity-method workpaper(s) prepared",
            "data": out,
        }),200
    except ValueError as e:
        return jsonify({"message":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_prepare_group_equity_method failed")
        return jsonify({"message":str(e)}),500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/equity-method",
    methods=["GET"],
)
@require_auth
def api_group_equity_method_workspace(company_id: int,run_id: int):
    _,deny = _company_access(company_id)
    if deny: return deny

    try:
        return jsonify(
            db_service.get_group_equity_method_workspace(company_id,run_id)
        ),200
    except ValueError as e:
        return jsonify({"message":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_group_equity_method_workspace failed")
        return jsonify({"message":str(e)}),500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/equity-method/<int:workpaper_id>",
    methods=["GET","PATCH"],
)
@require_auth
def api_group_equity_method_workpaper(
    company_id: int,
    run_id: int,
    workpaper_id: int,
):
    _,deny = _company_access(company_id)
    if deny: return deny

    try:
        if request.method == "GET":
            out = db_service.get_group_equity_method_workpaper(
                company_id,run_id,workpaper_id
            )
            if not out:
                return jsonify({"message":"Equity-method workpaper not found"}),404
            return jsonify(out),200

        out = db_service.save_group_equity_method_workpaper(
            company_id,
            run_id,
            workpaper_id,
            request.get_json(silent=True) or {},
        )
        return jsonify({
            "message":"Equity-method workpaper saved",
            "data":out,
        }),200

    except ValueError as e:
        return jsonify({"message":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_group_equity_method_workpaper failed")
        return jsonify({"message":str(e)}),500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/equity-method/<int:workpaper_id>/calculate",
    methods=["POST"],
)
@require_auth
def api_calculate_group_equity_method(
    company_id: int,
    run_id: int,
    workpaper_id: int,
):
    _,deny = _company_access(company_id)
    if deny: return deny

    try:
        row = db_service.calculate_group_equity_method_workpaper(
            company_id,run_id,workpaper_id
        )
        return jsonify({
            "message":"Equity-method workpaper calculated",
            "workpaper":row,
        }),200
    except ValueError as e:
        return jsonify({"message":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_calculate_group_equity_method failed")
        return jsonify({"message":str(e)}),500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/equity-method/<int:workpaper_id>/status",
    methods=["POST"],
)
@require_auth
def api_group_equity_method_status(
    company_id: int,
    run_id: int,
    workpaper_id: int,
):
    user,deny = _company_access(company_id)
    if deny: return deny

    status = (
        (request.get_json(silent=True) or {}).get("status") or ""
    ).strip().lower()

    if status not in {"calculated","reviewed","approved"}:
        return jsonify({"message":"Invalid workpaper status"}),400

    try:
        row = db_service.set_group_equity_method_workpaper_status(
            company_id,run_id,workpaper_id,status,
            user_id=user.get("id"),
        )
        return jsonify({
            "message":f"Equity-method workpaper moved to {status}",
            "workpaper":row,
        }),200
    except ValueError as e:
        return jsonify({"message":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_group_equity_method_status failed")
        return jsonify({"message":str(e)}),500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/equity-method/journals/generate",
    methods=["POST"],
)
@require_auth
def api_generate_group_equity_method_journals(company_id: int,run_id: int):
    user,deny = _company_access(company_id)
    if deny: return deny

    try:
        out = db_service.generate_group_equity_method_journals(
            company_id,run_id,user_id=user.get("id")
        )
        return jsonify({
            "message":f"{out['created']} equity-method journal(s) generated",
            "data":out,
        }),200
    except ValueError as e:
        return jsonify({"message":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_generate_group_equity_method_journals failed")
        return jsonify({"message":str(e)}),500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/translation/prepare",
    methods=["POST"],
)
@require_auth
def api_prepare_group_translation(company_id: int,run_id: int):
    user,deny = _company_access(company_id)
    if deny: return deny

    try:
        out = db_service.prepare_group_translation_workpapers(
            company_id,run_id,user_id=user.get("id")
        )
        return jsonify({
            "message":f"{out['workpapers']} translation workpaper(s) prepared",
            "data":out,
        }),200
    except ValueError as e:
        return jsonify({"message":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_prepare_group_translation failed")
        return jsonify({"message":str(e)}),500
    
@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/translation",
    methods=["GET"],
)
@require_auth
def api_group_translation_workspace(company_id: int,run_id: int):
    _,deny = _company_access(company_id)
    if deny: return deny

    try:
        return jsonify(
            db_service.get_group_translation_workspace(company_id,run_id)
        ),200
    except Exception as e:
        current_app.logger.exception("api_group_translation_workspace failed")
        return jsonify({"message":str(e)}),500
    
@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/translation/<int:workpaper_id>",
    methods=["GET","PATCH"],
)
@require_auth
def api_group_translation_workpaper(
    company_id: int,
    run_id: int,
    workpaper_id: int,
):
    _,deny = _company_access(company_id)
    if deny: return deny

    try:
        if request.method == "GET":
            out = db_service.get_group_translation_workpaper(
                company_id,run_id,workpaper_id
            )
            if not out:
                return jsonify({"message":"Translation workpaper not found"}),404
            return jsonify(out),200

        out = db_service.save_group_translation_rates(
            company_id,run_id,workpaper_id,
            request.get_json(silent=True) or {},
        )
        return jsonify({
            "message":"Translation rates saved",
            "data":out,
        }),200

    except ValueError as e:
        return jsonify({"message":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_group_translation_workpaper failed")
        return jsonify({"message":str(e)}),500


@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/translation/<int:workpaper_id>/translate",
    methods=["POST"],
)
@require_auth
def api_translate_group_entity(
    company_id: int,
    run_id: int,
    workpaper_id: int,
):
    _,deny = _company_access(company_id)
    if deny: return deny

    try:
        row = db_service.translate_group_entity_tb(
            company_id,run_id,workpaper_id
        )
        return jsonify({
            "message":"Entity trial balance translated",
            "workpaper":row,
        }),200
    except ValueError as e:
        return jsonify({"message":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_translate_group_entity failed")
        return jsonify({"message":str(e)}),500


@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/translation/<int:workpaper_id>/status",
    methods=["POST"],
)
@require_auth
def api_group_translation_status(
    company_id: int,
    run_id: int,
    workpaper_id: int,
):
    user,deny = _company_access(company_id)
    if deny: return deny

    status = (
        (request.get_json(silent=True) or {}).get("status") or ""
    ).strip().lower()

    if status not in {"translated","reviewed","approved"}:
        return jsonify({"message":"Invalid translation status"}),400

    try:
        row = db_service.set_group_translation_status(
            company_id,run_id,workpaper_id,status,
            user_id=user.get("id"),
        )
        return jsonify({
            "message":f"Translation moved to {status}",
            "workpaper":row,
        }),200
    except ValueError as e:
        return jsonify({"message":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_group_translation_status failed")
        return jsonify({"message":str(e)}),500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/controls",
    methods=["GET"],
)
@require_auth
def api_group_consolidation_controls(company_id: int,run_id: int):
    _,deny = _company_access(company_id)
    if deny: return deny

    try:
        return jsonify(
            db_service.validate_group_consolidation_close(company_id,run_id)
        ),200
    except ValueError as e:
        return jsonify({"message":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_group_consolidation_controls failed")
        return jsonify({"message":str(e)}),500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/close",
    methods=["POST"],
)
@require_auth
def api_close_group_consolidation(company_id: int,run_id: int):
    user,deny = _company_access(company_id)
    if deny: return deny

    try:
        row = db_service.close_group_consolidation_run(
            company_id,run_id,user_id=user.get("id")
        )
        return jsonify({
            "message":"Consolidation run closed and ready for group reporting",
            "run":row,
        }),200
    except ValueError as e:
        return jsonify({"message":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_close_group_consolidation failed")
        return jsonify({"message":str(e)}),500


@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/reopen",
    methods=["POST"],
)
@require_auth
def api_reopen_group_consolidation(company_id: int,run_id: int):
    _,deny = _company_access(company_id)
    if deny: return deny

    try:
        row = db_service.reopen_group_consolidation_run(
            company_id,run_id
        )
        return jsonify({
            "message":"Consolidation run reopened",
            "run":row,
        }),200
    except ValueError as e:
        return jsonify({"message":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_reopen_group_consolidation failed")
        return jsonify({"message":str(e)}),500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/final-tb/validate",
    methods=["GET"],
)
@require_auth
def api_validate_group_final_tb(company_id: int,run_id: int):
    _,deny = _company_access(company_id)
    if deny: return deny

    try:
        return jsonify(
            db_service.validate_group_final_tb(
                company_id,run_id
            )
        ),200
    except ValueError as e:
        return jsonify({"message":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_validate_group_final_tb failed")
        return jsonify({"message":str(e)}),500


@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/final-tb/generate",
    methods=["POST"],
)
@require_auth
def api_generate_group_final_tb(company_id: int,run_id: int):
    user,deny = _company_access(company_id)
    if deny: return deny

    try:
        out = db_service.generate_group_final_tb(
            company_id,
            run_id,
            user_id=user.get("id"),
        )
        return jsonify({
            "message":"Final Consolidated Trial Balance generated",
            "data":out,
        }),200
    except ValueError as e:
        return jsonify({"message":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_generate_group_final_tb failed")
        return jsonify({"message":str(e)}),500


@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/final-tb",
    methods=["GET"],
)
@require_auth
def api_get_group_final_tb(company_id: int,run_id: int):
    _,deny = _company_access(company_id)
    if deny: return deny

    try:
        return jsonify(
            db_service.get_group_final_tb(
                company_id,run_id
            )
        ),200
    except Exception as e:
        current_app.logger.exception("api_get_group_final_tb failed")
        return jsonify({"message":str(e)}),500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/statements/<statement_key>",
    methods=["GET"],
)
@require_auth
def api_group_statement(
    company_id: int,
    run_id: int,
    statement_key: str,
):
    _,deny = _company_access(company_id)
    if deny: return deny

    allowed = {
        "balance-sheet",
        "income-statement",
        "cash-flow",
        "socie",
    }

    if statement_key not in allowed:
        return jsonify({"message":"Unsupported group statement"}),404

    try:
        out = db_service.build_group_statement(
            company_id,
            run_id,
            statement_key,
        )
        return jsonify(out),200

    except ValueError as e:
        return jsonify({"message":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_group_statement failed")
        return jsonify({"message":str(e)}),500



@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/statements",
    methods=["GET"],
)
@require_auth
def api_group_statement_pack(company_id: int,run_id: int):
    _,deny = _company_access(company_id)
    if deny: return deny

    try:
        return jsonify(
            db_service.build_group_financial_statement_pack(
                company_id,run_id
            )
        ),200
    except ValueError as e:
        return jsonify({"message":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_group_statement_pack failed")
        return jsonify({"message":str(e)}),500

@consolidation_bp.route(
    "/api/companies/<int:company_id>/consolidation/runs/<int:run_id>/statements/<statement_key>/export",
    methods=["GET"],
)
def api_export_group_statement(
    company_id: int,
    run_id: int,
    statement_key: str,
):
    report_keys = {
        "balance-sheet":"group_balance_sheet",
        "income-statement":"group_income_statement",
        "cash-flow":"group_cash_flow",
        "socie":"group_socie",
    }

    report_key = report_keys.get(statement_key)

    if not report_key:
        return jsonify({
            "ok":False,
            "error":"Unsupported group statement",
        }),404

    deny = _deny_group_export_access(
        company_id,
        run_id,
        report_key,
    )
    if deny: return deny

    fmt = (request.args.get("format") or "xlsx").lower()

    if fmt not in {"xlsx","pdf"}:
        return jsonify({
            "ok":False,
            "error":"Unsupported export format. Use xlsx or pdf.",
        }),400

    try:
        payload = db_service.build_group_statement(
            company_id,
            run_id,
            statement_key,
        )

        filename = {
            "balance-sheet":"group_balance_sheet",
            "income-statement":"group_income_statement",
            "cash-flow":"group_cash_flow",
            "socie":"group_socie",
        }[statement_key]

        if fmt=="pdf":
            return export_statement_pdf(
                payload,
                filename=f"{filename}.pdf",
            )

        return export_statement_xlsx(
            payload,
            filename=f"{filename}.xlsx",
        )

    except ValueError as e:
        return jsonify({"ok":False,"error":str(e)}),400
    except Exception as e:
        current_app.logger.exception("api_export_group_statement failed")
        return jsonify({"ok":False,"error":str(e)}),500