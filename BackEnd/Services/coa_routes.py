# BackEnd/Services/coa_routes.py
from __future__ import annotations

from flask import Blueprint, jsonify, request, current_app, make_response, g
from BackEnd.Services.db_service import db_service
coa_bp = Blueprint("coa_routes", __name__)

# You already have these in your project (import paths may differ)
from BackEnd.Services.auth_middleware import require_auth, _corsify

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

def _require_roles(*roles: str):
    user = getattr(g, "current_user", {}) or {}
    role = (user.get("user_role") or user.get("role") or "").lower().strip()

    # owner bypass (acts like admin)
    if role == "owner":
        return None

    if roles and role not in {r.lower() for r in roles}:
        return jsonify({"error": "Not allowed"}), 403
    return None

def _get_coa_normalised(rows: list[dict]):
    return [{
        "code": (r.get("code") or "").strip(),
        "name": (r.get("name") or "").strip() or (r.get("code") or "").strip(),
        "section": (r.get("section") or "").strip(),
        "category": (r.get("category") or "").strip(),
        "subcategory": (r.get("subcategory") or "").strip(),
        "description": (r.get("description") or "").strip(),
        "reporting_description": (r.get("reporting_description") or "").strip(),
        "standard": (r.get("standard") or "").strip(),
        "posting": bool(r.get("posting", True)),
        "posting_rules": (r.get("posting_rules") or "").strip(),
        "cf_section": (r.get("cf_section") or "operating").strip(),
        "cf_bucket": (r.get("cf_bucket") or "").strip(),
        "role": (r.get("role") or "").strip(),
        "is_contra": bool(r.get("is_contra", False)),
    } for r in (rows or [])]
# ------------------------------------------------------------
# COA LIST
# ------------------------------------------------------------
@coa_bp.route("/api/companies/<int:cid>/coa", methods=["GET", "OPTIONS"])
@require_auth
def list_company_coa(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    company_id = int(cid)
    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    try:
        rows = db_service.list_coa(company_id) or []

        if rows:
            return jsonify({
                "ok": True,
                "seeded": True,
                "rows": _get_coa_normalised(rows),
            }), 200

        return jsonify({
            "ok": True,
            "seeded": False,
            "rows": [],
        }), 200

    except Exception as e:
        current_app.logger.exception("list_company_coa failed")
        return jsonify({
            "ok": False,
            "error": "Server error",
            "detail": str(e)
        }), 500
    
# ------------------------------------------------------------
# COA CREATE
# ------------------------------------------------------------
@coa_bp.route("/api/companies/<int:cid>/coa", methods=["POST", "OPTIONS"])
@require_auth
def create_company_coa_account(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    company_id = int(cid)

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    denied_role = _require_roles("owner", "admin", "cfo", "senior")
    if denied_role:
        return denied_role

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None

    data = request.get_json(silent=True) or {}
    mode = (data.get("mode") or "new").strip().lower()
    edit_code = (data.get("code") or "").strip() or None  # edit lookup only

    try:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"ok": False, "error": "Name is required"}), 400

        category = (data.get("category") or "").strip()
        section  = (data.get("section") or "").strip()
        if not section:
            return jsonify({"ok": False, "error": "Section is required"}), 400
        if not category:
            return jsonify({"ok": False, "error": "Category is required"}), 400

        template_code = (data.get("template_code") or "").strip() or None
        role = (data.get("role") or "").strip() or None
        posting = bool(data.get("posting", True))

        cf_section = (data.get("cf_section") or "operating").strip()

        cf_bucket = (data.get("cf_bucket") or "").strip() or None
        is_working_capital = bool(data.get("is_working_capital", False))
        is_cash_equiv = bool(data.get("is_cash_equiv", False))
        is_non_cash_addback = bool(data.get("is_non_cash_addback", False))

        requested_code = (data.get("requested_code") or "").strip() or None
        if mode == "new" and not requested_code:
            requested_code = (data.get("code") or "").strip() or None  # legacy

        description = (data.get("description") or "").strip()
        standard_value = ((data.get("ifrs_tag") or data.get("standard") or "").strip()) or ""

        reporting_description = (data.get("reporting_description") or "").strip()
        posting_rules         = (data.get("posting_rules") or "").strip()

        schema = f"company_{company_id}"

        if mode == "new":
            row = db_service.create_coa_account(
                company_id=company_id,
                name=name,
                category=category,
                section=section,
                description=description,
                standard=standard_value,

                reporting_description=reporting_description,
                posting_rules=posting_rules,

                template_code=template_code,
                role=role,
                posting=posting,

                requested_code=requested_code,

                cf_section=cf_section,
                cf_bucket=cf_bucket,
                is_working_capital=is_working_capital,
                is_cash_equiv=is_cash_equiv,
                is_non_cash_addback=is_non_cash_addback,
            )

            try:
                db_service.audit_log(
                    company_id,
                    actor_user_id=user_id,
                    module="coa",
                    action="create_account",
                    severity="info",
                    entity_type="coa_account",
                    entity_id=str(row.get("id") or ""),
                    entity_ref=str(row.get("code") or requested_code or name),
                    before_json={"input": data},
                    after_json={"row": row},
                    message=f"Created COA account {row.get('code') or requested_code or ''} {name}".strip(),
                    source="api",
                )
            except Exception:
                current_app.logger.exception("audit_log failed (coa create)")

            return jsonify({"ok": True, "row": row}), 201

        # EDIT
        if not edit_code:
            return jsonify({"ok": False, "error": "Missing code for edit"}), 400

        found = db_service.fetch_one(
            f"SELECT id FROM {schema}.coa WHERE code=%s LIMIT 1;",
            (edit_code,),
        )
        if not found:
            return jsonify({"ok": False, "error": "Account not found"}), 404

        coa_id = int(found["id"])
        before = db_service.fetch_one(
            f"SELECT * FROM {schema}.coa WHERE id=%s AND company_id=%s LIMIT 1;",
            (coa_id, company_id),
        ) or {}

        row = db_service.update_coa_account(
            company_id,
            coa_id,
            {
                "name": name,
                "category": category,
                "section": section,
                "standard": standard_value,
                "description": description,
                "reporting_description": reporting_description,
                "posting_rules": posting_rules,
                "posting": posting,
                "template_code": template_code,
                "role": role,
                "cf_section": cf_section,
                "cf_bucket": cf_bucket,
                "is_working_capital": is_working_capital,
                "is_cash_equiv": is_cash_equiv,
                "is_non_cash_addback": is_non_cash_addback,
            },
        )

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="coa",
                action="update_account",
                severity="info",
                entity_type="coa_account",
                entity_id=str(coa_id),
                entity_ref=str(edit_code),
                before_json={"row": before},
                after_json={"row": row},
                message=f"Updated COA account {edit_code}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (coa update via create endpoint)")

        return jsonify({"ok": True, "row": row}), 200

    except ValueError as ve:
        return jsonify({"ok": False, "error": str(ve)}), 400
    except Exception as e:
        current_app.logger.exception("create_company_coa_account failed")
        return jsonify({"ok": False, "error": "Server error", "detail": str(e)}), 500

# ------------------------------------------------------------
# COA UPDATE
# ------------------------------------------------------------
@coa_bp.route("/api/companies/<int:cid>/coa/<int:coa_id>", methods=["PATCH", "OPTIONS"])
@require_auth
def update_company_coa_account(cid: int, coa_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    company_id = int(cid)

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    denied_role = _require_roles("admin", "cfo", "senior")
    if denied_role:
        return denied_role

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None

    data = request.get_json(silent=True) or {}
    schema = f"company_{company_id}"

    try:
        before = db_service.fetch_one(
            f"SELECT * FROM {schema}.coa WHERE id=%s AND company_id=%s LIMIT 1;",
            (int(coa_id), company_id),
        )
        if not before:
            return jsonify({"ok": False, "error": "Account not found"}), 404

        updated = db_service.update_coa_account(company_id, coa_id, data)
        if not updated:
            return jsonify({"ok": False, "error": "Account not found"}), 404

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="coa",
                action="patch_account",
                severity="info",
                entity_type="coa_account",
                entity_id=str(coa_id),
                entity_ref=str(before.get("code") or coa_id),
                before_json={"row": before},
                after_json={"row": updated, "patch": data},
                message=f"Patched COA account {before.get('code') or coa_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (coa patch)")

        return jsonify({"ok": True, "row": updated}), 200

    except Exception as e:
        current_app.logger.exception("update_company_coa_account failed")
        return jsonify({"ok": False, "error": "Server error", "detail": str(e)}), 500

# ------------------------------------------------------------
# COA DELETE (safe)
# ------------------------------------------------------------
@coa_bp.route("/api/companies/<int:cid>/coa/<int:coa_id>", methods=["DELETE", "OPTIONS"])
@require_auth
def delete_company_coa_account(cid: int, coa_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    company_id = int(cid)

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    denied_role = _require_roles("admin", "cfo", "senior")
    if denied_role:
        return denied_role

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None

    schema = f"company_{company_id}"

    try:
        before = db_service.fetch_one(
            f"SELECT * FROM {schema}.coa WHERE id=%s AND company_id=%s LIMIT 1;",
            (int(coa_id), company_id),
        ) or {}

        ok, reason = db_service.delete_coa_account(company_id, coa_id)
        if not ok:
            return jsonify({"ok": False, "error": reason or "Cannot delete"}), 409

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="coa",
                action="delete_account",
                severity="warning",
                entity_type="coa_account",
                entity_id=str(coa_id),
                entity_ref=str(before.get("code") or coa_id),
                before_json={"row": before},
                after_json={"deleted": True},
                message=f"Deleted COA account {before.get('code') or coa_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (coa delete)")

        return jsonify({"ok": True}), 200

    except Exception as e:
        current_app.logger.exception("delete_company_coa_account failed")
        return jsonify({"ok": False, "error": "Server error", "detail": str(e)}), 500

# ------------------------------------------------------------
# COMPANY CONTROLS (AR / VAT Output / VAT Input)
# IMPORTANT: force posting codes using get_account_row_for_posting
# ------------------------------------------------------------
@coa_bp.route("/api/companies/<int:cid>/controls", methods=["PATCH", "OPTIONS"])
@require_auth
def set_company_controls(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    company_id = int(cid)

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    denied_role = _require_roles("admin", "cfo", "senior")
    if denied_role:
        return denied_role

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None

    data = request.get_json(silent=True) or {}

    try:
        before = db_service.get_company_account_settings(company_id) or {}

        ar_raw = (data.get("ar_control_code") or "").strip() or None
        vat_out_raw = (data.get("vat_output_code") or "").strip() or None
        vat_in_raw = (data.get("vat_input_code") or "").strip() or None

        def resolve_posting(raw: str | None) -> str | None:
            if not raw:
                return None
            row = db_service.get_account_row_for_posting(company_id, raw)
            if not row:
                raise ValueError(f"Control code '{raw}' not found in COA (code/template_code).")
            return row[1]  # posting code

        ar_post = resolve_posting(ar_raw)
        vat_out_post = resolve_posting(vat_out_raw)
        vat_in_post = resolve_posting(vat_in_raw)

        db_service.set_company_control_accounts(
            company_id,
            ar_control_code=ar_post,
            vat_output_code=vat_out_post,
            vat_input_code=vat_in_post,
        )

        after = db_service.get_company_account_settings(company_id) or {}

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="coa",
                action="set_controls",
                severity="info",
                entity_type="company_controls",
                entity_id=str(company_id),
                entity_ref=f"company:{company_id}",
                before_json={"settings": before},
                after_json={"settings": after},
                message="Updated company control accounts (AR/VAT)",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (set controls)")

        return jsonify({
            "ok": True,
            "company_id": company_id,
            "ar_control_code": ar_post,
            "vat_output_code": vat_out_post,
            "vat_input_code": vat_in_post,
        }), 200

    except Exception as e:
        current_app.logger.exception("set_company_controls failed")
        return jsonify({"ok": False, "error": "Server error", "detail": str(e)}), 500

@coa_bp.route("/api/companies/<int:cid>/coa/account", methods=["POST", "OPTIONS"])
@require_auth
def coa_save_account(cid: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    company_id = int(cid)

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    denied_role = _require_roles("admin", "cfo", "senior")
    if denied_role:
        return denied_role

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None

    data = request.get_json(silent=True) or {}

    mode = (data.get("mode") or "new").strip().lower()
    edit_code = (data.get("code") or "").strip() or None  # used ONLY for edit lookup

    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "Name is required"}), 400

    # ✅ take what UI sends
    section     = (data.get("section") or "").strip()
    category    = (data.get("category") or "").strip()
    description = (data.get("description") or "").strip()

    if not section:
        return jsonify({"ok": False, "error": "Section is required"}), 400
    if not category:
        return jsonify({"ok": False, "error": "Category is required"}), 400

    # ✅ handle both keys
    standard = (data.get("ifrs_tag") or data.get("standard") or "").strip() or ""

    cf_section = (data.get("cf_section") or "operating").strip()
    cf_bucket  = (data.get("cf_bucket") or "").strip() or None

    posting = bool(data.get("posting", True))

    reporting_description = (data.get("reporting_description") or "").strip()
    posting_rules         = (data.get("posting_rules") or "").strip()

    # ✅ if UI passes "code" as desired new code, treat as requested_code on NEW
    requested_code = (data.get("requested_code") or "").strip() or None
    if mode == "new" and not requested_code:
        requested_code = (data.get("code") or "").strip() or None  # legacy

    schema = f"company_{company_id}"

    try:
        if mode == "new":
            row = db_service.create_coa_account(
                company_id=company_id,
                name=name,
                category=category,
                section=section,
                description=description,
                standard=standard,

                reporting_description=reporting_description,
                posting_rules=posting_rules,

                posting=posting,
                requested_code=requested_code,
                cf_section=cf_section,
                cf_bucket=cf_bucket,
            )

            try:
                db_service.audit_log(
                    company_id,
                    actor_user_id=user_id,
                    module="coa",
                    action="create_account",
                    severity="info",
                    entity_type="coa_account",
                    entity_id=str(row.get("id") or ""),
                    entity_ref=str(row.get("code") or requested_code or name),
                    before_json={"input": data},
                    after_json={"row": row},
                    message=f"Created COA account {row.get('code') or requested_code or ''} {name}".strip(),
                    source="api",
                )
            except Exception:
                current_app.logger.exception("audit_log failed (coa_save_account create)")

        else:
            if not edit_code:
                return jsonify({"ok": False, "error": "Missing code for edit"}), 400

            before = db_service.fetch_one(
                f"SELECT * FROM {schema}.coa WHERE code=%s AND company_id=%s LIMIT 1;",
                (edit_code, company_id),
            )
            if not before:
                return jsonify({"ok": False, "error": f"Account '{edit_code}' not found"}), 404

            row = db_service.update_coa_account(
                company_id,
                int(before["id"]),
                {
                    "name": name,
                    "category": category,
                    "section": section,
                    "description": description,
                    "standard": standard,
                    "reporting_description": reporting_description,
                    "posting_rules": posting_rules,
                    "posting": posting,
                    "cf_section": cf_section,
                    "cf_bucket": cf_bucket,
                },
            )

            try:
                db_service.audit_log(
                    company_id,
                    actor_user_id=user_id,
                    module="coa",
                    action="update_account",
                    severity="info",
                    entity_type="coa_account",
                    entity_id=str(before.get("id")),
                    entity_ref=str(edit_code),
                    before_json={"row": before},
                    after_json={"row": row, "input": data},
                    message=f"Updated COA account {edit_code}",
                    source="api",
                )
            except Exception:
                current_app.logger.exception("audit_log failed (coa_save_account update)")

        return jsonify(_get_coa_normalised(company_id)), 200

    except ValueError as ve:
        return jsonify({"ok": False, "error": str(ve)}), 400
    except Exception as e:
        current_app.logger.exception("coa_save_account failed")
        return jsonify({"ok": False, "error": "Server error", "detail": str(e)}), 500

@coa_bp.route("/api/companies/<int:cid>/coa/account/<path:code>", methods=["DELETE", "OPTIONS"])
@require_auth
def coa_delete_account(cid: int, code: str):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    company_id = int(cid)

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    denied_role = _require_roles("admin", "cfo", "senior")
    if denied_role:
        return denied_role

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None

    code = (code or "").strip()
    if not code:
        return jsonify({"ok": False, "error": "Missing code"}), 400

    schema = f"company_{company_id}"

    try:
        before = db_service.fetch_one(
            f"SELECT * FROM {schema}.coa WHERE code=%s AND company_id=%s LIMIT 1;",
            (code, company_id),
        )
        if not before:
            return jsonify({"ok": False, "error": "Account not found"}), 404

        ok, reason = db_service.delete_coa_account(company_id, int(before["id"]))
        if not ok:
            return jsonify({"ok": False, "error": reason or "Cannot delete"}), 409

        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module="coa",
                action="delete_account",
                severity="warning",
                entity_type="coa_account",
                entity_id=str(before.get("id")),
                entity_ref=str(code),
                before_json={"row": before},
                after_json={"deleted": True},
                message=f"Deleted COA account {code}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (coa_delete_account)")

        return jsonify(_get_coa_normalised(company_id)), 200

    except Exception as e:
        current_app.logger.exception("coa_delete_account failed")
        return jsonify({"ok": False, "error": "Server error", "detail": str(e)}), 500
