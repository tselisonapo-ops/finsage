from __future__ import annotations

from datetime import date

from api.base_flow import BaseFlow
from config.routes import ROUTES
from core.assertions import assert_http_ok, assert_true
from core.logger import logger


class LeaseMonthlyDueFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "lease_monthly_due_flow"

    def run(self) -> dict:
        lease_id = self.state.get("lease_id")
        assert_true(bool(lease_id), "lease_id missing. Run LeaseFlow first.")

        params = {
            "as_of": date.today().isoformat(),
        }

        logger.info("[%s] fetching lease monthly due params=%s", self.name, params)

        res = self.client.get(
            ROUTES["lease_monthly_due"],
            params=params,
        )
        assert_http_ok(res.status_code, res.text)

        data = self.client.safe_json(res) or {}
        assert_true(
            isinstance(data, dict),
            f"Lease monthly due response was not JSON. Body: {res.text[:500]}"
        )
        assert_true(
            data.get("ok") is True,
            f"Lease monthly due failed. Response: {data}"
        )

        due_rows = data.get("due") or []
        assert_true(isinstance(due_rows, list), f"'due' must be a list. Response: {data}")

        matched = None
        for row in due_rows:
            if int(row.get("lease_id") or 0) == int(lease_id):
                matched = row
                break

        assert_true(bool(matched), f"No due monthly row found for lease_id={lease_id}. Response: {data}")

        period_no = matched.get("period_no")
        assert_true(bool(period_no), f"Matched due row missing period_no. Row: {matched}")

        self.state["lease_id"] = int(lease_id)
        self.state["lease_due_row"] = matched
        self.state["period_no"] = int(period_no)
        self.state["lease_monthly_due_response"] = data

        logger.info("[%s] lease_id=%s period_no=%s", self.name, lease_id, period_no)
        return {
            "lease_id": int(lease_id),
            "period_no": int(period_no),
            "due_row": matched,
            "response": data,
        }

    def verify(self) -> None:
        super().verify()
        assert_true(bool(self.state.get("lease_id")), "lease_id missing after monthly due lookup.")
        assert_true(bool(self.state.get("period_no")), "period_no missing after monthly due lookup.")