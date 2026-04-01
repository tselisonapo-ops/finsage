from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from api.bank_flow import BankAccountFlow
from api.lease_flow import LeaseFlow
from api.lease_monthly_due_flow import LeaseMonthlyDueFlow
from api.lease_post_month_flow import LeasePostMonthFlow
from api.lease_payment_flow import LeasePaymentFlow
from checks.lease_check import (
    run_lease_check,
    run_lease_monthly_due_check,
    run_lease_post_month_check,
    run_lease_payment_check,
)
from config.settings import settings
from core.auth import login_api
from core.client import ApiClient
from core.db import DB


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

    report = {
        "ok": True,
        "scenario": "lease",
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
                "bank_account_flow",
                "lease_flow",
                "lease_check",
                "lease_monthly_due_flow",
                "lease_monthly_due_check",
                "lease_post_month_flow",
                "lease_post_month_check",
                "lease_payment_flow",
                "lease_payment_check",
            ):
                _append_step(
                    report,
                    step_name,
                    True,
                    {"skipped": True, "reason": "RUN_MODE=readonly"},
                )
        else:
            # 1) Bank account
            bank_account_flow = BankAccountFlow(client=client, db=db, company_id=settings.company_id)
            bank_account_result = bank_account_flow.execute()
            _append_step(report, "bank_account_flow", True, bank_account_result)

            bank_account_id = bank_account_result.get("bank_account_id")
            if not bank_account_id:
                raise AssertionError(
                    f"BankAccountFlow did not return bank_account_id: {bank_account_result}"
                )

            # 2) Lease inception
            lease_flow = LeaseFlow(client=client, db=db, company_id=settings.company_id)
            lease_result = lease_flow.execute()
            _append_step(report, "lease_flow", True, lease_result)

            lease_check = run_lease_check(lease_result)
            _append_step(report, "lease_check", True, lease_check)

            lease_id = lease_result.get("lease_id")
            if not lease_id:
                raise AssertionError(f"Lease flow did not return lease_id: {lease_result}")

            # 3) Lease monthly due
            lease_due_flow = LeaseMonthlyDueFlow(client=client, db=db, company_id=settings.company_id)
            lease_due_flow.state["lease_id"] = int(lease_id)
            lease_due_result = lease_due_flow.execute()
            _append_step(report, "lease_monthly_due_flow", True, lease_due_result)

            lease_due_check = run_lease_monthly_due_check(lease_due_result)
            _append_step(report, "lease_monthly_due_check", True, lease_due_check)

            period_no = lease_due_result.get("period_no")
            due_row = lease_due_result.get("due_row") or {}
            schedule_id = due_row.get("schedule_id")

            if not period_no:
                raise AssertionError(f"Lease monthly due flow did not return period_no: {lease_due_result}")
            if not schedule_id:
                raise AssertionError(f"Lease monthly due flow did not return schedule_id: {lease_due_result}")

            # 4) Lease post month
            lease_post_month_flow = LeasePostMonthFlow(client=client, db=db, company_id=settings.company_id)
            lease_post_month_flow.state["lease_id"] = int(lease_id)
            lease_post_month_flow.state["period_no"] = int(period_no)
            lease_post_month_result = lease_post_month_flow.execute()
            _append_step(report, "lease_post_month_flow", True, lease_post_month_result)

            lease_post_month_check = run_lease_post_month_check(lease_post_month_result)
            _append_step(report, "lease_post_month_check", True, lease_post_month_check)

            # 5) Lease payment
            lease_payment_flow = LeasePaymentFlow(client=client, db=db, company_id=settings.company_id)
            lease_payment_flow.state["lease_id"] = int(lease_id)
            lease_payment_flow.state["schedule_id"] = int(schedule_id)
            lease_payment_flow.state["bank_account_id"] = int(bank_account_id)
            lease_payment_result = lease_payment_flow.execute()
            _append_step(report, "lease_payment_flow", True, lease_payment_result)

            lease_payment_check = run_lease_payment_check(lease_payment_result)
            _append_step(report, "lease_payment_check", True, lease_payment_check)

    except Exception as exc:
        report["ok"] = False
        report["error"] = str(exc)
    finally:
        db.close()

    out_dir = Path(__file__).resolve().parents[1] / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "lease_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False, default=_json_default),
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2, ensure_ascii=False, default=_json_default))


if __name__ == "__main__":
    main()