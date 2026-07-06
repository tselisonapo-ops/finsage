from flask import Blueprint, request, jsonify, g, current_app

from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.assets.ppe_reporting import _json_error
from BackEnd.Services.utils.http_helpers import _opt


bp_asset_tax = Blueprint("asset_tax", __name__)

def _asset_tax_user():
    user = getattr(g, "current_user", None) or {}
    user = dict(user) if isinstance(user, dict) else {}

    uid = (
        user.get("user_id")
        or user.get("id")
        or getattr(g, "user_id", None)
    )

    if uid:
        user["user_id"] = int(uid)
        user["sub"] = int(uid)

    if not user.get("company_id"):
        user["company_id"] = getattr(g, "company_id", None) or user.get("company_id")

    return user

@bp_asset_tax.route(
    "/api/companies/<int:company_id>/asset-tax/profiles",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_asset_tax_profiles(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _asset_tax_user()

    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        items = db_service.asset_tax_list_profiles(company_id)
        return jsonify({"ok": True, "items": items}), 200
    except Exception as e:
        current_app.logger.exception("asset_tax_profiles failed")
        return _json_error(str(e), 400)


@bp_asset_tax.route(
    "/api/companies/<int:company_id>/asset-tax/profiles/backfill",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_asset_tax_backfill_profiles(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _asset_tax_user()

    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        with db_service.transaction() as (conn, cur):
            result = db_service.asset_tax_create_missing_profiles(
                company_id,
                cur=cur,
            )

        return jsonify({"ok": True, **(result or {})}), 200

    except Exception as e:
        current_app.logger.exception("asset_tax_backfill_profiles failed")
        return _json_error(str(e), 400)


@bp_asset_tax.route(
    "/api/companies/<int:company_id>/asset-tax/profiles/<int:profile_id>",
    methods=["PATCH", "OPTIONS"],
)
@require_auth
def api_asset_tax_update_profile(company_id: int, profile_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _asset_tax_user()

    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    payload = request.get_json(silent=True) or {}

    try:
        item = db_service.asset_tax_update_profile(
            company_id,
            profile_id,
            payload,
        )

        if not item:
            return _json_error("Asset tax profile not found", 404)

        return jsonify({"ok": True, "item": item}), 200

    except Exception as e:
        current_app.logger.exception("asset_tax_update_profile failed")
        return _json_error(str(e), 400)


@bp_asset_tax.route(
    "/api/companies/<int:company_id>/asset-tax/rules",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_asset_tax_rules(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _asset_tax_user()

    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    tax_authority_id = request.args.get("tax_authority_id")
    tax_authority_id = int(tax_authority_id) if tax_authority_id else None

    try:
        items = db_service.asset_tax_get_rules(tax_authority_id=tax_authority_id)
        return jsonify({"ok": True, "items": items}), 200
    except Exception as e:
        current_app.logger.exception("asset_tax_rules failed")
        return _json_error(str(e), 400)


@bp_asset_tax.route(
    "/api/companies/<int:company_id>/asset-tax/authorities",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_asset_tax_authorities(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _asset_tax_user()

    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        items = db_service.asset_tax_get_authorities()

        return jsonify({"ok": True, "items": items}), 200
    except Exception as e:
        current_app.logger.exception("asset_tax_authorities failed")
        return _json_error(str(e), 400)
    
@bp_asset_tax.route(
    "/api/companies/<int:company_id>/asset-tax/runs",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_asset_tax_runs(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _asset_tax_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        if request.method == "GET":
            items = db_service.asset_tax_list_runs(company_id)
            return jsonify({"ok": True, "items": items}), 200

        payload = request.get_json(silent=True) or {}
        item = db_service.asset_tax_create_run(company_id, payload)
        return jsonify({"ok": True, "item": item}), 201

    except Exception as e:
        current_app.logger.exception("asset_tax_runs failed")
        return _json_error(str(e), 400)


@bp_asset_tax.route(
    "/api/companies/<int:company_id>/asset-tax/runs/<int:run_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_asset_tax_get_run(company_id: int, run_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _asset_tax_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        item = db_service.asset_tax_get_run(company_id, run_id)
        return jsonify({"ok": True, **item}), 200
    except Exception as e:
        current_app.logger.exception("asset_tax_get_run failed")
        return _json_error(str(e), 400)


@bp_asset_tax.route(
    "/api/companies/<int:company_id>/asset-tax/runs/<int:run_id>/calculate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_asset_tax_calculate_run(company_id: int, run_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _asset_tax_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        result = db_service.asset_tax_calculate_run(company_id, run_id)
        return jsonify({"ok": True, **result}), 200
    except Exception as e:
        current_app.logger.exception("asset_tax_calculate_run failed")
        return _json_error(str(e), 400)
    
@bp_asset_tax.route(
    "/api/companies/<int:company_id>/asset-tax/reconciliation",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_asset_tax_reconciliation(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _asset_tax_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        tax_authority_id = request.args.get("tax_authority_id")
        tax_year = request.args.get("tax_year")

        result = db_service.asset_tax_reconciliation(
            company_id,
            tax_authority_id=int(tax_authority_id) if tax_authority_id else None,
            tax_year=int(tax_year) if tax_year else None,
        )

        return jsonify({"ok": True, **result}), 200

    except Exception as e:
        current_app.logger.exception("asset_tax_reconciliation failed")
        return _json_error(str(e), 400)
    
@bp_asset_tax.route(
    "/api/companies/<int:company_id>/asset-tax/computation",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_asset_tax_computation(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _asset_tax_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        result = db_service.asset_tax_computation(company_id)
        return jsonify({"ok": True, **result}), 200
    except Exception as e:
        current_app.logger.exception("asset_tax_computation failed")
        return _json_error(str(e), 400)


@bp_asset_tax.route(
    "/api/companies/<int:company_id>/asset-tax/deferred-tax",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_asset_tax_deferred_tax(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _asset_tax_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        tax_rate = float(request.args.get("tax_rate") or 27)
        result = db_service.asset_tax_deferred_tax(company_id, tax_rate=tax_rate)
        return jsonify({"ok": True, **result}), 200
    except Exception as e:
        current_app.logger.exception("asset_tax_deferred_tax failed")
        return _json_error(str(e), 400)


@bp_asset_tax.route(
    "/api/companies/<int:company_id>/asset-tax/return-support",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_asset_tax_return_support(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _asset_tax_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        result = db_service.asset_tax_return_support(company_id)
        return jsonify({"ok": True, **result}), 200
    except Exception as e:
        current_app.logger.exception("asset_tax_return_support failed")
        return _json_error(str(e), 400)