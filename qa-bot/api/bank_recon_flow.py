from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

from api.base_flow import BaseFlow
from config.routes import ROUTES
from core.assertions import assert_http_ok, assert_true
from core.logger import logger


class BankReconFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "bank_recon_flow"

    def _state_file(self) -> Path:
        return Path(__file__).resolve().parents[1] / "reports" / "bank_recon_state.json"

    def _load_last_period(self) -> tuple[str | None, str | None]:
        path = self._state_file()
        if not path.exists():
            return None, None

        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return data.get("period_start"), data.get("period_end")
        except Exception:
            return None, None

    def _save_last_period(self, period_start: str, period_end: str) -> None:
        path = self._state_file()
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "period_start": period_start,
            "period_end": period_end,
            "saved_at": date.today().isoformat(),
        }
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _next_period(self) -> tuple[str, str]:
        last_start, last_end = self._load_last_period()

        if last_end:
            prev_end = date.fromisoformat(last_end)
            next_start = prev_end + timedelta(days=1)
            next_end = next_start
            return next_start.isoformat(), next_end.isoformat()

        today = date.today()
        start = today - timedelta(days=1)
        end = today
        return start.isoformat(), end.isoformat()

    def _build_payload(self) -> dict:
        today = date.today()

        bank_account_id = (
            self.state.get("bank_account_id")
            or self.state.get("default_bank_account_id")
            or 1
        )

        statement_date = self.state.get("statement_date") or today.isoformat()

        period_start = self.state.get("period_start")
        period_end = self.state.get("period_end")

        if not period_start or not period_end:
            period_start, period_end = self._next_period()

        return {
            "statement_date": statement_date,
            "period_start": period_start,
            "period_end": period_end,
            "bank_account_id": bank_account_id,
            "notes": self.state.get("bank_recon_notes") or "QA bot bank reconciliation",
        }

    def run(self) -> dict:
        payload = self._build_payload()

        logger.info("[%s] posting bank recon payload=%s", self.name, payload)

        response = self.client.post(ROUTES["bank_reconciliations"], json=payload)
        assert_http_ok(response.status_code, response.text)

        data = self.client.safe_json(response) or {}
        assert_true(
            isinstance(data, dict),
            f"Bank recon response was not JSON. Body: {response.text[:500]}"
        )

        recon_id = (
            data.get("id")
            or data.get("recon_id")
            or data.get("reconciliation_id")
            or (data.get("data") or {}).get("id")
            or (data.get("data") or {}).get("reconciliation_id")
        )

        assert_true(bool(recon_id), f"Bank recon did not return reconciliation id. Response: {data}")

        self._save_last_period(payload["period_start"], payload["period_end"])

        self.state["recon_id"] = recon_id
        self.state["response"] = data
        self.state["request_payload"] = payload

        return {
            "recon_id": recon_id,
            "request_payload": payload,
            "response": data,
        }

    def verify(self) -> None:
        super().verify()
        recon_id = self.state.get("recon_id")
        response = self.state.get("response") or {}
        assert_true(bool(recon_id), f"Bank recon failed. Response: {response}")