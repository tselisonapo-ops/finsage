from __future__ import annotations

from io import BytesIO
from typing import Any, Dict, List, Tuple

from flask import Response
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer


THIN = Side(style="thin", color="D9E2F3")
HEADER_FILL = PatternFill("solid", fgColor="D9EAF7")
SUBTOTAL_FILL = PatternFill("solid", fgColor="EEF4FB")
TITLE_FILL = PatternFill("solid", fgColor="BFD7EA")


def _clean_number(v: Any) -> Any:
    try:
        if v is None or v == "":
            return ""
        return float(v)
    except Exception:
        return v


def _statement_title(meta: Dict[str, Any]) -> str:
    stmt = str((meta or {}).get("statement") or "").strip().lower()

    mapping = {
        "bs": "Statement of Financial Position",
        "balance_sheet": "Statement of Financial Position",
        "pnl": "Statement of Profit or Loss",
        "income_statement": "Statement of Profit or Loss",
        "cf": "Statement of Cash Flows",
        "cashflow": "Statement of Cash Flows",
        "socie": "Statement of Changes in Equity",
    }
    return mapping.get(stmt, (meta or {}).get("report_name") or "Financial Statement")


def _payload_columns(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    cols = payload.get("columns") or []
    if cols:
        return cols
    return [{"key": "amount", "label": "Amount"}]


def _row_type(row: Dict[str, Any]) -> str:
    meta = row.get("meta") or {}
    return str(meta.get("row_type") or row.get("row_type") or "normal").strip().lower()


def _append_row(
    out_rows: List[Dict[str, Any]],
    label: str,
    values: Dict[str, Any],
    row_type: str = "normal",
):
    out_rows.append({
        "label": label,
        "values": values or {},
        "row_type": row_type,
    })


def _flatten_payload(payload: Dict[str, Any]) -> Tuple[List[str], List[Dict[str, Any]]]:
    """
    Normalizes different statement payload shapes into:
      headers = ["Line Item", ...dynamic columns...]
      rows = [{"label": ..., "values": {...}, "row_type": ...}, ...]
    """
    cols = _payload_columns(payload)
    col_keys = [c.get("key") for c in cols]
    col_labels = [c.get("label") or c.get("key") for c in cols]

    out_rows: List[Dict[str, Any]] = []

    # Case 1: SOCIE / simple statements with payload["rows"]
    if payload.get("rows"):
        for r in payload.get("rows") or []:
            label = r.get("label") or r.get("name") or r.get("key") or ""
            values = r.get("values") or {}
            rt = _row_type(r)
            _append_row(out_rows, label, values, rt)

        return ["Line Item", *col_labels], out_rows

    # Case 2: statements with payload["sections"]
    for sec in payload.get("sections") or []:
        sec_label = sec.get("label") or sec.get("key") or ""
        if sec_label:
            _append_row(out_rows, sec_label, {}, "header")

        for line in sec.get("lines") or []:
            label = line.get("name") or line.get("label") or line.get("code") or ""
            values = line.get("values") or {}
            rt = _row_type(line)
            _append_row(out_rows, label, values, rt)

        if sec.get("totals"):
            _append_row(out_rows, f"Total {sec_label}", sec.get("totals") or {}, "subtotal")

    # Case 3: statement-level extras (cash flow especially)
    if payload.get("net_change"):
        block = payload["net_change"] or {}
        _append_row(
            out_rows,
            block.get("label") or "Net change",
            block.get("values") or {},
            "total",
        )

    cash_pos = payload.get("cash_position") or {}
    for k in ("opening", "closing", "delta_from_tb", "reconciliation_gap"):
        if cash_pos.get(k):
            block = cash_pos[k] or {}
            _append_row(
                out_rows,
                block.get("label") or k.replace("_", " ").title(),
                block.get("values") or {},
                "subtotal" if k in ("opening", "closing") else "normal",
            )

    if payload.get("net_result"):
        nr = payload.get("net_result") or {}
        _append_row(
            out_rows,
            nr.get("label") or "Net result",
            nr.get("values") or {},
            "total",
        )

    return ["Line Item", *col_labels], out_rows


def _xlsx_apply_row_style(ws, row_idx: int, row_type: str, max_col: int):
    if row_type == "header":
        for c in range(1, max_col + 1):
            cell = ws.cell(row=row_idx, column=c)
            cell.font = Font(bold=True)
            cell.fill = HEADER_FILL
    elif row_type in ("subtotal",):
        for c in range(1, max_col + 1):
            cell = ws.cell(row=row_idx, column=c)
            cell.font = Font(bold=True)
            cell.fill = SUBTOTAL_FILL
    elif row_type in ("total",):
        for c in range(1, max_col + 1):
            cell = ws.cell(row=row_idx, column=c)
            cell.font = Font(bold=True)
            cell.fill = TITLE_FILL

    for c in range(1, max_col + 1):
        cell = ws.cell(row=row_idx, column=c)
        cell.border = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)


def export_statement_xlsx(payload: Dict[str, Any], filename: str = "statement.xlsx") -> Response:
    meta = payload.get("meta") or {}
    title = _statement_title(meta)
    company_name = meta.get("company_name") or ""
    currency = meta.get("currency") or ""
    period = meta.get("period") or {}
    period_from = period.get("from")
    period_to = period.get("to")

    headers, flat_rows = _flatten_payload(payload)
    cols = _payload_columns(payload)
    col_keys = [c.get("key") for c in cols]

    wb = Workbook()
    ws = wb.active
    ws.title = "Statement"

    # Title block
    ws["A1"] = title
    ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = company_name
    ws["A2"].font = Font(bold=True, size=12)
    ws["A3"] = f"Period: {period_from or ''} to {period_to or ''}"
    ws["A4"] = f"Currency: {currency}"

    # Header row
    start_row = 6
    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=start_row, column=col_idx, value=header)
        cell.font = Font(bold=True)
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal="center")
        cell.border = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)

    # Data rows
    current_row = start_row + 1
    for item in flat_rows:
        ws.cell(row=current_row, column=1, value=item["label"])
        vals = item.get("values") or {}

        for i, key in enumerate(col_keys, start=2):
            val = _clean_number(vals.get(key))
            cell = ws.cell(row=current_row, column=i, value=val)
            if isinstance(val, (int, float)):
                cell.number_format = '#,##0.00'
                cell.alignment = Alignment(horizontal="right")
            else:
                cell.alignment = Alignment(horizontal="left")

        _xlsx_apply_row_style(ws, current_row, item.get("row_type") or "normal", len(headers))
        current_row += 1

    # Widths
    ws.column_dimensions["A"].width = 42
    for idx in range(2, len(headers) + 1):
        ws.column_dimensions[get_column_letter(idx)].width = 18

    out = BytesIO()
    wb.save(out)
    out.seek(0)

    return Response(
        out.getvalue(),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def export_statement_pdf(payload: Dict[str, Any], filename: str = "statement.pdf") -> Response:
    meta = payload.get("meta") or {}
    title = _statement_title(meta)
    company_name = meta.get("company_name") or ""
    currency = meta.get("currency") or ""
    period = meta.get("period") or {}
    period_from = period.get("from")
    period_to = period.get("to")

    headers, flat_rows = _flatten_payload(payload)
    cols = _payload_columns(payload)
    col_keys = [c.get("key") for c in cols]

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
    )

    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph(f"<b>{title}</b>", styles["Title"]))
    if company_name:
        story.append(Paragraph(f"<b>{company_name}</b>", styles["Heading3"]))
    story.append(Paragraph(f"Period: {period_from or ''} to {period_to or ''}", styles["BodyText"]))
    story.append(Paragraph(f"Currency: {currency}", styles["BodyText"]))
    story.append(Spacer(1, 6))

    data = [headers]

    for item in flat_rows:
        row = [item["label"]]
        vals = item.get("values") or {}

        for key in col_keys:
            v = vals.get(key, "")
            if isinstance(v, (int, float)):
                row.append(f"{v:,.2f}")
            else:
                row.append("" if v is None else str(v))
        data.append(row)

    col_widths = [95 * mm]
    remaining_cols = max(1, len(headers) - 1)
    usable_width = 277 * mm - col_widths[0]
    per_col = usable_width / remaining_cols
    col_widths.extend([per_col] * remaining_cols)

    table = Table(data, colWidths=col_widths, repeatRows=1)
    style = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#D9EAF7")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#B7C9E2")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
    ])

    # Apply row shading based on flattened row types
    for idx, item in enumerate(flat_rows, start=1):  # +1 because row 0 is header
        rt = item.get("row_type") or "normal"
        if rt == "header":
            style.add("BACKGROUND", (0, idx), (-1, idx), colors.HexColor("#EEF4FB"))
            style.add("FONTNAME", (0, idx), (-1, idx), "Helvetica-Bold")
        elif rt == "subtotal":
            style.add("BACKGROUND", (0, idx), (-1, idx), colors.HexColor("#F6F9FD"))
            style.add("FONTNAME", (0, idx), (-1, idx), "Helvetica-Bold")
        elif rt == "total":
            style.add("BACKGROUND", (0, idx), (-1, idx), colors.HexColor("#DCEAF7"))
            style.add("FONTNAME", (0, idx), (-1, idx), "Helvetica-Bold")

    table.setStyle(style)
    story.append(table)

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()

    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )