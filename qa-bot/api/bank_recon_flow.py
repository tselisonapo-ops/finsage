from __future__ import annotations

from datetime import date

from api.base_flow import BaseFlow
from config.routes import ROUTES
from core.assertions import assert_http_ok, assert_true


class BankReconFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "bank_recon_flow"

    def run(self) -> dict:
        payload = {
            "statement_date": date.today().isoformat(),
            "bank_account_id": 1,  # ✅ FIXED
            "notes": "QA bot bank reconciliation",
        }

        response = self.client.post(ROUTES["bank_reconciliations"], json=payload)
        assert_http_ok(response.status_code, response.text)

        data = self.client.safe_json(response) or {}
        assert_true(isinstance(data, dict), f"Bank recon response was not JSON. Body: {response.text[:500]}")

        recon_id = (
            data.get("id")
            or data.get("recon_id")
            or (data.get("data") or {}).get("id")
        )

        self.state["recon_id"] = recon_id
        self.state["response"] = data

        return {"recon_id": recon_id, "response": data}
    
    def verify(self) -> None:
        super().verify()
        recon_id = self.state.get("recon_id")
        response = self.state.get("response") or {}
        assert_true(bool(recon_id or response.get("ok") is True), f"Bank recon failed. Response: {response}")