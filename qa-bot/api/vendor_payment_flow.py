from __future__ import annotations

from datetime import date
from uuid import uuid4

from api.base_flow import BaseFlow
from config.routes import ROUTES
from config.settings import settings
from core.assertions import assert_http_ok, assert_true
from core.logger import logger


class VendorFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "vendor_flow"

    def run(self) -> dict:
        if settings.run_mode == "readonly":
            raise RuntimeError("VendorFlow cannot run in readonly mode.")

        ref = f"{settings.test_prefix}-VENDOR-{date.today().isoformat()}-{uuid4().hex[:6].upper()}"

        payload = {
            "name": f"QA Bot Vendor {ref}",
            "email": f"{ref.lower()}@example.com",
            "phone": "+27 10 555 0000",
            "currency": settings.default_currency,
            "payment_terms": "Net 30",
            "country": "SOUTH AFRICA",
            "is_active": True,
        }

        response = self.client.post(ROUTES["vendors"], json=payload)
        assert_http_ok(response.status_code, response.text)

        data = self.client.safe_json(response) or {}
        assert_true(isinstance(data, dict), f"Vendor create response was not JSON. Body: {response.text[:500]}")

        vendor_id = (
            data.get("id")
            or data.get("vendor_id")
            or (data.get("data") or {}).get("id")
            or (data.get("data") or {}).get("vendor_id")
        )

        self.state["vendor_id"] = vendor_id
        self.state["response"] = data

        return {
            "vendor_id": vendor_id,
            "response": data,
        }

    def verify(self) -> None:
        super().verify()
        vendor_id = self.state.get("vendor_id")
        response = self.state.get("response") or {}
        assert_true(bool(vendor_id or response.get("ok") is True), f"Vendor create did not succeed. Response: {response}")