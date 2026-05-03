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
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.platypus import KeepTogether
from xml.sax.saxutils import escape



THIN = Side(style="thin", color="D9E2F3")
HEADER_FILL = PatternFill("solid", fgColor="D9EAF7")
SUBTOTAL_FILL = PatternFill("solid", fgColor="EEF4FB")
TITLE_FILL = PatternFill("solid", fgColor="BFD7EA")


def _pdf_amount(v):
    try:
        if v is None or v == "":
            return ""
        n = float(v)
        if abs(n) < 0.000001:
            n = 0.0
        return f"({abs(n):,.2f})" if n < 0 else f"{n:,.2f}"
    except Exception:
        return "" if v is None else str(v)


def _note_para(text, style):
    text = escape(str(text or "")).replace("\n", "<br/>")
    return Paragraph(text, style)


def _financial_table(rows, amount_keys=None):
    """
    Plain FS-style table:
    no Excel grid,
    only total lines,
    professional PDF spacing.
    """
    amount_keys = amount_keys or ["amount"]

    data = []
    row_types = []

    for r in rows or []:
        label = r.get("label") or r.get("name") or ""
        values = r.get("values") or {}
        rt = r.get("row_type") or "normal"

        row = [Paragraph(escape(label), ParagraphStyle(
            "tbl_label",
            fontName="Helvetica-Bold" if rt in ("header", "subtotal", "total") else "Helvetica",
            fontSize=9,
            leading=11,
            alignment=TA_LEFT,
        ))]

        for k in amount_keys:
            row.append(Paragraph(_pdf_amount(values.get(k)), ParagraphStyle(
                "tbl_amt",
                fontName="Helvetica-Bold" if rt in ("subtotal", "total") else "Helvetica",
                fontSize=9,
                leading=11,
                alignment=TA_RIGHT,
            )))

        data.append(row)
        row_types.append(rt)

    if not data:
        return None

    table = Table(data, colWidths=[125 * mm, *([32 * mm] * len(amount_keys))], hAlign="LEFT")

    style = TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ])

    for idx, rt in enumerate(row_types):
        if rt == "header":
            style.add("TOPPADDING", (0, idx), (-1, idx), 7)
            style.add("BOTTOMPADDING", (0, idx), (-1, idx), 3)

        if rt == "subtotal":
            style.add("LINEABOVE", (1, idx), (-1, idx), 0.4, colors.black)

        if rt == "total":
            style.add("LINEABOVE", (1, idx), (-1, idx), 0.7, colors.black)
            style.add("LINEBELOW", (1, idx), (-1, idx), 0.7, colors.black)

    table.setStyle(style)
    return table

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
    if not cols:
        return [{"key": "amount", "label": "Amount"}]

    # hide comparison / extra columns that have no data anywhere
    used = set()

    def scan_values(values):
        if isinstance(values, dict):
            for k, v in values.items():
                if _has_value(v):
                    used.add(k)

    for r in payload.get("rows") or []:
        scan_values(r.get("values"))

    for sec in payload.get("sections") or []:
        for ln in sec.get("lines") or []:
            scan_values(ln.get("values"))
        scan_values(sec.get("totals"))

    def scan_bs_side(side):
        for sec in (side or {}).values():
            if isinstance(sec, dict):
                for ln in sec.get("lines") or []:
                    scan_values(ln.get("values"))
                scan_values(sec.get("totals"))
                scan_values(sec.get("values"))

    scan_bs_side(payload.get("assets"))
    scan_bs_side(payload.get("equity_and_liabilities"))

    for key in ("net_result", "net_change", "opening_balance", "closing_balance"):
        block = payload.get(key)
        if isinstance(block, dict):
            scan_values(block.get("values"))

    cash_pos = payload.get("cash_position") or {}
    for block in cash_pos.values():
        if isinstance(block, dict):
            scan_values(block.get("values"))

    reconciliation = payload.get("reconciliation") or {}
    for block in reconciliation.values():
        if isinstance(block, dict):
            scan_values(block.get("values"))

    # ✅ Keep the template/requested structure.
    # Do NOT collapse export columns just because values are zero.
    return cols

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

def _has_value(v: Any) -> bool:
    if v is None or v == "":
        return False
    try:
        return abs(float(v)) > 0.000001
    except Exception:
        return True


def _flatten_payload(payload: Dict[str, Any]) -> Tuple[List[str], List[Dict[str, Any]]]:
    cols = _payload_columns(payload)
    col_labels = [c.get("label") or c.get("key") for c in cols]

    out_rows: List[Dict[str, Any]] = []

    # 1) Balance Sheet shape
    if payload.get("assets") and payload.get("equity_and_liabilities"):

        def push_section(label, section):
            if not section:
                return

            _append_row(out_rows, label, {}, "header")

            for line in section.get("lines") or []:
                _append_row(
                    out_rows,
                    line.get("name") or line.get("label") or "",
                    line.get("values") or {},
                    _row_type(line),
                )

            totals = section.get("totals")
            if totals:
                vals = totals.get("values") if isinstance(totals, dict) else totals
                _append_row(out_rows, f"Total {label}", vals or {}, "total")

        assets = payload.get("assets") or {}
        push_section("Current assets", assets.get("current_assets"))
        push_section("Non-current assets", assets.get("non_current_assets"))

        if assets.get("totals"):
            _append_row(
                out_rows,
                assets["totals"].get("label") or "Total assets",
                assets["totals"].get("values") or {},
                "total",
            )

        eq = payload.get("equity_and_liabilities") or {}
        push_section("Equity", eq.get("equity"))
        push_section("Non-current liabilities", eq.get("non_current_liabilities"))
        push_section("Current liabilities", eq.get("current_liabilities"))

        if eq.get("totals"):
            _append_row(
                out_rows,
                eq["totals"].get("label") or "Total equity and liabilities",
                eq["totals"].get("values") or {},
                "total",
            )

        if payload.get("balance_check"):
            bc = payload["balance_check"]
            _append_row(
                out_rows,
                bc.get("label") or "Balance check",
                bc.get("values") or {},
                "subtotal",
            )

        return ["Line Item", *col_labels], out_rows

    # 2) SOCIE / row-based shape
    if payload.get("rows"):
        for r in payload.get("rows") or []:
            label = r.get("label") or r.get("name") or r.get("key") or ""
            rt = "total" if str(r.get("key") or "").lower() in {"closing_balance", "total"} else _row_type(r)
            _append_row(out_rows, label, r.get("values") or {}, rt)

        return ["Line Item", *col_labels], out_rows

    # 3A) P&L expanded / management shape (payload["blocks"])
    if payload.get("blocks"):
        for block in payload.get("blocks") or []:
            block_label = block.get("label") or block.get("key") or ""

            # Header
            if block_label:
                _append_row(out_rows, block_label, {}, "header")

            # Lines
            for line in block.get("lines") or []:
                rt = _row_type(line)
                if line.get("is_subtotal"):
                    rt = "subtotal"

                _append_row(
                    out_rows,
                    line.get("name") or line.get("label") or line.get("code") or "",
                    line.get("values") or {},
                    rt,
                )

            # Totals
            if block.get("totals"):
                _append_row(
                    out_rows,
                    f"Total {block_label}",
                    block.get("totals") or {},
                    "subtotal",
                )

            # Direct value blocks (e.g. gross profit)
            if block.get("values") and not block.get("lines") and not block.get("totals"):
                _append_row(
                    out_rows,
                    block_label,
                    block.get("values") or {},
                    "subtotal",
                )

        # Final net result
        # Final net result (support all builder variants)
        def _extract_net_result(payload):
            for key in ("net_result", "net_income", "net_profit", "profit_for_period", "net"):
                block = payload.get(key)
                if isinstance(block, dict):
                    values = block.get("values") or {}
                    if values:
                        return {
                            "label": block.get("label") or "Net Profit",
                            "values": values,
                        }

                    amt = block.get("amount")
                    if amt is not None:
                        cols = _payload_columns(payload)
                        k = cols[0].get("key") if cols else "cur"
                        return {
                            "label": block.get("label") or "Net Profit",
                            "values": {k: amt},
                        }

                elif block is not None:
                    cols = _payload_columns(payload)
                    k = cols[0].get("key") if cols else "cur"
                    return {
                        "label": "Net Profit",
                        "values": {k: block},
                    }

            return None


        nr = _extract_net_result(payload)
        if nr:
            _append_row(out_rows, nr["label"], nr["values"], "total")

        return ["Line Item", *col_labels], out_rows

    # 3) P&L / Cash Flow sections shape
    for sec in payload.get("sections") or []:
        sec_label = sec.get("label") or sec.get("key") or ""

        if sec_label:
            _append_row(out_rows, sec_label, {}, "header")

        for line in sec.get("lines") or []:
            label = line.get("name") or line.get("label") or line.get("code") or ""
            rt = _row_type(line)
            if line.get("is_subtotal"):
                rt = "subtotal"
            _append_row(out_rows, label, line.get("values") or {}, rt)

            # Optional: include breakdown details in Excel/PDF
            detail = line.get("detail") or {}
            for col_key, detail_rows in detail.items():
                if not isinstance(detail_rows, list):
                    continue
                for d in detail_rows:
                    _append_row(
                        out_rows,
                        f"   - {d.get('account_name') or d.get('name') or 'Detail'}",
                        {col_key: d.get("amount")},
                        "normal",
                    )

        totals = sec.get("totals")
        if totals:
            _append_row(out_rows, f"Total {sec_label}", totals or {}, "subtotal")

        # Some P&L blocks use values directly, not lines/totals
        if sec.get("values") and not sec.get("lines") and not sec.get("totals"):
            _append_row(out_rows, sec_label, sec.get("values") or {}, "subtotal")

    # 4) Statement-level totals / extras
    for key in ("net_result", "net_change", "opening_balance", "closing_balance"):
        block = payload.get(key)
        if isinstance(block, dict):
            _append_row(
                out_rows,
                block.get("label") or key.replace("_", " ").title(),
                block.get("values") or {},
                "total" if key in {"net_result", "net_change"} else "subtotal",
            )

    cash_pos = payload.get("cash_position") or {}
    for k in ("opening", "closing", "delta_from_tb", "reconciliation_gap"):
        block = cash_pos.get(k)
        if isinstance(block, dict):
            _append_row(
                out_rows,
                block.get("label") or k.replace("_", " ").title(),
                block.get("values") or {},
                "subtotal",
            )

    reconciliation = payload.get("reconciliation") or {}
    for k in ("delta_from_tb", "gap"):
        block = reconciliation.get(k)
        if isinstance(block, dict):
            _append_row(
                out_rows,
                block.get("label") or k.replace("_", " ").title(),
                block.get("values") or {},
                "subtotal",
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

    cols = _payload_columns(payload)

    # ✅ Apply single-column rename BEFORE flatten
    if len(cols) == 1:
        cols[0]["label"] = "Amount"

    cols = _payload_columns(payload)

    if len(cols) == 1:
        cols[0]["label"] = "Amount"

    payload = {**payload, "columns": cols}

    headers, flat_rows = _flatten_payload(payload)
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

    cols = _payload_columns(payload)
    if len(cols) == 1:
        cols[0] = {**cols[0], "label": "Amount"}

    payload = {**payload, "columns": cols}
    headers, flat_rows = _flatten_payload(payload)
    col_keys = [c.get("key") for c in cols]

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "fs_title",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=17,
        spaceAfter=6,
    )
    meta_style = ParagraphStyle(
        "fs_meta",
        parent=styles["BodyText"],
        fontSize=9,
        leading=11,
    )

    story = [
        Paragraph(escape(title), title_style),
    ]

    if company_name:
        story.append(Paragraph(f"<b>{escape(company_name)}</b>", meta_style))

    if period_from or period_to:
        label = f"Period: {period_from or ''} to {period_to or ''}" if period_from else f"As at: {period_to or ''}"
        story.append(Paragraph(escape(label), meta_style))

    if currency:
        story.append(Paragraph(f"Currency: {escape(currency)}", meta_style))

    story.append(Spacer(1, 10))

    tbl = _financial_table(flat_rows, col_keys)
    if tbl:
        story.append(tbl)

    doc.build(story)

    pdf_bytes = buffer.getvalue()
    buffer.close()

    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

def export_fs_notes_pdf(notes: List[Dict[str, Any]], filename: str = "financial_statement_notes.pdf") -> Response:
    """
    notes shape:
    [
      {
        "title": "Leases",
        "text": "...policy wording...",
        "sections": [
          {"title": "Right-of-use assets", "rows": [...]},
          {"title": "Lease liabilities", "rows": [...]},
        ]
      }
    ]
    """

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
    )

    styles = getSampleStyleSheet()

    note_title = ParagraphStyle(
        "note_title",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        spaceBefore=8,
        spaceAfter=6,
    )

    section_title = ParagraphStyle(
        "section_title",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        spaceBefore=8,
        spaceAfter=4,
    )

    body = ParagraphStyle(
        "note_body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        spaceAfter=7,
    )

    story = []

    for note in notes or []:
        title = note.get("title") or "Note"
        text = note.get("text") or ""

        block = [
            Paragraph(escape(title), note_title),
            _note_para(text, body),
        ]

        for sec in note.get("sections") or []:
            rows = sec.get("rows") or []
            if not rows:
                continue

            block.append(Paragraph(escape(sec.get("title") or ""), section_title))

            amount_keys = sec.get("amount_keys") or ["amount"]
            tbl = _financial_table(rows, amount_keys)
            if tbl:
                block.append(tbl)
                block.append(Spacer(1, 6))

        story.append(KeepTogether(block))
        story.append(Spacer(1, 10))

    doc.build(story)

    pdf_bytes = buffer.getvalue()
    buffer.close()

    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )