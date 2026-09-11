from flask import Blueprint, request, jsonify, g

from BackEnd.Services.control_auth import require_control_auth


control_audit_bp = Blueprint(
    "control_audit",
    __name__,
    url_prefix="/api/control/audit",
)


@control_audit_bp.get("")
@require_control_auth
def get_audit_events():
    limit = request.args.get(
        "limit",
        50,
        type=int,
    )

    offset = request.args.get(
        "offset",
        0,
        type=int,
    )

    control_user_id = request.args.get(
        "control_user_id",
        type=int,
    )

    entity_id = request.args.get(
        "entity_id",
        type=int,
    )

    company_id = request.args.get(
        "company_id",
        type=int,
    )

    action = request.args.get(
        "action"
    )

    entity_type = request.args.get(
        "entity_type"
    )

    date_from = request.args.get(
        "date_from"
    )

    date_to = request.args.get(
        "date_to"
    )

    result = (
        g.control_service.audit_service
        .get_events(
            limit=limit,
            offset=offset,
            control_user_id=control_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            company_id=company_id,
            date_from=date_from,
            date_to=date_to,
        )
    )

    return jsonify(result)


@control_audit_bp.get("/<int:audit_id>")
@require_control_auth
def get_audit_event(audit_id):
    event = (
        g.control_service.audit_service
        .get_event(audit_id)
    )

    if not event:
        return jsonify({
            "error": "Audit event not found."
        }), 404

    return jsonify({
        "event": event
    })


@control_audit_bp.get("/actions")
@require_control_auth
def get_audit_actions():
    return jsonify({
        "actions":
            g.control_service.audit_service
            .get_actions()
    })


@control_audit_bp.get("/entity-types")
@require_control_auth
def get_audit_entity_types():
    return jsonify({
        "entity_types":
            g.control_service.audit_service
            .get_entity_types()
    })