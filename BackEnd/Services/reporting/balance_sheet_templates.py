# BackEnd/Services/reporting/balance_sheet_templates.py
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional
from BackEnd.Services.company_context import get_company_context
from BackEnd.Services.reporting.balance_sheet_builder_v3 import build_balance_sheet_v3

__all__ = [
    "get_balance_sheet_v3_exact",
]


from datetime import timedelta

def get_balance_sheet_v3_exact(
    *,
    db,
    company_id: int,
    as_of: date,
    date_from: Optional[date] = None,
    prior_as_of: Optional[date] = None,
    comparison_as_of_dates: Optional[List[date]] = None,
    compare: str = "none",
    comparison_years: int = 1,
    view: str = "external",
    basis: str = "external",
    include_net_profit_line: bool = False,
    ctx: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:

    ctx = ctx or get_company_context(db, company_id)

    compare = (compare or "none").lower()
    if compare not in ("none", "prior_period", "prior_year", "multi_year"):
        compare = "none"

    try:
        comparison_years = int(comparison_years or 1)
    except Exception:
        comparison_years = 1

    comparison_years = max(1, min(comparison_years, 10))

    # --------------------------------------------------
    # Build comparison dates
    # --------------------------------------------------
    if comparison_as_of_dates is None:
        comparison_as_of_dates = [as_of]

        if compare == "multi_year":
            for i in range(1, comparison_years):
                try:
                    comparison_as_of_dates.append(as_of.replace(year=as_of.year - i))
                except ValueError:
                    comparison_as_of_dates.append(as_of.replace(year=as_of.year - i, day=28))

        elif compare != "none":
            if prior_as_of is None:
                if compare == "prior_year":
                    try:
                        prior_as_of = as_of.replace(year=as_of.year - 1)
                    except ValueError:
                        prior_as_of = as_of.replace(year=as_of.year - 1, day=28)

                elif compare == "prior_period":
                    prior_as_of = as_of - timedelta(days=30)

            if prior_as_of:
                comparison_as_of_dates.append(prior_as_of)

    def _get_company_context_fn(cid: int):
        return ctx or get_company_context(db, cid)

    def _get_trial_balance_fn(cid: int, d_from: Optional[date], d_to: date):
        return db.get_trial_balance(cid, d_from, d_to)

    def _get_pnl_full_fn(cid: int, d_from: date, d_to: date):
        return db.get_income_statement_v2(
            company_id=cid,
            date_from=d_from,
            date_to=d_to,
            template=(ctx.get("template") or "ifrs"),
            basis=basis,
            compare="none",
            cols_mode=1,
            detail="summary",
            ctx=ctx,
        )

    return build_balance_sheet_v3(
        company_id=company_id,
        as_of=as_of,
        date_from=date_from,
        prior_as_of=prior_as_of,
        comparison_as_of_dates=comparison_as_of_dates,
        get_company_context_fn=_get_company_context_fn,
        get_trial_balance_fn=_get_trial_balance_fn,
        get_pnl_full_fn=_get_pnl_full_fn,
        include_net_profit_line=bool(include_net_profit_line),
        view=view,
        basis=basis,
    )


