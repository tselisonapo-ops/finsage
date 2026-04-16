# BackEnd/Services/receipt_pdf_service.py
from datetime import date, datetime
from decimal import Decimal
from flask import render_template

from BackEnd.Services.db_service import db_service
from BackEnd.Services.invoice_pdf_service import generate_invoice_pdf  # ✅ SAME helper

def generate_receipt_pdf(company_id: int, receipt_id: int) -> bytes:
    receipt = db_service.get_receipt_by_id(company_id, receipt_id)
    if not receipt:
        raise ValueError("Receipt not found")

    allocations = db_service.list_receipt_allocations(company_id, receipt_id)

    def _fmt_date(d):
        if isinstance(d, (datetime, date)):
            return d.strftime("%Y-%m-%d")
        return d or ""

    def _money(x):
        try:
            return f"{Decimal(str(x or 0)):.2f}"
        except Exception:
            return "0.00"

    receipt_ctx = {
        "id": receipt["id"],
        "number": f"RCPT-{receipt['id']}",
        "receipt_date": _fmt_date(receipt.get("receipt_date")),
        "date": _fmt_date(receipt.get("receipt_date")),
        "amount": receipt.get("amount"),
        "amount_fmt": _money(receipt.get("amount")),
        "currency": receipt.get("currency") or "",
        "reference": receipt.get("reference"),
        "description": receipt.get("description"),
        "customer_name": receipt.get("customer_name"),
        "customer_email": receipt.get("customer_email"),
        "notes": receipt.get("description"),
        "subtotal_amount": receipt.get("amount") or 0,
        "vat_amount": 0,
        "total_amount": receipt.get("amount") or 0,
        "lines": [
            {
                "item_name": "Receipt",
                "description": (
                    f"Payment received"
                    + (f" | Ref: {receipt.get('reference')}" if receipt.get("reference") else "")
                ),
                "quantity": 1,
                "unit_price": receipt.get("amount") or 0,
                "vat_amount": 0,
                "total_amount": receipt.get("amount") or 0,
            }
        ],
        "allocations": [
            {
                "invoice_number": a.get("invoice_number"),
                "invoice_date": _fmt_date(a.get("invoice_date")),
                "invoice_total_fmt": _money(a.get("total_amount")),
                "allocated_fmt": _money(a.get("amount")),
            }
            for a in allocations
        ],
    }

    company_ctx = {
        "name": receipt.get("company_name"),
        "company_email": receipt.get("company_email"),
        "company_phone": receipt.get("company_phone"),
        "physical_address": receipt.get("physical_address"),
        "postal_address": receipt.get("postal_address"),
        "address": receipt.get("physical_address") or receipt.get("postal_address"),
        "logo_url": receipt.get("logo_url"),
        "logo_path": receipt.get("logo_path"),
    }

    return generate_invoice_pdf(receipt_ctx, company_ctx)