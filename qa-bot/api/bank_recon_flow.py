from __future__ import annotations

from datetime import date

from api.base_flow import BaseFlow
from config.routes import ROUTES
from core.assertions import assert_http_ok, assert_true
from core.logger import logger


class BankReconFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "bank_recon_flow"

    def _build_payload(self) -> dict:
        today = date.today()

        bank_account_id = (
            self.state.get("bank_account_id")
            or self.state.get("default_bank_account_id")
            or 1
        )

        period_start = self.state.get("period_start") or today.replace(day=1).isoformat()
        period_end = self.state.get("period_end") or today.isoformat()
        statement_date = self.state.get("statement_date") or today.isoformat()

        payload = {
            "statement_date": statement_date,
            "period_start": period_start,
            "period_end": period_end,
            "bank_account_id": bank_account_id,
            "notes": self.state.get("bank_recon_notes") or "QA bot bank reconciliation",
        }

        return payload

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
            or (data.get("data") or {}).get("id")
            or (data.get("data") or {}).get("recon_id")
        )

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
        assert_true(
            bool(recon_id or response.get("ok") is True),
            f"Bank recon failed. Response: {response}"
        )