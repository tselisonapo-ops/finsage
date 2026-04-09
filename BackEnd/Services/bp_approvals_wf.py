from datetime import datetime, date
import psycopg2.extras
from flask import Blueprint, jsonify, request, g, current_app
from BackEnd.Services.db_service import db_service
from BackEnd.Services.credit_policy import can_decide_request, must_approve_customer_before_invoicing, can_release_funds, ppe_review_required, can_release_loan_funds  # or can_decide_approvals
from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.routes.invoice_routes import _deny_if_wrong_company  # wherever you placed it
from BackEnd.Services.company import company_policy
from BackEnd.Services.routes.invoice_routes import build_invoice_journal_lines
from BackEnd.Services.routes.vendor_routes import build_bill_journal_lines, vendor_compliance_check
from BackEnd.Services.lease_routes import lease_service_post_modification, lease_service_post_termination
from BackEnd.Services.assets.tenants import company_schema
from BackEnd.Services.assets.posting import post_depreciation, _q, post_subsequent_measurement
from BackEnd.Services.assets.ppe_db import get_conn 
bp_approvals = Blueprint("bp_approvals", __name__)


# ==================================================
# APPROVALS: LIST
# GET /api/companies/<cid>/approvals?status=pending&module=ap&limit=50&offset=0
# ==================================================
@bp_approvals.get("/api/companies/<int:company_id>/approvals")
@require_auth
def api_list_approvals(company_id: int):
    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    status = (request.args.get("status") or "").strip() or None
    module = (request.args.get("module") or "").strip() or None
    limit = int(request.args.get("limit") or 50)
    offset = int(request.args.get("offset") or 0)

    rows = db_service.list_approval_requests(
        company_id,
        status=status,
        module=module,
        limit=min(max(limit, 1), 200),
        offset=max(offset, 0),
    )
    return jsonify({"ok": True, "items": rows}), 200


# ==================================================
# APPROVALS: GET ONE
# GET /api/companies/<cid>/approvals/<rid>
# ==================================================
@bp_approvals.get("/api/companies/<int:company_id>/approvals/<int:request_id>")
@require_auth
def api_get_approval(company_id: int, request_id: int):
    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    row = db_service.get_approval_request(company_id, request_id)
    if not row:
        return jsonify({"ok": False, "error": "Not found"}), 404

    return jsonify({"ok": True, "item": row}), 200


# ==================================================
# APPROVALS: CREATE
# POST /api/companies/<cid>/approvals
# body: {entity_type, entity_id, entity_ref, module, action, amount, currency, risk_level, dedupe_key, payload_json}
# ==================================================
@bp_approvals.post("/api/companies/<int:company_id>/approvals")
@require_auth
def api_create_approval(company_id: int):
    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    # ✅ standard user_id pattern (JWT)
    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else 0
    if user_id <= 0:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    # Keep g.current_user for permission logic (roles, company_role, etc.)
    u = getattr(g, "current_user", None) or {}

    body = request.get_json(silent=True) or {}

    entity_type = (body.get("entity_type") or "").strip().lower()
    entity_id = str(body.get("entity_id") or "").strip()
    module = (body.get("module") or "").strip().lower()
    action = (body.get("action") or "").strip().lower()

    if not entity_type or not entity_id or not module or not action:
        return jsonify({"ok": False, "error": "Missing required fields"}), 400

    payload_json = body.get("payload_json") or {}
    if not isinstance(payload_json, dict):
        payload_json = {"raw": payload_json}

    try:
        created = db_service.create_approval_request(
            company_id,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_ref=(body.get("entity_ref") or None),
            module=module,
            action=action,
            requested_by_user_id=user_id,  # ✅ use JWT user_id
            amount=float(body.get("amount") or 0.0),
            currency=(body.get("currency") or None),
            risk_level=(body.get("risk_level") or "low"),
            dedupe_key=(body.get("dedupe_key") or None),
            payload_json=payload_json,
        )

        # ✅ audit (best-effort)
        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module=module,
                action="approval_requested",
                severity="info",
                entity_type="approval_request",
                entity_id=str(created.get("id")),
                entity_ref=created.get("entity_ref"),
                approval_request_id=int(created.get("id") or 0),
                amount=float(created.get("amount") or 0.0),
                currency=created.get("currency"),
                before_json={},
                after_json={
                    "status": "pending",
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "action_requested": action,
                },
                message=f"{entity_type}:{entity_id} {action}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (approval_requested)")

        status_code = 200 if created.get("_deduped") else 201
        return jsonify({"ok": True, "item": created}), status_code

    except Exception as e:
        current_app.logger.exception("Error creating approval request")
        return jsonify({"ok": False, "error": str(e)}), 400

# ==================================================
# APPROVALS: DECIDE
# POST /api/companies/<cid>/approvals/<rid>/decide
# body: {decision, note, meta_json}
# ==================================================
@bp_approvals.post("/api/companies/<int:company_id>/approvals/<int:request_id>/decide")
@require_auth
def api_decide_approval(company_id: int, request_id: int):
    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    user_id = payload.get("user_id") or payload.get("sub")
    user_id = int(user_id) if user_id is not None else 0
    if user_id <= 0:
        return jsonify({"ok": False, "error": "AUTH|missing_user_id"}), 401

    body = request.get_json(silent=True) or {}

    # ✅ now safe to log
    current_app.logger.warning(
        "APPROVAL_DECIDE_CALL cid=%s rid=%s user_id=%s decision=%s ip=%s meta=%s",
        company_id,
        request_id,
        user_id,
        (body.get("decision") if body else None),
        request.remote_addr,
        (body.get("meta_json") if body else None),
    )

    u = getattr(g, "current_user", None) or {}

    decision = (body.get("decision") or "").strip().lower()
    note = body.get("note") or None
    meta_json = body.get("meta_json") or {}
    if not isinstance(meta_json, dict):
        meta_json = {"raw": meta_json}

    if decision not in {"approve", "reject", "comment", "cancel", "reassign"}:
        return jsonify({"ok": False, "error": "Invalid decision"}), 400

    # load request first
    req = db_service.get_approval_request(company_id, request_id)
    if not req:
        return jsonify({"ok": False, "error": "Approval request not found"}), 404

    if (req.get("status") or "").strip().lower() != "pending":
        return jsonify({"ok": False, "error": f"Request is not pending ({req.get('status')})"}), 400

    pol = company_policy(company_id)
    mode = (pol.get("mode") or "owner_managed").strip().lower()
    company_profile = pol.get("company") or {}
    policy = pol.get("policy") or {}

    if not can_decide_request(u, company_profile, mode, req.get("module"), req.get("action")):
        return jsonify({"ok": False, "error": "Not allowed to decide this request"}), 403

    try:
        updated = db_service.decide_approval_request(
            company_id,
            request_id,
            decision=decision,
            decided_by_user_id=user_id,
            note=note,
            meta_json=meta_json,
        )

        # -----------------------------
        # Execute action on APPROVE
        # -----------------------------
        exec_result = None

        if decision == "approve":
            entity_type = (req.get("entity_type") or "").strip().lower()
            entity_id   = str(req.get("entity_id") or "").strip()
            module      = (req.get("module") or "").strip().lower()
            action      = (req.get("action") or "").strip().lower()

            def _exec_lease_payment(req_row, lease_id_str, *, company_id, user_id):
                pj = req_row.get("payload_json") or {}
                pol2 = company_policy(company_id) or {}
                mode2 = (pol2.get("mode") or "owner_managed").strip().lower()

                lease_id0 = int(lease_id_str)
                amt0 = pj.get("amount")
                pdate0 = date.fromisoformat(str(pj.get("payment_date"))[:10])
                bank_id0 = int(pj.get("bank_account_id"))
                schedule0 = int(pj.get("schedule_id")) if pj.get("schedule_id") else None

                if mode2 == "controlled":
                    dedupe2 = f"{company_id}:leases:release_payment:lease:{lease_id0}:dt:{pdate0.isoformat()}:p:{schedule0 or 0}:amt:{amt0}"
                    req2 = db_service.create_approval_request(
                        company_id,
                        entity_type="lease",
                        entity_id=str(lease_id0),
                        entity_ref=f"LEASE-{lease_id0}",
                        module="leases",
                        action="release_lease_payment",
                        requested_by_user_id=int(user_id),
                        amount=float(amt0 or 0.0),
                        currency=(req_row.get("currency") or pj.get("currency") or "ZAR"),
                        risk_level="high",
                        dedupe_key=dedupe2,
                        payload_json=pj,
                    )
                    return {"ok": True, "next": "cfo_release_required", "release_approval_request": req2}

                out = db_service.post_lease_payment(
                    company_id=int(company_id),
                    lease_id=lease_id0,
                    amount=amt0,
                    payment_date=pdate0,
                    bank_account_id=bank_id0,
                    reference=pj.get("reference"),
                    description=pj.get("description"),
                    user_id=user_id,
                    schedule_id=schedule0,
                )
                return {"ok": True, "lease_id": lease_id0, "result": out}

            def _exec_loan_payment(req_row, loan_id_str, *, company_id, user_id):
                pj = req_row.get("payload_json") or {}
                pol2 = company_policy(company_id) or {}
                mode2 = (pol2.get("mode") or "owner_managed").strip().lower()

                loan_id0 = int(loan_id_str)
                amt0 = pj.get("amount_paid")
                pdate0 = str(pj.get("payment_date") or "")[:10]
                bank_id0 = int(pj.get("bank_account_id"))
                ref0 = pj.get("reference")
                desc0 = pj.get("description")
                notes0 = pj.get("notes")
                auto0 = bool(pj.get("auto_calculate_split", True))

                if mode2 == "controlled":
                    dedupe2 = (
                        f"{company_id}:loans:release_loan_payment:loan:{loan_id0}:"
                        f"dt:{pdate0}:amt:{amt0}:bank:{bank_id0}"
                    )
                    req2 = db_service.create_approval_request(
                        company_id,
                        entity_type="loan",
                        entity_id=str(loan_id0),
                        entity_ref=req_row.get("entity_ref") or f"LOAN-{loan_id0}",
                        module="loans",
                        action="release_loan_payment",
                        requested_by_user_id=int(user_id),
                        amount=float(amt0 or 0.0),
                        currency=(req_row.get("currency") or pj.get("currency") or "ZAR"),
                        risk_level="high",
                        dedupe_key=dedupe2,
                        payload_json=pj,
                    )
                    return {
                        "ok": True,
                        "approved": True,
                        "executed": False,
                        "next": "cfo_release_required",
                        "release_approval_request": req2,
                    }

                conn = db_service.get_conn()
                try:
                    draft = db_service.create_loan_payment(
                        conn,
                        int(company_id),
                        loan_id=loan_id0,
                        data={
                            "payment_date": pdate0,
                            "amount_paid": amt0,
                            "bank_account_id": bank_id0,
                            "reference": ref0,
                            "description": desc0,
                            "notes": notes0,
                            "auto_calculate_split": auto0,
                        },
                        user_id=int(user_id),
                    )
                    payment_id0 = int((draft.get("payment") or {}).get("id"))
                    out = db_service.post_loan_payment(
                        conn,
                        int(company_id),
                        payment_id=payment_id0,
                        user_id=int(user_id),
                    )
                finally:
                    conn.close()

                return {
                    "ok": True,
                    "approved": True,
                    "executed": True,
                    "loan_id": loan_id0,
                    "result": out,
                }
            try:
                # ========= AR =========
                if module == "ar" and action == "approve_customer" and entity_type == "customer":
                    cust_id = int(entity_id)

                    ok = db_service.update_customer(
                        company_id,
                        cust_id,
                        credit_status="approved",
                        approved_by_user_id=user_id,
                        approved_at=datetime.utcnow(),
                    )
                    exec_result = {"ok": bool(ok), "customer_id": cust_id, "new_status": "approved"}

                elif module == "ar" and action == "post_invoice" and entity_type == "invoice":
                    inv_id = int(entity_id)

                    # build jlines from your existing builder
                    inv = db_service.get_invoice_with_lines(company_id, inv_id)
                    if not inv:
                        raise ValueError("Invoice not found")

                    built = build_invoice_journal_lines(inv, company_id)
                    jlines = built.get("lines") or []
                    if not jlines:
                        raise ValueError("No journal lines built for invoice")

                    # ✅ policy flags (match your post_invoice_to_gl signature)
                    pol = company_policy(company_id) or {}
                    mode = (pol.get("mode") or "owner_managed").strip().lower()
                    policy = pol.get("policy") or {}

                    require_approved = must_approve_customer_before_invoicing(mode, policy)

                    # enforce_credit: owners/admin/cfo can override
                    role = (u.get("user_role") or u.get("role") or "").strip().lower()
                    owner_user_id = (pol.get("company") or {}).get("owner_user_id")
                    is_owner = owner_user_id is not None and str(owner_user_id) == str(u.get("id"))
                    can_override_credit = is_owner or role in {"admin", "cfo"}
                    enforce_credit = not can_override_credit

                    # ✅ IMPORTANT: this method already:
                    # - locks invoice
                    # - checks posted_journal_id
                    # - enforces credit (optional)
                    # - posts journal + ledger
                    # - stamps invoice status='posted' + posted_journal_id
                    jid = db_service.post_invoice_to_gl(
                        company_id,
                        inv_id,
                        jlines,
                        enforce_credit=enforce_credit,
                        require_approved=require_approved,
                    )

                    exec_result = {"ok": True, "invoice_id": inv_id, "journal_id": int(jid)}

                elif module == "credit" and action == "kyc_customer" and entity_type == "credit_profile":
                    profile_id = int(entity_id)

                    prof_row = db_service.get_credit_profile_row(int(company_id), profile_id)
                    if not prof_row:
                        raise ValueError("Credit profile not found")

                    cust_id = int(prof_row.get("customer_id") or 0)
                    if not cust_id:
                        raise ValueError("Profile missing customer_id")

                    # Approvals request meta_json carries doc decisions + notes
                    meta = meta_json or {}
                    decision_payload = meta.get("decisionPayload") or meta

                    # Role-based stage routing
                    role = (u.get("user_role") or u.get("role") or "").strip().lower()

                    # Decide status to write into credit_profiles
                    # - junior/senior approve => pending_cfo
                    # - cfo/admin/owner approve => approved
                    # - reject => rejected
                    # - rework => rework (if you want)
                    if decision == "approve":
                        status = "approved" if role in {"cfo", "admin", "owner"} else "pending_cfo"
                    elif decision == "reject":
                        status = "rejected"
                    elif decision == "cancel":
                        status = "cancelled"
                    else:
                        status = "pending"  # comment/reassign shouldn't be here anyway

                    # Pull approved_limit/terms if you allow approver to set them
                    approved_limit = decision_payload.get("approvedLimit")
                    approved_terms = decision_payload.get("approvedTerms")
                    risk_band = decision_payload.get("riskBand") or prof_row.get("risk_band")

                    ok = db_service.update_credit_decision(
                        company_id=int(company_id),
                        profile_id=profile_id,
                        status=status,
                        risk_band=risk_band,
                        approved_limit=approved_limit,
                        approved_terms=approved_terms,
                        decision_payload=decision_payload,
                        reviewer_role=role,
                        reviewer_user_id=int(user_id),
                    )
                    if not ok:
                        raise ValueError("Failed to update credit profile")

                    # Stamp customer ONLY when final approved/rejected/rework
                    if status == "approved":
                        db_service.update_customer(
                            int(company_id),
                            int(cust_id),
                            credit_status="approved",
                            on_hold="no",
                            credit_profile_id=int(profile_id),
                            approved_by_user_id=int(user_id),
                            approved_at=datetime.utcnow(),
                            credit_limit=float(approved_limit) if approved_limit is not None else None,
                            payment_terms=str(approved_terms) if approved_terms else None,
                        )
                    elif status in {"rejected", "rework"}:
                        db_service.update_customer(
                            int(company_id),
                            int(cust_id),
                            credit_status=status,
                            on_hold="yes",
                            credit_profile_id=int(profile_id),
                            approved_by_user_id=int(user_id),
                            approved_at=datetime.utcnow(),
                        )

                    exec_result = {"ok": True, "profile_id": profile_id, "customer_id": cust_id, "new_status": status}

                # ========= AP =========
                elif module == "ap" and action == "post_bill" and entity_type == "bill":
                    bill_id = int(entity_id)

                    bill = db_service.get_bill_full(company_id, bill_id)
                    if not bill:
                        raise ValueError("Bill not found")

                    built = build_bill_journal_lines(bill, company_id)
                    jlines = built.get("lines") or []
                    if not jlines:
                        raise ValueError("No journal lines built for bill")

                    # ✅ IMPORTANT: call your bill posting function that uses the GRNI logic + locks + stamps posted
                    # If your public method is named post_bill_to_gl, use it.
                    # If you currently only have _post_bill_to_gl_cur, create a public wrapper (below).
                    jid = db_service.post_bill_to_gl(company_id, bill_id, jlines=jlines)

                    exec_result = {"ok": True, "bill_id": bill_id, "journal_id": int(jid)}

                elif module == "ap" and action == "allocate_bill_payment" and entity_type == "bill":
                    # ✅ request payload
                    pj = req.get("payload_json") or {}
                    bill_id = int(pj.get("bill_id") or entity_id)
                    payment_id = int(pj.get("payment_id") or 0)
                    amt = pj.get("amount")

                    if payment_id <= 0:
                        raise ValueError("Approval payload missing payment_id")
                    if not amt:
                        raise ValueError("Approval payload missing amount")

                    from decimal import Decimal
                    amount = Decimal(str(amt)).quantize(Decimal("0.01"))

                    # load bill + payment (validate vendor match)
                    bill = db_service.get_bill_by_id(int(company_id), int(bill_id))
                    if not bill:
                        raise ValueError("Bill not found")
                    pay = db_service.get_vendor_payment_by_id(int(company_id), int(payment_id))
                    if not pay:
                        raise ValueError("Vendor payment not found")

                    bill_vendor_id = int(bill.get("vendor_id") or 0)
                    pay_vendor_id  = int(pay.get("vendor_id") or 0)
                    if not bill_vendor_id or bill_vendor_id != pay_vendor_id:
                        raise ValueError("Payment vendor does not match bill vendor")

                    # ✅ perform allocation now (this was what maker requested)
                    out_alloc = db_service.allocate_vendor_payment_to_bill(
                        int(company_id),
                        payment_id=int(payment_id),
                        bill_id=int(bill_id),
                        amount=amount,
                    )

                    # determine mode (fresh policy read)
                    pol2 = company_policy(company_id) or {}
                    mode2 = (pol2.get("mode") or "owner_managed").strip().lower()
                    policy2 = pol2.get("policy") or {}

                    # ASSISTED: approver approve => allocate + release + post GL (1 click)
                    if mode2 == "assisted" and bool(policy2.get("ap_review_enabled", False)):
                        # optional: ensure payment is approved before release
                        st = str(pay.get("status") or "").strip().lower()
                        if st == "draft":
                            db_service.approve_vendor_payment(
                                company_id=int(company_id),
                                payment_id=int(payment_id),
                                user_id=int(user_id),
                            )

                        # release will post journals + clear bills (your service handles that)
                        out_rel = db_service.release_vendor_payment(
                            company_id=int(company_id),
                            payment_id=int(payment_id),
                            user_id=int(user_id),
                        )
                        exec_result = {
                            "ok": True,
                            "bill_id": bill_id,
                            "payment_id": payment_id,
                            "allocated": out_alloc,
                            "released": out_rel,
                        }

                    # CONTROLLED: approver approves allocation only. CFO releases later.
                    elif mode2 == "controlled":
                        # optional: mark payment approved (so CFO only releases approved)
                        st = str(pay.get("status") or "").strip().lower()
                        if st == "draft":
                            db_service.approve_vendor_payment(
                                company_id=int(company_id),
                                payment_id=int(payment_id),
                                user_id=int(user_id),
                            )

                        # ==========================================================
                        # ✅ ADD THIS: create CFO release approval request (step 2)
                        # ==========================================================
                        dedupe_key2 = f"{company_id}:ap:release_payment:vendor_payment:{payment_id}"

                        req2 = db_service.create_approval_request(
                            company_id,
                            entity_type="vendor_payment",
                            entity_id=str(payment_id),
                            entity_ref=pay.get("reference"),
                            module="ap",
                            action="release_payment",
                            requested_by_user_id=int(user_id),
                            amount=float(pay.get("amount") or 0.0),
                            currency=(req.get("currency") or pj.get("currency") or "ZAR"),
                            risk_level="high",
                            dedupe_key=dedupe_key2,
                            payload_json={
                                "payment_id": int(payment_id),
                                "bill_id": int(bill_id),
                                "source": "allocation_approved",
                            },
                        )

                        exec_result = {
                            "ok": True,
                            "bill_id": bill_id,
                            "payment_id": payment_id,
                            "allocated": out_alloc,
                            "next": "cfo_release_required",
                            "release_approval_request": req2,  # optional (helps UI/debug)
                        }

                    else:
                        # owner_managed / assisted review off: allocation approval shouldn’t exist, but still safe
                        exec_result = {"ok": True, "allocated": out_alloc}
                        
                elif module == "ap" and action == "release_payment" and entity_type in {"vendor_payment", "payment"}:
                    pay_id = int(entity_id)

                    # fresh policy read
                    pol2 = company_policy(company_id) or {}
                    mode2 = (pol2.get("mode") or "owner_managed").strip().lower()

                    # actor role
                    role2 = (u.get("user_role") or u.get("role") or u.get("company_role") or "").strip().lower()
                    owner_user_id = (pol2.get("company") or {}).get("owner_user_id")
                    is_owner = owner_user_id is not None and str(owner_user_id) == str(u.get("id"))

                    # ✅ In CONTROLLED: approval may happen, but EXECUTION only by CFO/admin/owner
                    if mode2 == "controlled" and (role2 not in {"cfo", "admin"} and not is_owner):
                        exec_result = {
                            "ok": True,
                            "payment_id": pay_id,
                            "approved": True,
                            "executed": False,
                            "next": "CFO_RELEASE_REQUIRED",
                            "message": "Approved. CFO must release funds in controlled mode."
                        }
                    else:
                        # ✅ (Optional but recommended) compliance enforcement also applies here
                        pay = db_service.get_vendor_payment_by_id(int(company_id), int(pay_id)) or {}
                        vendor_id = int(pay.get("vendor_id") or 0)

                        warnings = []
                        if vendor_id > 0:
                            cc = vendor_compliance_check(int(company_id), vendor_id)
                            missing = cc.get("missing") or []
                            required = bool(cc.get("compliance_required"))

                            if missing:
                                if mode2 == "controlled" and required:
                                    raise ValueError(f"VENDOR_COMPLIANCE_MISSING: {missing}")
                                if mode2 == "assisted":
                                    warnings = missing

                        out = db_service.release_vendor_payment(
                            company_id=int(company_id),
                            payment_id=int(pay_id),
                            user_id=int(user_id),
                        )
                        exec_result = {"ok": True, "payment_id": pay_id, "executed": True, "warnings": warnings, "result": out}

                # ========= PPE =========
                elif module == "ppe" and action == "approve_depreciation" and entity_type in {"depreciation_batch","depreciation"}:
                    pj = req.get("payload_json") or {}
                    dep_ids = pj.get("dep_ids") or []
                    if not isinstance(dep_ids, list) or not dep_ids:
                        raise ValueError("Approval payload missing dep_ids")

                    dep_ids = [int(x) for x in dep_ids if str(x).isdigit()]
                    if not dep_ids:
                        raise ValueError("Approval payload dep_ids invalid")

                    schema = company_schema(company_id)

                    posted, skipped, missing = [], [], []

                    # lock rows
                    with get_conn(company_id) as conn:
                        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                            cur.execute(_q(schema, """
                                SELECT id, status, posted_journal_id
                                FROM {schema}.asset_depreciation
                                WHERE company_id=%s AND id = ANY(%s)
                                FOR UPDATE
                            """), (company_id, dep_ids))
                            rows = cur.fetchall() or []
                            by_id = {int(r["id"]): r for r in rows}

                            for dep_id in dep_ids:
                                r = by_id.get(int(dep_id))
                                if not r:
                                    missing.append(int(dep_id))
                                    continue

                                st = (r.get("status") or "").strip().lower()

                                # idempotent
                                if st == "posted" and r.get("posted_journal_id"):
                                    skipped.append({"dep_id": int(dep_id), "journal_id": int(r["posted_journal_id"]), "reason": "already_posted"})
                                    continue
                                if st in {"void", "reversed"}:
                                    skipped.append({"dep_id": int(dep_id), "reason": f"status={st}"})
                                    continue

                                # if you want strict: require pending_review in review modes
                                pol2 = company_policy(company_id)
                                mode2 = (pol2.get("mode") or "owner_managed").strip().lower()
                                policy2 = pol2.get("policy") or {}
                                review_required = bool(ppe_review_required(mode2, policy2, "post_depreciation_batch"))
                                if review_required and st != "pending_review":
                                    skipped.append({"dep_id": int(dep_id), "reason": f"requires_pending_review(status={st})"})
                                    continue

                                jid = post_depreciation(cur, company_id, int(dep_id), user=u, approved_via="approval_request")
                                posted.append({"dep_id": int(dep_id), "journal_id": int(jid) if jid else None})

                                # stamp approval info onto depreciation row (optional but nice)
                                cur.execute(_q(schema, """
                                UPDATE {schema}.asset_depreciation
                                SET status='posted', posted_journal_id=%s, posted_at=NOW()
                                WHERE company_id=%s AND id=%s
                                """), (jid, company_id, dep_id))
                            conn.commit()

                    exec_result = {"ok": True, "posted": posted, "skipped": skipped, "missing": missing}

                elif module == "ppe" and action == "post_subsequent_measurement" and entity_type == "subsequent_measurement":
                    sm_id = int(entity_id)

                    schema = company_schema(company_id)

                    with get_conn(company_id) as conn:
                        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                            # lock SM
                            cur.execute(_q(schema, """
                                SELECT *
                                FROM {schema}.asset_subsequent_measurements
                                WHERE company_id=%s AND id=%s
                                FOR UPDATE
                            """), (company_id, sm_id))
                            sm = cur.fetchone()
                            if not sm:
                                raise ValueError("Subsequent measurement not found")

                            st = (sm.get("status") or "").strip().lower()

                            # idempotent
                            if st == "posted" and sm.get("posted_journal_id"):
                                exec_result = {
                                    "ok": True,
                                    "sm_id": sm_id,
                                    "status": "posted",
                                    "journal_id": int(sm["posted_journal_id"]),
                                    "reason": "already_posted"
                                }
                            else:
                                if st in {"void", "reversed"}:
                                    raise ValueError(f"Cannot post in status '{st}'")

                                # enforce pending_review when review is required
                                pol2 = company_policy(company_id)
                                mode2 = (pol2.get("mode") or "owner_managed").strip().lower()
                                policy2 = pol2.get("policy") or {}
                                review_required2 = bool(ppe_review_required(mode2, policy2, "post_subsequent_measurement"))

                                if review_required2 and st != "pending_review":
                                    raise ValueError(f"Requires pending_review, found status={st}")

                                # post now
                                jid = post_subsequent_measurement(cur, company_id, sm_id, user=u, approved_via="approval_request")

                                # stamp approval info
                                cur.execute(_q(schema, """
                                    UPDATE {schema}.asset_subsequent_measurements
                                    SET approved_by=%s,
                                        approved_at=NOW(),
                                        approval_note=COALESCE(%s, approval_note),
                                        updated_at=NOW()
                                    WHERE company_id=%s AND id=%s
                                """), (int(user_id), note, company_id, sm_id))

                                exec_result = {"ok": True, "sm_id": sm_id, "status": "posted", "journal_id": int(jid) if jid else None}

                            conn.commit()

                elif module == "ppe" and action == "post_asset_revaluation" and entity_type == "asset_revaluation":
                    revaluation_id = int(entity_id)
                    schema = company_schema(company_id)

                    with get_conn(company_id) as conn:
                        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

                            cur.execute(_q(schema, """
                                SELECT *
                                FROM {schema}.asset_revaluations
                                WHERE company_id=%s AND id=%s
                                FOR UPDATE
                            """), (company_id, revaluation_id))
                            rv = cur.fetchone()
                            if not rv:
                                raise ValueError("Asset revaluation not found")

                            st = (rv.get("status") or "").strip().lower()

                            if st == "posted" and rv.get("posted_journal_id"):
                                exec_result = {
                                    "ok": True,
                                    "revaluation_id": revaluation_id,
                                    "status": "posted",
                                    "journal_id": int(rv["posted_journal_id"]),
                                    "reason": "already_posted"
                                }
                            else:
                                if st in {"void", "reversed"}:
                                    raise ValueError(f"Cannot post in status '{st}'")

                                pol2 = company_policy(company_id)
                                mode2 = (pol2.get("mode") or "owner_managed").strip().lower()
                                policy2 = pol2.get("policy") or {}
                                review_required2 = bool(ppe_review_required(mode2, policy2, "post_asset_revaluation"))

                                if review_required2 and st != "pending_review":
                                    raise ValueError(f"Requires pending_review, found status={st}")

                                jid = db_service.post_asset_revaluation(
                                    cur,
                                    company_id,
                                    revaluation_id,
                                    user=u,
                                    approved_via="approval_request"
                                )

                                cur.execute(_q(schema, """
                                    UPDATE {schema}.asset_revaluations
                                    SET approved_by=%s,
                                        approved_at=NOW()
                                    WHERE company_id=%s AND id=%s
                                """), (int(user_id), company_id, revaluation_id))

                                exec_result = {
                                    "ok": True,
                                    "revaluation_id": revaluation_id,
                                    "status": "posted",
                                    "journal_id": int(jid) if jid else None
                                }

                            conn.commit()

                # ========= IFRS16 / LEASE PAYMENT =========
                elif module == "ifrs16" and action in {"lease_pay", "post_lease_payment"} and entity_type == "lease":
                    exec_result = _exec_lease_payment(req, entity_id, company_id=company_id, user_id=user_id)

                elif module == "leases" and action == "post_lease_payment" and entity_type == "lease":
                    exec_result = _exec_lease_payment(req, entity_id, company_id=company_id, user_id=user_id)

                # ========= LEASE RELEASE =========
                elif module == "leases" and action == "release_lease_payment" and entity_type == "lease":
                    pol2 = company_policy(company_id) or {}
                    mode2 = (pol2.get("mode") or "owner_managed").strip().lower()
                    company_profile2 = pol2.get("company") or {}

                    # Only CFO/admin/owner can release in controlled mode
                    if mode2 == "controlled" and not can_release_funds(u, company_profile2):
                        exec_result = {
                            "ok": True,
                            "lease_id": int(entity_id),
                            "approved": True,
                            "executed": False,
                            "next": "cfo_release_required",
                            "message": "Approved. CFO must release funds in controlled mode."
                        }
                    else:
                        pj = req.get("payload_json") or {}
                        lease_id0 = int(entity_id)

                        out = db_service.post_lease_payment(
                            company_id=int(company_id),
                            lease_id=lease_id0,
                            amount=pj.get("amount"),
                            payment_date=date.fromisoformat(str(pj.get("payment_date"))[:10]),
                            bank_account_id=int(pj.get("bank_account_id")),
                            reference=pj.get("reference"),
                            description=pj.get("description"),
                            user_id=user_id,
                            schedule_id=int(pj.get("schedule_id")) if pj.get("schedule_id") else None,
                        )

                        exec_result = {
                            "ok": True,
                            "lease_id": lease_id0,
                            "executed": True,
                            "result": out
                        }

                # ========= LEASE MODIFICATION =========
                elif module == "leases" and action == "post_lease_modification" and entity_type == "lease_modification":
                    mod_id = int(entity_id)
                    out = lease_service_post_modification(
                        company_id=int(company_id),
                        modification_id=mod_id,
                        actor=u
                    )
                    exec_result = {"ok": True, "modification_id": mod_id, "result": out}

                # ========= LEASE TERMINATION =========
                elif module == "leases" and action == "post_lease_termination" and entity_type == "lease_termination":
                    term_id = int(entity_id)
                    out = lease_service_post_termination(
                        company_id=int(company_id),
                        termination_id=term_id,
                        actor=u
                    )
                    exec_result = {"ok": True, "termination_id": term_id, "result": out}

                elif module == "loans" and action == "create_loan" and entity_type == "loan":
                    pj = req.get("payload_json") or {}

                    conn = db_service.get_conn()
                    try:
                        out = db_service.create_loan(
                            conn,
                            int(company_id),
                            data=pj,
                            user_id=int(user_id),
                        )
                    finally:
                        conn.close()

                    exec_result = {
                        "ok": True,
                        "executed": True,
                        "result": out,
                    }

                # ========= LOAN PAYMENT =========
                elif module == "loans" and action == "post_loan_payment" and entity_type == "loan":
                    exec_result = _exec_loan_payment(
                        req,
                        entity_id,
                        company_id=company_id,
                        user_id=user_id,
                    )

                # ========= LOAN RELEASE =========
                elif module == "loans" and action == "release_loan_payment" and entity_type == "loan":
                    pol2 = company_policy(company_id) or {}
                    mode2 = (pol2.get("mode") or "owner_managed").strip().lower()
                    company_profile2 = pol2.get("company") or {}

                    if mode2 == "controlled" and not can_release_loan_funds(u, company_profile2):
                        exec_result = {
                            "ok": True,
                            "loan_id": int(entity_id),
                            "approved": True,
                            "executed": False,
                            "next": "cfo_release_required",
                            "message": "Approved. CFO must release loan payment in controlled mode."
                        }

        
                    else:
                        pj = req.get("payload_json") or {}
                        loan_id0 = int(entity_id)

                        conn = db_service.get_conn()
                        try:
                            draft = db_service.create_loan_payment(
                                conn,
                                int(company_id),
                                loan_id=loan_id0,
                                data={
                                    "payment_date": str(pj.get("payment_date") or "")[:10],
                                    "amount_paid": pj.get("amount_paid"),
                                    "bank_account_id": int(pj.get("bank_account_id")),
                                    "reference": pj.get("reference"),
                                    "description": pj.get("description"),
                                    "notes": pj.get("notes"),
                                    "auto_calculate_split": bool(pj.get("auto_calculate_split", True)),
                                },
                                user_id=int(user_id),
                            )
                            payment_id0 = int((draft.get("payment") or {}).get("id"))
                            out = db_service.post_loan_payment(
                                conn,
                                int(company_id),
                                payment_id=payment_id0,
                                user_id=int(user_id),
                            )
                        finally:
                            conn.close()

                        exec_result = {
                            "ok": True,
                            "loan_id": loan_id0,
                            "executed": True,
                            "result": out,
                        }

                # ========= REVENUE =========
                elif module == "revenue" and action == "create_contract" and entity_type == "revenue_contract":
                    contract_id = int(entity_id)
                    out = db_service.get_revenue_contract(company_id, contract_id)
                    if not out:
                        raise ValueError("Revenue contract not found")

                    exec_result = db_service.approve_revenue_contract(
                        company_id=int(company_id),
                        contract_id=int(contract_id),
                        user_id=int(user_id),
                    )

                elif module == "revenue" and action == "approve_modification" and entity_type == "revenue_contract":
                    pj = req.get("payload_json") or {}
                    contract_id = int(entity_id)
                    modification_data = pj.get("modification") or {}
                    exec_result = db_service.apply_revenue_contract_modification(
                        company_id=int(company_id),
                        contract_id=int(contract_id),
                        data=modification_data,
                        user_id=int(user_id),
                    )

                elif module == "revenue" and action == "post_recognition_run" and entity_type == "revenue_run":
                    pj = req.get("payload_json") or {}
                    run_id = int(pj.get("run_id") or entity_id)
                    exec_result = db_service.post_revenue_recognition_run(
                        company_id=int(company_id),
                        run_id=int(run_id),
                        user_id=int(user_id),
                    )

                elif module == "revenue" and action == "reverse_recognition_run" and entity_type == "revenue_run":
                    pj = req.get("payload_json") or {}
                    run_id = int(pj.get("run_id") or entity_id)
                    exec_result = db_service.reverse_revenue_recognition_run(
                        company_id=int(company_id),
                        run_id=int(run_id),
                        user_id=int(user_id),
                    )

                # ========= FALLBACK =========
                else:
                    exec_result = {
                        "ok": False,
                        "error": "NO_EXECUTOR_FOR_ACTION",
                        "module": module,
                        "action": action,
                        "entity_type": entity_type,
                    }

            except Exception as ex:
                current_app.logger.exception("Approval execution failed")
                detail = str(ex or "")
                if detail.startswith("PERIOD_LOCKED|"):
                    exec_result = {"ok": False, "error": detail, "detail": detail}
                else:
                    exec_result = {"ok": False, "error": "EXECUTION_FAILED", "detail": detail}

        # ✅ audit (best-effort)
        try:
            db_service.audit_log(
                company_id,
                actor_user_id=user_id,
                module=(req.get("module") or "approvals"),
                action="approval_decided",
                severity="info" if decision in {"approve", "comment"} else "warning",
                entity_type="approval_request",
                entity_id=str(request_id),
                entity_ref=req.get("entity_ref"),
                approval_request_id=int(request_id),
                amount=float(req.get("amount") or 0.0),
                currency=req.get("currency"),
                before_json={"status": "pending", "request": req},
                after_json={
                    "status": updated.get("status"),
                    "decision": decision,
                    "note": note,
                    "meta_json": meta_json,
                    "executed": exec_result,
                },
                message=f"Decision={decision} on {req.get('entity_type')}:{req.get('entity_id')} ({req.get('action')})",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed (approval_decided)")

        # ✅ RETURN exec_result so UI knows what happened
        return jsonify({"ok": True, "item": updated, "executed": exec_result}), 200

    except Exception as e:
        current_app.logger.exception("Error deciding approval")
        return jsonify({"ok": False, "error": str(e)}), 400

@bp_approvals.get("/api/companies/<int:company_id>/approvals/<int:request_id>/decisions")
@require_auth
def api_list_approval_decisions(company_id: int, request_id: int):
    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    limit = int(request.args.get("limit") or 100)
    offset = int(request.args.get("offset") or 0)

    rows = db_service.list_approval_decisions(
        company_id,
        approval_request_id=request_id,
        limit=min(max(limit, 1), 500),
        offset=max(offset, 0),
    )
    return jsonify({"ok": True, "items": rows}), 200

# ==================================================
# AUDIT: LIST
# GET /api/companies/<cid>/audit?limit=100&offset=0&module=ap&entity_type=journal&entity_id=123
# ==================================================
@bp_approvals.get("/api/companies/<int:company_id>/audit")
@require_auth
def api_list_audit(company_id: int):
    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(
        payload,
        int(company_id),
        db_service=db_service,
    )
    if deny:
        return deny

    limit = int(request.args.get("limit") or 100)
    offset = int(request.args.get("offset") or 0)

    actor_user_id = request.args.get("actor_user_id")
    actor_user_id = int(actor_user_id) if actor_user_id else None

    rows = db_service.list_audit_trail(
        company_id,
        limit=min(max(limit, 1), 500),
        offset=max(offset, 0),
        module=(request.args.get("module") or None),
        severity=(request.args.get("severity") or None),
        entity_type=(request.args.get("entity_type") or None),
        entity_id=(request.args.get("entity_id") or None),
        actor_user_id=actor_user_id,
        from_ts=(request.args.get("from") or None),
        to_ts=(request.args.get("to") or None),
    )
    return jsonify({"ok": True, "items": rows}), 200

