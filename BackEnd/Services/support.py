# BackEnd-support/support_bp.py
from flask import Blueprint, request, jsonify, g, make_response, current_app
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.auth_middleware import require_auth, _corsify
from BackEnd.Services.db_service import db_service

support_bp = Blueprint("support", __name__)


def _get_auth_context(company_id: int):
    payload = getattr(request, "jwt_payload", {}) or {}

    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return None, None, None, deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return None, None, None, (jsonify({"error": "AUTH|missing_user_id"}), 401)

    user = db_service.get_user_context(user_id=user_id, company_id=int(company_id))
    if not user:
        return None, None, None, (jsonify({"error": "User has no access to this company"}), 403)

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    return payload, user_id, user, None


def _json_safe_ticket_rows(rows):
    tickets = []
    for row in rows or []:
        if isinstance(row, dict):
            item = row.copy()
        else:
            try:
                item = dict(row)
            except Exception:
                item = {
                    "id": row[0] if len(row) > 0 else None,
                    "email": row[1] if len(row) > 1 else None,
                    "subject": row[2] if len(row) > 2 else None,
                    "status": row[3] if len(row) > 3 else None,
                    "priority": row[4] if len(row) > 4 else None,
                    "created_at": row[5] if len(row) > 5 else None,
                    "updated_at": row[6] if len(row) > 6 else None,
                }

        if item.get("created_at") is not None:
            item["created_at"] = str(item["created_at"])
        if item.get("updated_at") is not None:
            item["updated_at"] = str(item["updated_at"])
        if item.get("resolved_at") is not None:
            item["resolved_at"] = str(item["resolved_at"])

        tickets.append(item)
    return tickets

@support_bp.route("/api/support/submit", methods=["POST", "OPTIONS"])
@require_auth
def submit_ticket():
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return jsonify({"error": "AUTH|missing_user_id"}), 401

    company_id = payload.get("company_id")
    if not company_id:
        return jsonify({"error": "AUTH|missing_company_id"}), 401

    user = db_service.get_user_context(user_id=user_id, company_id=int(company_id))
    if not user:
        return jsonify({"error": "User has no access to this company"}), 403

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    try:
        data = request.get_json(silent=True) or request.form or {}

        with db_service._conn_cursor() as (conn, cur):
            ticket_id = db_service.insert_ticket(
                cur,
                int(company_id),
                user_id=user_id,
                email=data.get("email"),
                subject=data.get("subject"),
                description=data.get("description"),
                priority=data.get("priority", "normal"),
                created_by=user_id,
            )
            conn.commit()

        return jsonify({"ok": True, "ticket_id": ticket_id}), 201

    except Exception as e:
        current_app.logger.exception("submit_ticket error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


@support_bp.route("/api/companies/<int:company_id>/support/tickets", methods=["POST", "OPTIONS"])
@require_auth
def create_ticket(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    _, user_id, _, deny = _get_auth_context(company_id)
    if deny:
        return deny

    try:
        data = request.get_json(silent=True) or {}

        with db_service._conn_cursor() as (conn, cur):
            ticket_id = db_service.insert_ticket(
                cur,
                int(company_id),
                user_id=user_id,
                email=data.get("email"),
                subject=data.get("subject"),
                description=data.get("description"),
                priority=data.get("priority", "normal"),
                created_by=user_id,
            )
            conn.commit()

        return jsonify({"ok": True, "ticket_id": ticket_id}), 201

    except Exception as e:
        current_app.logger.exception("create_ticket error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


@support_bp.route("/api/companies/<int:company_id>/support/tickets", methods=["GET", "OPTIONS"])
@require_auth
def list_tickets(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    _, _, _, deny = _get_auth_context(company_id)
    if deny:
        return deny

    try:
        with db_service._conn_cursor() as (conn, cur):
            rows = db_service.list_tickets(cur, int(company_id)) or []

        tickets = _json_safe_ticket_rows(rows)
        return jsonify({"ok": True, "tickets": tickets}), 200

    except Exception as e:
        current_app.logger.exception("list_tickets error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


@support_bp.route("/api/companies/<int:company_id>/support/tickets/<int:ticket_id>", methods=["GET", "OPTIONS"])
@require_auth
def get_ticket(company_id: int, ticket_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    _, _, _, deny = _get_auth_context(company_id)
    if deny:
        return deny

    try:
        with db_service._conn_cursor() as (conn, cur):
            ticket = db_service.get_ticket_by_id(cur, int(company_id), int(ticket_id))

        if not ticket:
            return jsonify({"error": "Ticket not found"}), 404

        ticket = dict(ticket) if not isinstance(ticket, dict) else ticket.copy()
        if ticket.get("created_at") is not None:
            ticket["created_at"] = str(ticket["created_at"])
        if ticket.get("updated_at") is not None:
            ticket["updated_at"] = str(ticket["updated_at"])
        if ticket.get("resolved_at") is not None:
            ticket["resolved_at"] = str(ticket["resolved_at"])

        return jsonify({"ok": True, "ticket": ticket}), 200

    except Exception as e:
        current_app.logger.exception("get_ticket error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


@support_bp.route("/api/companies/<int:company_id>/support/tickets/<int:ticket_id>", methods=["PUT", "OPTIONS"])
@require_auth
def update_ticket(company_id: int, ticket_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    _, _, _, deny = _get_auth_context(company_id)
    if deny:
        return deny

    try:
        data = request.get_json(silent=True) or {}

        with db_service._conn_cursor() as (conn, cur):
            ticket_id_updated = db_service.update_ticket(
                cur,
                int(company_id),
                int(ticket_id),
                status=data.get("status"),
                priority=data.get("priority"),
                assigned_to=data.get("assigned_to"),
                notes=data.get("notes"),
                resolved_at=data.get("resolved_at"),
            )

            if not ticket_id_updated:
                return jsonify({"error": "Ticket not found or nothing to update"}), 404

            conn.commit()

        return jsonify({"ok": True, "ticket_id": ticket_id_updated}), 200

    except Exception as e:
        current_app.logger.exception("update_ticket error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


@support_bp.route("/api/companies/<int:company_id>/support/tickets/<int:ticket_id>", methods=["DELETE", "OPTIONS"])
@require_auth
def delete_ticket(company_id: int, ticket_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    _, _, _, deny = _get_auth_context(company_id)
    if deny:
        return deny

    try:
        data = request.get_json(silent=True) or {}

        with db_service._conn_cursor() as (conn, cur):
            ticket_id_voided = db_service.void_ticket(
                cur,
                int(company_id),
                int(ticket_id),
                notes=data.get("notes"),
            )

            if not ticket_id_voided:
                return jsonify({"error": "Ticket not found"}), 404

            conn.commit()

        return jsonify({"ok": True, "ticket_id": ticket_id_voided, "status": "void"}), 200

    except Exception as e:
        current_app.logger.exception("delete_ticket error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500