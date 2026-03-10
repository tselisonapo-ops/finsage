from __future__ import annotations
from datetime import datetime, timedelta, date, timezone

from typing import Dict, Any, Optional, Tuple
from datetime import date
from BackEnd.Services.reporting.reporting_helpers import parse_date_arg
from BackEnd.Services.periods import resolve_period, parse_date_maybe
from BackEnd.Services.company_context import get_company_context

COMPARE_PRESET_MAP = {
    # month
    "this_month": "prev_month",
    "prev_month": "prev_month",   # compare previous month vs month before? optional
    # quarter
    "this_quarter": "prev_quarter",
    "prev_quarter": "prev_quarter",
    "last_2_quarters": "prev_quarter",  # or "last_2_quarters" shifted back (optional)
    # FY
    "ytd": "prev_year_ytd",        # you’ll implement this behavior (see below)
    "this_year": "prev_year",
    "prev_year": "prev_year",
}

PRIOR_PERIOD_MAP = {
    "this_month": "prev_month",
    "prev_month": "prev_month",
    "this_quarter": "prev_quarter",
    "prev_quarter": "prev_quarter",
    "last_2_quarters": "last_2_quarters",  # shift logic handled separately (optional)
    "ytd": "ytd",                           # special handling (prev FY YTD)
    "this_year": "prev_year",
    "prev_year": "prev_year",
}



def clamp_future(d: Optional[date]) -> Optional[date]:
    if not d:
        return None
    return min(d, date.today())  # ✅ compute "today" at runtime


def resolve_company_period(
    db_service,
    company_id: int,
    request,
    *,
    mode: str = "range",   # "range" for P&L/TB/CF/VAT, "as_of" for Balance Sheet
) -> Tuple[Optional[date], Optional[date], Dict[str, Any]]:
    """
    Universal period resolver (FY-aware).

    PRIORITY:
    1) Explicit dates (from/to OR as_of)
    2) Preset (computed using company.fin_year_start)
    3) Default preset: this_year (meaning THIS FINANCIAL YEAR)
    """

    ctx = get_company_context(db_service, company_id) or {}
    fy = parse_date_maybe(ctx.get("fin_year_start"))

    preset_raw = (request.args.get("preset") or "").strip().lower()
    preset = preset_raw or "this_year"

    # ─────────────────────────────────────────────
    # Balance sheet (as-of)
    # ─────────────────────────────────────────────
    if mode == "as_of":
        as_of = clamp_future(
            parse_date_arg(request, "as_of") or parse_date_arg(request, "to")
        )

        # 1) Explicit as_of wins
        if as_of:
            meta = {
                "preset": None,
                "label": f"As at {as_of.isoformat()}",
                "period": {"from": None, "to": as_of.isoformat()},
                "fin_year_start": ctx.get("fin_year_start"),
            }
            return None, as_of, meta

        # 2/3) No as_of: compute from preset using SERVER today (avoid future drift)
        pr = resolve_period(
            fin_year_start=fy,
            preset=preset,
            date_from=None,
            date_to=None,
            as_of=None,  # ✅ anchor to server today
        )

        meta = {
            "preset": pr.get("preset"),
            "label": pr.get("label"),
            "period": {"from": None, "to": pr["to"].isoformat()},
            "fin_year_start": ctx.get("fin_year_start"),
        }
        return None, pr["to"], meta

    # ─────────────────────────────────────────────
    # Range statements (P&L, TB, CF, VAT, Ledger ranges, Journals etc.)
    # ─────────────────────────────────────────────
    date_from = clamp_future(parse_date_arg(request, "from"))
    date_to   = clamp_future(parse_date_arg(request, "to"))

    # 1) If BOTH explicit dates are provided, do NOT override with preset
    if date_from and date_to:
        meta = {
            "preset": None,
            "label": f"{date_from.isoformat()} → {date_to.isoformat()}",
            "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
            "fin_year_start": ctx.get("fin_year_start"),
        }
        return date_from, date_to, meta

    # 2/3) Otherwise compute using preset + company FY, anchored to server today
    pr = resolve_period(
        fin_year_start=fy,
        preset=preset,
        date_from=date_from,
        date_to=date_to,
        as_of=None,  # ✅ anchor to server today
    )

    meta = {
        "preset": pr.get("preset"),
        "label": pr.get("label"),
        "period": {"from": pr["from"].isoformat(), "to": pr["to"].isoformat()},
        "fin_year_start": ctx.get("fin_year_start"),
    }
    return pr["from"], pr["to"], meta

def resolve_compare_period(db_service, company_id: int, meta: Dict[str, Any], compare: str, *, mode: str):
    """
    Returns:
      - for range mode: (prior_from, prior_to)
      - for as_of mode: prior_as_of
    """
    ctx = get_company_context(db_service, company_id) or {}
    fy = parse_date_maybe(ctx.get("fin_year_start"))

    preset = (meta or {}).get("preset") or "this_year"

    if compare == "none":
        return (None, None) if mode == "range" else None

    # -------------------
    # AS_OF (Balance Sheet)
    # -------------------
    if mode == "as_of":
        as_of_iso = (meta.get("period") or {}).get("to")
        as_of = parse_date_maybe(as_of_iso)

        if not as_of:
            return None

        if compare == "prior_year":
            try:
                return as_of.replace(year=as_of.year - 1)
            except ValueError:
                return as_of.replace(year=as_of.year - 1, day=28)

        # prior_period: previous period end based on preset
        prior_preset = COMPARE_PRESET_MAP.get(preset, "prev_month")
        pr = resolve_period(fin_year_start=fy, preset=prior_preset, date_from=None, date_to=None, as_of=None)
        return pr["to"]

    # -------------------
    # RANGE (P&L/CF/TB)
    # -------------------
    cur_from_iso = (meta.get("period") or {}).get("from")
    cur_to_iso   = (meta.get("period") or {}).get("to")
    cur_from = parse_date_maybe(cur_from_iso)
    cur_to   = parse_date_maybe(cur_to_iso)

    if not cur_from or not cur_to:
        return (None, None)

    if compare == "prior_period":
        # Use preset mapping if available
        prior_preset = COMPARE_PRESET_MAP.get(preset)
        if prior_preset and prior_preset != "prev_year_ytd":
            pr = resolve_period(fin_year_start=fy, preset=prior_preset, date_from=None, date_to=None, as_of=None)
            return pr["from"], pr["to"]

        # Special case: YTD → previous FY YTD
        if preset == "ytd":
            # compute same YTD length but previous FY
            # easiest: take current YTD span (days) and subtract 1 FY from both endpoints
            span = (cur_to - cur_from).days
            prior_to = cur_to.replace(year=cur_to.year - 1)
            prior_from = prior_to - timedelta(days=span)
            return prior_from, prior_to

        # fallback: shift by period length
        delta = (cur_to - cur_from) + timedelta(days=1)
        return (cur_from - delta), (cur_to - delta)

    if compare == "prior_year":
        # month/quarter comparisons make sense
        try:
            return cur_from.replace(year=cur_from.year - 1), cur_to.replace(year=cur_to.year - 1)
        except ValueError:
            # Feb 29 safety
            f = cur_from.replace(year=cur_from.year - 1, day=28) if cur_from.month == 2 and cur_from.day == 29 else cur_from.replace(year=cur_from.year - 1)
            t = cur_to.replace(year=cur_to.year - 1, day=28) if cur_to.month == 2 and cur_to.day == 29 else cur_to.replace(year=cur_to.year - 1)
            return f, t

    return (None, None)

def resolve_compare_range(db_service, company_id: int, meta: dict, compare: str):
    ctx = get_company_context(db_service, company_id) or {}
    fy = parse_date_maybe(ctx.get("fin_year_start"))

    preset = (meta or {}).get("preset") or "this_year"
    cur = (meta or {}).get("period") or {}
    cur_from = parse_date_maybe(cur.get("from"))
    cur_to = parse_date_maybe(cur.get("to"))

    if compare == "none" or not cur_from or not cur_to:
        return None, None

    if compare == "prior_period":
        # YTD special: previous FY YTD same length
        if preset == "ytd":
            span_days = (cur_to - cur_from).days
            try:
                prior_to = cur_to.replace(year=cur_to.year - 1)
            except ValueError:
                prior_to = cur_to.replace(year=cur_to.year - 1, day=28)
            prior_from = prior_to - timedelta(days=span_days)
            return prior_from, prior_to

        mapped = PRIOR_PERIOD_MAP.get(preset)
        if mapped:
            pr = resolve_period(fin_year_start=fy, preset=mapped, date_from=None, date_to=None, as_of=cur_to)
            return pr["from"], pr["to"]

        # fallback: shift by same span
        span = (cur_to - cur_from) + timedelta(days=1)
        return cur_from - span, cur_to - span

    if compare == "prior_year":
        # calendar YoY (works best for month/quarter)
        try:
            return cur_from.replace(year=cur_from.year - 1), cur_to.replace(year=cur_to.year - 1)
        except ValueError:
            f = cur_from.replace(year=cur_from.year - 1, day=28) if (cur_from.month == 2 and cur_from.day == 29) else cur_from.replace(year=cur_from.year - 1)
            t = cur_to.replace(year=cur_to.year - 1, day=28) if (cur_to.month == 2 and cur_to.day == 29) else cur_to.replace(year=cur_to.year - 1)
            return f, t

    return None, None


def resolve_compare_asof(*, fin_year_start, preset: str, as_of: date, compare: str):
    if compare == "none":
        return None

    if compare == "prior_year":
        try:
            return as_of.replace(year=as_of.year - 1)
        except ValueError:
            return as_of.replace(year=as_of.year - 1, day=28)

    if compare == "prior_period":
        if preset == "this_month":
            pr = resolve_period(fin_year_start=fin_year_start, preset="prev_month", date_from=None, date_to=None, as_of=as_of)
            return pr["to"]
        if preset == "this_quarter":
            pr = resolve_period(fin_year_start=fin_year_start, preset="prev_quarter", date_from=None, date_to=None, as_of=as_of)
            return pr["to"]
        if preset in ("this_year", "ytd"):
            # previous FY end
            fy = resolve_period(fin_year_start=fin_year_start, preset="this_year", date_from=None, date_to=None, as_of=as_of)
            prev_fy_end = fy["from"] - timedelta(days=1)
            return prev_fy_end

        # fallback: previous month end
        pr = resolve_period(fin_year_start=fin_year_start, preset="prev_month", date_from=None, date_to=None, as_of=as_of)
        return pr["to"]

    return None
