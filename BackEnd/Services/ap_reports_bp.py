from flask import Blueprint, jsonify, request, g, current_app, make_response
from datetime import date
from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import _corsify, require_auth

ap_reports_bp = Blueprint("ap_reports_bp", __name__)

def _parse_date(s: str, fallback: date) -> date:
    try:
        return date.fromisoformat((s or "")[:10])
    except Exception:
        return fallback



@ap_reports_bp.route("/api/companies/<int:cid>/ap/vendors/<int:vendor_id>/statement", methods=["GET","OPTIONS"])
@require_auth
def vendor_statement(cid: int, vendor_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    company_id = int(cid)
    user = getattr(g, "current_user", {}) or {}
    if user.get("company_id") != company_id:
        return jsonify({"error": "Not authorised for this company"}), 403

    today = date.today()
    date_from = _parse_date(request.args.get("from", ""), today.replace(day=1))
    date_to   = _parse_date(request.args.get("to", ""), today)

    try:
        data = db_service.get_vendor_statement(
            company_id=company_id,
            vendor_id=int(vendor_id),
            date_from=date_from,
            date_to=date_to,
        )
        return jsonify({"ok": True, "data": data}), 200
    except Exception as e:
        current_app.logger.exception("vendor_statement failed")
        return jsonify({"ok": False, "error": str(e)}), 400

@ap_reports_bp.route("/api/companies/<int:cid>/ap/bills/<int:bill_id>/void", methods=["POST", "OPTIONS"])
@require_auth
def void_bill(cid: int, bill_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    company_id = int(cid)
    user = getattr(g, "current_user", {}) or {}

    if user.get("company_id") != company_id:
        return jsonify({"error": "Not authorised for this company"}), 403

    payload = request.get_json(silent=True) or {}
    reason = payload.get("reason") or "Voided after manual journal reversal"

    try:
        data = db_service.void_bill_after_manual_journal_reversal(
            company_id,
            int(bill_id),
            voided_by=user.get("id"),
            reason=reason,
        )
        return jsonify({"ok": True, "data": data}), 200
    except Exception as e:
        current_app.logger.exception("void_bill failed")
        return jsonify({"ok": False, "error": str(e)}), 400
    
@ap_reports_bp.route("/api/companies/<int:cid>/ap/control-reconciliation", methods=["GET","OPTIONS"])
@require_auth
def ap_control_reconciliation(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    company_id = int(cid)
    user = getattr(g, "current_user", {}) or {}
    if user.get("company_id") != company_id:
        return jsonify({"error": "Not authorised for this company"}), 403

    as_at = _parse_date(request.args.get("as_at", ""), date.today())

    try:
        data = db_service.get_ap_control_reconciliation(company_id, as_at=as_at)
        return jsonify({"ok": True, "data": data}), 200
    except Exception as e:
        current_app.logger.exception("ap_control_reconciliation failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@ap_reports_bp.route("/api/companies/<int:cid>/ap/aging", methods=["GET","OPTIONS"])
@require_auth
def ap_aging(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    company_id = int(cid)
    user = getattr(g, "current_user", {}) or {}
    if user.get("company_id") != company_id:
        return jsonify({"error": "Not authorised for this company"}), 403

    as_at = _parse_date(request.args.get("as_at", ""), date.today())

    vend = request.args.get("vendor_id")
    vendor_id = int(vend) if vend and str(vend).isdigit() else None

    try:
        data = db_service.get_ap_aging_report(
            company_id,
            as_at=as_at,
            vendor_id=vendor_id,
        )
        return jsonify({"ok": True, "data": data}), 200
    except Exception as e:
        current_app.logger.exception("ap_aging failed")
        return jsonify({"ok": False, "error": str(e)}), 400

