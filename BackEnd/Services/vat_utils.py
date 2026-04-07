# utils/vat_utils.py
from collections import defaultdict
# routes/companies_vat.py
from BackEnd.Services.auth_middleware import _corsify, require_auth
from BackEnd.Services.db_service import db_service
from BackEnd.Services.company_context import get_company_context
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

def compute_current_vat_period(today: date, cfg: dict):
    """Return the VAT period that contains today."""
    if not cfg:
        return None

    periods = (
        _make_vat_periods_for_year(today.year - 1, cfg)
        + _make_vat_periods_for_year(today.year, cfg)
        + _make_vat_periods_for_year(today.year + 1, cfg)
    )

    filing_lag_days = cfg.get("filing_lag_days")
    if not isinstance(filing_lag_days, int):
        filing_lag_days = 25

    for p in periods:
        if p["start_date"] <= today <= p["end_date"]:
            p["due_date"] = p["end_date"] + timedelta(days=filing_lag_days)
            return p

    return None

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

def _serialise_vat_filing(row: dict):
    if not row:
        return None

    def iso(v):
        if v is None:
            return None
        try:
            return v.isoformat()
        except Exception:
            return str(v)

    return {
        "id": row.get("id"),
        "company_id": row.get("company_id"),
        "period_start": iso(row.get("period_start")),
        "period_end": iso(row.get("period_end")),
        "period_label": row.get("period_label"),
        "due_date": iso(row.get("due_date")),
        "input_total": float(row.get("input_total") or 0),
        "output_total": float(row.get("output_total") or 0),
        "net_vat": float(row.get("net_vat") or 0),
        "status": row.get("status"),
        "reference": row.get("reference"),
        "notes": row.get("notes"),
        "prepared_at": iso(row.get("prepared_at")),
        "prepared_by_user_id": row.get("prepared_by_user_id"),
        "submitted_at": iso(row.get("submitted_at")),
        "submitted_by_user_id": row.get("submitted_by_user_id"),
        "source": row.get("source"),
        "source_id": row.get("source_id"),
        "created_at": iso(row.get("created_at")),
        "updated_at": iso(row.get("updated_at")),
    }


@vat_utils_bp.route("/api/companies/<int:company_id>/vat/periods", methods=["GET", "OPTIONS"])
@require_auth
def vat_periods(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    user = getattr(g, "current_user", {}) or {}
    if int(user.get("company_id") or 0) != int(company_id):
        return jsonify({"error": "Not authorised"}), 403

    cfg = db_service.get_vat_settings(company_id) or {}
    today = date.today()

    filing_lag_days = cfg.get("filing_lag_days")
    if not isinstance(filing_lag_days, int):
        filing_lag_days = 25

    periods = (
        _make_vat_periods_for_year(today.year - 1, cfg)
        + _make_vat_periods_for_year(today.year, cfg)
        + _make_vat_periods_for_year(today.year + 1, cfg)
    )

    out = []
    for p in periods:
        due_date = p["end_date"] + timedelta(days=filing_lag_days)
        out.append({
            "label": p["label"],
            "start_date": p["start_date"].isoformat(),
            "end_date": p["end_date"].isoformat(),
            "due_date": due_date.isoformat(),
        })

    out.sort(key=lambda x: x["start_date"], reverse=True)

    current = compute_current_vat_period(today, cfg)

    return jsonify({
        "periods": out,
        "current": {
            "label": current["label"],
            "start_date": current["start_date"].isoformat(),
            "end_date": current["end_date"].isoformat(),
            "due_date": current["due_date"].isoformat() if current.get("due_date") else None,
        } if current else None,
    }), 200

@vat_utils_bp.route("/api/companies/<int:company_id>/vat_summary", methods=["GET", "OPTIONS"])
@require_auth
def vat_summary(company_id: int):
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
    cfg = db_service.get_vat_settings(company_id) or {}

    input_codes, output_codes = _get_vat_accounts(company_id)
    vat_codes = list(set(input_codes) | set(output_codes))
    if not vat_codes:
        return jsonify({
            "input_total": 0.0,
            "output_total": 0.0,
            "net_vat": 0.0,
            "periods": [],
            "filing": None,
        }), 200

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
    buckets = defaultdict(lambda: {"input": 0.0, "output": 0.0})

    for r in rows:
        code = str(r.get("account") or "")
        dr = float(r.get("debit") or 0)
        cr = float(r.get("credit") or 0)
        bal = dr - cr

        label = assign_period_label(r["date"], cfg) if cfg else "Period"

        if code in input_codes:
            input_total += bal
            buckets[label]["input"] += bal
        elif code in output_codes:
            amt = -bal
            output_total += amt
            buckets[label]["output"] += amt

    periods = [
        {"label": k, "input": v["input"], "output": v["output"]}
        for k, v in buckets.items()
    ]

    current_period = compute_current_vat_period(today, cfg) if cfg else None

    return jsonify({
        "input_total": input_total,
        "output_total": output_total,
        "net_vat": output_total - input_total,
        "periods": periods,
        "filing": {
            "label": current_period["label"] if current_period else None,
            "start_date": current_period["start_date"].isoformat() if current_period else None,
            "end_date": current_period["end_date"].isoformat() if current_period else None,
            "due_date": current_period["due_date"].isoformat() if current_period and current_period.get("due_date") else None,
            "status": "open",
            "frequency": cfg.get("frequency"),
            "anchor_month": cfg.get("anchor_month"),
        } if current_period else None,
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

@vat_utils_bp.route("/api/companies/<int:company_id>/vat/filings", methods=["GET", "OPTIONS"])
@require_auth
def vat_filings(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    user = getattr(g, "current_user", {}) or {}
    if int(user.get("company_id") or 0) != int(company_id):
        return jsonify({"error": "Not authorised"}), 403

    try:
        db_service.ensure_company_schema(company_id)
        db_service.ensure_company_vat_filings(company_id)
    except Exception:
        pass

    from_str = (request.args.get("from") or "").strip()
    to_str = (request.args.get("to") or "").strip()

    start_date = _parse_date(from_str, None)
    end_date = _parse_date(to_str, None)

    if start_date and end_date:
        filing = db_service.get_vat_filing(company_id, start_date, end_date)
        return jsonify({
            "filing": _serialise_vat_filing(filing)
        }), 200

    rows = db_service.list_vat_filings(company_id, limit=100)
    return jsonify({
        "filings": [_serialise_vat_filing(r) for r in rows]
    }), 200

@vat_utils_bp.route("/api/companies/<int:company_id>/vat/filings/prepare", methods=["POST", "OPTIONS"])
@require_auth
def vat_prepare_filing(company_id: int):
    if request.method == "OPTIONS":
        return _corsify(make_response("", 204))

    current_user = getattr(g, "current_user", {}) or {}
    if int(current_user.get("company_id") or 0) != int(company_id):
        return jsonify({"ok": False, "error": "Not authorised for this company"}), 403

    payload = request.get_json(force=True) or {}
    from_str = (payload.get("from") or "").strip()
    to_str = (payload.get("to") or "").strip()
    notes = (payload.get("notes") or "").strip() or None

    start_date = _parse_date(from_str, None)
    end_date = _parse_date(to_str, None)

    if not start_date or not end_date:
        return jsonify({"ok": False, "error": "from and to are required"}), 400

    try:
        db_service.ensure_company_schema(company_id)
        db_service.ensure_company_vat_filings(company_id)
    except Exception:
        pass

    cfg = db_service.get_vat_settings(company_id) or {}
    filing_lag_days = cfg.get("filing_lag_days")
    if not isinstance(filing_lag_days, int):
        filing_lag_days = 25

    due_date = end_date + timedelta(days=filing_lag_days)

    # Resolve label using the same period logic you already use
    period_label = None
    periods = (
        _make_vat_periods_for_year(start_date.year - 1, cfg)
        + _make_vat_periods_for_year(start_date.year, cfg)
        + _make_vat_periods_for_year(start_date.year + 1, cfg)
    )
    for p in periods:
        if p["start_date"] == start_date and p["end_date"] == end_date:
            period_label = p["label"]
            break

    if not period_label:
        period_label = f"{start_date.isoformat()} to {end_date.isoformat()}"

    schema = db_service.company_schema(company_id)
    input_codes, output_codes = _get_vat_accounts(company_id)
    vat_codes = list(set(input_codes) | set(output_codes))

    input_total = 0.0
    output_total = 0.0

    if vat_codes:
        placeholders = ",".join(["%s"] * len(vat_codes))
        sql = f"""
          SELECT
            account,
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

        for r in rows:
            code = str(r.get("account") or "")
            dr = float(r.get("debit") or 0)
            cr = float(r.get("credit") or 0)
            bal = dr - cr

            if code in input_codes:
                input_total += bal
            elif code in output_codes:
                output_total += -bal

    net_vat = output_total - input_total

    filing_id = db_service.upsert_vat_filing_prepared(
        company_id,
        period_start=start_date,
        period_end=end_date,
        period_label=period_label,
        due_date=due_date,
        input_total=input_total,
        output_total=output_total,
        net_vat=net_vat,
        notes=notes,
        prepared_by_user_id=int(current_user.get("id") or 0) or None,
        source="api",
    )

    saved = db_service.get_vat_filing(company_id, start_date, end_date)

    try:
        db_service.audit_log(
            company_id=company_id,
            actor_user_id=int(current_user.get("id") or 0),
            module="tax",
            action="prepare_vat_filing",
            severity="info",
            entity_type="vat_filing",
            entity_id=str(filing_id),
            entity_ref=(period_label or f"vat_filing_{filing_id}"),
            amount=float(net_vat or 0.0),
            currency=(get_company_context(db_service, company_id) or {}).get("currency"),
            before_json=payload if isinstance(payload, dict) else {},
            after_json=_serialise_vat_filing(saved) or {},
            message="VAT return prepared",
            source="api",
        )
    except Exception:
        pass

    return jsonify({
        "ok": True,
        "filing_id": filing_id,
        "filing": _serialise_vat_filing(saved),
    }), 200