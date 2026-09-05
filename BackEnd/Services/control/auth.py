# FinSage Control — Auth Routes
"""
Control login / session endpoints.
Reuses the main FinSage auth for JWT generation,
then checks/creates the agent record.
"""
from flask import Blueprint, request, jsonify, g, current_app

control_auth_bp = Blueprint('control_auth', __name__, url_prefix='/control/api')


@control_auth_bp.route('/auth/login', methods=['POST'])
def control_login():
    """
    Login to FinSage Control.
    Accepts email + password, authenticates via main FinSage auth,
    then checks/creates the control.support_agents record.
    Returns a JWT token and agent profile.
    """
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    # Authenticate against main FinSage users table
    from BackEnd.Services.db_service import db_service
    from werkzeug.security import check_password_hash

    user = db_service.fetch_one(
        "SELECT id, email, first_name, last_name, password_hash, is_active FROM public.users WHERE email = %s",
        (email,)
    )

    if not user:
        return jsonify({"error": "Invalid credentials"}), 401

    if not user.get('is_active'):
        return jsonify({"error": "Account is disabled"}), 403

    if not check_password_hash(user['password_hash'] or '', password):
        return jsonify({"error": "Invalid credentials"}), 401

    # Generate JWT using the main app's method
    from BackEnd.Services.auth_service import generate_jwt
    from BackEnd.Services.service_control.service_control import ControlService

    user_id = user['id']
    payload = {
        'sub': user_id,
        'email': user['email'],
        'first_name': user.get('first_name'),
        'last_name': user.get('last_name'),
        'access_scope': 'control',
    }
    token = generate_jwt(payload)

    # Register/check agent
    cs = ControlService(db_service)
    display_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
    agent = cs.register_agent(user_id, display_name)

    return jsonify({
        "token": token,
        "agent": {
            "id": agent['id'],
            "user_id": agent['user_id'],
            "display_name": agent['display_name'],
            "role": agent['role'],
            "team_id": agent['team_id'],
            "team_name": agent.get('team_name'),
        }
    })


@control_auth_bp.route('/auth/me', methods=['GET'])
def control_me():
    """Return the current agent's profile (requires auth)."""
    from BackEnd.Services.control_auth import require_control_auth

    @require_control_auth
    def _inner():
        agent = g.control_agent
        return jsonify({
            "id": agent['id'],
            "user_id": agent['user_id'],
            "display_name": agent['display_name'],
            "role": agent['role'],
            "team_id": agent['team_id'],
            "team_name": agent.get('team_name'),
        })

    return _inner()
