# BackEnd/Services/vat_settings.py
from flask import Blueprint, request, jsonify, g, current_app
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.db_service import db_service

bp = Blueprint("companies_vat_settings", __name__)

def _deny_if_wrong_company(
    payload,
    company_id: int,
    *,
    db_service,
    engagement_id: int | None = None,
):
    role = (payload.get("role") or "").strip().lower()
    if role == "admin":
        return None

    user_id = payload.get("user_id") or payload.get("sub")
    try:
        user_id = int(user_id) if user_id is not None else None
    except Exception:
        user_id = None

    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    try:
        target_company_id = int(company_id)
    except Exception:
        return jsonify({"ok": False, "error": "AUTH|invalid_company_id"}), 400

    token_company_id = payload.get("token_company_id", payload.get("company_id"))
    try:
        token_company_id = int(token_company_id) if token_company_id is not None else None
    except Exception:
        token_company_id = None

    allowed_company_ids = (
        payload.get("token_allowed_company_ids")
        or payload.get("allowed_company_ids")
        or []
    )
    try:
        allowed_company_ids = [int(x) for x in allowed_company_ids]
    except Exception:
        allowed_company_ids = []

    # direct access
    if target_company_id == token_company_id:
        return None

    if target_company_id in allowed_company_ids:
        return None

    # delegated access through engagement workspaces
    candidate_home_company_ids = []
    if token_company_id is not None:
        candidate_home_company_ids.append(token_company_id)

    for cid in allowed_company_ids:
        if cid not in candidate_home_company_ids:
            candidate_home_company_ids.append(cid)

    for home_company_id in candidate_home_company_ids:
        try:
            with db_service._conn_cursor() as (_, cur):
                delegated_ok = db_service.user_has_delegated_company_access(
                    cur,
                    user_id=user_id,
                    company_id=home_company_id,
                    target_company_id=target_company_id,
                    engagement_id=engagement_id,
                )
            if delegated_ok:
                return None
        except Exception as e:
            print("DELEGATED ACCESS CHECK FAILED", {
                "user_id": user_id,
                "home_company_id": home_company_id,
                "target_company_id": target_company_id,
                "engagement_id": engagement_id,
                "error": str(e),
            })

    return jsonify({"ok": False, "error": "Access denied for this company"}), 403

@bp.get("/api/companies/<int:company_id>/vat_settings")
@require_auth
def get_vat_settings(company_id):

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
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
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
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


