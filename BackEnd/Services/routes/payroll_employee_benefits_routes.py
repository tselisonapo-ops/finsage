from flask import Blueprint, request, jsonify, current_app, make_response

from BackEnd.Services.auth_middleware import _corsify, require_auth
from BackEnd.Services.db_service import db_service
from BackEnd.Services.payroll_employee_benefits_service.employee_benefits_service import (
    PayrollEmployeeBenefitsService,
)
from .invoice_routes import _deny_if_wrong_company


payroll_employee_benefits_bp = Blueprint(
    "payroll_employee_benefits",
    __name__,
)

service = PayrollEmployeeBenefitsService(db_service)


def _body():
    return request.get_json(silent=True) or {}


def _user_id():
    payload = getattr(request, "jwt_payload", {}) or {}
    value = payload.get("user_id") or payload.get("sub")
    return int(value) if value not in (None, "") else None


def _guard(company_id):
    return _deny_if_wrong_company(
        request.jwt_payload or {},
        int(company_id),
        db_service=db_service,
    )


def _options():
    return _corsify(make_response("", 204))


def _error(name, error):
    current_app.logger.exception(name)
    return jsonify({"ok": False, "error": str(error)}), 400


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/dashboard",
    methods=["GET", "OPTIONS"],
)
@require_auth
def dashboard(company_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny
    try:
        data = service.dashboard(
            company_id,
            request.args.get("reporting_date"),
        )
        return jsonify({"ok": True, "data": data}), 200
    except Exception as error:
        return _error("ias19 dashboard failed", error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/settings",
    methods=["GET", "PATCH", "POST", "OPTIONS"],
)
@require_auth
def settings(company_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny
    try:
        if request.method == "GET":
            return jsonify({"ok": True, "data": service.settings_get(company_id)}), 200
        out = service.settings_upsert(company_id, _body(), _user_id())
        return jsonify({"ok": True, "data": out}), 200
    except Exception as error:
        return _error("ias19 settings failed", error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/leave-policies",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def leave_policies(company_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny
    try:
        if request.method == "GET":
            return jsonify({
                "ok": True,
                "items": service.leave_policies_list(company_id),
            }), 200
        out = service.leave_policy_save(company_id, _body(), user_id=_user_id())
        return jsonify({"ok": True, "data": out}), 201
    except Exception as error:
        return _error("ias19 leave policies failed", error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/leave-policies/<int:policy_id>",
    methods=["PATCH", "OPTIONS"],
)
@require_auth
def leave_policy(company_id, policy_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny
    try:
        out = service.leave_policy_save(
            company_id, _body(), policy_id=policy_id, user_id=_user_id()
        )
        return jsonify({"ok": True, "data": out}), 200
    except Exception as error:
        return _error("ias19 leave policy update failed", error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/leave-accrual-runs",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def leave_runs(company_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny
    try:
        schema = db_service.company_schema(company_id)
        if request.method == "GET":
            items = db_service.fetch_all(f"""
                SELECT * FROM {schema}.payroll_leave_accrual_runs
                WHERE company_id=%s ORDER BY reporting_date DESC,id DESC;
            """, (int(company_id),))
            return jsonify({"ok": True, "items": items}), 200
        out = service.leave_accrual_run_create(company_id, _body(), _user_id())
        return jsonify({"ok": True, "data": out}), 201
    except Exception as error:
        return _error("ias19 leave runs failed", error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/leave-accrual-runs/<int:run_id>",
    methods=["GET", "OPTIONS"],
)
@require_auth
def leave_run(company_id, run_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny
    try:
        return jsonify({
            "ok": True,
            "data": service.leave_accrual_get(company_id, run_id),
        }), 200
    except Exception as error:
        return _error("ias19 leave run read failed", error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/leave-accrual-runs/<int:run_id>/calculate",
    methods=["POST", "OPTIONS"],
)
@require_auth
def calculate_leave(company_id, run_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny
    try:
        out = service.leave_accrual_calculate(company_id, run_id)
        return jsonify({"ok": True, "data": out}), 200
    except Exception as error:
        return _error("ias19 leave calculate failed", error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/leave-accrual-runs/<int:run_id>/journal-preview",
    methods=["GET", "OPTIONS"],
)
@require_auth
def leave_preview(company_id, run_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny
    try:
        return jsonify({
            "ok": True,
            "data": service.leave_journal_preview(company_id, run_id),
        }), 200
    except Exception as error:
        return _error("ias19 leave preview failed", error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/leave-accrual-runs/<int:run_id>/post",
    methods=["POST", "OPTIONS"],
)
@require_auth
def post_leave(company_id, run_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny
    try:
        out = service.leave_post(company_id, run_id, _user_id())
        return jsonify({"ok": True, "data": out}), 200
    except Exception as error:
        return _error("ias19 leave post failed", error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/bonus-schemes",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def bonus_schemes(company_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny
    try:
        if request.method == "GET":
            return jsonify({
                "ok": True,
                "items": service.bonus_schemes_list(company_id),
            }), 200
        out = service.bonus_scheme_save(company_id, _body(), user_id=_user_id())
        return jsonify({"ok": True, "data": out}), 201
    except Exception as error:
        return _error("ias19 bonus schemes failed", error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/bonus-schemes/<int:scheme_id>",
    methods=["PATCH", "OPTIONS"],
)
@require_auth
def bonus_scheme(company_id, scheme_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny
    try:
        out = service.bonus_scheme_save(
            company_id, _body(), scheme_id=scheme_id, user_id=_user_id()
        )
        return jsonify({"ok": True, "data": out}), 200
    except Exception as error:
        return _error("ias19 bonus scheme update failed", error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/actuarial-valuations",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def actuarial_valuations(company_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny
    try:
        if request.method == "GET":
            return jsonify({
                "ok": True,
                "items": service.actuarial_valuations_list(
                    company_id, request.args.get("plan_id")
                ),
            }), 200
        out = service.actuarial_valuation_save(
            company_id, _body(), user_id=_user_id()
        )
        return jsonify({"ok": True, "data": out}), 201
    except Exception as error:
        return _error("ias19 actuarial valuations failed", error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/actuarial-valuations/<int:valuation_id>",
    methods=["PATCH", "OPTIONS"],
)
@require_auth
def actuarial_valuation(company_id, valuation_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny
    try:
        out = service.actuarial_valuation_save(
            company_id, _body(), valuation_id=valuation_id, user_id=_user_id()
        )
        return jsonify({"ok": True, "data": out}), 200
    except Exception as error:
        return _error("ias19 actuarial valuation update failed", error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/disclosure",
    methods=["GET", "OPTIONS"],
)
@require_auth
def disclosure(company_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny
    try:
        reporting_date = request.args.get("reporting_date")
        if not reporting_date:
            return jsonify({"ok": False, "error": "reporting_date is required"}), 400
        return jsonify({
            "ok": True,
            "data": service.disclosure(company_id, reporting_date),
        }), 200
    except Exception as error:
        return _error("ias19 disclosure failed", error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/diagnostics",
    methods=["GET", "OPTIONS"],
)
@require_auth
def diagnostics(company_id):
    if request.method == "OPTIONS":
        return _options()
    deny = _guard(company_id)
    if deny:
        return deny
    try:
        return jsonify({
            "ok": True,
            "data": service.diagnostics(company_id),
        }), 200
    except Exception as error:
        return _error("ias19 diagnostics failed", error)
