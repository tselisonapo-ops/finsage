from __future__ import annotations

from datetime import date
from uuid import uuid4

from api.base_flow import BaseFlow
from config.routes import ROUTES
from config.settings import settings
from core.assertions import assert_http_ok, assert_true
from core.logger import logger


class AssetAcquisitionFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "asset_acquisition_flow"

    def run(self) -> dict:
        if settings.run_mode == "readonly":
            raise RuntimeError("AssetAcquisitionFlow cannot run in readonly mode.")

        asset_id = self.state.get("asset_id")
        assert_true(asset_id, "asset_id missing. Run AssetFlow first.")

        bank_account_id = self.state.get("bank_account_id")
        assert_true(bank_account_id, "bank_account_id missing. Run BankAccountFlow first.")

        ref = f"{settings.test_prefix}-ACQ-{date.today().isoformat()}-{uuid4().hex[:6].upper()}"

        payload = {
            "reference": ref,
            "acquisition_date": date.today().isoformat(),
            "posting_date": date.today().isoformat(),
            "available_for_use_date": date.today().isoformat(),

            # ✅ CORRECT: use created bank account
            "funding_source": "bank_cash",
            "bank_account_id": int(bank_account_id),

            "cost": 1000000.00,
            "amount": 1000000.00,
            "currency": settings.default_currency,
            "notes": f"QA bot acquisition {ref}",
        }

        logger.info("[%s] payload=%s", self.name, payload)

        res = self.client.post(
            ROUTES["asset_acquisitions"].format(asset_id=int(asset_id)),
            json=payload,
        )
        assert_http_ok(res.status_code, res.text)

        data = self.client.safe_json(res) or {}
        acq_id = data.get("id")

        assert_true(acq_id, f"Acquisition create failed. Response: {data}")

        self.state["acq_id"] = int(acq_id)
        self.state["acq_response"] = data

        logger.info("[%s] acq_id=%s asset_id=%s", self.name, acq_id, asset_id)
        return {"acq_id": int(acq_id), "response": data}

    def verify(self) -> None:
        super().verify()
        assert_true(self.state.get("acq_id"), "Acquisition id missing after creation.")