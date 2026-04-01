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


def run_lease_monthly_due_check(flow_result: dict) -> dict:
    response = flow_result.get("response") or {}
    lease_id = flow_result.get("lease_id")
    period_no = flow_result.get("period_no")
    due_row = flow_result.get("due_row") or {}
    amounts = due_row.get("amounts") or {}

    assert_true(
        response.get("ok") is True,
        f"Lease monthly due did not return ok=True. Response: {response}"
    )
    assert_true(
        bool(lease_id),
        f"Lease monthly due did not return lease_id. Response: {response}"
    )
    assert_true(
        bool(period_no),
        f"Lease monthly due did not return period_no. Response: {response}"
    )
    assert_true(
        isinstance(due_row, dict) and bool(due_row),
        f"Lease monthly due did not return a due_row. Response: {response}"
    )
    assert_true(
        int(due_row.get("lease_id") or 0) == int(lease_id),
        f"Lease monthly due returned wrong lease row. due_row={due_row}"
    )
    assert_true(
        int(due_row.get("period_no") or 0) == int(period_no),
        f"Lease monthly due returned mismatched period. due_row={due_row}"
    )
    assert_true(
        isinstance(amounts, dict) and bool(amounts),
        f"Lease monthly due row missing amounts. due_row={due_row}"
    )
    assert_true(
        float(amounts.get("payment") or 0) >= 0,
        f"Lease monthly due row has invalid payment amount. due_row={due_row}"
    )

    return {
        "ok": True,
        "lease_id": lease_id,
        "period_no": period_no,
        "due_row": due_row,
    }


def run_lease_post_month_check(flow_result: dict) -> dict:
    response = flow_result.get("response") or {}
    lease_id = flow_result.get("lease_id")
    period_no = flow_result.get("period_no")
    journal_id = flow_result.get("journal_id")
    schedule_id = flow_result.get("schedule_id")

    assert_true(
        response.get("ok") is True,
        f"Lease post month did not return ok=True. Response: {response}"
    )
    assert_true(
        bool(lease_id),
        f"Lease post month did not return lease_id. Response: {response}"
    )
    assert_true(
        bool(period_no),
        f"Lease post month did not return period_no. Response: {response}"
    )
    assert_true(
        bool(journal_id),
        f"Lease post month did not return journal_id. Response: {response}"
    )
    assert_true(
        bool(schedule_id),
        f"Lease post month did not return schedule_id. Response: {response}"
    )
    assert_true(
        int(journal_id) > 0,
        f"Lease post month returned invalid journal_id. Response: {response}"
    )
    assert_true(
        int(schedule_id) > 0,
        f"Lease post month returned invalid schedule_id. Response: {response}"
    )

    return {
        "ok": True,
        "lease_id": lease_id,
        "period_no": period_no,
        "journal_id": journal_id,
        "schedule_id": schedule_id,
    }