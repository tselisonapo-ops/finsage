from __future__ import annotations

from api.base_flow import BaseFlow
from config.routes import ROUTES
from core.assertions import assert_http_ok, assert_true
from core.logger import logger


class LeasePostMonthFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "lease_post_month_flow"

    def run(self) -> dict:
        lease_id = self.state.get("lease_id")
        period_no = self.state.get("period_no")

        assert_true(bool(lease_id), "lease_id missing. Run LeaseFlow first.")
        assert_true(bool(period_no), "period_no missing. Run LeaseMonthlyDueFlow first.")

        logger.info("[%s] posting lease month lease_id=%s period_no=%s", self.name, lease_id, period_no)

        res = self.client.post(
            ROUTES["lease_post_month"].format(
                company_id=self.company_id,
                lease_id=int(lease_id),
                period_no=int(period_no),
            ),
            json={},
        )
        assert_http_ok(res.status_code, res.text)

        data = self.client.safe_json(res) or {}
        assert_true(isinstance(data, dict), f"Lease post month response was not JSON. Body: {res.text[:500]}")
        assert_true(data.get("ok") is True, f"Lease post month failed. Response: {data}")

        journal_id = data.get("journal_id")
        schedule_id = data.get("schedule_id")

        assert_true(bool(journal_id), f"Lease post month did not return journal_id. Response: {data}")
        assert_true(bool(schedule_id), f"Lease post month did not return schedule_id. Response: {data}")

        self.state["lease_monthly_journal_id"] = int(journal_id)
        self.state["lease_schedule_id"] = int(schedule_id)
        self.state["lease_post_month_response"] = data

        logger.info(
            "[%s] lease_id=%s period_no=%s journal_id=%s schedule_id=%s",
            self.name,
            lease_id,
            period_no,
            journal_id,
            schedule_id,
        )
        return {
            "lease_id": int(lease_id),
            "period_no": int(period_no),
            "journal_id": int(journal_id),
            "schedule_id": int(schedule_id),
            "response": data,
        }

    def verify(self) -> None:
        super().verify()
        assert_true(bool(self.state.get("lease_monthly_journal_id")), "lease_monthly_journal_id missing after posting.")