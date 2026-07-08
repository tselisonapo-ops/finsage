from flask import Blueprint, request, jsonify, g, current_app

from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.assets.ppe_reporting import _json_error
from BackEnd.Services.utils.http_helpers import _opt


bp_ifrs9 = Blueprint("ifrs9", __name__)


def _ifrs9_user():
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


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/instruments",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_instruments(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        if request.method == "GET":
            instrument_type = request.args.get("instrument_type")
            status = request.args.get("status")

            items = db_service.ifrs9_list_instruments(
                company_id,
                instrument_type=instrument_type,
                status=status,
            )

            return jsonify({"ok": True, "items": items}), 200

        payload = request.get_json(silent=True) or {}
        payload["created_by"] = user.get("user_id")

        item = db_service.ifrs9_create_instrument(company_id, payload)
        return jsonify({"ok": True, "item": item}), 201

    except Exception as e:
        current_app.logger.exception("ifrs9_instruments failed")
        return _json_error(str(e), 400)


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/instruments/<int:instrument_id>",
    methods=["GET", "PATCH", "OPTIONS"],
)
@require_auth
def api_ifrs9_instrument(company_id: int, instrument_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        if request.method == "GET":
            result = db_service.ifrs9_get_instrument(company_id, instrument_id)
            if not result:
                return _json_error("IFRS 9 instrument not found", 404)
            return jsonify({"ok": True, **result}), 200

        payload = request.get_json(silent=True) or {}
        item = db_service.ifrs9_update_instrument(company_id, instrument_id, payload)

        if not item:
            return _json_error("IFRS 9 instrument not found", 404)

        return jsonify({"ok": True, "item": item}), 200

    except Exception as e:
        current_app.logger.exception("ifrs9_instrument failed")
        return _json_error(str(e), 400)


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/instruments/<int:instrument_id>/classify",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_classify_instrument(company_id: int, instrument_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        payload = request.get_json(silent=True) or {}
        payload["approved_by"] = user.get("user_id")

        result = db_service.ifrs9_classify_instrument(company_id, instrument_id, payload)
        return jsonify({"ok": True, **result}), 200

    except Exception as e:
        current_app.logger.exception("ifrs9_classify_instrument failed")
        return _json_error(str(e), 400)


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/instruments/<int:instrument_id>/eir",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_create_eir(company_id: int, instrument_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        payload = request.get_json(silent=True) or {}
        item = db_service.ifrs9_create_eir_terms(company_id, instrument_id, payload)
        return jsonify({"ok": True, "item": item}), 201

    except Exception as e:
        current_app.logger.exception("ifrs9_create_eir failed")
        return _json_error(str(e), 400)


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/sync/loan-payables",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_sync_loan_payables(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        items = db_service.ifrs9_sync_loan_payables(company_id)
        return jsonify({
            "ok": True,
            "created": len(items or []),
            "items": items or [],
        }), 200

    except Exception as e:
        current_app.logger.exception("ifrs9_sync_loan_payables failed")
        return _json_error(str(e), 400)


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/models",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_ecl_models(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        if request.method == "GET":
            items = db_service.ifrs9_list_ecl_models(company_id)
            return jsonify({"ok": True, "items": items}), 200

        payload = request.get_json(silent=True) or {}
        payload["created_by"] = user.get("user_id")

        item = db_service.ifrs9_create_ecl_model(company_id, payload)
        return jsonify({"ok": True, "item": item}), 201

    except Exception as e:
        current_app.logger.exception("ifrs9_ecl_models failed")
        return _json_error(str(e), 400)


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/models/<int:model_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_get_ecl_model(company_id: int, model_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        result = db_service.ifrs9_get_ecl_model(company_id, model_id)
        if not result:
            return _json_error("IFRS 9 ECL model not found", 404)

        return jsonify({"ok": True, **result}), 200

    except Exception as e:
        current_app.logger.exception("ifrs9_get_ecl_model failed")
        return _json_error(str(e), 400)


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/models/<int:model_id>/bands",
    methods=["PUT", "OPTIONS"],
)
@require_auth
def api_ifrs9_set_ecl_bands(company_id: int, model_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        payload = request.get_json(silent=True) or {}
        bands = payload.get("bands") or []

        items = db_service.ifrs9_set_ecl_matrix_bands(company_id, model_id, bands)

        return jsonify({"ok": True, "items": items}), 200

    except Exception as e:
        current_app.logger.exception("ifrs9_set_ecl_bands failed")
        return _json_error(str(e), 400)


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/instruments/<int:instrument_id>/modifications",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_modifications(company_id: int, instrument_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        if request.method == "GET":
            items = db_service.ifrs9_list_modifications(company_id, instrument_id)
            return jsonify({"ok": True, "items": items}), 200

        payload = request.get_json(silent=True) or {}
        payload["created_by"] = user.get("user_id")

        item = db_service.ifrs9_create_modification(company_id, instrument_id, payload)
        return jsonify({"ok": True, "item": item}), 201

    except Exception as e:
        current_app.logger.exception("ifrs9_modifications failed")
        return _json_error(str(e), 400)
    

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/coa/readiness",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_coa_readiness(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        result = db_service.ifrs9_coa_readiness(company_id)
        return jsonify({"ok": True, **result}), 200
    except Exception as e:
        current_app.logger.exception("ifrs9_coa_readiness failed")
        return _json_error(str(e), 400)


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/coa/mappings",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_coa_mappings(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        if request.method == "GET":
            items = db_service.ifrs9_get_account_mappings(company_id)
            return jsonify({"ok": True, "items": items}), 200

        payload = request.get_json(silent=True) or {}
        item = db_service.ifrs9_upsert_account_mapping(company_id, payload)
        return jsonify({"ok": True, "item": item}), 200

    except Exception as e:
        current_app.logger.exception("ifrs9_coa_mappings failed")
        return _json_error(str(e), 400)


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/preview-journal",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_ecl_preview_journal(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        payload = request.get_json(silent=True) or {}

        with db_service._conn_cursor() as (conn, cur):
            preview = db_service.preview_ifrs9_ecl_journal(
                conn,
                company_id,
                data=payload,
            )

        return jsonify({"ok": True, "preview": preview}), 200

    except Exception as e:
        current_app.logger.exception("ifrs9_ecl_preview_journal failed")
        return _json_error(str(e), 400)
    
@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/runs",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_ecl_runs(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        if request.method == "GET":
            items = db_service.ifrs9_list_ecl_runs(company_id)
            return jsonify({"ok": True, "items": items}), 200

        payload = request.get_json(silent=True) or {}
        item = db_service.ifrs9_create_ecl_run(
            company_id,
            payload,
            user_id=user.get("user_id"),
        )
        return jsonify({"ok": True, "item": item}), 201

    except Exception as e:
        current_app.logger.exception("ifrs9_ecl_runs failed")
        return _json_error(str(e), 400)


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/runs/<int:run_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_get_ecl_run(company_id: int, run_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        result = db_service.ifrs9_get_ecl_run(company_id, run_id)
        if not result:
            return _json_error("IFRS 9 ECL run not found", 404)

        return jsonify({"ok": True, **result}), 200

    except Exception as e:
        current_app.logger.exception("ifrs9_get_ecl_run failed")
        return _json_error(str(e), 400)


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/runs/<int:run_id>/preview-journal",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_ecl_run_preview_journal(company_id: int, run_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        preview = db_service.ifrs9_preview_ecl_run_journal(company_id, run_id)
        return jsonify({"ok": True, "preview": preview}), 200

    except Exception as e:
        current_app.logger.exception("ifrs9_ecl_run_preview_journal failed")
        return _json_error(str(e), 400)


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/runs/<int:run_id>/post",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_post_ecl_run(company_id: int, run_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        result = db_service.ifrs9_post_ecl_run(
            company_id,
            run_id,
            user_id=user.get("user_id"),
        )

        return jsonify({"ok": True, **result}), 200

    except Exception as e:
        current_app.logger.exception("ifrs9_post_ecl_run failed")
        return _json_error(str(e), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/ar-exposure",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_ar_exposure(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        items = db_service.ifrs9_ar_exposure(company_id)
        return jsonify({"ok": True, "items": items}), 200

    except Exception as e:
        current_app.logger.exception("ifrs9_ar_exposure failed")
        return _json_error(str(e), 400)


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/sync/trade-receivables",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_sync_trade_receivables(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        created = db_service.ifrs9_sync_trade_receivables(company_id)
        refreshed = db_service.ifrs9_refresh_trade_receivables(company_id)

        return jsonify({
            "ok": True,
            "created": len(created or []),
            "refreshed": len(refreshed or []),
            "items": created or [],
        }), 200

    except Exception as e:
        current_app.logger.exception("ifrs9_sync_trade_receivables failed")
        return _json_error(str(e), 400)
    
@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/discover",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_discover(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        result = db_service.ifrs9_discover_financial_instruments(company_id)
        return jsonify({"ok": True, **result}), 200
    except Exception as e:
        current_app.logger.exception("ifrs9_discover failed")
        return _json_error(str(e), 400)


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/ap-exposure",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_ap_exposure(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        items = db_service.ifrs9_ap_exposure(company_id)
        return jsonify({"ok": True, "items": items}), 200
    except Exception as e:
        current_app.logger.exception("ifrs9_ap_exposure failed")
        return _json_error(str(e), 400)