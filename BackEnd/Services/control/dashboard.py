# FinSage Control — Dashboard Routes
from flask import Blueprint, jsonify, g

from backend.control_auth import require_control_auth

dashboard_bp = Blueprint('control_dashboard', __name__, url_prefix='/control/api')


@dashboard_bp.route('/dashboard', methods=['GET'])
@require_control_auth
def get_dashboard():
    """Return aggregated dashboard statistics."""
    stats = g.control_service.get_dashboard_stats()
    return jsonify(stats)
