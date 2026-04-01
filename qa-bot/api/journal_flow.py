from __future__ import annotations

from datetime import date
from uuid import uuid4

from api.base_flow import BaseFlow
from config.routes import ROUTES
from config.settings import settings
from core.assertions import assert_balanced, assert_http_ok, assert_true
from core.logger import logger


class JournalFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "journal_flow"

    def run(self) -> dict:
        if settings.run_mode == "readonly":
            raise RuntimeError("JournalFlow cannot run in readonly mode.")

        ref = f"{settings.test_prefix}-JRN-{date.today().isoformat()}-{uuid4().hex[:6].upper()}"

        payload = {
            "date": date.today().isoformat(),
            "ref": ref,
            "description": "QA bot smoke journal - multi expense shape",
            "source": "manual",
            "source_id": None,
            "gross_amount": 100000.00,
            "net_amount": 100000.00,
            "vat_amount": 0.00,
            "currency": settings.default_currency,
            "lines": [
                {
                    "account_code": "PL_OPEX_6200",
                    "description": "QA bot salaries expense",
                    "debit": 540000.00,
                    "credit": 0.00,
                },
                {
                    "account_code": "PL_OPEX_6300",
                    "description": "QA bot utilities expense",
                    "debit": 15000.00,
                    "credit": 0.00,
                },
                {
                    "account_code": "PL_OPEX_6710",
                    "description": "QA bot professional fees expense",
                    "debit": 180000.00,
                    "credit": 0.00,
                },
                {
                    "account_code": "PL_OPEX_6720",
                    "description": "QA bot office supplies expense",
                    "debit": 12000.00,
                    "credit": 0.00,
                },
                {
                    "account_code": "PL_OPEX_6105",
                    "description": "QA bot bank charges expense",
                    "debit": 10000.00,
                    "credit": 0.00,
                },
                {
                    "account_code": "BS_CA_1000",
                    "description": "QA bot cash/bank credit line",
                    "debit": 0.00,
                    "credit": 100000.00,
                },
            ],
        }

        response = self.client.post(ROUTES["journals"], json=payload)
        assert_http_ok(response.status_code, response.text)

        data = self.client.safe_json(response) or {}
        if not isinstance(data, dict):
            raise AssertionError("Journal create response was not a JSON object.")

        journal_id = data.get("journal_id")

        assert_true(bool(journal_id), f"Journal create response did not return journal_id. Response: {data}")

        self.state["reference"] = ref
        self.state["journal_id"] = int(journal_id)

        logger.info("[%s] created journal_id=%s ref=%s", self.name, journal_id, ref)
        return {"journal_id": int(journal_id), "reference": ref}

    def verify(self) -> None:
        super().verify()

        journal_id = self.state["journal_id"]
        journal = self.db.get_journal(self.company_id, journal_id)
        assert_true(journal is not None, f"Journal {journal_id} not found in DB.")

        lines = self.db.get_journal_lines(self.company_id, journal_id)
        assert_true(len(lines) >= 2, "Journal must have at least 2 lines.")

        total_debit = sum(float(x.get("debit") or 0) for x in lines)
        total_credit = sum(float(x.get("credit") or 0) for x in lines)
        assert_balanced(total_debit, total_credit)