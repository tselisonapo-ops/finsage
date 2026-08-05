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

    payload = request.get_json(silent=True) or {}

    try:
        result = db_service.ifrs9_create_eir_terms(
            company_id,
            instrument_id,
            payload,
            user_id=user.get("user_id"),
        )

        return jsonify({
            "ok": True,
            **result,
        }), 201

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

        item = db_service.ifrs9_create_modification(
            company_id,
            instrument_id,
            payload,
            user_id=user.get("user_id"),
        )

        return jsonify({
            "ok": True,
            "item": item,
        }), 201
    
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
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        if request.method == "GET":
            items = db_service.ifrs9_get_account_mappings(
                company_id
            )
            return jsonify({
                "ok": True,
                "items": items,
            }), 200

        payload = request.get_json(silent=True) or {}
        payload["created_by"] = user.get("user_id")

        item = db_service.ifrs9_upsert_account_mapping(
            company_id,
            payload,
        )

        readiness = db_service.ifrs9_coa_readiness(
            company_id
        )

        return jsonify({
            "ok": True,
            "item": item,
            "readiness": readiness,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_coa_mappings failed"
        )
        return _json_error(str(error), 400)
    
@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/runs/<int:run_id>/reverse",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_reverse_ecl_run(company_id: int, run_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )

    if deny:
        return deny

    try:
        payload = request.get_json(silent=True) or {}

        result = db_service.ifrs9_reverse_ecl_run(
            company_id,
            run_id,
            reason=payload.get("reason"),
            reversal_date=payload.get("reversal_date"),
            user_id=user.get("user_id"),
        )

        return jsonify({
            "ok": True,
            **result,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_reverse_ecl_run failed"
        )

        return _json_error(str(error), 400)
    
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

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/calculate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_calculate_ecl(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(user, company_id, db_service=db_service)
    if deny:
        return deny

    try:
        payload = request.get_json(silent=True) or {}
        result = db_service.ifrs9_calculate_trade_receivables_ecl(company_id, payload)
        return jsonify({"ok": True, **result}), 200
    except Exception as e:
        current_app.logger.exception("ifrs9_calculate_ecl failed")
        return _json_error(str(e), 400)
    
@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/writeoffs",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_writeoffs(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        if request.method == "GET":
            items = db_service.ifrs9_list_writeoffs(
                company_id,
                status=request.args.get("status"),
                customer_id=request.args.get("customer_id"),
            )
            return jsonify({
                "ok": True,
                "items": items,
            }), 200

        payload = request.get_json(silent=True) or {}

        item = db_service.ifrs9_create_writeoff(
            company_id,
            payload,
            user_id=user.get("user_id"),
        )

        return jsonify({
            "ok": True,
            "item": item,
        }), 201

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_writeoffs failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/writeoffs/<int:writeoff_id>/preview-journal",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_writeoff_preview(
    company_id: int,
    writeoff_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        preview = db_service.ifrs9_preview_writeoff_journal(
            company_id,
            writeoff_id,
        )

        return jsonify({
            "ok": True,
            "preview": preview,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_writeoff_preview failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/writeoffs/<int:writeoff_id>/recoveries/<int:recovery_id>/post",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_post_writeoff_recovery(
    company_id: int,
    writeoff_id: int,
    recovery_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        result = db_service.ifrs9_post_writeoff_recovery(
            company_id,
            writeoff_id,
            recovery_id,
            user_id=user.get("user_id"),
        )

        return jsonify({
            "ok": True,
            **result,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_post_writeoff_recovery failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/writeoffs/<int:writeoff_id>/post",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_post_writeoff(
    company_id: int,
    writeoff_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        result = db_service.ifrs9_post_writeoff(
            company_id,
            writeoff_id,
            user_id=user.get("user_id"),
        )

        return jsonify({
            "ok": True,
            **result,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_post_writeoff failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/writeoffs/<int:writeoff_id>/recoveries",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_writeoff_recoveries(
    company_id: int,
    writeoff_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        payload = request.get_json(silent=True) or {}

        item = db_service.ifrs9_create_writeoff_recovery(
            company_id,
            writeoff_id,
            payload,
            user_id=user.get("user_id"),
        )

        return jsonify({
            "ok": True,
            "item": item,
        }), 201

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_writeoff_recoveries failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/reconciliation",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_ecl_reconciliation(company_id: int):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        result = db_service.ifrs9_ecl_reconciliation(
            company_id,
            from_date=request.args.get("from"),
            to_date=request.args.get("to"),
            model_id=request.args.get("model_id"),
        )

        return jsonify({
            "ok": True,
            **result,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_ecl_reconciliation failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/reconciliation/snapshot",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_ecl_reconciliation_snapshot(
    company_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        payload = request.get_json(silent=True) or {}

        item = (
            db_service
            .ifrs9_save_ecl_reconciliation_snapshot(
                company_id,
                payload,
                user_id=user.get("user_id"),
            )
        )

        return jsonify({
            "ok": True,
            "item": item,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_ecl_reconciliation_snapshot failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/models/<int:model_id>",
    methods=["GET", "PATCH", "OPTIONS"],
)
@require_auth
def api_ifrs9_get_ecl_model(
    company_id: int,
    model_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )

    if deny:
        return deny

    try:
        if request.method == "GET":
            result = db_service.ifrs9_get_ecl_model(
                company_id,
                model_id,
            )

            if not result:
                return _json_error(
                    "IFRS 9 ECL model not found",
                    404,
                )

            return jsonify({
                "ok": True,
                **result,
            }), 200

        payload = request.get_json(silent=True) or {}

        item = db_service.ifrs9_update_ecl_model(
            company_id,
            model_id,
            payload,
        )

        return jsonify({
            "ok": True,
            "item": item,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_ecl_model failed"
        )

        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/models/<int:model_id>/activate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_activate_ecl_model(
    company_id: int,
    model_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )

    if deny:
        return deny

    try:
        item = db_service.ifrs9_activate_ecl_model(
            company_id,
            model_id,
            user_id=user.get("user_id"),
        )

        return jsonify({
            "ok": True,
            "item": item,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_activate_ecl_model failed"
        )

        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/models/<int:model_id>/deactivate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_deactivate_ecl_model(
    company_id: int,
    model_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )

    if deny:
        return deny

    try:
        item = db_service.ifrs9_deactivate_ecl_model(
            company_id,
            model_id,
            user_id=user.get("user_id"),
        )

        return jsonify({
            "ok": True,
            "item": item,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_deactivate_ecl_model failed"
        )

        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/instruments/<int:instrument_id>/eir/calculate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_calculate_eir(
    company_id: int,
    instrument_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        payload = request.get_json(silent=True) or {}

        result = db_service.ifrs9_calculate_eir(
            company_id,
            instrument_id,
            payload,
        )

        return jsonify({
            "ok": True,
            **result,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_calculate_eir failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/instruments/<int:instrument_id>/amortised-cost/calculate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_calculate_amortised_cost(
    company_id: int,
    instrument_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        payload = request.get_json(silent=True) or {}

        result = db_service.ifrs9_calculate_amortised_cost(
            company_id,
            instrument_id,
            payload,
        )

        return jsonify({
            "ok": True,
            **result,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_calculate_amortised_cost failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/instruments/<int:instrument_id>/amortised-cost/runs",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_amortised_cost_runs(
    company_id: int,
    instrument_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        if request.method == "GET":
            items = (
                db_service
                .ifrs9_list_amortised_cost_runs(
                    company_id,
                    instrument_id,
                )
            )

            return jsonify({
                "ok": True,
                "items": items,
            }), 200

        payload = request.get_json(silent=True) or {}

        item = db_service.ifrs9_create_amortised_cost_run(
            company_id,
            instrument_id,
            payload,
            user_id=user.get("user_id"),
        )

        return jsonify({
            "ok": True,
            "item": item,
        }), 201

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_amortised_cost_runs failed"
        )
        return _json_error(str(error), 400)


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/amortised-cost/runs/<int:run_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_amortised_cost_run(
    company_id: int,
    run_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        item = db_service.ifrs9_get_amortised_cost_run(
            company_id,
            run_id,
        )

        if not item:
            return _json_error(
                "IFRS 9 amortised-cost run not found",
                404,
            )

        return jsonify({
            "ok": True,
            "item": item,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_amortised_cost_run failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/amortised-cost/runs/<int:run_id>/preview-journal",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_amortised_cost_preview(
    company_id: int,
    run_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        preview = (
            db_service
            .ifrs9_preview_amortised_cost_journal(
                company_id,
                run_id,
            )
        )

        return jsonify({
            "ok": True,
            "preview": preview,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_amortised_cost_preview failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/amortised-cost/runs/<int:run_id>/post",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_post_amortised_cost_run(
    company_id: int,
    run_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        result = (
            db_service
            .ifrs9_post_amortised_cost_run(
                company_id,
                run_id,
                user_id=user.get("user_id"),
            )
        )

        return jsonify({
            "ok": True,
            **result,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_post_amortised_cost_run failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/modifications/<int:modification_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_modification(
    company_id: int,
    modification_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        item = db_service.ifrs9_get_modification(
            company_id,
            modification_id,
        )

        if not item:
            return _json_error(
                "IFRS 9 modification not found",
                404,
            )

        return jsonify({
            "ok": True,
            "item": item,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_modification failed"
        )
        return _json_error(str(error), 400)
@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/modifications/<int:modification_id>/preview-journal",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_modification_preview(
    company_id: int,
    modification_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        preview = (
            db_service
            .ifrs9_preview_modification_journal(
                company_id,
                modification_id,
            )
        )

        return jsonify({
            "ok": True,
            "preview": preview,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_modification_preview failed"
        )
        return _json_error(str(error), 400)
@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/modifications/<int:modification_id>/post",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_post_modification(
    company_id: int,
    modification_id: int,
):
    if request.method == "OPTIONS":
        return _opt()

    user = _ifrs9_user()
    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        result = db_service.ifrs9_post_modification(
            company_id,
            modification_id,
            user_id=user.get("user_id"),
        )

        return jsonify({
            "ok": True,
            **result,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_post_modification failed"
        )
        return _json_error(str(error), 400)