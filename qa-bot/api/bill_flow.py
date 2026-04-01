from __future__ import annotations

from datetime import date
from uuid import uuid4

from api.base_flow import BaseFlow
from config.routes import ROUTES
from config.settings import settings
from core.assertions import assert_http_ok, assert_true
from core.logger import logger


class BillFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "bill_flow"

    def run(self) -> dict:
        if settings.run_mode == "readonly":
            raise RuntimeError("BillFlow cannot run in readonly mode.")

        ref = f"{settings.test_prefix}-BILL-{date.today().isoformat()}-{uuid4().hex[:6].upper()}"

        payload = {
            "vendor_id": settings.test_vendor_id,
            "supplier_id": settings.test_vendor_id,
            "bill_date": date.today().isoformat(),
            "due_date": date.today().isoformat(),
            "currency": settings.default_currency,
            "notes": f"QA bot bill {ref}",
            "status": "draft",
            "lines": [
                {
                    "description": "QA bot bill line",
                    "account_code": "PL_OPEX_6500",
                    "quantity": 1,
                    "unit_price": 110000.00,
                    "discount_amount": 0.00,
                    "vat_code": "STANDARD",
                }
            ],
        }

        response = self.client.post(ROUTES["bills"], json=payload)
        assert_http_ok(response.status_code, response.text)

        data = self.client.safe_json(response) or {}
        assert_true(isinstance(data, dict), f"Bill create response was not JSON. Body: {response.text[:500]}")

        bill_id = (
            data.get("id")
            or data.get("bill_id")
            or (data.get("data") or {}).get("id")
            or (data.get("data") or {}).get("bill_id")
        )

        self.state["reference"] = ref
        self.state["response"] = data
        self.state["bill_id"] = bill_id

        logger.info("[%s] bill_id=%s", self.name, bill_id)

        return {
            "bill_id": bill_id,
            "reference": ref,
            "response": data,
        }

    def verify(self) -> None:
        super().verify()
        response = self.state.get("response") or {}
        bill_id = self.state.get("bill_id")

        acceptable = bool(
            bill_id
            or response.get("ok") is True
            or response.get("approval_required")
            or response.get("requires_approval")
        )

        assert_true(
            acceptable,
            f"Bill flow did not return a clear success outcome. Response: {response}"
        )