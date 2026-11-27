from __future__ import annotations

from flask import Blueprint, request, jsonify, current_app, make_response
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.db_service import db_service
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
invoice_templates_bp = Blueprint("invoice_templates_bp", __name__)

PRESET_TEMPLATES = [
    {
        "preset_id": "corporate_navy",
        "name": "Corporate Navy (Default)",
        "layout_style": "modern",
        "primary_color": "#0F2A3D",
        "accent_color": "#2FA4A9",
        "font_family": "Helvetica",
        "logo_alignment": "left",
        "show_logo": True,
        "show_tax_column": True,
        "show_discount_column": True,
        "show_item_code": False,
        "payment_terms_note": "Payment is strictly due within 30 days of the invoice date.",
        "footer_note": "Thank you for partnering with us!"
    },
    {
        "preset_id": "emerald_pro",
        "name": "Emerald Retail / Boutique",
        "layout_style": "modern",
        "primary_color": "#064E3B",
        "accent_color": "#10B981",
        "font_family": "Helvetica",
        "logo_alignment": "left",
        "show_logo": True,
        "show_tax_column": True,
        "show_discount_column": True,
        "show_item_code": True,
        "payment_terms_note": "Goods remain property of the supplier until fully paid.",
        "footer_note": "We appreciate your valued business."
    },
    {
        "preset_id": "minimalist_charcoal",
        "name": "Minimalist Charcoal",
        "layout_style": "minimalist",
        "primary_color": "#1F2937",
        "accent_color": "#4B5563",
        "font_family": "Helvetica",
        "logo_alignment": "right",
        "show_logo": True,
        "show_tax_column": True,
        "show_discount_column": False,
        "show_item_code": False,
        "payment_terms_note": "Due on receipt via EFT.",
        "footer_note": "Thank you!"
    },
    {
        "preset_id": "royal_blue",
        "name": "Royal Blue Enterprise",
        "layout_style": "bold",
        "primary_color": "#1E40AF",
        "accent_color": "#3B82F6",
        "font_family": "Helvetica",
        "logo_alignment": "left",
        "show_logo": True,
        "show_tax_column": True,
        "show_discount_column": True,
        "show_item_code": True,
        "payment_terms_note": "Electronic Funds Transfer (EFT) preferred. Please quote invoice # as reference.",
        "footer_note": "FinSage Verified Financial Document"
    }
]

def _corsify(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, x-pos-client-version, Accept"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    return resp

@invoice_templates_bp.route("/api/companies/<int:company_id>/invoice-templates/presets", methods=["GET", "OPTIONS"])
def get_presets(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))
    return _corsify(jsonify({"ok": True, "presets": PRESET_TEMPLATES}))

@invoice_templates_bp.route("/api/companies/<int:company_id>/invoice-templates", methods=["GET", "POST", "OPTIONS"])
@require_auth
def list_or_create_templates(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))
    payload = getattr(request, "auth_payload", {}) or {}
    current_app.logger.warning(
        "[INVOICE_TEMPLATES_AUTH] "
        "requested_company=%s role=%s user_id=%s "
        "company_id=%s token_company_id=%s "
        "allowed_company_ids=%s token_allowed_company_ids=%s "
        "target_company_id=%s source_company_id=%s "
        "is_delegated=%s access_scope=%s",
        company_id,
        payload.get("role"),
        payload.get("user_id"),
        payload.get("company_id"),
        payload.get("token_company_id"),
        payload.get("allowed_company_ids"),
        payload.get("token_allowed_company_ids"),
        payload.get("target_company_id"),
        payload.get("source_company_id"),
        payload.get("is_delegated_company_access"),
        payload.get("access_scope"),
    )
    payload = getattr(request, "jwt_payload", {}) or {}

    deny = _deny_if_wrong_company(
        payload,
        company_id,
        db_service=db_service,
        engagement_id=payload.get("engagement_id"),
    )
    if deny:
        return deny

    if request.method == "GET":
        templates = db_service.list_invoice_templates(company_id)
        return _corsify(jsonify({"ok": True, "templates": templates, "presets": PRESET_TEMPLATES}))

    # POST - create custom template
    body = request.get_json(silent=True) or {}
    if not body.get("template_name"):
        return _corsify(jsonify({"ok": False, "error": "template_name is required"})), 400

    created = db_service.create_invoice_template(company_id, body)
    return _corsify(jsonify({"ok": True, "template": created})), 201

@invoice_templates_bp.route("/api/companies/<int:company_id>/invoice-templates/<int:template_id>", methods=["GET", "PUT", "PATCH", "DELETE", "OPTIONS"])
@require_auth
def manage_single_template(company_id: int, template_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))
    payload = getattr(request, "auth_payload", {}) or {}
    deny = _deny_if_wrong_company(
        payload,
        company_id,
        db_service=db_service,
        engagement_id=payload.get("engagement_id"),
    )

    if deny:
        return deny

    if request.method == "GET":
        tpl = db_service.get_invoice_template(company_id, template_id)
        if not tpl:
            return _corsify(jsonify({"ok": False, "error": "Template not found"})), 404
        return _corsify(jsonify({"ok": True, "template": tpl}))

    if request.method in ("PUT", "PATCH"):
        body = request.get_json(silent=True) or {}
        updated = db_service.update_invoice_template(company_id, template_id, body)
        if not updated:
            return _corsify(jsonify({"ok": False, "error": "Template not found or not modified"})), 404
        return _corsify(jsonify({"ok": True, "template": updated}))

    if request.method == "DELETE":
        ok = db_service.delete_invoice_template(company_id, template_id)
        return _corsify(jsonify({"ok": ok}))

@invoice_templates_bp.route("/api/companies/<int:company_id>/invoice-templates/<int:template_id>/set-default", methods=["POST", "OPTIONS"])
@require_auth
def set_default_template(company_id: int, template_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))
    payload = getattr(request, "auth_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    updated = db_service.set_default_invoice_template(company_id, template_id)
    return _corsify(jsonify({"ok": True, "template": updated}))
