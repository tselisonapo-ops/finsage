from flask import Blueprint, request, jsonify, g, current_app, make_response
from BackEnd.Services.auth_middleware import _corsify, require_auth
from .invoice_routes import _deny_if_wrong_company
from BackEnd.Services.db_service import db_service
from BackEnd.Services.period_core import resolve_company_period
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

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/attendance",
    methods=["GET","POST","OPTIONS"],
)
@require_auth
def api_payroll_run_attendance(
    company_id:int,
    run_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="GET":
            employee_id=request.args.get("employee_id")

            items=db_service.payroll_attendance_list(
                company_id,
                run_id,
                int(employee_id)
                if employee_id else None,
            )

            return jsonify({
                "ok":True,
                "items":items,
            }),200

        out=db_service.payroll_attendance_upsert(
            company_id,
            run_id,
            _payroll_body(),
            _jwt_user_id(),
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll attendance failed"
        )

        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/attendance/bulk",
    methods=["POST","OPTIONS"],
)
@require_auth
def api_payroll_run_attendance_bulk(
    company_id:int,
    run_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        items=db_service.payroll_attendance_bulk_save(
            company_id,
            run_id,
            _payroll_body(),
            _jwt_user_id(),
        )

        return jsonify({
            "ok":True,
            "items":items,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll attendance bulk save failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/attendance/generate",
    methods=["POST","OPTIONS"],
)
@require_auth
def api_payroll_run_attendance_generate(
    company_id:int,
    run_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        out=db_service.payroll_attendance_generate(
            company_id,
            run_id,
            _payroll_body(),
            _jwt_user_id(),
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll attendance generation failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/attendance-summary",
    methods=["GET","OPTIONS"],
)
@require_auth
def api_payroll_run_attendance_summary(
    company_id:int,
    run_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        out=db_service.payroll_attendance_summary(
            company_id,
            run_id,
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll attendance summary failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/attendance/<int:attendance_id>",
    methods=["DELETE","OPTIONS"],
)
@require_auth
def api_payroll_run_attendance_delete(
    company_id:int,
    run_id:int,
    attendance_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        deleted=db_service.payroll_attendance_delete(
            company_id,
            run_id,
            attendance_id,
        )

        if not deleted:
            return jsonify({
                "ok":False,
                "error":"Attendance record not found",
            }),404

        return jsonify({
            "ok":True,
            "deleted":True,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll attendance delete failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400
    
@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/eligibility",
    methods=["GET","OPTIONS"],
)
@require_auth
def api_payroll_run_eligibility(
    company_id:int,
    run_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        out=db_service.payroll_run_eligibility(
            company_id,
            run_id,
        )
        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll run eligibility failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400
    
@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/period-inputs",
    methods=["GET","POST","OPTIONS"],
)
@require_auth
def api_payroll_run_period_inputs(
    company_id:int,
    run_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="GET":
            employee_id=request.args.get("employee_id")
            status=request.args.get("status")

            items=db_service.payroll_period_inputs_list(
                company_id,
                run_id,
                int(employee_id)
                if employee_id else None,
                status or None,
            )

            return jsonify({
                "ok":True,
                "items":items,
            }),200

        out=db_service.payroll_period_input_save(
            company_id,
            run_id,
            _payroll_body(),
            _jwt_user_id(),
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),201

    except Exception as error:
        current_app.logger.exception(
            "payroll period inputs failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/period-inputs/<int:input_id>",
    methods=["GET","PATCH","DELETE","OPTIONS"],
)
@require_auth
def api_payroll_run_period_input(
    company_id:int,
    run_id:int,
    input_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="GET":
            out=db_service.payroll_period_input_get(
                company_id,
                run_id,
                input_id,
            )

            if not out:
                return jsonify({
                    "ok":False,
                    "error":"Payroll period input not found",
                }),404

            return jsonify({
                "ok":True,
                "data":out,
            }),200

        if request.method=="DELETE":
            deleted=db_service.payroll_period_input_delete(
                company_id,
                run_id,
                input_id,
            )

            if not deleted:
                return jsonify({
                    "ok":False,
                    "error":"Payroll period input not found",
                }),404

            return jsonify({
                "ok":True,
                "deleted":True,
            }),200

        out=db_service.payroll_period_input_save(
            company_id,
            run_id,
            _payroll_body(),
            _jwt_user_id(),
            input_id=input_id,
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll period input failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/period-inputs/"
    "<int:input_id>/<action>",
    methods=["POST","OPTIONS"],
)
@require_auth
def api_payroll_run_period_input_action(
    company_id:int,
    run_id:int,
    input_id:int,
    action:str,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    statuses={
        "approve":"approved",
        "return-to-draft":"draft",
        "reject":"rejected",
        "cancel":"cancelled",
    }

    if action not in statuses:
        return jsonify({
            "ok":False,
            "error":"Unsupported period input action",
        }),404

    try:
        out=db_service.payroll_period_input_set_status(
            company_id,
            run_id,
            input_id,
            statuses[action],
            _jwt_user_id(),
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll period input action failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/period-input-summary",
    methods=["GET","OPTIONS"],
)
@require_auth
def api_payroll_run_period_input_summary(
    company_id:int,
    run_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        out=db_service.payroll_period_input_summary(
            company_id,
            run_id,
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll period input summary failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/validation",
    methods=["GET","OPTIONS"],
)
@require_auth
def api_payroll_run_validation(
    company_id:int,
    run_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        out=db_service.payroll_run_validation(
            company_id,
            run_id,
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll run validation failed"
        )

        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/employees/"
    "<int:employee_id>/validation",
    methods=["GET","OPTIONS"],
)
@require_auth
def api_payroll_employee_validation(
    company_id:int,
    run_id:int,
    employee_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        out=db_service.payroll_employee_validation(
            company_id,
            run_id,
            employee_id,
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll employee validation failed"
        )

        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/submit",
    methods=["POST","OPTIONS"],
)
@require_auth
def api_payroll_run_submit(
    company_id:int,
    run_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        out=db_service.payroll_run_submit(
            company_id,
            run_id,
            _jwt_user_id(),
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll run submit failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/approve",
    methods=["POST","OPTIONS"],
)
@require_auth
def api_payroll_run_approve(
    company_id:int,
    run_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    user_id=_jwt_user_id()

    if not user_id:
        return jsonify({
            "ok":False,
            "error":"AUTH|missing_user_id",
        }),401

    try:
        out=db_service.payroll_run_approve(
            company_id,
            run_id,
            user_id,
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll run approval failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/return-to-draft",
    methods=["POST","OPTIONS"],
)
@require_auth
def api_payroll_run_return_to_draft(
    company_id:int,
    run_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    user_id=_jwt_user_id()

    if not user_id:
        return jsonify({
            "ok":False,
            "error":"AUTH|missing_user_id",
        }),401

    try:
        out=db_service.payroll_run_return_to_draft(
            company_id,
            run_id,
            _payroll_body(),
            user_id,
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll return to draft failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400
    
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

        if not out:
            return jsonify({
                "ok": True,
                "data": {
                    "configured": False,
                    "message": "No active tax year found.",
                },
            }), 200

        tax_year_id = out.get("tax_year_id")

        # ── Fetch brackets for the frontend preview calculator ──
        if tax_year_id:
            out["brackets"] = db_service.payroll_tax_brackets(
                tax_year_id,
                "resident",
            )

            params = db_service.payroll_tax_parameters(
                tax_year_id
            )

            # Flatten parameters into the response
            # so the frontend can read them as top-level keys
            for key, value in (params or {}).items():
                if key not in out:
                    out[key] = value

        out["configured"] = True

        return jsonify({
            "ok": True,
            "data": out,
        }), 200

    except ValueError as error:
        current_app.logger.warning(
            "Payroll tax context unavailable: %s",
            error,
        )

        return jsonify({
            "ok": True,
            "data": {
                "configured": False,
                "message": str(error),
            },
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "api_payroll_tax_context failed"
        )

        return jsonify({
            "ok": False,
            "error": str(error),
        }), 400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/tax-tables/regimes",
    methods=["GET", "OPTIONS"],
)
@require_auth
def api_payroll_tax_regimes(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        items = db_service.payroll_tax_regimes_list()
        return jsonify({"ok": True, "items": items}), 200
    except Exception as e:
        current_app.logger.exception("api_payroll_tax_regimes failed")
        return jsonify({"ok": False, "error": str(e)}), 400


# ═══════════════════════════════════════════════════════════════
#  ROUTE: List tax years (optionally filtered by regime)
# ═══════════════════════════════════════════════════════════════
@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/tax-tables/years",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_payroll_tax_years(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)
    if deny:
        return deny

    if request.method == "GET":
        try:
            regime_id = request.args.get("regime_id")
            items = db_service.payroll_tax_years_list(
                regime_id=int(regime_id) if regime_id else None
            )
            return jsonify({"ok": True, "items": items}), 200
        except Exception as e:
            current_app.logger.exception(
                "api_payroll_tax_years GET failed"
            )
            return jsonify({"ok": False, "error": str(e)}), 400

    # POST — create tax year
    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({
            "ok": False,
            "error": "AUTH|missing_user_id",
        }), 401

    try:
        body = _payroll_body()

        required = [
            "regime_id", "tax_year_label",
            "effective_from", "effective_to",
        ]
        missing = [k for k in required if not body.get(k)]
        if missing:
            return jsonify({
                "ok": False,
                "error": f"Missing required fields: {', '.join(missing)}",
            }), 400

        out = db_service.payroll_tax_year_create(body, user_id=user_id)

        try:
            db_service.audit_log(
                int(company_id),
                actor_user_id=user_id,
                module="payroll",
                action="create_tax_year",
                severity="info",
                entity_type="payroll_tax_year",
                entity_id=str(out.get("id")),
                entity_ref=body.get("tax_year_label"),
                before_json={},
                after_json=out,
                message=f"Created tax year {body.get('tax_year_label')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception(
                "audit_log failed in api_payroll_tax_years"
            )

        return jsonify({"ok": True, "data": out}), 201

    except Exception as e:
        current_app.logger.exception(
            "api_payroll_tax_years POST failed"
        )
        return jsonify({"ok": False, "error": str(e)}), 400


# ═══════════════════════════════════════════════════════════════
#  ROUTE: Update a tax year
# ═══════════════════════════════════════════════════════════════
@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/tax-tables/years/<int:year_id>",
    methods=["PATCH", "OPTIONS"],
)
@require_auth
def api_payroll_tax_year_update(company_id: int, year_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)
    if deny:
        return deny

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({
            "ok": False,
            "error": "AUTH|missing_user_id",
        }), 401

    try:
        before = db_service.payroll_tax_year_get(int(year_id))
        if not before:
            return jsonify({
                "ok": False,
                "error": "Tax year not found",
            }), 404

        out = db_service.payroll_tax_year_update(
            int(year_id), _payroll_body(), user_id=user_id
        )

        try:
            db_service.audit_log(
                int(company_id),
                actor_user_id=user_id,
                module="payroll",
                action="update_tax_year",
                severity="info",
                entity_type="payroll_tax_year",
                entity_id=str(year_id),
                entity_ref=before.get("tax_year_label"),
                before_json=before,
                after_json=out,
                message=f"Updated tax year {before.get('tax_year_label')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception(
                "audit_log failed in api_payroll_tax_year_update"
            )

        return jsonify({
            "ok": True,
            "data": out,
            "before": before,
        }), 200

    except Exception as e:
        current_app.logger.exception(
            "api_payroll_tax_year_update failed"
        )
        return jsonify({"ok": False, "error": str(e)}), 400


# ═══════════════════════════════════════════════════════════════
#  ROUTE: List brackets for a tax year
# ═══════════════════════════════════════════════════════════════
@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/tax-tables/years/<int:year_id>/brackets",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_payroll_tax_brackets(company_id: int, year_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)
    if deny:
        return deny

    if request.method == "GET":
        try:
            items = db_service.payroll_tax_brackets_admin_list(
                int(year_id)
            )
            return jsonify({"ok": True, "items": items}), 200
        except Exception as e:
            current_app.logger.exception(
                "api_payroll_tax_brackets GET failed"
            )
            return jsonify({"ok": False, "error": str(e)}), 400

    # POST — create bracket
    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({
            "ok": False,
            "error": "AUTH|missing_user_id",
        }), 401

    try:
        body = _payroll_body()

        if body.get("marginal_rate") is None:
            return jsonify({
                "ok": False,
                "error": "marginal_rate is required",
            }), 400

        out = db_service.payroll_tax_bracket_create(
            int(year_id), body, user_id=user_id
        )

        return jsonify({"ok": True, "data": out}), 201

    except Exception as e:
        current_app.logger.exception(
            "api_payroll_tax_brackets POST failed"
        )
        return jsonify({"ok": False, "error": str(e)}), 400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "tax-tables/brackets/<int:bracket_id>",
    methods=["PATCH", "DELETE", "OPTIONS"],
)
@require_auth
def api_payroll_tax_bracket(
    company_id: int,
    bracket_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)
    if deny:
        return deny

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({
            "ok": False,
            "error": "AUTH|missing_user_id",
        }), 401

    try:
        if request.method == "DELETE":
            db_service.payroll_tax_bracket_delete(
                int(bracket_id),
                user_id=user_id,
            )
            return jsonify({
                "ok": True,
                "deleted": True,
            }), 200

        out = db_service.payroll_tax_bracket_update(
            int(bracket_id),
            _payroll_body(),
            user_id=user_id,
        )

        if not out:
            return jsonify({
                "ok": False,
                "error": "Bracket not found",
            }), 404

        return jsonify({
            "ok": True,
            "data": out,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "api_payroll_tax_bracket failed"
        )
        return jsonify({
            "ok": False,
            "error": str(error),
        }), 400
# ═══════════════════════════════════════════════════════════════
#  ROUTE: List parameters for a tax year
# ═══════════════════════════════════════════════════════════════
@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/tax-tables/years/<int:year_id>/parameters",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_payroll_tax_parameters(company_id: int, year_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)
    if deny:
        return deny

    if request.method == "GET":
        try:
            items = db_service.payroll_tax_parameters_admin_list(
                int(year_id)
            )
            return jsonify({"ok": True, "items": items}), 200
        except Exception as e:
            current_app.logger.exception(
                "api_payroll_tax_parameters GET failed"
            )
            return jsonify({"ok": False, "error": str(e)}), 400

    # POST — create or update parameter (upsert by key)
    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({
            "ok": False,
            "error": "AUTH|missing_user_id",
        }), 401

    try:
        body = _payroll_body()

        if not body.get("parameter_key"):
            return jsonify({
                "ok": False,
                "error": "parameter_key is required",
            }), 400

        out = db_service.payroll_tax_parameter_upsert(
            int(year_id), body, user_id=user_id
        )

        return jsonify({"ok": True, "data": out}), 201

    except Exception as e:
        current_app.logger.exception(
            "api_payroll_tax_parameters POST failed"
        )
        return jsonify({"ok": False, "error": str(e)}), 400



@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "tax-tables/parameters/<int:param_id>",
    methods=["PATCH", "DELETE", "OPTIONS"],
)
@require_auth
def api_payroll_tax_parameter(
    company_id: int,
    param_id: int,
):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)
    if deny:
        return deny

    user_id = _jwt_user_id()
    if not user_id:
        return jsonify({
            "ok": False,
            "error": "AUTH|missing_user_id",
        }), 401

    try:
        if request.method == "DELETE":
            db_service.payroll_tax_parameter_delete(
                int(param_id),
                user_id=user_id,
            )
            return jsonify({
                "ok": True,
                "deleted": True,
            }), 200

        out = db_service.payroll_tax_parameter_update(
            int(param_id),
            _payroll_body(),
            user_id=user_id,
        )

        if not out:
            return jsonify({
                "ok": False,
                "error": "Parameter not found",
            }), 404

        return jsonify({
            "ok": True,
            "data": out,
        }), 200

    except Exception as error:
        current_app.logger.exception(
            "api_payroll_tax_parameter failed"
        )
        return jsonify({
            "ok": False,
            "error": str(error),
        }), 400
    
# ═══════════════════════════════════════════════════════════════
#  ROUTE: Clone a tax year (brackets + parameters)
# ═══════════════════════════════════════════════════════════════
@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/tax-tables/years/<int:year_id>/clone",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_payroll_tax_year_clone(company_id: int, year_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    deny = _payroll_company_guard(company_id)
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

        required = [
            "tax_year_label", "effective_from", "effective_to",
        ]
        missing = [k for k in required if not body.get(k)]
        if missing:
            return jsonify({
                "ok": False,
                "error": f"Missing required fields: {', '.join(missing)}",
            }), 400

        out = db_service.payroll_tax_year_clone(
            int(year_id), body, user_id=user_id
        )

        try:
            db_service.audit_log(
                int(company_id),
                actor_user_id=user_id,
                module="payroll",
                action="clone_tax_year",
                severity="info",
                entity_type="payroll_tax_year",
                entity_id=str(out.get("id")),
                entity_ref=body.get("tax_year_label"),
                before_json={},
                after_json=out,
                message=f"Cloned tax year to {body.get('tax_year_label')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception(
                "audit_log failed in api_payroll_tax_year_clone"
            )

        return jsonify({"ok": True, "data": out}), 201

    except Exception as e:
        current_app.logger.exception(
            "api_payroll_tax_year_clone failed"
        )
        return jsonify({"ok": False, "error": str(e)}), 400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/audit",
    methods=["GET","OPTIONS"],
)
@require_auth
def api_payroll_run_audit(
    company_id:int,
    run_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        items=db_service.payroll_run_audit_history(
            company_id,
            run_id,
        )

        return jsonify({
            "ok":True,
            "items":items,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll run audit failed"
        )

        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "incentives/plans",
    methods=["GET","POST","OPTIONS"],
)
@require_auth
def api_payroll_incentive_plans(company_id:int):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="GET":
            active_only=(
                request.args.get("active_only")
                in("1","true","yes")
            )

            items=db_service.payroll_incentive_plans_list(
                company_id,
                active_only,
            )

            return jsonify({
                "ok":True,
                "items":items,
            }),200

        out=db_service.payroll_incentive_plan_save(
            company_id,
            _payroll_body(),
            _jwt_user_id(),
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),201

    except Exception as error:
        current_app.logger.exception(
            "payroll incentive plans failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "incentives/plans/<int:plan_id>",
    methods=["GET","PATCH","DELETE","OPTIONS"],
)
@require_auth
def api_payroll_incentive_plan(
    company_id:int,
    plan_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="GET":
            out=db_service.payroll_incentive_plan_get(
                company_id,
                plan_id,
            )

            if not out:
                return jsonify({
                    "ok":False,
                    "error":"Incentive plan not found",
                }),404

            return jsonify({
                "ok":True,
                "data":out,
            }),200

        if request.method=="DELETE":
            deleted=(
                db_service.payroll_incentive_plan_delete(
                    company_id,
                    plan_id,
                )
            )

            return jsonify({
                "ok":True,
                "deleted":deleted,
            }),200

        out=db_service.payroll_incentive_plan_save(
            company_id,
            _payroll_body(),
            _jwt_user_id(),
            plan_id,
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll incentive plan failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "incentives/plans/<int:plan_id>/rules",
    methods=["GET","POST","OPTIONS"],
)
@require_auth
def api_payroll_incentive_rules(
    company_id:int,
    plan_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="GET":
            items=db_service.payroll_incentive_rules_list(
                company_id,
                plan_id,
            )

            return jsonify({
                "ok":True,
                "items":items,
            }),200

        out=db_service.payroll_incentive_rule_save(
            company_id,
            plan_id,
            _payroll_body(),
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),201

    except Exception as error:
        current_app.logger.exception(
            "payroll incentive rules failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "incentives/plans/<int:plan_id>/rules/"
    "<int:rule_id>",
    methods=["PATCH","DELETE","OPTIONS"],
)
@require_auth
def api_payroll_incentive_rule(
    company_id:int,
    plan_id:int,
    rule_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="DELETE":
            deleted=(
                db_service.payroll_incentive_rule_delete(
                    company_id,
                    plan_id,
                    rule_id,
                )
            )

            return jsonify({
                "ok":True,
                "deleted":deleted,
            }),200

        out=db_service.payroll_incentive_rule_save(
            company_id,
            plan_id,
            _payroll_body(),
            rule_id,
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll incentive rule failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "incentives/assignments",
    methods=["GET","POST","OPTIONS"],
)
@require_auth
def api_payroll_incentive_assignments(
    company_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="GET":
            plan_id=request.args.get("plan_id")
            employee_id=request.args.get("employee_id")

            items=(
                db_service
                .payroll_incentive_assignments_list(
                    company_id,
                    plan_id=int(plan_id)
                    if plan_id else None,
                    employee_id=int(employee_id)
                    if employee_id else None,
                )
            )

            return jsonify({
                "ok":True,
                "items":items,
            }),200

        out=(
            db_service
            .payroll_incentive_assignment_save(
                company_id,
                _payroll_body(),
                _jwt_user_id(),
            )
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),201

    except Exception as error:
        current_app.logger.exception(
            "payroll incentive assignments failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "incentives/assignments/<int:assignment_id>",
    methods=["PATCH","DELETE","OPTIONS"],
)
@require_auth
def api_payroll_incentive_assignment(
    company_id:int,
    assignment_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="DELETE":
            deleted=(
                db_service
                .payroll_incentive_assignment_delete(
                    company_id,
                    assignment_id,
                )
            )

            return jsonify({
                "ok":True,
                "deleted":deleted,
            }),200

        out=(
            db_service
            .payroll_incentive_assignment_save(
                company_id,
                _payroll_body(),
                _jwt_user_id(),
                assignment_id,
            )
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll incentive assignment failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "incentives/evaluations",
    methods=["GET","POST","OPTIONS"],
)
@require_auth
def api_payroll_incentive_evaluations(
    company_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="GET":
            employee_id=request.args.get("employee_id")
            plan_id=request.args.get("plan_id")
            status=request.args.get("status")
            date_from=request.args.get("date_from")
            date_to=request.args.get("date_to")

            items=(
                db_service
                .payroll_incentive_evaluations_list(
                    company_id,
                    employee_id=int(employee_id)
                    if employee_id else None,
                    plan_id=int(plan_id)
                    if plan_id else None,
                    status=status or None,
                    date_from=date_from or None,
                    date_to=date_to or None,
                )
            )

            return jsonify({
                "ok":True,
                "items":items,
            }),200

        out=(
            db_service
            .payroll_incentive_evaluation_save(
                company_id,
                _payroll_body(),
                _jwt_user_id(),
            )
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),201

    except Exception as error:
        current_app.logger.exception(
            "payroll incentive evaluations failed"
        )

        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "incentives/evaluations/<int:evaluation_id>",
    methods=["GET","PATCH","DELETE","OPTIONS"],
)
@require_auth
def api_payroll_incentive_evaluation(
    company_id:int,
    evaluation_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="GET":
            out=(
                db_service
                .payroll_incentive_evaluation_get(
                    company_id,
                    evaluation_id,
                )
            )

            if not out:
                return jsonify({
                    "ok":False,
                    "error":
                        "Incentive evaluation not found",
                }),404

            return jsonify({
                "ok":True,
                "data":out,
            }),200

        if request.method=="DELETE":
            deleted=(
                db_service
                .payroll_incentive_evaluation_delete(
                    company_id,
                    evaluation_id,
                )
            )

            if not deleted:
                return jsonify({
                    "ok":False,
                    "error":
                        "Incentive evaluation not found",
                }),404

            return jsonify({
                "ok":True,
                "deleted":True,
            }),200

        out=(
            db_service
            .payroll_incentive_evaluation_save(
                company_id,
                _payroll_body(),
                _jwt_user_id(),
                evaluation_id,
            )
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll incentive evaluation failed"
        )

        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "incentives/evaluations/<int:evaluation_id>/"
    "calculate",
    methods=["POST","OPTIONS"],
)
@require_auth
def api_payroll_incentive_evaluation_calculate(
    company_id:int,
    evaluation_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        out=(
            db_service
            .payroll_incentive_evaluation_calculate(
                company_id,
                evaluation_id,
                _jwt_user_id(),
            )
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "incentive evaluation calculation failed"
        )

        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "incentives/evaluations/<int:evaluation_id>/"
    "<action>",
    methods=["POST","OPTIONS"],
)
@require_auth
def api_payroll_incentive_evaluation_action(
    company_id:int,
    evaluation_id:int,
    action:str,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    allowed={
        "submit",
        "approve",
        "return-to-draft",
        "cancel",
    }

    if action not in allowed:
        return jsonify({
            "ok":False,
            "error":
                "Unsupported incentive evaluation action",
        }),404

    try:
        out=(
            db_service
            .payroll_incentive_evaluation_set_status(
                company_id,
                evaluation_id,
                action,
                _jwt_user_id(),
            )
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "incentive evaluation action failed"
        )

        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "incentives/evaluations/<int:evaluation_id>/"
    "push-to-payroll",
    methods=["POST","OPTIONS"],
)
@require_auth
def api_payroll_incentive_push_to_payroll(
    company_id:int,
    evaluation_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    user_id=_jwt_user_id()

    if not user_id:
        return jsonify({
            "ok":False,
            "error":"AUTH|missing_user_id",
        }),401

    try:
        out=db_service.payroll_incentive_push_to_run(
            company_id,
            evaluation_id,
            _payroll_body(),
            user_id,
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "push incentive to payroll failed"
        )

        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "incentives/evaluations/<int:evaluation_id>/"
    "remove-from-payroll",
    methods=["POST","OPTIONS"],
)
@require_auth
def api_payroll_incentive_remove_from_payroll(
    company_id:int,
    evaluation_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    user_id=_jwt_user_id()

    if not user_id:
        return jsonify({
            "ok":False,
            "error":"AUTH|missing_user_id",
        }),401

    try:
        out=db_service.payroll_incentive_remove_from_run(
            company_id,
            evaluation_id,
            user_id,
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "remove incentive from payroll failed"
        )

        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/payslips",
    methods=["GET","OPTIONS"],
)
@require_auth
def api_payroll_run_payslips(
    company_id:int,
    run_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        items=db_service.payroll_payslips_list(
            company_id,
            run_id,
        )

        return jsonify({
            "ok":True,
            "items":items,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll payslips list failed"
        )

        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/employees/"
    "<int:employee_id>/payslip",
    methods=["GET","OPTIONS"],
)
@require_auth
def api_payroll_employee_payslip(
    company_id:int,
    run_id:int,
    employee_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        out=db_service.payroll_payslip_get(
            company_id,
            run_id,
            employee_id,
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except ValueError as error:
        message=str(error)
        status=404 if(
            "not found" in message.lower()
            or "not calculated" in message.lower()
        )else 400

        return jsonify({
            "ok":False,
            "error":message,
        }),status

    except Exception as error:
        current_app.logger.exception(
            "payroll employee payslip failed"
        )

        return jsonify({
            "ok":False,
            "error":str(error),
        }),400 

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "reports/<report_key>",
    methods=["GET","OPTIONS"],
)
@require_auth
def api_payroll_report(
    company_id:int,
    report_key:str,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        filters={
            "run_id":
                request.args.get("run_id") or None,
            "department_id":
                request.args.get("department_id") or None,
            "employee_id":
                request.args.get("employee_id") or None,
            "date_from":
                request.args.get("date_from") or None,
            "date_to":
                request.args.get("date_to") or None,
        }

        out=db_service.payroll_report_data(
            company_id,
            report_key,
            filters,
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception as error:
        current_app.logger.exception(
            "payroll report generation failed"
        )

        return jsonify({
            "ok":False,
            "error":str(error),
        }),400
    
@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/reconciliation",
    methods=["GET","OPTIONS"],
)
@require_auth
def api_payroll_run_reconciliation(
    company_id:int,
    run_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        out=db_service.payroll_run_reconcile(
            company_id,
            run_id,
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll run reconciliation failed"
        )

        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/reversal-preview",
    methods=["GET","OPTIONS"],
)
@require_auth
def api_payroll_run_reversal_preview(
    company_id:int,
    run_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        out=db_service.payroll_run_reversal_preview(
            company_id,
            run_id,
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll reversal preview failed"
        )

        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "runs/<int:run_id>/reverse",
    methods=["POST","OPTIONS"],
)
@require_auth
def api_payroll_run_reverse(
    company_id:int,
    run_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    user_id=_jwt_user_id()

    if not user_id:
        return jsonify({
            "ok":False,
            "error":"AUTH|missing_user_id",
        }),401

    try:
        out=db_service.payroll_run_reverse(
            company_id,
            run_id,
            _payroll_body(),
            user_id,
        )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll run reversal failed"
        )

        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "statutory/mappings",
    methods=["GET","POST","OPTIONS"],
)
@require_auth
def api_payroll_statutory_mappings(company_id:int):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="GET":
            items=db_service.payroll_statutory_mappings_list(
                company_id,
                request.args.get("authority_code"),
                request.args.get("return_type"),
            )
            return jsonify({
                "ok":True,
                "items":items,
            }),200

        out=db_service.payroll_statutory_mapping_save(
            company_id,
            _payroll_body(),
        )
        return jsonify({
            "ok":True,
            "data":out,
        }),201

    except Exception as error:
        current_app.logger.exception(
            "payroll statutory mappings failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "statutory/mappings/<int:mapping_id>",
    methods=["PATCH","DELETE","OPTIONS"],
)
@require_auth
def api_payroll_statutory_mapping(
    company_id:int,
    mapping_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="DELETE":
            deleted=db_service.payroll_statutory_mapping_delete(
                company_id,
                mapping_id,
            )
            return jsonify({
                "ok":True,
                "deleted":deleted,
            }),200

        out=db_service.payroll_statutory_mapping_save(
            company_id,
            _payroll_body(),
            mapping_id,
        )
        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll statutory mapping failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "statutory/returns",
    methods=["GET","POST","OPTIONS"],
)
@require_auth
def api_payroll_statutory_returns(company_id:int):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="GET":
            items=db_service.payroll_statutory_returns_list(
                company_id,
                authority_code=
                    request.args.get("authority_code"),
                return_type=
                    request.args.get("return_type"),
                status=request.args.get("status"),
                date_from=request.args.get("date_from"),
                date_to=request.args.get("date_to"),
            )
            return jsonify({
                "ok":True,
                "items":items,
            }),200

        out=db_service.payroll_statutory_return_save(
            company_id,
            _payroll_body(),
            _jwt_user_id(),
        )
        return jsonify({
            "ok":True,
            "data":out,
        }),201

    except Exception as error:
        current_app.logger.exception(
            "payroll statutory returns failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "statutory/returns/<int:return_id>",
    methods=["GET","PATCH","OPTIONS"],
)
@require_auth
def api_payroll_statutory_return(
    company_id:int,
    return_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        if request.method=="GET":
            out=db_service.payroll_statutory_return_get(
                company_id,
                return_id,
            )
            if not out:
                return jsonify({
                    "ok":False,
                    "error":"Statutory return not found",
                }),404
        else:
            out=db_service.payroll_statutory_return_save(
                company_id,
                _payroll_body(),
                _jwt_user_id(),
                return_id,
            )

        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll statutory return failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "statutory/returns/<int:return_id>/calculate",
    methods=["POST","OPTIONS"],
)
@require_auth
def api_payroll_statutory_return_calculate(
    company_id:int,
    return_id:int,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        out=db_service.payroll_statutory_return_calculate(
            company_id,
            return_id,
            _jwt_user_id(),
        )
        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "statutory return calculation failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400


@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "statutory/returns/<int:return_id>/<action>",
    methods=["POST","OPTIONS"],
)
@require_auth
def api_payroll_statutory_return_action(
    company_id:int,
    return_id:int,
    action:str,
):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        out=db_service.payroll_statutory_return_action(
            company_id,
            return_id,
            action,
            _payroll_body(),
            _jwt_user_id(),
        )
        return jsonify({
            "ok":True,
            "data":out,
        }),200

    except Exception as error:
        current_app.logger.exception(
            "statutory return action failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

@payroll_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "close-out",
    methods=["GET","OPTIONS"],
)
@require_auth
def api_payroll_close_out(company_id:int):
    if request.method=="OPTIONS":
        return _corsify(make_response("",204))

    deny=_payroll_company_guard(company_id)
    if deny:
        return deny

    try:
        date_from,date_to,meta=resolve_company_period(
            db_service,
            company_id,
            request,
            mode="range",
        )

        readiness=db_service.payroll_disclosure_readiness(
            company_id,
            date_from,
            date_to,
            as_of=date_to,
        )

        return jsonify({
            "ok":True,
            "meta":meta or {},
            "data":{
                key:value
                for key,value in readiness.items()
                if key!="disclosures"
            },
        }),200

    except Exception as error:
        current_app.logger.exception(
            "payroll close-out failed"
        )
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400