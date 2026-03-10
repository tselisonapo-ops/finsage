from flask import Blueprint, jsonify, request, make_response, current_app

from BackEnd.Services.auth_middleware import require_auth
from BackEnd.Services.db_service import db_service
from BackEnd.Services.emailer import send_mail
from BackEnd.Services.receipt_pdf_service import generate_receipt_pdf

receipts_bp = Blueprint("receipts_bp", __name__)

@receipts_bp.route("/api/companies/<int:company_id>/receipts/<int:receipt_id>/pdf", methods=["GET"])
@require_auth
def receipt_pdf(company_id: int, receipt_id: int):
    payload = request.jwt_payload
    user_company_id = payload.get("company_id")
    if user_company_id is not None and user_company_id != company_id:
        return jsonify({"error": "Forbidden"}), 403

    pdf_bytes = generate_receipt_pdf(company_id, receipt_id)
    resp = make_response(pdf_bytes)
    resp.headers["Content-Type"] = "application/pdf"
    resp.headers["Content-Disposition"] = f'inline; filename="Receipt-{receipt_id}.pdf"'
    return resp

@receipts_bp.route("/api/companies/<int:company_id>/receipts/<int:receipt_id>/email", methods=["POST"])
@require_auth
def email_receipt(company_id: int, receipt_id: int):
    payload = request.jwt_payload or {}
    user_company_id = payload.get("company_id")
    if user_company_id is not None and user_company_id != company_id:
        return jsonify({"error": "Forbidden"}), 403

    # ✅ actor id (works for JWTs storing id in sub)
    actor_user_id = int(payload.get("user_id") or payload.get("sub") or 0) or 0

    r = db_service.get_receipt_by_id(company_id, receipt_id)
    if not r:
        return jsonify({"error": "Receipt not found"}), 404

    to_email = r.get("customer_email") or r.get("company_email")
    if not to_email:
        return jsonify({"error": "Customer has no email."}), 400

    company_name = r.get("company_name") or "Our Company"
    customer_name = r.get("customer_name") or "Customer"
    currency = r.get("currency") or ""
    amount = float(r.get("amount") or 0.0)

    subject = f"Receipt RCPT-{receipt_id} from {company_name}"
    text_body = f"""Dear {customer_name},

We confirm receipt of payment.

Receipt number: RCPT-{receipt_id}
Date          : {r.get('receipt_date')}
Amount        : {currency} {amount:,.2f}

Thank you,
{company_name}
"""
    html_body = f"<pre style='font-family:system-ui,monospace'>{text_body}</pre>"

    try:
        pdf_bytes = generate_receipt_pdf(company_id, receipt_id)

        send_mail(
            to_email=to_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            attachments=[(f"Receipt-RCPT-{receipt_id}.pdf", pdf_bytes, "application/pdf")],
        )

        # ✅ AUDIT LOG (SUCCESS) — EXACT PLACE: after send_mail succeeds
        try:
            db_service.audit_log(
                company_id,
                actor_user_id=actor_user_id,
                module="ar",
                action="email_receipt",
                severity="info",
                entity_type="receipt",
                entity_id=str(receipt_id),
                entity_ref=f"RCPT-{receipt_id}",
                customer_id=int(r.get("customer_id") or 0) or None,
                amount=float(amount),
                currency=(str(currency).upper() if currency else None),
                before_json={},  # not really needed for email event
                after_json={
                    "sent_to": to_email,
                    "subject": subject,
                    "receipt_date": str(r.get("receipt_date") or ""),
                    "attachment": f"Receipt-RCPT-{receipt_id}.pdf",
                },
                message=f"Emailed receipt RCPT-{receipt_id} to {to_email}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in email_receipt (success)")

        return jsonify({"ok": True}), 200

    except Exception as e:
        current_app.logger.exception("email_receipt failed")

        # ✅ OPTIONAL: AUDIT LOG (FAILURE)
        try:
            db_service.audit_log(
                company_id,
                actor_user_id=actor_user_id,
                module="ar",
                action="email_receipt_failed",
                severity="error",
                entity_type="receipt",
                entity_id=str(receipt_id),
                entity_ref=f"RCPT-{receipt_id}",
                customer_id=int(r.get("customer_id") or 0) or None,
                amount=float(amount),
                currency=(str(currency).upper() if currency else None),
                before_json={},
                after_json={"error": str(e), "attempted_to": to_email},
                message=f"Failed to email receipt RCPT-{receipt_id} to {to_email}",
                source="api",
            )
        except Exception:
            current_app.logger.exception("audit_log failed in email_receipt (failure)")

        return jsonify({"ok": False, "error": str(e)}), 500
