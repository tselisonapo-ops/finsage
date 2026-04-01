from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from config.settings import settings
from core.auth import login_api
from core.client import ApiClient
from core.db import DB
from core.logger import logger, log_event
from api.journal_flow import JournalFlow
from api.invoice_flow import InvoiceFlow
from api.bill_flow import BillFlow
from checks.journal_integrity_check import run_journal_integrity_check
from checks.posting_consistency_check import run_posting_consistency_check
from checks.trial_balance_check import run_trial_balance_check
from checks.invoice_check import run_invoice_check


def _json_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    if hasattr(obj, "isoformat"):
        try:
            return obj.isoformat()
        except Exception:
            pass
    return str(obj)


def main() -> None:
    settings.assert_valid()

    client = ApiClient()
    db = DB()

    report: dict = {
        "ok": True,
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
            flow = JournalFlow(client=client, db=db, company_id=settings.company_id)
            result = flow.execute()
            journal_id = result["journal_id"]

            integrity = run_journal_integrity_check(db, settings.company_id, journal_id)
            consistency = run_posting_consistency_check(db, settings.company_id, journal_id)

            report["steps"].append({"step": "journal_flow", "ok": True, "details": result})
            report["steps"].append({"step": "journal_integrity_check", "ok": True, "details": integrity})
            report["steps"].append({"step": "posting_consistency_check", "ok": True, "details": consistency})

            invoice_flow = InvoiceFlow(client=client, db=db, company_id=settings.company_id)
            invoice_result = invoice_flow.execute()
            report["steps"].append({"step": "invoice_flow", "ok": True, "details": invoice_result})

            invoice_check = run_invoice_check(invoice_result)
            report["steps"].append({"step": "invoice_check", "ok": True, "details": invoice_check})

            bill_flow = BillFlow(client=client, db=db, company_id=settings.company_id)
            bill_result = bill_flow.execute()
            report["steps"].append({"step": "bill_flow", "ok": True, "details": bill_result})
        else:
            report["steps"].append({
                "step": "journal_flow",
                "ok": True,
                "details": {"skipped": True, "reason": "RUN_MODE=readonly"},
            })
            report["steps"].append({
                "step": "invoice_flow",
                "ok": True,
                "details": {"skipped": True, "reason": "RUN_MODE=readonly"},
            })

        tb = run_trial_balance_check(db, settings.company_id)
        report["steps"].append({"step": "trial_balance_check", "ok": True, "details": tb})

    except Exception as exc:
        logger.exception("Smoke runner failed.")
        log_event("smoke_runner_failure", error=str(exc))
        report["ok"] = False
        report["error"] = str(exc)

    finally:
        db.close()

    out_dir = Path(__file__).resolve().parents[1] / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "smoke_report.json"
    out_file.write_text(
        json.dumps(report, indent=2, ensure_ascii=False, default=_json_default),
        encoding="utf-8",
    )

    print(json.dumps(report, indent=2, ensure_ascii=False, default=_json_default))


if __name__ == "__main__":
    main()