from flask import Blueprint, current_app, make_response, request
from BackEnd.Services.auth_middleware import require_auth, _corsify
from BackEnd.Services.db_service import db_service
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.practitioner.practitioner_engagements import _json_ok, _json_err

override_log_bp = Blueprint("override_log", __name__)

def _parse_bool(v, default=False):
    if v is None:
        return default
    return str(v).strip().lower() in ("1", "true", "yes", "y", "on")

def _parse_int(v):
    if v in (None, "", "null", "undefined"):
        return None
    return int(v)

@override_log_bp.route("/api/companies/<int:cid>/override-log", methods=["GET", "POST", "OPTIONS"])
@require_auth
def override_log_collection_route(cid: int):
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
            status = (request.args.get("status") or "").strip().lower()
            override_type = (request.args.get("override_type") or "").strip().lower()
            severity = (request.args.get("severity") or "").strip().lower()
            assigned_to_user_id = _parse_int(request.args.get("assigned_to_user_id"))
            q = (request.args.get("q") or "").strip()
            active_only = _parse_bool(request.args.get("active_only"), True)
            limit = _parse_int(request.args.get("limit")) or 100
            offset = _parse_int(request.args.get("offset")) or 0

            with db_service._conn_cursor() as (conn, cur):
                rows = db_service.list_engagement_override_log_items(
                    cur,
                    company_id,
                    engagement_id=engagement_id,
                    customer_id=customer_id,
                    status=status,
                    override_type=override_type,
                    severity=severity,
                    assigned_to_user_id=assigned_to_user_id,
                    q=q,
                    active_only=active_only,
                    limit=limit,
                    offset=offset,
                )
            return _json_ok(rows or [])

        body = request.get_json(force=True, silent=True) or {}
        user_id = payload.get("user_id")

        with db_service._conn_cursor() as (conn, cur):
            item_id = db_service.create_engagement_override_log_item(
                cur,
                company_id,
                engagement_id=int(body["engagement_id"]),
                source_type=body.get("source_type") or "engagement",
                source_id=body.get("source_id"),
                override_type=body.get("override_type") or "override",
                severity=body.get("severity") or "medium",
                title=body["title"],
                description=body.get("description"),
                rationale=body.get("rationale"),
                resolution_summary=body.get("resolution_summary"),
                status=body.get("status") or "open",
                decision_outcome=body.get("decision_outcome"),
                override_reason_code=body.get("override_reason_code"),
                assigned_to_user_id=body.get("assigned_to_user_id"),
                requested_by_user_id=body.get("requested_by_user_id") or user_id,
                decided_by_user_id=body.get("decided_by_user_id"),
                resolved_by_user_id=body.get("resolved_by_user_id"),
                decision_date=body.get("decision_date"),
                resolved_at=body.get("resolved_at"),
                closed_at=body.get("closed_at"),
                due_date=body.get("due_date"),
                is_sensitive=body.get("is_sensitive", False),
                created_by_user_id=user_id,
                updated_by_user_id=user_id,
            )
            conn.commit()
            row = db_service.get_engagement_override_log_detail(
                cur,
                company_id,
                override_log_id=item_id,
            )

        return _json_ok(row or {}, 201)

    except KeyError as e:
        return _json_err(f"Missing required field: {e}", 400)
    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("override_log_collection_route failed")
        return _json_err(str(e), 500)


@override_log_bp.route("/api/companies/<int:cid>/override-log/dashboard", methods=["GET", "OPTIONS"])
@require_auth
def override_log_dashboard_route(cid: int):
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
        override_type = (request.args.get("override_type") or "").strip().lower()
        severity = (request.args.get("severity") or "").strip().lower()
        assigned_to_user_id = _parse_int(request.args.get("assigned_to_user_id"))
        q = (request.args.get("q") or "").strip()
        active_only = _parse_bool(request.args.get("active_only"), True)
        limit = _parse_int(request.args.get("limit")) or 100
        offset = _parse_int(request.args.get("offset")) or 0

        with db_service._conn_cursor() as (conn, cur):
            summary = db_service.get_engagement_override_log_summary(
                cur,
                company_id,
                engagement_id=engagement_id,
                customer_id=customer_id,
                q=q,
                active_only=active_only,
            )
            rows = db_service.list_engagement_override_log_items(
                cur,
                company_id,
                engagement_id=engagement_id,
                customer_id=customer_id,
                status=status,
                override_type=override_type,
                severity=severity,
                assigned_to_user_id=assigned_to_user_id,
                q=q,
                active_only=active_only,
                limit=limit,
                offset=offset,
            )

        return _json_ok({
            "summary": summary or {},
            "items": rows or [],
        })

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("override_log_dashboard_route failed")
        return _json_err(str(e), 500)


@override_log_bp.route("/api/companies/<int:cid>/override-log/<int:override_log_id>", methods=["GET", "PATCH", "PUT", "OPTIONS"])
@require_auth
def override_log_item_route(cid: int, override_log_id: int):
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
                row = db_service.get_engagement_override_log_detail(
                    cur,
                    company_id,
                    override_log_id=override_log_id,
                )
            if not row:
                return _json_err("Override log item not found", 404)
            return _json_ok(row)

        body = request.get_json(force=True, silent=True) or {}
        user_id = payload.get("user_id")

        with db_service._conn_cursor() as (conn, cur):
            updated = db_service.update_engagement_override_log_item(
                cur,
                company_id,
                override_log_id=override_log_id,
                source_type=body.get("source_type"),
                source_id=body.get("source_id"),
                override_type=body.get("override_type"),
                severity=body.get("severity"),
                title=body.get("title"),
                description=body.get("description"),
                rationale=body.get("rationale"),
                resolution_summary=body.get("resolution_summary"),
                status=body.get("status"),
                decision_outcome=body.get("decision_outcome"),
                override_reason_code=body.get("override_reason_code"),
                assigned_to_user_id=body.get("assigned_to_user_id"),
                requested_by_user_id=body.get("requested_by_user_id"),
                decided_by_user_id=body.get("decided_by_user_id"),
                resolved_by_user_id=body.get("resolved_by_user_id"),
                decision_date=body.get("decision_date"),
                resolved_at=body.get("resolved_at"),
                closed_at=body.get("closed_at"),
                due_date=body.get("due_date"),
                is_sensitive=body.get("is_sensitive"),
                updated_by_user_id=user_id,
            )
            if not updated:
                return _json_err("Override log item not found", 404)

            conn.commit()
            row = db_service.get_engagement_override_log_detail(
                cur,
                company_id,
                override_log_id=override_log_id,
            )

        return _json_ok(row or {})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("override_log_item_route failed")
        return _json_err(str(e), 500)


@override_log_bp.route("/api/companies/<int:cid>/override-log/<int:override_log_id>/status", methods=["POST", "OPTIONS"])
@require_auth
def override_log_status_route(cid: int, override_log_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    try:
        company_id = int(cid)
        payload = request.jwt_payload or {}
        deny = _deny_if_wrong_company(payload, company_id, db_service=db_service)
        if deny:
            return deny

        body = request.get_json(force=True, silent=True) or {}
        status = (body.get("status") or "").strip().lower()
        user_id = payload.get("user_id")

        with db_service._conn_cursor() as (conn, cur):
            updated = db_service.set_engagement_override_log_status(
                cur,
                company_id,
                override_log_id=override_log_id,
                status=status,
                decision_outcome=body.get("decision_outcome"),
                resolution_summary=body.get("resolution_summary"),
                actor_user_id=user_id,
            )
            if not updated:
                return _json_err("Override log item not found", 404)

            conn.commit()
            row = db_service.get_engagement_override_log_detail(
                cur,
                company_id,
                override_log_id=override_log_id,
            )

        return _json_ok(row or {})

    except ValueError as e:
        return _json_err(str(e), 400)
    except Exception as e:
        current_app.logger.exception("override_log_status_route failed")
        return _json_err(str(e), 500)