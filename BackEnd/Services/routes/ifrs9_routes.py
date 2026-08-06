from flask import Blueprint, request, jsonify, g, current_app
from decimal import Decimal
from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.assets.ppe_reporting import _json_error
from BackEnd.Services.utils.http_helpers import _opt
from datetime import datetime
from BackEnd.Services.period_core import (
    resolve_company_period,
)


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

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/instruments/<int:instrument_id>/derecognitions/calculate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_calculate_derecognition(
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

        result = (
            db_service
            .ifrs9_calculate_derecognition(
                company_id,
                instrument_id,
                payload,
            )
        )

        return jsonify({
            "ok": True,
            **result,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_calculate_derecognition failed"
        )

        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/instruments/<int:instrument_id>/derecognitions",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_derecognitions(
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
                .ifrs9_list_derecognitions(
                    company_id,
                    instrument_id,
                )
            )

            return jsonify({
                "ok": True,
                "items": items,
            }), 200

        payload = request.get_json(silent=True) or {}

        item = db_service.ifrs9_create_derecognition(
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
            "ifrs9_derecognitions failed"
        )

        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/derecognitions/<int:derecognition_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_derecognition(
    company_id: int,
    derecognition_id: int,
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
        item = db_service.ifrs9_get_derecognition(
            company_id,
            derecognition_id,
        )

        if not item:
            return _json_error(
                "IFRS 9 derecognition not found",
                404,
            )

        return jsonify({
            "ok": True,
            "item": item,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_derecognition failed"
        )

        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/derecognitions/<int:derecognition_id>/preview-journal",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_derecognition_preview(
    company_id: int,
    derecognition_id: int,
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
            .ifrs9_preview_derecognition_journal(
                company_id,
                derecognition_id,
            )
        )

        return jsonify({
            "ok": True,
            "preview": preview,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_derecognition_preview failed"
        )

        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/derecognitions/<int:derecognition_id>/post",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_post_derecognition(
    company_id: int,
    derecognition_id: int,
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
        result = db_service.ifrs9_post_derecognition(
            company_id,
            derecognition_id,
            user_id=user.get("user_id"),
        )

        return jsonify({
            "ok": True,
            **result,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_post_derecognition failed"
        )

        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/instruments/<int:instrument_id>/fair-value-measurements",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_fair_value_measurements(
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
                .ifrs9_list_fair_value_measurements(
                    company_id,
                    instrument_id,
                )
            )

            return jsonify({
                "ok": True,
                "items": items,
            }), 200

        payload = request.get_json(silent=True) or {}

        item = (
            db_service
            .ifrs9_create_fair_value_measurement(
                company_id,
                instrument_id,
                payload,
                user_id=user.get("user_id"),
            )
        )

        return jsonify({
            "ok": True,
            "item": item,
        }), 201

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_fair_value_measurements failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/instruments/<int:instrument_id>/fair-value-measurements/calculate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_calculate_fair_value(
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

        result = db_service.ifrs9_calculate_fair_value(
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
            "ifrs9_calculate_fair_value failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/fair-value-measurements/<int:measurement_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_fair_value_measurement(
    company_id: int,
    measurement_id: int,
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
        item = (
            db_service
            .ifrs9_get_fair_value_measurement(
                company_id,
                measurement_id,
            )
        )

        if not item:
            return _json_error(
                "IFRS 9 fair-value measurement not found",
                404,
            )

        return jsonify({
            "ok": True,
            "item": item,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_fair_value_measurement failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/fair-value-measurements/<int:measurement_id>/preview-journal",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_fair_value_preview(
    company_id: int,
    measurement_id: int,
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
            .ifrs9_preview_fair_value_journal(
                company_id,
                measurement_id,
            )
        )

        return jsonify({
            "ok": True,
            "preview": preview,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_fair_value_preview failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/fair-value-measurements/<int:measurement_id>/post",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_post_fair_value(
    company_id: int,
    measurement_id: int,
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
            .ifrs9_post_fair_value_measurement(
                company_id,
                measurement_id,
                user_id=user.get("user_id"),
            )
        )

        return jsonify({
            "ok": True,
            **result,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_post_fair_value failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/fair-value-measurements/<int:measurement_id>/reverse",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_reverse_fair_value(
    company_id: int,
    measurement_id: int,
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

        result = (
            db_service
            .ifrs9_reverse_fair_value_measurement(
                company_id,
                measurement_id,
                reason=payload.get("reason"),
                reversal_date=payload.get(
                    "reversal_date"
                ),
                user_id=user.get("user_id"),
            )
        )

        return jsonify({
            "ok": True,
            **result,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_reverse_fair_value failed"
        )
        return _json_error(str(error), 400)

class IFRS9DisclosureRequestProxy:
    def __init__(self, original_request, preset):
        self._request = original_request
        self.args = original_request.args.copy()
        self.args["preset"] = preset

    def get_ifrs9_disclosure_strict(
        self,
        company_id: int,
        *,
        from_date,
        to_date,
        as_of,
        include_closed: bool = True,
        cur=None,
    ):
        schema = self.company_schema(company_id)

        if cur is None:
            with self._conn_cursor() as (_conn, cur):
                return self.get_ifrs9_disclosure_strict(
                    company_id,
                    from_date=from_date,
                    to_date=to_date,
                    as_of=as_of,
                    include_closed=include_closed,
                    cur=cur,
                )

        company_id = int(company_id)

        asset_types = {
            "trade_receivable",
            "loan_receivable",
            "staff_loan",
            "director_loan",
            "deposit_asset",
            "investment",
            "bond",
            "note_receivable",
            "other_financial_asset",
        }

        status_clause = (
            ""
            if include_closed
            else "AND fi.status = 'active'"
        )

        instruments = self.fetch_all(
            f"""
            SELECT
                fi.id,
                fi.instrument_name,
                fi.instrument_reference,
                fi.instrument_type,
                fi.counterparty_name,
                fi.recognition_date,
                fi.derecognition_date,
                fi.currency,
                fi.original_amount,
                fi.carrying_amount,
                fi.measurement_category,
                fi.business_model,
                fi.sppi_result,
                fi.classification_status,
                fi.effective_interest_rate,
                fi.contractual_interest_rate,
                fi.status
            FROM {schema}.ifrs9_financial_instruments fi
            WHERE fi.company_id = %s
            AND fi.recognition_date <= %s::date
            {status_clause}
            ORDER BY
                fi.measurement_category,
                fi.instrument_type,
                fi.instrument_name,
                fi.id
            """,
            (
                company_id,
                as_of,
            ),
            cur=cur,
        ) or []

        categories = {
            "amortised_cost_assets": Decimal("0"),
            "fvoci_assets": Decimal("0"),
            "fvpl_assets": Decimal("0"),
            "amortised_cost_liabilities": Decimal("0"),
            "fvpl_liabilities": Decimal("0"),
            "unclassified": Decimal("0"),
        }

        classification_rows = []

        for item in instruments:
            amount = self._money2(
                item.get("carrying_amount")
            )

            is_asset = (
                item.get("instrument_type")
                in asset_types
            )

            category = (
                item.get("measurement_category")
                or "unclassified"
            )

            if category == "amortised_cost":
                key = (
                    "amortised_cost_assets"
                    if is_asset
                    else "amortised_cost_liabilities"
                )
            elif category == "fvoci":
                key = "fvoci_assets"
            elif category == "fvpl":
                key = (
                    "fvpl_assets"
                    if is_asset
                    else "fvpl_liabilities"
                )
            else:
                key = "unclassified"

            categories[key] += amount

            classification_rows.append({
                **dict(item),
                "is_financial_asset": is_asset,
                "carrying_amount": float(amount),
            })

        ecl_runs = self.fetch_all(
            f"""
            SELECT
                r.id,
                r.reporting_date,
                r.model_id,
                r.total_exposure,
                r.total_ecl,
                r.status,
                r.journal_id,
                r.reversal_journal_id,
                r.meta_json,
                m.model_name,
                m.model_type,
                m.basis
            FROM {schema}.ifrs9_ecl_runs r
            LEFT JOIN {schema}.ifrs9_ecl_models m
            ON m.company_id = r.company_id
            AND m.id = r.model_id
            WHERE r.company_id = %s
            AND r.reporting_date
                BETWEEN %s::date AND %s::date
            AND r.status = 'posted'
            ORDER BY r.reporting_date, r.id
            """,
            (
                company_id,
                from_date,
                to_date,
            ),
            cur=cur,
        ) or []

        opening_allowance = (
            self.ifrs9_allowance_balance_as_at(
                company_id,
                from_date,
                before_date=True,
            )
        )

        closing_allowance = (
            self.ifrs9_allowance_balance_as_at(
                company_id,
                as_of,
            )
        )

        ecl_charges = Decimal("0")
        ecl_reversals = Decimal("0")

        for run in ecl_runs:
            meta = run.get("meta_json") or {}

            movement = self._money2(
                meta.get("movement_ecl")
            )

            if movement > 0:
                ecl_charges += movement
            elif movement < 0:
                ecl_reversals += abs(movement)

        writeoffs = self.fetch_all(
            f"""
            SELECT
                w.id,
                w.writeoff_date,
                w.writeoff_amount,
                w.allowance_used,
                w.additional_loss,
                w.recovered_amount,
                w.reason,
                w.journal_id,
                c.name AS customer_name,
                i.invoice_number
            FROM {schema}.ifrs9_writeoffs w
            LEFT JOIN {schema}.customers c
            ON c.company_id = w.company_id
            AND c.id = w.customer_id
            LEFT JOIN {schema}.invoices i
            ON i.company_id = w.company_id
            AND i.id = w.invoice_id
            WHERE w.company_id = %s
            AND w.status = 'posted'
            AND w.writeoff_date
                BETWEEN %s::date AND %s::date
            ORDER BY w.writeoff_date, w.id
            """,
            (
                company_id,
                from_date,
                to_date,
            ),
            cur=cur,
        ) or []

        allowance_used = sum(
            (
                self._money2(
                    row.get("allowance_used")
                )
                for row in writeoffs
            ),
            Decimal("0"),
        )

        gross_writeoffs = sum(
            (
                self._money2(
                    row.get("writeoff_amount")
                )
                for row in writeoffs
            ),
            Decimal("0"),
        )

        additional_writeoff_loss = sum(
            (
                self._money2(
                    row.get("additional_loss")
                )
                for row in writeoffs
            ),
            Decimal("0"),
        )

        recoveries = self.fetch_all(
            f"""
            SELECT
                r.id,
                r.writeoff_id,
                r.recovery_date,
                r.recovery_amount,
                r.payment_reference,
                r.journal_id,
                r.notes
            FROM {schema}.ifrs9_writeoff_recoveries r
            WHERE r.company_id = %s
            AND r.status = 'posted'
            AND r.recovery_date
                BETWEEN %s::date AND %s::date
            ORDER BY r.recovery_date, r.id
            """,
            (
                company_id,
                from_date,
                to_date,
            ),
            cur=cur,
        ) or []

        total_recoveries = sum(
            (
                self._money2(
                    row.get("recovery_amount")
                )
                for row in recoveries
            ),
            Decimal("0"),
        )

        amortised_cost = self.fetch_all(
            f"""
            SELECT
                r.id,
                r.instrument_id,
                r.period_start,
                r.period_end,
                r.opening_carrying_amount,
                r.interest_income,
                r.interest_expense,
                r.cash_received,
                r.cash_paid,
                r.closing_carrying_amount,
                r.journal_id,
                fi.instrument_name,
                fi.instrument_type
            FROM {schema}.ifrs9_amortised_cost_runs r
            JOIN {schema}.ifrs9_financial_instruments fi
            ON fi.company_id = r.company_id
            AND fi.id = r.instrument_id
            WHERE r.company_id = %s
            AND r.status = 'posted'
            AND r.period_end
                BETWEEN %s::date AND %s::date
            ORDER BY r.period_end, r.id
            """,
            (
                company_id,
                from_date,
                to_date,
            ),
            cur=cur,
        ) or []

        interest_income = sum(
            (
                self._money2(
                    row.get("interest_income")
                )
                for row in amortised_cost
            ),
            Decimal("0"),
        )

        interest_expense = sum(
            (
                self._money2(
                    row.get("interest_expense")
                )
                for row in amortised_cost
            ),
            Decimal("0"),
        )

        modifications = self.fetch_all(
            f"""
            SELECT
                m.id,
                m.instrument_id,
                m.modification_date,
                m.modification_type,
                m.old_carrying_amount,
                m.revised_cashflow_pv,
                m.modification_gain_loss,
                m.substantial_modification,
                m.derecognition_required,
                m.journal_id,
                fi.instrument_name
            FROM {schema}.ifrs9_modifications m
            JOIN {schema}.ifrs9_financial_instruments fi
            ON fi.company_id = m.company_id
            AND fi.id = m.instrument_id
            WHERE m.company_id = %s
            AND m.journal_status = 'posted'
            AND m.modification_date
                BETWEEN %s::date AND %s::date
            ORDER BY m.modification_date, m.id
            """,
            (
                company_id,
                from_date,
                to_date,
            ),
            cur=cur,
        ) or []

        modification_gains = Decimal("0")
        modification_losses = Decimal("0")

        for row in modifications:
            amount = self._money2(
                row.get("modification_gain_loss")
            )

            if amount > 0:
                modification_gains += amount
            elif amount < 0:
                modification_losses += abs(amount)

        derecognitions = self.fetch_all(
            f"""
            SELECT
                d.id,
                d.instrument_id,
                d.derecognition_date,
                d.derecognition_type,
                d.carrying_amount,
                d.consideration_received,
                d.consideration_paid,
                d.allowance_released,
                d.gain_loss,
                d.journal_id,
                fi.instrument_name,
                fi.instrument_type
            FROM {schema}.ifrs9_derecognitions d
            JOIN {schema}.ifrs9_financial_instruments fi
            ON fi.company_id = d.company_id
            AND fi.id = d.instrument_id
            WHERE d.company_id = %s
            AND d.journal_status = 'posted'
            AND d.derecognition_date
                BETWEEN %s::date AND %s::date
            ORDER BY d.derecognition_date, d.id
            """,
            (
                company_id,
                from_date,
                to_date,
            ),
            cur=cur,
        ) or []

        derecognition_gains = Decimal("0")
        derecognition_losses = Decimal("0")

        for row in derecognitions:
            amount = self._money2(
                row.get("gain_loss")
            )

            if amount > 0:
                derecognition_gains += amount
            elif amount < 0:
                derecognition_losses += abs(amount)

        fair_values = self.fetch_all(
            f"""
            SELECT
                fv.id,
                fv.instrument_id,
                fv.valuation_date,
                fv.previous_fair_value,
                fv.current_fair_value,
                fv.gain_loss,
                fv.fair_value_level,
                fv.measurement_category,
                fv.gain_loss_destination,
                fv.valuation_method,
                fv.valuation_source,
                fv.market_reference,
                fv.journal_id,
                fi.instrument_name,
                fi.instrument_type
            FROM {schema}.ifrs9_fair_value_measurements fv
            JOIN {schema}.ifrs9_financial_instruments fi
            ON fi.company_id = fv.company_id
            AND fi.id = fv.instrument_id
            WHERE fv.company_id = %s
            AND fv.journal_status = 'posted'
            AND fv.valuation_date
                BETWEEN %s::date AND %s::date
            ORDER BY fv.valuation_date, fv.id
            """,
            (
                company_id,
                from_date,
                to_date,
            ),
            cur=cur,
        ) or []

        fvpl_gain = Decimal("0")
        fvpl_loss = Decimal("0")
        fvoci_gain = Decimal("0")
        fvoci_loss = Decimal("0")

        fair_value_levels = {
            "level_1": Decimal("0"),
            "level_2": Decimal("0"),
            "level_3": Decimal("0"),
        }

        for row in fair_values:
            movement = self._money2(
                row.get("gain_loss")
            )

            level = row.get("fair_value_level")
            current_value = self._money2(
                row.get("current_fair_value")
            )

            if level in fair_value_levels:
                fair_value_levels[level] += current_value

            destination = row.get(
                "gain_loss_destination"
            )

            if destination == "oci":
                if movement > 0:
                    fvoci_gain += movement
                elif movement < 0:
                    fvoci_loss += abs(movement)
            else:
                if movement > 0:
                    fvpl_gain += movement
                elif movement < 0:
                    fvpl_loss += abs(movement)

        ar_exposure = self.ifrs9_ar_exposure(
            company_id,
            as_of=as_of,
            cur=cur,
        ) or []

        ageing = {
            "current": Decimal("0"),
            "days_1_30": Decimal("0"),
            "days_31_60": Decimal("0"),
            "days_61_90": Decimal("0"),
            "days_91_120": Decimal("0"),
            "over_120": Decimal("0"),
        }

        for row in ar_exposure:
            amount = self._money2(
                row.get("open_balance")
            )

            days = int(
                row.get("days_past_due") or 0
            )

            if days <= 0:
                ageing["current"] += amount
            elif days <= 30:
                ageing["days_1_30"] += amount
            elif days <= 60:
                ageing["days_31_60"] += amount
            elif days <= 90:
                ageing["days_61_90"] += amount
            elif days <= 120:
                ageing["days_91_120"] += amount
            else:
                ageing["over_120"] += amount

        gross_trade_receivables = sum(
            ageing.values(),
            Decimal("0"),
        )

        net_trade_receivables = max(
            gross_trade_receivables
            - closing_allowance,
            Decimal("0"),
        )

        return {
            "basis": {
                "from": str(from_date),
                "to": str(to_date),
                "as_of": str(as_of),
                "include_closed": bool(
                    include_closed
                ),
            },
            "classification": {
                **{
                    key: float(
                        self._money2(value)
                    )
                    for key, value
                    in categories.items()
                },
                "rows": classification_rows,
            },
            "trade_receivables": {
                "gross": float(
                    self._money2(
                        gross_trade_receivables
                    )
                ),
                "loss_allowance": float(
                    self._money2(
                        closing_allowance
                    )
                ),
                "net": float(
                    self._money2(
                        net_trade_receivables
                    )
                ),
                "ageing": {
                    key: float(
                        self._money2(value)
                    )
                    for key, value in ageing.items()
                },
                "exposure_rows": ar_exposure,
            },
            "ecl_reconciliation": {
                "opening_allowance": float(
                    self._money2(
                        opening_allowance
                    )
                ),
                "charges": float(
                    self._money2(ecl_charges)
                ),
                "reversals": float(
                    self._money2(ecl_reversals)
                ),
                "allowance_used_on_writeoffs": float(
                    self._money2(
                        allowance_used
                    )
                ),
                "closing_allowance": float(
                    self._money2(
                        closing_allowance
                    )
                ),
                "gross_writeoffs": float(
                    self._money2(
                        gross_writeoffs
                    )
                ),
                "additional_writeoff_loss": float(
                    self._money2(
                        additional_writeoff_loss
                    )
                ),
                "recoveries": float(
                    self._money2(
                        total_recoveries
                    )
                ),
                "runs": ecl_runs,
                "writeoffs": writeoffs,
                "recovery_rows": recoveries,
            },
            "effective_interest": {
                "interest_income": float(
                    self._money2(
                        interest_income
                    )
                ),
                "interest_expense": float(
                    self._money2(
                        interest_expense
                    )
                ),
                "rows": amortised_cost,
            },
            "modifications": {
                "gains": float(
                    self._money2(
                        modification_gains
                    )
                ),
                "losses": float(
                    self._money2(
                        modification_losses
                    )
                ),
                "rows": modifications,
            },
            "derecognitions": {
                "gains": float(
                    self._money2(
                        derecognition_gains
                    )
                ),
                "losses": float(
                    self._money2(
                        derecognition_losses
                    )
                ),
                "rows": derecognitions,
            },
            "fair_value": {
                "fvpl_gain": float(
                    self._money2(fvpl_gain)
                ),
                "fvpl_loss": float(
                    self._money2(fvpl_loss)
                ),
                "fvoci_gain": float(
                    self._money2(fvoci_gain)
                ),
                "fvoci_loss": float(
                    self._money2(fvoci_loss)
                ),
                "hierarchy": {
                    key: float(
                        self._money2(value)
                    )
                    for key, value
                    in fair_value_levels.items()
                },
                "rows": fair_values,
            },
        }


@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/disclosure",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_disclosure(company_id: int):
    if request.method == "OPTIONS":
        return ("", 204)

    user = _ifrs9_user()

    deny = _deny_if_wrong_company(
        user,
        company_id,
        db_service=db_service,
    )

    if deny:
        return deny

    def parse_date(param_name: str, default=None):
        raw = (
            request.args.get(param_name) or ""
        ).strip()

        if not raw:
            return default

        try:
            return datetime.strptime(
                raw,
                "%Y-%m-%d",
            ).date()
        except Exception:
            raise ValueError(
                f"Invalid {param_name} date. "
                "Use YYYY-MM-DD."
            )

    try:
        preset_raw = (
            request.args.get("preset") or ""
        ).strip().lower()

        preset_map = {
            "previous financial year":
                "prev_year",
            "previous_financial_year":
                "prev_year",
            "prev financial year":
                "prev_year",
            "prev_year":
                "prev_year",
            "last_year":
                "prev_year",

            "this financial year":
                "this_year",
            "current financial year":
                "this_year",
            "this_year":
                "this_year",
            "current_year":
                "this_year",

            "ytd":
                "ytd",
            "this_month":
                "this_month",
            "prev_month":
                "prev_month",
            "this_quarter":
                "this_quarter",
            "prev_quarter":
                "prev_quarter",
        }

        preset = preset_map.get(
            preset_raw,
            preset_raw or "this_year",
        )

        req_for_period = (
            IFRS9DisclosureRequestProxy(
                request,
                preset,
            )
        )

        from_d, to_d, meta = (
            resolve_company_period(
                db_service,
                int(company_id),
                req_for_period,
                mode="range",
            )
        )

        if not from_d or not to_d:
            return jsonify({
                "ok": False,
                "error": (
                    "Unable to resolve period."
                ),
            }), 400

        as_of = parse_date(
            "as_of",
            default=to_d,
        )

        if from_d > to_d:
            raise ValueError(
                "from must be <= to"
            )

        if as_of < from_d:
            raise ValueError(
                "as_of must be >= from"
            )

        include_closed = (
            (
                request.args.get(
                    "include_closed"
                )
                or "1"
            )
            .strip()
            .lower()
            in (
                "1",
                "true",
                "yes",
                "y",
            )
        )

        current_app.logger.warning({
            "ifrs9_disclosure_period": {
                "preset_in": preset_raw,
                "preset_used": preset,
                "from": from_d.isoformat(),
                "to": to_d.isoformat(),
                "as_of": as_of.isoformat(),
                "include_closed":
                    include_closed,
            }
        })

        out = (
            db_service
            .get_ifrs9_disclosure_strict(
                int(company_id),
                from_date=from_d,
                to_date=to_d,
                as_of=as_of,
                include_closed=include_closed,
            )
        )

        return jsonify({
            "ok": True,
            "route_version":
                "ifrs9_disclosure_v1",
            "meta": {
                **(meta or {}),
                "standard": "IFRS 9",
                "statement":
                    "ifrs9_disclosure",
                "as_of":
                    as_of.isoformat(),
            },
            **out,
        }), 200

    except ValueError as error:
        return jsonify({
            "ok": False,
            "error": str(error),
        }), 400

    except Exception:
        current_app.logger.exception(
            "ifrs9 disclosure failed"
        )

        return jsonify({
            "ok": False,
            "error": "Internal server error",
        }), 500

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/general/models",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_general_ecl_models(company_id: int):
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
                .ifrs9_list_general_ecl_models(
                    company_id
                )
            )

            return jsonify({
                "ok": True,
                "items": items,
            }), 200

        payload = request.get_json(silent=True) or {}

        item = (
            db_service
            .ifrs9_create_general_ecl_model(
                company_id,
                payload,
                user_id=user.get("user_id"),
            )
        )

        return jsonify({
            "ok": True,
            "item": item,
        }), 201

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_general_ecl_models failed"
        )
        return _json_error(str(error), 400)
@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/general/models/<int:model_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_ifrs9_general_ecl_model(
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
        result = (
            db_service
            .ifrs9_get_general_ecl_model(
                company_id,
                model_id,
            )
        )

        if not result:
            return _json_error(
                "General ECL model not found",
                404,
            )

        return jsonify({
            "ok": True,
            **result,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_general_ecl_model failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/general/models/<int:model_id>/scenarios",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_general_ecl_scenarios(
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
        payload = request.get_json(silent=True) or {}

        items = (
            db_service
            .ifrs9_save_general_ecl_scenarios(
                company_id,
                model_id,
                payload.get("items") or [],
                user_id=user.get("user_id"),
            )
        )

        return jsonify({
            "ok": True,
            "items": items,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_general_ecl_scenarios failed"
        )
        return _json_error(str(error), 400)
@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/general/models/<int:model_id>/pd-curves",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_general_ecl_pd_curves(
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
        payload = request.get_json(silent=True) or {}

        items = (
            db_service
            .ifrs9_save_general_pd_curves(
                company_id,
                model_id,
                payload.get("items") or [],
                user_id=user.get("user_id"),
            )
        )

        return jsonify({
            "ok": True,
            "items": items,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_general_ecl_pd_curves failed"
        )
        return _json_error(str(error), 400)
@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/ecl/general/models/<int:model_id>/lgd-assumptions",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_general_ecl_lgds(
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
        payload = request.get_json(silent=True) or {}

        items = (
            db_service
            .ifrs9_save_general_lgd_assumptions(
                company_id,
                model_id,
                payload.get("items") or [],
                user_id=user.get("user_id"),
            )
        )

        return jsonify({
            "ok": True,
            "items": items,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "ifrs9_general_ecl_lgds failed"
        )
        return _json_error(str(error), 400)

@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/instruments/<int:instrument_id>/ecl/assessments",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_instrument_ecl_assessments(
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
        schema = db_service.company_schema(
            company_id
        )

        if request.method == "GET":
            profile = db_service.fetch_one(f"""
                SELECT *
                FROM {schema}.ifrs9_credit_risk_profiles
                WHERE company_id=%s
                  AND instrument_id=%s
            """, (
                int(company_id),
                int(instrument_id),
            ))

            assessments = db_service.fetch_all(f"""
                SELECT *
                FROM {schema}.ifrs9_stage_assessments
                WHERE company_id=%s
                  AND instrument_id=%s
                ORDER BY assessment_date DESC, id DESC
            """, (
                int(company_id),
                int(instrument_id),
            ))

            return jsonify({
                "ok": True,
                "profile": profile,
                "items": assessments,
            }), 200

        payload = request.get_json(silent=True) or {}

        item = (
            db_service
            .ifrs9_upsert_credit_risk_profile(
                company_id,
                instrument_id,
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
            "ifrs9_instrument_ecl_assessments failed"
        )
        return _json_error(str(error), 400)
@bp_ifrs9.route(
    "/api/companies/<int:company_id>/ifrs9/instruments/<int:instrument_id>/ecl/stage-assessment",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_ifrs9_stage_assessment(
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

        item = (
            db_service
            .ifrs9_assess_instrument_stage(
                company_id,
                instrument_id,
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
            "ifrs9_stage_assessment failed"
        )
        return _json_error(str(error), 400)