# BackEnd/Services/reporting/cashflow_templates.py
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Callable, Dict, List, Optional
from BackEnd.Services import accounting_classifiers as ac
from . import reporting_helpers as rh
# -----------------------------
# Shared normalisers (single source of truth)
# -----------------------------
def _norm_preview_columns(preview_columns: Any) -> int:
    try:
        v = int(preview_columns or 2)
    except Exception:
        v = 2
    return 2 if v == 2 else 1

def _norm_compare(compare_mode: Optional[str]) -> str:
    cm = (compare_mode or "none").lower().strip()
    return cm if cm in ("none", "prior_period", "prior_year", "multi_year") else "none"

def _resolve_cf_columns(
    *,
    basis: str,
    cols_mode: int,
    preview_columns: int,
    compare_mode: str,
    prior_from: Optional[date],
    prior_to: Optional[date],
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    comparison_years: int = 1,
):
    is_mgmt = (str(basis or "external").lower() in ("management", "internal"))
    cols_mode = int(cols_mode or 1)

    is_ws_2 = is_mgmt and cols_mode == 2
    is_ws_3 = is_mgmt and cols_mode == 3

    if is_ws_2 or is_ws_3:
        return {
            "is_ws_2": is_ws_2,
            "is_ws_3": is_ws_3,
            "has_prior": False,
            "compare_mode": "none",
            "prior_from": None,
            "prior_to": None,
            "comparison_ranges": [],
            "columns": (
                [{"key": "brk", "label": "Breakdown"}, {"key": "tot", "label": "Total"}] +
                ([{"key": "var", "label": "Variance"}] if is_ws_3 else [])
            ),
        }

    if preview_columns == 2:
        compare_mode = "none"
        prior_from = None
        prior_to = None

    comparison_ranges = []

    if preview_columns == 1 and compare_mode == "multi_year" and date_from and date_to:
        try:
            comparison_years = int(comparison_years or 1)
        except Exception:
            comparison_years = 1

        comparison_years = max(1, min(comparison_years, 10))

        for i in range(1, comparison_years):
            comparison_ranges.append((
                rh.shift_year(date_from, i),
                rh.shift_year(date_to, i),
            ))

    elif preview_columns == 1 and compare_mode in ("prior_year", "prior_period") and prior_from and prior_to:
        comparison_ranges.append((prior_from, prior_to))

    has_prior = bool(comparison_ranges)

    columns = [{"key": "cur", "label": "Current"}]

    if has_prior:
        columns.append({"key": "pri", "label": "Prior"})

        for idx in range(2, len(comparison_ranges) + 1):
            columns.append({"key": f"p{idx}", "label": f"Prior {idx}"})

        columns.append({"key": "delta", "label": "Δ"})

    return {
        "is_ws_2": False,
        "is_ws_3": False,
        "has_prior": has_prior,
        "compare_mode": compare_mode if has_prior else "none",
        "prior_from": comparison_ranges[0][0] if has_prior else None,
        "prior_to": comparison_ranges[0][1] if has_prior else None,
        "comparison_ranges": comparison_ranges,
        "columns": columns,
    }

def _cf_group_label(row: Dict[str, Any]) -> str:
    role = str(row.get("cf_role") or "").lower()
    bucket = str(row.get("cf_bucket") or "").lower()
    name = str(row.get("account_name") or row.get("name") or "").strip()

    if "lease" in role or "lease" in bucket or "lease liability" in name.lower():
        return "Lease liability payments"

    if "loan" in role or "borrow" in role or "loan payable" in name.lower():
        return "Borrowings"

    if "vat" in bucket or "vat" in name.lower():
        return "VAT paid / received"

    if "receivable" in bucket or "receivable" in name.lower():
        return "Cash received from customers"

    if "payable" in bucket or "supplier" in bucket or "payable" in name.lower():
        return "Cash paid to suppliers"

    if "wages" in name.lower() or "salaries" in name.lower() or "employee" in name.lower():
        return "Cash paid to employees"

    if "interest" in name.lower():
        return "Interest paid"

    if "furniture" in name.lower() or "asset" in name.lower() or "ppe" in bucket:
        return "Purchase of property, plant and equipment"

    return name or "Other cash flow item"


def _aggregate_cf_detail_lines(lines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[str, Dict[str, Any]] = {}

    for row in lines or []:
        label = _cf_group_label(row)

        if label not in grouped:
            grouped[label] = {
                **row,
                "account_name": label,
                "name": label,
                "amount": 0.0,
                "detail": [],
            }

        grouped[label]["amount"] += float(row.get("amount") or 0.0)
        grouped[label]["detail"].append(row)

    return [
        row for row in grouped.values()
        if abs(float(row.get("amount") or 0.0)) > 0.000001
    ]

def _has_non_zero(values: dict) -> bool:
    if not values:
        return False

    return any(
        abs(float(v or 0.0)) > 0.000001
        for v in values.values()
        if isinstance(v, (int, float))
    )


def _filter_statement_lines(lines):
    out = []

    for line in lines:
        row_type = str(line.get("row_type") or "").lower()

        # Always keep structural rows
        if row_type in ("header", "subtotal", "total"):
            out.append(line)
            continue

        # Keep rows with expandable detail
        if line.get("detail"):
            out.append(line)
            continue

        # Keep only rows with a value
        if _has_non_zero(line.get("values", {})):
            out.append(line)

    return out

def _build_cash_journal_analysis(
    *,
    get_journals_period_fn: GetJournalsPeriodFn,
    company_id: int,
    date_from: date,
    date_to: date,
) -> Dict[str, Any]:
    journals = get_journals_period_fn(company_id, date_from, date_to)

    sec_totals = {"operating": 0.0, "investing": 0.0, "financing": 0.0}
    sec_lines = {"operating": [], "investing": [], "financing": []}

    for j in journals:
        lines = j.get("journal_lines") or []

        cash_lines = [ln for ln in lines if ac._is_cash_bank(ln)]
        if not cash_lines:
            continue

        cash_change = sum(
            float(cl.get("debit") or 0.0) - float(cl.get("credit") or 0.0)
            for cl in cash_lines
        )

        noncash = [ln for ln in lines if not ac._is_cash_bank(ln)]
        if not noncash:
            continue

        effects = [
            float(ln.get("credit") or 0.0) - float(ln.get("debit") or 0.0)
            for ln in noncash
        ]

        sum_effects = float(sum(effects))
        scale = 1.0

        if abs(sum_effects) > 1e-9 and abs(sum_effects - cash_change) > 0.01:
            scale = cash_change / sum_effects

        for ln, eff in zip(noncash, effects):
            amount = float(eff) * float(scale)

            if abs(amount) < 0.000001:
                continue

            sec = ac._classify_cf_section(ln)

            if sec == "ignore":
                continue

            if sec not in ("operating", "investing", "financing"):
                sec = "operating"

            meta = ac.resolve_account_cf_meta(ln)

            row = {
                "date": j.get("date"),
                "ref": j.get("ref"),
                "description": j.get("description"),
                "account_name": ln.get("account_name") or ln.get("name") or ln.get("account") or ln.get("account_code") or "",
                "memo": ln.get("memo") or "",
                "amount": amount,
                "cf_bucket": meta.get("bucket"),
                "cf_role": meta.get("role"),
                "cf_section": meta.get("section"),
                "account_code": ln.get("account") or ln.get("account_code") or ln.get("code") or "",
            }

            sec_totals[sec] += amount
            sec_lines[sec].append(row)

    return {
        "totals": sec_totals,
        "lines": sec_lines,
        "net_change": (
            sec_totals["operating"]
            + sec_totals["investing"]
            + sec_totals["financing"]
        ),
    }

def _aggregate_adjustment_lines(lines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[str, Dict[str, Any]] = {}

    for row in lines or []:
        name = row.get("account_name") or row.get("name") or "Other non-cash items"

        if name not in grouped:
            grouped[name] = {
                **row,
                "account_name": name,
                "name": name,
                "amount": 0.0,
            }

        grouped[name]["amount"] += float(row.get("amount") or 0.0)

    return [
        row for row in grouped.values()
        if abs(float(row.get("amount") or 0.0)) > 0.000001
    ]

# -----------------------------
# Types (hooks)
# -----------------------------
GetCompanyContextFn = Callable[[int], Dict[str, Any]]
GetJournalsPeriodFn = Callable[[int, date, date], List[Dict[str, Any]]]
GetTrialBalanceAsOfFn = Callable[[int, date], List[Dict[str, Any]]]
CashPositionFromTbFn = Callable[[List[Dict[str, Any]]], Dict[str, Any]]
GetPnlFullFn = Callable[[int, date, date], Dict[str, Any]]
GetTrialBalanceAsOfRowsFn = Callable[[int, Optional[date], Optional[date]], List[Dict[str, Any]]]


def build_cashflow_full_v2(
    *,
    get_company_context_fn: GetCompanyContextFn,
    get_journals_period_fn: GetJournalsPeriodFn,
    tb_as_of_fn: GetTrialBalanceAsOfFn,
    cash_position_from_tb_fn: CashPositionFromTbFn,
    company_id: int,
    date_from: date,
    date_to: date,
    template: str = "ifrs",
    basis: str = "external",
    compare_mode: str = "none",
    comparison_years: int = 1,
    prior_from: Optional[date] = None,
    prior_to: Optional[date] = None,
    preview_columns: int = 2,  # 2 = inflow/outflow UI, 1 = compare-capable
    cols_mode: int = 1,   # ✅ ADD THIS
) -> Dict[str, Any]:
    """
    Cash Flow Statement (Direct method), v2 JSON shape.
    preview_columns rules:
      - 2 => force compare_mode="none" (ignore priors)
      - 1 => allow compare_mode prior_period/prior_year (if priors provided)
    """

    # ✅ Normalize once
    preview_columns = _norm_preview_columns(preview_columns)
    compare_mode = _norm_compare(compare_mode)

    # ✅ Single source of truth for columns + compare rules
    cfg = _resolve_cf_columns(
        basis=basis,
        cols_mode=cols_mode,
        preview_columns=preview_columns,
        compare_mode=compare_mode,
        prior_from=prior_from,
        prior_to=prior_to,
        date_from=date_from,
        date_to=date_to,
        comparison_years=comparison_years,
    )

    is_ws_2 = cfg["is_ws_2"]
    is_ws_3 = cfg["is_ws_3"]
    has_prior = cfg["has_prior"]
    compare_mode = cfg["compare_mode"]
    prior_from = cfg["prior_from"]
    prior_to = cfg["prior_to"]
    columns = cfg["columns"]
    comparison_ranges = cfg.get("comparison_ranges") or []

    def _val(cur_amt: float, comparison_amounts: Optional[List[float]] = None) -> Dict[str, float]:
        if is_ws_2:
            return {"brk": 0.0, "tot": float(cur_amt)}

        if is_ws_3:
            return {"brk": 0.0, "tot": float(cur_amt), "var": float(cur_amt)}

        out = {"cur": float(cur_amt)}
        comparison_amounts = comparison_amounts or []

        if comparison_amounts:
            out["pri"] = float(comparison_amounts[0])

            for idx, amt in enumerate(comparison_amounts[1:], start=2):
                out[f"p{idx}"] = float(amt)

            out["delta"] = float(out["cur"] - out["pri"])

        return out

    def _calc_period_cf(df: date, dt: date) -> Dict[str, Any]:
        return _build_cash_journal_analysis(
            get_journals_period_fn=get_journals_period_fn,
            company_id=company_id,
            date_from=df,
            date_to=dt,
        )

    # Snapshots
    open_as_of_cur = date_from - timedelta(days=1)
    close_as_of_cur = date_to

    tb_open_cur = tb_as_of_fn(company_id, open_as_of_cur)
    tb_close_cur = tb_as_of_fn(company_id, close_as_of_cur)

    cash_open_cur = cash_position_from_tb_fn(tb_open_cur)
    cash_close_cur = cash_position_from_tb_fn(tb_close_cur)

    cur = _calc_period_cf(date_from, date_to)

    comparison_results = []
    comparison_cash_positions = []

    for pf, pt in comparison_ranges:
        comparison_results.append(_calc_period_cf(pf, pt))

        tb_open_cmp = tb_as_of_fn(company_id, pf - timedelta(days=1))
        tb_close_cmp = tb_as_of_fn(company_id, pt)

        comparison_cash_positions.append({
            "opening": cash_position_from_tb_fn(tb_open_cmp),
            "closing": cash_position_from_tb_fn(tb_close_cmp),
        })

    def _section_block(key: str, label: str) -> Dict[str, Any]:
        cur_amt = float(cur["totals"].get(key) or 0.0)

        comparison_amounts = [
            float(r["totals"].get(key) or 0.0)
            for r in comparison_results
        ]

        cur_detail_lines = _aggregate_cf_detail_lines(
            cur["lines"].get(key, [])
        )

        lines = []

        for row in cur_detail_lines:
            amt = float(row.get("amount") or 0.0)

            lines.append({
                "code": row.get("account_code") or "DETAIL",
                "name": row.get("account_name") or row.get("name") or "Cash flow item",
                "row_type": "normal",
                "values": _val(amt, []),
            })

        return {
            "key": key,
            "label": label,
            "lines": lines,
            "totals": _val(cur_amt, comparison_amounts),
        }

    operating = _section_block("operating", "Cash flows from operating activities")
    investing = _section_block("investing", "Cash flows from investing activities")
    financing = _section_block("financing", "Cash flows from financing activities")

    net_cur = (
        float(cur["totals"]["operating"]) +
        float(cur["totals"]["investing"]) +
        float(cur["totals"]["financing"])
    )

    net_comparisons = [
        float(r["totals"]["operating"]) +
        float(r["totals"]["investing"]) +
        float(r["totals"]["financing"])
        for r in comparison_results
    ]

    delta_cash_cur = float(cash_close_cur["position"]) - float(cash_open_cur["position"])

    delta_cash_comparisons = [
        float(pos["closing"]["position"]) - float(pos["opening"]["position"])
        for pos in comparison_cash_positions
    ]

    opening_cash_comparisons = [
        float(pos["opening"]["position"])
        for pos in comparison_cash_positions
    ]

    closing_cash_comparisons = [
        float(pos["closing"]["position"])
        for pos in comparison_cash_positions
    ]

    reconciliation_gap_cur = delta_cash_cur - net_cur

    reconciliation_gap_comparisons = [
        float(delta_cash_comparisons[i]) - float(net_comparisons[i])
        for i in range(len(net_comparisons))
    ]

    comparison_periods = []
    for idx, (pf, pt) in enumerate(comparison_ranges, start=1):
        key = "pri" if idx == 1 else f"p{idx}"
        comparison_periods.append({
            "key": key,
            "from": pf.isoformat(),
            "to": pt.isoformat(),
        })

    ctx = get_company_context_fn(company_id) or {}

    return {
        "meta": {
            "company_id": company_id,
            "company_name": ctx.get("company_name"),
            "currency": ctx.get("currency") or "ZAR",
            "statement": "cf",
            "template": template,
            "basis": basis,
            "compare": compare_mode,
            "method": "direct",
            "preview_columns": preview_columns,
            "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
            "prior_period": {
                "from": prior_from.isoformat(),
                "to": prior_to.isoformat()
            } if has_prior else None,
            "comparison_periods": comparison_periods,
        },
        "columns": columns,
        "sections": [operating, investing, financing],
        "net_change": {
            "label": "Net change in cash and cash equivalents",
            "values": _val(net_cur, net_comparisons),
        },
        "cash_position": {
            "opening": {
                "label": "Cash & cash equivalents (opening)",
                "values": _val(
                    float(cash_open_cur["position"]),
                    opening_cash_comparisons,
                ),
                "breakdown": {
                    "cur": {
                        "cash": cash_open_cur["cash_positive"],
                        "overdraft": cash_open_cur["overdraft"],
                    },
                },
            },
            "closing": {
                "label": "Cash & cash equivalents (closing)",
                "values": _val(
                    float(cash_close_cur["position"]),
                    closing_cash_comparisons,
                ),
                "breakdown": {
                    "cur": {
                        "cash": cash_close_cur["cash_positive"],
                        "overdraft": cash_close_cur["overdraft"],
                    },
                },
            },
            "delta_from_tb": {
                "label": "Net change per TB (closing - opening)",
                "values": _val(delta_cash_cur, delta_cash_comparisons),
            },
            "reconciliation_gap": {
                "label": "Reconciliation gap (TB delta - cashflow net change)",
                "values": _val(reconciliation_gap_cur, reconciliation_gap_comparisons),
            },
        },
    }

def build_cashflow_indirect_v2(
    *,
    get_company_context_fn: GetCompanyContextFn,
    get_pnl_full_fn: GetPnlFullFn,
    get_trial_balance_asof_fn: GetTrialBalanceAsOfRowsFn,
    get_journals_period_fn: GetJournalsPeriodFn,
    company_id: int,
    date_from: date,
    date_to: date,
    template: str = "ifrs",
    basis: str = "external",
    compare_mode: str = "none",
    comparison_years: int = 1,
    prior_from: Optional[date] = None,
    prior_to: Optional[date] = None,
    preview_columns: int = 1,
    cols_mode: int = 1,  
) -> Dict[str, Any]:
    """
    Cash Flow Statement (Indirect method), v2 JSON shape.
    preview_columns rules:
      - 2 => force compare_mode="none" (ignore priors)
      - 1 => allow compare_mode prior_period/prior_year (if priors provided)
    """

    # ✅ Normalize once
    preview_columns = _norm_preview_columns(preview_columns)
    compare_mode = _norm_compare(compare_mode)

    # ✅ Single source of truth for columns + compare rules
    cfg = _resolve_cf_columns(
        basis=basis,
        cols_mode=cols_mode,
        preview_columns=preview_columns,
        compare_mode=compare_mode,
        prior_from=prior_from,
        prior_to=prior_to,
        date_from=date_from,
        date_to=date_to,
        comparison_years=comparison_years,
    )

    is_ws_2 = cfg["is_ws_2"]
    is_ws_3 = cfg["is_ws_3"]
    has_prior = cfg["has_prior"]
    compare_mode = cfg["compare_mode"]
    prior_from = cfg["prior_from"]
    prior_to = cfg["prior_to"]
    columns = cfg["columns"]
    comparison_ranges = cfg.get("comparison_ranges") or []

    def _val(
        cur_amt: float = 0.0,
        comparison_amounts: Optional[List[float]] = None,
        brk_amt: Optional[float] = None,
        *,
        ws_show_total: bool = False,
        ws_show_breakdown: bool = False,
    ) -> Dict[str, float]:
        if is_ws_2:
            return {
                "brk": float(brk_amt if ws_show_breakdown else 0.0),
                "tot": float(cur_amt if ws_show_total else 0.0),
            }

        if is_ws_3:
            return {
                "brk": float(brk_amt if ws_show_breakdown else 0.0),
                "tot": float(cur_amt if ws_show_total else 0.0),
                "var": 0.0,
            }

        out = {"cur": float(cur_amt)}
        comparison_amounts = comparison_amounts or []

        if comparison_amounts:
            out["pri"] = float(comparison_amounts[0])

            for idx, amt in enumerate(comparison_amounts[1:], start=2):
                out[f"p{idx}"] = float(amt)

            out["delta"] = float(out["cur"] - out["pri"])

        return out

    def _tb_map(as_of: date) -> Dict[str, Dict[str, Any]]:
        rows = get_trial_balance_asof_fn(company_id, None, as_of) or []
        out: Dict[str, Dict[str, Any]] = {}
        for r in rows:
            code = str(r.get("code") or r.get("account") or "").strip()
            out[code] = r
        return out

    def _kind_from_row(r: Dict[str, Any]) -> str:
        return ac._classify_tb_row(r)  # ✅

    def _bs_signed(kind: str, r: Dict[str, Any]) -> float:
        dr = float(r.get("debit") or r.get("debit_total") or 0.0)
        cr = float(r.get("credit") or r.get("credit_total") or 0.0)
        if kind == "asset":
            return dr - cr
        if kind in ("liability", "equity"):
            return cr - dr
        return 0.0

    def _operating_indirect(df: date, dt: date) -> Dict[str, Any]:
        pnl = get_pnl_full_fn(company_id, df, dt) or {}
        net_profit = float((pnl.get("net_result") or {}).get("amount") or 0.0)

        open_as_of = df - timedelta(days=1)
        close_as_of = dt

        tb_open = _tb_map(open_as_of)
        tb_close = _tb_map(close_as_of)

        wc = {
            "receivables": 0.0,
            "payables": 0.0,
            "inventory": 0.0,
            "prepaids": 0.0,
            "vat": 0.0,
        }

        journals = get_journals_period_fn(company_id, df, dt)
        all_codes = set(tb_open.keys()) | set(tb_close.keys())
        
        # --- Get depreciation/amortisation from TB + COA metadata ---
        adjustment_lines: List[Dict[str, Any]] = []
        adjustments_total = 0.0
        resolved_adjustments: List[str] = []

        for code in all_codes:
            r_close = tb_close.get(code) or {}
            r_open = tb_open.get(code) or {}
            row_any = r_close if r_close else r_open

            if not row_any:
                continue

            meta = ac.resolve_account_cf_meta(row_any)
            role = str(meta.get("role") or "").lower()
            bucket = str(meta.get("bucket") or "").lower()
            name = str(
                row_any.get("name")
                or row_any.get("account_name")
                or row_any.get("code")
                or code
            ).strip()

            kind = _kind_from_row(r_close) if r_close else _kind_from_row(r_open)

            if kind in ("asset", "liability", "equity"):
                bal_close = _bs_signed(kind, r_close)
                bal_open = _bs_signed(kind, r_open)
            else:
                bal_close = ac._pnl_amount(r_close) if r_close else 0.0
                bal_open = ac._pnl_amount(r_open) if r_open else 0.0

            delta = bal_close - bal_open

            adj_amt = None

            # only expense-side accounts belong in operating adjustments
            name_l = name.lower()

            # Non-cash add-backs / deductions for indirect cash flow
            if (
                role.startswith("depreciation_expense")
                or role.startswith("amortisation_expense")
                or "depreciation" in name_l
                or "amortisation" in name_l
                or "amortization" in name_l
            ):
                adj_amt = abs(delta)

            elif "impairment" in name_l:
                adj_amt = abs(delta)

            elif "loss" in name_l and "disposal" in name_l:
                adj_amt = abs(delta)

            elif "gain" in name_l and "disposal" in name_l:
                adj_amt = -abs(delta)

            elif role in ("loan_interest_expense", "lease_interest_expense"):
                adj_amt = abs(delta)

            if adj_amt is not None and abs(adj_amt) > 0.000001:
                adjustments_total += adj_amt
                resolved_adjustments.append(name)
                detail_group = "Other non-cash items"

                if (
                    "depreciation" in name_l
                    or "amortisation" in name_l
                    or "amortization" in name_l
                ):
                    detail_group = "Depreciation and amortisation"

                elif role in ("loan_interest_expense", "lease_interest_expense") or "interest" in name_l:
                    detail_group = "Interest expense"

                elif "impairment" in name_l:
                    detail_group = "Impairment losses"

                elif "loss" in name_l and "disposal" in name_l:
                    detail_group = "Loss on disposal"

                elif "gain" in name_l and "disposal" in name_l:
                    detail_group = "Gain on disposal"

                adjustment_lines.append({
                    "account_name": detail_group,
                    "amount": adj_amt,
                    "code": detail_group.upper().replace(" ", "_"),
                    "role": role,
                    "bucket": bucket,
                })

        adjustment_lines = _aggregate_adjustment_lines(adjustment_lines)

        dep_journal_exists = any(
            str(j.get("source") or "").lower() == "asset_depreciation"
            for j in journals
        )

        if dep_journal_exists and not resolved_adjustments:
            raise RuntimeError(
                f"Cash flow rendering blocked: asset_depreciation journals exist for company {company_id}, "
                f"but no depreciation/amortisation account could be resolved from TB/COA metadata "
                f"for period {df} to {dt}."
            )

        for code in all_codes:
            r_close = tb_close.get(code) or {}
            r_open = tb_open.get(code) or {}
            row_any = r_close if r_close else r_open

            if not row_any:
                continue

            if ac._is_cash_bank(row_any):
                continue

            meta = ac.resolve_account_cf_meta(row_any)
            bucket = str(meta.get("bucket") or "").lower()

            kind_close = _kind_from_row(r_close) if r_close else _kind_from_row(r_open)
            bal_close = _bs_signed(kind_close, r_close)
            bal_open = _bs_signed(kind_close, r_open)
            delta = bal_close - bal_open

            if bucket == "receivables":
                wc["receivables"] += delta
            elif bucket in ("payables", "grni_control", "unallocated_receipts", "deferred_revenue"):
                wc["payables"] += delta
            elif bucket == "inventory":
                wc["inventory"] += delta
            elif bucket == "prepaids":
                wc["prepaids"] += delta
            elif bucket in ("vat_input", "vat_output", "tax_payable", "tax_receivable"):
                wc["vat"] += delta

        receivables_effect = -wc["receivables"]
        inventory_effect   = -wc["inventory"]
        vat_effect         = -wc["vat"]
        payables_effect    = +wc["payables"]
        prepaids_effect = -wc["prepaids"]

        operating_profit_before_wc = net_profit + adjustments_total
        cash_generated_from_ops = (
            operating_profit_before_wc
            + receivables_effect
            + payables_effect
            + inventory_effect
            + prepaids_effect
            + vat_effect
        )
        net_operating = cash_generated_from_ops

        if is_ws_2 or is_ws_3:
            lines = [
                {
                    "code": "NET_PROFIT",
                    "name": "Net profit / (loss)",
                    "row_type": "total",
                    "values": _val(
                        net_profit,
                        0.0,
                        0.0,
                        ws_show_total=True,
                        ws_show_breakdown=False,
                    ),
                },
                {
                    "code": "ADJUST_HDR",
                    "name": "Adjustments for:",
                    "row_type": "header",
                    "values": _val(0.0, 0.0, 0.0),
                },
                {
                    "code": "NONCASH",
                    "name": "Non-cash and other operating adjustments",
                    "row_type": "breakdown",
                    "values": _val(
                        adjustments_total,
                        adjustments_total,
                        adjustments_total,
                        ws_show_total=True,
                        ws_show_breakdown=True,
                    ),
                    "detail": {
                        "cur": adjustment_lines,
                        "pri": [],
                    },
                },
                {
                    "code": "OP_BEFORE_WC",
                    "name": "Operating profit before working capital changes",
                    "row_type": "subtotal",
                    "values": _val(
                        operating_profit_before_wc,
                        0.0,
                        0.0,
                        ws_show_total=True,
                        ws_show_breakdown=False,
                    ),
                },
                {
                    "code": "WC_HDR",
                    "name": "Changes in working capital:",
                    "row_type": "header",
                    "values": _val(0.0, 0.0, 0.0),
                },
                {
                    "code": "WC_AR",
                    "name": "Change in receivables",
                    "row_type": "breakdown",
                    "values": _val(
                        0.0,
                        0.0,
                        receivables_effect,
                        ws_show_total=False,
                        ws_show_breakdown=True,
                    ),
                },
                {
                    "code": "WC_INV",
                    "name": "Change in inventory",
                    "row_type": "breakdown",
                    "values": _val(
                        0.0,
                        0.0,
                        inventory_effect,
                        ws_show_total=False,
                        ws_show_breakdown=True,
                    ),
                },
                {
                    "code": "WC_AP",
                    "name": "Change in payables",
                    "row_type": "breakdown",
                    "values": _val(
                        0.0,
                        0.0,
                        payables_effect,
                        ws_show_total=False,
                        ws_show_breakdown=True,
                    ),
                },
                {
                    "code": "WC_VAT",
                    "name": "Change in VAT / tax balances",
                    "row_type": "breakdown",
                    "values": _val(
                        0.0,
                        0.0,
                        vat_effect,
                        ws_show_total=False,
                        ws_show_breakdown=True,
                    ),
                },
                {
                    "code": "WC_PREPAIDS",
                    "name": "Change in prepaid expenses",
                    "row_type": "normal",
                    "values": _val(prepaids_effect, 0.0),
                },
                {
                    "code": "CASH_GEN_OPS",
                    "name": "Cash generated from operations",
                    "row_type": "subtotal",
                    "values": _val(
                        cash_generated_from_ops,
                        0.0,
                        0.0,
                        ws_show_total=True,
                        ws_show_breakdown=False,
                    ),
                },
                {
                    "code": "NET_CASH_OP",
                    "name": "Net cash from operating activities",
                    "row_type": "total",
                    "values": _val(
                        net_operating,
                        0.0,
                        0.0,
                        ws_show_total=True,
                        ws_show_breakdown=False,
                    ),
                },
            ]
        else:
            lines = [
                {
                    "code": "NET_PROFIT",
                    "name": "Net profit / (loss)",
                    "row_type": "normal",
                    "values": _val(net_profit, 0.0),
                },
                {
                    "code": "ADJUST_HDR",
                    "name": "Adjustments for:",
                    "row_type": "header",
                    "values": _val(0.0, 0.0),
                },
                {
                    "code": "NONCASH",
                    "name": "Non-cash and other operating adjustments",
                    "row_type": "breakdown",
                    "values": _val(adjustments_total, 0.0),
                    "detail": {
                        "cur": adjustment_lines,
                        "pri": [],
                    },
                },
                {
                    "code": "OP_BEFORE_WC",
                    "name": "Operating profit before working capital changes",
                    "row_type": "subtotal",
                    "values": _val(operating_profit_before_wc, 0.0),
                },
                {
                    "code": "WC_HDR",
                    "name": "Changes in working capital:",
                    "row_type": "header",
                    "values": _val(0.0, 0.0),
                },
                {
                    "code": "WC_AR",
                    "name": "Change in receivables",
                    "row_type": "normal",
                    "values": _val(receivables_effect, 0.0),
                },
                {
                    "code": "WC_AP",
                    "name": "Change in payables",
                    "row_type": "normal",
                    "values": _val(payables_effect, 0.0),
                },
                {
                    "code": "WC_INV",
                    "name": "Change in inventory",
                    "row_type": "normal",
                    "values": _val(inventory_effect, 0.0),
                },
                {
                    "code": "WC_PREPAIDS",
                    "name": "Change in prepaid expenses",
                    "row_type": "normal",
                    "values": _val(prepaids_effect, 0.0),
                },
                {
                    "code": "WC_VAT",
                    "name": "Change in VAT / tax balances",
                    "row_type": "normal",
                    "values": _val(vat_effect, 0.0),
                },
            ]
        lines = _filter_statement_lines(lines)
        return {
            "total": net_operating,
            "lines": lines,
            "groups": {
                "adjustments_for": [
                    {
                        "code": "NONCASH",
                        "name": "Non-cash and other operating adjustments",
                        "amount": adjustments_total,
                        "detail": adjustment_lines,
                    }
                ],
                "working_capital": [
                    {"code": "WC_AR", "name": "Change in receivables", "amount": receivables_effect},
                    {"code": "WC_INV", "name": "Change in inventory", "amount": inventory_effect},
                    {"code": "WC_AP", "name": "Change in payables", "amount": payables_effect},
                    {"code": "WC_PREPAIDS", "name": "Change in prepaid expenses", "amount": prepaids_effect},
                    {"code": "WC_VAT", "name": "Change in VAT / tax balances", "amount": vat_effect},
                ],
            },
            "subtotals": {
                "operating_profit_before_wc": operating_profit_before_wc,
                "cash_generated_from_ops": cash_generated_from_ops,
            },
        }

    def _cash_journal_sections(df: date, dt: date) -> Dict[str, Any]:
        journals = get_journals_period_fn(company_id, df, dt)

        sec_totals = {"investing": 0.0, "financing": 0.0}
        sec_lines  = {"investing": [], "financing": []}

        for j in journals:
            lines = (j.get("journal_lines") or [])
            cash_lines = [ln for ln in lines if ac._is_cash_bank(ln)]
            if not cash_lines:
                continue

            cash_change = 0.0
            for cl in cash_lines:
                cash_change += float(cl.get("debit") or 0.0) - float(cl.get("credit") or 0.0)

            noncash = [ln for ln in lines if not ac._is_cash_bank(ln)]
            if not noncash:
                continue

            effects = []
            for ln in noncash:
                effects.append(float(ln.get("credit") or 0.0) - float(ln.get("debit") or 0.0))

            sum_effects = float(sum(effects))
            scale = 1.0
            if abs(sum_effects) > 1e-9 and abs(sum_effects - cash_change) > 0.01:
                scale = cash_change / sum_effects

            for ln, eff in zip(noncash, effects):
                adj = float(eff) * float(scale)
                sec = ac._classify_cf_section(ln)
                if sec not in ("investing", "financing"):
                    continue

                sec_totals[sec] += adj
                meta = ac.resolve_account_cf_meta(ln)
                sec_lines[sec].append({
                    "date": j.get("date"),
                    "ref": j.get("ref"),
                    "description": j.get("description"),
                    "account_name": ln.get("account_name") or ln.get("name") or (ln.get("account") or ln.get("account_code") or ""),
                    "memo": ln.get("memo") or "",
                    "amount": adj,
                    "cf_bucket": meta.get("bucket"),
                    "cf_role": meta.get("role"),
                    "cf_section": meta.get("section"),
                    "account_code": ln.get("account") or ln.get("account_code") or ln.get("code") or "",
                })
        return {"totals": sec_totals, "lines": sec_lines}

    def _line_amount(line: Dict[str, Any]) -> float:
        values = line.get("values") or {}
        return float(
            values.get("cur")
            or values.get("tot")
            or values.get("brk")
            or 0.0
        )

    def _line_key(line: Dict[str, Any]) -> str:
        code = str(line.get("code") or "").strip().upper()
        name = str(line.get("name") or "").strip().lower()

        if code in (
            "NET_PROFIT",
            "ADJUST_HDR",
            "NONCASH",
            "OP_BEFORE_WC",
            "WC_HDR",
            "WC_AR",
            "WC_AP",
            "WC_INV",
            "WC_PREPAIDS",
            "WC_VAT",
            "CASH_GEN_OPS",
            "NET_CASH_OP",
        ):
            return code

        if "depreciation" in name or "amortisation" in name or "amortization" in name:
            return "NONCASH"

        return f"{code}::{name}"

    def _merge_comparative_lines(
        current_lines: List[Dict[str, Any]],
        comparison_blocks: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        merged: Dict[str, Dict[str, Any]] = {}
        order: List[str] = []

        def ensure_line(line: Dict[str, Any]) -> Dict[str, Any]:
            key = _line_key(line)

            if key not in merged:
                display_name = line.get("name") or ""

                if key == "NONCASH::DEPRECIATION_AMORTISATION":
                    display_name = "Depreciation and amortisation"

                merged[key] = {
                    **line,
                    "name": display_name,
                    "values": {},
                    "detail": {},
                }
                order.append(key)

            return merged[key]

        for line in current_lines or []:
            row = ensure_line(line)
            row["values"]["cur"] = _line_amount(line)

            if line.get("detail"):
                row["detail"]["cur"] = (line.get("detail") or {}).get("cur", [])

        for idx, block in enumerate(comparison_blocks or [], start=1):
            col_key = "pri" if idx == 1 else f"p{idx}"

            for line in block.get("lines") or []:
                row = ensure_line(line)
                row["values"][col_key] = _line_amount(line)

                if line.get("detail"):
                    row.setdefault("detail", {})
                    row["detail"][col_key] = (line.get("detail") or {}).get("cur", [])

        return [merged[k] for k in order]

    # Current
    cf_cur = _build_cash_journal_analysis(
        get_journals_period_fn=get_journals_period_fn,
        company_id=company_id,
        date_from=date_from,
        date_to=date_to,
    )

    op_cur = _operating_indirect(date_from, date_to)
    jf_cur = {
        "totals": {
            "investing": float(cf_cur["totals"].get("investing") or 0.0),
            "financing": float(cf_cur["totals"].get("financing") or 0.0),
        },
        "lines": {
            "investing": cf_cur["lines"].get("investing", []),
            "financing": cf_cur["lines"].get("financing", []),
        },
    }

    # Force indirect operating cash to reconcile with direct operating cash
    op_cur["total"] = float(cf_cur["totals"].get("operating") or 0.0)

    # Comparisons
    op_comparisons = []
    jf_comparisons = []

    for pf, pt in comparison_ranges:
        cf_cmp = _build_cash_journal_analysis(
            get_journals_period_fn=get_journals_period_fn,
            company_id=company_id,
            date_from=pf,
            date_to=pt,
        )

        op_cmp = _operating_indirect(pf, pt)
        op_cmp["total"] = float(cf_cmp["totals"].get("operating") or 0.0)

        op_comparisons.append(op_cmp)

        jf_comparisons.append({
            "totals": {
                "investing": float(cf_cmp["totals"].get("investing") or 0.0),
                "financing": float(cf_cmp["totals"].get("financing") or 0.0),
            },
            "lines": {
                "investing": cf_cmp["lines"].get("investing", []),
                "financing": cf_cmp["lines"].get("financing", []),
            },
        })
    operating_comparison_totals = [
        float(op.get("total") or 0.0)
        for op in op_comparisons
    ]

    operating = {
        "key": "operating",
        "label": "Cash flows from operating activities",
        "lines": _merge_comparative_lines(op_cur["lines"], op_comparisons),
        "totals": _val(
            float(op_cur["total"]),
            operating_comparison_totals,
            0.0,
            ws_show_total=True if (is_ws_2 or is_ws_3) else False,
            ws_show_breakdown=False,
        ),
    }

    investing_total_cur = float(jf_cur["totals"]["investing"])
    financing_total_cur = float(jf_cur["totals"]["financing"])

    investing_comparison_totals = [
        float(jf["totals"]["investing"])
        for jf in jf_comparisons
    ]

    financing_comparison_totals = [
        float(jf["totals"]["financing"])
        for jf in jf_comparisons
    ]

    investing_lines = []
    for row in _aggregate_cf_detail_lines(jf_cur["lines"]["investing"]):
        cur_amt = float(row.get("amount") or 0.0)
        investing_lines.append({
            "code": "DETAIL",
            "name": row.get("account_name") or row.get("description") or "Investing item",
            "row_type": "breakdown" if (is_ws_2 or is_ws_3) else "normal",
            "values": _val(
                0.0 if (is_ws_2 or is_ws_3) else cur_amt,
                [],
                cur_amt,
                ws_show_total=False,
                ws_show_breakdown=True if (is_ws_2 or is_ws_3) else False,
            ),
        })

    investing = {
        "key": "investing",
        "label": "Cash flows from investing activities",
        "lines": investing_lines,
        "totals": _val(
            investing_total_cur,
            investing_comparison_totals,
            0.0,
            ws_show_total=True if (is_ws_2 or is_ws_3) else False,
            ws_show_breakdown=False,
        ),
    }

    financing_lines = []
    for row in _aggregate_cf_detail_lines(jf_cur["lines"]["financing"]):
        cur_amt = float(row.get("amount") or 0.0)
        financing_lines.append({
            "code": "DETAIL",
            "name": row.get("account_name") or row.get("description") or "Financing item",
            "row_type": "breakdown" if (is_ws_2 or is_ws_3) else "normal",
            "values": _val(
                0.0 if (is_ws_2 or is_ws_3) else cur_amt,
                [],
                cur_amt,
                ws_show_total=False,
                ws_show_breakdown=True if (is_ws_2 or is_ws_3) else False,
            ),
        })

    financing = {
        "key": "financing",
        "label": "Cash flows from financing activities",
        "lines": financing_lines,
        "totals": _val(
            financing_total_cur,
            financing_comparison_totals,
            0.0,
            ws_show_total=True if (is_ws_2 or is_ws_3) else False,
            ws_show_breakdown=False,
        ),
    }

    net_cur = float(op_cur["total"]) + investing_total_cur + financing_total_cur

    net_comparisons = [
        operating_comparison_totals[i]
        + investing_comparison_totals[i]
        + financing_comparison_totals[i]
        for i in range(len(comparison_ranges))
    ]

    tb_open_rows = get_trial_balance_asof_fn(company_id, None, date_from - timedelta(days=1)) or []
    tb_close_rows = get_trial_balance_asof_fn(company_id, None, date_to) or []

    opening_cash = float(ac.cash_position_amount(tb_open_rows))
    closing_cash = float(ac.cash_position_amount(tb_close_rows))

    opening_cash_comparisons = []
    closing_cash_comparisons = []
    delta_cash_comparisons = []

    for pf, pt in comparison_ranges:
        tb_open_cmp = get_trial_balance_asof_fn(company_id, None, pf - timedelta(days=1)) or []
        tb_close_cmp = get_trial_balance_asof_fn(company_id, None, pt) or []

        opening_cmp = float(ac.cash_position_amount(tb_open_cmp))
        closing_cmp = float(ac.cash_position_amount(tb_close_cmp))

        opening_cash_comparisons.append(opening_cmp)
        closing_cash_comparisons.append(closing_cmp)
        delta_cash_comparisons.append(closing_cmp - opening_cmp)

    delta_cash = closing_cash - opening_cash
    reconciliation_gap = delta_cash - net_cur

    reconciliation_gap_comparisons = [
        float(delta_cash_comparisons[i]) - float(net_comparisons[i])
        for i in range(len(net_comparisons))
    ]

    comparison_periods = []
    for idx, (pf, pt) in enumerate(comparison_ranges, start=1):
        key = "pri" if idx == 1 else f"p{idx}"
        comparison_periods.append({
            "key": key,
            "from": pf.isoformat(),
            "to": pt.isoformat(),
        })

    ctx = get_company_context_fn(company_id) or {}

    return {
        "meta": {
            "company_id": company_id,
            "company_name": ctx.get("company_name"),
            "currency": ctx.get("currency") or "ZAR",
            "statement": "cf",
            "template": template,
            "basis": basis,
            "compare": compare_mode,
            "comparison_periods": comparison_periods,
            "method": "indirect",
            "preview_columns": preview_columns,
            "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
            "prior_period": {"from": prior_from.isoformat(), "to": prior_to.isoformat()} if has_prior else None,
        },
        "columns": columns,
        "sections": [operating, investing, financing],
        "opening_balance": {
            "label": "Opening cash and cash equivalents",
            "values": _val(
                opening_cash,
                opening_cash_comparisons,
                0.0,
                ws_show_total=True if (is_ws_2 or is_ws_3) else False,
                ws_show_breakdown=False,
            )
        },
        "closing_balance": {
            "label": "Closing cash and cash equivalents",
            "values": _val(
                closing_cash,
                closing_cash_comparisons,
                0.0,
                ws_show_total=True if (is_ws_2 or is_ws_3) else False,
                ws_show_breakdown=False,
            )
        },
        "net_change": {
            "label": "Net change in cash and cash equivalents",
            "values": _val(
                net_cur,
                net_comparisons,
                0.0,
                ws_show_total=True if (is_ws_2 or is_ws_3) else False,
                ws_show_breakdown=False,
            )
        },
        "reconciliation": {
            "delta_from_tb": {
                "label": "Net change per TB (closing - opening)",
                "values": _val(delta_cash, delta_cash_comparisons, 0.0)
            },
            "gap": {
                "label": "Reconciliation gap (TB delta - cashflow net change)",
                "values": _val(reconciliation_gap, reconciliation_gap_comparisons, 0.0)
            },
        },
    }
