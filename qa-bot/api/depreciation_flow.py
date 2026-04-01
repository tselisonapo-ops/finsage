from __future__ import annotations

from datetime import date

from api.base_flow import BaseFlow
from config.routes import ROUTES
from core.assertions import assert_http_ok, assert_true


class DepreciationFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "depreciation_flow"

    def run(self) -> dict:
        asset_id = self.state.get("asset_id")
        assert_true(bool(asset_id), "DepreciationFlow requires asset_id in state.")

        payload = {
            "asset_id": asset_id,
            "date": date.today().isoformat(),
        }

        response = self.client.post(ROUTES["asset_depreciation"], json=payload)
        assert_http_ok(response.status_code, response.text)

        data = self.client.safe_json(response) or {}
        assert_true(isinstance(data, dict), f"Depreciation response was not JSON. Body: {response.text[:500]}")

        dep_id = (
            data.get("id")
            or data.get("depreciation_id")
            or (data.get("data") or {}).get("id")
            or (data.get("data") or {}).get("depreciation_id")
        )

        self.state["depreciation_id"] = dep_id
        self.state["response"] = data

        return {
            "depreciation_id": dep_id,
            "response": data,
        }

    def verify(self) -> None:
        super().verify()
        response = self.state.get("response") or {}
        dep_id = self.state.get("depreciation_id")

        acceptable = bool(
            dep_id
            or response.get("ok") is True
            or response.get("approval_required")
            or response.get("requires_approval")
        )

        assert_true(acceptable, f"Depreciation did not return a clear success outcome. Response: {response}")