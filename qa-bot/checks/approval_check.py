from __future__ import annotations

from core.assertions import assert_true


def run_approval_check(flow_result: dict) -> dict:
    response = flow_result.get("response") or {}
    approval_id = flow_result.get("approval_id")

    assert_true(
        bool(approval_id or response.get("ok") is True),
        f"Approval flow did not return a clear success outcome. Response: {response}"
    )

    return {
        "ok": True,
        "approval_id": approval_id,
    }