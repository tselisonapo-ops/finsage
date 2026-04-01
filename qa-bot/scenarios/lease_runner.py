from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from api.lease_flow import LeaseFlow
from api.lease_monthly_due_flow import LeaseMonthlyDueFlow
from api.lease_post_month_flow import LeasePostMonthFlow
from checks.lease_check import (
    run_lease_check,
    run_lease_monthly_due_check,
    run_lease_post_month_check,
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
        report["steps"].append({
            "step": "login_api",
            "ok": True,
            "details": {"keys": list(login_data.keys()) if isinstance(login_data, dict) else []},
        })

        lease_result = LeaseFlow(client=client, db=db, company_id=settings.company_id).execute()
        report["steps"].append({
            "step": "lease_flow",
            "ok": True,
            "details": lease_result,
        })

        lease_check = run_lease_check(lease_result)
        report["steps"].append({
            "step": "lease_check",
            "ok": True,
            "details": lease_check,
        })

        lease_id = lease_result.get("lease_id")
        if not lease_id:
            raise AssertionError(f"Lease flow did not return lease_id: {lease_result}")

        lease_due_flow = LeaseMonthlyDueFlow(client=client, db=db, company_id=settings.company_id)
        lease_due_flow.state["lease_id"] = int(lease_id)
        lease_due_result = lease_due_flow.execute()
        report["steps"].append({
            "step": "lease_monthly_due_flow",
            "ok": True,
            "details": lease_due_result,
        })

        lease_due_check = run_lease_monthly_due_check(lease_due_result)
        report["steps"].append({
            "step": "lease_monthly_due_check",
            "ok": True,
            "details": lease_due_check,
        })

        period_no = lease_due_result.get("period_no")
        if not period_no:
            raise AssertionError(f"Lease monthly due flow did not return period_no: {lease_due_result}")

        lease_post_month_flow = LeasePostMonthFlow(client=client, db=db, company_id=settings.company_id)
        lease_post_month_flow.state["lease_id"] = int(lease_id)
        lease_post_month_flow.state["period_no"] = int(period_no)
        lease_post_month_result = lease_post_month_flow.execute()
        report["steps"].append({
            "step": "lease_post_month_flow",
            "ok": True,
            "details": lease_post_month_result,
        })

        lease_post_month_check = run_lease_post_month_check(lease_post_month_result)
        report["steps"].append({
            "step": "lease_post_month_check",
            "ok": True,
            "details": lease_post_month_check,
        })

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