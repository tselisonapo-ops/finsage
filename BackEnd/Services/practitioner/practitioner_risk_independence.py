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


# ============================================================
# Risk & Independence
# ============================================================

@risk_independence_bp.route(
    "/api/companies/<int:cid>/risk-independence",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def risk_independence_collection_route(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        user_id = payload.get("user_id")

        if request.method == "GET":
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

        body = request.get_json(force=True, silent=True) or {}

        with db_service._conn_cursor() as (conn, cur):
            assessment_id = db_service.create_risk_independence_assessment(
                cur,
                company_id,
                engagement_id=int(body["engagement_id"]),
                assessment_type=body.get("assessment_type") or body.get("acceptance_type") or "acceptance",
                status=body.get("status") or "draft",
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
                requested_by_user_id=body.get("requested_by_user_id") or user_id,
                created_by_user_id=user_id,
                updated_by_user_id=user_id,
            )

            conn.commit()

            row = db_service.get_risk_independence_assessment_detail(
                cur,
                company_id,
                assessment_id=assessment_id,
            )

        return _json_ok(row or {}, 201)

    except KeyError as e:
        return _json_err(f"Missing required field: {e}", 400)
    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("risk_independence_collection_route failed")
        return _json_err(str(e), 500)


@risk_independence_bp.route(
    "/api/companies/<int:cid>/risk-independence/<int:assessment_id>",
    methods=["GET", "PUT", "PATCH", "OPTIONS"],
)
@require_auth
def risk_independence_item_route(cid: int, assessment_id: int):
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
                row = db_service.get_risk_independence_assessment_detail(
                    cur,
                    company_id,
                    assessment_id=assessment_id,
                )

            if not row:
                return _json_err("Risk & Independence assessment not found", 404)

            return _json_ok(row)

        body = request.get_json(force=True, silent=True) or {}
        user_id = payload.get("user_id")

        with db_service._conn_cursor() as (conn, cur):
            updated = db_service.update_risk_independence_assessment(
                cur,
                company_id,
                assessment_id=assessment_id,
                assessment_type=body.get("assessment_type") or body.get("acceptance_type"),
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
                return _json_err("Risk & Independence assessment not found", 404)

            conn.commit()

            row = db_service.get_risk_independence_assessment_detail(
                cur,
                company_id,
                assessment_id=assessment_id,
            )

        return _json_ok(row or {})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("risk_independence_item_route failed")
        return _json_err(str(e), 500)


@risk_independence_bp.route(
    "/api/companies/<int:cid>/risk-independence/<int:assessment_id>/decision",
    methods=["POST", "OPTIONS"],
)
@require_auth
def risk_independence_decision_route(cid: int, assessment_id: int):
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
            assessment = db_service.get_risk_independence_assessment_detail(
                cur,
                company_id,
                assessment_id=assessment_id,
            )

            if not assessment:
                return _json_err("Risk & Independence assessment not found", 404)

            if decision == "approve":
                if not bool(assessment.get("independence_cleared")):
                    return _json_err("Independence must be cleared before approval.", 400)

                if not bool(assessment.get("conflicts_checked")):
                    return _json_err("Conflict checks must be completed before approval.", 400)

                if not bool(assessment.get("competence_confirmed")):
                    return _json_err("Competence must be confirmed before approval.", 400)

                if not bool(assessment.get("capacity_confirmed")):
                    return _json_err("Capacity must be confirmed before approval.", 400)

                risk_level = str(assessment.get("risk_level") or "").strip().lower()
                if risk_level in {"high", "critical"} and not decision_notes:
                    return _json_err(
                        "Decision notes are required when approving a high-risk or critical assessment.",
                        400,
                    )

            updated = db_service.decide_risk_independence_assessment(
                cur,
                company_id,
                assessment_id=assessment_id,
                decision=decision,
                decision_notes=decision_notes,
                reviewed_by_user_id=user_id,
            )

            if not updated:
                return _json_err("Risk & Independence assessment not found", 404)

            conn.commit()

            row = db_service.get_risk_independence_assessment_detail(
                cur,
                company_id,
                assessment_id=assessment_id,
            )

        return _json_ok(row or {})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("risk_independence_decision_route failed")
        return _json_err(str(e), 500)


# ============================================================
# Engagement Acceptance
# ============================================================

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

        user_id = payload.get("user_id")

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

        with db_service._conn_cursor() as (conn, cur):
            acceptance_id = db_service.create_engagement_acceptance_item(
                cur,
                company_id,
                engagement_id=int(body["engagement_id"]),
                acceptance_type=body.get("acceptance_type") or "acceptance",
                status=body.get("status") or "draft",
                requested_by_user_id=body.get("requested_by_user_id") or user_id,
                assigned_partner_user_id=body.get("assigned_partner_user_id"),
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
        decision = (body.get("decision") or body.get("action") or "").strip().lower()
        decision_notes = body.get("decision_notes")
        user_id = payload.get("user_id")

        with db_service._conn_cursor() as (conn, cur):
            acceptance = db_service.get_engagement_acceptance_detail(
                cur,
                company_id,
                acceptance_id=acceptance_id,
            )

            if not acceptance:
                return _json_err("Acceptance item not found", 404)

            engagement_id = acceptance.get("engagement_id")
            if not engagement_id:
                return _json_err("Acceptance item is not linked to an engagement.", 400)

            if decision == "approve":
                assessments = db_service.list_risk_independence_items(
                    cur,
                    company_id,
                    engagement_id=int(engagement_id),
                    customer_id=None,
                    status="",
                    risk_level="",
                    q="",
                    active_only=True,
                    limit=20,
                    offset=0,
                ) or []

                completed_assessment = next(
                    (
                        a for a in assessments
                        if str(a.get("status") or "").strip().lower() in {"approved", "completed", "cleared"}
                    ),
                    None,
                )

                if not completed_assessment:
                    return _json_err(
                        "Risk & Independence assessment must be approved before engagement acceptance can be approved.",
                        400,
                    )

                if not bool(completed_assessment.get("independence_cleared")):
                    return _json_err("Independence must be cleared before acceptance approval.", 400)

                if not bool(completed_assessment.get("conflicts_checked")):
                    return _json_err("Conflict checks must be completed before acceptance approval.", 400)

                if not bool(completed_assessment.get("competence_confirmed")):
                    return _json_err("Competence must be confirmed before acceptance approval.", 400)

                if not bool(completed_assessment.get("capacity_confirmed")):
                    return _json_err("Capacity must be confirmed before acceptance approval.", 400)

                risk_level = str(completed_assessment.get("risk_level") or "").strip().lower()
                if risk_level in {"high", "critical"} and not decision_notes:
                    return _json_err(
                        "Decision notes are required when approving a high-risk or critical engagement.",
                        400,
                    )

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