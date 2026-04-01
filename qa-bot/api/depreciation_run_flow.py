from __future__ import annotations

from datetime import date

from api.base_flow import BaseFlow
from config.routes import ROUTES
from core.assertions import assert_http_ok, assert_true
from core.logger import logger


class DepreciationRunFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "depreciation_run_flow"

    def run(self) -> dict:
        period_start = date.today().replace(day=1).isoformat()
        period_end = date.today().isoformat()

        payload = {
            "period_start": period_start,
            "period_end": period_end,
        }

        res = self.client.post(ROUTES["depreciation_run"], json=payload)
        assert_http_ok(res.status_code, res.text)

        data = self.client.safe_json(res) or {}
        assert_true(isinstance(data, dict), f"Depreciation run response was not JSON. Body: {res.text[:500]}")

        ids = data.get("created_ids") or []
        dep_id = ids[0] if ids else None

        self.state["dep_id"] = dep_id
        self.state["response"] = data

        logger.info("[%s] created_ids=%s dep_id=%s", self.name, ids, dep_id)
        return {
            "created_ids": ids,
            "dep_id": dep_id,
            "response": data,
        }

    def verify(self) -> None:
        super().verify()
        response = self.state.get("response") or {}
        ids = response.get("created_ids") or []
        assert_true(isinstance(ids, list), f"Depreciation run did not return created_ids list. Response: {response}")