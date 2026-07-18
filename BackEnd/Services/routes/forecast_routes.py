from __future__ import annotations

from flask import Blueprint, request, jsonify, make_response, current_app, g

from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.db_service import db_service


forecast_bp = Blueprint("forecast", __name__)


def _corsify(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
    return resp


def _opt():
    return _corsify(make_response("", 204))


def _json_error(msg, code=400):
    return jsonify({"ok": False, "error": str(msg)}), code


def _actor_user_id(payload: dict) -> int | None:
    try:
        return int(payload.get("user_id") or payload.get("sub") or 0) or None
    except Exception:
        return None


def _is_admin(payload: dict) -> bool:
    return str(payload.get("role") or "").strip().lower() == "admin"


def _user_role(payload: dict) -> str:
    return str(payload.get("role") or payload.get("user_role") or "").strip().lower()


def _deny_if_wrong_company(payload, company_id: int):
    role = _user_role(payload)
    if role == "admin":
        return None

    token_company_id = payload.get("token_company_id", payload.get("company_id"))
    try:
        token_company_id = int(token_company_id) if token_company_id is not None else None
    except Exception:
        token_company_id = None

    allowed = payload.get("token_allowed_company_ids") or payload.get("allowed_company_ids") or []
    try:
        allowed = [int(x) for x in allowed]
    except Exception:
        allowed = []

    if token_company_id == int(company_id):
        return None

    if int(company_id) in allowed:
        return None

    return jsonify({"ok": False, "error": "Access denied for this company"}), 403


def _require_planning_view(payload):
    role = _user_role(payload)
    allowed = {"admin", "owner", "cfo", "ceo", "manager", "senior", "accountant", "viewer"}
    if role not in allowed:
        return _json_error("Not allowed to view budgeting and forecasting.", 403)
    return None


def _require_planning_edit(payload):
    role = _user_role(payload)
    allowed = {"admin", "owner", "cfo", "ceo", "manager", "senior", "accountant"}
    if role not in allowed:
        return _json_error("Not allowed to edit budgeting and forecasting.", 403)
    return None


def _require_planning_approve(payload):
    role = _user_role(payload)
    allowed = {"admin", "owner", "cfo", "ceo"}
    if role not in allowed:
        return _json_error("Only owner/CFO/CEO/admin can approve or lock budgets.", 403)
    return None

@forecast_bp.route("/api/companies/<int:company_id>/forecast/budgets", methods=["GET", "POST", "OPTIONS"])
@require_auth
def forecast_budgets_list_or_create(company_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    if request.method == "GET":
        deny = _require_planning_view(payload)
        if deny:
            return deny

        try:
            rows = db_service.forecast_list_budgets(
                company_id,
                status=(request.args.get("status") or "").strip() or None,
            )
            return jsonify({"ok": True, "data": rows})
        except Exception as e:
            current_app.logger.exception("forecast list budgets failed")
            return _json_error(e, 400)

    deny = _require_planning_edit(payload)
    if deny:
        return deny

    try:
        body = request.get_json(force=True) or {}
        row = db_service.forecast_create_budget(
            company_id,
            body,
            user_id=_actor_user_id(payload),
        )
        return jsonify({"ok": True, "data": row}), 201
    except Exception as e:
        current_app.logger.exception("forecast create budget failed")
        return _json_error(e, 400)
    
@forecast_bp.route(
    "/api/companies/<int:company_id>/forecast/budgets/<int:budget_id>/lines",
    methods=["GET", "POST", "PUT", "OPTIONS"],
)
@require_auth
def forecast_budget_lines(company_id, budget_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    try:
        if request.method == "GET":
            deny = _require_planning_view(payload)
            if deny:
                return deny

            rows = db_service.forecast_list_budget_lines(company_id, budget_id)
            return jsonify({"ok": True, "data": rows})

        deny = _require_planning_edit(payload)
        if deny:
            return deny

        body = request.get_json(force=True, silent=True) or {}
        lines = body.get("lines")

        if isinstance(lines, list):
            result = db_service.forecast_bulk_upsert_budget_lines(
                company_id,
                budget_id,
                lines,
                user_id=_actor_user_id(payload),
            )
        else:
            result = db_service.forecast_upsert_budget_line(
                company_id,
                budget_id,
                body,
                user_id=_actor_user_id(payload),
            )

        return jsonify({"ok": True, "data": result})

    except Exception as exc:
        current_app.logger.exception("forecast budget lines failed")
        return _json_error(exc, 400)
    
@forecast_bp.route("/api/companies/<int:company_id>/forecast/budgets/<int:budget_id>", methods=["GET", "PUT", "DELETE", "OPTIONS"])
@require_auth
def forecast_budget_get_update_delete(company_id, budget_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    if request.method == "GET":
        deny = _require_planning_view(payload)
        if deny:
            return deny

        row = db_service.forecast_get_budget(company_id, budget_id)
        if not row:
            return _json_error("Budget not found", 404)
        return jsonify({"ok": True, "data": row})

    if request.method == "PUT":
        deny = _require_planning_edit(payload)
        if deny:
            return deny

        try:
            body = request.get_json(force=True) or {}
            row = db_service.forecast_update_budget(
                company_id,
                budget_id,
                body,
                user_id=_actor_user_id(payload),
            )
            return jsonify({"ok": True, "data": row})
        except Exception as e:
            current_app.logger.exception("forecast update budget failed")
            return _json_error(e, 400)

    deny = _require_planning_approve(payload)
    if deny:
        return deny

    try:
        row = db_service.forecast_delete_budget(
            company_id,
            budget_id,
            user_id=_actor_user_id(payload),
        )
        return jsonify({"ok": True, "data": row})
    except Exception as e:
        current_app.logger.exception("forecast delete budget failed")
        return _json_error(e, 400)

@forecast_bp.route("/api/companies/<int:company_id>/forecast/budgets/<int:budget_id>/lines/<int:line_id>", methods=["DELETE", "OPTIONS"])
@require_auth
def forecast_budget_line_delete(company_id, budget_id, line_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    deny = _require_planning_edit(payload)
    if deny:
        return deny

    try:
        row = db_service.forecast_delete_budget_line(
            company_id,
            budget_id,
            line_id,
            user_id=_actor_user_id(payload),
        )
        return jsonify({"ok": True, "data": row})
    except Exception as e:
        current_app.logger.exception("forecast delete budget line failed")
        return _json_error(e, 400)

@forecast_bp.route("/api/companies/<int:company_id>/forecast/budgets/<int:budget_id>/submit", methods=["POST", "OPTIONS"])
@require_auth
def forecast_budget_submit(company_id, budget_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    deny = _require_planning_edit(payload)
    if deny:
        return deny

    try:
        row = db_service.forecast_submit_budget(company_id, budget_id, user_id=_actor_user_id(payload))
        return jsonify({"ok": True, "data": row})
    except Exception as e:
        return _json_error(e, 400)


@forecast_bp.route("/api/companies/<int:company_id>/forecast/budgets/<int:budget_id>/approve", methods=["POST", "OPTIONS"])
@require_auth
def forecast_budget_approve(company_id, budget_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    deny = _require_planning_approve(payload)
    if deny:
        return deny

    try:
        body = request.get_json(silent=True) or {}
        row = db_service.forecast_approve_budget(
            company_id,
            budget_id,
            user_id=_actor_user_id(payload),
            comment=body.get("comment"),
        )
        return jsonify({"ok": True, "data": row})
    except Exception as e:
        return _json_error(e, 400)


@forecast_bp.route("/api/companies/<int:company_id>/forecast/budgets/<int:budget_id>/lock", methods=["POST", "OPTIONS"])
@require_auth
def forecast_budget_lock(company_id, budget_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    deny = _require_planning_approve(payload)
    if deny:
        return deny

    try:
        row = db_service.forecast_lock_budget(company_id, budget_id, user_id=_actor_user_id(payload))
        return jsonify({"ok": True, "data": row})
    except Exception as e:
        return _json_error(e, 400)

@forecast_bp.route("/api/companies/<int:company_id>/forecast/versions", methods=["GET", "POST", "OPTIONS"])
@require_auth
def forecast_versions_list_or_create(company_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    if request.method == "GET":
        deny = _require_planning_view(payload)
        if deny:
            return deny

        try:
            budget_id = request.args.get("budget_id", type=int)
            rows = db_service.forecast_list_versions(company_id, budget_id=budget_id)
            return jsonify({"ok": True, "data": rows}), 200
        except Exception as e:
            current_app.logger.exception("forecast list versions failed")
            return _json_error(e, 400)

    deny = _require_planning_edit(payload)
    if deny:
        return deny

    try:
        body = request.get_json(force=True) or {}
        row = db_service.forecast_create_version(
            company_id,
            body,
            user_id=_actor_user_id(payload),
        )
        return jsonify({"ok": True, "data": row}), 201
    except Exception as e:
        current_app.logger.exception("forecast create version failed")
        return _json_error(e, 400)


@forecast_bp.route("/api/companies/<int:company_id>/forecast/versions/<int:version_id>", methods=["GET", "OPTIONS"])
@require_auth
def forecast_version_get(company_id, version_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    deny = _require_planning_view(payload)
    if deny:
        return deny

    try:
        row = db_service.forecast_get_version(company_id, version_id)
        if not row:
            return _json_error("Forecast version not found", 404)
        return jsonify({"ok": True, "data": row}), 200
    except Exception as e:
        current_app.logger.exception("forecast get version failed")
        return _json_error(e, 400)


@forecast_bp.route("/api/companies/<int:company_id>/forecast/versions/<int:version_id>/lines", methods=["POST", "PUT", "OPTIONS"])
@require_auth
def forecast_version_lines_upsert(company_id, version_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    deny = _require_planning_edit(payload)
    if deny:
        return deny

    try:
        body = request.get_json(force=True) or {}

        if isinstance(body.get("lines"), list):
            out = db_service.forecast_bulk_upsert_lines(
                company_id,
                version_id,
                body["lines"],
                user_id=_actor_user_id(payload),
            )
        else:
            out = db_service.forecast_upsert_line(
                company_id,
                version_id,
                body,
                user_id=_actor_user_id(payload),
            )

        return jsonify({"ok": True, "data": out}), 200
    except Exception as e:
        current_app.logger.exception("forecast upsert version lines failed")
        return _json_error(e, 400)


@forecast_bp.route("/api/companies/<int:company_id>/forecast/drivers", methods=["GET", "POST", "OPTIONS"])
@require_auth
def forecast_drivers_list_or_create(company_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    if request.method == "GET":
        deny = _require_planning_view(payload)
        if deny:
            return deny

        try:
            budget_id = request.args.get("budget_id", type=int)
            version_id = request.args.get("version_id", type=int)

            rows = db_service.forecast_list_drivers(
                company_id,
                budget_id=budget_id,
                version_id=version_id,
            )
            return jsonify({"ok": True, "data": rows}), 200
        except Exception as e:
            current_app.logger.exception("forecast list drivers failed")
            return _json_error(e, 400)

    deny = _require_planning_edit(payload)
    if deny:
        return deny

    try:
        body = request.get_json(force=True) or {}
        row = db_service.forecast_create_driver(
            company_id,
            body,
            user_id=_actor_user_id(payload),
        )
        return jsonify({"ok": True, "data": row}), 201
    except Exception as e:
        current_app.logger.exception("forecast create driver failed")
        return _json_error(e, 400)


@forecast_bp.route("/api/companies/<int:company_id>/forecast/import-batches", methods=["GET", "POST", "OPTIONS"])
@require_auth
def forecast_import_batches_list_or_create(company_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    if request.method == "GET":
        deny = _require_planning_view(payload)
        if deny:
            return deny

        try:
            rows = db_service.forecast_list_import_batches(company_id)
            return jsonify({"ok": True, "data": rows}), 200
        except Exception as e:
            current_app.logger.exception("forecast list import batches failed")
            return _json_error(e, 400)

    deny = _require_planning_edit(payload)
    if deny:
        return deny

    try:
        body = request.get_json(force=True) or {}
        row = db_service.forecast_create_import_batch(
            company_id,
            body,
            user_id=_actor_user_id(payload),
        )
        return jsonify({"ok": True, "data": row}), 201
    except Exception as e:
        current_app.logger.exception("forecast create import batch failed")
        return _json_error(e, 400)

@forecast_bp.route(
    "/api/companies/<int:company_id>/forecast/capex",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def forecast_capex_list_or_create(
    company_id,
):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}

    deny = _deny_if_wrong_company(
        payload,
        company_id,
    )
    if deny:
        return deny

    if request.method == "GET":
        deny = _require_planning_view(
            payload
        )
        if deny:
            return deny

        try:
            rows = (
                db_service
                .forecast_list_capex_items(
                    company_id,

                    version_id=
                        request.args.get(
                            "version_id",
                            type=int,
                        ),

                    budget_id=
                        request.args.get(
                            "budget_id",
                            type=int,
                        ),
                )
            )

            return jsonify({
                "ok": True,
                "data": rows,
            })

        except Exception as exc:
            current_app.logger.exception(
                "forecast list capex failed"
            )
            return _json_error(exc, 400)

    deny = _require_planning_edit(
        payload
    )
    if deny:
        return deny

    try:
        body = (
            request.get_json(
                force=True,
                silent=True,
            ) or {}
        )

        row = (
            db_service
            .forecast_create_capex_item(
                company_id,
                body,
                user_id=
                    _actor_user_id(
                        payload
                    ),
            )
        )

        return jsonify({
            "ok": True,
            "data": row,
        }), 201

    except Exception as exc:
        current_app.logger.exception(
            "forecast create capex failed"
        )
        return _json_error(exc, 400)

@forecast_bp.route(
    "/api/companies/<int:company_id>/forecast/capex/<int:capex_id>",
    methods=["PUT", "DELETE", "OPTIONS"],
)
@require_auth
def forecast_capex_update_or_delete(
    company_id,
    capex_id,
):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}

    deny = _deny_if_wrong_company(
        payload,
        company_id,
    )
    if deny:
        return deny

    deny = _require_planning_edit(
        payload
    )
    if deny:
        return deny

    try:
        if request.method == "PUT":
            body = (
                request.get_json(
                    force=True,
                    silent=True,
                ) or {}
            )

            row = (
                db_service
                .forecast_update_capex_item(
                    company_id,
                    capex_id,
                    body,
                    user_id=
                        _actor_user_id(
                            payload
                        ),
                )
            )

        else:
            row = (
                db_service
                .forecast_delete_capex_item(
                    company_id,
                    capex_id,
                    user_id=
                        _actor_user_id(
                            payload
                        ),
                )
            )

        return jsonify({
            "ok": True,
            "data": row,
        })

    except Exception as exc:
        current_app.logger.exception(
            "forecast capex action failed"
        )
        return _json_error(exc, 400)

@forecast_bp.route(
    "/api/companies/<int:company_id>/forecast/capex/impacts",
    methods=["GET", "OPTIONS"],
)
@require_auth
def forecast_capex_impacts_route(
    company_id,
):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}

    deny = _deny_if_wrong_company(
        payload,
        company_id,
    )
    if deny:
        return deny

    deny = _require_planning_view(
        payload
    )
    if deny:
        return deny

    try:
        data = (
            db_service
            .forecast_capex_impacts(
                company_id,

                version_id=
                    request.args.get(
                        "version_id",
                        type=int,
                    ),

                budget_id=
                    request.args.get(
                        "budget_id",
                        type=int,
                    ),
            )
        )

        return jsonify({
            "ok": True,
            "data": data,
        })

    except Exception as exc:
        current_app.logger.exception(
            "forecast capex impacts failed"
        )
        return _json_error(exc, 400)
    
@forecast_bp.route(
    "/api/companies/<int:company_id>/forecast/budgets/<int:budget_id>/variance",
    methods=["GET", "OPTIONS"],
)
@require_auth
def forecast_budget_variance_route(company_id, budget_id):
    if request.method == "OPTIONS":
        return _opt()

    payload = request.jwt_payload or {}

    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    deny = _require_planning_view(payload)
    if deny:
        return deny

    try:
        period_start = (
            request.args.get("period_start") or ""
        ).strip() or None

        period_end = (
            request.args.get("period_end") or ""
        ).strip() or None

        version_id = request.args.get(
            "version_id",
            type=int,
        )

        data = db_service.forecast_budget_variance(
            company_id=company_id,
            budget_id=budget_id,
            version_id=version_id,
            period_start=period_start,
            period_end=period_end,
        )

        return jsonify({
            "ok": True,
            "data": data,
        })

    except ValueError as exc:
        return _json_error(exc, 400)

    except Exception as exc:
        current_app.logger.exception(
            "forecast budget variance failed"
        )

        return _json_error(exc, 500)