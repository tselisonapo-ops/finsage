from __future__ import annotations

from datetime import date
from uuid import uuid4

from api.base_flow import BaseFlow
from config.routes import ROUTES
from config.settings import settings
from core.assertions import assert_http_ok, assert_true
from core.logger import logger


class AssetFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "asset_flow"

    def run(self) -> dict:
        if settings.run_mode == "readonly":
            raise RuntimeError("AssetFlow cannot run in readonly mode.")

        ref = f"{settings.test_prefix}-ASSET-{date.today().isoformat()}-{uuid4().hex[:6].upper()}"

        payload = {
            "name": f"QA PPE Asset {ref}",
            "entry_mode": "acquisition",

            # REQUIRED accounting fields
            "asset_class": "general",
            "depreciation_method": "straight_line",
            "useful_life_months": 60,   # 5 years
            "residual_value": 0.0,

            # optional but good practice
            "currency": settings.default_currency,
        }

        res = self.client.post(ROUTES["assets"], json=payload)
        assert_http_ok(res.status_code, res.text)

        data = self.client.safe_json(res) or {}
        assert_true(isinstance(data, dict), f"Asset create response was not JSON. Body: {res.text[:500]}")

        asset_id = data.get("id") or data.get("asset_id")
        assert_true(bool(asset_id), f"Asset create did not return asset id. Response: {data}")

        self.state["asset_id"] = int(asset_id)
        self.state["response"] = data

        logger.info("[%s] asset_id=%s", self.name, asset_id)
        return {"asset_id": int(asset_id), "response": data}

    def verify(self) -> None:
        super().verify()
        assert_true(bool(self.state.get("asset_id")), "Asset id missing after creation.")