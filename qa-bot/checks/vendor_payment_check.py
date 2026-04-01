from __future__ import annotations

from core.assertions import assert_true


def run_vendor_payment_check(flow_result: dict) -> dict:
    response = flow_result.get("response") or {}
    payment_id = flow_result.get("payment_id")

    acceptable = bool(
        payment_id
        or response.get("ok") is True
        or response.get("approval_required")
        or response.get("requires_approval")
    )

    assert_true(
        acceptable,
        f"Vendor payment did not return a clear success outcome. Response: {response}"
    )

    return {
        "ok": True,
        "payment_id": payment_id,
        "approval_required": bool(
            response.get("approval_required") or response.get("requires_approval")
        ),
    }