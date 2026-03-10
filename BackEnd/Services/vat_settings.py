# BackEnd/Services/vat_settings.py
from flask import Blueprint, request, jsonify, g, current_app
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.db_service import db_service

bp = Blueprint("companies_vat_settings", __name__)

def _deny_if_wrong_company(payload, company_id: int):
    role = (payload.get("role") or "").strip().lower()

    if role == "admin":
        return None

    allowed_company_ids = payload.get("allowed_company_ids") or []
    try:
        allowed_company_ids = [int(x) for x in allowed_company_ids]
    except Exception:
        allowed_company_ids = []

    token_company_id = payload.get("company_id")
    try:
        token_company_id = int(token_company_id) if token_company_id is not None else None
    except Exception:
        token_company_id = None

    target_company_id = int(company_id)

    if target_company_id in allowed_company_ids:
        return None

    if token_company_id == target_company_id:
        return None

    return jsonify({"ok": False, "error": "Access denied for this company"}), 403


@bp.get("/api/companies/<int:company_id>/vat_settings")
@require_auth
def get_vat_settings(company_id):

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    cfg = db_service.get_vat_settings(company_id) or {}
    return jsonify(cfg), 200


@bp.put("/api/companies/<int:company_id>/vat_settings")
@require_auth
def update_vat_settings(company_id: int):

    # -------------------------------------------------
    # Auth guard (JWT company scope)
    # -------------------------------------------------
    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    user_id = payload.get("sub") or payload.get("user_id")

    # -------------------------------------------------
    # Parse body
    # -------------------------------------------------
    data = request.get_json(silent=True) or {}

    freq = (data.get("frequency") or "bi_monthly").lower()
    if freq not in ("monthly", "bi_monthly", "quarterly", "semi_annual", "annual"):
        freq = "bi_monthly"

    anchor_month = int(data.get("anchor_month") or 1)
    anchor_month = max(1, min(12, anchor_month))

    filing_lag_days = int(data.get("filing_lag_days") or 25)
    filing_lag_days = max(0, filing_lag_days)

    reminder_days_before = int(data.get("reminder_days_before") or 10)
    reminder_days_before = max(0, reminder_days_before)

    prices_include_vat = bool(
        data.get("prices_include_vat")
        or data.get("pricing_includes_vat")
        or False
    )

    # -------------------------------------------------
    # Config object
    # -------------------------------------------------
    cfg = {
        "frequency": freq,
        "anchor_month": anchor_month,
        "filing_lag_days": filing_lag_days,
        "reminder_days_before": reminder_days_before,
        "country": (data.get("country") or "").upper() or "ZA",
        "prices_include_vat": prices_include_vat,
    }

    # -------------------------------------------------
    # Save settings
    # -------------------------------------------------
    ok = db_service.save_vat_settings(company_id, cfg)
    if not ok:
        return jsonify({"error": "Failed to save VAT settings"}), 500

    # -------------------------------------------------
    # AUDIT LOG (best-effort)
    # -------------------------------------------------
    try:
        db_service.audit_log(
            company_id=int(company_id),
            actor_user_id=int(user_id or 0),
            module="tax",
            action="update_vat_settings",
            severity="info",
            entity_type="vat_settings",
            entity_id=str(company_id),
            entity_ref=f"VAT-{company_id}",
            before_json={},           # you can load previous config if needed
            after_json=cfg,
            message="Updated VAT settings",
            source="api",
        )
    except Exception:
        current_app.logger.exception(
            "audit_log failed (update_vat_settings)"
        )

    return jsonify(cfg), 200


