# BackEnd/Services/routes/ias41_disclosure_routes.py

from flask import Blueprint,request,jsonify,current_app
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.period_core import resolve_company_period
from BackEnd.Services.db_service import db_service

bp_ias41_disclosure=Blueprint(
    "ias41_disclosure",
    __name__,
)


@bp_ias41_disclosure.route(
    "/api/companies/<int:company_id>/ias41/disclosure",
    methods=["GET","OPTIONS"],
)
@require_auth
def ias41_disclosure(company_id:int):
    if request.method=="OPTIONS":
        return "",204

    try:
        date_from,date_to,meta=resolve_company_period(
            db_service,
            int(company_id),
            request,
            mode="range",
        )

        if not date_from or not date_to:
            return jsonify({
                "ok":False,
                "error":"Unable to resolve reporting period.",
            }),400

        if date_from>date_to:
            return jsonify({
                "ok":False,
                "error":"from must be <= to",
            }),400

        out=db_service.ias41_disclosure_report(
            int(company_id),
            date_from=date_from,
            date_to=date_to,
            as_of=date_to,
        )

        return jsonify({
            "ok":True,
            "route_version":"ias41_disclosure_v1",
            "meta":{
                **(meta or {}),
                "standard":"IAS 41",
                "statement":"financial_statement_notes",
                "period":{
                    "from":date_from.isoformat(),
                    "to":date_to.isoformat(),
                    "as_of":date_to.isoformat(),
                },
            },
            "disclosure":out,
        }),200

    except ValueError as error:
        return jsonify({
            "ok":False,
            "error":str(error),
        }),400

    except Exception:
        current_app.logger.exception(
            "IAS 41 disclosure failed company_id=%s",
            company_id,
        )
        return jsonify({
            "ok":False,
            "error":"Internal server error",
        }),500