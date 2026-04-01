from __future__ import annotations

import json
from pathlib import Path

from api.invoice_flow import InvoiceFlow
from checks.invoice_check import run_invoice_check
from config.settings import settings
from core.auth import login_api
from core.client import ApiClient
from core.db import DB
from core.logger import logger, log_event


def main() -> None:
    settings.assert_valid()

    client = ApiClient()
    db = DB()

    report = {
        "ok": True,
        "scenario": "ar",
        "run_mode": settings.run_mode,
        "company_id": settings.company_id,
        "steps": [],
    }

    try:
        login_data = login_api(client)
        report["steps"].append({
            "step": "login_api",
            "ok": True,
            "details": {"keys": list(login_data.keys()) if isinstance(login_data, dict) else []},
        })

        if settings.run_mode != "readonly":
            invoice_flow = InvoiceFlow(client=client, db=db, company_id=settings.company_id)
            invoice_result = invoice_flow.execute()
            report["steps"].append({"step": "invoice_flow", "ok": True, "details": invoice_result})

            invoice_check = run_invoice_check(invoice_result)
            report["steps"].append({"step": "invoice_check", "ok": True, "details": invoice_check})
        else:
            report["steps"].append({
                "step": "invoice_flow",
                "ok": True,
                "details": {"skipped": True, "reason": "RUN_MODE=readonly"},
            })

    except Exception as exc:
        logger.exception("AR runner failed.")
        log_event("ar_runner_failure", error=str(exc))
        report["ok"] = False
        report["error"] = str(exc)

    finally:
        db.close()

    out_dir = Path(__file__).resolve().parents[1] / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "ar_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()