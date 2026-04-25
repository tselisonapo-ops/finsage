from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet

styles = getSampleStyleSheet()


def _fmt(x):
    try:
        return f"{float(x):,.2f}"
    except:
        return str(x or "")


# ==========================================================
# 1. FILLED VAT RETURN PDF
# ==========================================================
def generate_vat_return_pdf(filing, company, *, start_date, end_date):
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)

    elements = []

    company_name = company.get("company_name") or company.get("name")
    reg = company.get("company_reg_no") or ""
    vat = company.get("vat") or ""
    currency = company.get("currency") or ""

    output_total = float(filing.get("output_total") or 0)
    input_total = float(filing.get("input_total") or 0)
    net_vat = float(filing.get("net_vat") or 0)

    net_label = "VAT Payable" if net_vat > 0 else "VAT Refundable"

    elements.append(Paragraph("FILLED VAT RETURN", styles["Title"]))
    elements.append(Spacer(1, 10))

    info = [
        ["Company", company_name],
        ["Registration No", reg],
        ["VAT Number", vat],
        ["Period", f"{start_date} to {end_date}"],
        ["Status", filing.get("status")],
        ["Prepared At", str(filing.get("prepared_at") or "")],
    ]

    elements.append(Table(info))
    elements.append(Spacer(1, 12))

    values = [
        ["Output VAT", _fmt(output_total)],
        ["Input VAT", _fmt(input_total)],
        [net_label, _fmt(abs(net_vat))],
    ]

    t = Table(values)
    t.setStyle(TableStyle([
        ("GRID", (0,0), (-1,-1), 0.5, colors.grey),
        ("BACKGROUND", (0,0), (-1,0), colors.lightgrey),
    ]))

    elements.append(t)
    elements.append(Spacer(1, 20))

    elements.append(Paragraph(
        "This VAT return was prepared from ledger VAT records in FinSage.",
        styles["Normal"]
    ))

    doc.build(elements)
    return buffer.getvalue()


# ==========================================================
# 2. SUPPORTING SCHEDULE PDF
# ==========================================================
def generate_vat_supporting_pdf(filing, company, lines, *, start_date, end_date):
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)

    elements = []

    company_name = company.get("company_name") or company.get("name")

    elements.append(Paragraph("VAT SUPPORTING SCHEDULE", styles["Title"]))
    elements.append(Spacer(1, 10))

    elements.append(Paragraph(
        f"{company_name} | {start_date} to {end_date}",
        styles["Normal"]
    ))
    elements.append(Spacer(1, 10))

    table_data = [[
        "Date", "Ref", "Account", "VAT Side", "VAT Amount"
    ]]

    total_input = 0
    total_output = 0

    for l in lines:
        amt = float(l.get("vat_amount") or 0)
        side = l.get("vat_side")

        if side == "input":
            total_input += amt
        elif side == "output":
            total_output += amt

        table_data.append([
            l.get("date"),
            l.get("ref"),
            l.get("source_account_name"),
            side,
            _fmt(amt),
        ])

    t = Table(table_data, repeatRows=1)
    t.setStyle(TableStyle([
        ("GRID", (0,0), (-1,-1), 0.25, colors.grey),
        ("BACKGROUND", (0,0), (-1,0), colors.lightgrey),
    ]))

    elements.append(t)
    elements.append(Spacer(1, 12))

    net = total_output - total_input

    totals = [
        ["Total Output VAT", _fmt(total_output)],
        ["Total Input VAT", _fmt(total_input)],
        ["Net VAT", _fmt(net)],
    ]

    elements.append(Table(totals))

    doc.build(elements)
    return buffer.getvalue()