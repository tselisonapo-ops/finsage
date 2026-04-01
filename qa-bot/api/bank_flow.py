from __future__ import annotations

from datetime import date
from uuid import uuid4

from api.base_flow import BaseFlow
from config.routes import ROUTES
from config.settings import settings
from core.assertions import assert_http_ok, assert_true
from core.logger import logger


class BankAccountFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "bank_account_flow"

    def run(self) -> dict:
        if settings.run_mode == "readonly":
            raise RuntimeError("BankAccountFlow cannot run in readonly mode.")

        ref = f"{settings.test_prefix}-BANK-{date.today().isoformat()}-{uuid4().hex[:6].upper()}"

        payload = {
            "name": f"QA Bot Bank {ref}",
            "account_name": f"QA Bot Bank {ref}",
            "account_number": f"QA{uuid4().hex[:10].upper()}",
            "bank_name": "FNB",
            "branch_code": "250655",
            "account_type": "current",
            "currency": settings.default_currency,
            "is_active": True,
        }

        logger.info("[%s] creating bank account payload=%s", self.name, payload)

        res = self.client.post(ROUTES["bank_accounts"], json=payload)
        assert_http_ok(res.status_code, res.text)

        data = self.client.safe_json(res) or {}
        assert_true(isinstance(data, dict), f"Bank account create response was not JSON. Body: {res.text[:500]}")

        bank_id = (
            data.get("id")
            or data.get("bank_account_id")
            or (data.get("data") or {}).get("id")
            or (data.get("data") or {}).get("bank_account_id")
        )
        assert_true(bool(bank_id), f"Bank account not created. Response: {data}")

        self.state["bank_account_id"] = int(bank_id)
        self.state["bank_account_response"] = data

        logger.info("[%s] bank_account_id=%s", self.name, bank_id)
        return {"bank_account_id": int(bank_id), "response": data}

    def verify(self) -> None:
        super().verify()
        assert_true(bool(self.state.get("bank_account_id")), "Bank account id missing after creation.")