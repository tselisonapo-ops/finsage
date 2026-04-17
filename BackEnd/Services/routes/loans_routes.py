from flask import Blueprint, request, jsonify, g, current_app, make_response
from BackEnd.Services.auth_middleware import _corsify, require_auth
from .invoice_routes import _deny_if_wrong_company
from BackEnd.Services.company import company_policy
from BackEnd.Services.db_service import db_service
from datetime import datetime, date
from BackEnd.Services.company_context import normalize_role
from BackEnd.Services.credit_policy import (
    normalize_policy_mode,
    can_decide_request,
    loan_review_enabled,
    loan_action_review_required,
    can_manage_loans,
    can_release_loan_funds,
)
loans_bp = Blueprint("loans", __name__)

def _can_manage_loans(user: dict, company_profile: dict, mode: str, company_role: str) -> bool:
    role = (company_role or "").strip().lower()
    if role in {"owner", "admin", "cfo"}:
        return True

    perms = set(user.get("permissions") or [])
    return (
        "can_manage_banking" in perms
        or "can_prepare_financials" in perms
        or "can_manage_financing" in perms
    )

@loans_bp.route("/api/companies/<int:company_id>/loans", methods=["GET", "OPTIONS"])
@require_auth
def api_list_loans(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    try:
        status = (request.args.get("status") or "").strip() or None
        q = (request.args.get("q") or "").strip()
        limit = int(request.args.get("limit") or 200)

        with db_service._conn_cursor() as (conn, cur):
            out = db_service.list_loans(
                conn,
                int(company_id),
                status=status,
                q=q,
                limit=limit,
            )

        return jsonify({"ok": True, "data": out}), 200

    except Exception as e:
        current_app.logger.exception("❌ api_list_loans failed")
        return jsonify({"ok": False, "error": str(e)}), 400

@loans_bp.route("/api/companies/<int:company_id>/loans", methods=["POST", "OPTIONS"])
@require_auth
def api_create_loan(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    user = db_service.get_user_context(
        user_id=user_id,
        company_id=company_id,
        delegated_fallback=getattr(g, "current_user", None),
    )
    if not user:
        return jsonify({"ok": False, "error": "User has no access to this company"}), 403

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    raw = request.get_json(silent=True) or {}
    if not isinstance(raw, dict):
        return jsonify({"ok": False, "error": "JSON body must be an object"}), 400

    try:
        pol = company_policy(int(company_id)) or {}
        mode = str(pol.get("mode") or "owner_managed").strip().lower()
        company_profile = pol.get("company") or {}

        if not can_manage_loans(user, company_profile, mode):
            return jsonify({"ok": False, "error": "PERMISSION_DENIED|manage_loans"}), 403

        is_owner = str(company_profile.get("owner_user_id")) == str(user.get("id"))
        role_norm = normalize_role(user.get("user_role") or user.get("company_role") or user.get("role") or "")
        is_cfo = role_norm in {"cfo", "admin", "owner"} or is_owner

        review_required = (mode == "controlled") or (
            mode == "assisted" and loan_action_review_required(pol, "create", user=user) and not is_owner
        )

        if review_required and not is_cfo:
            dedupe_key = (
                f"{company_id}:loans:create:"
                f"{(raw.get('loan_reference') or raw.get('loan_name') or '').strip().lower()}:"
                f"{raw.get('principal_amount')}:{raw.get('start_date')}:{raw.get('first_payment_date')}"
            )

            req = db_service.create_approval_request(
                int(company_id),
                entity_type="loan",
                entity_id="new",
                entity_ref=(raw.get("loan_reference") or raw.get("loan_name") or "NEW-LOAN"),
                module="loans",
                action="create_loan",
                requested_by_user_id=int(user_id),
                amount=float(raw.get("principal_amount") or 0.0),
                currency=(raw.get("currency") or "ZAR"),
                risk_level=("high" if mode == "controlled" else "medium"),
                dedupe_key=dedupe_key,
                payload_json={
                    **raw,
                    "flow": "loan_create",
                    "mode": mode,
                },
            )
            return jsonify({"ok": False, "error": "APPROVAL_REQUIRED", "approval_request": req}), 202

        with db_service._conn_cursor() as (conn, cur):
            out = db_service.create_loan(
                conn,
                int(company_id),
                data=raw,
                user_id=int(user_id),
            )

        try:
            db_service.audit_log(
                int(company_id),
                actor_user_id=int(user_id),
                module="loans",
                action="create_loan",
                severity="info",
                entity_type="loan",
                entity_id=str((out.get("loan") or {}).get("id") or ""),
                entity_ref=(out.get("loan") or {}).get("loan_reference"),
                before_json={"input": raw},
                after_json=out,
                message=f"Created loan {(out.get('loan') or {}).get('loan_name')}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (create_loan)")

        return jsonify({"ok": True, "data": out}), 201

    except ValueError as ve:
        return jsonify({"ok": False, "error": str(ve)}), 400
    except Exception as e:
        current_app.logger.exception("❌ api_create_loan failed")
        return jsonify({"ok": False, "error": str(e)}), 500
    
@loans_bp.route("/api/companies/<int:company_id>/loans/preview_inception_journal", methods=["POST", "OPTIONS"])
@require_auth
def api_preview_loan_inception_journal(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    raw = request.get_json(silent=True) or {}
    if not isinstance(raw, dict):
        return jsonify({"ok": False, "error": "JSON body must be an object"}), 400

    try:
        with db_service._conn_cursor() as (conn, cur):
            out = db_service.preview_loan_inception_journal(
                conn,
                int(company_id),
                data=raw,
            )

        return jsonify({"ok": True, "data": out}), 200

    except Exception as e:
        current_app.logger.exception("❌ api_preview_loan_inception_journal failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@loans_bp.route("/api/companies/<int:company_id>/loans/payments/preview_journal", methods=["POST", "OPTIONS"])
@require_auth
def api_preview_loan_payment_journal(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    raw = request.get_json(silent=True) or {}
    if not isinstance(raw, dict):
        return jsonify({"ok": False, "error": "JSON body must be an object"}), 400

    try:
        with db_service._conn_cursor() as (conn, cur):
            out = db_service.preview_loan_payment_journal(
                conn,
                int(company_id),
                data=raw,
            )

        return jsonify({"ok": True, "data": out}), 200

    except Exception as e:
        current_app.logger.exception("❌ api_preview_loan_payment_journal failed")
        return jsonify({"ok": False, "error": str(e)}), 400
    
@loans_bp.route("/api/companies/<int:company_id>/loans/<int:loan_id>", methods=["PUT", "OPTIONS"])
@require_auth
def api_update_loan(company_id: int, loan_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    data = request.get_json(silent=True) or {}

    try:
        user = getattr(g, "current_user", None) or {}
        cp = company_policy(int(company_id)) or {}
        mode = str(cp.get("mode") or "owner_managed").strip().lower()
        company_profile = cp.get("company") or {}
        company_role = (user.get("user_role") or user.get("company_role") or "other").strip().lower()

        if not _can_manage_loans(user, company_profile, mode, company_role):
            return jsonify({"ok": False, "error": "PERMISSION_DENIED|manage_loans"}), 403

        user_id = user.get("id") or payload.get("sub")
        user_id = int(user_id) if user_id is not None else None

        with db_service._conn_cursor() as (conn, cur):
            out = db_service.update_loan(
                conn,
                int(company_id),
                loan_id=int(loan_id),
                data=data,
                user_id=user_id,
            )

        return jsonify({"ok": True, "data": out}), 200

    except Exception as e:
        current_app.logger.exception("❌ api_update_loan failed")
        return jsonify({"ok": False, "error": str(e)}), 400
    

@loans_bp.route("/api/companies/<int:company_id>/loans/<int:loan_id>", methods=["GET", "OPTIONS"])
@require_auth
def api_get_loan(company_id: int, loan_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    try:
        with db_service._conn_cursor() as (conn, cur):
            out = db_service.get_loan_full(conn, int(company_id), int(loan_id))

        if not out:
            return jsonify({"ok": False, "error": "loan not found"}), 404

        return jsonify({"ok": True, "data": out}), 200

    except Exception as e:
        current_app.logger.exception("❌ api_get_loan failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@loans_bp.route("/api/companies/<int:company_id>/loans/<int:loan_id>/schedule/recalculate", methods=["POST", "OPTIONS"])
@require_auth
def api_recalculate_loan_schedule(company_id: int, loan_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    try:
        user = getattr(g, "current_user", None) or {}
        cp = company_policy(int(company_id)) or {}
        mode = str(cp.get("mode") or "owner_managed").strip().lower()
        company_profile = cp.get("company") or {}
        company_role = (user.get("user_role") or user.get("company_role") or "other").strip().lower()

        if not _can_manage_loans(user, company_profile, mode, company_role):
            return jsonify({"ok": False, "error": "PERMISSION_DENIED|manage_loans"}), 403

        user_id = user.get("id") or payload.get("sub")
        user_id = int(user_id) if user_id is not None else None

        with db_service._conn_cursor() as (conn, cur):
            out = db_service.generate_loan_schedule(
                conn,
                int(company_id),
                loan_id=int(loan_id),
                user_id=user_id,
            )

        return jsonify({"ok": True, "data": out}), 200

    except Exception as e:
        current_app.logger.exception("❌ api_recalculate_loan_schedule failed")
        return jsonify({"ok": False, "error": str(e)}), 400


@loans_bp.route("/api/companies/<int:company_id>/loans/<int:loan_id>/payments", methods=["POST", "OPTIONS"])
@require_auth
def api_create_loan_payment(company_id: int, loan_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    user = db_service.get_user_context(
        user_id=user_id,
        company_id=company_id,
        delegated_fallback=getattr(g, "current_user", None),
    )
    if not user:
        return jsonify({"ok": False, "error": "User has no access to this company"}), 403

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    raw = request.get_json(silent=True) or {}
    if not isinstance(raw, dict):
        return jsonify({"ok": False, "error": "JSON body must be an object"}), 400

    try:
        payment_date = (raw.get("payment_date") or "").strip()
        if not payment_date:
            return jsonify({"ok": False, "error": "payment_date is required"}), 400

        try:
            payment_date_d = datetime.strptime(payment_date, "%Y-%m-%d").date()
        except Exception:
            return jsonify({"ok": False, "error": "payment_date must be YYYY-MM-DD"}), 400

        amount_paid = raw.get("amount_paid")
        bank_account_id = raw.get("bank_account_id")
        reference = raw.get("reference")
        description = raw.get("description")
        notes = raw.get("notes")
        auto_calculate_split = bool(raw.get("auto_calculate_split", True))

        payment_type = (raw.get("payment_type") or "standard").strip().lower()
        if payment_type not in {"standard", "prepayment"}:
            return jsonify({"ok": False, "error": "payment_type must be 'standard' or 'prepayment'"}), 400

        target_schedule_id = raw.get("target_schedule_id")
        if target_schedule_id not in ("", None):
            try:
                raw["target_schedule_id"] = int(target_schedule_id)
            except Exception:
                return jsonify({"ok": False, "error": "target_schedule_id must be an integer"}), 400
        else:
            raw["target_schedule_id"] = None

        raw["payment_type"] = payment_type
        
        try:
            bank_account_id = int(bank_account_id) if bank_account_id is not None else None
        except Exception:
            bank_account_id = None
        if not bank_account_id:
            return jsonify({"ok": False, "error": "bank_account_id is required"}), 400

        pol = company_policy(int(company_id)) or {}
        mode = str(pol.get("mode") or "owner_managed").strip().lower()
        company_profile = pol.get("company") or {}

        if not can_manage_loans(user, company_profile, mode):
            return jsonify({"ok": False, "error": "PERMISSION_DENIED|manage_loans"}), 403

        is_owner = str(company_profile.get("owner_user_id")) == str(user.get("id"))
        role_norm = normalize_role(user.get("user_role") or user.get("company_role") or user.get("role") or "")
        is_cfo = role_norm in {"cfo", "admin", "owner"} or is_owner

        with db_service._conn_cursor() as (conn, cur):
            loan_row = db_service.get_loan_by_id(conn, int(company_id), int(loan_id))

        currency = (
            str((loan_row or {}).get("currency") or "").strip().upper()
            or str((company_profile or {}).get("currency") or "").strip().upper()
            or "USD"
        )

        review_required = (mode == "controlled") or (
            mode == "assisted" and loan_action_review_required(pol, "payment", user=user) and not is_owner
        )

        if review_required and not is_cfo:
            dedupe_key = (
                f"{company_id}:loans:post_loan_payment:loan:{loan_id}:"
                f"dt:{payment_date_d.isoformat()}:amt:{amount_paid}:bank:{bank_account_id}"
            )

            payload_json = {
                "loan_id": int(loan_id),
                "payment_date": payment_date_d.isoformat(),
                "amount_paid": amount_paid,
                "bank_account_id": int(bank_account_id),
                "reference": reference,
                "description": description,
                "notes": notes,
                "auto_calculate_split": auto_calculate_split,
                "currency": currency,
                "flow": "loan_payment",
                "mode": mode,
            }

            req = db_service.create_approval_request(
                int(company_id),
                entity_type="loan",
                entity_id=str(loan_id),
                entity_ref=(loan_row or {}).get("loan_reference") or f"LOAN-{loan_id}",
                module="loans",
                action="post_loan_payment",
                requested_by_user_id=int(user_id),
                amount=float(amount_paid or 0.0),
                currency=currency,
                risk_level=("high" if mode == "controlled" else "medium"),
                dedupe_key=dedupe_key,
                payload_json=payload_json,
            )

            return jsonify({"ok": False, "error": "APPROVAL_REQUIRED", "approval_request": req}), 202

        with db_service._conn_cursor() as (conn, cur):
            draft = db_service.create_loan_payment(
                conn,
                int(company_id),
                loan_id=int(loan_id),
                data=raw,
                user_id=int(user_id),
            )

        try:
            db_service.audit_log(
                int(company_id),
                actor_user_id=int(user_id),
                module="loans",
                action="create_loan_payment",
                severity="info",
                entity_type="loan",
                entity_id=str(loan_id),
                entity_ref=(loan_row or {}).get("loan_reference") or f"LOAN-{loan_id}",
                before_json={"input": raw},
                after_json=draft,
                message=f"Created loan payment draft for loan {loan_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (create_loan_payment)")

        return jsonify({"ok": True, "data": draft}), 201

    except ValueError as ve:
        return jsonify({"ok": False, "error": str(ve)}), 400
    except Exception as e:
        current_app.logger.exception("❌ api_create_loan_payment failed")
        return jsonify({"ok": False, "error": str(e)}), 500



@loans_bp.route("/api/companies/<int:company_id>/loans/payments/<int:payment_id>/post", methods=["POST", "OPTIONS"])
@require_auth
def api_post_loan_payment(company_id: int, payment_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else None
    if not user_id:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    user = db_service.get_user_context(
        user_id=user_id,
        company_id=company_id,
        delegated_fallback=getattr(g, "current_user", None),
    )
    if not user:
        return jsonify({"ok": False, "error": "User has no access to this company"}), 403

    g.current_user = user
    g.company_id = int(company_id)
    g.user_id = user_id

    try:
        pol = company_policy(int(company_id)) or {}
        mode = str(pol.get("mode") or "owner_managed").strip().lower()
        company_profile = pol.get("company") or {}

        if not can_manage_loans(user, company_profile, mode):
            return jsonify({"ok": False, "error": "PERMISSION_DENIED|post_loan_payment"}), 403

        if mode == "controlled" and not can_release_loan_funds(user, company_profile):
            return jsonify({
                "ok": False,
                "error": "CFO_RELEASE_REQUIRED",
                "message": "Only CFO/admin/owner can release loan payments in controlled mode."
            }), 403

        with db_service._conn_cursor() as (conn, cur):
            out = db_service.post_loan_payment(
                conn,
                int(company_id),
                payment_id=int(payment_id),
                user_id=int(user_id),
            )

        try:
            db_service.audit_log(
                int(company_id),
                actor_user_id=int(user_id),
                module="loans",
                action="post_loan_payment",
                severity="info",
                entity_type="loan_payment",
                entity_id=str(payment_id),
                entity_ref=f"LOAN-PAY-{payment_id}",
                before_json={},
                after_json=out,
                message=f"Posted loan payment {payment_id}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (post_loan_payment)")

        return jsonify({"ok": True, "data": out}), 200

    except Exception as e:
        current_app.logger.exception("❌ api_post_loan_payment failed")
        return jsonify({"ok": False, "error": str(e)}), 400

@loans_bp.route("/api/companies/<int:company_id>/loans/<int:loan_id>/reclassify", methods=["POST", "OPTIONS"])
@require_auth
def api_post_loan_reclassification(company_id: int, loan_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = request.jwt_payload or {}
    deny = _deny_if_wrong_company(payload, int(company_id), db_service=db_service)
    if deny:
        return deny

    data = request.get_json(silent=True) or {}

    try:
        user = getattr(g, "current_user", None) or {}
        cp = company_policy(int(company_id)) or {}
        mode = str(cp.get("mode") or "owner_managed").strip().lower()
        company_profile = cp.get("company") or {}
        company_role = (user.get("user_role") or user.get("company_role") or "other").strip().lower()

        if not _can_manage_loans(user, company_profile, mode, company_role):
            return jsonify({"ok": False, "error": "PERMISSION_DENIED|loan_reclassification"}), 403

        user_id = user.get("id") or payload.get("sub")
        user_id = int(user_id) if user_id is not None else None

        with db_service._conn_cursor() as (conn, cur):
            out = db_service.post_loan_reclassification(
                conn,
                int(company_id),
                loan_id=int(loan_id),
                as_of_date=data.get("as_of_date"),
                user_id=user_id,
            )

        return jsonify({"ok": True, "data": out}), 200

    except Exception as e:
        current_app.logger.exception("❌ api_post_loan_reclassification failed")
        return jsonify({"ok": False, "error": str(e)}), 400