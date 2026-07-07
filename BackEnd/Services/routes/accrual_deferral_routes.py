from flask import Blueprint, request, jsonify, g, current_app

from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.assets.ppe_reporting import _json_error
from BackEnd.Services.utils.http_helpers import _opt


bp_accrual_deferral = Blueprint("accrual_deferral", __name__)


def _ad_user():
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


@bp_accrual_deferral.route(
    "/api/companies/<int:company_id>/accrual-deferrals/items",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_ad_items(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ad_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        if request.method == "GET":
            item_type = request.args.get("item_type")
            status = request.args.get("status")

            items = db_service.accrual_deferral_list_items(
                company_id,
                item_type=item_type,
                status=status,
            )

            return jsonify({"ok": True, "items": items}), 200

        payload = request.get_json(silent=True) or {}

        item = db_service.accrual_deferral_create_item(
            company_id,
            payload,
            user_id=user.get("user_id"),
        )

        return jsonify({"ok": True, **item}), 201

    except Exception as e:
        current_app.logger.exception("api_ad_items failed")
        return _json_error(str(e), 400)


@bp_accrual_deferral.route(
    "/api/companies/<int:company_id>/accrual-deferrals/items/<int:item_id>",
    methods=["GET", "PATCH", "DELETE", "OPTIONS"],
)
@require_auth
def api_ad_item(company_id: int, item_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ad_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        if request.method == "GET":
            item = db_service.accrual_deferral_get_item(company_id, item_id)

            if not item:
                return _json_error("Accrual/deferral item not found", 404)

            return jsonify({"ok": True, **item}), 200

        if request.method == "PATCH":
            payload = request.get_json(silent=True) or {}

            item = db_service.accrual_deferral_update_item(
                company_id,
                item_id,
                payload,
                user_id=user.get("user_id"),
            )

            if not item:
                return _json_error("Accrual/deferral item not found", 404)

            return jsonify({"ok": True, **item}), 200

        deleted = db_service.accrual_deferral_delete_item(company_id, item_id)

        if not deleted:
            return _json_error(
                "Item not found or cannot be deleted after activation/posting",
                400,
            )

        return jsonify({"ok": True, "deleted": True}), 200

    except Exception as e:
        current_app.logger.exception("api_ad_item failed")
        return _json_error(str(e), 400)


@bp_accrual_deferral.route(
    "/api/companies/<int:company_id>/accrual-deferrals/items/<int:item_id>/schedule/regenerate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ad_regenerate_schedule(company_id: int, item_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ad_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        result = db_service.accrual_deferral_generate_schedule(
            company_id,
            item_id,
        )

        item = db_service.accrual_deferral_get_item(company_id, item_id)

        return jsonify({"ok": True, **result, **(item or {})}), 200

    except Exception as e:
        current_app.logger.exception("api_ad_regenerate_schedule failed")
        return _json_error(str(e), 400)


@bp_accrual_deferral.route(
    "/api/companies/<int:company_id>/accrual-deferrals/runs",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_ad_runs(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ad_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        if request.method == "GET":
            items = db_service.accrual_deferral_list_runs(company_id)
            return jsonify({"ok": True, "items": items}), 200

        payload = request.get_json(silent=True) or {}

        result = db_service.accrual_deferral_create_run(
            company_id,
            payload,
            user_id=user.get("user_id"),
        )

        return jsonify({"ok": True, **result}), 201

    except Exception as e:
        current_app.logger.exception("api_ad_runs failed")
        return _json_error(str(e), 400)


@bp_accrual_deferral.route(
    "/api/companies/<int:company_id>/accrual-deferrals/runs/<int:run_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ad_get_run(company_id: int, run_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ad_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        result = db_service.accrual_deferral_get_run(company_id, run_id)

        if not result:
            return _json_error("Accrual/deferral run not found", 404)

        return jsonify({"ok": True, **result}), 200

    except Exception as e:
        current_app.logger.exception("api_ad_get_run failed")
        return _json_error(str(e), 400)