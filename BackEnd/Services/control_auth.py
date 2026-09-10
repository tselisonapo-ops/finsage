# FinSage Control — Auth Decorator
"""
Authentication middleware for FinSage Control.

Control authentication is completely separate from normal FinSage users.
Control users are stored in control.control_users.

No company context is required because Control operates across companies.
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


def _check_control_auth(require_admin: bool = False):
    """
    Shared auth-check used by require_control_auth and require_control_admin.

    Returns:
      - None on success.
      - A Flask response object on failure.

    On success:
      g.control_user
      g.user_id
      g.control_service
      request.jwt_payload

    Control authentication is independent of public.users and
    public.company_users.
    """

    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        return _corsify(make_response(
            jsonify({"error": "Missing or invalid Authorization header"}),
            401
        ))

    token = auth_header.split(" ", 1)[1].strip()

    if not token:
        return _corsify(make_response(
            jsonify({"error": "Missing bearer token"}),
            401
        ))

    # Decode JWT using the same cryptographic configuration as the main app.
    try:
        from BackEnd.Services.auth_service import decode_jwt
        payload = decode_jwt(token)
    except Exception:
        return _corsify(make_response(
            jsonify({"error": "Invalid or expired token"}),
            401
        ))

    # A normal FinSage JWT must never be accepted by Control.
    if payload.get("access_scope") != "control":
        return _corsify(make_response(
            jsonify({"error": "Control access required"}),
            403
        ))

    if payload.get("token_type") != "control":
        return _corsify(make_response(
            jsonify({"error": "Invalid Control token"}),
            401
        ))

    control_user_id = payload.get("control_user_id")

    if control_user_id is None:
        return _corsify(make_response(
            jsonify({"error": "Invalid Control token payload"}),
            401
        ))

    try:
        control_user_id = int(control_user_id)
    except (ValueError, TypeError):
        return _corsify(make_response(
            jsonify({"error": "Invalid Control user id"}),
            401
        ))

    if control_user_id <= 0:
        return _corsify(make_response(
            jsonify({"error": "Invalid Control user id"}),
            401
        ))

    # Load the Control identity directly from control.control_users.
    from BackEnd.Services.db_service import db_service
    from BackEnd.Services.service_control.service_control import ControlService

    cs = ControlService(db_service)

    control_user = cs.get_control_user(control_user_id)

    if not control_user:
        return _corsify(make_response(
            jsonify({"error": "No Control access"}),
            403
        ))

    if not control_user.get("is_active"):
        return _corsify(make_response(
            jsonify({"error": "Control account is disabled"}),
            403
        ))

    # Keep the existing role-based admin protection for now.
    # The RBAC permission system can replace this with permission checks
    # once the Control permission loading is connected.
    if require_admin and (control_user.get("role") or "").strip().lower() != "admin":
        return _corsify(make_response(
            jsonify({"error": "Admin access required"}),
            403
        ))

    # Expose Control identity to protected routes.
    g.user_id = control_user_id
    g.control_user = control_user

    # Temporary compatibility alias for any older Control route that
    # still expects g.control_agent.
    g.control_agent = control_user

    g.control_service = cs
    request.jwt_payload = payload

    return None


def require_control_auth(f):
    """
    Decorator for FinSage Control routes.

    - Requires a valid Control JWT.
    - Requires access_scope == 'control'.
    - Requires token_type == 'control'.
    - Requires the Control identity to exist in control.control_users.
    - Requires the Control account to be active.
    - Does not require company context.
    """

    @wraps(f)
    def wrapper(*args, **kwargs):
        err = _check_control_auth(require_admin=False)

        if err is not None:
            return err

        return f(*args, **kwargs)

    return wrapper


def require_control_admin(f):
    """
    Decorator for Control admin routes.

    The admin check happens BEFORE the wrapped view executes, preventing
    non-admin users from triggering protected side effects.
    """

    @wraps(f)
    def wrapper(*args, **kwargs):
        err = _check_control_auth(require_admin=True)

        if err is not None:
            return err

        return f(*args, **kwargs)

    return wrapper