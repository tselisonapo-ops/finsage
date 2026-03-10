import re
from datetime import date, timedelta
from flask import Blueprint, request, jsonify, g, current_app, make_response, url_for, render_template
from BackEnd.Services.routes.invoice_routes import build_invoice_journal_lines, _deny_if_wrong_company
from BackEnd.Services.auth_middleware import _corsify, require_auth
from BackEnd.Services.utils.view_token import create_quote_pdf_token, verify_quote_pdf_token
from BackEnd.Services.utils.quote_utils import can_issue_quote, can_accept_quote, can_create_quote
from BackEnd.Services.invoice_pdf_service import html_to_pdf
from BackEnd.Services.credit_policy import (
    
    can_post_invoices,
    should_auto_post_invoice,
    must_approve_customer_before_invoicing
)
from BackEnd.Services.company import company_policy
from BackEnd.Services.db_service import db_service

quotes_bp = Blueprint("quotes", __name__)



# -----------------------------
# ISSUE QUOTE
# -----------------------------
def _num(x, default=0.0) -> float:
    try:
        return float(x)
    except Exception:
        return float(default)

def _int(x, default=0) -> int:
    try:
        return int(x)
    except Exception:
        return int(default)

def _calc_totals_from_lines(lines: list[dict]) -> dict:
    subtotal = 0.0
    vat = 0.0
    for ln in lines:
        qty = _num(ln.get("quantity"), 0.0)
        unit = _num(ln.get("unit_price") or ln.get("unitPrice"), 0.0)
        rate = _num(ln.get("vat_rate") or ln.get("vatRate"), 0.0)

        net = max(0.0, qty * unit)
        subtotal += net
        vat += net * (rate / 100.0)

    return {"subtotal": subtotal, "vat": vat, "total": subtotal + vat}

def _iso(v):
    try:
        return v.isoformat() if v else None
    except Exception:
        return str(v) if v else None

def normalize_quote_dates(full: dict) -> dict:
    if not isinstance(full, dict):
        return full
    full["quotation_date"] = _iso(full.get("quotation_date"))
    full["valid_until"]    = _iso(full.get("valid_until"))
    full["created_at"]     = _iso(full.get("created_at"))
    full["updated_at"]     = _iso(full.get("updated_at"))
    return full


@quotes_bp.route("/api/companies/<int:company_id>/quotes/<int:quote_id>", methods=["PUT", "OPTIONS"])
@require_auth
def update_quote(company_id: int, quote_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    user = getattr(g, "current_user", None) or {}
    user_id = payload.get("user_id") or payload.get("sub") or user.get("id")
    user_id = int(user_id) if user_id is not None else None

    raw = request.get_json(silent=True) or {}
    if not isinstance(raw, dict):
        return jsonify({"error": "JSON body must be an object"}), 400

    # Snapshot before (best-effort) for audit
    before = {}
    try:
        before = db_service.get_quote_full(company_id, quote_id) or {}
    except Exception:
        pass

    # allow UI to send either "quotation_date" or "quote_date"
    quotation_date = (raw.get("quotation_date") or raw.get("quote_date") or str(date.today()))[:10]
    currency = (raw.get("currency") or "ZAR").strip() or "ZAR"
    notes = raw.get("notes") or ""
    terms = raw.get("terms") or ""
    status = (raw.get("status") or "draft").strip().lower() or "draft"

    # UI uses discount_rate as decimal (0.05) OR percent (5)
    dr = _num(raw.get("discount_rate") if raw.get("discount_rate") is not None else raw.get("discountRate"), 0.0)
    discount_rate = (dr / 100.0) if dr > 1.0 else dr
    discount_rate = max(0.0, min(1.0, discount_rate))

    # -----------------------------
    # Lines validation
    # -----------------------------
    lines = raw.get("lines") or []
    if not isinstance(lines, list):
        return jsonify({"error": "lines must be a list"}), 400

    for i, ln in enumerate(lines, start=1):
        desc = (ln.get("description") or "").strip()
        acct = (ln.get("account_code") or ln.get("accountCode") or "").strip()
        if not desc:
            return jsonify({"error": "Missing description", "line_index": i}), 400
        if not acct:
            return jsonify({"error": "Missing account_code", "line_index": i}), 400

    header = {
        "customer_id": int(raw.get("customer_id") or raw.get("customerId") or 0) or None,
        "status": status,
        "quotation_date": quotation_date,
        "currency": currency,
        "notes": notes,
        "terms": terms,
        "discount_rate": discount_rate,
        "valid_until": raw.get("valid_until") or raw.get("validUntil"),
    }

    # If UI didn't send customer_id, reuse existing quote customer_id
    if not header["customer_id"]:
        existing = db_service.get_quote_with_relations(company_id, quote_id) or {}
        header["customer_id"] = int(existing.get("customer_id") or 0) or None

    if not header["customer_id"]:
        return jsonify({"error": "Quote missing customer_id"}), 400

    try:
        db_service.update_quote_with_lines(company_id, quote_id, header, lines)
    except Exception as e:
        current_app.logger.exception("❌ update_quote failed")
        return jsonify({"error": "Server error in update_quote", "detail": str(e)}), 500

    full = db_service.get_quote_full(company_id, quote_id) or {}
    full = normalize_quote_dates(full)

    # ✅ audit (best-effort)
    try:
        qno = (full.get("number") or "").strip() or f"QUOTE-{quote_id}"
        db_service.audit_log(
            int(company_id),
            actor_user_id=user_id,
            module="ar",
            action="update_quote",
            severity="info",
            entity_type="quote",
            entity_id=str(quote_id),
            entity_ref=qno,
            before_json={"quote": before},
            after_json={"quote": full},
            message=f"Updated quote {qno}",
            source="api",
        )
    except Exception:
        current_app.logger.exception("audit_log failed (update_quote)")

    return jsonify(full), 200


@quotes_bp.route("/api/companies/<int:company_id>/quotes/<int:quote_id>/issue", methods=["POST", "OPTIONS"])
@require_auth
def issue_quote(company_id: int, quote_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    user = getattr(g, "current_user", None) or {}
    user_id = payload.get("user_id") or payload.get("sub") or user.get("id")
    user_id = int(user_id) if user_id is not None else None

    ctx = company_policy(company_id)
    company_profile = ctx.get("company") or {}
    policy = ctx.get("policy") or {}  # ✅ use normalized policy

    if not can_issue_quote(user, company_profile):
        return jsonify({"error": "Not allowed"}), 403

    body = request.get_json(silent=True) or {}

    # -------------------------------------------------
    # ✅ APPROVAL GATE (QUOTE ISSUE)
    # -------------------------------------------------
    force = str(body.get("force") or "").strip().lower() in {"1", "true", "yes"}
    require_review = bool(policy.get("require_quote_issue_review", False))

    if require_review and not force:
        # Load quote for entity_ref/amount/currency (best effort)
        try:
            full0 = db_service.get_quote_full(company_id, quote_id) or {}
            ref0 = (full0.get("number") or f"QUOTE-{quote_id}")
            total0 = float(full0.get("total_amount") or full0.get("total") or 0.0)
            cur0 = (full0.get("currency") or "ZAR")
        except Exception:
            ref0, total0, cur0 = f"QUOTE-{quote_id}", 0.0, "ZAR"

        rid = db_service.create_approval_request(
            company_id,
            entity_type="quote",
            entity_id=str(int(quote_id)),
            entity_ref=str(ref0),
            module="ar",
            action="quote_issue",
            requested_by_user_id=int(user_id or 0),
            amount=float(total0 or 0.0),
            currency=str(cur0 or "ZAR"),
            risk_level="low",
            dedupe_key=f"ar:quote:{int(quote_id)}:issue",
            payload_json={"quote_id": int(quote_id)},
        )

        return jsonify({
            "ok": True,
            "status": "approval_required",
            "approval_request_id": int(rid.get("id") or 0),
            "quote_id": int(quote_id),
        }), 202
    # -------------------------------------------------

    # existing payload parsing continues
    req_valid_days = body.get("valid_days")
    try:
        req_valid_days = int(req_valid_days) if req_valid_days is not None else None
    except Exception:
        req_valid_days = None

    default_valid_days = int(policy.get("quote_valid_days") or 30)
    valid_days = req_valid_days if req_valid_days and req_valid_days > 0 else default_valid_days

    schema = db_service.company_schema(company_id)

    before = {}
    try:
        before = db_service.get_quote_full(company_id, quote_id) or {}
    except Exception:
        pass

    with db_service._conn_cursor() as (conn, cur):
        try:
            cur.execute("SELECT pg_advisory_xact_lock(%s);", (int(company_id),))

            cur.execute(f"""
                SELECT id, status, number, quotation_date, valid_until
                FROM {schema}.quotations
                WHERE company_id=%s AND id=%s
                FOR UPDATE
            """, (int(company_id), int(quote_id)))
            q = cur.fetchone()
            if not q:
                conn.rollback()
                return jsonify({"error": "Not found"}), 404

            status = (q.get("status") or "").strip().lower()
            if status != "draft":
                conn.rollback()
                return jsonify({"error": f"Cannot issue from status {status}"}), 400

            quote_no = (q.get("number") or "").strip()
            if not quote_no:
                quote_no = db_service.next_invoice_number(company_id, key="quote")

            quote_date = q.get("quotation_date") or date.today()
            valid_until = q.get("valid_until") or (quote_date + timedelta(days=valid_days))

            cur.execute(f"""
                UPDATE {schema}.quotations
                SET status='issued',
                    number=%s,
                    issued_at=NOW(),
                    issued_by=%s,
                    valid_until=%s,
                    updated_at=NOW()
                WHERE company_id=%s AND id=%s
            """, (
                quote_no,
                int(user_id or 0),
                valid_until,
                int(company_id),
                int(quote_id),
            ))

            conn.commit()

        except Exception as e:
            current_app.logger.exception("❌ issue_quote failed")
            conn.rollback()
            return jsonify({"error": "Server error in issue_quote", "detail": str(e)}), 500

    full = db_service.get_quote_full(company_id, quote_id) or {}
    full = normalize_quote_dates(full)

    try:
        db_service.audit_log(
            int(company_id),
            actor_user_id=user_id,
            module="ar",
            action="issue_quote",
            severity="info",
            entity_type="quote",
            entity_id=str(quote_id),
            entity_ref=(full.get("number") or f"QUOTE-{quote_id}"),
            before_json={"quote": before},
            after_json={"quote": full},
            message=f"Issued quote {(full.get('number') or quote_id)}",
            source="api",
        )
    except Exception:
        current_app.logger.exception("audit_log failed (issue_quote)")

    return jsonify(full), 200

# -----------------------------
# ACCEPT + CONVERT (policy-aware)
# -----------------------------

@quotes_bp.route("/api/companies/<int:company_id>/quotes/<int:quote_id>/accept", methods=["POST", "OPTIONS"])
@require_auth
def accept_quote(company_id: int, quote_id: int):
    from datetime import date, timedelta  # ensure available

    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    user = getattr(g, "current_user", {}) or {}
    user_id = payload.get("user_id") or payload.get("sub") or user.get("id")
    user_id = int(user_id) if user_id is not None else None

    ctx = company_policy(company_id)
    mode = (ctx.get("mode") or "").strip().lower()
    policy = ctx.get("policy") or {}
    company_profile = ctx.get("company") or {}

    if not can_accept_quote(user, company_profile):
        return jsonify({"error": "Not allowed"}), 403

    body = request.get_json(silent=True) or {}

    # -------------------------------------------------
    # ✅ APPROVAL GATE (QUOTE ACCEPT / CONVERT)
    # -------------------------------------------------
    force = str(body.get("force") or "").strip().lower() in {"1", "true", "yes"}
    require_review = bool(policy.get("require_quote_accept_review", False))

    if require_review and not force:
        try:
            full0 = db_service.get_quote_full(company_id, quote_id) or {}
            ref0 = (full0.get("number") or f"QUOTE-{quote_id}")
            total0 = float(full0.get("total_amount") or full0.get("total") or 0.0)
            cur0 = (full0.get("currency") or "ZAR")
        except Exception:
            ref0, total0, cur0 = f"QUOTE-{quote_id}", 0.0, "ZAR"

        rid = db_service.create_approval_request(
            company_id,
            entity_type="quote",
            entity_id=str(int(quote_id)),
            entity_ref=str(ref0),
            module="ar",
            action="quote_accept",
            requested_by_user_id=int(user_id or 0),
            amount=float(total0 or 0.0),
            currency=str(cur0 or "ZAR"),
            risk_level="medium",
            dedupe_key=f"ar:quote:{int(quote_id)}:accept",
            payload_json={"quote_id": int(quote_id)},
        )

        return jsonify({
            "ok": True,
            "status": "approval_required",
            "approval_request_id": int(rid.get("id") or 0),
            "quote_id": int(quote_id),
        }), 202
    # -------------------------------------------------

    schema = db_service.company_schema(company_id)

    with db_service._conn_cursor() as (conn, cur):
        stage = "begin"
        invoice_id = None

        try:
            stage = "lock_company"
            cur.execute("SELECT pg_advisory_xact_lock(%s);", (int(company_id),))

            stage = "lock_quote"
            cur.execute(
                f"""
                SELECT *
                FROM {schema}.quotations
                WHERE company_id=%s AND id=%s
                FOR UPDATE
                """,
                (int(company_id), int(quote_id)),
            )
            q = cur.fetchone()
            if not q:
                conn.rollback()
                return jsonify({"error": "Quote not found"}), 404

            # -------------------------------------------------
            # 2) Idempotency
            # -------------------------------------------------
            stage = "idempotency_check"
            existing_invoice_id = q.get("invoice_id")
            if existing_invoice_id:
                conn.commit()
                return jsonify(
                    {"ok": True, "invoice_id": int(existing_invoice_id), "status": "already_converted"},
                ), 200

            # -------------------------------------------------
            # 3) Status gate
            # -------------------------------------------------
            stage = "status_gate"
            status = (q.get("status") or "").strip().lower()
            if status not in {"issued", "accepted"}:
                conn.rollback()
                return jsonify({"error": f"Quote must be issued before accepting (status={status})"}), 400

            # -------------------------------------------------
            # 4) Policy-based expiry
            # -------------------------------------------------
            stage = "expiry_check"
            quote_date = q.get("quotation_date") or date.today()
            valid_days = int((policy or {}).get("quote_valid_days") or 30)
            effective_valid_until = q.get("valid_until") or (quote_date + timedelta(days=valid_days))

            if date.today() > effective_valid_until:
                cur.execute(
                    f"""
                    UPDATE {schema}.quotations
                    SET status='expired',
                        valid_until=COALESCE(valid_until, %s),
                        updated_at=NOW()
                    WHERE company_id=%s AND id=%s
                    """,
                    (effective_valid_until, int(company_id), int(quote_id)),
                )
                conn.commit()
            
                try:
                    db_service.audit_log(
                        int(company_id),
                        actor_user_id=user_id,
                        module="ar",
                        action="quote_expired_on_accept",
                        severity="warning",
                        entity_type="quote",
                        entity_id=str(quote_id),
                        entity_ref=(q.get("number") or f"QUOTE-{quote_id}"),
                        before_json={},
                        after_json={"status": "expired", "valid_until": str(effective_valid_until)},
                        message=f"Quote expired on accept attempt (quote_id={quote_id})",
                        source="api",
                    )
                except Exception:
                    current_app.logger.exception("audit_log failed (quote_expired_on_accept)")

                return jsonify(
                    {"error": "Quotation expired", "valid_until": str(effective_valid_until), "policy_valid_days": valid_days}
                ), 409

            # -------------------------------------------------
            # 5) Customer policy gate
            # -------------------------------------------------
            stage = "customer_gate"
            cust_id = int(q.get("customer_id") or 0)
            if not cust_id:
                conn.rollback()
                return jsonify({"error": "Quote missing customer_id"}), 400

            cust = db_service.get_customer(company_id, cust_id)
            if not cust:
                conn.rollback()
                return jsonify({"error": "Customer not found"}), 404

            if not cust.get("is_active", True):
                conn.rollback()
                return jsonify({"error": "Customer is archived/inactive and cannot be invoiced.", "customer_id": cust_id}), 409

            credit_status = (cust.get("credit_status") or "").strip().lower()
            on_hold = (cust.get("on_hold") or "no").strip().lower()
            if on_hold in {"yes", "true", "1"}:
                conn.rollback()
                return jsonify({"error": "Customer is on hold and cannot be invoiced.", "customer_id": cust_id}), 409

            enforce_customer_approval = must_approve_customer_before_invoicing(mode, policy)
            if enforce_customer_approval and credit_status not in {"approved", "cod_only"}:
                conn.rollback()
                return jsonify(
                    {
                        "error": "Customer is not approved for invoicing.",
                        "customer_id": cust_id,
                        "credit_status": credit_status,
                        "mode": mode,
                    }
                ), 409

            def _parse_term_days(payment_terms: str) -> int | None:
                if not payment_terms:
                    return None
                m = re.search(r"(\d+)", str(payment_terms))
                return int(m.group(1)) if m else None

            # --- inside accept_quote after cust is loaded ---
            invoice_date = date.today()

            term_days = _parse_term_days(cust.get("payment_terms"))
            if term_days is None:
                term_days = int((policy or {}).get("default_payment_terms_days") or 30)

            due_date = invoice_date + timedelta(days=term_days)

            # -------------------------------------------------
            # 6) Fetch + validate quote lines ONCE
            # -------------------------------------------------
            stage = "fetch_quote_lines"
            cur.execute(
                f"""
                SELECT *
                FROM {schema}.quotation_lines
                WHERE company_id=%s AND quotation_id=%s
                ORDER BY line_no ASC, id ASC
                """,
                (int(company_id), int(quote_id)),
            )
            qlines = cur.fetchall() or []
            if not qlines:
                conn.rollback()
                return jsonify({"error": "Quotation has no lines"}), 400

            stage = "validate_quote_lines"
            for i, ln in enumerate(qlines, start=1):
                if not (ln.get("description") or "").strip():
                    conn.rollback()
                    return jsonify({"error": "Missing description", "line_index": i}), 400
                if not (ln.get("account_code") or "").strip():
                    conn.rollback()
                    return jsonify({"error": "Missing account_code", "line_index": i}), 400

            # -------------------------------------------------
            # 7) Build invoice payload + insert
            # -------------------------------------------------
            stage = "insert_invoice"
            inv_header = {
                "customer_id": cust_id,
                "status": "draft",
                "invoice_date": invoice_date,
                "due_date": due_date,   # ✅ now set
                "currency": q.get("currency"),
                "notes": q.get("notes"),
                "bank_account_id": None,
                "discount_rate": float(q.get("discount_rate") or 0.0),
                "other": 0,
            }

            inv_lines = [
                {
                    "item_name": ln.get("item_name"),
                    "description": ln.get("description"),
                    "account_code": ln.get("account_code"),
                    "quantity": ln.get("quantity"),
                    "unit_price": ln.get("unit_price"),
                    "discount_amount": ln.get("discount_amount"),
                    "vat_rate": ln.get("vat_rate"),
                }
                for ln in qlines
            ]

            invoice_id = db_service._insert_invoice_with_lines_cur(company_id, inv_header, inv_lines, cur)

            # -------------------------------------------------
            # 8) Mark quote converted
            # -------------------------------------------------
            stage = "mark_quote_converted"
            cur.execute(
                f"""
                UPDATE {schema}.quotations
                SET status='converted',
                    invoice_id=%s,
                    converted_at=NOW(),
                    accepted_at=COALESCE(accepted_at, NOW()),
                    accepted_by=COALESCE(accepted_by, %s),
                    updated_at=NOW()
                WHERE company_id=%s AND id=%s
                """,
                (int(invoice_id), int(user_id or 0), int(company_id), int(quote_id)),
            )

            # -------------------------------------------------
            # 9) Commit conversion BEFORE GL helpers
            # -------------------------------------------------
            auto_post = bool(should_auto_post_invoice(mode, policy))
            auto_posted = False

            stage = "commit_conversion"
            conn.commit()

            try:
                db_service.audit_log(
                    int(company_id),
                    actor_user_id=user_id,
                    module="ar",
                    action="accept_quote_convert",
                    severity="info",
                    entity_type="quote",
                    entity_id=str(quote_id),
                    entity_ref=(q.get("number") or f"QUOTE-{quote_id}"),
                    before_json={"quote_id": int(quote_id)},
                    after_json={"invoice_id": int(invoice_id)},
                    message=f"Converted quote {quote_id} to invoice {invoice_id}",
                    source="api",
                )
            except Exception:
                current_app.logger.exception("audit_log failed (accept_quote_convert)")

            if not auto_post:
                return jsonify({"ok": True, "invoice_id": int(invoice_id), "auto_posted": False}), 200

            # Defaults to avoid UnboundLocalError
            payload2 = None
            enforce_credit = True

            # -------------------------------------------------
            # 10) Auto-post preflight
            # -------------------------------------------------
            if auto_post and can_post_invoices(user, company_profile, mode):
                try:
                    stage = "approve_invoice"
                    db_service.approve_invoice(company_id, int(invoice_id), user.get("id"))

                    stage = "load_invoice_with_lines"
                    inv = db_service.get_invoice_with_lines(company_id, int(invoice_id))
                    if inv is None:
                        raise ValueError(f"Invoice could not be loaded after convert (invoice_id={invoice_id})")
                    if not isinstance(inv, dict):
                        raise TypeError(f"get_invoice_with_lines returned {type(inv)} (invoice_id={invoice_id})")
                    if not inv.get("lines"):
                        raise ValueError(f"Invoice has no lines after convert (invoice_id={invoice_id})")

                    stage = "build_journal_lines"
                    payload2 = build_invoice_journal_lines(inv, company_id)

                    stage = "determine_credit_enforcement"
                    owner_user_id = (company_profile or {}).get("owner_user_id")
                    is_owner = owner_user_id is not None and str(owner_user_id) == str(user.get("id"))
                    role = (user.get("user_role") or user.get("role") or "").lower()
                    can_override = role in {"cfo", "admin"} or is_owner
                    enforce_credit = not can_override

                except Exception as e:
                    current_app.logger.exception(
                        "❌ accept_quote auto-post preflight failed (stage=%s company_id=%s quote_id=%s invoice_id=%s)",
                        stage, company_id, quote_id, invoice_id
                    )
                    return jsonify(
                        {"error": "auto_post preflight failed", "stage": stage, "invoice_id": int(invoice_id), "detail": str(e)}
                    ), 500

            # If we can't build lines, bail cleanly
            if not payload2 or not payload2.get("lines"):
                current_app.logger.error(
                    "❌ auto_post blocked: no journal lines (stage=%s company_id=%s quote_id=%s invoice_id=%s payload2=%s)",
                    stage, company_id, quote_id, invoice_id, payload2
                )
                return jsonify(
                    {"error": "auto_post blocked", "stage": stage, "invoice_id": int(invoice_id), "detail": "No journal lines available for posting."}
                ), 500

            # -------------------------------------------------
            # 11) Post to GL
            # -------------------------------------------------
            try:
                stage = "post_invoice_to_gl"
                db_service.post_invoice_to_gl(
                    company_id,
                    int(invoice_id),
                    payload2["lines"],
                    enforce_credit=enforce_credit,
                    require_approved=enforce_customer_approval,
                )

                stage = "stamp_invoice_posted"
                db_service.set_invoice_status(company_id, int(invoice_id), "posted")
                auto_posted = True

                try:
                    db_service.audit_log(
                        int(company_id),
                        actor_user_id=user_id,
                        module="ar",
                        action="accept_quote_auto_post",
                        severity="info",
                        entity_type="invoice",
                        entity_id=str(invoice_id),
                        entity_ref=f"INV-{invoice_id}",
                        before_json={},
                        after_json={"posted": True},
                        message=f"Auto-posted invoice {invoice_id} created from quote {quote_id}",
                        source="api",
                    )
                except Exception:
                    current_app.logger.exception("audit_log failed (accept_quote_auto_post)")

            except Exception as e:
                current_app.logger.exception(
                    "❌ post_invoice_to_gl failed (stage=%s company_id=%s quote_id=%s invoice_id=%s)",
                    stage, company_id, quote_id, invoice_id
                )
                current_app.logger.error(
                    "POST payload invoice_id=%s enforce_credit=%s require_approved=%s payload2=%s",
                    invoice_id, enforce_credit, enforce_customer_approval, payload2
                )
                return jsonify(
                    {"error": "post_invoice_to_gl failed", "stage": stage, "invoice_id": int(invoice_id), "detail": str(e)}
                ), 500

            return jsonify({"ok": True, "invoice_id": int(invoice_id), "auto_posted": auto_posted}), 200

        except Exception as e:
            current_app.logger.exception(
                "❌ accept_quote failed (stage=%s company_id=%s quote_id=%s invoice_id=%s)",
                stage, company_id, quote_id, invoice_id
            )
            try:
                conn.rollback()
            except Exception:
                pass
            return jsonify({"error": "Server error in accept_quote", "stage": stage, "detail": str(e)}), 500


# -----------------------------
# VIEW HTML (auth)
# -----------------------------
@quotes_bp.route("/api/companies/<int:company_id>/quotes/<int:quote_id>/view", methods=["GET", "OPTIONS"])
@require_auth
def quote_view(company_id: int, quote_id: int):
    user = getattr(g, "current_user", {}) or {}
    if user.get("company_id") != company_id:
        return jsonify({"error": "Not authorised for this company"}), 403

    quote = db_service.get_quote_full(company_id, quote_id)
    if not quote:
        return jsonify({"error": "Not found"}), 404

    quote["branding"] = db_service.get_company_branding(company_id) or {}

    token = create_quote_pdf_token(company_id=company_id, quote_id=quote_id, ttl_seconds=120)
    pdf_url = url_for("quotes.quote_pdf", company_id=company_id, quote_id=quote_id, t=token, _external=True)

    company = db_service.get_company_profile(company_id) or {}

    html = render_template("quote_pdf.html", quote=quote, company=company, pdf_url=pdf_url)
    return html, 200


# -----------------------------
# PDF (token-secured, no auth)
# -----------------------------
@quotes_bp.route("/api/companies/<int:company_id>/quotes/<int:quote_id>/pdf", methods=["GET", "OPTIONS"])
def quote_pdf(company_id: int, quote_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))
    
    token = request.args.get("t", "")
    payload = verify_quote_pdf_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401
    if payload["company_id"] != company_id or payload["quote_id"] != quote_id:
        return jsonify({"error": "Token mismatch"}), 403

    quote = db_service.get_quote_full(company_id, quote_id)
    if not quote:
        return jsonify({"error": "Not found"}), 404

    quote["branding"] = db_service.get_company_branding(company_id) or {}
    company = db_service.get_company_profile(company_id) or {}

    html = render_template("quote_pdf.html", quote=quote, company=company, pdf_url="")
    pdf_bytes = html_to_pdf(html)

    resp = make_response(pdf_bytes)
    resp.headers["Content-Type"] = "application/pdf"
    resp.headers["Content-Disposition"] = f'inline; filename="quote-{quote_id}.pdf"'
    resp.headers["Content-Length"] = str(len(pdf_bytes))
    resp.headers["Cache-Control"] = "no-store"

    return _corsify(resp)

@quotes_bp.route("/api/companies/<int:company_id>/quotes", methods=["GET", "POST", "OPTIONS"])
@require_auth
def quotes_root(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, int(company_id))
    if deny:
        return deny

    user = getattr(g, "current_user", {}) or {}
    user_id = payload.get("user_id") or payload.get("sub") or user.get("id")
    user_id = int(user_id) if user_id is not None else None

    db_service.ensure_company_schema(company_id)
    schema = db_service.company_schema(company_id)

    # --------------------------
    # POST = CREATE
    # --------------------------
    if request.method == "POST":
        ctx = company_policy(company_id)
        company_profile = ctx.get("company") or {}

        if not can_create_quote(user, company_profile):
            return jsonify({"error": "Not allowed to create quotations"}), 403

        body = request.get_json(silent=True) or {}
        customer_id = int(body.get("customer_id") or body.get("customerId") or 0)
        if not customer_id:
            return jsonify({"error": "customer_id required"}), 400

        lines = body.get("lines")
        if not isinstance(lines, list) or not lines:
            return jsonify({"error": "lines must be a non-empty list"}), 400

        for i, ln in enumerate(lines, start=1):
            desc = (ln.get("description") or "").strip()
            acct = (ln.get("account_code") or ln.get("accountCode") or "").strip()
            if not desc:
                return jsonify({"error": "Missing description", "line_index": i}), 400
            if not acct:
                return jsonify({"error": "Missing account_code", "line_index": i}), 400

        header = {
            "customer_id": customer_id,
            "status": (body.get("status") or "draft").strip().lower(),
            "quotation_date": (body.get("quotation_date") or body.get("quote_date") or str(date.today()))[:10],
            "currency": (body.get("currency") or "ZAR").strip() or "ZAR",
            "notes": body.get("notes") or "",
            "terms": body.get("terms") or "",
            "discount_rate": float(body.get("discount_rate") or body.get("discountRate") or 0.0),
            "valid_until": body.get("valid_until") or body.get("validUntil"),
        }

        try:
            quote_id = db_service.insert_quote_with_lines(company_id, header, lines)
            full = db_service.get_quote_full(company_id, quote_id) or {}
            full = normalize_quote_dates(full)

            # ✅ audit
            try:
                db_service.audit_log(
                    int(company_id),
                    actor_user_id=user_id,
                    module="ar",
                    action="create_quote",
                    severity="info",
                    entity_type="quote",
                    entity_id=str(quote_id),
                    entity_ref=(full.get("number") or f"QUOTE-{quote_id}"),
                    before_json={"input": body},
                    after_json={"quote": full},
                    message=f"Created quote {quote_id} (draft)",
                    source="api",
                )
            except Exception:
                current_app.logger.exception("audit_log failed (create_quote)")

            return jsonify(full), 201

        except Exception as e:
            current_app.logger.exception("❌ create quote failed")
            return jsonify({"error": "Failed to create quote", "detail": str(e)}), 500

    # --------------------------
    # GET = LIST
    # --------------------------
    status_raw = (request.args.get("status") or "").strip().lower()
    customer_id = request.args.get("customer_id") or request.args.get("customerId")
    statuses = [s.strip() for s in status_raw.split(",") if s.strip()]

    where = ["q.company_id=%s"]
    params = [int(company_id)]

    if statuses:
        if len(statuses) == 1:
            where.append("LOWER(COALESCE(q.status,''))=%s")
            params.append(statuses[0])
        else:
            where.append("LOWER(COALESCE(q.status,'')) = ANY(%s)")
            params.append(statuses)

    if customer_id:
        try:
            where.append("q.customer_id=%s")
            params.append(int(customer_id))
        except Exception:
            return jsonify({"error": "Invalid customer_id"}), 400

    sql = f"""
        SELECT q.id, q.number, q.status, q.customer_id,
               q.quotation_date, q.valid_until, q.currency,
               COALESCE(q.total_amount, 0) AS total,
               c.name AS customer_name, c.email AS customer_email
        FROM {schema}.quotations q
        LEFT JOIN {schema}.customers c
          ON c.company_id=q.company_id AND c.id=q.customer_id
        WHERE {" AND ".join(where)}
        ORDER BY q.id DESC
        LIMIT 200
    """

    with db_service._conn_cursor() as (conn, cur):
        cur.execute(sql, tuple(params))
        rows = cur.fetchall() or []

    return jsonify({"quotes": rows}), 200


@quotes_bp.route("/api/companies/<int:company_id>/quotes/<int:quote_id>", methods=["GET"])
@require_auth
def get_quote(company_id: int, quote_id: int):
    user = getattr(g, "current_user", {}) or {}
    if int(user.get("company_id") or 0) != int(company_id):
        return jsonify({"error": "Not authorised"}), 403

    full = db_service.get_quote_full(company_id, quote_id) or {}

    # ✅ helper to force ISO date format
    def _iso(d):
        try:
            return d.isoformat() if d else None
        except Exception:
            return str(d) if d else None

    # ✅ normalize dates for frontend <input type="date">
    full["quotation_date"] = _iso(full.get("quotation_date"))
    full["valid_until"]    = _iso(full.get("valid_until"))
    full["created_at"]     = _iso(full.get("created_at"))
    full["updated_at"]     = _iso(full.get("updated_at"))

    return jsonify(full), 200
