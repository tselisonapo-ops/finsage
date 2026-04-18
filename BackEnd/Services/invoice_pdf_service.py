from io import BytesIO
from decimal import Decimal, ROUND_HALF_UP

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
    Image,
)

# -------------------------------------------------
# Helpers
# -------------------------------------------------

def _money(x) -> float:
    return float(Decimal(str(x or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def _fmt_currency(amount, currency=None) -> str:
    curr = _safe(currency) or ""
    value = f"{_money(amount):,.2f}"
    return f"{curr} {value}".strip()

def _fmt_amount(amount) -> str:
    return f"{_money(amount):,.2f}"

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
    lines = (
        obj.get("lines")
        or obj.get("invoice_lines")
        or obj.get("quote_lines")
        or obj.get("line_items")
        or obj.get("invoice_items")
        or obj.get("items")
        or obj.get("invoiceItems")
        or []
    )
    return lines if isinstance(lines, list) else []

def _extract_company_address(company: dict) -> str:
    return (
        _safe(company.get("address"))
        or _safe(company.get("physical_address"))
        or _safe(company.get("postal_address"))
    )

def _extract_company_email(company: dict) -> str:
    return _safe(company.get("email")) or _safe(company.get("company_email"))

def _extract_company_phone(company: dict) -> str:
    return _safe(company.get("phone")) or _safe(company.get("company_phone"))

def _extract_company_reg(company: dict) -> str:
    return _safe(company.get("company_reg_no")) or _safe(company.get("reg_no"))

def _extract_company_vat(company: dict) -> str:
    return _safe(company.get("vat")) or _safe(company.get("vat_no"))

def _split_address_lines(address: str) -> list[str]:
    if not address:
        return []
    raw = address.replace("\r", "\n")
    if "\n" in raw:
        parts = [p.strip() for p in raw.split("\n")]
    else:
        parts = [p.strip() for p in raw.split(",")]
    return [p for p in parts if p]

def _para(text, style, fallback="-"):
    txt = _safe(text)
    return Paragraph(txt.replace("\n", "<br/>") if txt else fallback, style)

def _load_logo(company: dict, max_w=32 * mm, max_h=32 * mm):
    """
    ReportLab Image only if local file path exists.
    Skip remote URLs because cPanel/ReportLab often won't fetch them reliably.
    """
    import os

    logo = _safe(company.get("logo_path")) or _safe(company.get("logo_file")) or _safe(company.get("logo_local_path"))
    if not logo:
        return None
    if not os.path.exists(logo):
        return None

    try:
        img = Image(logo)
        img._restrictSize(max_w, max_h)
        return img
    except Exception:
        return None


# -------------------------------------------------
# Main builder
# -------------------------------------------------

def _build_document(title: str, doc_obj: dict, company: dict | None = None) -> bytes:
    company = company or {}
    doc_obj = doc_obj or {}

    buffer = BytesIO()
    pdf = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=0,
        bottomMargin=10 * mm,
    )

    page_width, _ = A4
    content_w = page_width - pdf.leftMargin - pdf.rightMargin

    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        name="DocTitleCenter",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#0F2A3D"),
        spaceAfter=0,
        spaceBefore=0,
    ))
    styles.add(ParagraphStyle(
        name="FS_SmallMuted",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#6B7280"),
    ))
    styles.add(ParagraphStyle(
        name="FS_SmallMutedRight",
        parent=styles["FS_SmallMuted"],
        alignment=TA_LEFT,
    ))
    styles.add(ParagraphStyle(
        name="SmallLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#0F2A3D"),
    ))
    styles.add(ParagraphStyle(
        name="BoxTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=10,
        textColor=colors.HexColor("#0F2A3D"),
        spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        name="BodyTextSmall",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#111827"),
    ))
    styles.add(ParagraphStyle(
        name="BodyTextMuted",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#6B7280"),
    ))
    styles.add(ParagraphStyle(
        name="BodyTextBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#0F2A3D"),
    ))
    styles.add(ParagraphStyle(
        name="BodyTextBoldRight",
        parent=styles["BodyTextBold"],
        alignment=TA_RIGHT,
    ))
    styles.add(ParagraphStyle(
        name="TotalBig",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=14,
        textColor=colors.HexColor("#2FA4A9"),
        alignment=TA_RIGHT,
    ))
    styles.add(ParagraphStyle(
        name="FooterText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#6B7280"),
    ))
    styles.add(ParagraphStyle(
        name="FooterTextBold",
        parent=styles["FooterText"],
        fontName="Helvetica-Bold",
    ))
    styles.add(ParagraphStyle(
        name="HeaderCenter",
        parent=styles["SmallLabel"],
        alignment=TA_CENTER,
    ))

    styles.add(ParagraphStyle(
        name="HeaderRight",
        parent=styles["SmallLabel"],
        alignment=TA_RIGHT,
    ))
    story = []

    company_name = (
        _safe(company.get("name"))
        or _safe(company.get("company_name"))
        or _safe(company.get("legal_name"))
        or _safe(doc_obj.get("company_name"))
        or "Company Name"
    )
    company_email = _extract_company_email(company)
    company_phone = _extract_company_phone(company)
    company_address = _extract_company_address(company)
    company_reg = _extract_company_reg(company)
    company_vat = _extract_company_vat(company)

    doc_number = (
        _safe(doc_obj.get("number"))
        or _safe(doc_obj.get("quote_number"))
        or _safe(doc_obj.get("invoice_number"))
        or f"DRAFT-{doc_obj.get('id', '')}"
    )

    customer_name = _extract_customer_name(doc_obj)
    customer_address = _safe(doc_obj.get("customer_address") or doc_obj.get("billing_address"))
    customer_phone = _safe(doc_obj.get("customer_phone"))
    customer_email = _safe(doc_obj.get("customer_email"))

    invoice_date = _safe(doc_obj.get("invoice_date") or doc_obj.get("date"))
    due_date = _safe(doc_obj.get("due_date"))
    currency = (
        _safe(doc_obj.get("currency"))
        or _safe(company.get("currency"))
        or ""
    )
    notes = _safe(doc_obj.get("notes"))

    subtotal = _money(doc_obj.get("subtotal_amount") or doc_obj.get("net_amount") or 0)
    discount = _money(doc_obj.get("discount_amount") or 0)
    vat_total = _money(doc_obj.get("vat_amount") or doc_obj.get("vat_total") or 0)
    grand_total = _money(doc_obj.get("total_amount") or doc_obj.get("total") or 0)

    bank_name = _safe(doc_obj.get("bank_name"))
    account_name = _safe(doc_obj.get("account_name"))
    account_number = _safe(doc_obj.get("account_number"))
    branch_code = _safe(doc_obj.get("branch_code"))
    swift_code = _safe(doc_obj.get("swift_code"))

    # consistent widths
    gap = 4 * mm
    half_w = (content_w - gap) / 2.0
    left_bottom_w = content_w * 0.58
    right_bottom_w = content_w - left_bottom_w

    # top bars
    top_bar = Table([[""]], colWidths=[content_w], rowHeights=[12 * mm])
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
    story.append(Spacer(1, 8 * mm))

    # header
    # header
    logo = _load_logo(company)
    if logo:
        left_cell = logo
    else:
        left_cell = Table([[""]], colWidths=[28 * mm], rowHeights=[28 * mm])
        left_cell.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#D6DAD8")),
            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ]))

    title_cell = Paragraph(title.upper(), styles["DocTitleCenter"])

    company_name_style = ParagraphStyle(
        "CompanyNameLeft",
        parent=styles["BodyTextBold"],
        fontSize=13.5,
        leading=16,
        alignment=TA_LEFT,
        leftIndent=0,
        spaceAfter=3,
    )

    company_value_style = ParagraphStyle(
        "CompanyValueLeft",
        parent=styles["BodyTextBold"],
        alignment=TA_LEFT,
    )

    company_lines = [
        [Paragraph(company_name, company_name_style)]
    ]

    addr_lines = _split_address_lines(company_address)
    if addr_lines:
        company_lines.append([
            Paragraph("<br/>".join(addr_lines), styles["FS_SmallMutedRight"])
        ])

    contact_bits = [x for x in [company_phone, company_email] if x]
    if contact_bits:
        company_lines.append([
            Paragraph("<br/>".join(contact_bits), styles["FS_SmallMutedRight"])
        ])

    if company_reg:
        company_lines.append([
            Paragraph(f"<b>Reg:</b> {company_reg}", company_value_style)
        ])

    if company_vat:
        company_lines.append([
            Paragraph(f"<b>VAT:</b> {company_vat}", company_value_style)
        ])

    company_block = Table(company_lines, colWidths=[48 * mm])
    company_block.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))

    header_table = Table(
        [[left_cell, title_cell, company_block]],
        colWidths=[35 * mm, content_w - (35 * mm) - (48 * mm), 48 * mm],
    )
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (0, 0), "LEFT"),
        ("ALIGN", (1, 0), (1, 0), "CENTER"),
        ("ALIGN", (2, 0), (2, 0), "LEFT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 8 * mm))

    top_sep = Table([[""]], colWidths=[content_w], rowHeights=[1.2 * mm])
    top_sep.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#2FA4A9")),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(top_sep)
    story.append(Spacer(1, 4 * mm))

    # bill to
    bill_to_parts = [
        [Paragraph("BILL TO", styles["BoxTitle"])],
        [Paragraph(customer_name or "-", styles["BodyTextBold"])],
    ]
    customer_bits = []
    if customer_address:
        customer_bits.append(customer_address.replace("\n", "<br/>"))
    contact_inline = " • ".join([x for x in [customer_phone, customer_email] if x])
    if contact_inline:
        customer_bits.append(contact_inline)
    bill_to_parts.append([
        Paragraph("<br/>".join(customer_bits) if customer_bits else "-", styles["BodyTextMuted"])
    ])

    bill_to_box = Table(bill_to_parts, colWidths=[half_w])
    bill_to_box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#D6DAD8")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    label_text = "INVOICE DETAILS" if title.lower() == "invoice" else f"{title.upper()} DETAILS"
    num_label = "Invoice #" if title.lower() == "invoice" else f"{title} #"

    inv_rows = [
        [Paragraph(num_label, styles["BodyTextMuted"]), Paragraph(doc_number, styles["BodyTextBoldRight"])],
        [Paragraph("Date", styles["BodyTextMuted"]), Paragraph(invoice_date or "-", styles["BodyTextBoldRight"])],
    ]
    if title.lower() == "invoice":
        inv_rows.append([Paragraph("Due", styles["BodyTextMuted"]), Paragraph(due_date or "-", styles["BodyTextBoldRight"])])

    inv_details_table = Table(inv_rows, colWidths=[half_w * 0.38, half_w * 0.62 - 16])
    inv_details_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    inv_box = Table([
        [Paragraph(label_text, styles["BoxTitle"])],
        [inv_details_table],
    ], colWidths=[half_w])
    inv_box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#D6DAD8")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))

    info_grid = Table([[bill_to_box, inv_box]], colWidths=[half_w, half_w])
    info_grid.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(info_grid)
    story.append(Spacer(1, 5 * mm))

    # items table
    lines = _extract_lines(doc_obj)
    line_rows = [[
        Paragraph("ITEM / SERVICE", styles["SmallLabel"]),
        Paragraph("DESCRIPTION", styles["SmallLabel"]),
        Paragraph("QTY", styles["HeaderCenter"]),
        Paragraph("UNIT", styles["HeaderCenter"]),
        Paragraph("VAT", styles["HeaderCenter"]),
        Paragraph("TOTAL", styles["HeaderRight"]),
    ]]

    for line in lines:
        if not isinstance(line, dict):
            continue

        item_name = _safe(line.get("item_name")) or _safe(line.get("item")) or "-"
        desc = _safe(line.get("description"))
        qty = _money(line.get("quantity") or line.get("qty") or 0)
        unit_price = _money(line.get("unit_price") or line.get("rate") or 0)
        vat_amount = _money(line.get("vat_amount") or 0)
        total_amount = _money(line.get("total_amount") or line.get("amount") or 0)

        qty_text = f"{qty:,.2f}".rstrip("0").rstrip(".") if qty % 1 else f"{int(qty)}"

        line_rows.append([
            Paragraph(item_name, styles["BodyTextBold"]),
            Paragraph(desc or "", styles["BodyTextMuted"]),
            Paragraph(qty_text, ParagraphStyle("qty_center", parent=styles["BodyTextSmall"], alignment=TA_CENTER)),
            Paragraph(_fmt_amount(unit_price), ParagraphStyle("unit_center", parent=styles["BodyTextSmall"], alignment=TA_CENTER)),
            Paragraph(_fmt_amount(vat_amount), ParagraphStyle("vat_center", parent=styles["BodyTextSmall"], alignment=TA_CENTER)),
            Paragraph(_fmt_amount(total_amount), ParagraphStyle("total_right", parent=styles["BodyTextSmall"], alignment=TA_RIGHT)),
        ])

    if len(line_rows) == 1:
        line_rows.append([
            Paragraph("No line items", styles["BodyTextMuted"]),
            Paragraph("", styles["BodyTextMuted"]),
            Paragraph("-", styles["BodyTextMuted"]),
            Paragraph("-", styles["BodyTextMuted"]),
            Paragraph("-", styles["BodyTextMuted"]),
            Paragraph("-", styles["BodyTextMuted"]),
        ])

    c1 = content_w * 0.20   # item
    c2 = content_w * 0.26   # description
    c3 = content_w * 0.07   # qty
    c4 = content_w * 0.17   # unit (bigger)
    c5 = content_w * 0.10   # vat (smaller)
    c6 = content_w - c1 - c2 - c3 - c4 - c5  # total (bigger)

    line_table = Table(
        line_rows,
        colWidths=[c1, c2, c3, c4, c5, c6],
        repeatRows=1,
    )
    line_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#D6DAD8")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F4F6F7")),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, colors.HexColor("#D6DAD8")),
        ("LINEABOVE", (0, 1), (-1, -1), 0.35, colors.HexColor("#EEF1F3")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),


        # DATA ALIGNMENT
        ("ALIGN", (2, 1), (4, -1), "CENTER"),
        ("ALIGN", (5, 1), (5, -1), "RIGHT"),

        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, 0), 4),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
    ]))

    for r in range(2, len(line_rows), 2):
        line_table.setStyle(TableStyle([
            ("BACKGROUND", (0, r), (-1, r), colors.HexColor("#FAFBFB")),
        ]))

    story.append(line_table)
    story.append(Spacer(1, 5 * mm))

    # bottom left
    payment_rows = [[Paragraph("PAYMENT DETAILS", styles["BoxTitle"])]]
    payment_lines = []
    if bank_name:
        payment_lines.append(f"<b>Bank:</b> {bank_name}")
    if account_name:
        payment_lines.append(f"<b>Account name:</b> {account_name}")
    if account_number:
        payment_lines.append(f"<b>Account #:</b> {account_number}")
    if branch_code:
        payment_lines.append(f"<b>Branch code:</b> {branch_code}")
    if swift_code:
        payment_lines.append(f"<b>SWIFT:</b> {swift_code}")
    payment_lines.append(f"<b>Reference:</b> {doc_number}")

    payment_rows.append([Paragraph("<br/>".join(payment_lines), styles["BodyTextMuted"])])

    payment_box = Table(payment_rows, colWidths=[left_bottom_w])
    payment_box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#D6DAD8")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))

    left_stack_rows = [[payment_box]]

    if notes:
        notes_box = Table([
            [Paragraph("NOTES", styles["BoxTitle"])],
            [Paragraph(notes.replace("\n", "<br/>"), styles["BodyTextMuted"])],
        ], colWidths=[left_bottom_w])
        notes_box.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#D6DAD8")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        left_stack_rows.append([Spacer(1, 2 * mm)])
        left_stack_rows.append([notes_box])

    left_stack = Table(left_stack_rows, colWidths=[left_bottom_w])
    left_stack.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    # bottom right
    discount_text = f"({_fmt_amount(abs(discount))})" if discount else _fmt_amount(0)

    totals_box_pad = 16  # 8 left + 8 right padding inside totals_box
    totals_content_w = right_bottom_w - totals_box_pad

    inner_left = totals_content_w * 0.42
    inner_right = totals_content_w - inner_left

    totals_inner = Table([
        [Paragraph("Subtotal", styles["BodyTextMuted"]), Paragraph(_fmt_amount(subtotal), styles["BodyTextBoldRight"])],
        [Paragraph("Discount", styles["BodyTextMuted"]), Paragraph(discount_text, styles["BodyTextBoldRight"])],
        [Paragraph("VAT", styles["BodyTextMuted"]), Paragraph(_fmt_amount(vat_total), styles["BodyTextBoldRight"])],
    ], colWidths=[inner_left, inner_right])
    totals_inner.setStyle(TableStyle([
        ("LINEABOVE", (0, 1), (-1, -1), 0.35, colors.HexColor("#EEF1F3")),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))

    grand_table = Table([
        [Paragraph("Total", styles["BodyTextBold"]), Paragraph(_fmt_amount(grand_total), styles["TotalBig"])]
    ], colWidths=[inner_left, inner_right])
    grand_table.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.7, colors.HexColor("#D6DAD8")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))

    totals_box = Table([
        [Paragraph(f"TOTALS ({currency})", styles["BoxTitle"])],
        [totals_inner],
        [grand_table],
    ], colWidths=[right_bottom_w])
    totals_box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#D6DAD8")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))

    bottom_grid = Table([[left_stack, totals_box]], colWidths=[left_bottom_w, right_bottom_w])
    bottom_grid.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(bottom_grid)
    story.append(Spacer(1, 6 * mm))

    footer_line = Table([[""]], colWidths=[content_w], rowHeights=[0.6 * mm])
    footer_line.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#D6DAD8")),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(footer_line)
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph("Thank you for your business.", styles["FooterTextBold"]))
    story.append(Paragraph(
        f"Please use the {title.lower()} number as your payment reference. Generated by FinSage.",
        styles["FooterText"]
    ))

    pdf.build(story)

    pdf_bytes = buffer.getvalue()
    buffer.close()

    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
        raise RuntimeError("Failed to generate valid PDF bytes")

    return pdf_bytes


# -------------------------------------------------
# Public entry points
# -------------------------------------------------
def generate_invoice_pdf(invoice, company=None) -> bytes:
    return _build_document("Invoice", invoice or {}, company or {})


def generate_quote_pdf(quote, company=None) -> bytes:
    return _build_document("Quote", quote or {}, company or {})


def generate_receipt_pdf(receipt, company=None) -> bytes:
    return _build_document("Receipt", receipt or {}, company or {})