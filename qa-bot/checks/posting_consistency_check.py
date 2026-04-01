from __future__ import annotations

from core.assertions import assert_true
from core.db import DB


def run_posting_consistency_check(db: DB, company_id: int, journal_id: int) -> dict:
    journal = db.get_journal(company_id, journal_id)
    assert_true(journal is not None, f"Journal {journal_id} not found.")

    lines = db.get_journal_lines(company_id, journal_id)
    assert_true(bool(lines), f"Journal {journal_id} has no lines.")

    raw_status = journal.get("status")
    status = str(raw_status or "").strip().lower()

    # Some journals in your system may not populate status explicitly.
    acceptable_statuses = {"", "draft", "posted", "reversed"}

    assert_true(
        status in acceptable_statuses,
        f"Unexpected journal status: {status!r}"
    )

    return {
        "ok": True,
        "journal_id": journal_id,
        "status": status or None,
        "line_count": len(lines),
        "has_status": bool(status),
    }