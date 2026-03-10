# BackEnd/Routes/credit_routes.py

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from flask import Blueprint, jsonify, request, g, current_app, make_response, send_from_directory, make_response
from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_service import decode_jwt
from BackEnd.Services.company import company_policy
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company
from BackEnd.Services.auth_middleware import _corsify, require_auth
from werkzeug.utils import secure_filename

credit_bp = Blueprint("credit_bp", __name__)

UPLOAD_ROOT = Path("uploads")

def current_company_id() -> int | None:
    """
    Resolve the current company_id using (in order):
    1) g.current_user (if already set by some auth)
    2) Authorization: Bearer <JWT> header (decode + fetch user)
    """
    user = getattr(g, "current_user", None)

    # 1) If g.current_user is not set, try to decode from Authorization header
    if not user:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth.split(" ", 1)[1].strip()
            try:
                payload = decode_jwt(token)
                user_id = payload.get("sub")
                if user_id:
                    user = db_service.get_user_by_id(user_id)
                    if user:
                        g.current_user = user
            except Exception as e:
                current_app.logger.warning(
                    f"credit_routes: failed to decode JWT or load user: {e}"
                )

    # 2) If we now have a user with a company_id, return it
    if user and user.get("company_id"):
        try:
            return int(user["company_id"])
        except (TypeError, ValueError):
            return None

    # 3) (Optional) You *can* keep the X-Company-Id fallback if you want,
    #    but since you've removed it from apiFetch, it's no longer needed.
    # cid = request.headers.get("X-Company-Id")
    # try:
    #     return int(cid) if cid is not None else None
    # except ValueError:
    #     return None

    return None



def current_user() -> dict | None:
    """
    Wrapper around g.current_user so the rest of this module
    doesn't have to know how auth is implemented.
    """
    return getattr(g, "current_user", None)

# --- 1) list pending profiles (left-hand list) ---------------


@credit_bp.get("/api/credit/pending")
@require_auth
def api_credit_pending():
    """
    Return a list of pending credit profiles for the current company.

    Response shape:
      {
        "items": [
          {
            "id": ...,
            "customerId": ...,
            "customerName": ...,
            "requestedLimit": ...,
            "requestedTerms": ...,
            "riskBand": ...,
            "status": ...,
            "currency": ...
          },
          ...
        ],
        "count": <number>
      }
    """
    company_id = current_company_id()
    if not company_id:
        return jsonify({"error": "No company selected"}), 400

    try:
        items = db_service.list_pending_credit_profiles(company_id)
        # items is already a list of plain dicts in the shape the frontend expects
        return jsonify({"items": items, "count": len(items)}), 200
    except Exception as ex:
        current_app.logger.exception("Error in /api/credit/pending: %s", ex)
        return jsonify({"error": "Internal server error"}), 500


# --- 3) clerk submits a new credit profile -------------------

@credit_bp.post("/api/credit/profile")
@require_auth
def api_create_credit_profile():
    payload = getattr(request, "jwt_payload", {}) or {}

    # Prefer explicit company in JWT; fallback to current_company_id() if you use "selected company" concept
    company_id = payload.get("company_id") or current_company_id()
    if not company_id:
        return jsonify({"error": "No company selected"}), 400

    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    pol = company_policy(int(company_id)) or {}
    mode = str(pol.get("mode") or "").strip().lower()
    if mode == "single":
        return jsonify({"error": "Credit approval workflow is disabled in Single mode."}), 409

    body = request.get_json(silent=True) or {}
    customer_id = body.get("customerId") or body.get("customer_id")
    prof_payload = body.get("payload") or {}

    if not customer_id:
        return jsonify({"error": "customerId is required"}), 400

    user = getattr(g, "current_user", None) or {}
    user_id = payload.get("user_id") or payload.get("sub") or user.get("id")
    user_id = int(user_id) if user_id is not None else None

    user_role = (user.get("user_role") or user.get("role") or "clerk").strip().lower()

    try:
        profile_id = db_service.insert_credit_profile(
            company_id=int(company_id),
            customer_id=int(customer_id),
            payload=prof_payload,
            created_by_user_id=user_id,
            created_by_role=user_role,
        )

        ok = db_service.update_customer(
            int(company_id),
            int(customer_id),
            credit_status="pending",
            credit_profile_id=int(profile_id),
            pending_reason="Credit profile submitted for approval",
            created_by_user_id=user_id,
        )

        if not ok:
            return jsonify({"error": "Customer stamp failed (customer not found)"}), 400

        # ✅ audit (best-effort)
        try:
            db_service.audit_log(
                int(company_id),
                actor_user_id=user_id,
                module="credit",
                action="create_credit_profile",
                severity="info",
                entity_type="credit_profile",
                entity_id=str(profile_id),
                entity_ref=f"CUST-{int(customer_id)}",
                before_json={"input": body},
                after_json={"profile_id": int(profile_id), "customer_id": int(customer_id)},
                message=f"Created credit profile {profile_id} (pending) for customer {customer_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (create_credit_profile)")

        return jsonify({
            "ok": True,
            "profile_id": int(profile_id),
            "customer_id": int(customer_id),
            "status": "pending",
        }), 201

    except Exception as ex:
        current_app.logger.exception("api_create_credit_profile failed")
        return jsonify({"error": "Server error", "detail": str(ex)}), 500

@credit_bp.post("/api/credit/submit")
@require_auth
def api_credit_submit():
    payload = getattr(request, "jwt_payload", {}) or {}
    company_id = payload.get("company_id") or current_company_id()
    if not company_id:
        return jsonify({"error": "No company selected"}), 400

    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    ctx = company_policy(int(company_id)) or {}
    mode = str(ctx.get("mode") or "").strip().lower()
    if mode == "single":
        return jsonify({"error": "Credit approval workflow is disabled in Single mode."}), 409

    user = getattr(g, "current_user", None) or {}
    user_id = payload.get("user_id") or payload.get("sub") or user.get("id")
    user_id = int(user_id) if user_id is not None else None

    body = request.get_json(silent=True) or {}
    customer_id = body.get("customerId") or body.get("customer_id")
    prof_payload = body.get("payload") or {}

    if not customer_id:
        return jsonify({"error": "customerId is required"}), 400

    # defaults
    prof_payload.setdefault("status", "pending_senior")
    prof_payload.setdefault("createdAt", datetime.utcnow().isoformat() + "Z")
    prof_payload.setdefault("createdBy", user.get("email") or "system")

    # ✅ create output ONCE (so later blocks can safely update it)
    out = dict(prof_payload)
    out.update({
        "ok": True,
        "customerId": int(customer_id),
        "companyId": int(company_id),
    })

    try:
        profile_id = db_service.insert_credit_profile(
            company_id=int(company_id),
            customer_id=int(customer_id),
            payload=prof_payload,
            created_by_user_id=user_id,
            created_by_role=(user.get("user_role") or user.get("role") or "clerk"),
        )

        ok = db_service.update_customer(
            int(company_id),
            int(customer_id),
            credit_status="pending",
            credit_profile_id=int(profile_id),
            pending_reason="Credit profile submitted for approval",
            created_by_user_id=user_id,
        )

        out["id"] = int(profile_id)
        out["customerStamped"] = bool(ok)

        company_profile = (ctx.get("company") or {})

        require_customer_approval = bool(ctx.get("require_customer_approval", False))
        review_enabled = bool(ctx.get("review_enabled", False))

        needs_approval = (
            mode in {"assisted", "controlled"} and (require_customer_approval or review_enabled)
        )

        # controlled-mode only KYC enforcement
        require_kyc = bool(ctx.get("require_kyc", False))
        if mode == "controlled" and require_kyc:
            kyc = (prof_payload or {}).get("kyc") or {}
            docs = kyc.get("documents") or []
            docs_ok = bool(docs)
            if not docs_ok:
                return jsonify({"error": "KYC required in controlled mode"}), 409

        # Create approval request row for the CUSTOMER (so it uses existing cust-approvals UI)
        if needs_approval:
            try:
                customer_ref = f"CUST-{int(customer_id)}"
                requested_limit = float((prof_payload or {}).get("requestedLimit") or 0.0)
                cur0 = (company_profile.get("currency") or company_profile.get("base_currency") or "ZAR")

                dedupe_key = f"ar:customer:{int(customer_id)}:approve_customer"

                ar = db_service.create_approval_request(
                    int(company_id),
                    entity_type="customer",
                    entity_id=str(int(customer_id)),
                    entity_ref=customer_ref,
                    module="ar",
                    action="approve_customer",
                    requested_by_user_id=int(user_id or 0),
                    amount=requested_limit,
                    currency=str(cur0),
                    risk_level=str(((prof_payload or {}).get("kyc") or {}).get("riskLevel") or "low").lower(),
                    dedupe_key=dedupe_key,
                    payload_json={
                        "customer_id": int(customer_id),
                        "credit_profile_id": int(profile_id),
                        "kyc": (prof_payload or {}).get("kyc") or {},
                        "snapshot": prof_payload,  # optional
                    },
                )

                # return info so UI can show "approval required"
                out = dict(prof_payload)
                out["approval_request_id"] = int(ar.get("id") or 0)
                out["status"] = "approval_required"

            except Exception:
                current_app.logger.exception("create_approval_request for customer KYC failed")
                # do not fail submit: credit profile is already created

        try:
            db_service.audit_log(
                int(company_id),
                actor_user_id=user_id,
                module="credit",
                action="submit_credit_profile",
                severity="info",
                entity_type="credit_profile",
                entity_id=str(profile_id),
                entity_ref=f"CUST-{int(customer_id)}",
                before_json={"input": body},
                after_json={"status": prof_payload.get("status"), "stamped_customer": bool(ok)},
                message=f"Submitted credit profile {profile_id} for customer {customer_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (submit_credit_profile)")

        return jsonify(out), 201

    except Exception as ex:
        current_app.logger.exception("api_credit_submit failed")
        return jsonify({"error": "Server error", "detail": str(ex)}), 500

# --- 4) senior / CFO decision (approve / rework / reject) ----

@credit_bp.post("/api/credit/profile/<int:profile_id>/decision")
@require_auth
def api_credit_decision(profile_id: int):
    payload = getattr(request, "jwt_payload", {}) or {}
    company_id = payload.get("company_id") or (getattr(g, "current_user", {}) or {}).get("company_id")
    if not company_id:
        return jsonify({"error": "No company selected"}), 400

    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    body = request.get_json(silent=True) or {}
    status = (body.get("status") or "").strip().lower()

    if status not in {"approved", "cod_only", "rework", "rejected"}:
        return jsonify({"error": "Invalid status"}), 400

    risk_band = body.get("riskBand")
    approved_limit = body.get("approvedLimit")
    approved_terms = body.get("approvedTerms")

    user = getattr(g, "current_user", {}) or {}
    reviewer_id = payload.get("user_id") or payload.get("sub") or user.get("id")
    reviewer_id = int(reviewer_id) if reviewer_id is not None else 0
    reviewer_role = (user.get("user_role") or "senior").strip().lower()

    decision_payload = body.get("decisionPayload") or {}
    decision_payload.update({
        "status": status,
        "riskBand": risk_band,
        "approvedLimit": approved_limit,
        "approvedTerms": approved_terms,
        "decisionNotes": body.get("decisionNotes"),
        "decisionAt": datetime.utcnow().isoformat() + "Z",
        "decisionBy": user.get("email"),
    })

    try:
        ok = db_service.update_credit_decision(
            company_id=int(company_id),
            profile_id=int(profile_id),
            status=status,
            risk_band=risk_band,
            approved_limit=approved_limit,
            approved_terms=approved_terms,
            decision_payload=decision_payload,
            reviewer_role=reviewer_role,
            reviewer_user_id=reviewer_id,
        )
        if not ok:
            return jsonify({"error": "Profile not found or not updated"}), 404

        prof_row = db_service.get_credit_profile_row(int(company_id), int(profile_id))
        if not prof_row:
            return jsonify({"error": "Profile not found"}), 404

        cust_id = int(prof_row["customer_id"])

        updates = {
            "credit_status": "approved" if status == "approved" else status,
            "credit_profile_id": int(profile_id),
            "approved_by_user_id": reviewer_id,
            "approved_at": datetime.utcnow(),
        }

        if status == "approved":
            updates["on_hold"] = "no"
            if approved_limit is not None:
                updates["credit_limit"] = approved_limit
            if approved_terms:
                updates["payment_terms"] = approved_terms
        elif status == "cod_only":
            updates["on_hold"] = "no"
            updates["credit_limit"] = 0
        else:  # rework / rejected
            updates["on_hold"] = "yes"

        ok2 = db_service.update_customer(int(company_id), int(cust_id), **updates)

        # ✅ audit (best-effort)
        try:
            db_service.audit_log(
                int(company_id),
                actor_user_id=reviewer_id,
                module="credit",
                action="credit_decision",
                severity="info",
                entity_type="credit_profile",
                entity_id=str(profile_id),
                entity_ref=f"CUST-{cust_id}",
                before_json={},
                after_json={"status": status, "customer_updated": bool(ok2), "updates": updates},
                message=f"Credit decision '{status}' for profile {profile_id} (customer {cust_id})",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (credit_decision)")

        return jsonify({"ok": True, "status": status, "customer_updated": bool(ok2)}), 200

    except Exception as ex:
        current_app.logger.exception("api_credit_decision failed")
        return jsonify({"error": "Internal server error", "detail": str(ex)}), 500


@credit_bp.route("/api/companies/<int:cid>/customers/<int:cust_id>/highlights", methods=["GET", "OPTIONS"])
@require_auth
def customer_highlights(cid: int, cust_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    user = getattr(g, "current_user", {}) or {}

    # allow None tokens (system) OR same company
    if user.get("company_id") not in (None, cid):
        return jsonify({"error": "Not authorised"}), 403

    try:
        data = db_service.get_customer_highlights(cid, cust_id) or {}
    except Exception as e:
        current_app.logger.exception("customer_highlights failed cid=%s cust_id=%s", cid, cust_id)
        return jsonify({"ok": False, "type": type(e).__name__, "error": str(e)}), 500

    return jsonify({
        "balance": float(data.get("balance") or 0),
        "open_invoices_count": int(data.get("open_invoices") or 0),
        "recent_invoices": data.get("recent") or [],
    }), 200

@credit_bp.route("/uploads/<path:filename>", methods=["GET"])
def serve_upload(filename):
    token = request.args.get("token")
    if not token:
        return jsonify({"error": "Missing token"}), 401

    try:
        payload = decode_jwt(token)
        # optional: inspect payload["sub"], payload["role"], payload["company_id"]
    except Exception:
        return jsonify({"error": "Invalid token"}), 401

    return send_from_directory(UPLOAD_ROOT, filename)

@credit_bp.route("/api/uploads/kyc", methods=["POST", "OPTIONS"])
@require_auth
def upload_kyc_file():
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    user = getattr(g, "current_user", None) or {}

    company_id = payload.get("company_id") or (user or {}).get("company_id") or 0
    if not company_id:
        return jsonify({"error": "No company selected"}), 400

    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400

    safe_name = secure_filename(f.filename or "kyc_document")

    rel_dir = Path("kyc") / f"company_{int(company_id)}"
    save_dir = UPLOAD_ROOT / rel_dir
    save_dir.mkdir(parents=True, exist_ok=True)

    save_path = save_dir / safe_name
    f.save(save_path)

    url_path = f"/uploads/{rel_dir.as_posix()}/{safe_name}"

    user_id = payload.get("user_id") or payload.get("sub") or user.get("id")
    user_id = int(user_id) if user_id is not None else None

    try:
        db_service.audit_log(
            int(company_id),
            actor_user_id=user_id,
            module="credit",
            action="upload_kyc",
            severity="info",
            entity_type="kyc_file",
            entity_id=safe_name,
            entity_ref=url_path,
            before_json={},
            after_json={"name": safe_name, "url": url_path, "mime": f.mimetype},
            message=f"Uploaded KYC file {safe_name}",
            source="api",
        )
    except Exception:
        current_app.logger.exception("audit_log failed (upload_kyc_file)")

    return jsonify({"url": url_path, "name": safe_name, "mime": f.mimetype}), 201

# -----------------------------
# Registration  
# -----------------------------