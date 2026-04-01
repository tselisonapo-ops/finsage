from __future__ import annotations

import json
from pathlib import Path

from config.settings import settings


def main() -> None:
    report = {
        "ok": True,
        "scenario": "ap",
        "run_mode": settings.run_mode,
        "company_id": settings.company_id,
        "steps": [
            {
                "step": "ap_runner",
                "ok": True,
                "details": {"message": "AP flows not wired yet"},
            }
        ],
    }

    out_dir = Path(__file__).resolve().parents[1] / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "ap_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()