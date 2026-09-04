# FinSage Control — Auth Decorator
"""
Adds require_control_auth to the existing auth_middleware pattern.
Control agents must have a valid JWT AND be in control.support_agents.
No company context required — Control is cross-company.
"""
from functools import wraps

from flask import request, jsonify, g, make_response, current_app


def _corsify(resp):
    """Apply CORS headers — mirrors the existing auth_middleware pattern."""
    origin = request.headers.get("Origin")
    allowed_origins = current_app.config.get("FRONTEND_ORIGINS", [])
    if origin and origin in allowed_origins:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Vary"] = "Origin"
        resp.headers["Access-Control-Allow-Credentials"] = "true"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    return resp


def require_control_auth(f):
    """
    Decorator for FinSage Control routes.

    - Validates JWT token (same decode as the main app)
    - Checks user exists in control.support_agents
    - Sets g.control_agent with agent profile
    - Does NOT require company context (Control is cross-company)
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        if request.method == "OPTIONS":
            return _corsify(make_response("", 204))

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return _corsify(make_response(
                jsonify({"error": "Missing or invalid Authorization header"}), 401
            ))

        token = auth_header.split(" ", 1)[1].strip()

        # Decode JWT using the same method as the main app
        try:
            from BackEnd.Services.auth_service import decode_jwt
            payload = decode_jwt(token)
        except Exception:
            return _corsify(make_response(
                jsonify({"error": "Invalid or expired token"}), 401
            ))

        user_id = payload.get("sub") or payload.get("user_id")
        if not user_id:
            return _corsify(make_response(
                jsonify({"error": "Invalid token payload"}), 401
            ))

        try:
            user_id = int(user_id)
        except (ValueError, TypeError):
            return _corsify(make_response(
                jsonify({"error": "Invalid user id in token"}), 401
            ))

        # ── Check Control access ──
        from BackEnd.Services.db_service import db_service
        from backend.services.control_service import ControlService

        cs = ControlService(db_service)
        agent = cs.get_agent_by_user_id(user_id)

        if not agent:
            return _corsify(make_response(
                jsonify({"error": "No Control access — user is not a support agent"}), 403
            ))

        g.user_id = user_id
        g.control_agent = agent
        g.control_service = cs
        request.jwt_payload = payload

        return f(*args, **kwargs)

    return wrapper


def require_control_admin(f):
    """
    Like require_control_auth, but also requires agent.role = 'admin'.
    Use for settings/admin endpoints.
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        # First run the standard control auth
        result = require_control_auth(f)(*args, **kwargs)

        # Check if we got a response (error) or the function returned
        if hasattr(result, 'status_code') and result.status_code != 200:
            return result

        agent = getattr(g, 'control_agent', None)
        if not agent or agent.get('role') != 'admin':
            return _corsify(make_response(
                jsonify({"error": "Admin access required"}), 403
            ))

        return result

    return wrapper
