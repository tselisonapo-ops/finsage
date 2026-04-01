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
from api.vendor_flow import VendorFlow
from api.bank_recon_flow import BankReconFlow
from api.asset_flow import AssetFlow
from api.asset_acquisition_flow import AssetAcquisitionFlow
from api.asset_acquisition_post_flow import AssetAcquisitionPostFlow
from api.depreciation_run_flow import DepreciationRunFlow
from api.depreciation_post_flow import DepreciationPostFlow

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


def _append_step(report: dict, step: str, ok: bool, details: dict) -> None:
    report["steps"].append({
        "step": step,
        "ok": ok,
        "details": details,
    })


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
        _append_step(
            report,
            "login_api",
            True,
            {"keys": list(login_data.keys()) if isinstance(login_data, dict) else []},
        )

        if settings.run_mode == "readonly":
            for step_name in (
                "journal_flow",
                "invoice_flow",
                "vendor_flow",
                "bill_flow",
                "bank_recon_flow",
                "asset_flow",
                "asset_acquisition_flow",
                "asset_acquisition_post_flow",
                "depreciation_run_flow",
                "depreciation_post_flow",
            ):
                _append_step(
                    report,
                    step_name,
                    True,
                    {"skipped": True, "reason": "RUN_MODE=readonly"},
                )
        else:
            # 1) Journal
            journal_flow = JournalFlow(client=client, db=db, company_id=settings.company_id)
            journal_result = journal_flow.execute()
            journal_id = journal_result["journal_id"]

            integrity = run_journal_integrity_check(db, settings.company_id, journal_id)
            consistency = run_posting_consistency_check(db, settings.company_id, journal_id)

            _append_step(report, "journal_flow", True, journal_result)
            _append_step(report, "journal_integrity_check", True, integrity)
            _append_step(report, "posting_consistency_check", True, consistency)

            # 2) Invoice
            invoice_flow = InvoiceFlow(client=client, db=db, company_id=settings.company_id)
            invoice_result = invoice_flow.execute()
            invoice_check = run_invoice_check(invoice_result)

            _append_step(report, "invoice_flow", True, invoice_result)
            _append_step(report, "invoice_check", True, invoice_check)

            # 3) Vendor
            vendor_flow = VendorFlow(client=client, db=db, company_id=settings.company_id)
            vendor_result = vendor_flow.execute()
            _append_step(report, "vendor_flow", True, vendor_result)

            vendor_id = vendor_result.get("vendor_id")
            if not vendor_id:
                raise AssertionError(f"Vendor flow did not return vendor_id: {vendor_result}")

            # 4) Bill
            bill_flow = BillFlow(client=client, db=db, company_id=settings.company_id)
            bill_flow.state["vendor_id"] = vendor_id
            bill_result = bill_flow.execute()
            _append_step(report, "bill_flow", True, bill_result)

            # 5) Bank reconciliation
            bank_recon_flow = BankReconFlow(client=client, db=db, company_id=settings.company_id)
            bank_recon_result = bank_recon_flow.execute()
            _append_step(report, "bank_recon_flow", True, bank_recon_result)

            # 6) Asset
            asset_flow = AssetFlow(client=client, db=db, company_id=settings.company_id)
            asset_result = asset_flow.execute()
            _append_step(report, "asset_flow", True, asset_result)

            asset_id = asset_result.get("asset_id")
            if not asset_id:
                raise AssertionError(f"Asset flow did not return asset_id: {asset_result}")

            # 7) Asset acquisition
            acq_flow = AssetAcquisitionFlow(client=client, db=db, company_id=settings.company_id)
            acq_flow.state["asset_id"] = asset_id
            acq_result = acq_flow.execute()
            _append_step(report, "asset_acquisition_flow", True, acq_result)

            acq_id = acq_result.get("acq_id")
            if not acq_id:
                raise AssertionError(f"Asset acquisition flow did not return acq_id: {acq_result}")

            # 8) Post acquisition
            acq_post_flow = AssetAcquisitionPostFlow(client=client, db=db, company_id=settings.company_id)
            acq_post_flow.state["acq_id"] = acq_id
            acq_post_result = acq_post_flow.execute()
            _append_step(report, "asset_acquisition_post_flow", True, acq_post_result)

            # 9) Depreciation run
            dep_run_flow = DepreciationRunFlow(client=client, db=db, company_id=settings.company_id)
            dep_run_result = dep_run_flow.execute()
            _append_step(report, "depreciation_run_flow", True, dep_run_result)

            dep_id = dep_run_result.get("dep_id")
            if dep_id:
                dep_post_flow = DepreciationPostFlow(client=client, db=db, company_id=settings.company_id)
                dep_post_flow.state["dep_id"] = dep_id
                dep_post_result = dep_post_flow.execute()
                _append_step(report, "depreciation_post_flow", True, dep_post_result)
            else:
                _append_step(
                    report,
                    "depreciation_post_flow",
                    True,
                    {"skipped": True, "reason": "No depreciation rows created in run"},
                )

        tb = run_trial_balance_check(db, settings.company_id)
        _append_step(report, "trial_balance_check", True, tb)

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