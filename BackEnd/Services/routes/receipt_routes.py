from datetime import date, datetime
from flask import Blueprint, jsonify, request, make_response, current_app, render_template, url_for

from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.db_service import db_service
from BackEnd.Services.emailer import send_mail
from BackEnd.Services.receipt_pdf_service import build_receipt_pdf
from BackEnd.Services.utils.receipt_token import create_receipt_pdf_token, verify_receipt_pdf_token

receipts_bp = Blueprint("receipts_bp", __name__)

def get_company_emails_by_role(company_id, role):
    sql = """
      SELECT email
      FROM users
      WHERE company_id = %s
        AND user_role = %s
    """
    rows = db_service.fetch_all(sql, (company_id, role))
    return [r["email"] for r in rows]


def _send_receipt_email(company_id: int, receipt_id: int, actor_user_id: int, body: dict | None = None):
    body = body or {}
    cc_role = body.get("cc_role")

    rcpt = db_service.get_receipt_by_id(company_id, receipt_id)
    if not rcpt:
        return jsonify({"error": "Receipt not found"}), 404

    preferred = (body.get("to_email") or "").strip() or None
    customer_email = rcpt.get("customer_email")
    company_email = rcpt.get("company_email")
    to_email = preferred or customer_email or company_email

    print(
        "[RECEIPT EMAIL RESOLVE]",
        {
            "preferred": preferred,
            "customer_email": customer_email,
            "company_email": company_email,
            "final_to": to_email,
            "receipt_id": receipt_id,
            "company_id": company_id,
        },
        flush=True,
    )

    if not to_email:
        return jsonify({"error": "Customer has no email."}), 400

    cc_emails = get_company_emails_by_role(company_id, cc_role) if cc_role else []

    company = db_service.fetch_one(
        """
        SELECT
          id,
          name,
          company_reg_no,
          vat,
          tin,
          company_email,
          company_phone,
          physical_address,
          postal_address,
          logo_url
        FROM public.companies
        WHERE id = %s
        LIMIT 1;
        """,
        (company_id,),
    ) or {}

    def _fmt(d):
        if isinstance(d, (datetime, date)):
            return d.strftime("%Y-%m-%d")
        return d or ""

    receipt_date = _fmt(rcpt.get("receipt_date"))
    currency = rcpt.get("currency") or ""
    total = float(rcpt.get("amount") or 0.0)
    customer_name = rcpt.get("customer_name") or "Customer"
    company_name = rcpt.get("company_name") or company.get("name") or "Our Company"
    receipt_no = (rcpt.get("number") or f"RCPT-{receipt_id}").strip()

    text_body = f"""Dear {customer_name},

Please find your receipt attached.

Receipt number: {receipt_no}
Receipt date  : {receipt_date}
Amount        : {currency} {total:,.2f}

Kind regards,
{company_name}
"""
    html_body = f"<pre style='font-family:system-ui,monospace'>{text_body}</pre>"
    subject = f"Receipt {receipt_no} from {company_name}"

    try:
        pdf_bytes = build_receipt_pdf(company_id, receipt_id)
        print("[RECEIPT EMAIL PDF OK]", {"receipt_id": receipt_id, "bytes": len(pdf_bytes)}, flush=True)
    except Exception as e:
        current_app.logger.exception("Failed to generate receipt PDF")
        return jsonify({"error": "Failed to generate receipt PDF", "detail": str(e)}), 500

    attachments = [(f"receipt-{receipt_no}.pdf", pdf_bytes, "application/pdf")]

    print("[RECEIPT EMAIL SEND START]", {"to": to_email, "subject": subject}, flush=True)

    send_mail(
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
        attachments=attachments,
    )

    print("[RECEIPT EMAIL SEND DONE]", {"to": to_email, "receipt_id": receipt_id}, flush=True)

    for cc in cc_emails:
        send_mail(
            to_email=cc,
            subject=f"CC: {subject}",
            html_body=html_body,
            text_body=text_body,
            attachments=attachments,
        )

    db_service.audit_log(
        company_id=company_id,
        actor_user_id=actor_user_id,
        module="ar",
        action="email_sent",
        severity="info",
        entity_type="receipt",
        entity_id=str(receipt_id),
        entity_ref=str(receipt_no),
        customer_id=int(rcpt.get("customer_id")) if rcpt.get("customer_id") else None,
        amount=float(total or 0.0),
        currency=str(currency).upper() if currency else None,
        after_json={
            "to": to_email,
            "cc": cc_emails,
            "subject": subject,
            "source": "preferred" if preferred else "fallback",
            "attachment": f"receipt-{receipt_no}.pdf",
            "pdf_builder": "reportlab",
        },
        message="Receipt emailed successfully",
    )
    return jsonify({"ok": True}), 200


@receipts_bp.route("/api/companies/<int:company_id>/invoices/<int:invoice_id>/receipt/email", methods=["POST"])
@require_auth
def email_receipt_by_invoice(company_id: int, invoice_id: int):
    payload = request.jwt_payload
    actor_user_id = int(payload.get("sub") or 0)
    user_company_id = payload.get("company_id")
    if user_company_id is not None and user_company_id != company_id:
        return jsonify({"error": "Forbidden"}), 403

    body = request.get_json() or {}

    schema = db_service.company_schema(company_id)
    rcpt = db_service.fetch_one(
        f"""
        SELECT r.id
        FROM {schema}.receipts r
        JOIN {schema}.receipt_allocations ra
          ON ra.receipt_id = r.id
        WHERE ra.invoice_id = %s
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 1;
        """,
        (invoice_id,),
    )
    if not rcpt:
        return jsonify({"error": "Receipt not found for this invoice"}), 404

    return _send_receipt_email(company_id, int(rcpt["id"]), actor_user_id, body)


@receipts_bp.route("/api/companies/<int:company_id>/receipts/<int:receipt_id>/email", methods=["POST"])
@require_auth
def email_receipt(company_id: int, receipt_id: int):
    payload = request.jwt_payload
    actor_user_id = int(payload.get("sub") or 0)
    user_company_id = payload.get("company_id")
    if user_company_id is not None and user_company_id != company_id:
        return jsonify({"error": "Forbidden"}), 403

    body = request.get_json() or {}
    return _send_receipt_email(company_id, receipt_id, actor_user_id, body)


@receipts_bp.route("/api/companies/<int:company_id>/receipts/<int:receipt_id>/pdf", methods=["GET"])
def receipt_pdf(company_id: int, receipt_id: int):
    token = request.args.get("t", "")
    payload = verify_receipt_pdf_token(token)
    if not payload:
        return jsonify({"error": "Invalid or expired token"}), 401

    if payload["company_id"] != company_id or payload["receipt_id"] != receipt_id:
        return jsonify({"error": "Token mismatch"}), 403

    rcpt = db_service.get_receipt_by_id(company_id, receipt_id)
    if not rcpt:
        return jsonify({"error": "Receipt not found"}), 404

    try:
        pdf_bytes = build_receipt_pdf(company_id, receipt_id)
        resp = make_response(pdf_bytes)
        resp.headers["Content-Type"] = "application/pdf"
        resp.headers["Content-Disposition"] = f'inline; filename="receipt-{receipt_id}.pdf"'
        resp.headers["Content-Length"] = str(len(pdf_bytes))
        resp.headers["Cache-Control"] = "no-store"
        return resp
    except Exception as e:
        current_app.logger.exception("Receipt PDF generation failed")
        return jsonify({"error": "Receipt PDF generation failed", "detail": str(e)}), 500


@receipts_bp.route("/api/companies/<int:company_id>/receipts/<int:receipt_id>/view", methods=["GET"])
@require_auth
def receipt_view(company_id: int, receipt_id: int):
    payload = request.jwt_payload
    user_company_id = payload.get("company_id")
    if user_company_id is not None and user_company_id != company_id:
        return jsonify({"error": "Forbidden"}), 403

    rcpt = db_service.get_receipt_by_id(company_id, receipt_id)
    if not rcpt:
        return jsonify({"error": "Receipt not found"}), 404

    rcpt["allocations"] = db_service.list_receipt_allocations(company_id, receipt_id)
    rcpt["branding"] = db_service.get_company_branding(company_id) or {}

    token = create_receipt_pdf_token(company_id=company_id, receipt_id=receipt_id, ttl_seconds=120)

    pdf_url = url_for(
        "receipts_bp.receipt_pdf",
        company_id=company_id,
        receipt_id=receipt_id,
        t=token,
        _external=True
    )

    company = db_service.fetch_one(
        """
        SELECT
          id, name, company_reg_no, vat, tin,
          company_email, company_phone,
          physical_address, postal_address,
          logo_url
        FROM public.companies
        WHERE id = %s
        LIMIT 1;
        """,
        (company_id,),
    ) or {}

    html = render_template(
        "receipt_pdf.html",
        receipt=rcpt,
        company=company,
        branding=rcpt.get("branding") or {},
        pdf_url=pdf_url,
    )
    return make_response(html, 200)