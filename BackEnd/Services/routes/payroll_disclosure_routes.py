from datetime import datetime
from flask import (
    Blueprint,
    current_app,
    jsonify,
    request,
)

from BackEnd.Services.auth_middleware import (
    require_auth,
)
from BackEnd.Services.period_core import (
    resolve_company_period,
)
from BackEnd.Services.db_service import db_service


payroll_disclosure_bp=Blueprint(
    "payroll_disclosure",
    __name__,
)


def _bool_arg(name:str,default=False)->bool:
    raw=request.args.get(name)

    if raw in(None,""):
        return bool(default)

    return str(raw).strip().lower() in{
        "1",
        "true",
        "yes",
        "y",
    }

def _date_arg(name:str,default=None):
    raw=str(request.args.get(name) or "").strip()

    if not raw:
        return default

    try:
        return datetime.strptime(
            raw,
            "%Y-%m-%d",
        ).date()
    except ValueError:
        raise ValueError(
            f"Invalid {name}. Use YYYY-MM-DD."
        )

@payroll_disclosure_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "disclosures/employee-costs",
    methods=["GET","OPTIONS"],
)
@require_auth
def payroll_employee_cost_disclosure(
    company_id:int,
):
    if request.method=="OPTIONS":
        return("",204)

    try:
        date_from,date_to,period_meta=(
            resolve_company_period(
                db_service,
                int(company_id),
                request,
                mode="range",
            )
        )

        if not date_from or not date_to:
            return jsonify({
                "ok":False,
                "error":
                    "Unable to resolve reporting period.",
            }),400

        if date_from>date_to:
            return jsonify({
                "ok":False,
                "error":"from must be <= to",
            }),400

        disclosure=(
            db_service
            .build_payroll_employee_cost_disclosure(
                int(company_id),
                date_from,
                date_to,
            )
        )

        note=(
            db_service
            .get_or_build_financial_statement_note(
                company_id=int(company_id),
                note_key=
                    "ias19_employee_cost_disclosure",
                period_from=date_from,
                period_to=date_to,
            )
        )

        return jsonify({
            "ok":True,
            "route_version":
                "payroll_employee_cost_disclosure_v1",

            "meta":{
                **(period_meta or {}),
                **(disclosure.get("meta") or {}),
            },

            "note":{
                "note_key":
                    "ias19_employee_cost_disclosure",
                "note_title":
                    note.get("note_title"),
                "content_text":
                    note.get("content_text"),
                "system_draft":
                    note.get("system_draft"),
                "source":note.get("source"),
                "is_custom":bool(
                    note.get("is_custom")
                ),
                "is_outdated":bool(
                    note.get("is_outdated")
                ),
            },

            "disclosure":disclosure,

            "summary":
                disclosure.get("summary") or {},

            "sections":
                disclosure.get("sections") or {},

            "totals":
                disclosure.get("totals") or {},
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception:
        current_app.logger.exception(
            "payroll employee cost disclosure failed"
        )

        return jsonify({
            "ok":False,
            "error":"Internal server error",
        }),500
    

@payroll_disclosure_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "disclosures/leave-liability",
    methods=["GET","OPTIONS"],
)
@require_auth
def payroll_leave_liability_disclosure(
    company_id:int,
):
    if request.method=="OPTIONS":
        return("",204)

    try:
        date_from,date_to,period_meta=(
            resolve_company_period(
                db_service,
                company_id,
                request,
                mode="range",
            )
        )

        if not date_from or not date_to:
            raise ValueError(
                "Unable to resolve reporting period"
            )

        as_of=_date_arg(
            "as_of",
            date_to,
        )

        disclosure=(
            db_service
            .build_payroll_leave_liability_disclosure(
                company_id,
                date_from,
                date_to,
                as_of=as_of,
            )
        )

        note=(
            db_service
            .get_or_build_financial_statement_note(
                company_id=company_id,
                note_key=
                    "ias19_leave_liability_disclosure",
                period_from=date_from,
                period_to=date_to,
            )
        )

        return jsonify({
            "ok":True,
            "route_version":
                "payroll_leave_liability_v1",
            "meta":{
                **(period_meta or {}),
                **(disclosure.get("meta") or {}),
            },
            "note":{
                "note_key":
                    "ias19_leave_liability_disclosure",
                "note_title":
                    note.get("note_title"),
                "content_text":
                    note.get("content_text"),
                "system_draft":
                    note.get("system_draft"),
                "source":note.get("source"),
                "is_custom":bool(
                    note.get("is_custom")
                ),
                "is_outdated":bool(
                    note.get("is_outdated")
                ),
            },
            "disclosure":disclosure,
            "summary":
                disclosure.get("summary") or {},
            "movement":
                disclosure.get("movement") or {},
            "sections":
                disclosure.get("sections") or {},
            "totals":
                disclosure.get("totals") or {},
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception:
        current_app.logger.exception(
            "payroll leave liability disclosure failed"
        )
        return jsonify({
            "ok":False,
            "error":"Internal server error",
        }),500

@payroll_disclosure_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "disclosures/bonus-provision",
    methods=["GET","OPTIONS"],
)
@require_auth
def payroll_bonus_provision_disclosure(
    company_id:int,
):
    if request.method=="OPTIONS":
        return("",204)

    try:
        date_from,date_to,period_meta=(
            resolve_company_period(
                db_service,
                company_id,
                request,
                mode="range",
            )
        )

        if not date_from or not date_to:
            raise ValueError(
                "Unable to resolve reporting period"
            )

        as_of=_date_arg("as_of",date_to)

        disclosure=(
            db_service
            .build_payroll_bonus_provision_disclosure(
                company_id,
                date_from,
                date_to,
                as_of=as_of,
            )
        )

        note=(
            db_service
            .get_or_build_financial_statement_note(
                company_id=company_id,
                note_key=
                    "ias19_bonus_provision_disclosure",
                period_from=date_from,
                period_to=date_to,
            )
        )

        return jsonify({
            "ok":True,
            "route_version":
                "payroll_bonus_provision_v1",
            "meta":{
                **(period_meta or {}),
                **(disclosure.get("meta") or {}),
            },
            "note":{
                "note_key":
                    "ias19_bonus_provision_disclosure",
                "note_title":
                    note.get("note_title"),
                "content_text":
                    note.get("content_text"),
                "system_draft":
                    note.get("system_draft"),
                "source":note.get("source"),
                "is_custom":bool(
                    note.get("is_custom")
                ),
                "is_outdated":bool(
                    note.get("is_outdated")
                ),
            },
            "disclosure":disclosure,
            "summary":
                disclosure.get("summary") or {},
            "movement":
                disclosure.get("movement") or {},
            "sections":
                disclosure.get("sections") or {},
            "totals":
                disclosure.get("totals") or {},
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception:
        current_app.logger.exception(
            "payroll bonus provision disclosure failed"
        )
        return jsonify({
            "ok":False,
            "error":"Internal server error",
        }),500

@payroll_disclosure_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "disclosures/termination-benefits",
    methods=["GET","OPTIONS"],
)
@require_auth
def payroll_termination_benefits_disclosure(
    company_id:int,
):
    if request.method=="OPTIONS":
        return("",204)

    try:
        date_from,date_to,period_meta=(
            resolve_company_period(
                db_service,
                company_id,
                request,
                mode="range",
            )
        )

        if not date_from or not date_to:
            raise ValueError(
                "Unable to resolve reporting period"
            )

        as_of=_date_arg("as_of",date_to)

        disclosure=(
            db_service
            .build_payroll_termination_benefits_disclosure(
                company_id,
                date_from,
                date_to,
                as_of=as_of,
            )
        )

        note=(
            db_service
            .get_or_build_financial_statement_note(
                company_id=company_id,
                note_key=
                    "ias19_termination_benefits_disclosure",
                period_from=date_from,
                period_to=date_to,
            )
        )

        return jsonify({
            "ok":True,
            "route_version":
                "payroll_termination_benefits_v1",
            "meta":{
                **(period_meta or {}),
                **(disclosure.get("meta") or {}),
            },
            "note":{
                "note_key":
                    "ias19_termination_benefits_disclosure",
                "note_title":
                    note.get("note_title"),
                "content_text":
                    note.get("content_text"),
                "system_draft":
                    note.get("system_draft"),
                "source":note.get("source"),
                "is_custom":bool(
                    note.get("is_custom")
                ),
                "is_outdated":bool(
                    note.get("is_outdated")
                ),
            },
            "disclosure":disclosure,
            "summary":
                disclosure.get("summary") or {},
            "movement":
                disclosure.get("movement") or {},
            "sections":
                disclosure.get("sections") or {},
            "totals":
                disclosure.get("totals") or {},
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception:
        current_app.logger.exception(
            "termination benefits disclosure failed"
        )
        return jsonify({
            "ok":False,
            "error":"Internal server error",
        }),500

@payroll_disclosure_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "disclosures/defined-contribution",
    methods=["GET","OPTIONS"],
)
@require_auth
def payroll_defined_contribution_disclosure(
    company_id:int,
):
    if request.method=="OPTIONS":
        return("",204)

    try:
        date_from,date_to,meta=(
            resolve_company_period(
                db_service,
                company_id,
                request,
                mode="range",
            )
        )

        if not date_from or not date_to:
            raise ValueError(
                "Unable to resolve reporting period"
            )

        disclosure=(
            db_service
            .build_payroll_defined_contribution_disclosure(
                company_id,
                date_from,
                date_to,
            )
        )

        note=(
            db_service
            .get_or_build_financial_statement_note(
                company_id=company_id,
                note_key=
                    "ias19_defined_contribution_disclosure",
                period_from=date_from,
                period_to=date_to,
            )
        )

        return jsonify({
            "ok":True,
            "route_version":
                "payroll_defined_contribution_v1",
            "meta":{
                **(meta or {}),
                **(disclosure.get("meta") or {}),
            },
            "note":{
                "note_key":
                    "ias19_defined_contribution_disclosure",
                "note_title":note.get("note_title"),
                "content_text":note.get("content_text"),
                "system_draft":note.get("system_draft"),
                "source":note.get("source"),
                "is_custom":bool(note.get("is_custom")),
                "is_outdated":bool(
                    note.get("is_outdated")
                ),
            },
            "disclosure":disclosure,
            "summary":
                disclosure.get("summary") or {},
            "sections":
                disclosure.get("sections") or {},
            "totals":
                disclosure.get("totals") or {},
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception:
        current_app.logger.exception(
            "defined-contribution disclosure failed"
        )
        return jsonify({
            "ok":False,
            "error":"Internal server error",
        }),500


@payroll_disclosure_bp.route(
    "/api/companies/<int:company_id>/payroll/"
    "disclosures/defined-benefit",
    methods=["GET","OPTIONS"],
)
@require_auth
def payroll_defined_benefit_disclosure(
    company_id:int,
):
    if request.method=="OPTIONS":
        return("",204)

    try:
        date_from,date_to,meta=(
            resolve_company_period(
                db_service,
                company_id,
                request,
                mode="range",
            )
        )

        if not date_from or not date_to:
            raise ValueError(
                "Unable to resolve reporting period"
            )

        as_of=_date_arg("as_of",date_to)

        disclosure=(
            db_service
            .build_payroll_defined_benefit_disclosure(
                company_id,
                date_from,
                date_to,
                as_of=as_of,
            )
        )

        note=(
            db_service
            .get_or_build_financial_statement_note(
                company_id=company_id,
                note_key=
                    "ias19_defined_benefit_disclosure",
                period_from=date_from,
                period_to=date_to,
            )
        )

        return jsonify({
            "ok":True,
            "route_version":
                "payroll_defined_benefit_v1",
            "meta":{
                **(meta or {}),
                **(disclosure.get("meta") or {}),
            },
            "note":{
                "note_key":
                    "ias19_defined_benefit_disclosure",
                "note_title":note.get("note_title"),
                "content_text":note.get("content_text"),
                "system_draft":note.get("system_draft"),
                "source":note.get("source"),
                "is_custom":bool(note.get("is_custom")),
                "is_outdated":bool(
                    note.get("is_outdated")
                ),
            },
            "disclosure":disclosure,
            "summary":
                disclosure.get("summary") or {},
            "movement":
                disclosure.get("movement") or {},
            "sections":
                disclosure.get("sections") or {},
            "totals":
                disclosure.get("totals") or {},
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception:
        current_app.logger.exception(
            "defined-benefit disclosure failed"
        )
        return jsonify({
            "ok":False,
            "error":"Internal server error",
        }),500