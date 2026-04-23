import csv
from io import StringIO
from flask import Response

def export_csv(report_payload):
    output = StringIO()
    writer = csv.writer(output)

    columns = report_payload["columns"]
    rows = report_payload["rows"]

    headers = [col["label"] for col in columns]
    keys = [col["key"] for col in columns]

    writer.writerow(headers)

    for r in rows:
        writer.writerow([r.get(k, "") for k in keys])

    output.seek(0)

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=report.csv"}
    )



def export_csv(report_payload, filename="report.csv"):
    output = StringIO()
    writer = csv.writer(output)

    columns = report_payload.get("columns") or []
    rows = report_payload.get("rows") or []

    headers = [col.get("label") or col.get("key") for col in columns]
    keys = [col.get("key") for col in columns]

    writer.writerow(headers)

    for row in rows:
        writer.writerow([row.get(k, "") for k in keys])

    csv_text = output.getvalue()
    output.close()

    return Response(
        csv_text,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )