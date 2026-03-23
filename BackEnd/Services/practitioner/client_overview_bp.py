from __future__ import annotations

from flask import Blueprint, current_app, request, make_response

from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.practitioner.practitioner_engagements import _json_ok, _json_err, _corsify
from BackEnd.Services.routes.invoice_routes import (
    _deny_if_wrong_company,
)
from BackEnd.Services.credit_policy import _can_view_engagements
client_overview_bp = Blueprint("client_overview_bp", __name__)


def _parse_customer_id() -> int:
    customer_id = int(request.args.get("customer_id", "0") or 0)
    if customer_id <= 0:
        raise ValueError("customer_id is required.")
    return customer_id


def _parse_limit(default: int = 100, max_limit: int = 500) -> int:
    raw = int(request.args.get("limit", default))
    return max(1, min(raw, max_limit))


def _parse_offset(default: int = 0) -> int:
    raw = int(request.args.get("offset", default))
    return max(0, raw)


@client_overview_bp.route("/api/companies/<int:cid>/client-overview/summary", methods=["GET", "OPTIONS"])
@require_auth
def get_client_overview_summary_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(
            payload,
            int(company_id),
            db_service=db_service,
        )
        if deny:
            return deny

        if not _can_view_engagements(payload):
            return _json_err("You do not have permission to view client overview.", 403)

        customer_id = _parse_customer_id()

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_client_overview_summary(
                cur,
                company_id,
                customer_id=customer_id,
            )

        return _json_ok({"row": row})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("get_client_overview_summary_route failed")
        return _json_err(str(e), 500)


@client_overview_bp.route("/api/companies/<int:cid>/client-overview/engagements", methods=["GET", "OPTIONS"])
@require_auth
def list_client_overview_engagements_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(
            payload,
            int(company_id),
            db_service=db_service,
        )
        if deny:
            return deny

        if not _can_view_engagements(payload):
            return _json_err("You do not have permission to view client engagements.", 403)

        customer_id = _parse_customer_id()
        status = (request.args.get("status") or "").strip()
        engagement_type = (request.args.get("type") or "").strip()
        q = (request.args.get("q") or "").strip()
        limit = _parse_limit(default=100)
        offset = _parse_offset()

        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_client_overview_engagements(
                cur,
                company_id,
                customer_id=customer_id,
                status=status,
                engagement_type=engagement_type,
                q=q,
                active_only=True,
                limit=limit,
                offset=offset,
            )

        return _json_ok({"rows": rows})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("list_client_overview_engagements_route failed")
        return _json_err(str(e), 500)


@client_overview_bp.route("/api/companies/<int:cid>/client-overview/reporting-deliverables", methods=["GET", "OPTIONS"])
@require_auth
def get_client_reporting_deliverables_summary_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(
            payload,
            int(company_id),
            db_service=db_service,
        )
        if deny:
            return deny

        if not _can_view_engagements(payload):
            return _json_err("You do not have permission to view reporting and deliverables.", 403)

        customer_id = _parse_customer_id()

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_client_reporting_deliverables_summary(
                cur,
                company_id,
                customer_id=customer_id,
            )

        return _json_ok({"row": row})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("get_client_reporting_deliverables_summary_route failed")
        return _json_err(str(e), 500)


@client_overview_bp.route("/api/companies/<int:cid>/client-overview/operations", methods=["GET", "OPTIONS"])
@require_auth
def get_client_operations_summary_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(
            payload,
            int(company_id),
            db_service=db_service,
        )
        if deny:
            return deny

        if not _can_view_engagements(payload):
            return _json_err("You do not have permission to view operations summary.", 403)

        customer_id = _parse_customer_id()

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_client_operations_summary(
                cur,
                company_id,
                customer_id=customer_id,
            )

        return _json_ok({"row": row})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("get_client_operations_summary_route failed")
        return _json_err(str(e), 500)


@client_overview_bp.route("/api/companies/<int:cid>/client-overview/close-finalisation", methods=["GET", "OPTIONS"])
@require_auth
def get_client_close_finalisation_summary_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(
            payload,
            int(company_id),
            db_service=db_service,
        )
        if deny:
            return deny

        if not _can_view_engagements(payload):
            return _json_err("You do not have permission to view close and finalisation summary.", 403)

        customer_id = _parse_customer_id()

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_client_close_finalisation_summary(
                cur,
                company_id,
                customer_id=customer_id,
            )

        return _json_ok({"row": row})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("get_client_close_finalisation_summary_route failed")
        return _json_err(str(e), 500)


@client_overview_bp.route("/api/companies/<int:cid>/client-overview/risk-alerts", methods=["GET", "OPTIONS"])
@require_auth
def get_client_risk_alerts_summary_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}

        deny = _deny_if_wrong_company(
            payload,
            int(company_id),
            db_service=db_service,
        )
        if deny:
            return deny

        if not _can_view_engagements(payload):
            return _json_err("You do not have permission to view risk alerts.", 403)

        customer_id = _parse_customer_id()

        with db_service._conn_cursor() as (conn, cur):
            row = db_service.get_client_risk_alerts_summary(
                cur,
                company_id,
                customer_id=customer_id,
            )

        return _json_ok({"row": row})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("get_client_risk_alerts_summary_route failed")
        return _json_err(str(e), 500)