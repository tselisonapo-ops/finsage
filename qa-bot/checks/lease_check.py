from __future__ import annotations

from core.assertions import assert_true


def run_lease_check(flow_result: dict) -> dict:
    response = flow_result.get("response") or {}
    lease_id = flow_result.get("lease_id")

    assert_true(
        bool(lease_id or response.get("ok") is True),
        f"Lease flow did not return a clear success outcome. Response: {response}"
    )

    return {
        "ok": True,
        "lease_id": lease_id,
    }