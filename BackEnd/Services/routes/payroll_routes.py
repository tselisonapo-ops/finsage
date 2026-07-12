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

def _payroll_company_guard(company_id: int):
    payload = request.jwt_payload or {}

    return _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )

def _payroll_setup_patch_response(
    company_id: int,
    item_id: int,
    update_method,
    log_name: str,
):
    user_id = _jwt_user_id()

    if not user_id:
        return jsonify({
            "ok": False,
            "error": "AUTH|missing_user_id",
        }), 401

    try:
        out = update_method(
            int(company_id),
            int(item_id),
            _payroll_body(),
        )

        if not out:
            return jsonify({
                "ok": False,
                "error": "Payroll setup item not found",
            }), 404

        return jsonify({
            "ok": True,
            "data": out,
        }), 200

    except Exception as error:
        current_app.logger.exception(log_name)

        return jsonify({
            "ok": False,
            "error": str(error),
        }), 400
    
@payroll_bp.route("/api/companies/<int:company_id>/payroll/settings", methods=["GET", "POST", "PATCH", "OPTIONS"])
@require_auth
def api_payroll_settings(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

   

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
        required = ["first_name", "last_name", "start_date"]
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
    
@payroll_bp.route("/api/companies/<int:company_id>/payroll/bootstrap", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_payroll_bootstrap(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    try:
        out = db_service.payroll_bootstrap(int(company_id))
        return jsonify({"ok": True, "data": out}), 200
    except Exception as e:
        current_app.logger.exception("payroll_bootstrap failed")
        return jsonify({"ok": False, "error": str(e)}), 400

@payroll_bp.route("/api/companies/<int:company_id>/payroll/setup", methods=["GET", "OPTIONS"])
@require_auth
def api_payroll_setup_master(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    try:
        db_service.payroll_ensure_ready(int(company_id))
        out = db_service.payroll_setup_master(int(company_id))
        return jsonify({"ok": True, "data": out}), 200
    except Exception as e:
        current_app.logger.exception("payroll_setup_master failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@payroll_bp.route("/api/companies/<int:company_id>/payroll/employees/<int:employee_id>/benefits", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_payroll_employee_benefits(company_id: int, employee_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    if request.method == "GET":
        try:
            items = db_service.payroll_employee_benefits_list(int(company_id), int(employee_id))
            return jsonify({"ok": True, "items": items}), 200
        except Exception as e:
            current_app.logger.exception("payroll_employee_benefits_list failed")
            return jsonify({"ok": False, "error": str(e)}), 400

    try:
        body = _payroll_body()
        if not body.get("benefit_type_id") or not body.get("effective_from"):
            return jsonify({"ok": False, "error": "benefit_type_id and effective_from are required"}), 400

        out = db_service.payroll_employee_benefit_create(int(company_id), int(employee_id), body)
        return jsonify({"ok": True, "data": out}), 201
    except Exception as e:
        current_app.logger.exception("payroll_employee_benefit_create failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@payroll_bp.route("/api/companies/<int:company_id>/payroll/employees/<int:employee_id>/leave", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_payroll_employee_leave(company_id: int, employee_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    if request.method == "GET":
        try:
            items = db_service.payroll_employee_leave_list(int(company_id), int(employee_id))
            return jsonify({"ok": True, "items": items}), 200
        except Exception as e:
            current_app.logger.exception("payroll_employee_leave_list failed")
            return jsonify({"ok": False, "error": str(e)}), 400

    try:
        body = _payroll_body()
        required = ["leave_type_id", "date_from", "date_to"]
        missing = [k for k in required if not body.get(k)]
        if missing:
            return jsonify({"ok": False, "error": f"Missing required fields: {', '.join(missing)}"}), 400

        out = db_service.payroll_leave_request_create(int(company_id), int(employee_id), body)
        return jsonify({"ok": True, "data": out}), 201
    except Exception as e:
        current_app.logger.exception("payroll_leave_request_create failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@payroll_bp.route("/api/companies/<int:company_id>/payroll/employees/<int:employee_id>/loans", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_payroll_employee_loans(company_id: int, employee_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    if request.method == "GET":
        try:
            items = db_service.payroll_employee_loans_list(int(company_id), int(employee_id))
            return jsonify({"ok": True, "items": items}), 200
        except Exception as e:
            current_app.logger.exception("payroll_employee_loans_list failed")
            return jsonify({"ok": False, "error": str(e)}), 400

    try:
        body = _payroll_body()
        required = ["loan_no", "principal_amount", "repayment_amount", "start_date"]
        missing = [k for k in required if not body.get(k)]
        if missing:
            return jsonify({"ok": False, "error": f"Missing required fields: {', '.join(missing)}"}), 400

        out = db_service.payroll_employee_loan_create(int(company_id), int(employee_id), body)
        return jsonify({"ok": True, "data": out}), 201
    except Exception as e:
        current_app.logger.exception("payroll_employee_loan_create failed")
        return jsonify({"ok": False, "error": str(e)}), 400

@payroll_bp.route("/api/companies/<int:company_id>/payroll/runs", methods=["GET", "POST", "OPTIONS"])
@require_auth
def api_payroll_runs(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    if request.method == "GET":
        try:
            return jsonify({"ok": True, "items": db_service.payroll_runs_list(company_id)}), 200
        except Exception as e:
            current_app.logger.exception("payroll_runs_list failed")
            return jsonify({"ok": False, "error": str(e)}), 400

    try:
        body = _payroll_body()
        if not body.get("pay_calendar_id"):
            return jsonify({"ok": False, "error": "pay_calendar_id is required"}), 400

        out = db_service.payroll_run_create(
            company_id,
            int(body["pay_calendar_id"]),
        )

        return jsonify({
            "ok": True,
            "data": out,
            "already_existed": bool(
                out.get("already_existed")
            ),
        }), 200 if out.get("already_existed") else 201
    except Exception as e:
        current_app.logger.exception("payroll_run_create failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@payroll_bp.route("/api/companies/<int:company_id>/payroll/runs/<int:run_id>", methods=["GET", "OPTIONS"])
@require_auth
def api_payroll_run_get(company_id: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    try:
        out = db_service.payroll_run_get(company_id, run_id)
        if not out:
            return jsonify({"ok": False, "error": "Payroll run not found"}), 404
        return jsonify({"ok": True, "data": out}), 200
    except Exception as e:
        current_app.logger.exception("payroll_run_get failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@payroll_bp.route("/api/companies/<int:company_id>/payroll/runs/<int:run_id>/calculate", methods=["POST", "OPTIONS"])
@require_auth
def api_payroll_run_calculate(company_id: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    try:
        out = db_service.payroll_run_calculate(company_id, run_id)
        return jsonify({"ok": True, "data": out}), 200
    except Exception as e:
        current_app.logger.exception("payroll_run_calculate failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@payroll_bp.route("/api/companies/<int:company_id>/payroll/runs/<int:run_id>/post", methods=["POST", "OPTIONS"])
@require_auth
def api_payroll_run_post(company_id: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    user_id = _jwt_user_id()

    try:
        out = db_service.payroll_run_post(company_id, run_id, user_id=user_id)
        return jsonify({"ok": True, "data": out}), 200
    except Exception as e:
        current_app.logger.exception("payroll_run_post failed")
        return jsonify({"ok": False, "error": str(e)}), 400

@payroll_bp.route("/api/companies/<int:company_id>/payroll/runs/<int:run_id>/journal-preview", methods=["GET", "OPTIONS"])
@require_auth
def api_payroll_run_journal_preview(company_id: int, run_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    try:
        out = db_service.payroll_run_journal_preview(int(company_id), int(run_id))
        return jsonify({"ok": True, "data": out}), 200
    except Exception as e:
        current_app.logger.exception("payroll_run_journal_preview failed")
        return jsonify({"ok": False, "error": str(e)}), 400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/calendars/generate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_payroll_calendars_generate(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}

    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )

    if deny:
        return deny

    user_id = _jwt_user_id()

    if not user_id:
        return jsonify({
            "ok": False,
            "error": "AUTH|missing_user_id",
        }), 401

    try:
        body = _payroll_body()

        periods = body.get("periods")
        from_month = body.get("from_month")

        items = db_service.payroll_calendars_generate(
            int(company_id),
            periods=int(periods) if periods else None,
            from_month=from_month,
        )

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="payroll",
                action="generate_payroll_calendars",
                severity="info",
                entity_type="payroll_pay_calendar",
                entity_id=None,
                entity_ref=f"PAYROLL-CALENDARS-{company_id}",
                before_json={},
                after_json={
                    "count": len(items),
                    "periods": periods,
                    "from_month": from_month,
                },
                message=(
                    f"Generated {len(items)} payroll periods"
                ),
                source="api",
            )
        except Exception:
            current_app.logger.exception(
                "audit_log failed in "
                "api_payroll_calendars_generate"
            )

        return jsonify({
            "ok": True,
            "items": items,
            "count": len(items),
        }), 201

    except Exception as e:
        current_app.logger.exception(
            "payroll_calendars_generate failed"
        )

        return jsonify({
            "ok": False,
            "error": str(e),
        }), 400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/setup/departments",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_payroll_departments(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)

    if deny:
        return deny

    try:
        if request.method == "GET":
            items = db_service.payroll_departments_list(
                int(company_id)
            )

            return jsonify({
                "ok": True,
                "items": items,
            }), 200

        user_id = _jwt_user_id()

        if not user_id:
            return jsonify({
                "ok": False,
                "error": "AUTH|missing_user_id",
            }), 401

        out = db_service.payroll_department_create(
            int(company_id),
            _payroll_body(),
        )

        return jsonify({
            "ok": True,
            "data": out,
        }), 201

    except Exception as e:
        current_app.logger.exception(
            "api_payroll_departments failed"
        )

        return jsonify({
            "ok": False,
            "error": str(e),
        }), 400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/setup/positions",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_payroll_positions(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)

    if deny:
        return deny

    try:
        if request.method == "GET":
            items = db_service.payroll_positions_list(
                int(company_id)
            )

            return jsonify({
                "ok": True,
                "items": items,
            }), 200

        out = db_service.payroll_position_create(
            int(company_id),
            _payroll_body(),
        )

        return jsonify({
            "ok": True,
            "data": out,
        }), 201

    except Exception as e:
        current_app.logger.exception(
            "api_payroll_positions failed"
        )

        return jsonify({
            "ok": False,
            "error": str(e),
        }), 400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/setup/earning-types",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_payroll_earning_types(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)

    if deny:
        return deny

    try:
        if request.method == "GET":
            setup = db_service.payroll_setup_master(
                int(company_id)
            )

            return jsonify({
                "ok": True,
                "items": setup.get("earning_types", []),
            }), 200

        out = db_service.payroll_earning_type_create(
            int(company_id),
            _payroll_body(),
        )

        return jsonify({
            "ok": True,
            "data": out,
        }), 201

    except Exception as e:
        current_app.logger.exception(
            "api_payroll_earning_types failed"
        )

        return jsonify({
            "ok": False,
            "error": str(e),
        }), 400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/setup/deduction-types",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_payroll_deduction_types(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)

    if deny:
        return deny

    try:
        if request.method == "GET":
            setup = db_service.payroll_setup_master(
                int(company_id)
            )

            return jsonify({
                "ok": True,
                "items": setup.get("deduction_types", []),
            }), 200

        out = db_service.payroll_deduction_type_create(
            int(company_id),
            _payroll_body(),
        )

        return jsonify({
            "ok": True,
            "data": out,
        }), 201

    except Exception as e:
        current_app.logger.exception(
            "api_payroll_deduction_types failed"
        )

        return jsonify({
            "ok": False,
            "error": str(e),
        }), 400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/setup/contribution-types",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_payroll_contribution_types(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)

    if deny:
        return deny

    try:
        if request.method == "GET":
            setup = db_service.payroll_setup_master(
                int(company_id)
            )

            return jsonify({
                "ok": True,
                "items": setup.get(
                    "contribution_types",
                    [],
                ),
            }), 200

        out = db_service.payroll_contribution_type_create(
            int(company_id),
            _payroll_body(),
        )

        return jsonify({
            "ok": True,
            "data": out,
        }), 201

    except Exception as e:
        current_app.logger.exception(
            "api_payroll_contribution_types failed"
        )

        return jsonify({
            "ok": False,
            "error": str(e),
        }), 400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/setup/benefit-types",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_payroll_benefit_types(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)

    if deny:
        return deny

    try:
        if request.method == "GET":
            setup = db_service.payroll_setup_master(
                int(company_id)
            )

            return jsonify({
                "ok": True,
                "items": setup.get("benefit_types", []),
            }), 200

        out = db_service.payroll_benefit_type_create(
            int(company_id),
            _payroll_body(),
        )

        return jsonify({
            "ok": True,
            "data": out,
        }), 201

    except Exception as e:
        current_app.logger.exception(
            "api_payroll_benefit_types failed"
        )

        return jsonify({
            "ok": False,
            "error": str(e),
        }), 400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/gl-mappings",
    methods=["GET", "POST", "PATCH", "OPTIONS"],
)
@require_auth
def api_payroll_gl_mappings(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)

    if deny:
        return deny

    try:
        if request.method == "GET":
            items = db_service.payroll_mappings_list(
                int(company_id)
            )

            return jsonify({
                "ok": True,
                "items": items,
            }), 200

        body = _payroll_body()

        mappings = (
            body.get("mappings")
            if isinstance(body, dict)
            else None
        )

        if not isinstance(mappings, list):
            return jsonify({
                "ok": False,
                "error": "mappings must be an array",
            }), 400

        items = db_service.payroll_mappings_upsert(
            int(company_id),
            mappings,
        )

        return jsonify({
            "ok": True,
            "items": items,
        }), 200

    except Exception as e:
        current_app.logger.exception(
            "api_payroll_gl_mappings failed"
        )

        return jsonify({
            "ok": False,
            "error": str(e),
        }), 400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/setup/earning-types/<int:item_id>",
    methods=["PATCH", "OPTIONS"],
)
@require_auth
def api_payroll_earning_type_update(
    company_id: int,
    item_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)
    if deny:
        return deny

    return _payroll_setup_patch_response(
        company_id,
        item_id,
        db_service.payroll_earning_type_update,
        "payroll_earning_type_update failed",
    )

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/setup/deduction-types/<int:item_id>",
    methods=["PATCH", "OPTIONS"],
)
@require_auth
def api_payroll_deduction_type_update(
    company_id: int,
    item_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)
    if deny:
        return deny

    return _payroll_setup_patch_response(
        company_id,
        item_id,
        db_service.payroll_deduction_type_update,
        "payroll_deduction_type_update failed",
    )

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/setup/contribution-types/<int:item_id>",
    methods=["PATCH", "OPTIONS"],
)
@require_auth
def api_payroll_contribution_type_update(
    company_id: int,
    item_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)
    if deny:
        return deny

    return _payroll_setup_patch_response(
        company_id,
        item_id,
        db_service.payroll_contribution_type_update,
        "payroll_contribution_type_update failed",
    )

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/setup/benefit-types/<int:item_id>",
    methods=["PATCH", "OPTIONS"],
)
@require_auth
def api_payroll_benefit_type_update(
    company_id: int,
    item_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)
    if deny:
        return deny

    return _payroll_setup_patch_response(
        company_id,
        item_id,
        db_service.payroll_benefit_type_update,
        "payroll_benefit_type_update failed",
    )

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/employees/"
    "<int:employee_id>/pay-setup",
    methods=["GET", "POST", "PATCH", "OPTIONS"],
)
@require_auth
def api_payroll_employee_pay_setup(
    company_id: int,
    employee_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)

    if deny:
        return deny

    company_id = int(company_id)
    employee_id = int(employee_id)

    try:
        employee = db_service.payroll_employee_get(
            company_id,
            employee_id,
        )

        if not employee:
            return jsonify({
                "ok": False,
                "error": "Payroll employee not found",
            }), 404

        if request.method == "GET":
            out = db_service.payroll_employee_pay_setup_get(
                company_id,
                employee_id,
            )

            return jsonify({
                "ok": True,
                "data": out or {},
            }), 200

        user_id = _jwt_user_id()

        if not user_id:
            return jsonify({
                "ok": False,
                "error": "AUTH|missing_user_id",
            }), 401

        body = _payroll_body()

        required = [
            "pay_basis",
            "effective_from",
        ]

        missing = [
            field
            for field in required
            if not body.get(field)
        ]

        if missing:
            return jsonify({
                "ok": False,
                "error": (
                    "Missing required fields: "
                    + ", ".join(missing)
                ),
            }), 400

        out = db_service.payroll_employee_pay_setup_upsert(
            company_id,
            employee_id,
            body,
        )

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="payroll",
                action="upsert_employee_pay_setup",
                severity="info",
                entity_type="payroll_employee_pay_setup",
                entity_id=str(out.get("id"))
                if out.get("id")
                else None,
                entity_ref=str(employee_id),
                before_json={},
                after_json=out,
                message=(
                    "Updated employee payroll remuneration setup"
                ),
                source="api",
            )
        except Exception:
            current_app.logger.exception(
                "audit_log failed in "
                "api_payroll_employee_pay_setup"
            )

        return jsonify({
            "ok": True,
            "data": out,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "api_payroll_employee_pay_setup failed"
        )

        return jsonify({
            "ok": False,
            "error": str(error),
        }), 400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/tax-context",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_payroll_tax_context(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        payment_date = (
            request.args.get("payment_date")
            or None
        )

        out = db_service.payroll_company_tax_context(
            int(company_id),
            payment_date,
        )

        return jsonify({
            "ok": True,
            "data": out,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "api_payroll_tax_context failed"
        )

        return jsonify({
            "ok": False,
            "error": str(error),
        }), 400