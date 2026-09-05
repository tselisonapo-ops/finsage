# FinSage Control — Settings Routes (Admin)
from flask import Blueprint, request, jsonify, g

from BackEnd.Services.control_auth import require_control_auth, require_control_admin

settings_bp = Blueprint('control_settings', __name__, url_prefix='/control/api/settings')


# ────────────────────────────────────────
# AGENTS
# ────────────────────────────────────────

@settings_bp.route('/agents', methods=['GET'])
@require_control_auth
def list_agents():
    include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
    agents = g.control_service.get_agents(include_inactive=include_inactive)
    return jsonify(agents)


@settings_bp.route('/agents', methods=['POST'])
@require_control_admin
def create_agent():
    data = request.get_json(silent=True) or {}
    if not data.get('user_id') or not data.get('display_name'):
        return jsonify({"error": "user_id and display_name are required"}), 400
    agent = g.control_service.create_agent(data)
    return jsonify(agent), 201


@settings_bp.route('/agents/<int:agent_id>', methods=['PUT'])
@require_control_admin
def update_agent(agent_id):
    data = request.get_json(silent=True) or {}
    agent = g.control_service.update_agent(agent_id, data)
    if not agent:
        return jsonify({"error": "Agent not found"}), 404
    return jsonify(agent)


# ────────────────────────────────────────
# TEAMS
# ────────────────────────────────────────

@settings_bp.route('/teams', methods=['GET'])
@require_control_auth
def list_teams():
    teams = g.control_service.get_teams()
    return jsonify(teams)


@settings_bp.route('/teams', methods=['POST'])
@require_control_admin
def create_team():
    data = request.get_json(silent=True) or {}
    if not data.get('name'):
        return jsonify({"error": "name is required"}), 400
    team = g.control_service.create_team(data)
    return jsonify(team), 201


@settings_bp.route('/teams/<int:team_id>', methods=['PUT'])
@require_control_admin
def update_team(team_id):
    data = request.get_json(silent=True) or {}
    team = g.control_service.update_team(team_id, data)
    if not team:
        return jsonify({"error": "Team not found"}), 404
    return jsonify(team)


# ────────────────────────────────────────
# CATEGORIES
# ────────────────────────────────────────

@settings_bp.route('/categories', methods=['GET'])
@require_control_auth
def list_categories():
    categories = g.control_service.get_categories()
    return jsonify(categories)


@settings_bp.route('/categories', methods=['POST'])
@require_control_admin
def create_category():
    data = request.get_json(silent=True) or {}
    if not data.get('name'):
        return jsonify({"error": "name is required"}), 400
    cat = g.control_service.create_category(data)
    return jsonify(cat), 201


@settings_bp.route('/categories/<int:cat_id>', methods=['PUT'])
@require_control_admin
def update_category(cat_id):
    data = request.get_json(silent=True) or {}
    cat = g.control_service.update_category(cat_id, data)
    if not cat:
        return jsonify({"error": "Category not found"}), 404
    return jsonify(cat)


# ────────────────────────────────────────
# SLAS
# ────────────────────────────────────────

@settings_bp.route('/slas', methods=['GET'])
@require_control_auth
def list_slas():
    slas = g.control_service.get_slas()
    return jsonify(slas)


@settings_bp.route('/slas/<int:sla_id>', methods=['PUT'])
@require_control_admin
def update_sla(sla_id):
    data = request.get_json(silent=True) or {}
    sla = g.control_service.update_sla(sla_id, data)
    if not sla:
        return jsonify({"error": "SLA not found"}), 404
    return jsonify(sla)
