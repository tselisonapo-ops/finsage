# BackEnd/Services/periods.py
from __future__ import annotations
from datetime import date, timedelta
from typing import Optional, Dict, Any
from datetime import datetime, date
from typing import Union

def _start_of_month(d: date) -> date:
    return date(d.year, d.month, 1)

def _end_of_month(d: date) -> date:
    if d.month == 12:
        return date(d.year, 12, 31)
    return date(d.year, d.month + 1, 1) - timedelta(days=1)

def _start_of_quarter(d: date) -> date:
    q = ((d.month - 1) // 3) * 3 + 1
    return date(d.year, q, 1)

def _end_of_quarter(d: date) -> date:
    s = _start_of_quarter(d)
    if s.month == 10:
        return date(s.year, 12, 31)
    return date(s.year, s.month + 3, 1) - timedelta(days=1)

def parse_date_maybe(v: Any) -> Optional[date]:
    """
    Accepts:
      - date / datetime
      - 'YYYY-MM-DD' (or 'YYYY-MM-DDTHH:MM:SS...')
      - 'DD/MM' (financial year start style like '01/03')
    Returns:
      - date or None
    """
    if v is None:
        return None

    if isinstance(v, datetime):
        return v.date()

    if isinstance(v, date):
        return v

    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None

        try:
            return datetime.strptime(s[:10], "%Y-%m-%d").date()
        except ValueError:
            pass

        # DD/MM -> attach dummy year (month/day only matters)
        try:
            d = datetime.strptime(s, "%d/%m")
            return date(2000, d.month, d.day)
        except ValueError:
            pass

        # optional MM/DD fallback
        try:
            d = datetime.strptime(s, "%m/%d")
            return date(2000, d.month, d.day)
        except ValueError:
            pass

    return None

def _normalize_fin_year_start(fin_year_start: Optional[object]) -> Optional[date]:
    if not fin_year_start:
        return None
    if isinstance(fin_year_start, date):
        return fin_year_start
    if isinstance(fin_year_start, str):
        s = fin_year_start.strip()
        # expecting "DD/MM"
        if "/" in s:
            dd, mm = s.split("/")[:2]
            return date(2000, int(mm), int(dd))  # dummy year, month/day is what matters
        # if "YYYY-MM-DD"
        if "-" in s:
            return datetime.strptime(s[:10], "%Y-%m-%d").date()
    return None

def _fy_start_for_asof(fin_year_start: Optional[object], as_of: date) -> date:
    fin_year_start = _normalize_fin_year_start(fin_year_start)
    if not fin_year_start:
        return date(as_of.year, 1, 1)

    candidate = date(as_of.year, fin_year_start.month, fin_year_start.day)
    if candidate > as_of:
        candidate = date(as_of.year - 1, fin_year_start.month, fin_year_start.day)
    return candidate

def _fy_end(fy_start: date) -> date:
    # FY end is day before next FY start
    try:
        next_start = date(fy_start.year + 1, fy_start.month, fy_start.day)
    except ValueError:
        # Handle Feb 29 start
        next_start = date(fy_start.year + 1, fy_start.month, 28)
    return next_start - timedelta(days=1)



def parse_yyyy_mm_dd(s):
    if s is None:
        return None
    if isinstance(s, date):
        return s
    if isinstance(s, str):
        return datetime.strptime(s, "%Y-%m-%d").date()
    raise TypeError(f"Unsupported date type: {type(s)}")

def resolve_period(
    *,
    fin_year_start: Optional[date],
    preset: Optional[str],
    date_from: Optional[date],
    date_to: Optional[date],
    as_of: Optional[date] = None
) -> Dict[str, Any]:
    """
    Priority:
    1) explicit from/to (if provided)
    2) preset (computed using fin_year_start)
    3) default = this_year (FY)
    """
    today = as_of or date.today()

    if date_from and date_to:
        return {"from": date_from, "to": date_to, "label": f"{date_from} → {date_to}", "preset": None}

    p = (preset or "").strip().lower() or "this_year"

    # Month presets
    if p == "this_month":
        f = _start_of_month(today); t = _end_of_month(today)
    elif p == "prev_month":
        prev_end = _start_of_month(today) - timedelta(days=1)
        f = _start_of_month(prev_end); t = _end_of_month(prev_end)

    # Quarter presets
    elif p == "this_quarter":
        f = _start_of_quarter(today); t = _end_of_quarter(today)
    elif p == "prev_quarter":
        prev_end = _start_of_quarter(today) - timedelta(days=1)
        f = _start_of_quarter(prev_end); t = _end_of_quarter(prev_end)
    elif p == "last_2_quarters":
        this_q_start = _start_of_quarter(today)
        prev_q_end = this_q_start - timedelta(days=1)
        prev_q_start = _start_of_quarter(prev_q_end)
        prev2_end = prev_q_start - timedelta(days=1)
        prev2_start = _start_of_quarter(prev2_end)
        f = prev2_start; t = _end_of_quarter(today)

    # FY presets
    else:
        fy_start = _fy_start_for_asof(fin_year_start, today)
        fy_end = _fy_end(fy_start)

        if p == "ytd":
            f = fy_start; t = today
        elif p == "prev_year":
            prev_fy_end = fy_start - timedelta(days=1)
            prev_fy_start = _fy_start_for_asof(fin_year_start, prev_fy_end)
            f = prev_fy_start; t = _fy_end(prev_fy_start)
        else:  # this_year default
            f = fy_start; t = fy_end

    return {"from": f, "to": t, "label": f"{f} → {t}", "preset": p}
