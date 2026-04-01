from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from api.lease_flow import LeaseFlow
from checks.lease_check import run_lease_check
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
        report["steps"].append({"step": "login_api", "ok": True, "details": {"keys": list(login_data.keys()) if isinstance(login_data, dict) else []}})

        lease_result = LeaseFlow(client=client, db=db, company_id=settings.company_id).execute()
        report["steps"].append({"step": "lease_flow", "ok": True, "details": lease_result})

        lease_check = run_lease_check(lease_result)
        report["steps"].append({"step": "lease_check", "ok": True, "details": lease_check})

    except Exception as exc:
        report["ok"] = False
        report["error"] = str(exc)
    finally:
        db.close()

    out_dir = Path(__file__).resolve().parents[1] / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "lease_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False, default=_json_default), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False, default=_json_default))


if __name__ == "__main__":
    main()