# FinSage Control — Auth Routes
"""
Control login / session endpoints.

Control authentication is separate from normal FinSage authentication.
Control identities are stored in control.control_users.
"""

from flask import Blueprint, request, jsonify, g


control_auth_bp = Blueprint(
    'control_auth',
    __name__,
    url_prefix='/api/control'
)


@control_auth_bp.route('/auth/login', methods=['POST'])
def control_login():
    """
    Login to FinSage Control.

    Authenticates against control.control_users and issues
    a dedicated Control JWT.
    """
    data = request.get_json(silent=True) or {}

    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    from BackEnd.Services.db_service import db_service
    from BackEnd.Services.service_control.service_control import ControlService
    from BackEnd.Services.auth_service import (
        verify_password,
        make_control_jwt,
    )

    cs = ControlService(db_service)

    if not email or not password:
        cs.audit(
            action="auth.login_failed",
            entity_type="control_user",
            description=(
                "Control administrator login attempt failed "
                "because credentials were incomplete."
            ),
            metadata={"email": email} if email else None,
            request=request,
        )

        return jsonify({
            "error": "Email and password required"
        }), 400

    user = db_service.fetch_one(
        """
        SELECT
            cu.id,
            cu.email,
            cu.password_hash,
            cu.display_name,
            cu.role,
            cu.team_id,
            cu.is_active,
            t.name AS team_name
        FROM control.control_users cu
        LEFT JOIN control.teams t
            ON t.id = cu.team_id
        WHERE LOWER(cu.email) = %s
        LIMIT 1
        """,
        (email,)
    )

    if not user:
        cs.audit(
            action="auth.login_failed",
            entity_type="control_user",
            description="Failed Control administrator login attempt.",
            metadata={"email": email},
            request=request,
        )

        return jsonify({
            "error": "Invalid credentials"
        }), 401

    control_user_id = int(user['id'])

    if not user.get('is_active'):
        cs.audit(
            action="auth.login_failed",
            entity_type="control_user",
            entity_id=control_user_id,
            description=(
                "Control administrator login attempt failed "
                "because the account is disabled."
            ),
            request=request,
        )

        return jsonify({
            "error": "Account is disabled"
        }), 403

    if not verify_password(
        password,
        user.get('password_hash') or ''
    ):
        cs.audit(
            action="auth.login_failed",
            entity_type="control_user",
            entity_id=control_user_id,
            description="Failed Control administrator login attempt.",
            request=request,
            control_user_id=control_user_id,
        )

        return jsonify({
            "error": "Invalid credentials"
        }), 401

    role = (user.get('role') or 'agent').strip().lower()

    # Permissions will be loaded from Control RBAC as that layer is connected.
    permissions = {}

    token = make_control_jwt(
        control_user_id=control_user_id,
        email=user['email'],
        role=role,
        permissions=permissions,
    )

    db_service.execute_sql(
        """
        UPDATE control.control_users
        SET last_login_at = NOW(),
            updated_at = NOW()
        WHERE id = %s
        """,
        (control_user_id,)
    )

    cs.audit(
        action="auth.login",
        entity_type="control_user",
        entity_id=control_user_id,
        description="Control administrator logged in.",
        metadata={
            "role": role,
            "team_id": user.get('team_id'),
        },
        request=request,
        control_user_id=control_user_id,
    )

    return jsonify({
        "token": token,
        "control_user": {
            "id": control_user_id,
            "email": user['email'],
            "display_name": user.get('display_name'),
            "role": role,
            "team_id": user.get('team_id'),
            "team_name": user.get('team_name'),
        }
    })


@control_auth_bp.route('/auth/me', methods=['GET'])
def control_me():
    """Return the current Control user's profile."""
    from BackEnd.Services.control_auth import require_control_auth

    @require_control_auth
    def _inner():
        user = g.control_user

        return jsonify({
            "id": int(user['id']),
            "email": user.get('email'),
            "display_name": user.get('display_name'),
            "role": user.get('role'),
            "team_id": user.get('team_id'),
            "team_name": user.get('team_name'),
        })

    return _inner()