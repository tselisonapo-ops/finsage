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
    "/api/companies/<int:company_id>/payroll/employee-benefits/leave-types",
    methods=["GET","OPTIONS"],
)
@require_auth
def leave_types(company_id):
    if request.method=="OPTIONS":
        return _options()

    deny=_guard(company_id)
    if deny:
        return deny

    try:
        return jsonify({
            "ok":True,
            "items":service.leave_types_list(company_id),
        }),200
    except Exception as error:
        return _error("ias19 leave types failed",error)
    
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
    methods=["GET","POST","OPTIONS"],
)
@require_auth
def actuarial_valuations(company_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try:
        if request.method=="GET":
            items=service.actuarial_valuations_list(
                company_id,
                request.args.get("plan_id"),
            )
            return jsonify({"ok":True,"items":items}),200

        out=service.actuarial_valuation_save(
            company_id,
            _body(),
            user_id=_user_id(),
        )
        return jsonify({"ok":True,"data":out}),201
    except Exception as error:
        return _error("ias19 actuarial valuations failed",error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/actuarial-valuations/<int:valuation_id>",
    methods=["GET","PATCH","OPTIONS"],
)
@require_auth
def actuarial_valuation(company_id,valuation_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try:
        if request.method=="GET":
            out=service.actuarial_valuation_get(
                company_id,
                valuation_id,
            )
            return jsonify({"ok":True,"data":out}),200

        out=service.actuarial_valuation_save(
            company_id,
            _body(),
            valuation_id=valuation_id,
            user_id=_user_id(),
        )
        return jsonify({"ok":True,"data":out}),200
    except Exception as error:
        return _error("ias19 actuarial valuation failed",error)
    
@payroll_employee_benefits_bp.route("/api/companies/<int:company_id>/payroll/employee-benefits/leave-balances", methods=["GET","OPTIONS"])
@require_auth
def leave_balances(company_id):
    if request.method == "OPTIONS": return _options()
    deny = _guard(company_id)
    if deny: return deny
    try:
        items = service.leave_balances_list(company_id,request.args.get("employee_id"),request.args.get("leave_type_id"),request.args.get("as_of_date"))
        return jsonify({"ok":True,"items":items}),200
    except Exception as error: return _error("ias19 leave balances failed",error)

@payroll_employee_benefits_bp.route("/api/companies/<int:company_id>/payroll/employee-benefits/leave-balances/<int:employee_id>/<int:leave_type_id>", methods=["POST","PATCH","OPTIONS"])
@require_auth
def leave_balance(company_id,employee_id,leave_type_id):
    if request.method == "OPTIONS": return _options()
    deny = _guard(company_id)
    if deny: return deny
    try:
        out=service.leave_balance_adjust(company_id,employee_id,leave_type_id,_body(),_user_id())
        return jsonify({"ok":True,"data":out}),200
    except Exception as error: return _error("ias19 leave balance adjustment failed",error)

@payroll_employee_benefits_bp.route("/api/companies/<int:company_id>/payroll/employee-benefits/leave-accrual-runs/<int:run_id>/reverse", methods=["POST","OPTIONS"])
@require_auth
def reverse_leave(company_id,run_id):
    if request.method == "OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try: return jsonify({"ok":True,"data":service.leave_reverse(company_id,run_id,_user_id())}),200
    except Exception as error: return _error("ias19 leave reversal failed",error)

@payroll_employee_benefits_bp.route("/api/companies/<int:company_id>/payroll/employee-benefits/bonus-assignments", methods=["GET","POST","OPTIONS"])
@require_auth
def bonus_assignments(company_id):
    if request.method == "OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try:
        if request.method=="GET": return jsonify({"ok":True,"items":service.bonus_assignments_list(company_id,request.args.get("scheme_id"))}),200
        return jsonify({"ok":True,"data":service.bonus_assignment_save(company_id,_body(),user_id=_user_id())}),201
    except Exception as error: return _error("ias19 bonus assignments failed",error)

@payroll_employee_benefits_bp.route("/api/companies/<int:company_id>/payroll/employee-benefits/bonus-assignments/<int:assignment_id>", methods=["PATCH","OPTIONS"])
@require_auth
def bonus_assignment(company_id,assignment_id):
    if request.method == "OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try: return jsonify({"ok":True,"data":service.bonus_assignment_save(company_id,_body(),assignment_id,_user_id())}),200
    except Exception as error: return _error("ias19 bonus assignment update failed",error)

@payroll_employee_benefits_bp.route("/api/companies/<int:company_id>/payroll/employee-benefits/bonus-accrual-runs", methods=["GET","POST","OPTIONS"])
@require_auth
def bonus_runs(company_id):
    if request.method == "OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try:
        if request.method=="GET": return jsonify({"ok":True,"items":service.bonus_runs_list(company_id)}),200
        return jsonify({"ok":True,"data":service.bonus_run_create(company_id,_body(),_user_id())}),201
    except Exception as error: return _error("ias19 bonus runs failed",error)

@payroll_employee_benefits_bp.route("/api/companies/<int:company_id>/payroll/employee-benefits/bonus-accrual-runs/<int:run_id>", methods=["GET","OPTIONS"])
@require_auth
def bonus_run(company_id,run_id):
    if request.method == "OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try: return jsonify({"ok":True,"data":service.bonus_run_get(company_id,run_id)}),200
    except Exception as error: return _error("ias19 bonus run failed",error)

@payroll_employee_benefits_bp.route("/api/companies/<int:company_id>/payroll/employee-benefits/bonus-accrual-runs/<int:run_id>/<action>", methods=["GET","POST","OPTIONS"])
@require_auth
def bonus_run_action(company_id,run_id,action):
    if request.method == "OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try:
        actions={"calculate":lambda:service.bonus_run_calculate(company_id,run_id),"journal-preview":lambda:service.bonus_journal_preview(company_id,run_id),"post":lambda:service.bonus_post(company_id,run_id,_user_id()),"reverse":lambda:service.bonus_reverse(company_id,run_id,_user_id())}
        if action not in actions: return jsonify({"ok":False,"error":"Unsupported bonus action"}),404
        return jsonify({"ok":True,"data":actions[action]()}),200
    except Exception as error: return _error(f"ias19 bonus {action} failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/plans",
    methods=["GET","POST","OPTIONS"])
@require_auth
def benefit_plans(company_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try:
        if request.method=="GET":
            return jsonify({"ok":True,"items":service.benefit_plans_list(
                company_id,request.args.get("plan_type"))}),200
        return jsonify({"ok":True,"data":service.benefit_plan_save(
            company_id,_body(),user_id=_user_id())}),201
    except Exception as error: return _error("ias19 benefit plans failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/plans/<int:plan_id>",
    methods=["GET","PATCH","OPTIONS"])
@require_auth
def benefit_plan(company_id,plan_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try:
        if request.method=="GET":
            return jsonify({"ok":True,"data":service.benefit_plan_workspace(
                company_id,plan_id)}),200
        return jsonify({"ok":True,"data":service.benefit_plan_save(
            company_id,_body(),plan_id,_user_id())}),200
    except Exception as error: return _error("ias19 benefit plan failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/plans/<int:plan_id>/members",
    methods=["GET","POST","OPTIONS"])
@require_auth
def plan_members(company_id,plan_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try:
        if request.method=="GET":
            return jsonify({"ok":True,"items":service.plan_members_list(
                company_id,plan_id)}),200
        return jsonify({"ok":True,"data":service.plan_member_save(
            company_id,plan_id,_body(),user_id=_user_id())}),201
    except Exception as error: return _error("ias19 plan members failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/plans/<int:plan_id>/members/<int:member_id>",
    methods=["PATCH","OPTIONS"])
@require_auth
def plan_member(company_id,plan_id,member_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try:
        return jsonify({"ok":True,"data":service.plan_member_save(
            company_id,plan_id,_body(),member_id,_user_id())}),200
    except Exception as error: return _error("ias19 plan member update failed",error)

@payroll_employee_benefits_bp.route("/api/companies/<int:company_id>/payroll/employee-benefits/actuarial-valuations/<int:valuation_id>/<action>", methods=["GET","POST","OPTIONS"])
@require_auth
def actuarial_action(company_id,valuation_id,action):
    if request.method == "OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try:
        actions={"reconciliation":lambda:service.actuarial_reconciliation(company_id,valuation_id),"journal-preview":lambda:service.actuarial_journal_preview(company_id,valuation_id),"post":lambda:service.actuarial_post(company_id,valuation_id,_user_id()),"reverse":lambda:service.actuarial_reverse(company_id,valuation_id,_user_id())}
        if action not in actions: return jsonify({"ok":False,"error":"Unsupported actuarial action"}),404
        return jsonify({"ok":True,"data":actions[action]()}),200
    except Exception as error: return _error(f"ias19 actuarial {action} failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/defined-contribution-runs",
    methods=["GET","POST","OPTIONS"])
@require_auth
def defined_contribution_runs(company_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try:
        if request.method=="GET":
            return jsonify({"ok":True,"items":service.dc_runs_list(company_id)}),200
        return jsonify({"ok":True,"data":service.dc_run_create(
            company_id,_body(),_user_id())}),201
    except Exception as error:
        return _error("ias19 defined contribution runs failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/defined-contribution-runs/<int:run_id>",
    methods=["GET","OPTIONS"])
@require_auth
def defined_contribution_run(company_id,run_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try:
        return jsonify({"ok":True,"data":service.dc_run_get(
            company_id,run_id)}),200
    except Exception as error:
        return _error("ias19 defined contribution run failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/defined-contribution-runs/<int:run_id>/calculate",
    methods=["POST","OPTIONS"])
@require_auth
def calculate_defined_contribution(company_id,run_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try:
        return jsonify({"ok":True,"data":service.dc_run_calculate(
            company_id,run_id)}),200
    except Exception as error:
        return _error("ias19 defined contribution calculation failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/defined-contribution-runs/<int:run_id>/journal-preview",
    methods=["GET","OPTIONS"])
@require_auth
def defined_contribution_preview(company_id,run_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try:
        return jsonify({"ok":True,"data":service.dc_journal_preview(
            company_id,run_id)}),200
    except Exception as error:
        return _error("ias19 defined contribution preview failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/defined-contribution-runs/<int:run_id>/post",
    methods=["POST","OPTIONS"])
@require_auth
def post_defined_contribution(company_id,run_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try:
        return jsonify({"ok":True,"data":service.dc_run_post(
            company_id,run_id,_user_id())}),200
    except Exception as error:
        return _error("ias19 defined contribution posting failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/defined-contribution-runs/<int:run_id>/reverse",
    methods=["POST","OPTIONS"])
@require_auth
def reverse_defined_contribution(company_id,run_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny: return deny
    try:
        return jsonify({"ok":True,"data":service.dc_run_reverse(
            company_id,run_id,_user_id())}),200
    except Exception as error:
        return _error("ias19 defined contribution reversal failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/actuarial-valuations/<int:valuation_id>/assumptions",
    methods=["GET","POST","PATCH","OPTIONS"])
@require_auth
def actuarial_assumptions(company_id,valuation_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        if request.method=="GET":
            return jsonify({"ok":True,"items":service.actuarial_assumptions_list(
                company_id,valuation_id)}),200
        return jsonify({"ok":True,"items":service.actuarial_assumptions_save(
            company_id,valuation_id,_body(),_user_id())}),200
    except Exception as error:
        return _error("ias19 actuarial assumptions failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/actuarial-valuations/<int:valuation_id>/reconciliation",
    methods=["GET","OPTIONS"])
@require_auth
def actuarial_reconciliation(company_id,valuation_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({"ok":True,"data":service.actuarial_reconciliation(
            company_id,valuation_id)}),200
    except Exception as error:
        return _error("ias19 actuarial reconciliation failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/actuarial-valuations/<int:valuation_id>/validate",
    methods=["POST","OPTIONS"])
@require_auth
def validate_actuarial_valuation(company_id,valuation_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({"ok":True,"data":service.actuarial_validate(
            company_id,valuation_id,_user_id())}),200
    except Exception as error:
        return _error("ias19 actuarial validation failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/actuarial-valuations/<int:valuation_id>/approve",
    methods=["POST","OPTIONS"])
@require_auth
def approve_actuarial_valuation(company_id,valuation_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({"ok":True,"data":service.actuarial_approve(
            company_id,valuation_id,_user_id())}),200
    except Exception as error:
        return _error("ias19 actuarial approval failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/actuarial-valuations/<int:valuation_id>/journal-preview",
    methods=["GET","OPTIONS"])
@require_auth
def actuarial_preview(company_id,valuation_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({"ok":True,"data":service.actuarial_journal_preview(
            company_id,valuation_id)}),200
    except Exception as error:
        return _error("ias19 actuarial preview failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/actuarial-valuations/<int:valuation_id>/post",
    methods=["POST","OPTIONS"])
@require_auth
def post_actuarial_valuation(company_id,valuation_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({"ok":True,"data":service.actuarial_post(
            company_id,valuation_id,_user_id())}),200
    except Exception as error:
        return _error("ias19 actuarial posting failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/actuarial-valuations/<int:valuation_id>/reverse",
    methods=["POST","OPTIONS"])
@require_auth
def reverse_actuarial_valuation(company_id,valuation_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({"ok":True,"data":service.actuarial_reverse(
            company_id,valuation_id,_user_id())}),200
    except Exception as error:
        return _error("ias19 actuarial reversal failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/long-term-schemes",
    methods=["GET","POST","OPTIONS"])
@require_auth
def long_term_schemes(company_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        if request.method=="GET":
            return jsonify({"ok":True,"items":
                service.long_term_schemes_list(company_id)}),200
        return jsonify({"ok":True,"data":
            service.long_term_scheme_save(
                company_id,_body(),user_id=_user_id())}),201
    except Exception as error:
        return _error("ias19 long-term schemes failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/long-term-schemes/<int:scheme_id>",
    methods=["GET","PATCH","OPTIONS"])
@require_auth
def long_term_scheme(company_id,scheme_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        if request.method=="GET":
            return jsonify({"ok":True,"data":
                service.long_term_scheme_get(company_id,scheme_id)}),200
        return jsonify({"ok":True,"data":
            service.long_term_scheme_save(
                company_id,_body(),scheme_id,_user_id())}),200
    except Exception as error:
        return _error("ias19 long-term scheme failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/long-term-assignments",
    methods=["GET","POST","OPTIONS"])
@require_auth
def long_term_assignments(company_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        if request.method=="GET":
            return jsonify({"ok":True,"items":
                service.long_term_assignments_list(
                    company_id,request.args.get("scheme_id"))}),200
        return jsonify({"ok":True,"data":
            service.long_term_assignment_save(
                company_id,_body(),user_id=_user_id())}),201
    except Exception as error:
        return _error("ias19 long-term assignments failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/long-term-assignments/<int:assignment_id>",
    methods=["PATCH","OPTIONS"])
@require_auth
def long_term_assignment(company_id,assignment_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({"ok":True,"data":
            service.long_term_assignment_save(
                company_id,_body(),assignment_id,_user_id())}),200
    except Exception as error:
        return _error("ias19 long-term assignment update failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/long-term-runs",
    methods=["GET","POST","OPTIONS"])
@require_auth
def long_term_runs(company_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        if request.method=="GET":
            return jsonify({"ok":True,"items":
                service.long_term_runs_list(company_id)}),200
        return jsonify({"ok":True,"data":
            service.long_term_run_create(
                company_id,_body(),_user_id())}),201
    except Exception as error:
        return _error("ias19 long-term runs failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/long-term-runs/<int:run_id>",
    methods=["GET","OPTIONS"])
@require_auth
def long_term_run(company_id,run_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({"ok":True,"data":
            service.long_term_run_get(company_id,run_id)}),200
    except Exception as error:
        return _error("ias19 long-term run failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/long-term-runs/<int:run_id>/<action>",
    methods=["GET","POST","OPTIONS"])
@require_auth
def long_term_run_action(company_id,run_id,action):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        actions={
            "calculate":lambda:service.long_term_run_calculate(company_id,run_id),
            "journal-preview":lambda:service.long_term_journal_preview(company_id,run_id),
            "post":lambda:service.long_term_post(company_id,run_id,_user_id()),
            "reverse":lambda:service.long_term_reverse(company_id,run_id,_user_id()),
        }
        if action not in actions:
            return jsonify({"ok":False,"error":"Unsupported long-term action"}),404
        return jsonify({"ok":True,"data":actions[action]()}),200
    except Exception as error:
        return _error(f"ias19 long-term {action} failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/termination-plans",
    methods=["GET","POST","OPTIONS"])
@require_auth
def termination_plans(company_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        if request.method=="GET":
            return jsonify({
                "ok":True,
                "items":service.termination_plans_list(company_id)
            }),200
        return jsonify({
            "ok":True,
            "data":service.termination_plan_save(
                company_id,_body(),user_id=_user_id()
            )
        }),201
    except Exception as error:
        return _error("ias19 termination plans failed",error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/termination-plans/<int:plan_id>",
    methods=["GET","PATCH","OPTIONS"])
@require_auth
def termination_plan(company_id,plan_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        if request.method=="GET":
            return jsonify({
                "ok":True,
                "data":service.termination_plan_get(company_id,plan_id)
            }),200
        return jsonify({
            "ok":True,
            "data":service.termination_plan_save(
                company_id,_body(),plan_id,_user_id()
            )
        }),200
    except Exception as error:
        return _error("ias19 termination plan failed",error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/termination-plans/<int:plan_id>/employees",
    methods=["GET","POST","OPTIONS"])
@require_auth
def termination_plan_employees(company_id,plan_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        if request.method=="GET":
            data=service.termination_plan_get(company_id,plan_id)
            return jsonify({
                "ok":True,
                "items":data["employees"]
            }),200

        return jsonify({
            "ok":True,
            "data":service.termination_employee_save(
                company_id,plan_id,_body(),user_id=_user_id()
            )
        }),201
    except Exception as error:
        return _error("ias19 termination employees failed",error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/termination-plans/<int:plan_id>/employees/<int:employee_line_id>",
    methods=["PATCH","OPTIONS"])
@require_auth
def termination_plan_employee(company_id,plan_id,employee_line_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({
            "ok":True,
            "data":service.termination_employee_save(
                company_id,plan_id,_body(),
                employee_line_id,_user_id()
            )
        }),200
    except Exception as error:
        return _error("ias19 termination employee update failed",error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/termination-plans/<int:plan_id>/calculate",
    methods=["POST","OPTIONS"])
@require_auth
def calculate_termination_plan(company_id,plan_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({
            "ok":True,
            "data":service.termination_calculate(company_id,plan_id)
        }),200
    except Exception as error:
        return _error("ias19 termination calculation failed",error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/termination-plans/<int:plan_id>/journal-preview",
    methods=["GET","OPTIONS"])
@require_auth
def termination_preview(company_id,plan_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({
            "ok":True,
            "data":service.termination_journal_preview(
                company_id,plan_id
            )
        }),200
    except Exception as error:
        return _error("ias19 termination preview failed",error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/termination-plans/<int:plan_id>/recognise",
    methods=["POST","OPTIONS"])
@require_auth
def recognise_termination_plan(company_id,plan_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({
            "ok":True,
            "data":service.termination_recognise(
                company_id,plan_id,_user_id()
            )
        }),200
    except Exception as error:
        return _error("ias19 termination recognition failed",error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/termination-plans/<int:plan_id>/settle",
    methods=["POST","OPTIONS"])
@require_auth
def settle_termination_plan(company_id,plan_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({
            "ok":True,
            "data":service.termination_settle(
                company_id,plan_id,_body(),_user_id()
            )
        }),200
    except Exception as error:
        return _error("ias19 termination settlement failed",error)


@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/termination-plans/<int:plan_id>/reverse",
    methods=["POST","OPTIONS"])
@require_auth
def reverse_termination_plan(company_id,plan_id):
    if request.method=="OPTIONS": return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({
            "ok":True,
            "data":service.termination_reverse(
                company_id,plan_id,_user_id()
            )
        }),200
    except Exception as error:
        return _error("ias19 termination reversal failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/journals",
    methods=["GET","OPTIONS"])
@require_auth
def employee_benefit_journals(company_id):
    if request.method=="OPTIONS":return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({
            "ok":True,
            "items":service.employee_benefit_journals(
                company_id,
                request.args.get("source_type"),
                request.args.get("date_from"),
                request.args.get("date_to")
            )
        }),200
    except Exception as error:
        return _error("ias19 journals failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/journals/<int:journal_id>",
    methods=["GET","OPTIONS"])
@require_auth
def employee_benefit_journal(company_id,journal_id):
    if request.method=="OPTIONS":return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({
            "ok":True,
            "data":service.employee_benefit_journal_get(
                company_id,journal_id
            )
        }),200
    except Exception as error:
        return _error("ias19 journal failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/movement-report",
    methods=["GET","OPTIONS"])
@require_auth
def movement_report(company_id):
    if request.method=="OPTIONS":return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({
            "ok":True,
            "data":service.movement_report(
                company_id,
                request.args.get("date_from"),
                request.args.get("date_to"),
                request.args.get("benefit_class")
            )
        }),200
    except Exception as error:
        return _error("ias19 movement report failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/disclosure",
    methods=["GET","OPTIONS"])
@require_auth
def disclosure(company_id):
    if request.method=="OPTIONS":return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        reporting_date=request.args.get("reporting_date")
        if not reporting_date:
            return jsonify({
                "ok":False,
                "error":"reporting_date is required"
            }),400

        return jsonify({
            "ok":True,
            "data":service.disclosure(
                company_id,reporting_date,
                request.args.get("date_from"),
                request.args.get("date_to")
            )
        }),200
    except Exception as error:
        return _error("ias19 disclosure failed",error)

@payroll_employee_benefits_bp.route(
    "/api/companies/<int:company_id>/payroll/employee-benefits/diagnostics",
    methods=["GET","OPTIONS"])
@require_auth
def diagnostics(company_id):
    if request.method=="OPTIONS":return _options()
    deny=_guard(company_id)
    if deny:return deny
    try:
        return jsonify({
            "ok":True,
            "data":service.diagnostics(company_id)
        }),200
    except Exception as error:
        return _error("ias19 diagnostics failed",error)

