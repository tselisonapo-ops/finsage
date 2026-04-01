from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from config.settings import settings


SCENARIOS = [
    "smoke_runner.py",
    "ar_runner.py",
    "ap_runner.py",
    "banking_runner.py",
    "lease_runner.py",
    "approvals_runner.py",
]


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    results = []

    for script in SCENARIOS:
        script_path = base_dir / script
        proc = subprocess.run([sys.executable, str(script_path)], capture_output=True, text=True)
        results.append({
            "script": script,
            "returncode": proc.returncode,
            "stdout": proc.stdout[-4000:],
            "stderr": proc.stderr[-4000:],
            "ok": proc.returncode == 0,
        })

    report = {
        "ok": all(x["ok"] for x in results),
        "scenario": "full_regression",
        "run_mode": settings.run_mode,
        "company_id": settings.company_id,
        "results": results,
    }

    out_dir = Path(__file__).resolve().parents[1] / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "full_regression_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()