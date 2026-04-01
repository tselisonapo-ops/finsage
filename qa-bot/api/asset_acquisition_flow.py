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
        assert_true(bool(asset_id), "AssetAcquisitionFlow requires asset_id in state.")

        ref = f"{settings.test_prefix}-ACQ-{date.today().isoformat()}-{uuid4().hex[:6].upper()}"

        payload = {
            "reference": ref,
            "posting_date": date.today().isoformat(),
            "acquisition_date": date.today().isoformat(),
            "funding_source": "bank_cash",
            "bank_account_id": 1,   # replace if your real bank account id differs
            "amount": 1000.00,
        }

        res = self.client.post(
            ROUTES["asset_acquisitions"].format(asset_id=asset_id),
            json=payload,
        )
        assert_http_ok(res.status_code, res.text)

        data = self.client.safe_json(res) or {}
        assert_true(isinstance(data, dict), f"Acquisition create response was not JSON. Body: {res.text[:500]}")

        acq_id = data.get("id") or data.get("acquisition_id")
        assert_true(bool(acq_id), f"Acquisition create did not return id. Response: {data}")

        self.state["acq_id"] = int(acq_id)
        self.state["response"] = data

        logger.info("[%s] acq_id=%s asset_id=%s", self.name, acq_id, asset_id)
        return {"acq_id": int(acq_id), "response": data}

    def verify(self) -> None:
        super().verify()
        assert_true(bool(self.state.get("acq_id")), "Acquisition id missing after creation.")