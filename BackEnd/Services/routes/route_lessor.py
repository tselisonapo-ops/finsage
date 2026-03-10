from flask import Blueprint, jsonify, request, current_app, g, make_response
from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_middleware import require_auth, _corsify
from BackEnd.Services.credit_policy import normalize_policy_mode

lessors_bp = Blueprint("lessors", __name__)

# ---- helpers (reuse your existing ones) ----
# normalize_policy_mode(policy): returns "owner_managed" / "assisted" / "controlled"
# db_service.get_company_profile(company_id): returns credit_policy etc.


@lessors_bp.route(
    "/api/companies/<int:company_id>/lessors/<int:lessor_id>",
    methods=["GET", "PUT", "DELETE"],
)
@require_auth
def api_company_lessor_detail(company_id: int, lessor_id: int):
    current_user = getattr(g, "current_user", None)
    if not current_user or int(current_user.get("company_id") or 0) != int(company_id):
        return jsonify({"error": "Not authorised for this company"}), 403

    if request.method == "GET":
        lessor = db_service.get_lessor(company_id, lessor_id)
        if not lessor:
            return jsonify({"error": "Lessor not found"}), 404
        return jsonify(lessor), 200

    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        current_app.logger.debug(
            "PUT /companies/%s/lessors/%s body = %r",
            company_id, lessor_id, data
        )

        # 🔎 BEFORE snapshot
        before = db_service.get_lessor(company_id, lessor_id)
        if not before:
            return jsonify({"error": "Lessor not found"}), 404

        # ✅ Load policy & normalize mode (reuse your company profile logic)
        company = db_service.get_company_profile(company_id) or {}
        policy = company.get("credit_policy") or {}
        if not isinstance(policy, dict):
            policy = {}

        mode = normalize_policy_mode(policy)
        review_enabled = bool(policy.get("review_enabled", False))

        uid = current_user.get("id")
        is_owner = (uid is not None and str(company.get("owner_user_id")) == str(uid))

        # ✅ Restrict sensitive lessor fields by mode
        restricted_fields = {"active", "is_related_party"}
        touching_restricted = any(k in data for k in restricted_fields)

        if touching_restricted and mode != "owner_managed":
            if mode == "controlled" and review_enabled:
                return jsonify({"error": "Use workflow/approval to change lessor status flags."}), 409
            if mode == "assisted" and not is_owner:
                return jsonify({"error": "Only the owner can change lessor status flags."}), 403

        # normalize some fields
        if "name" in data:
            data["name"] = (data.get("name") or "").strip()
            if not data["name"]:
                return jsonify({"error": "Lessor name is required"}), 400

        try:
            ok = db_service.update_lessor(company_id, lessor_id, **data)
        except Exception as ex:
            current_app.logger.exception("Error updating lessor: %s", ex)
            return jsonify({"error": "Failed to update lessor"}), 500

        if not ok:
            return jsonify({"error": "Lessor not found or nothing to update"}), 404

        # Return updated truth
        after = db_service.get_lessor(company_id, lessor_id) or {}

        # 🧾 AUDIT LOG — UPDATE
        db_service.audit_log(
            company_id=company_id,
            actor_user_id=int(current_user.get("id") or 0),
            module="ifrs16",
            action="update",
            severity="info",
            entity_type="lessor",
            entity_id=str(lessor_id),
            entity_ref=after.get("name") or before.get("name"),
            before_json=before or {},
            after_json=after or {},
            message=f"Lessor updated: {(after.get('name') or before.get('name'))}",
        )

        return jsonify(after), 200

    if request.method == "DELETE":
        before = db_service.get_lessor(company_id, lessor_id)
        if not before:
            return jsonify({"error": "Lessor not found"}), 404

        # Optional: prevent delete if referenced by leases
        try:
            used = db_service.lessor_is_used(company_id, lessor_id)
        except Exception:
            used = False

        if used:
            return jsonify({"error": "Lessor is linked to leases; deactivate instead."}), 409

        try:
            db_service.delete_lessor(company_id, lessor_id)
        except Exception as ex:
            current_app.logger.exception("Error deleting lessor: %s", ex)
            return jsonify({"error": "Failed to delete lessor"}), 500

        # 🧾 AUDIT LOG — DELETE
        db_service.audit_log(
            company_id=company_id,
            actor_user_id=int(current_user.get("id") or 0),
            module="ifrs16",
            action="delete",
            severity="warning",
            entity_type="lessor",
            entity_id=str(lessor_id),
            entity_ref=before.get("name"),
            before_json=before or {},
            after_json={},
            message=f"Lessor deleted: {before.get('name')}",
        )

        return jsonify({"ok": True}), 200


@lessors_bp.route(
    "/api/companies/<int:company_id>/lessors/quick",
    methods=["POST", "OPTIONS"],
)
@require_auth
def api_company_lessor_quick_create(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    user = getattr(g, "current_user", {}) or {}
    if int(user.get("company_id") or 0) != int(company_id):
        return jsonify({"error": "Not authorised for this company"}), 403

    data = request.get_json(silent=True) or {}

    name = (data.get("name") or data.get("lessor_name") or "").strip()
    if not name:
        return jsonify({"error": "Lessor name is required"}), 400

    payload = {
        "name": name,
        "reg_no": (data.get("reg_no") or data.get("regNo") or "").strip() or None,
        "vat_no": (data.get("vat_no") or data.get("vatNo") or "").strip() or None,
        "email": (data.get("email") or "").strip() or None,
        "phone": (data.get("phone") or "").strip() or None,
        "address": (data.get("address") or "").strip() or None,
        "is_related_party": bool(data.get("is_related_party") or False),
        "active": True,  # forced for quick create
    }

    try:
        new_id = int(db_service.insert_lessor(company_id, payload) or 0)
        if not new_id:
            return jsonify({"error": "Failed to create lessor"}), 500

        lessor = db_service.get_lessor(company_id, new_id) or {}

        # 🧾 AUDIT LOG — QUICK CREATE (never break request)
        try:
            db_service.audit_log(
                company_id=company_id,
                actor_user_id=int(user.get("id") or 0),
                module="ifrs16",
                action="create_lessor_quick",
                severity="info",
                entity_type="lessor",
                entity_id=str(new_id),
                entity_ref=lessor.get("name") or name,
                before_json={},
                after_json=lessor or payload,
                message=f"Lessor created (quick): {lessor.get('name') or name}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (quick create lessor)")

        return jsonify(lessor), 201

    except Exception as ex:
        current_app.logger.exception("quick lessor create failed")
        return jsonify({"error": "Failed to create lessor", "detail": str(ex)}), 500

@lessors_bp.route(
    "/api/companies/<int:company_id>/lessors",
    methods=["GET", "POST", "OPTIONS"],
)
@require_auth
def api_company_lessors(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    current_user = getattr(g, "current_user", None) or {}
    if int(current_user.get("company_id") or 0) != int(company_id):
        return jsonify({"error": "Not authorised for this company"}), 403

    actor_user_id = int(current_user.get("id") or 0) or None

    # -----------------------------
    # GET: list lessors
    # -----------------------------
    if request.method == "GET":
        q = (request.args.get("q") or "").strip()
        active_raw = (request.args.get("active", "1") or "").strip().lower()
        limit  = int(request.args.get("limit", "200"))
        offset = int(request.args.get("offset", "0"))

        if limit < 1: limit = 200
        if offset < 0: offset = 0

        active = None
        if active_raw != "":
            active = active_raw in ("1", "true", "yes")

        rows = db_service.list_lessors(
            int(company_id),
            active=active,
            q=q or None,
            limit=limit,
            offset=offset,
        ) or []

        # optional audit
        try:
            db_service.audit_log(
                int(company_id),
                actor_user_id=actor_user_id,
                module="ifrs16",
                action="list_lessors",
                severity="info",
                entity_type="lessor",
                entity_id=None,
                entity_ref=None,
                before_json=None,
                after_json={
                    "q": q,
                    "active": active_raw,
                    "limit": limit,
                    "offset": offset,
                    "returned": len(rows),
                },
                message="Listed lessors",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (list_lessors)")

        return jsonify({"rows": rows}), 200

    # -----------------------------
    # POST: create lessor
    # -----------------------------
    try:
        raw = request.get_json(silent=True) or {}
        if not isinstance(raw, dict):
            return jsonify({"error": "JSON body must be an object"}), 400

        name = (raw.get("name") or "").strip()
        if not name:
            return jsonify({"error": "name is required"}), 400

        payload = {
            "name": name,
            "reg_no": (raw.get("reg_no") or raw.get("regNo") or "").strip() or None,
            "vat_no": (raw.get("vat_no") or raw.get("vatNo") or "").strip() or None,
            "email": (raw.get("email") or "").strip() or None,
            "phone": (raw.get("phone") or "").strip() or None,
            "address": (raw.get("address") or "").strip() or None,
            "is_related_party": bool(raw.get("is_related_party") or False),
            "active": bool(raw.get("active", True)),
        }

        lessor_id = int(db_service.insert_lessor(int(company_id), payload) or 0)
        if not lessor_id:
            return jsonify({"error": "Failed to create lessor"}), 500

        after = db_service.get_lessor(int(company_id), lessor_id) or {"id": lessor_id, **payload}

        try:
            db_service.audit_log(
                int(company_id),
                actor_user_id=actor_user_id,
                module="ifrs16",
                action="create_lessor",
                severity="info",
                entity_type="lessor",
                entity_id=str(lessor_id),
                entity_ref=after.get("name") or name,
                before_json=None,
                after_json=after,
                message=f"Created lessor {after.get('name') or name} (ID {lessor_id})",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (create_lessor)")

        return jsonify(after), 201

    except Exception as e:
        current_app.logger.exception("lessors POST error")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500
