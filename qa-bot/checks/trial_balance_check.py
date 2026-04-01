from __future__ import annotations

from core.assertions import assert_balanced
from core.db import DB


def run_trial_balance_check(db: DB, company_id: int) -> dict:
    tb = db.trial_balance_totals(company_id)
    total_debit = float(tb.get("total_debit") or 0)
    total_credit = float(tb.get("total_credit") or 0)

    assert_balanced(total_debit, total_credit)

    return {
        "ok": True,
        "company_id": company_id,
        "total_debit": total_debit,
        "total_credit": total_credit,
    }