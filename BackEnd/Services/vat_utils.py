# utils/vat_utils.py
from collections import defaultdict
# routes/companies_vat.py
from BackEnd.Services.auth_middleware import _corsify, require_auth
from BackEnd.Services.db_service import db_service
from datetime import datetime, date, timedelta
from typing import Optional, Tuple, Set
from collections import defaultdict
from datetime import date as date_cls

from flask import (
    Blueprint,
    jsonify,
    request,
    g,
    make_response,
    
)

from flask import Blueprint

vat_utils_bp = Blueprint("companies_vat", __name__)


def _days_in_month(year, month):
    # month = 1..12
    if month == 12:
        return (date(year + 1, 1, 1) - date(year, 12, 1)).days
    return (date(year, month + 1, 1) - date(year, month, 1)).days

def _make_vat_periods_for_year(year: int, cfg: dict):
    freq = (cfg.get("frequency") or "bi_monthly").lower()
    anchor_month = cfg.get("anchor_month") or 1
    anchor_month = max(1, min(12, anchor_month))

    anchor_month = cfg.get("anchor_month") or 1
    try:
        anchor_month = int(anchor_month)
    except Exception:
        anchor_month = 1
    anchor_month = max(1, min(12, anchor_month))

    if freq == "monthly":
        step = 1
    elif freq == "quarterly":
        step = 3
    elif freq in ("semi_annual", "semi-annual", "half_year"):
        step = 6
    elif freq == "annual":
        step = 12
    else:  # bi-monthly default
        step = 2

    periods = []
    # zero-based offset for easier calc
    anchor0 = anchor_month - 1
    max_loops = (12 // step) + 2

    for k in range(max_loops):
        # start
        s_month_idx = anchor0 + k * step  # 0-based
        s_year = year + (s_month_idx // 12)
        s_month = (s_month_idx % 12) + 1
        start_date = date(s_year, s_month, 1)

        # end
        e_month_idx = s_month_idx + step - 1
        e_year = year + (e_month_idx // 12)
        e_month = (e_month_idx % 12) + 1
        end_date = date(e_year, e_month, _days_in_month(e_year, e_month))

        # Keep if it touches the given year
        if start_date.year == year or end_date.year == year:
            label_start = start_date.strftime("%b")
            label_end = end_date.strftime("%b")

            if start_date.year == end_date.year:
                if step == 1:
                    label = f"{label_start} {end_date.year}"
                else:
                    label = f"{label_start}–{label_end} {end_date.year}"
            else:
                label = f"{label_start} {start_date.year}–{label_end} {end_date.year}"

            periods.append({
                "label": label,
                "start_date": start_date,
                "end_date": end_date,
                "due_date": None,  # filled later
            })

    return periods

def compute_next_vat_period(today: date, cfg: dict):
    """Return the period with the soonest dueDate >= today, or the
    last one if all are overdue."""
    if not cfg:
        return None

    filing_lag_days = cfg.get("filing_lag_days")
    if not isinstance(filing_lag_days, int):
        filing_lag_days = 25

    year = today.year
    periods = (
        _make_vat_periods_for_year(year - 1, cfg)
        + _make_vat_periods_for_year(year, cfg)
        + _make_vat_periods_for_year(year + 1, cfg)
    )
    if not periods:
        return None

    for p in periods:
        p["due_date"] = p["end_date"] + timedelta(days=filing_lag_days)

    upcoming = [p for p in periods if p["due_date"] >= today]
    if upcoming:
        return sorted(upcoming, key=lambda p: p["due_date"])[0]

    # no upcoming, pick most recent overdue
    return sorted(periods, key=lambda p: p["due_date"], reverse=True)[0]

def assign_period_label(tx_date: date, cfg: dict):
    """Find the VAT period label for a given transaction date."""
    year = tx_date.year
    periods = (
        _make_vat_periods_for_year(year - 1, cfg)
        + _make_vat_periods_for_year(year, cfg)
        + _make_vat_periods_for_year(year + 1, cfg)
    )
    for p in periods:
        if p["start_date"] <= tx_date <= p["end_date"]:
          return p["label"]
    return tx_date.strftime("%b %Y")  # fallback monthly label


def _parse_date(value: str, default: Optional[date] = None) -> Optional[date]:
    if not value:
        return default
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").date()
    except Exception:
        return default


def _get_vat_accounts(company_id: int) -> Tuple[Set[str], Set[str]]:
    """
    Resolve VAT Input/Output account codes from per-company COA table: {schema}.coa

    Your COA columns available:
      code, name, category, subcategory, template_code, code_numeric, etc.
    """
    schema = db_service.company_schema(company_id)

    sql = f"""
      SELECT
        code,
        name,
        category,
        subcategory,
        template_code,
        code_numeric
      FROM {schema}.coa
      WHERE company_id = %s
    """

    input_codes: Set[str] = set()
    output_codes: Set[str] = set()

    with db_service._conn_cursor() as (_conn, cur):
        cur.execute(sql, (int(company_id),))
        rows = cur.fetchall() or []

    for acc in rows:
        code = str(acc.get("code") or "").strip()
        if not code:
            continue

        name = (acc.get("name") or "").lower()
        cat  = (acc.get("category") or "").lower()
        sub  = (acc.get("subcategory") or "").lower()

        tcode = str(acc.get("template_code") or "").strip()
        num = acc.get("code_numeric")
        num_str = str(num) if num is not None else ""

        # ✅ Heuristics by label
        if ("vat input" in name) or ("vat input" in cat) or ("vat input" in sub):
            input_codes.add(code)

        if ("vat output" in name) or ("vat output" in cat) or ("vat output" in sub):
            output_codes.add(code)

        # ✅ Template/numeric fallbacks
        if tcode == "1410" or num_str == "1410" or code.endswith("_1410"):
            input_codes.add(code)

        if tcode == "2310" or num_str == "2310" or code.endswith("_2310"):
            output_codes.add(code)

    # ✅ Last-resort defaults (keeps system working even if COA naming differs)
    if not input_codes:
        input_codes.add("BS_CA_1410")
    if not output_codes:
        output_codes.add("BS_CL_2310")

    return input_codes, output_codes


@vat_utils_bp.route("/api/companies/<int:company_id>/vat_summary", methods=["GET", "OPTIONS"])
@require_auth
def vat_summary(company_id: int):
    ...

    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    user = getattr(g, "current_user", {}) or {}
    if int(user.get("company_id") or 0) != int(company_id):
        return jsonify({"error": "Not authorised"}), 403

    from_str = (request.args.get("from") or "").strip()
    to_str   = (request.args.get("to") or "").strip()

    today = date_cls.today()
    start_date = _parse_date(from_str, None)
    end_date   = _parse_date(to_str, today)

    if not start_date or not end_date:
        return jsonify({"error": "from and to are required"}), 400

    schema = db_service.company_schema(company_id)

    input_codes, output_codes = _get_vat_accounts(company_id)
    vat_codes = list(set(input_codes) | set(output_codes))
    if not vat_codes:
        return jsonify({"input_total": 0.0, "output_total": 0.0, "periods": []}), 200

    # 🔥 IMPORTANT: your posted table is {schema}.ledger (NOT journal_lines)
    # columns: date, ref, account, debit, credit, company_id
    placeholders = ",".join(["%s"] * len(vat_codes))

    sql = f"""
      SELECT
        account,
        date,
        debit,
        credit
      FROM {schema}.ledger
      WHERE company_id = %s
        AND date >= %s
        AND date <= %s
        AND account IN ({placeholders})
    """

    with db_service._conn_cursor() as (_conn, cur):
        cur.execute(sql, (int(company_id), start_date, end_date, *vat_codes))
        rows = cur.fetchall() or []

    input_total = 0.0
    output_total = 0.0

    # optional periods breakdown (same idea as your old SQLAlchemy version)
    cfg = {}  # if you have vat_settings in company profile, pass it in here
    buckets = defaultdict(lambda: {"input": 0.0, "output": 0.0})

    for r in rows:
        code = str(r.get("account") or "")
        dr = float(r.get("debit") or 0)
        cr = float(r.get("credit") or 0)
        bal = dr - cr  # debit-positive

        # label = assign_period_label(r["date"], cfg)  # if you want
        label = "Period"

        if code in input_codes:
            input_total += bal
            buckets[label]["input"] += bal
        elif code in output_codes:
            amt = -bal  # output VAT is credit-positive
            output_total += amt
            buckets[label]["output"] += amt

    periods = [{"label": k, "input": v["input"], "output": v["output"]} for k, v in buckets.items()]

    return jsonify({
        "input_total": input_total,
        "output_total": output_total,
        "periods": periods,
    }), 200


@vat_utils_bp.route("/api/companies/<int:company_id>/vat/lines", methods=["GET", "OPTIONS"])
@require_auth
def vat_lines(company_id: int):
    ...

    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    user = getattr(g, "current_user", {}) or {}
    if int(user.get("company_id") or 0) != int(company_id):
        return jsonify({"error": "Not authorised"}), 403

    from_str = (request.args.get("from") or "").strip()
    to_str   = (request.args.get("to") or "").strip()

    today = date.today()
    start_date = _parse_date(from_str, None)
    end_date   = _parse_date(to_str, today)

    if not start_date or not end_date:
        return jsonify({"error": "from and to are required"}), 400

    schema = db_service.company_schema(company_id)

    input_codes, output_codes = _get_vat_accounts(company_id)
    vat_codes = list(set(input_codes) | set(output_codes))
    if not vat_codes:
        return jsonify({"lines": []}), 200

    placeholders = ",".join(["%s"] * len(vat_codes))

    sql = f"""
      SELECT
        l.date AS date,
        l.ref  AS ref,
        l.account AS account_code,
        a.name AS account_name,
        l.debit AS debit,
        l.credit AS credit
      FROM {schema}.ledger l
      LEFT JOIN {schema}.coa a
        ON a.company_id = l.company_id
       AND a.code = l.account
      WHERE l.company_id = %s
        AND l.date >= %s
        AND l.date <= %s
        AND l.account IN ({placeholders})
      ORDER BY l.date DESC, l.id DESC
      LIMIT 500;
    """

    with db_service._conn_cursor() as (_conn, cur):
        cur.execute(sql, (int(company_id), start_date, end_date, *vat_codes))
        rows = cur.fetchall() or []

    lines = []
    for r in rows:
        code = str(r.get("account_code") or "")
        side = "input" if code in input_codes else ("output" if code in output_codes else None)

        lines.append({
            "date": (r.get("date").isoformat() if r.get("date") else None),
            "ref": r.get("ref") or "",
            "account_code": code,
            "account_name": r.get("account_name") or "",
            "debit": float(r.get("debit") or 0),
            "credit": float(r.get("credit") or 0),
            "vat_side": side,
        })

    return jsonify({"lines": lines}), 200
