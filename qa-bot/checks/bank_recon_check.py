from __future__ import annotations

from core.assertions import assert_true


def run_bank_recon_check(flow_result: dict) -> dict:
    response = flow_result.get("response") or {}
    recon_id = flow_result.get("recon_id")

    assert_true(
        bool(recon_id or response.get("ok") is True),
        f"Bank reconciliation did not return a clear success outcome. Response: {response}"
    )

    return {
        "ok": True,
        "recon_id": recon_id,
    }