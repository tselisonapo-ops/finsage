from __future__ import annotations

from api.base_flow import BaseFlow
from config.routes import ROUTES
from core.assertions import assert_http_ok, assert_true
from core.logger import logger


class DepreciationPostFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "depreciation_post_flow"

    def run(self) -> dict:
        dep_id = self.state.get("dep_id")
        assert_true(bool(dep_id), "DepreciationPostFlow requires dep_id in state.")

        res = self.client.post(
            ROUTES["depreciation_post"].format(dep_id=dep_id)
        )

        if res.status_code == 409:
            data = self.client.safe_json(res) or {}
            self.state["response"] = data
            self.state["approval_required"] = True
            logger.info("[%s] dep_id=%s approval required", self.name, dep_id)
            return {
                "dep_id": dep_id,
                "status": "approval_required",
                "response": data,
            }

        assert_http_ok(res.status_code, res.text)

        data = self.client.safe_json(res) or {}
        assert_true(isinstance(data, dict), f"Depreciation post response was not JSON. Body: {res.text[:500]}")

        posted_journal_id = data.get("posted_journal_id")
        self.state["posted_journal_id"] = posted_journal_id
        self.state["response"] = data

        logger.info("[%s] dep_id=%s posted_journal_id=%s", self.name, dep_id, posted_journal_id)
        return {
            "dep_id": dep_id,
            "posted_journal_id": posted_journal_id,
            "response": data,
        }

    def verify(self) -> None:
        super().verify()
        response = self.state.get("response") or {}
        approval_required = bool(self.state.get("approval_required"))
        posted_journal_id = self.state.get("posted_journal_id")

        acceptable = bool(
            approval_required
            or posted_journal_id
            or response.get("ok") is True
        )

        assert_true(
            acceptable,
            f"Depreciation post did not return a clear success outcome. Response: {response}"
        )