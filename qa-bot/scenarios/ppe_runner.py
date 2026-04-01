from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from api.asset_flow import AssetFlow
from api.depreciation_flow import DepreciationFlow
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
        "scenario": "ppe",
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

        asset_flow = AssetFlow(client=client, db=db, company_id=settings.company_id)
        asset_result = asset_flow.execute()
        report["steps"].append({"step": "asset_flow", "ok": True, "details": asset_result})

        dep_flow = DepreciationFlow(client=client, db=db, company_id=settings.company_id)
        dep_flow.state["asset_id"] = asset_result["asset_id"]
        dep_result = dep_flow.execute()
        report["steps"].append({"step": "depreciation_flow", "ok": True, "details": dep_result})

    except Exception as exc:
        report["ok"] = False
        report["error"] = str(exc)
    finally:
        db.close()

    out_dir = Path(__file__).resolve().parents[1] / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "ppe_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False, default=_json_default), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False, default=_json_default))


if __name__ == "__main__":
    main()