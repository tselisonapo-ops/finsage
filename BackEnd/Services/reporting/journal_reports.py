
from io import BytesIO
from flask import send_file
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
from openpyxl.utils import get_column_letter
from flask import Response

def export_xlsx(payload: dict, filename: str = "report.xlsx"):
    wb = Workbook()
    ws = wb.active
    ws.title = str(payload.get("report_key") or "Report")[:31]

    rows = payload.get("rows") or []
    columns = payload.get("columns") or []

    headers = [c.get("label") or c.get("key") for c in columns]
    keys = [c.get("key") for c in columns]

    ws.append(headers)

    for row in rows:
        ws.append([row.get(k, "") for k in keys])

    header_fill = PatternFill("solid", fgColor="EAF2F8")
    thin = Side(style="thin", color="D9E2EC")

    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = header_fill
        cell.border = Border(bottom=thin)
        cell.alignment = Alignment(horizontal="center")

    for col_idx, key in enumerate(keys, start=1):
        max_len = len(str(headers[col_idx - 1] or ""))
        for row_idx in range(2, ws.max_row + 1):
            value = ws.cell(row=row_idx, column=col_idx).value
            max_len = max(max_len, len(str(value or "")))

            if key in {"debit", "credit", "balance", "debit_total", "credit_total"}:
                ws.cell(row=row_idx, column=col_idx).number_format = '#,##0.00'

        ws.column_dimensions[get_column_letter(col_idx)].width = min(max(max_len + 2, 12), 45)

    ws.freeze_panes = "A2"

    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)

    return Response(
        bio.getvalue(),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )

def build_journal_register(db, company_id, date_from=None, date_to=None, q=None):
    schema = db.company_schema(company_id)

    where = ["j.company_id = %s"]
    params = [int(company_id)]

    if date_from:
        where.append("j.date >= %s")
        params.append(date_from)

    if date_to:
        where.append("j.date <= %s")
        params.append(date_to)

    if q:
        where.append("(COALESCE(j.ref,'') ILIKE %s OR COALESCE(j.description,'') ILIKE %s)")
        like = f"%{q}%"
        params.extend([like, like])

    sql = f"""
    SELECT
        j.id,
        j.date,
        COALESCE(j.ref, '') AS ref,
        COALESCE(j.description, '') AS description,
        COALESCE(j.source, '') AS source,
        COALESCE(j.net_amount, 0) AS net_amount,
        COALESCE(j.vat_amount, 0) AS vat_amount,
        COALESCE(j.gross_amount, 0) AS gross_amount,
        COUNT(l.id) AS line_count,
        COALESCE(SUM(l.debit), 0) AS debit_total,
        COALESCE(SUM(l.credit), 0) AS credit_total
    FROM {schema}.journal j
    LEFT JOIN {schema}.ledger l
      ON l.journal_id = j.id
     AND l.company_id = j.company_id
    WHERE {" AND ".join(where)}
    GROUP BY j.id
    ORDER BY j.date DESC, j.id DESC
    """

    raw_rows = db.fetch_all(sql, tuple(params)) or []

    rows = []
    for r in raw_rows:
        rows.append({
            "date": str(r.get("date")) if r.get("date") else "",
            "ref": r.get("ref") or "",
            "description": r.get("description") or "",
            "source": r.get("source") or "",
            "debit_total": float(r.get("debit_total") or 0),
            "credit_total": float(r.get("credit_total") or 0),
        })

    columns = [
        {"key": "date", "label": "Date"},
        {"key": "ref", "label": "Ref"},
        {"key": "description", "label": "Description"},
        {"key": "source", "label": "Source"},
        {"key": "debit_total", "label": "Debit"},
        {"key": "credit_total", "label": "Credit"},
    ]

    return rows, columns