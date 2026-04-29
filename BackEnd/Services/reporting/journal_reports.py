
from io import BytesIO
from flask import send_file
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
from openpyxl.utils import get_column_letter
from flask import Response

def export_xlsx(payload_or_rows, columns=None, filename: str = "report.xlsx", sheet_name: str = "Report"):
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name[:31]

    if columns is None:
        payload = payload_or_rows or {}
        data = payload.get("data") or {}

        rows = (
            payload.get("rows")
            or data.get("rows")
            or payload.get("items")
            or data.get("items")
            or []
        )

        columns = (
            payload.get("columns")
            or data.get("columns")
            or []
        )
    else:
        rows = payload_or_rows or []
        columns = columns or []

    headers = [c.get("label") or c.get("key") for c in columns]
    keys = [c.get("key") for c in columns]

    ws.append(headers)

    for row in rows:
        row = dict(row)
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
        where.append("""
            (
                COALESCE(j.ref,'') ILIKE %s
                OR COALESCE(j.description,'') ILIKE %s
                OR COALESCE(l.memo,'') ILIKE %s
                OR COALESCE(l.account,'') ILIKE %s
                OR COALESCE(c.name,'') ILIKE %s
            )
        """)
        like = f"%{q}%"
        params.extend([like, like, like, like, like])

    sql = f"""
    SELECT
        j.id AS journal_id,
        j.date,
        COALESCE(j.ref, '') AS ref,
        COALESCE(j.description, '') AS description,
        COALESCE(j.source, '') AS source,
        l.id AS line_id,
        l.account AS account_code,
        COALESCE(c.name, l.account) AS account_name,
        COALESCE(l.memo, '') AS memo,
        COALESCE(l.debit, 0) AS debit,
        COALESCE(l.credit, 0) AS credit
    FROM {schema}.journal j
    JOIN {schema}.ledger l
      ON l.journal_id = j.id
     AND l.company_id = j.company_id
    LEFT JOIN {schema}.coa c
      ON c.company_id = l.company_id
     AND c.code = l.account
    WHERE {" AND ".join(where)}
    ORDER BY j.date DESC, j.id DESC, l.id ASC
    """

    raw_rows = db.fetch_all(sql, tuple(params)) or []

    rows = []
    for r in raw_rows:
        rows.append({
            "date": str(r.get("date")) if r.get("date") else "",
            "ref": r.get("ref") or "",
            "journal_id": r.get("journal_id"),
            "source": r.get("source") or "",
            "description": r.get("description") or "",
            "account_code": r.get("account_code") or "",
            "account_name": r.get("account_name") or "",
            "memo": r.get("memo") or "",
            "debit": float(r.get("debit") or 0),
            "credit": float(r.get("credit") or 0),
        })

    columns = [
        {"key": "date", "label": "Date"},
        {"key": "ref", "label": "Ref"},
        {"key": "journal_id", "label": "Journal ID"},
        {"key": "source", "label": "Source"},
        {"key": "description", "label": "Description"},
        {"key": "account_code", "label": "Account"},
        {"key": "account_name", "label": "Account Name"},
        {"key": "memo", "label": "Memo"},
        {"key": "debit", "label": "Debit"},
        {"key": "credit", "label": "Credit"},
    ]

    return rows, columns