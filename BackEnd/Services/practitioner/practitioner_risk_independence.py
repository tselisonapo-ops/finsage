from flask import Blueprint, current_app, make_response, request
from BackEnd.Services.auth_middleware import require_auth, _corsify
from BackEnd.Services.db_service import db_service
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.practitioner.practitioner_engagements import _json_err, _json_ok

risk_independence_bp = Blueprint("risk_independence", __name__)


def _parse_bool(v, default=False):
    if v is None:
        return default
    return str(v).strip().lower() in ("1", "true", "yes", "y", "on")


def _parse_int(v):
    if v in (None, "", "null", "undefined"):
        return None
    return int(v)


@risk_independence_bp.route(
    "/api/companies/<int:cid>/risk-independence",
    methods=["GET", "OPTIONS"],
)
@require_auth
def risk_independence_dashboard_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        engagement_id = _parse_int(request.args.get("engagement_id"))
        customer_id = _parse_int(request.args.get("customer_id"))
        status = (request.args.get("status") or "").strip().lower()
        risk_level = (request.args.get("risk_level") or "").strip().lower()
        q = (request.args.get("q") or "").strip()
        active_only = _parse_bool(request.args.get("active_only"), True)
        limit = _parse_int(request.args.get("limit")) or 100
        offset = _parse_int(request.args.get("offset")) or 0

        with db_service._conn_cursor() as (conn, cur):
            summary = db_service.get_risk_independence_summary(
                cur,
                company_id,
                engagement_id=engagement_id,
                customer_id=customer_id,
                active_only=active_only,
            )
            items = db_service.list_risk_independence_items(
                cur,
                company_id,
                engagement_id=engagement_id,
                customer_id=customer_id,
                status=status,
                risk_level=risk_level,
                q=q,
                active_only=active_only,
                limit=limit,
                offset=offset,
            )

        return _json_ok({
            "summary": summary or {},
            "items": items or [],
        })

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("risk_independence_dashboard_route failed")
        return _json_err(str(e), 500)


@risk_independence_bp.route(
    "/api/companies/<int:cid>/engagement-acceptance",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def engagement_acceptance_collection_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        if request.method == "GET":
            engagement_id = _parse_int(request.args.get("engagement_id"))
            customer_id = _parse_int(request.args.get("customer_id"))
            acceptance_type = (request.args.get("acceptance_type") or "").strip().lower()
            status = (request.args.get("status") or "").strip().lower()
            risk_level = (request.args.get("risk_level") or "").strip().lower()
            assigned_partner_user_id = _parse_int(request.args.get("assigned_partner_user_id"))
            q = (request.args.get("q") or "").strip()
            active_only = _parse_bool(request.args.get("active_only"), True)
            limit = _parse_int(request.args.get("limit")) or 100
            offset = _parse_int(request.args.get("offset")) or 0

            with db_service._conn_cursor() as (conn, cur):
                rows = db_service.list_engagement_acceptance_items(
                    cur,
                    company_id,
                    engagement_id=engagement_id,
                    customer_id=customer_id,
                    acceptance_type=acceptance_type,
                    status=status,
                    risk_level=risk_level,
                    assigned_partner_user_id=assigned_partner_user_id,
                    q=q,
                    active_only=active_only,
                    limit=limit,
                    offset=offset,
                )
            return _json_ok(rows or [])

        body = request.get_json(force=True, silent=True) or {}
        user_id = payload.get("user_id")

        with db_service._conn_cursor() as (conn, cur):
            acceptance_id = db_service.create_engagement_acceptance_item(
                cur,
                company_id,
                engagement_id=int(body["engagement_id"]),
                acceptance_type=body.get("acceptance_type") or "acceptance",
                status=body.get("status") or "draft",
                requested_by_user_id=body.get("requested_by_user_id") or user_id,
                assigned_partner_user_id=body.get("assigned_partner_user_id"),
                risk_level=body.get("risk_level") or "normal",
                independence_cleared=body.get("independence_cleared", False),
                conflicts_checked=body.get("conflicts_checked", False),
                competence_confirmed=body.get("competence_confirmed", False),
                capacity_confirmed=body.get("capacity_confirmed", False),
                client_risk_notes=body.get("client_risk_notes"),
                service_complexity_notes=body.get("service_complexity_notes"),
                preconditions_notes=body.get("preconditions_notes"),
                decision_notes=body.get("decision_notes"),
                valid_from=body.get("valid_from"),
                valid_to=body.get("valid_to"),
                created_by_user_id=user_id,
                updated_by_user_id=user_id,
            )
            conn.commit()

            row = db_service.get_engagement_acceptance_detail(
                cur,
                company_id,
                acceptance_id=acceptance_id,
            )

        return _json_ok(row or {}, 201)

    except KeyError as e:
        return _json_err(f"Missing required field: {e}", 400)
    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("engagement_acceptance_collection_route failed")
        return _json_err(str(e), 500)


@risk_independence_bp.route(
    "/api/companies/<int:cid>/engagement-acceptance/<int:acceptance_id>",
    methods=["GET", "PUT", "PATCH", "OPTIONS"],
)
@require_auth
def engagement_acceptance_item_route(cid: int, acceptance_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        if request.method == "GET":
            with db_service._conn_cursor() as (conn, cur):
                row = db_service.get_engagement_acceptance_detail(
                    cur,
                    company_id,
                    acceptance_id=acceptance_id,
                )
            if not row:
                return _json_err("Acceptance item not found", 404)
            return _json_ok(row)

        body = request.get_json(force=True, silent=True) or {}
        user_id = payload.get("user_id")

        with db_service._conn_cursor() as (conn, cur):
            updated = db_service.update_engagement_acceptance_item(
                cur,
                company_id,
                acceptance_id=acceptance_id,
                acceptance_type=body.get("acceptance_type"),
                status=body.get("status"),
                assigned_partner_user_id=body.get("assigned_partner_user_id"),
                risk_level=body.get("risk_level"),
                independence_cleared=body.get("independence_cleared"),
                conflicts_checked=body.get("conflicts_checked"),
                competence_confirmed=body.get("competence_confirmed"),
                capacity_confirmed=body.get("capacity_confirmed"),
                client_risk_notes=body.get("client_risk_notes"),
                service_complexity_notes=body.get("service_complexity_notes"),
                preconditions_notes=body.get("preconditions_notes"),
                decision_notes=body.get("decision_notes"),
                valid_from=body.get("valid_from"),
                valid_to=body.get("valid_to"),
                updated_by_user_id=user_id,
            )
            if not updated:
                return _json_err("Acceptance item not found", 404)

            conn.commit()
            row = db_service.get_engagement_acceptance_detail(
                cur,
                company_id,
                acceptance_id=acceptance_id,
            )

        return _json_ok(row or {})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("engagement_acceptance_item_route failed")
        return _json_err(str(e), 500)


@risk_independence_bp.route(
    "/api/companies/<int:cid>/engagement-acceptance/<int:acceptance_id>/decision",
    methods=["POST", "OPTIONS"],
)
@require_auth
def engagement_acceptance_decision_route(cid: int, acceptance_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        body = request.get_json(force=True, silent=True) or {}
        decision = (body.get("decision") or "").strip().lower()
        decision_notes = body.get("decision_notes")
        user_id = payload.get("user_id")

        with db_service._conn_cursor() as (conn, cur):
            updated = db_service.decide_engagement_acceptance_item(
                cur,
                company_id,
                acceptance_id=acceptance_id,
                decision=decision,
                decision_notes=decision_notes,
                decided_by_user_id=user_id,
            )
            if not updated:
                return _json_err("Acceptance item not found", 404)

            conn.commit()
            row = db_service.get_engagement_acceptance_detail(
                cur,
                company_id,
                acceptance_id=acceptance_id,
            )

        return _json_ok(row or {})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("engagement_acceptance_decision_route failed")
        return _json_err(str(e), 500)