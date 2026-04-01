from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from api.vendor_flow import VendorFlow
from api.bill_flow import BillFlow
from api.vendor_payment_flow import VendorPaymentFlow
from checks.bill_check import run_bill_check
from checks.vendor_payment_check import run_vendor_payment_check
from config.settings import settings
from core.auth import login_api
from core.client import ApiClient
from core.db import DB
from core.logger import logger, log_event


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

    report = {
        "ok": True,
        "scenario": "ap",
        "run_mode": settings.run_mode,
        "company_id": settings.company_id,
        "steps": [],
    }

    try:
        login_data = login_api(client)
        report["steps"].append({
            "step": "login_api",
            "ok": True,
            "details": {
                "keys": list(login_data.keys()) if isinstance(login_data, dict) else []
            },
        })

        vendor_flow = VendorFlow(client=client, db=db, company_id=settings.company_id)
        vendor_result = vendor_flow.execute()
        report["steps"].append({
            "step": "vendor_flow",
            "ok": True,
            "details": vendor_result,
        })

        vendor_id = (
            vendor_result.get("vendor_id")
            or vendor_result.get("id")
            or (vendor_result.get("data") or {}).get("vendor_id")
            or (vendor_result.get("data") or {}).get("id")
        )

        if not vendor_id:
            raise AssertionError(f"Vendor flow did not return a usable vendor_id. Result: {vendor_result}")

        bill_flow = BillFlow(
            client=client,
            db=db,
            company_id=settings.company_id,
            vendor_id=vendor_id,
        )
        bill_result = bill_flow.execute()
        report["steps"].append({
            "step": "bill_flow",
            "ok": True,
            "details": bill_result,
        })

        bill_check = run_bill_check(bill_result)
        report["steps"].append({
            "step": "bill_check",
            "ok": True,
            "details": bill_check,
        })

        bill_id = (
            bill_result.get("bill_id")
            or bill_result.get("id")
            or (bill_result.get("data") or {}).get("bill_id")
            or (bill_result.get("data") or {}).get("id")
        )

        payment_flow = VendorPaymentFlow(
            client=client,
            db=db,
            company_id=settings.company_id,
            vendor_id=vendor_id,
            bill_id=bill_id,
        )
        payment_result = payment_flow.execute()
        report["steps"].append({
            "step": "vendor_payment_flow",
            "ok": True,
            "details": payment_result,
        })

        payment_check = run_vendor_payment_check(payment_result)
        report["steps"].append({
            "step": "vendor_payment_check",
            "ok": True,
            "details": payment_check,
        })

    except Exception as exc:
        logger.exception("AP runner failed.")
        log_event("ap_runner_failure", error=str(exc))
        report["ok"] = False
        report["error"] = str(exc)

    finally:
        db.close()

    out_dir = Path(__file__).resolve().parents[1] / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "ap_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False, default=_json_default),
        encoding="utf-8",
    )

    print(json.dumps(report, indent=2, ensure_ascii=False, default=_json_default))


if __name__ == "__main__":
    main()