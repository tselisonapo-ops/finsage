from __future__ import annotations

from io import BytesIO
from typing import Any, Dict, List, Tuple
from flask import send_file
from flask import Response, request
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
import csv
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from io import BytesIO, StringIO
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.platypus import KeepTogether
from xml.sax.saxutils import escape
from BackEnd.Services.vat_pack_pdf_builder import _add_brand_header

import re
from datetime import date, datetime
from openpyxl.worksheet.page import PageMargins
from openpyxl.worksheet.properties import PageSetupProperties

THIN = Side(style="thin", color="D9E2F3")
HEADER_FILL = PatternFill("solid", fgColor="D9EAF7")
SUBTOTAL_FILL = PatternFill("solid", fgColor="EEF4FB")
TITLE_FILL = PatternFill("solid", fgColor="BFD7EA")

MONEY_FORMAT = "#,##0.00"
COUNT_FORMAT = "#,##0"
DATE_FORMAT = "yyyy-mm-dd"

# Gross / Taxable / Employee / Employer / Total columns in section tables
MONEY_COLUMNS = {7, 8, 9, 10, 11}

HEADER_FILL = PatternFill(
    fill_type="solid",
    start_color="FFD9D9D9",
    end_color="FFD9D9D9",
)

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

def _company_from_meta(meta: Dict[str, Any]) -> Dict[str, Any]:
    company = dict(meta.get("company") or {})
    company.setdefault("company_name", meta.get("company_name") or meta.get("name"))
    company.setdefault("currency", meta.get("currency"))

    for k in (
        "logo_path",
        "logo_file",
        "logo_local_path",
        "logo",
        "company_logo",
        "attachment_path",
        "logo_attachment_path",
        "logo_url",
        "branding_logo_url",
        "company_reg_no",
        "reg_no",
        "vat_no",
        "vat_number",
        "company_email",
        "email",
        "company_phone",
        "phone",
        "address",
        "physical_address",
        "postal_address",
    ):
        if meta.get(k) and not company.get(k):
            company[k] = meta.get(k)

    return company

def _financial_table(rows, amount_keys=None, amount_labels=None, page_width_mm=260):
    """
    FS-style table with dynamic widths.
    Supports wide disclosure notes such as PPE and IFRS 16.
    """
    amount_keys = amount_keys or ["amount"]
    amount_labels = amount_labels or {k: k.replace("_", " ").title() for k in amount_keys}

    data = []
    row_types = []

    # Header row
    header_style = ParagraphStyle(
        "tbl_header",
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9,
        alignment=TA_RIGHT,
    )

    label_header_style = ParagraphStyle(
        "tbl_header_label",
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9,
        alignment=TA_LEFT,
    )

    data.append(
        [Paragraph("Description", label_header_style)]
        + [Paragraph(escape(str(amount_labels.get(k, k))), header_style) for k in amount_keys]
    )
    row_types.append("header")

    for r in rows or []:
        label = r.get("label") or r.get("name") or ""
        values = r.get("values") or {}
        rt = r.get("row_type") or "normal"

        row = [Paragraph(escape(label), ParagraphStyle(
            "tbl_label",
            fontName="Helvetica-Bold" if rt in ("header", "subtotal", "total") else "Helvetica",
            fontSize=8,
            leading=10,
            alignment=TA_LEFT,
        ))]

        for k in amount_keys:
            row.append(Paragraph(_pdf_amount(values.get(k)), ParagraphStyle(
                "tbl_amt",
                fontName="Helvetica-Bold" if rt in ("subtotal", "total") else "Helvetica",
                fontSize=8,
                leading=10,
                alignment=TA_RIGHT,
            )))

        data.append(row)
        row_types.append(rt)

    if len(data) <= 1:
        return None

    if len(amount_keys) == 1:
        label_width = 115 * mm
        amount_width = 42 * mm
    else:
        label_width = 55 * mm
        available = page_width_mm * mm - label_width
        amount_width = max(20 * mm, available / max(len(amount_keys), 1))
        
    table = Table(
        data,
        colWidths=[label_width, *([amount_width] * len(amount_keys))],
        hAlign="LEFT",
        repeatRows=1,
    )

    style = TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),

        # Header line
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.black),

        # Light straight line between disclosure rows
        ("LINEBELOW", (0, 1), (-1, -1), 0.2, colors.HexColor("#D9D9D9")),
    ])

    for idx, rt in enumerate(row_types):
        if rt == "header":
            style.add("FONTNAME", (0, idx), (-1, idx), "Helvetica-Bold")

    if rt == "subtotal":
        style.add(
            "LINEABOVE",
            (0, idx),
            (-1, idx),
            0.5,
            colors.black,
        )

    if rt == "total":
        style.add(
            "LINEABOVE",
            (0, idx),
            (-1, idx),
            0.8,
            colors.black,
        )
        style.add(
            "LINEBELOW",
            (0, idx),
            (-1, idx),
            1.0,
            colors.black,
        )
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

def _pretty_date(v):
    if not v:
        return ""
    try:
        from datetime import datetime, date

        if isinstance(v, date):
            d = v
        else:
            d = datetime.strptime(str(v)[:10], "%Y-%m-%d").date()

        return d.strftime("%d %B %Y")
    except Exception:
        return str(v)

def _year_from_period(period):
    if not isinstance(period, dict):
        return None
    to = period.get("to")
    if not to:
        return None
    return str(to)[:4]


def _ias_export_columns(meta, cols):
    meta = meta or {}
    cols = cols or []

    cur_year = _year_from_period(meta.get("period"))

    comparison_periods = meta.get("comparison_periods") or []
    prior_period = meta.get("prior_period")

    year_by_key = {}

    if cur_year:
        year_by_key["cur"] = cur_year

    if isinstance(prior_period, dict):
        y = _year_from_period(prior_period)
        if y:
            year_by_key["pri"] = y

    for idx, p in enumerate(comparison_periods or [], start=1):
        key = p.get("key") or ("pri" if idx == 1 else f"p{idx}")
        y = _year_from_period({"to": p.get("to")})
        if y:
            year_by_key[key] = y

    out = []

    for c in cols:
        key = c.get("key")

        # ✅ Do not show variance column in IAS-style exports
        if key in ("delta", "variance", "movement"):
            continue

        label = year_by_key.get(key) or c.get("label") or key

        # fallback labels
        if str(label).lower() in ("current", "amount"):
            label = cur_year or label

        out.append({**c, "label": label})

    return out

def _ias_period_label(meta):
    stmt = str((meta or {}).get("statement") or "").lower()
    period = (meta or {}).get("period") or {}

    period_from = period.get("from")
    period_to = period.get("to")

    if stmt in ("bs", "balance_sheet"):
        return f"As at {_pretty_date(period_to)}" if period_to else ""

    if period_to:
        return f"For the year ended {_pretty_date(period_to)}"

    if period_from:
        return f"For the period from {_pretty_date(period_from)}"

    return ""

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
                if isinstance(totals, dict):
                    vals = totals.get("values") or {
                        k: v for k, v in totals.items()
                        if k not in ("label", "name", "row_type", "meta")
                    }
                else:
                    vals = totals
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

def _autofit_worksheet(ws, *, min_width=10, max_width=45):
    for col_idx in range(1, ws.max_column + 1):
        width = min_width

        for row_idx in range(1, ws.max_row + 1):
            cell = ws.cell(row=row_idx, column=col_idx)

            if cell.value is None:
                continue

            value = str(cell.value)
            lines = value.splitlines() or [value]
            width = max(width, max(len(line) for line in lines) + 2)

        ws.column_dimensions[get_column_letter(col_idx)].width = min(
            width,
            max_width,
        )


def _format_disclosure_worksheet(ws):
    thin = Side(style="thin", color="D9E2F3")
    border = Border(bottom=thin)
    title_fill = PatternFill("solid", fgColor="1F4E78")
    section_fill = PatternFill("solid", fgColor="D9EAF7")
    header_fill = PatternFill("solid", fgColor="5B9BD5")

    ws.freeze_panes = "A2"
    ws.sheet_view.showGridLines = False

    for row in ws.iter_rows():
        for cell in row:
            cell.alignment = Alignment(
                vertical="top",
                wrap_text=True,
            )

            if isinstance(cell.value, (int, float)):
                cell.number_format = '#,##0.00;[Red](#,##0.00);-'

    for row_idx in range(1, ws.max_row + 1):
        first = ws.cell(row_idx, 1)
        values = [
            ws.cell(row_idx, col_idx).value
            for col_idx in range(1, ws.max_column + 1)
        ]
        non_empty = [value for value in values if value not in (None, "")]

        if row_idx == 1:
            for cell in ws[row_idx]:
                cell.fill = title_fill
                cell.font = Font(color="FFFFFF", bold=True, size=13)
                cell.alignment = Alignment(
                    vertical="center",
                    wrap_text=True,
                )

            ws.row_dimensions[row_idx].height = 24
            continue

        if len(non_empty) == 1 and first.value:
            for cell in ws[row_idx]:
                cell.fill = section_fill
                cell.font = Font(bold=True, color="1F1F1F")
                cell.border = border

            ws.row_dimensions[row_idx].height = 21
            continue

        first_text = str(first.value or "").strip().lower()

        if first_text in {
            "description",
            "bucket",
            "contract name",
            "lease name",
        }:
            for cell in ws[row_idx]:
                cell.fill = header_fill
                cell.font = Font(color="FFFFFF", bold=True)
                cell.alignment = Alignment(
                    horizontal="center",
                    vertical="center",
                    wrap_text=True,
                )
                cell.border = border

            ws.row_dimensions[row_idx].height = 30

    _autofit_worksheet(ws)

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

def _write_statement_sheet(wb, sheet_name, payload, *, company_name="", currency=""):
    meta = payload.get("meta") or {}
    title = _statement_title(meta)

    cols = _ias_export_columns(meta, _payload_columns(payload))
    if len(cols) == 1:
        cols[0]["label"] = "Amount"

    payload = {**payload, "columns": cols}
    headers, flat_rows = _flatten_payload(payload)
    col_keys = [c.get("key") for c in cols]

    ws = wb.create_sheet(title=sheet_name[:31])

    ws["A1"] = str(company_name or meta.get("company_name") or "").upper()
    ws["A1"].font = Font(bold=True, size=13)
    ws["A1"].alignment = Alignment(horizontal="center")

    ws["A2"] = str(title or "").upper()
    ws["A2"].font = Font(bold=True, size=14)
    ws["A2"].alignment = Alignment(horizontal="center")

    ws["A3"] = _ias_period_label(meta)
    ws["A3"].alignment = Alignment(horizontal="center")

    ws["A4"] = f"(All amounts presented in {currency or meta.get('currency')})" if (currency or meta.get("currency")) else ""
    ws["A4"].alignment = Alignment(horizontal="center")

    max_col = max(1, len(headers))
    for row in range(1, 5):
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=max_col)

    start_row = 6
    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=start_row, column=col_idx, value=header)
        cell.font = Font(bold=True)
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal="center")
        cell.border = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)

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

    ws.column_dimensions["A"].width = 42
    for idx in range(2, len(headers) + 1):
        ws.column_dimensions[get_column_letter(idx)].width = 18

    return ws

def build_pnl_export_summary_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Converts detailed P&L payload into IAS 1-style summary payload for exports.
    Keeps the same columns/comparisons, but removes account-level detail.
    """

    if not isinstance(payload, dict):
        return payload

    meta = dict(payload.get("meta") or {})
    if str(meta.get("statement") or "").lower() not in ("pnl", "income_statement", "profit_loss"):
        return payload

    sections = payload.get("sections") or []
    if not isinstance(sections, list):
        return payload

    by_key = {
        str(s.get("key") or "").lower(): s
        for s in sections
        if isinstance(s, dict)
    }

    def vals(*keys):
        for key in keys:
            sec = by_key.get(key)
            if sec and isinstance(sec.get("totals"), dict):
                return dict(sec.get("totals") or {})
        return {}

    def row(key, label, values, row_type="normal"):
        return {
            "key": key,
            "label": label,
            "values": values or {},
            "row_type": row_type,
        }

    rows = []

    rows.append(row("revenue", "Revenue", vals("revenue"), "normal"))

    cogs_vals = vals("cogs", "cost_of_sales", "cost_of_revenue")
    if cogs_vals:
        rows.append(row("cost_of_sales", "Cost of sales", cogs_vals, "normal"))

    gross_vals = vals("gross_profit")
    if gross_vals:
        rows.append(row("gross_profit", "Gross profit", gross_vals, "subtotal"))

    exp_vals = vals("operating_expenses", "expenses")
    if exp_vals:
        rows.append(row("operating_expenses", "Operating expenses", exp_vals, "normal"))

    op_vals = vals("operating_profit", "operating_income")
    if op_vals:
        rows.append(row("operating_profit", "Operating profit", op_vals, "subtotal"))

    other_vals = vals("other", "other_income", "other_income_expense")
    if other_vals:
        rows.append(row("other_income_expense", "Other income/(expense)", other_vals, "normal"))

    pbt_vals = vals("profit_before_tax")
    if pbt_vals:
        rows.append(row("profit_before_tax", "Profit before tax", pbt_vals, "subtotal"))

    tax_vals = vals("tax", "income_tax")
    if tax_vals:
        rows.append(row("income_tax", "Income tax expense", tax_vals, "normal"))

    net = payload.get("net_result") or {}
    net_vals = dict(net.get("values") or {})
    if net_vals:
        rows.append(row("profit_for_the_year", net.get("label") or "Profit for the year", net_vals, "total"))

    out = dict(payload)
    out["rows"] = rows
    out["sections"] = []
    out.setdefault("meta", {})
    out["meta"] = {
        **meta,
        "statement_title": "Statement of Profit or Loss",
        "export_layout": "ias1_summary_pnl",
    }

    return out

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
    cols = _ias_export_columns(meta, _payload_columns(payload))

    if len(cols) == 1:
        cols[0]["label"] = "Amount"

    payload = {**payload, "columns": cols}

    headers, flat_rows = _flatten_payload(payload)
    col_keys = [c.get("key") for c in cols]

    wb = Workbook()
    default_ws = wb.active
    wb.remove(default_ws)

    is_pnl_export = str((meta.get("statement") or "")).lower() in (
        "pnl",
        "income_statement",
        "profit_loss",
    )

    if is_pnl_export:
        summary_payload = build_pnl_export_summary_payload(payload)
        _write_statement_sheet(
            wb,
            "P&L Summary",
            summary_payload,
            company_name=company_name,
            currency=currency,
        )

        detail_payload = dict(payload)
        detail_payload.setdefault("meta", {})
        detail_payload["meta"] = {
            **(detail_payload.get("meta") or {}),
            "statement_title": "Detailed Profit or Loss",
        }

        _write_statement_sheet(
            wb,
            "Detailed P&L",
            detail_payload,
            company_name=company_name,
            currency=currency,
        )
    else:
        _write_statement_sheet(
            wb,
            "Statement",
            payload,
            company_name=company_name,
            currency=currency,
        )

    # SOCIE comparison statements - separate sheets
    comparison_statements = payload.get("comparison_statements") or []

    for idx, cmp_stmt in enumerate(comparison_statements, start=1):
        sheet_name = "Comparative" if idx == 1 else f"Comparative {idx}"
        ws_cmp = wb.create_sheet(title=sheet_name[:31])

        cmp_meta = cmp_stmt.get("meta") or {}
        cmp_title = _statement_title(cmp_meta)
        cmp_company = cmp_meta.get("company_name") or company_name
        cmp_currency = cmp_meta.get("currency") or currency

        cmp_cols = _payload_columns(cmp_stmt)
        if len(cmp_cols) == 1:
            cmp_cols[0]["label"] = "Amount"

        cmp_stmt = {**cmp_stmt, "columns": cmp_cols}
        cmp_headers, cmp_flat_rows = _flatten_payload(cmp_stmt)
        cmp_col_keys = [c.get("key") for c in cmp_cols]

        cmp_max_col = max(1, len(cmp_headers))

        ws_cmp["A1"] = str(cmp_company or "").upper()
        ws_cmp["A1"].font = Font(bold=True, size=13)
        ws_cmp["A1"].alignment = Alignment(horizontal="center")

        ws_cmp["A2"] = str(cmp_title or "").upper()
        ws_cmp["A2"].font = Font(bold=True, size=14)
        ws_cmp["A2"].alignment = Alignment(horizontal="center")

        ws_cmp["A3"] = _ias_period_label(cmp_meta)
        ws_cmp["A3"].alignment = Alignment(horizontal="center")

        ws_cmp["A4"] = f"(All amounts presented in {cmp_currency})" if cmp_currency else ""
        ws_cmp["A4"].alignment = Alignment(horizontal="center")

        for row in range(1, 5):
            ws_cmp.merge_cells(start_row=row, start_column=1, end_row=row, end_column=cmp_max_col)

        start_row_cmp = 6

        for col_idx, header in enumerate(cmp_headers, start=1):
            cell = ws_cmp.cell(row=start_row_cmp, column=col_idx, value=header)
            cell.font = Font(bold=True)
            cell.fill = HEADER_FILL
            cell.alignment = Alignment(horizontal="center")
            cell.border = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)

        current_row_cmp = start_row_cmp + 1

        for item in cmp_flat_rows:
            ws_cmp.cell(row=current_row_cmp, column=1, value=item["label"])
            vals = item.get("values") or {}

            for i, key in enumerate(cmp_col_keys, start=2):
                val = _clean_number(vals.get(key))
                cell = ws_cmp.cell(row=current_row_cmp, column=i, value=val)

                if isinstance(val, (int, float)):
                    cell.number_format = '#,##0.00'
                    cell.alignment = Alignment(horizontal="right")
                else:
                    cell.alignment = Alignment(horizontal="left")

            _xlsx_apply_row_style(
                ws_cmp,
                current_row_cmp,
                item.get("row_type") or "normal",
                len(cmp_headers),
            )

            current_row_cmp += 1

        ws_cmp.column_dimensions["A"].width = 42
        for col_idx in range(2, len(cmp_headers) + 1):
            ws_cmp.column_dimensions[get_column_letter(col_idx)].width = 18

    for ws in wb.worksheets:
        _format_disclosure_worksheet(ws)

    out = BytesIO()
    wb.save(out)
    out.seek(0)

    return Response(
        out.getvalue(),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

def export_statement_pdf(payload: Dict[str, Any], filename: str = "statement.pdf") -> Response:
    original_payload = payload
    meta = payload.get("meta") or {}

    if str(meta.get("statement") or "").lower() in ("pnl", "income_statement", "profit_loss"):
        payload = build_pnl_export_summary_payload(payload)
        meta = payload.get("meta") or {}
    title = _statement_title(meta)
    company_name = meta.get("company_name") or ""
    currency = meta.get("currency") or ""

    cols = _ias_export_columns(meta, _payload_columns(payload))

    if len(cols) == 1:
        cols[0] = {**cols[0], "label": "Amount"}
        
    payload = {**payload, "columns": cols}
    _, flat_rows = _flatten_payload(payload)
    col_keys = [c.get("key") for c in cols]

    wide_table = len(cols) > 6
    page_size = landscape(A4) if wide_table else A4
    page_width_mm = 260 if wide_table else 174

    amount_labels = {
        c.get("key"): c.get("label") or c.get("key")
        for c in cols
    }

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=page_size,
        leftMargin=12 * mm if wide_table else 18 * mm,
        rightMargin=12 * mm if wide_table else 18 * mm,
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
        fontName="Helvetica",
        fontSize=9,
        leading=11,
        alignment=1,
    )

    story = []

    company = _company_from_meta(meta)

    if company.get("logo_path") or company.get("logo_file") or company.get("logo_url") or company.get("company_logo"):
        _add_brand_header(story, doc, title, company)
    else:
        if company_name:
            company_style = ParagraphStyle(
                "company_name",
                parent=styles["BodyText"],
                fontName="Helvetica-Bold",
                fontSize=12,
                alignment=1,  # centre
                spaceAfter=4,
            )

            story.append(
                Paragraph(
                    escape(str(company_name).upper()),
                    company_style
                )
            )

        story.append(
            Paragraph(
                escape(title.upper()),
                title_style
            )
        )
    period_label = _ias_period_label(meta)

    if period_label:
        story.append(Paragraph(escape(period_label), meta_style))
        
    if currency:
        story.append(Paragraph(
            escape(f"(All amounts presented in {currency})"),
            meta_style
        ))

    story.append(Spacer(1, 10))

    tbl = _financial_table(
        flat_rows,
        col_keys,
        amount_labels=amount_labels,
        page_width_mm=page_width_mm,
    )

    if tbl:
        story.append(tbl)

    is_pnl_export = str((payload.get("meta") or {}).get("statement") or "").lower() in (
        "pnl",
        "income_statement",
        "profit_loss",
    )

    include_detail = is_pnl_export

    if include_detail and str((payload.get("meta") or {}).get("statement") or "").lower() in ("pnl", "income_statement", "profit_loss"):
        story.append(PageBreak())
        detail_payload = dict(original_payload)
        detail_payload.setdefault("meta", {})
        detail_payload["meta"] = {
            **(detail_payload.get("meta") or {}),
            "statement_title": "Detailed Profit or Loss",
        }

        detail_cols = _ias_export_columns(detail_payload.get("meta") or {}, _payload_columns(detail_payload))
        detail_payload = {**detail_payload, "columns": detail_cols}
        _, detail_rows = _flatten_payload(detail_payload)
        detail_col_keys = [c.get("key") for c in detail_cols]
        detail_labels = {c.get("key"): c.get("label") or c.get("key") for c in detail_cols}

        story.append(Paragraph("DETAILED PROFIT OR LOSS", title_style))
        detail_tbl = _financial_table(
            detail_rows,
            detail_col_keys,
            amount_labels=detail_labels,
            page_width_mm=page_width_mm,
        )
        if detail_tbl:
            story.append(detail_tbl)

    # ✅ SOCIE comparison statements: render each comparison as its own table
    comparison_statements = payload.get("comparison_statements") or []

    if comparison_statements:
        for idx, cmp_stmt in enumerate(comparison_statements, start=1):
            cmp_meta = cmp_stmt.get("meta") or {}
            cmp_period = cmp_meta.get("period") or {}

            heading = "Comparative period" if idx == 1 else f"Comparative period {idx}"

            story.append(Spacer(1, 14))
            story.append(Paragraph(f"<b>{escape(heading)}</b>", meta_style))

            if cmp_period.get("from") or cmp_period.get("to"):
                story.append(Paragraph(
                    escape(_ias_period_label(cmp_meta)),
                    meta_style,
                ))

            cmp_cols = _payload_columns(cmp_stmt)
            if len(cmp_cols) == 1:
                cmp_cols[0] = {**cmp_cols[0], "label": "Amount"}

            cmp_payload = {**cmp_stmt, "columns": cmp_cols}
            _, cmp_flat_rows = _flatten_payload(cmp_payload)
            cmp_col_keys = [c.get("key") for c in cmp_cols]

            cmp_amount_labels = {
                c.get("key"): c.get("label") or c.get("key")
                for c in cmp_cols
            }

            cmp_tbl = _financial_table(
                cmp_flat_rows,
                cmp_col_keys,
                amount_labels=cmp_amount_labels,
                page_width_mm=page_width_mm,
            )

            if cmp_tbl:
                story.append(cmp_tbl)

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
    all_section_keys = []

    for note in notes or []:
        for sec in note.get("sections") or []:
            rows = sec.get("rows") or []
            keys = sec.get("amount_keys") or []

            if not keys and sec.get("columns"):
                keys = [c.get("key") for c in sec.get("columns") or [] if c.get("key")]

            if not keys:
                for r in rows:
                    for k in (r.get("values") or {}).keys():
                        if k not in keys:
                            keys.append(k)

            all_section_keys.extend(keys)

    wide_notes = len(set(all_section_keys)) > 4
    page_size = landscape(A4) if wide_notes else A4

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=page_size,
        leftMargin=12 * mm if wide_notes else 18 * mm,
        rightMargin=12 * mm if wide_notes else 18 * mm,
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

            amount_keys = sec.get("amount_keys")

            if not amount_keys:
                # Prefer explicit columns if section provides them
                if sec.get("columns"):
                    amount_keys = [c.get("key") for c in sec.get("columns") or [] if c.get("key")]
                else:
                    # Infer keys from row values
                    keys = []
                    for r in rows:
                        vals = r.get("values") or {}
                        for k in vals.keys():
                            if k not in keys:
                                keys.append(k)

                    amount_keys = keys or ["amount"]

            amount_labels = sec.get("amount_labels") or {}

            if sec.get("columns"):
                amount_labels.update({
                    c.get("key"): c.get("label") or c.get("key")
                    for c in sec.get("columns") or []
                    if c.get("key")
                })

            wide_table = len(amount_keys) > 4
            page_width_mm = 260 if wide_table else 174

            tbl = _financial_table(
                rows,
                amount_keys,
                amount_labels=amount_labels,
                page_width_mm=page_width_mm,
            )
            if tbl:
                block.append(tbl)
                block.append(Spacer(1, 6))

        story.extend(block)
        story.append(Spacer(1, 10))

    doc.build(story)

    pdf_bytes = buffer.getvalue()
    buffer.close()

    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

def _put(worksheet, row_no, column_no, value, kind=None):
    """Write a cell — number formats applied only where they make sense."""
    cell = worksheet.cell(
        row=row_no,
        column=column_no,
        value=value,
    )

    if kind == "money" and isinstance(value, (int, float)):
        cell.number_format = MONEY_FORMAT
        cell.alignment = Alignment(horizontal="right")
    elif kind == "count" and isinstance(value, (int, float)):
        cell.number_format = COUNT_FORMAT
    elif isinstance(value, (date, datetime)):
        cell.number_format = DATE_FORMAT

    return cell


def _export_payroll_statutory_return_xlsx(
    payload: dict,
):
    meta = payload.get("meta") or {}
    company = meta.get("company") or {}
    sections = payload.get("sections") or []
    totals = payload.get("totals") or {}

    workbook = Workbook()

    worksheet = workbook.active
    worksheet.title = "EMP201"

    row_no = 1

    # -- Title --------------------------------------------------------
    worksheet.cell(
        row=row_no,
        column=1,
        value=payload.get("title") or "EMP201",
    ).font = Font(bold=True, size=16)

    row_no += 2

    # -- Company details ----------------------------------------------
    worksheet.cell(
        row=row_no,
        column=1,
        value="Company Details",
    ).font = Font(bold=True, size=13)

    row_no += 1

    company_details = [
        ("Company Name", company.get("name")),
        ("Client Code", company.get("client_code")),
        ("Company Reg No", company.get("reg_no")),
        ("Tax Reference (TIN)", company.get("tin")),
        ("VAT Number", company.get("vat_number")),
        ("Company Email", company.get("email")),
        ("Company Phone", company.get("phone")),
        ("Physical Address", company.get("physical_address")),
        ("Postal Address", company.get("postal_address")),
        ("Currency", company.get("currency")),
    ]

    for label, value in company_details:
        if value in (None, ""):
            continue

        worksheet.cell(
            row=row_no,
            column=1,
            value=label,
        ).font = Font(bold=True)

        worksheet.cell(
            row=row_no,
            column=2,
            value=str(value),
        )

        row_no += 1

    row_no += 1

    # -- Return details -------------------------------------------------
    metadata = [
        ("Authority", meta.get("authority_code")),
        ("Return Type", meta.get("return_type")),
        ("Return Number", meta.get("return_no")),
        ("Company ID", meta.get("company_id")),
        ("Period Start", meta.get("period_start")),
        ("Period End", meta.get("period_end")),
        ("Status", meta.get("status")),
    ]

    for label, value in metadata:
        worksheet.cell(
            row=row_no,
            column=1,
            value=label,
        ).font = Font(bold=True)

        _put(worksheet, row_no, 2, value)

        row_no += 1

    row_no += 1

    # Keep header block visible while scrolling
    worksheet.freeze_panes = f"A{row_no}"

    # -- Sections -------------------------------------------------------
    headers = [
        "Employee No",
        "Employee Name",
        "Tax Number",
        "Department",
        "Source Code",
        "Description",
        "Gross Remuneration",
        "Taxable Remuneration",
        "Employee Amount",
        "Employer Amount",
        "Total",
    ]

    money_keys = (
        "gross_remuneration",
        "taxable_remuneration",
        "employee_amount",
        "employer_amount",
        "total_amount",
    )

    for section in sections:
        title = section.get("title") or "Statutory Return"

        worksheet.cell(
            row=row_no,
            column=1,
            value=title,
        ).font = Font(bold=True, size=13)

        row_no += 1

        for column_no, header in enumerate(headers, start=1):
            cell = worksheet.cell(
                row=row_no,
                column=column_no,
                value=header,
            )

            cell.font = Font(bold=True)
            cell.alignment = Alignment(horizontal="center")
            cell.fill = HEADER_FILL

        row_no += 1

        section_rows = section.get("rows") or []

        for item in section_rows:
            values = [
                item.get("employee_no"),
                item.get("employee_name"),
                item.get("tax_number"),
                item.get("department"),
                item.get("source_code"),
                item.get("description"),
                item.get("gross_remuneration", 0),
                item.get("taxable_remuneration", 0),
                item.get("employee_amount", 0),
                item.get("employer_amount", 0),
                item.get("total_amount", 0),
            ]

            for column_no, value in enumerate(values, start=1):
                _put(
                    worksheet,
                    row_no,
                    column_no,
                    value,
                    kind=(
                        "money"
                        if column_no in MONEY_COLUMNS
                        else None
                    ),
                )

            row_no += 1

        if section_rows:
            worksheet.cell(
                row=row_no,
                column=6,
                value="Section Total",
            ).font = Font(bold=True)

            for offset, key in enumerate(money_keys, start=7):
                section_total = sum(
                    float(row.get(key) or 0)
                    for row in section_rows
                )

                _put(
                    worksheet,
                    row_no,
                    offset,
                    section_total,
                    kind="money",
                ).font = Font(bold=True)

            row_no += 2
        else:
            row_no += 1

    # -- Return totals ----------------------------------------------------
    worksheet.cell(
        row=row_no,
        column=1,
        value="RETURN TOTALS",
    ).font = Font(bold=True, size=13)

    row_no += 1

    totals_rows = [
        ("Employee Count", totals.get("employee_count", 0), "count"),
        ("Gross Remuneration", totals.get("gross_remuneration", 0), "money"),
        ("Taxable Remuneration", totals.get("taxable_remuneration", 0), "money"),
        ("Employee Amount", totals.get("employee_amount", 0), "money"),
        ("Employer Amount", totals.get("employer_amount", 0), "money"),
        ("Total Payable", totals.get("total_payable", 0), "money"),
    ]

    for label, value, kind in totals_rows:
        worksheet.cell(
            row=row_no,
            column=1,
            value=label,
        ).font = Font(bold=True)

        _put(
            worksheet,
            row_no,
            2,
            value,
            kind=kind,
        ).font = Font(bold=True)

        row_no += 1

    # -- Column widths (no global number-format pass anymore!) ------------
    for column_cells in worksheet.columns:
        max_length = 0

        column_letter = get_column_letter(
            column_cells[0].column,
        )

        for cell in column_cells:
            if cell.value is not None:
                max_length = max(
                    max_length,
                    len(str(cell.value)),
                )

        worksheet.column_dimensions[
            column_letter
        ].width = min(
            max(max_length + 2, 12),
            45,
        )

    # -- Print setup: one page wide, landscape A4 --------------------------
    worksheet.page_setup.orientation = "landscape"
    worksheet.page_setup.paperSize = worksheet.PAPERSIZE_A4
    worksheet.page_setup.fitToWidth = 1
    worksheet.page_setup.fitToHeight = 0
    worksheet.sheet_properties.pageSetUpPr = PageSetupProperties(
        fitToPage=True,
    )
    worksheet.print_options.horizontalCentered = True
    worksheet.page_margins = PageMargins(
        left=0.4,
        right=0.4,
        top=0.6,
        bottom=0.6,
        header=0.2,
        footer=0.2,
    )
    worksheet.oddFooter.right.text = "Page &P of &N"

    output = BytesIO()

    workbook.save(output)

    output.seek(0)

    company_slug = re.sub(
        r"[^A-Za-z0-9]+",
        "-",
        str(company.get("name") or "company"),
    ).strip("-")

    return_ref = (
        meta.get("return_no")
        or meta.get("return_id")
        or "export"
    )

    return send_file(
        output,
        as_attachment=True,
        download_name=(
            f"EMP201_{company_slug}_{return_ref}.xlsx"
        ),
        mimetype=(
            "application/vnd.openxmlformats-"
            "officedocument.spreadsheetml.sheet"
        ),
    )




def _company_detail_rows(meta: dict) -> list:
    company = meta.get("company") or {}

    return [
        ("Company Name", company.get("name")),
        ("Client Code", company.get("client_code")),
        ("Company Reg No", company.get("reg_no")),
        ("Tax Reference (TIN)", company.get("tin")),
        ("VAT Number", company.get("vat_number")),
        ("Company Email", company.get("email")),
        ("Company Phone", company.get("phone")),
        ("Physical Address", company.get("physical_address")),
        ("Postal Address", company.get("postal_address")),
        ("Currency", company.get("currency")),
    ]


def _return_meta_rows(meta: dict) -> list:
    return [
        ("Authority", meta.get("authority_code")),
        ("Return Type", meta.get("return_type")),
        ("Return Number", meta.get("return_no")),
        ("Company ID", meta.get("company_id")),
        ("Period Start", meta.get("period_start")),
        ("Period End", meta.get("period_end")),
        ("Status", meta.get("status")),
    ]


def _export_download_name(meta: dict, extension: str) -> str:
    company = meta.get("company") or {}

    slug = re.sub(
        r"[^A-Za-z0-9]+",
        "-",
        str(company.get("name") or "company"),
    ).strip("-")

    ref = (
        meta.get("return_no")
        or meta.get("return_id")
        or "export"
    )

    return f"EMP201_{slug}_{ref}.{extension}"

def _export_payroll_statutory_return_csv(
    payload: dict,
    layout: str = "report",
):
    meta = payload.get("meta") or {}
    sections = payload.get("sections") or []
    totals = payload.get("totals") or {}

    include_meta = layout != "data"

    buffer = StringIO()

    writer = csv.writer(
        buffer,
        lineterminator="\r\n",
    )

    def money(value):
        try:
            return f"{float(value or 0):.2f}"
        except (TypeError, ValueError):
            return value

    def count(value):
        try:
            return str(int(value or 0))
        except (TypeError, ValueError):
            return value

    if include_meta:
        writer.writerow(["EMP201 STATUTORY RETURN"])
        writer.writerow([])

        for label, value in _company_detail_rows(meta):
            if value in (None, ""):
                continue

            writer.writerow([label, value])

        writer.writerow([])

        for label, value in _return_meta_rows(meta):
            writer.writerow(
                [label, value if value is not None else ""]
            )

        writer.writerow([])

    headers = [
        "Section",
        "Employee No",
        "Employee Name",
        "Tax Number",
        "Department",
        "Source Code",
        "Description",
        "Gross Remuneration",
        "Taxable Remuneration",
        "Employee Amount",
        "Employer Amount",
        "Total",
    ]

    writer.writerow(headers)

    for section in sections:
        title = (
            section.get("title")
            or "Statutory Return"
        )

        for item in section.get("rows") or []:
            writer.writerow([
                title,
                item.get("employee_no"),
                item.get("employee_name"),
                item.get("tax_number"),
                item.get("department"),
                item.get("source_code"),
                item.get("description"),
                money(item.get("gross_remuneration", 0)),
                money(item.get("taxable_remuneration", 0)),
                money(item.get("employee_amount", 0)),
                money(item.get("employer_amount", 0)),
                money(item.get("total_amount", 0)),
            ])

    if include_meta:
        writer.writerow([])

        writer.writerow(["RETURN TOTALS"])

        totals_rows = [
            ("Employee Count",
                count(totals.get("employee_count", 0))),
            ("Gross Remuneration",
                money(totals.get("gross_remuneration", 0))),
            ("Taxable Remuneration",
                money(totals.get("taxable_remuneration", 0))),
            ("Employee Amount",
                money(totals.get("employee_amount", 0))),
            ("Employer Amount",
                money(totals.get("employer_amount", 0))),
            ("Total Payable",
                money(totals.get("total_payable", 0))),
        ]

        for label, value in totals_rows:
            writer.writerow([label, value])

    output = BytesIO()

    output.write(
        buffer.getvalue().encode("utf-8-sig")
    )

    output.seek(0)

    return send_file(
        output,
        as_attachment=True,
        download_name=_export_download_name(meta, "csv"),
        mimetype="text/csv; charset=utf-8",
    )

def _xml_child(
    parent,
    tag: str,
    value,
    decimals: bool = False,
    skip_empty: bool = False,
):
    text = value

    if decimals:
        try:
            text = f"{float(value or 0):.2f}"
        except (TypeError, ValueError):
            text = str(value or 0)
    elif value is not None and not isinstance(value, str):
        text = str(value)

    if skip_empty and (text is None or text == ""):
        return None

    element = ET.SubElement(parent, tag)

    element.text = text

    return element


def _export_payroll_statutory_return_xml(
    payload: dict,
):
    meta = payload.get("meta") or {}
    company = meta.get("company") or {}
    sections = payload.get("sections") or []
    totals = payload.get("totals") or {}

    root = ET.Element(
        "StatutoryReturn",
        {
            "authority":
                str(meta.get("authority_code") or ""),
            "returnType":
                str(meta.get("return_type") or ""),
            "returnNo":
                str(meta.get("return_no") or ""),
            "periodStart":
                str(meta.get("period_start") or ""),
            "periodEnd":
                str(meta.get("period_end") or ""),
            "status":
                str(meta.get("status") or ""),
            "generatedAt": datetime.now(timezone.utc)
                .strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
    )

    company_el = ET.SubElement(root, "Company")

    company_el.set(
        "id",
        str(meta.get("company_id") or ""),
    )

    for tag, key in [
        ("Name", "name"),
        ("ClientCode", "client_code"),
        ("RegistrationNumber", "reg_no"),
        ("TaxReference", "tin"),
        ("VatNumber", "vat_number"),
        ("Email", "email"),
        ("Phone", "phone"),
        ("PhysicalAddress", "physical_address"),
        ("PostalAddress", "postal_address"),
        ("Currency", "currency"),
    ]:
        _xml_child(
            company_el,
            tag,
            company.get(key),
            skip_empty=True,
        )

    sections_el = ET.SubElement(root, "Sections")

    for section in sections:
        section_el = ET.SubElement(
            sections_el,
            "Section",
            {
                "title": str(
                    section.get("title")
                    or "Statutory Return"
                ),
            },
        )

        for item in section.get("rows") or []:
            row_el = ET.SubElement(section_el, "Row")

            _xml_child(row_el, "EmployeeNo",
                item.get("employee_no"))
            _xml_child(row_el, "EmployeeName",
                item.get("employee_name"))
            _xml_child(row_el, "TaxNumber",
                item.get("tax_number"))
            _xml_child(row_el, "Department",
                item.get("department"))
            _xml_child(row_el, "SourceCode",
                item.get("source_code"))
            _xml_child(row_el, "Description",
                item.get("description"))

            _xml_child(row_el, "GrossRemuneration",
                item.get("gross_remuneration", 0),
                decimals=True)
            _xml_child(row_el, "TaxableRemuneration",
                item.get("taxable_remuneration", 0),
                decimals=True)
            _xml_child(row_el, "EmployeeAmount",
                item.get("employee_amount", 0),
                decimals=True)
            _xml_child(row_el, "EmployerAmount",
                item.get("employer_amount", 0),
                decimals=True)
            _xml_child(row_el, "TotalAmount",
                item.get("total_amount", 0),
                decimals=True)

    totals_el = ET.SubElement(root, "Totals")

    _xml_child(totals_el, "EmployeeCount",
        totals.get("employee_count", 0))
    _xml_child(totals_el, "GrossRemuneration",
        totals.get("gross_remuneration", 0),
        decimals=True)
    _xml_child(totals_el, "TaxableRemuneration",
        totals.get("taxable_remuneration", 0),
        decimals=True)
    _xml_child(totals_el, "EmployeeAmount",
        totals.get("employee_amount", 0),
        decimals=True)
    _xml_child(totals_el, "EmployerAmount",
        totals.get("employer_amount", 0),
        decimals=True)
    _xml_child(totals_el, "TotalPayable",
        totals.get("total_payable", 0),
        decimals=True)

    try:
        ET.indent(root, space="  ")
    except AttributeError:
        pass  # Python < 3.9 — output stays valid, just unindented

    xml_bytes = ET.tostring(
        root,
        encoding="UTF-8",
        xml_declaration=True,
    )

    output = BytesIO(xml_bytes)

    output.seek(0)

    return send_file(
        output,
        as_attachment=True,
        download_name=_export_download_name(meta, "xml"),
        mimetype="application/xml",
    )


MONEY_KEYS = (
    "gross_remuneration",
    "taxable_remuneration",
    "employee_amount",
    "employer_amount",
    "total_amount",
)


def _money(value) -> str:
    try:
        return f"{float(value or 0):.2f}"
    except (TypeError, ValueError):
        return "0.00"


def _export_download_name(meta: dict, extension: str) -> str:
    company = meta.get("company") or {}

    slug = re.sub(
        r"[^A-Za-z0-9]+",
        "-",
        str(company.get("name") or "company"),
    ).strip("-")

    ref = (
        meta.get("return_no")
        or meta.get("return_id")
        or "export"
    )

    return f"EMP201_{slug}_{ref}.{extension}"


def _xml_child(parent, tag: str, value, money: bool = False):
    if money:
        text = _money(value)
    elif value is None:
        text = ""
    else:
        text = str(value)

    element = ET.SubElement(parent, tag)
    element.text = text
    return element


def _xml_section_totals(section_el, rows: list):
    totals_el = ET.SubElement(section_el, "SectionTotals")

    _xml_child(totals_el, "RowCount", len(rows))

    for key, tag in [
        ("gross_remuneration", "GrossRemuneration"),
        ("taxable_remuneration", "TaxableRemuneration"),
        ("employee_amount", "EmployeeAmount"),
        ("employer_amount", "EmployerAmount"),
        ("total_amount", "TotalAmount"),
    ]:
        section_total = sum(
            float(row.get(key) or 0)
            for row in rows
        )

        _xml_child(
            totals_el,
            tag,
            section_total,
            money=True,
        )


def _export_payroll_statutory_return_xml(
    payload: dict,
):
    meta = payload.get("meta") or {}
    company = meta.get("company") or {}
    sections = payload.get("sections") or []
    totals = payload.get("totals") or {}

    root = ET.Element("StatutoryReturn")
    root.set("authority", str(meta.get("authority_code") or ""))
    root.set("returnType", str(meta.get("return_type") or ""))
    root.set("returnNo", str(meta.get("return_no") or ""))
    root.set("periodStart", str(meta.get("period_start") or ""))
    root.set("periodEnd", str(meta.get("period_end") or ""))
    root.set("status", str(meta.get("status") or ""))
    root.set(
        "generatedAt",
        datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )

    # -- Company details: every tag always emitted (empty string if unset),
    #    so downstream parsers can rely on presence -----------------------
    company_el = ET.SubElement(root, "Company")
    company_el.set("id", str(meta.get("company_id") or ""))

    _xml_child(company_el, "Name", company.get("name"))
    _xml_child(company_el, "ClientCode", company.get("client_code"))
    _xml_child(company_el, "RegistrationNumber", company.get("reg_no"))
    _xml_child(company_el, "TaxReference", company.get("tin"))
    _xml_child(company_el, "VatNumber", company.get("vat_number"))
    _xml_child(company_el, "Email", company.get("email"))
    _xml_child(company_el, "Phone", company.get("phone"))
    _xml_child(company_el, "PhysicalAddress", company.get("physical_address"))
    _xml_child(company_el, "PostalAddress", company.get("postal_address"))
    _xml_child(company_el, "Currency", company.get("currency"))

    # -- Sections --------------------------------------------------------
    sections_el = ET.SubElement(root, "Sections")

    for section in sections:
        title = section.get("title") or "Statutory Return"
        rows = section.get("rows") or []

        section_el = ET.SubElement(sections_el, "Section")
        section_el.set("title", str(title))

        for item in rows:
            row_el = ET.SubElement(section_el, "Row")

            _xml_child(row_el, "EmployeeNo", item.get("employee_no"))
            _xml_child(row_el, "EmployeeName", item.get("employee_name"))
            _xml_child(row_el, "TaxNumber", item.get("tax_number"))
            _xml_child(row_el, "Department", item.get("department"))
            _xml_child(row_el, "SourceCode", item.get("source_code"))
            _xml_child(row_el, "Description", item.get("description"))

            _xml_child(row_el, "GrossRemuneration",
                item.get("gross_remuneration", 0), money=True)
            _xml_child(row_el, "TaxableRemuneration",
                item.get("taxable_remuneration", 0), money=True)
            _xml_child(row_el, "EmployeeAmount",
                item.get("employee_amount", 0), money=True)
            _xml_child(row_el, "EmployerAmount",
                item.get("employer_amount", 0), money=True)
            _xml_child(row_el, "TotalAmount",
                item.get("total_amount", 0), money=True)

        _xml_section_totals(section_el, rows)

    # -- Return totals ----------------------------------------------------
    totals_el = ET.SubElement(root, "Totals")

    _xml_child(totals_el, "EmployeeCount", totals.get("employee_count", 0))
    _xml_child(totals_el, "GrossRemuneration",
        totals.get("gross_remuneration", 0), money=True)
    _xml_child(totals_el, "TaxableRemuneration",
        totals.get("taxable_remuneration", 0), money=True)
    _xml_child(totals_el, "EmployeeAmount",
        totals.get("employee_amount", 0), money=True)
    _xml_child(totals_el, "EmployerAmount",
        totals.get("employer_amount", 0), money=True)
    _xml_child(totals_el, "TotalPayable",
        totals.get("total_payable", 0), money=True)

    try:
        ET.indent(root, space="  ")
    except AttributeError:
        pass  # Python < 3.9: output valid, just not indented

    xml_bytes = ET.tostring(
        root,
        encoding="UTF-8",
        xml_declaration=True,
    )

    output = BytesIO(xml_bytes)
    output.seek(0)

    return send_file(
        output,
        as_attachment=True,
        download_name=_export_download_name(meta, "xml"),
        mimetype="application/xml",
    )

