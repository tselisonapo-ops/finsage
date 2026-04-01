from __future__ import annotations

from core.assertions import assert_true
from core.db import DB


def run_posting_consistency_check(db: DB, company_id: int, journal_id: int) -> dict:
    journal = db.get_journal(company_id, journal_id)
    assert_true(journal is not None, f"Journal {journal_id} not found.")

    lines = db.get_journal_lines(company_id, journal_id)
    assert_true(bool(lines), f"Journal {journal_id} has no lines.")

    status = str(journal.get("status") or "").strip().lower()
    assert_true(status in {"draft", "posted", "reversed"}, f"Unexpected journal status: {status!r}")

    # Expand this later with posted_at, source validation, GL impact checks, etc.
    return {
        "ok": True,
        "journal_id": journal_id,
        "status": status,
        "line_count": len(lines),
    }