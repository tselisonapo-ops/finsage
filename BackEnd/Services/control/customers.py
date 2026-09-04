# FinSage Control — Customer Routes
"""Read-only access to FinSage company data with Control metadata."""
from flask import Blueprint, request, jsonify, g

from backend.control_auth import require_control_auth

customers_bp = Blueprint('control_customers', __name__, url_prefix='/control/api')


@customers_bp.route('/customers', methods=['GET'])
@require_control_auth
def list_customers():
    """List FinSage companies with Control ticket metadata."""
    search = request.args.get('search', '').strip()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    per_page = min(per_page, 100)

    result = g.control_service.get_customers(search=search, page=page, per_page=per_page)
    return jsonify(result)


@customers_bp.route('/customers/<int:company_id>', methods=['GET'])
@require_control_auth
def get_customer(company_id):
    """Customer 360 view."""
    customer = g.control_service.get_customer_360(company_id)
    if not customer:
        return jsonify({"error": "Company not found"}), 404
    return jsonify(customer)
