from __future__ import annotations

from core.assertions import assert_true


def run_bill_check(flow_result: dict) -> dict:
    response = flow_result.get("response") or {}
    bill_id = flow_result.get("bill_id")

    acceptable = bool(
        bill_id
        or response.get("ok") is True
        or response.get("approval_required")
        or response.get("requires_approval")
    )

    assert_true(
        acceptable,
        f"Bill did not return a clear success outcome. Response: {response}"
    )

    return {
        "ok": True,
        "bill_id": bill_id,
        "approval_required": bool(
            response.get("approval_required") or response.get("requires_approval")
        ),
        "posted": bool(response.get("posted")),
    }