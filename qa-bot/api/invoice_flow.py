from __future__ import annotations

from datetime import date
from uuid import uuid4

from api.base_flow import BaseFlow
from config.routes import ROUTES
from config.settings import settings
from core.assertions import assert_http_ok, assert_true
from core.logger import logger


class InvoiceFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "invoice_flow"

    def run(self) -> dict:
        if settings.run_mode == "readonly":
            raise RuntimeError("InvoiceFlow cannot run in readonly mode.")

        ref = f"{settings.test_prefix}-INV-{date.today().isoformat()}-{uuid4().hex[:6].upper()}"

        payload = {
            "customer_id": 4,  # replace with a real test customer id
            "invoice_date": date.today().isoformat(),
            "due_date": date.today().isoformat(),
            "currency": settings.default_currency,
            "notes": f"QA bot invoice {ref}",
            "status": "draft",
            "lines": [
                {
                    "item_type": "gl",
                    "description": "QA bot invoice line",
                    "account_code": "PL_REV_4100",  # replace with a valid revenue/income account
                    "quantity": 1,
                    "unit_price": 100.00,
                    "discount_amount": 0.00,
                    "vat_code": "STANDARD",  # use ZERO for no VAT, STANDARD for output VAT
                }
            ],
        }

        response = self.client.post(ROUTES["invoices"], json=payload)
        assert_http_ok(response.status_code, response.text)

        data = self.client.safe_json(response) or {}
        assert_true(isinstance(data, dict), f"Invoice create response was not JSON. Body: {response.text[:500]}")

        invoice_id = (
            data.get("id")
            or data.get("invoice_id")
            or (data.get("data") or {}).get("id")
            or (data.get("data") or {}).get("invoice_id")
        )

        posted_journal_id = (
            data.get("_posted_journal_id")
            or data.get("posted_journal_id")
            or (data.get("data") or {}).get("_posted_journal_id")
            or (data.get("data") or {}).get("posted_journal_id")
        )

        status = str(data.get("status") or "").strip().lower()

        self.state["reference"] = ref
        self.state["response"] = data
        self.state["invoice_id"] = invoice_id
        self.state["posted_journal_id"] = posted_journal_id
        self.state["status"] = status

        logger.info("[%s] invoice_id=%s status=%s posted_journal_id=%s", self.name, invoice_id, status, posted_journal_id)

        return {
            "invoice_id": invoice_id,
            "reference": ref,
            "status": status,
            "posted_journal_id": posted_journal_id,
            "response": data,
        }

    def verify(self) -> None:
        super().verify()

        response = self.state.get("response") or {}
        invoice_id = self.state.get("invoice_id")
        status = self.state.get("status") or ""

        assert_true(bool(invoice_id), f"Invoice create did not return an invoice id. Response: {response}")

        acceptable_statuses = {"draft", "pending_approval", "approved", "posted"}
        assert_true(
            status in acceptable_statuses,
            f"Unexpected invoice status {status!r}. Response: {response}"
        )