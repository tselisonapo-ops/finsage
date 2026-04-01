from __future__ import annotations

from core.assertions import assert_true


def run_invoice_check(flow_result: dict) -> dict:
    response = flow_result.get("response") or {}
    invoice_id = flow_result.get("invoice_id")
    status = str(flow_result.get("status") or "").strip().lower()
    posted_journal_id = flow_result.get("posted_journal_id")

    assert_true(bool(invoice_id), f"Invoice id missing. Response: {response}")

    acceptable_statuses = {"draft", "pending_approval", "approved", "posted"}
    assert_true(
        status in acceptable_statuses,
        f"Unexpected invoice status {status!r}. Response: {response}"
    )

    return {
        "ok": True,
        "invoice_id": invoice_id,
        "status": status,
        "posted_journal_id": posted_journal_id,
        "auto_posted": bool(posted_journal_id or status == "posted"),
    }