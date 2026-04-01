from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

from api.base_flow import BaseFlow
from config.routes import ROUTES
from config.settings import settings
from core.assertions import assert_http_ok, assert_true
from core.logger import logger


class LeaseFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "lease_flow"

    def run(self) -> dict:
        if settings.run_mode == "readonly":
            raise RuntimeError("LeaseFlow cannot run in readonly mode.")

        start_date = date.today()
        end_date = start_date + timedelta(days=365 * 3)

        ref = f"{settings.test_prefix}-LEASE-{start_date.isoformat()}-{uuid4().hex[:6].upper()}"

        payload = {
            # core lease fields
            "lease_name": f"QA Lease Inception {ref}",
            "role": "lessee",
            "wizard_mode": "inception",

            # term
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),

            # payment terms
            "payment_amount": 25000.00,
            "payment_frequency": "monthly",
            "payment_timing": "arrears",
            "annual_rate": 12.0,

            # optional economics
            "initial_direct_costs": 0.0,
            "residual_value": 0.0,
            "vat_rate": 0.0,

            # COA mappings
            "rou_asset_account": "BS_NCA_1610",
            "lease_liability_current_account": "BS_CL_2610",
            "lease_liability_non_current_account": "BS_NCL_2620",
            "interest_expense_account": "PL_OPEX_6029",
            "depreciation_expense_account": "PL_OPEX_6018",

            # reference / parties
            "reference": ref,
            "lessor_id": 1,  # existing lessor supplied by you
            "notes": f"QA bot lease inception {ref}",
        }

        logger.info("[%s] creating lease payload=%s", self.name, payload)

        response = self.client.post(
            ROUTES["leases"].format(company_id=self.company_id),
            json=payload,
        )
        assert_http_ok(response.status_code, response.text)

        data = self.client.safe_json(response) or {}
        assert_true(isinstance(data, dict), f"Lease create response was not JSON. Body: {response.text[:500]}")

        lease_id = (
            data.get("id")
            or data.get("lease_id")
            or (data.get("data") or {}).get("id")
            or (data.get("data") or {}).get("lease_id")
        )
        assert_true(bool(lease_id), f"Lease create did not return lease_id. Response: {data}")

        self.state["lease_id"] = int(lease_id)
        self.state["response"] = data
        self.state["reference"] = ref

        logger.info("[%s] lease_id=%s ref=%s", self.name, lease_id, ref)
        return {
            "lease_id": int(lease_id),
            "reference": ref,
            "response": data,
        }

    def verify(self) -> None:
        super().verify()
        lease_id = self.state.get("lease_id")
        assert_true(bool(lease_id), "Lease id missing after creation.")