from flask import Blueprint, request, jsonify, g, current_app, make_response
from BackEnd.Services.auth_middleware import _corsify, require_auth
from .invoice_routes import _deny_if_wrong_company
from BackEnd.Services.db_service import db_service

payroll_bp = Blueprint("payroll", __name__)


def _jwt_user_id():
    payload = getattr(request, "jwt_payload", {}) or {}
    uid = payload.get("user_id") or payload.get("sub")
    return int(uid) if uid is not None else None


def _payroll_body():
    return request.get_json(silent=True) or {}


def _ensure_payroll(company_id: int):
    db_service.ensure_company_payroll(int(company_id))


@payroll_bp.route("/api/companies/<int:company_id>/payroll/settings", methods=["GET", "POST", "PATCH", "OPTIONS"])
@require_auth
def api_payroll_settings(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    _ensure_payroll(company_id)

    if request.method == "GET":
        try:
            out = db_service.payroll_settings_get(int(company_id)) or {}
            return jsonify({"ok": True, "data": out}), 200
        except Exception as e:
            current_app.logger.exception("payroll_settings_get failed")
            return jsonify({"ok": False, "error": str(e)}), 400

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    try:
        body = _payroll_body()
        out = db_service.payroll_settings_upsert(int(company_id), body)

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="payroll",
                action="upsert_payroll_settings",
                severity="info",
                entity_type="payroll_settings",
                entity_id=str(out.get("id")),
                entity_ref=f"PAYROLL-SETTINGS-{company_id}",
                before_json={},
                after_json=out,
                message="Updated payroll settings",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_payroll_settings")

        return jsonify({"ok": True, "data": out}), 200
    except Exception as e:
        current_app.logger.exception("payroll_settings_upsert failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@payroll_bp.route("/api/companies/<int:company_id>/payroll/calendars", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_payroll_calendars(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    _ensure_payroll(company_id)

    if request.method == "GET":
        try:
            items = db_service.payroll_calendars_list(int(company_id))
            return jsonify({"ok": True, "items": items}), 200
        except Exception as e:
            current_app.logger.exception("payroll_calendars_list failed")
            return jsonify({"ok": False, "error": str(e)}), 400

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    try:
        body = _payroll_body()
        required = ["period_start", "period_end", "payment_date"]
        missing = [k for k in required if not body.get(k)]
        if missing:
            return jsonify({"ok": False, "error": f"Missing required fields: {', '.join(missing)}"}), 400

        out = db_service.payroll_calendar_create(int(company_id), body)

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="payroll",
                action="create_payroll_calendar",
                severity="info",
                entity_type="payroll_pay_calendar",
                entity_id=str(out.get("id")),
                entity_ref=f"{out.get('frequency')} {out.get('period_start')} - {out.get('period_end')}",
                before_json={},
                after_json=out,
                message="Created payroll calendar",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_payroll_calendars")

        return jsonify({"ok": True, "data": out}), 201
    except Exception as e:
        current_app.logger.exception("payroll_calendar_create failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@payroll_bp.route("/api/companies/<int:company_id>/payroll/employees", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_payroll_employees(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    _ensure_payroll(company_id)

    if request.method == "GET":
        try:
            status = (request.args.get("status") or "").strip() or None
            items = db_service.payroll_employees_list(int(company_id), status=status)
            return jsonify({"ok": True, "items": items}), 200
        except Exception as e:
            current_app.logger.exception("payroll_employees_list failed")
            return jsonify({"ok": False, "error": str(e)}), 400

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    try:
        body = _payroll_body()
        required = ["employee_no", "first_name", "last_name", "start_date"]
        missing = [k for k in required if not body.get(k)]
        if missing:
            return jsonify({"ok": False, "error": f"Missing required fields: {', '.join(missing)}"}), 400

        out = db_service.payroll_employee_create(int(company_id), body)

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="payroll",
                action="create_payroll_employee",
                severity="info",
                entity_type="payroll_employee",
                entity_id=str(out.get("id")),
                entity_ref=out.get("employee_no"),
                before_json={},
                after_json=out,
                message=f"Created payroll employee {out.get('employee_no')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_payroll_employees")

        return jsonify({"ok": True, "data": out}), 201
    except Exception as e:
        current_app.logger.exception("payroll_employee_create failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@payroll_bp.route("/api/companies/<int:company_id>/payroll/employees/<int:employee_id>", methods=["GET", "PATCH", "OPTIONS"])
@require_auth
def api_payroll_employee(company_id: int, employee_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    _ensure_payroll(company_id)

    if request.method == "GET":
        try:
            out = db_service.payroll_employee_get(int(company_id), int(employee_id))
            if not out:
                return jsonify({"ok": False, "error": "Payroll employee not found"}), 404
            return jsonify({"ok": True, "data": out}), 200
        except Exception as e:
            current_app.logger.exception("payroll_employee_get failed")
            return jsonify({"ok": False, "error": str(e)}), 400

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    try:
        before = db_service.payroll_employee_get(int(company_id), int(employee_id))
        if not before:
            return jsonify({"ok": False, "error": "Payroll employee not found"}), 404

        out = db_service.payroll_employee_update(int(company_id), int(employee_id), _payroll_body())

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="payroll",
                action="update_payroll_employee",
                severity="info",
                entity_type="payroll_employee",
                entity_id=str(employee_id),
                entity_ref=out.get("employee_no"),
                before_json=before,
                after_json=out,
                message=f"Updated payroll employee {out.get('employee_no')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_payroll_employee")

        return jsonify({"ok": True, "data": out, "before": before}), 200
    except Exception as e:
        current_app.logger.exception("payroll_employee_update failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@payroll_bp.route("/api/companies/<int:company_id>/payroll/employees/<int:employee_id>/contracts", methods=["POST", "OPTIONS"])
@require_auth
def api_payroll_contract_create(company_id: int, employee_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    _ensure_payroll(company_id)

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    try:
        body = _payroll_body()
        if not body.get("effective_from"):
            return jsonify({"ok": False, "error": "effective_from is required"}), 400

        out = db_service.payroll_contract_create(int(company_id), int(employee_id), body)

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="payroll",
                action="create_payroll_contract",
                severity="info",
                entity_type="payroll_employee_contract",
                entity_id=str(out.get("id")),
                entity_ref=str(employee_id),
                before_json={},
                after_json=out,
                message=f"Created payroll contract for employee {employee_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in api_payroll_contract_create")

        return jsonify({"ok": True, "data": out}), 201
    except Exception as e:
        current_app.logger.exception("payroll_contract_create failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@payroll_bp.route("/api/companies/<int:company_id>/payroll/employees/<int:employee_id>/tax-profiles", methods=["POST", "OPTIONS"])
@require_auth
def api_payroll_tax_profile_create(company_id: int, employee_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    _ensure_payroll(company_id)

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    try:
        body = _payroll_body()
        if not body.get("effective_from"):
            return jsonify({"ok": False, "error": "effective_from is required"}), 400

        out = db_service.payroll_tax_profile_create(int(company_id), int(employee_id), body)

        return jsonify({"ok": True, "data": out}), 201
    except Exception as e:
        current_app.logger.exception("payroll_tax_profile_create failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@payroll_bp.route("/api/companies/<int:company_id>/payroll/employees/<int:employee_id>/bank-accounts", methods=["POST", "OPTIONS"])
@require_auth
def api_payroll_bank_account_create(company_id: int, employee_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    _ensure_payroll(company_id)

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    try:
        body = _payroll_body()
        required = ["bank_name", "account_name", "account_number"]
        missing = [k for k in required if not body.get(k)]
        if missing:
            return jsonify({"ok": False, "error": f"Missing required fields: {', '.join(missing)}"}), 400

        out = db_service.payroll_bank_account_create(int(company_id), int(employee_id), body)

        return jsonify({"ok": True, "data": out}), 201
    except Exception as e:
        current_app.logger.exception("payroll_bank_account_create failed")
        return jsonify({"ok": False, "error": str(e)}), 400