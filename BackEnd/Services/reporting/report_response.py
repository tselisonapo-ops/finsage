from datetime import datetime
from datetime import datetime, timezone

def build_report_response(report_name, company_id, period_from, period_to, rows, columns, totals=None, filters=None):
    return {
        "ok": True,
        "meta": {
            "report": report_name,
            "company_id": company_id,
            "period": {
                "from": str(period_from),
                "to": str(period_to),
            },
            "generated_at": datetime.utcnow().isoformat()
        },
        "filters": filters or {},
        "columns": columns,
        "rows": rows,
        "totals": totals or {}
    }


def build_report_response(
    report_name,
    company_id,
    period_from,
    period_to,
    rows,
    columns,
    totals=None,
    filters=None,
    extra_meta=None,
):
    meta = {
        "report": report_name,
        "company_id": int(company_id),
        "period": {
            "from": str(period_from) if period_from else None,
            "to": str(period_to) if period_to else None,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    if extra_meta:
        meta.update(extra_meta)

    return {
        "ok": True,
        "meta": meta,
        "filters": filters or {},
        "columns": columns,
        "rows": rows or [],
        "totals": totals or {},
    }