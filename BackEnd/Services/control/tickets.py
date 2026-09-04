# FinSage Control — Ticket Routes
"""Full CRUD for tickets, messages, notes, and history."""
from flask import Blueprint, request, jsonify, g

from backend.control_auth import require_control_auth

tickets_bp = Blueprint('control_tickets', __name__, url_prefix='/control/api')


# ────────────────────────────────────────
# TICKET LIST & DETAIL
# ────────────────────────────────────────

@tickets_bp.route('/tickets', methods=['GET'])
@require_control_auth
def list_tickets():
    filters = {
        'status': request.args.get('status'),
        'priority': request.args.get('priority'),
        'ticket_type': request.args.get('ticket_type'),
        'category_id': request.args.get('category_id'),
        'assigned_agent_id': request.args.get('assigned_agent_id'),
        'company_id': request.args.get('company_id'),
        'search': request.args.get('search', '').strip(),
    }
    # Remove None values
    filters = {k: v for k, v in filters.items() if v}
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    per_page = min(per_page, 100)

    result = g.control_service.get_tickets(filters=filters, page=page, per_page=per_page)
    return jsonify(result)


@tickets_bp.route('/tickets', methods=['POST'])
@require_control_auth
def create_ticket():
    data = request.get_json(silent=True) or {}
    if not data.get('subject') or not data.get('description'):
        return jsonify({"error": "subject and description are required"}), 400

    agent = g.control_agent
    ticket = g.control_service.create_ticket(data, agent_id=agent['id'])
    return jsonify(ticket), 201


@tickets_bp.route('/tickets/<int:ticket_id>', methods=['GET'])
@require_control_auth
def get_ticket(ticket_id):
    ticket = g.control_service.get_ticket(ticket_id)
    if not ticket:
        return jsonify({"error": "Ticket not found"}), 404
    return jsonify(ticket)


@tickets_bp.route('/tickets/<int:ticket_id>', methods=['PATCH'])
@require_control_auth
def update_ticket(ticket_id):
    data = request.get_json(silent=True) or {}
    agent = g.control_agent
    ticket = g.control_service.update_ticket(ticket_id, data, agent_id=agent['id'])
    if not ticket:
        return jsonify({"error": "Ticket not found"}), 404
    return jsonify(ticket)


@tickets_bp.route('/tickets/<int:ticket_id>', methods=['DELETE'])
@require_control_auth
def delete_ticket(ticket_id):
    agent = g.control_agent
    g.control_service.delete_ticket(ticket_id, agent_id=agent['id'])
    return jsonify({"ok": True})


# ────────────────────────────────────────
# TICKET MESSAGES (customer-visible)
# ────────────────────────────────────────

@tickets_bp.route('/tickets/<int:ticket_id>/messages', methods=['GET'])
@require_control_auth
def get_messages(ticket_id):
    messages = g.control_service.get_ticket_messages(ticket_id)
    return jsonify(messages)


@tickets_bp.route('/tickets/<int:ticket_id>/messages', methods=['POST'])
@require_control_auth
def add_message(ticket_id):
    data = request.get_json(silent=True) or {}
    if not data.get('body'):
        return jsonify({"error": "body is required"}), 400

    agent = g.control_agent
    data['sender_name'] = agent['display_name']
    data['sender_email'] = None  # Can be populated from user table

    message = g.control_service.add_ticket_message(
        ticket_id, data, agent_id=agent['id']
    )
    return jsonify(message), 201


# ────────────────────────────────────────
# TICKET NOTES (internal only)
# ────────────────────────────────────────

@tickets_bp.route('/tickets/<int:ticket_id>/notes', methods=['GET'])
@require_control_auth
def get_notes(ticket_id):
    notes = g.control_service.get_ticket_notes(ticket_id)
    return jsonify(notes)


@tickets_bp.route('/tickets/<int:ticket_id>/notes', methods=['POST'])
@require_control_auth
def add_note(ticket_id):
    data = request.get_json(silent=True) or {}
    if not data.get('body'):
        return jsonify({"error": "body is required"}), 400

    agent = g.control_agent
    note = g.control_service.add_ticket_note(
        ticket_id, data['body'], agent_id=agent['id']
    )
    return jsonify(note), 201


@tickets_bp.route('/tickets/<int:ticket_id>/notes/<int:note_id>', methods=['PUT'])
@require_control_auth
def update_note(ticket_id, note_id):
    data = request.get_json(silent=True) or {}
    if not data.get('body'):
        return jsonify({"error": "body is required"}), 400

    agent = g.control_agent
    note = g.control_service.update_ticket_note(
        note_id, data['body'], agent_id=agent['id']
    )
    if not note:
        return jsonify({"error": "Note not found"}), 404
    return jsonify(note)


@tickets_bp.route('/tickets/<int:ticket_id>/notes/<int:note_id>', methods=['DELETE'])
@require_control_auth
def delete_note(ticket_id, note_id):
    agent = g.control_agent
    g.control_service.delete_ticket_note(note_id, agent_id=agent['id'])
    return jsonify({"ok": True})


# ────────────────────────────────────────
# TICKET HISTORY (audit trail)
# ────────────────────────────────────────

@tickets_bp.route('/tickets/<int:ticket_id>/history', methods=['GET'])
@require_control_auth
def get_history(ticket_id):
    history = g.control_service.get_ticket_history(ticket_id)
    return jsonify(history)
