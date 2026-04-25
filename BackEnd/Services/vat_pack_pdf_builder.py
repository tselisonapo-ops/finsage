from __future__ import annotations

from io import BytesIO
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
    Image,
    PageBreak,
)


# ==========================================================
# Helpers
# ==========================================================

def _safe(value, default="") -> str:
    if value is None:
        return default
    return str(value).strip()


def _money(x) -> float:
    return float(
        Decimal(str(x or 0)).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )
    )


def _fmt_amount(amount) -> str:
    return f"{_money(amount):,.2f}"


def _fmt_currency(amount, currency=None) -> str:
    curr = _safe(currency)
    value = _fmt_amount(amount)
    return f"{curr} {value}".strip()


def _extract_company_name(company: dict) -> str:
    return (
        _safe(company.get("company_name"))
        or _safe(company.get("name"))
        or _safe(company.get("legal_name"))
        or "Company"
    )


def _extract_company_reg(company: dict) -> str:
    return _safe(company.get("company_reg_no")) or _safe(company.get("reg_no"))


def _extract_company_vat(company: dict) -> str:
    return (
        _safe(company.get("vat"))
        or _safe(company.get("vat_no"))
        or _safe(company.get("vat_number"))
    )


def _extract_company_email(company: dict) -> str:
    return _safe(company.get("company_email")) or _safe(company.get("email"))


def _extract_company_phone(company: dict) -> str:
    return _safe(company.get("company_phone")) or _safe(company.get("phone"))


def _extract_company_address(company: dict) -> str:
    return (
        _safe(company.get("address"))
        or _safe(company.get("physical_address"))
        or _safe(company.get("postal_address"))
    )


def _split_address_lines(address: str) -> list[str]:
    if not address:
        return []
    raw = address.replace("\r", "\n")
    parts = raw.split("\n") if "\n" in raw else raw.split(",")
    return [p.strip() for p in parts if p.strip()]


def _para(text, style, fallback="-"):
    txt = _safe(text)
    return Paragraph(txt.replace("\n", "<br/>") if txt else fallback, style)


def _load_logo(company: dict, max_w=30 * mm, max_h=30 * mm):
    import os
    from flask import current_app

    logo = (
        _safe(company.get("logo_path"))
        or _safe(company.get("logo_file"))
        or _safe(company.get("logo_local_path"))
        or _safe(company.get("logo"))
        or _safe(company.get("company_logo"))
        or _safe(company.get("attachment_path"))
        or _safe(company.get("logo_attachment_path"))
    )

    logo_url = (
        _safe(company.get("logo_url"))
        or _safe(company.get("branding_logo_url"))
    )

    candidates = []

    if logo:
        candidates.append(logo)

    if logo_url:
        candidates.append(logo_url.lstrip("/"))

    for p in list(candidates):
        if not os.path.isabs(p):
            candidates.append(os.path.join(current_app.root_path, p))
            candidates.append(os.path.join(current_app.root_path, "static", p))
            candidates.append(os.path.join(current_app.root_path, "uploads", os.path.basename(p)))

    for path in candidates:
        if not path:
            continue

        if path.startswith("http://") or path.startswith("https://"):
            continue

        if os.path.exists(path):
            try:
                img = Image(path)
                img._restrictSize(max_w, max_h)
                return img
            except Exception as e:
                print("VAT LOGO DEBUG load failed:", path, e)

    print("VAT LOGO DEBUG no logo found", {
        "logo": logo,
        "logo_url": logo_url,
        "candidates": candidates,
        "company_keys": list(company.keys()),
    })

    return None


def _styles():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        name="FS_Title",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=17,
        leading=21,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#0F2A3D"),
    ))

    styles.add(ParagraphStyle(
        name="FS_CompanyName",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        alignment=TA_LEFT,
        textColor=colors.HexColor("#0F2A3D"),
    ))

    styles.add(ParagraphStyle(
        name="FS_Muted",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#6B7280"),
    ))

    styles.add(ParagraphStyle(
        name="FS_Body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#111827"),
    ))

    styles.add(ParagraphStyle(
        name="FS_BodyBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#0F2A3D"),
    ))

    styles.add(ParagraphStyle(
        name="FS_Label",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#0F2A3D"),
    ))

    styles.add(ParagraphStyle(
        name="FS_Right",
        parent=styles["FS_Body"],
        alignment=TA_RIGHT,
    ))

    styles.add(ParagraphStyle(
        name="FS_RightBold",
        parent=styles["FS_BodyBold"],
        alignment=TA_RIGHT,
    ))

    styles.add(ParagraphStyle(
        name="FS_SectionTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#0F2A3D"),
        spaceBefore=4,
        spaceAfter=5,
    ))

    styles.add(ParagraphStyle(
        name="FS_Total",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        alignment=TA_RIGHT,
        textColor=colors.HexColor("#2FA4A9"),
    ))

    styles.add(ParagraphStyle(
        name="FS_Footer",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9,
        textColor=colors.HexColor("#6B7280"),
        alignment=TA_CENTER,
    ))

    return styles


def _add_brand_header(story, doc, title: str, company: dict):
    styles = _styles()
    page_width, _ = doc.pagesize
    content_w = page_width - doc.leftMargin - doc.rightMargin

    top_bar = Table([[""]], colWidths=[content_w], rowHeights=[10 * mm])
    top_bar.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#0F2A3D")),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(top_bar)

    accent_bar = Table([[""]], colWidths=[content_w], rowHeights=[2 * mm])
    accent_bar.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#2FA4A9")),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(accent_bar)
    story.append(Spacer(1, 7 * mm))

    logo = _load_logo(company)
    if logo:
        left_cell = logo
    else:
        left_cell = Table([[""]], colWidths=[28 * mm], rowHeights=[28 * mm])
        left_cell.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#D6DAD8")),
            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ]))

    company_name = _extract_company_name(company)
    company_reg = _extract_company_reg(company)
    company_vat = _extract_company_vat(company)
    company_email = _extract_company_email(company)
    company_phone = _extract_company_phone(company)
    company_address = _extract_company_address(company)

    company_lines = [[Paragraph(company_name, styles["FS_CompanyName"])]]

    addr_lines = _split_address_lines(company_address)
    if addr_lines:
        company_lines.append([Paragraph("<br/>".join(addr_lines), styles["FS_Muted"])])

    contact_bits = [x for x in [company_phone, company_email] if x]
    if contact_bits:
        company_lines.append([Paragraph("<br/>".join(contact_bits), styles["FS_Muted"])])

    if company_reg:
        company_lines.append([Paragraph(f"<b>Reg:</b> {company_reg}", styles["FS_BodyBold"])])

    if company_vat:
        company_lines.append([Paragraph(f"<b>VAT:</b> {company_vat}", styles["FS_BodyBold"])])

    company_block = Table(company_lines, colWidths=[55 * mm])
    company_block.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))

    header_table = Table(
        [[left_cell, Paragraph(title.upper(), styles["FS_Title"]), company_block]],
        colWidths=[32 * mm, content_w - (32 * mm) - (55 * mm), 55 * mm],
    )
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 7 * mm))

    sep = Table([[""]], colWidths=[content_w], rowHeights=[1 * mm])
    sep.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#2FA4A9")),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(sep)
    story.append(Spacer(1, 5 * mm))


def _section_table(rows, col_widths, header=False):
    table = Table(rows, colWidths=col_widths, repeatRows=1 if header else 0)
    style = [
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#D6DAD8")),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#EEF1F3")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]

    if header:
        style.extend([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F4F6F7")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0F2A3D")),
        ])

    table.setStyle(TableStyle(style))
    return table


def _footer(story):
    styles = _styles()
    story.append(Spacer(1, 5 * mm))
    story.append(Paragraph(
        "This document is prepared by FinSage, no stamp required.",
        styles["FS_Footer"],
    ))
    story.append(Paragraph(
        f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        styles["FS_Footer"],
    ))


# ==========================================================
# 1) Filled VAT Return PDF
# ==========================================================

def generate_vat_return_pdf(filing: dict, company: dict, *, start_date, end_date) -> bytes:
    filing = filing or {}
    company = company or {}

    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=0,
        bottomMargin=10 * mm,
    )

    styles = _styles()
    story = []

    _add_brand_header(story, doc, "Filled VAT Return", company)

    page_width, _ = A4
    content_w = page_width - doc.leftMargin - doc.rightMargin

    currency = _safe(company.get("currency"))
    output_total = _money(filing.get("output_total"))
    input_total = _money(filing.get("input_total"))
    net_vat = _money(filing.get("net_vat"))

    if net_vat > 0:
        net_label = "VAT Payable"
    elif net_vat < 0:
        net_label = "VAT Refundable"
    else:
        net_label = "Nil VAT"

    info_rows = [
        [Paragraph("Company", styles["FS_Label"]), Paragraph(_extract_company_name(company), styles["FS_BodyBold"])],
        [Paragraph("Company Registration No", styles["FS_Label"]), Paragraph(_extract_company_reg(company) or "-", styles["FS_Body"])],
        [Paragraph("VAT Number", styles["FS_Label"]), Paragraph(_extract_company_vat(company) or "-", styles["FS_Body"])],
        [Paragraph("TIN", styles["FS_Label"]), Paragraph(_safe(company.get("tin")) or "-", styles["FS_Body"])],
        [Paragraph("VAT Period", styles["FS_Label"]), Paragraph(f"{start_date} to {end_date}", styles["FS_Body"])],
        [Paragraph("Due Date", styles["FS_Label"]), Paragraph(_safe(filing.get("due_date")) or "-", styles["FS_Body"])],
        [Paragraph("Status", styles["FS_Label"]), Paragraph(_safe(filing.get("status")).upper() or "-", styles["FS_BodyBold"])],
        [Paragraph("Prepared At", styles["FS_Label"]), Paragraph(_safe(filing.get("prepared_at")) or "-", styles["FS_Body"])],
        [Paragraph("Submitted At", styles["FS_Label"]), Paragraph(_safe(filing.get("submitted_at")) or "-", styles["FS_Body"])],
        [Paragraph("Submission Reference", styles["FS_Label"]), Paragraph(_safe(filing.get("reference")) or "-", styles["FS_Body"])],
    ]

    story.append(Paragraph("Return Details", styles["FS_SectionTitle"]))
    story.append(_section_table(info_rows, [content_w * 0.36, content_w * 0.64]))
    story.append(Spacer(1, 6 * mm))

    vat_rows = [
        [Paragraph("VAT RETURN VALUES", styles["FS_Label"]), Paragraph(f"Amount ({currency})", styles["FS_RightBold"])],
        [Paragraph("Output VAT", styles["FS_Body"]), Paragraph(_fmt_currency(output_total, currency), styles["FS_RightBold"])],
        [Paragraph("Input VAT", styles["FS_Body"]), Paragraph(_fmt_currency(input_total, currency), styles["FS_RightBold"])],
        [Paragraph(net_label, styles["FS_BodyBold"]), Paragraph(_fmt_currency(abs(net_vat), currency), styles["FS_Total"])],
    ]

    vat_table = _section_table(vat_rows, [content_w * 0.55, content_w * 0.45], header=True)
    vat_table.setStyle(TableStyle([
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F0FAFA")),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, colors.HexColor("#2FA4A9")),
    ]))
    story.append(Paragraph("VAT Summary", styles["FS_SectionTitle"]))
    story.append(vat_table)
    story.append(Spacer(1, 7 * mm))

    declaration = Table([
        [Paragraph("Declaration", styles["FS_Label"])],
        [Paragraph(
            "This VAT return was prepared from ledger VAT records in FinSage. "
            "The figures should be reviewed by the responsible user before submission to the relevant revenue authority.",
            styles["FS_Body"],
        )],
        [Paragraph("<b>Prepared By:</b> FinSage", styles["FS_Body"])],
    ], colWidths=[content_w])
    declaration.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#D6DAD8")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F4F6F7")),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(declaration)

    _footer(story)

    doc.build(story)

    pdf_bytes = buffer.getvalue()
    buffer.close()

    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
        raise RuntimeError("Failed to generate VAT return PDF")

    return pdf_bytes


# ==========================================================
# 2) VAT Supporting Schedule PDF
# ==========================================================

def generate_vat_supporting_pdf(
    filing: dict,
    company: dict,
    lines: list,
    *,
    start_date,
    end_date,
) -> bytes:
    filing = filing or {}
    company = company or {}
    lines = lines or []

    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=9 * mm,
        rightMargin=9 * mm,
        topMargin=0,
        bottomMargin=9 * mm,
    )

    styles = _styles()
    story = []

    _add_brand_header(story, doc, "VAT Supporting Schedule", company)

    page_width, _ = landscape(A4)
    content_w = page_width - doc.leftMargin - doc.rightMargin

    currency = _safe(company.get("currency"))
    input_total = _money(filing.get("input_total"))
    output_total = _money(filing.get("output_total"))
    net_vat = _money(filing.get("net_vat"))

    detail_rows = [[
        Paragraph("Date", styles["FS_Label"]),
        Paragraph("Reference", styles["FS_Label"]),
        Paragraph("Source Account", styles["FS_Label"]),
        Paragraph("VAT Side", styles["FS_Label"]),
        Paragraph("VAT Account", styles["FS_Label"]),
        Paragraph("Debit", styles["FS_RightBold"]),
        Paragraph("Credit", styles["FS_RightBold"]),
        Paragraph("VAT Amount", styles["FS_RightBold"]),
    ]]

    extracted_input = 0.0
    extracted_output = 0.0

    for line in lines:
        side = _safe(line.get("vat_side")).lower()
        vat_amount = _money(line.get("vat_amount"))
        debit = _money(line.get("debit"))
        credit = _money(line.get("credit"))

        if side == "input":
            extracted_input += vat_amount
        elif side == "output":
            extracted_output += vat_amount

        source_account = (
            _safe(line.get("source_account_name"))
            or _safe(line.get("source_account_code"))
            or "-"
        )

        vat_account = (
            _safe(line.get("vat_account_name"))
            or _safe(line.get("vat_account_code"))
            or "-"
        )

        detail_rows.append([
            Paragraph(_safe(line.get("date")) or "-", styles["FS_Body"]),
            Paragraph(_safe(line.get("ref")) or "-", styles["FS_Body"]),
            Paragraph(source_account, styles["FS_Body"]),
            Paragraph(side.upper() or "-", styles["FS_Body"]),
            Paragraph(vat_account, styles["FS_Body"]),
            Paragraph(_fmt_currency(debit, currency) if debit else "-", styles["FS_Right"]),
            Paragraph(_fmt_currency(credit, currency) if credit else "-", styles["FS_Right"]),
            Paragraph(_fmt_currency(vat_amount, currency), styles["FS_RightBold"]),
        ])

    if len(detail_rows) == 1:
        detail_rows.append([
            Paragraph("-", styles["FS_Body"]),
            Paragraph("-", styles["FS_Body"]),
            Paragraph("No VAT lines found", styles["FS_Body"]),
            Paragraph("-", styles["FS_Body"]),
            Paragraph("-", styles["FS_Body"]),
            Paragraph("-", styles["FS_Right"]),
            Paragraph("-", styles["FS_Right"]),
            Paragraph("-", styles["FS_Right"]),
        ])

    story.append(Paragraph("VAT Line Detail", styles["FS_SectionTitle"]))

    col_widths = [
        content_w * 0.08,
        content_w * 0.11,
        content_w * 0.24,
        content_w * 0.08,
        content_w * 0.20,
        content_w * 0.09,
        content_w * 0.09,
        content_w * 0.11,
    ]

    detail_table = _section_table(detail_rows, col_widths, header=True)
    detail_table.setStyle(TableStyle([
        ("ALIGN", (5, 1), (-1, -1), "RIGHT"),
    ]))
    story.append(detail_table)
    story.append(Spacer(1, 6 * mm))

    calculated_net = _money(extracted_output - extracted_input)

    official_rows = [
        [Paragraph("OFFICIAL FILING TOTALS", styles["FS_Label"]), Paragraph(f"Amount ({currency})", styles["FS_RightBold"])],
        [Paragraph("Total Output VAT", styles["FS_Body"]), Paragraph(_fmt_currency(output_total, currency), styles["FS_RightBold"])],
        [Paragraph("Total Input VAT", styles["FS_Body"]), Paragraph(_fmt_currency(input_total, currency), styles["FS_RightBold"])],
        [Paragraph("Net VAT", styles["FS_BodyBold"]), Paragraph(_fmt_currency(net_vat, currency), styles["FS_Total"])],
    ]

    recon_rows = [
        [Paragraph("DETAIL RECONCILIATION", styles["FS_Label"]), Paragraph(f"Amount ({currency})", styles["FS_RightBold"])],
        [Paragraph("Extracted Detail Output VAT", styles["FS_Body"]), Paragraph(_fmt_currency(extracted_output, currency), styles["FS_RightBold"])],
        [Paragraph("Extracted Detail Input VAT", styles["FS_Body"]), Paragraph(_fmt_currency(extracted_input, currency), styles["FS_RightBold"])],
        [Paragraph("Extracted Detail Net VAT", styles["FS_Body"]), Paragraph(_fmt_currency(calculated_net, currency), styles["FS_RightBold"])],
        [Paragraph("Detail vs Filing Difference", styles["FS_BodyBold"]), Paragraph(_fmt_currency(_money(calculated_net - net_vat), currency), styles["FS_RightBold"])],
    ]

    totals_grid = Table([
        [
            _section_table(official_rows, [content_w * 0.28, content_w * 0.20], header=True),
            _section_table(recon_rows, [content_w * 0.32, content_w * 0.20], header=True),
        ]
    ], colWidths=[content_w * 0.48, content_w * 0.52])
    totals_grid.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(totals_grid)
    story.append(Spacer(1, 6 * mm))

    # Settlement journal from official filing totals
    if net_vat > 0:
        settlement_type = "VAT Payable"
    elif net_vat < 0:
        settlement_type = "VAT Refundable"
    else:
        settlement_type = "Nil VAT"

    journal_rows = [[
        Paragraph("Account", styles["FS_Label"]),
        Paragraph("Description", styles["FS_Label"]),
        Paragraph("Debit", styles["FS_RightBold"]),
        Paragraph("Credit", styles["FS_RightBold"]),
    ]]

    debit_total = 0.0
    credit_total = 0.0

    # Build using official totals.
    if output_total:
        journal_rows.append([
            Paragraph("VAT Output", styles["FS_Body"]),
            Paragraph("Clear output VAT", styles["FS_Body"]),
            Paragraph(_fmt_currency(output_total, currency), styles["FS_RightBold"]),
            Paragraph("-", styles["FS_Right"]),
        ])
        debit_total += output_total

    if input_total:
        journal_rows.append([
            Paragraph("VAT Input", styles["FS_Body"]),
            Paragraph("Clear input VAT", styles["FS_Body"]),
            Paragraph("-", styles["FS_Right"]),
            Paragraph(_fmt_currency(input_total, currency), styles["FS_RightBold"]),
        ])
        credit_total += input_total

    if net_vat > 0:
        journal_rows.append([
            Paragraph("VAT Payable", styles["FS_Body"]),
            Paragraph("Recognise VAT payable", styles["FS_Body"]),
            Paragraph("-", styles["FS_Right"]),
            Paragraph(_fmt_currency(net_vat, currency), styles["FS_RightBold"]),
        ])
        credit_total += net_vat

    elif net_vat < 0:
        journal_rows.append([
            Paragraph("VAT Receivable", styles["FS_Body"]),
            Paragraph("Recognise VAT refund due", styles["FS_Body"]),
            Paragraph(_fmt_currency(abs(net_vat), currency), styles["FS_RightBold"]),
            Paragraph("-", styles["FS_Right"]),
        ])
        debit_total += abs(net_vat)

    if len(journal_rows) == 1:
        journal_rows.append([
            Paragraph("Nil VAT", styles["FS_Body"]),
            Paragraph("No settlement journal required", styles["FS_Body"]),
            Paragraph("-", styles["FS_Right"]),
            Paragraph("-", styles["FS_Right"]),
        ])

    journal_rows.append([
        Paragraph("Total", styles["FS_BodyBold"]),
        Paragraph(settlement_type, styles["FS_BodyBold"]),
        Paragraph(_fmt_currency(debit_total, currency), styles["FS_RightBold"]),
        Paragraph(_fmt_currency(credit_total, currency), styles["FS_RightBold"]),
    ])

    journal_rows.append([
        Paragraph("Difference", styles["FS_BodyBold"]),
        Paragraph("Debit total less credit total", styles["FS_Body"]),
        Paragraph(_fmt_currency(_money(debit_total - credit_total), currency), styles["FS_RightBold"]),
        Paragraph("", styles["FS_Right"]),
    ])

    story.append(Paragraph("Settlement Journal Balance Check", styles["FS_SectionTitle"]))
    journal_table = _section_table(
        journal_rows,
        [content_w * 0.22, content_w * 0.38, content_w * 0.20, content_w * 0.20],
        header=True,
    )
    story.append(journal_table)

    _footer(story)

    doc.build(story)

    pdf_bytes = buffer.getvalue()
    buffer.close()

    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
        raise RuntimeError("Failed to generate VAT supporting schedule PDF")

    return pdf_bytes