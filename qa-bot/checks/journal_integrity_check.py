from __future__ import annotations

from core.assertions import assert_balanced, assert_true
from core.db import DB


def run_journal_integrity_check(db: DB, company_id: int, journal_id: int) -> dict:
    journal = db.get_journal(company_id, journal_id)
    assert_true(journal is not None, f"Journal {journal_id} does not exist.")

    lines = db.get_journal_lines(company_id, journal_id)
    assert_true(len(lines) >= 2, f"Journal {journal_id} has fewer than 2 lines.")

    total_debit = sum(float(x.get("debit") or 0) for x in lines)
    total_credit = sum(float(x.get("credit") or 0) for x in lines)
    assert_balanced(total_debit, total_credit)

    return {
        "ok": True,
        "journal_id": journal_id,
        "line_count": len(lines),
        "total_debit": total_debit,
        "total_credit": total_credit,
        "status": journal.get("status"),
        "reference": journal.get("reference") or journal.get("journal_ref"),
    }