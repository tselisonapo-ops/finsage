from __future__ import annotations

from datetime import date

from api.base_flow import BaseFlow
from config.routes import ROUTES
from core.assertions import assert_http_ok, assert_true
from core.logger import logger


class LeasePaymentFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "lease_payment_flow"

    def run(self) -> dict:
        lease_id = self.state.get("lease_id")
        schedule_id = self.state.get("schedule_id")
        bank_account_id = self.state.get("bank_account_id")

        assert_true(bool(lease_id), "lease_id missing. Run LeaseFlow first.")
        assert_true(bool(schedule_id), "schedule_id missing. Run LeaseMonthlyDueFlow first.")
        assert_true(bool(bank_account_id), "bank_account_id missing. Run BankAccountFlow first.")

        payload = {
            "amount": 25000.0,
            "payment_date": date.today().isoformat(),
            "bank_account_id": int(bank_account_id),
            "schedule_id": int(schedule_id),
            "reference": f"LEASE-PAY-{lease_id}-{schedule_id}",
            "description": f"QA lease payment for lease {lease_id} schedule {schedule_id}",
        }

        logger.info("[%s] posting lease payment payload=%s", self.name, payload)

        res = self.client.post(
            ROUTES["lease_payments"].format(lease_id=int(lease_id)),
            json=payload,
        )
        assert_http_ok(res.status_code, res.text)

        data = self.client.safe_json(res) or {}
        assert_true(
            isinstance(data, dict),
            f"Lease payment response was not JSON. Body: {res.text[:500]}"
        )
        assert_true(
            data.get("ok") is True,
            f"Lease payment failed. Response: {data}"
        )

        journal_id = data.get("journal_id") or (data.get("data") or {}).get("journal_id")
        assert_true(
            bool(journal_id),
            f"Lease payment did not return journal_id. Response: {data}"
        )

        self.state["lease_id"] = int(lease_id)
        self.state["schedule_id"] = int(schedule_id)
        self.state["lease_payment_journal_id"] = int(journal_id)
        self.state["lease_payment_response"] = data

        logger.info(
            "[%s] lease_id=%s schedule_id=%s journal_id=%s",
            self.name,
            lease_id,
            schedule_id,
            journal_id,
        )

        return {
            "lease_id": int(lease_id),
            "schedule_id": int(schedule_id),
            "journal_id": int(journal_id),
            "response": data,
        }

    def verify(self) -> None:
        super().verify()
        assert_true(bool(self.state.get("lease_payment_journal_id")), "lease_payment_journal_id missing after payment.")
        