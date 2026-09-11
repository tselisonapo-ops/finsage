# FinSage Control — Dashboard Routes
from flask import Blueprint, jsonify, g, request, current_app

from BackEnd.Services.control_auth import require_control_auth

dashboard_bp = Blueprint('control_dashboard', __name__, url_prefix='/api/control')


@dashboard_bp.route('/dashboard', methods=['GET'])
@require_control_auth
def get_dashboard():
    """Return aggregated dashboard statistics."""
    stats = g.control_service.get_dashboard_stats()
    return jsonify(stats)

@dashboard_bp.get("/system/errors")
@require_control_auth
def get_system_errors():
    try:
        limit = request.args.get("limit", 50, type=int)

        errors = g.control_service.get_system_errors(
            limit=limit,
            unresolved_only=True,
        )

        return jsonify({
            "ok": True,
            "errors": errors or [],
        }), 200

    except Exception:
        current_app.logger.exception(
            "Failed to load Control system errors"
        )

        return jsonify({
            "ok": False,
            "error": "Unable to load system errors",
        }), 500


@dashboard_bp.get("/system/errors/<int:event_id>")
@require_control_auth
def get_system_error(event_id):
    try:
        error = g.control_service.get_system_error(event_id)

        if not error:
            return jsonify({
                "ok": False,
                "error": "System error not found",
            }), 404

        return jsonify({
            "ok": True,
            "error": error,
        }), 200

    except Exception:
        current_app.logger.exception(
            "Failed to load Control system error %s",
            event_id,
        )

        return jsonify({
            "ok": False,
            "error": "Unable to load system error",
        }), 500


@dashboard_bp.get("/system/errors/<int:event_id>/occurrences")
@require_control_auth
def get_system_error_occurrences(event_id):
    try:
        limit = request.args.get("limit", 100, type=int)

        error = g.control_service.get_system_error(event_id)

        if not error:
            return jsonify({
                "ok": False,
                "error": "System error not found",
            }), 404

        occurrences = g.control_service.get_system_error_occurrences(
            event_id,
            limit=limit,
        )

        return jsonify({
            "ok": True,
            "event": error,
            "occurrences": occurrences or [],
        }), 200

    except Exception:
        current_app.logger.exception(
            "Failed to load occurrences for system error %s",
            event_id,
        )

        return jsonify({
            "ok": False,
            "error": "Unable to load system error occurrences",
        }), 500


@dashboard_bp.patch("/system/errors/<int:event_id>/resolve")
@require_control_auth
def resolve_system_error(event_id):
    try:
        error = g.control_service.get_system_error(event_id)

        if not error:
            return jsonify({
                "ok": False,
                "error": "System error not found",
            }), 404

        resolved = g.control_service.resolve_system_error(event_id)

        return jsonify({
            "ok": True,
            "error": resolved,
        }), 200

    except Exception:
        current_app.logger.exception(
            "Failed to resolve Control system error %s",
            event_id,
        )

        return jsonify({
            "ok": False,
            "error": "Unable to resolve system error",
        }), 500


@dashboard_bp.patch("/system/errors/<int:event_id>/reopen")
@require_control_auth
def reopen_system_error(event_id):
    try:
        error = g.control_service.get_system_error(event_id)

        if not error:
            return jsonify({
                "ok": False,
                "error": "System error not found",
            }), 404

        reopened = g.control_service.reopen_system_error(event_id)

        return jsonify({
            "ok": True,
            "error": reopened,
        }), 200

    except Exception:
        current_app.logger.exception(
            "Failed to reopen Control system error %s",
            event_id,
        )

        return jsonify({
            "ok": False,
            "error": "Unable to reopen system error",
        }), 500