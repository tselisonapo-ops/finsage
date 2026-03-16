from io import BytesIO
from decimal import Decimal, ROUND_HALF_UP

from flask import render_template
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
)

# -------------------------------------------------
# Helpers
# -------------------------------------------------

def _money(x) -> float:
    return float(Decimal(str(x or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _fmt_currency(amount, currency="ZAR") -> str:
    return f"{currency} {_money(amount):,.2f}"


def _safe(value, default="") -> str:
    if value is None:
        return default
    return str(value).strip()


def _extract_customer_name(obj) -> str:
    if not isinstance(obj, dict):
        return ""
    return (
        _safe(obj.get("customer_name"))
        or _safe((obj.get("customer") or {}).get("name"))
        or _safe((obj.get("customer") or {}).get("customer_name"))
        or _safe(obj.get("name"))
    )


def _extract_lines(obj) -> list:
    if not isinstance(obj, dict):
        return []
    lines = obj.get("lines") or obj.get("invoice_lines") or obj.get("quote_lines") or []
    return lines if isinstance(lines, list) else []


# -------------------------------------------------
# Core PDF builder
# -------------------------------------------------

def _build_document(title: str, doc_obj: dict, company: dict | None = None) -> bytes:
    company = company or {}
    doc_obj = doc_obj or {}

    buffer = BytesIO()
    pdf = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
    )

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="SmallMuted",
            parent=styles["Normal"],
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#666666"),
        )
    )

    story = []

    company_name = (
        _safe(company.get("name"))
        or _safe(company.get("company_name"))
        or _safe(company.get("legal_name"))
        or "Company"
    )

    company_email = _safe(company.get("email"))
    company_phone = _safe(company.get("phone"))
    company_address = _safe(company.get("address"))

    doc_number = (
        _safe(doc_obj.get("number"))
        or _safe(doc_obj.get("quote_number"))
        or _safe(doc_obj.get("invoice_number"))
        or f"DRAFT-{doc_obj.get('id', '')}"
    )

    customer_name = _extract_customer_name(doc_obj)
    invoice_date = _safe(doc_obj.get("invoice_date") or doc_obj.get("date"))
    due_date = _safe(doc_obj.get("due_date"))
    currency = _safe(doc_obj.get("currency"), "ZAR")
    notes = _safe(doc_obj.get("notes"))

    # Header
    story.append(Paragraph(f"<b>{company_name}</b>", styles["Title"]))
    if company_address:
        story.append(Paragraph(company_address, styles["SmallMuted"]))
    if company_email or company_phone:
        story.append(
            Paragraph(
                " | ".join([x for x in [company_email, company_phone] if x]),
                styles["SmallMuted"],
            )
        )

    story.append(Spacer(1, 6))
    story.append(Paragraph(f"<b>{title}</b>", styles["Heading2"]))
    story.append(Spacer(1, 6))

    meta_data = [
        ["Document No.", doc_number],
        ["Customer", customer_name or "-"],
        ["Date", invoice_date or "-"],
    ]
    if title.lower() == "invoice":
        meta_data.append(["Due Date", due_date or "-"])

    meta_table = Table(meta_data, colWidths=[35 * mm, 120 * mm])
    meta_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # Line items
    lines = _extract_lines(doc_obj)
    line_rows = [["Description", "Qty", "Unit Price", "VAT", "Total"]]

    for line in lines:
        if not isinstance(line, dict):
            continue

        desc = (
            _safe(line.get("description"))
            or _safe(line.get("item_name"))
            or _safe(line.get("item"))
            or "-"
        )
        qty = _money(line.get("quantity") or line.get("qty") or 0)
        unit_price = _money(line.get("unit_price") or line.get("rate") or 0)
        vat_amount = _money(line.get("vat_amount") or 0)
        total_amount = _money(line.get("total_amount") or line.get("amount") or 0)

        qty_text = f"{qty:,.2f}".rstrip("0").rstrip(".") if qty % 1 else f"{int(qty)}"

        line_rows.append(
            [
                desc,
                qty_text,
                _fmt_currency(unit_price, currency),
                _fmt_currency(vat_amount, currency),
                _fmt_currency(total_amount, currency),
            ]
        )

    if len(line_rows) == 1:
        line_rows.append(["No line items", "-", "-", "-", "-"])

    line_table = Table(
        line_rows,
        colWidths=[78 * mm, 18 * mm, 28 * mm, 26 * mm, 28 * mm],
        repeatRows=1,
    )
    line_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cfcfcf")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(line_table)
    story.append(Spacer(1, 10))

    # Totals
    subtotal = _money(doc_obj.get("subtotal_amount") or doc_obj.get("net_amount") or 0)
    vat_total = _money(doc_obj.get("vat_amount") or doc_obj.get("vat_total") or 0)
    grand_total = _money(doc_obj.get("total_amount") or doc_obj.get("total") or 0)

    totals_rows = [
        ["Subtotal", _fmt_currency(subtotal, currency)],
        ["VAT", _fmt_currency(vat_total, currency)],
        ["Total", _fmt_currency(grand_total, currency)],
    ]

    totals_table = Table(totals_rows, colWidths=[35 * mm, 40 * mm], hAlign="RIGHT")
    totals_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("LINEABOVE", (0, -1), (-1, -1), 0.8, colors.black),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(totals_table)

    if notes:
        story.append(Spacer(1, 10))
        story.append(Paragraph("<b>Notes</b>", styles["Heading3"]))
        story.append(Paragraph(notes.replace("\n", "<br/>"), styles["Normal"]))

    pdf.build(story)

    pdf_bytes = buffer.getvalue()
    buffer.close()

    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
        raise RuntimeError("Failed to generate valid PDF bytes")

    return pdf_bytes


# -------------------------------------------------
# Public entry points
# -------------------------------------------------

def html_to_pdf(html: str) -> bytes:
    raise RuntimeError("html_to_pdf is no longer used. Invoice PDFs are built with ReportLab.")


def generate_invoice_pdf(invoice, company=None) -> bytes:
    return _build_document("Invoice", invoice or {}, company or {})


def generate_quote_pdf(quote, company=None) -> bytes:
    return _build_document("Quote", quote or {}, company or {})