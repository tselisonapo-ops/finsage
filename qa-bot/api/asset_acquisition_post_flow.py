from __future__ import annotations

from api.base_flow import BaseFlow
from config.routes import ROUTES
from core.assertions import assert_http_ok, assert_true
from core.logger import logger


class AssetAcquisitionPostFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "asset_acquisition_post_flow"

    def run(self) -> dict:
        acq_id = self.state.get("acq_id")
        assert_true(bool(acq_id), "AssetAcquisitionPostFlow requires acq_id in state.")

        res = self.client.post(
            ROUTES["post_acquisition"].format(acq_id=acq_id)
        )
        assert_http_ok(res.status_code, res.text)

        data = self.client.safe_json(res) or {}
        assert_true(isinstance(data, dict), f"Acquisition post response was not JSON. Body: {res.text[:500]}")

        posted_journal_id = data.get("posted_journal_id")
        self.state["posted_journal_id"] = posted_journal_id
        self.state["response"] = data

        logger.info("[%s] acq_id=%s posted_journal_id=%s", self.name, acq_id, posted_journal_id)
        return {
            "acq_id": int(acq_id),
            "posted_journal_id": posted_journal_id,
            "response": data,
        }

    def verify(self) -> None:
        super().verify()
        response = self.state.get("response") or {}
        assert_true(
            bool(response.get("ok") is True or self.state.get("posted_journal_id")),
            f"Acquisition post did not return a clear success outcome. Response: {response}"
        )