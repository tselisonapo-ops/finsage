# BackEnd/Services/reporting/cashflow_templates.py
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Callable, Dict, List, Optional
from BackEnd.Services import accounting_classifiers as ac

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
    return cm if cm in ("none", "prior_period", "prior_year") else "none"

def _resolve_cf_columns(*, basis: str, cols_mode: int, preview_columns: int,
                        compare_mode: str, prior_from: Optional[date], prior_to: Optional[date]):
    is_mgmt = (str(basis or "external").lower() in ("management", "internal"))
    cols_mode = int(cols_mode or 1)

    # management worksheet layouts
    is_ws_2 = is_mgmt and cols_mode == 2
    is_ws_3 = is_mgmt and cols_mode == 3

    # worksheet never compares
    if is_ws_2 or is_ws_3:
        return {
            "is_ws_2": is_ws_2,
            "is_ws_3": is_ws_3,
            "has_prior": False,
            "compare_mode": "none",
            "prior_from": None,
            "prior_to": None,
            "columns": (
                [{"key": "brk", "label": "Breakdown"}, {"key": "tot", "label": "Total"}] +
                ([{"key": "var", "label": "Variance"}] if is_ws_3 else [])
            ),
        }

    # preview=2 forces no compare
    if preview_columns == 2:
        compare_mode = "none"
        prior_from = None
        prior_to = None

    has_prior = bool(
        preview_columns == 1
        and prior_from and prior_to
        and compare_mode in ("prior_year", "prior_period")
    )

    columns = [{"key": "cur", "label": "Current"}]
    if has_prior:
        columns += [{"key": "pri", "label": "Prior"}, {"key": "delta", "label": "Δ"}]

    return {
        "is_ws_2": False,
        "is_ws_3": False,
        "has_prior": has_prior,
        "compare_mode": compare_mode,
        "prior_from": prior_from,
        "prior_to": prior_to,
        "columns": columns,
    }

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
    )

    is_ws_2 = cfg["is_ws_2"]
    is_ws_3 = cfg["is_ws_3"]
    has_prior = cfg["has_prior"]
    compare_mode = cfg["compare_mode"]
    prior_from = cfg["prior_from"]
    prior_to = cfg["prior_to"]
    columns = cfg["columns"]
    
    def _val(cur_amt: float, pri_amt: float = 0.0) -> Dict[str, float]:
        if is_ws_2:
            return {"brk": 0.0, "tot": float(cur_amt)}
        if is_ws_3:
            return {"brk": 0.0, "tot": float(cur_amt), "var": float(cur_amt)}  # var can be used later
        if not has_prior:
            return {"cur": float(cur_amt)}
        return {"cur": float(cur_amt), "pri": float(pri_amt), "delta": float(cur_amt - pri_amt)}

    def _calc_period_cf(df: date, dt: date) -> Dict[str, Any]:
        journals = get_journals_period_fn(company_id, df, dt)

        sec_totals = {"operating": 0.0, "investing": 0.0, "financing": 0.0}
        sec_lines = {"operating": [], "investing": [], "financing": []}

        for j in journals:
            jdate = j.get("date")
            jref = j.get("ref")
            jdesc = j.get("description")
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
                if sec == "ignore":
                    continue
                if sec not in ("operating", "investing", "financing"):
                    sec = "operating"

                sec_totals[sec] += adj
                sec_lines[sec].append({
                    "date": jdate,
                    "ref": jref,
                    "description": jdesc,
                    "account_name": ln.get("account_name") or ln.get("name") or (ln.get("account") or ln.get("account_code") or ""),
                    "memo": ln.get("memo") or "",
                    "amount": adj,
                })

        return {"totals": sec_totals, "lines": sec_lines}

    # Snapshots
    open_as_of_cur = date_from - timedelta(days=1)
    close_as_of_cur = date_to

    tb_open_cur = tb_as_of_fn(company_id, open_as_of_cur)
    tb_close_cur = tb_as_of_fn(company_id, close_as_of_cur)

    cash_open_cur = cash_position_from_tb_fn(tb_open_cur)
    cash_close_cur = cash_position_from_tb_fn(tb_close_cur)

    cash_open_pri = cash_close_pri = None
    if has_prior:
        open_as_of_pri = prior_from - timedelta(days=1)
        close_as_of_pri = prior_to
        tb_open_pri = tb_as_of_fn(company_id, open_as_of_pri)
        tb_close_pri = tb_as_of_fn(company_id, close_as_of_pri)
        cash_open_pri = cash_position_from_tb_fn(tb_open_pri)
        cash_close_pri = cash_position_from_tb_fn(tb_close_pri)

    cur = _calc_period_cf(date_from, date_to)
    pri = _calc_period_cf(prior_from, prior_to) if has_prior else None

    def _section_block(key: str, label: str) -> Dict[str, Any]:
        cur_amt = float(cur["totals"].get(key) or 0.0)
        pri_amt = float(pri["totals"].get(key) or 0.0) if has_prior and pri else 0.0
        return {
            "key": key,
            "label": label,
            "lines": [{
                "code": "DETAIL",
                "name": "Details",
                "values": _val(cur_amt, pri_amt),
                "detail": {
                    "cur": cur["lines"].get(key, []),
                    "pri": pri["lines"].get(key, []) if has_prior and pri else [],
                }
            }],
            "totals": _val(cur_amt, pri_amt),
        }

    operating = _section_block("operating", "Net cash from operating activities")
    investing = _section_block("investing", "Net cash from investing activities")
    financing = _section_block("financing", "Net cash from financing activities")

    net_cur = float(cur["totals"]["operating"]) + float(cur["totals"]["investing"]) + float(cur["totals"]["financing"])
    net_pri = 0.0
    if has_prior and pri:
        net_pri = float(pri["totals"]["operating"]) + float(pri["totals"]["investing"]) + float(pri["totals"]["financing"])

    delta_cash_cur = float(cash_close_cur["position"]) - float(cash_open_cur["position"])
    delta_cash_pri = 0.0
    if has_prior and cash_open_pri and cash_close_pri:
        delta_cash_pri = float(cash_close_pri["position"]) - float(cash_open_pri["position"])

    ctx = get_company_context_fn(company_id) or {}

    return {
        "meta": {
            "company_id": company_id,
            "company_name": ctx.get("company_name"),
            "currency": ctx.get("currency") or "ZAR",
            "statement": "cf",
            "template": template,
            "basis": basis,
            "compare": compare_mode,  # ✅ normalized
            "method": "direct",
            "preview_columns": preview_columns,
            "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
            "prior_period": {"from": prior_from.isoformat(), "to": prior_to.isoformat()} if has_prior else None,
        },
        "columns": columns,
        "sections": [operating, investing, financing],
        "net_change": {"label": "Net change in cash and cash equivalents", "values": _val(net_cur, net_pri)},
        "cash_position": {
            "opening": {
                "label": "Cash & cash equivalents (opening)",
                "values": _val(
                    float(cash_open_cur["position"]),
                    float(cash_open_pri["position"]) if has_prior and cash_open_pri else 0.0
                ),
                "breakdown": {
                    "cur": {"cash": cash_open_cur["cash_positive"], "overdraft": cash_open_cur["overdraft"]},
                    "pri": {"cash": cash_open_pri["cash_positive"], "overdraft": cash_open_pri["overdraft"]} if has_prior and cash_open_pri else None,
                },
            },
            "closing": {
                "label": "Cash & cash equivalents (closing)",
                "values": _val(
                    float(cash_close_cur["position"]),
                    float(cash_close_pri["position"]) if has_prior and cash_close_pri else 0.0
                ),
                "breakdown": {
                    "cur": {"cash": cash_close_cur["cash_positive"], "overdraft": cash_close_cur["overdraft"]},
                    "pri": {"cash": cash_close_pri["cash_positive"], "overdraft": cash_close_pri["overdraft"]} if has_prior and cash_close_pri else None,
                },
            },
            "delta_from_tb": {"label": "Net change per TB (closing - opening)", "values": _val(delta_cash_cur, delta_cash_pri)},
            "reconciliation_gap": {"label": "Reconciliation gap (TB delta - cashflow net change)", "values": _val(delta_cash_cur - net_cur, delta_cash_pri - net_pri)},
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
    )

    is_ws_2 = cfg["is_ws_2"]
    is_ws_3 = cfg["is_ws_3"]
    has_prior = cfg["has_prior"]
    compare_mode = cfg["compare_mode"]
    prior_from = cfg["prior_from"]
    prior_to = cfg["prior_to"]
    columns = cfg["columns"]

    def _val(
        cur_amt: float = 0.0,
        pri_amt: float = 0.0,
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
        if not has_prior:
            return {"cur": float(cur_amt)}
        return {"cur": float(cur_amt), "pri": float(pri_amt), "delta": float(cur_amt - pri_amt)}

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
            "vat": 0.0,
        }

        noncash_addback = 0.0
        journals = get_journals_period_fn(company_id, df, dt)
        all_codes = set(tb_open.keys()) | set(tb_close.keys())

        resolved_noncash_accounts: List[str] = []

        # --- Get depreciation/amortisation directly from P&L ---
        noncash_addback = 0.0
        pnl_lines = pnl.get("lines") or []

        for ln in pnl_lines:
            name = str(ln.get("name") or "").lower()
            amount = float(ln.get("amount") or 0.0)

            if (
                "depreciation" in name
                or "amortisation" in name
                or "amortization" in name
            ):
                noncash_addback += abs(amount)
                resolved_noncash_accounts.append(name)

                dep_journal_exists = any(
                    str(j.get("source") or "").lower() == "asset_depreciation"
                    for j in journals
                )

        if dep_journal_exists and not resolved_noncash_accounts:
            raise RuntimeError(
                f"Cash flow rendering blocked: asset_depreciation journals exist for company {company_id}, "
                f"but no depreciation/amortisation account could be resolved from TB/COA metadata "
                f"for period {df} to {dt}."
            )

        for code in all_codes:
            r_close = tb_close.get(code) or {}
            r_open = tb_open.get(code) or {}
            row_any = r_close if r_close else r_open

            if row_any and ac._is_cash_bank(row_any):
                continue

            name_txt = (r_close.get("name") or r_open.get("name") or "").lower()
            sec_txt = (r_close.get("section") or r_open.get("section") or "").lower()
            cat_txt = (r_close.get("category") or r_open.get("category") or "").lower()
            text = " ".join([sec_txt, cat_txt, name_txt])

            kind_close = _kind_from_row(r_close) if r_close else _kind_from_row(r_open)
            bal_close = _bs_signed(kind_close, r_close)
            bal_open = _bs_signed(kind_close, r_open)

            delta = bal_close - bal_open

            if any(k in text for k in ["receivable", "debtors", "accounts receivable", "trade receivable"]):
                wc["receivables"] += delta
            elif any(k in text for k in ["payable", "creditor", "accounts payable", "trade payable", "accrual", "accrued"]):
                wc["payables"] += delta
            elif any(k in text for k in ["inventory", "stock"]):
                wc["inventory"] += delta
            elif any(k in text for k in ["vat", "tax", "sars", "input vat", "output vat"]):
                wc["vat"] += delta

        receivables_effect = -wc["receivables"]
        inventory_effect   = -wc["inventory"]
        vat_effect         = -wc["vat"]
        payables_effect    = +wc["payables"]

        operating_profit_before_wc = net_profit + noncash_addback
        cash_generated_from_ops = (
            operating_profit_before_wc
            + receivables_effect
            + payables_effect
            + inventory_effect
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
                    "name": "Depreciation / amortisation / other non-cash items",
                    "row_type": "breakdown",
                    "values": _val(
                        0.0,
                        0.0,
                        noncash_addback,
                        ws_show_total=False,
                        ws_show_breakdown=True,
                    ),
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
                {"code":"NET_PROFIT", "name":"Net profit / (loss)", "row_type": "normal", "values": _val(net_profit, 0.0)},
                {"code":"NONCASH", "name":"Adjust for:", "row_type": "normal", "values": _val(noncash_addback, 0.0)},
                {"code":"WC_AR", "name":"Change in receivables", "row_type": "normal", "values": _val(receivables_effect, 0.0)},
                {"code":"WC_AP", "name":"Change in payables", "row_type": "normal", "values": _val(payables_effect, 0.0)},
                {"code":"WC_INV", "name":"Change in inventory", "row_type": "normal", "values": _val(inventory_effect, 0.0)},
                {"code":"WC_VAT", "name":"Change in VAT / tax balances", "row_type": "normal", "values": _val(vat_effect, 0.0)},
            ]

        return {
            "total": net_operating,
            "lines": lines,
            "groups": {
                "adjustments_for": [
                    {
                        "code": "NONCASH",
                        "name": "Depreciation / amortisation / other non-cash items",
                        "amount": noncash_addback,
                    }
                ],
                "working_capital": [
                    {"code": "WC_AR", "name": "Change in receivables", "amount": receivables_effect},
                    {"code": "WC_INV", "name": "Change in inventory", "amount": inventory_effect},
                    {"code": "WC_AP", "name": "Change in payables", "amount": payables_effect},
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
                sec_lines[sec].append({
                    "date": j.get("date"),
                    "ref": j.get("ref"),
                    "description": j.get("description"),
                    "account_name": ln.get("account_name") or ln.get("name") or (ln.get("account") or ln.get("account_code") or ""),
                    "memo": ln.get("memo") or "",
                    "amount": adj,
                })

        return {"totals": sec_totals, "lines": sec_lines}

    # Current
    op_cur = _operating_indirect(date_from, date_to)
    jf_cur = _cash_journal_sections(date_from, date_to)

    # Prior
    op_pri = None
    jf_pri = None
    if has_prior:
        op_pri = _operating_indirect(prior_from, prior_to)
        jf_pri = _cash_journal_sections(prior_from, prior_to)

    # Fill PRI values into operating lines when comparing
    if has_prior and op_pri:
        pri_by_code = {ln.get("code"): float((ln.get("values") or {}).get("cur") or 0.0) for ln in (op_pri.get("lines") or [])}
        for ln in op_cur["lines"]:
            code = ln.get("code")
            cur_v = float((ln.get("values") or {}).get("cur") or 0.0)
            pri_v = float(pri_by_code.get(code) or 0.0)
            ln["values"] = _val(cur_v, pri_v)

    operating = {
        "key": "operating",
        "label": "Cash flows from operating activities",
        "lines": op_cur["lines"],
        "totals": _val(
            float(op_cur["total"]),
            float(op_pri["total"]) if has_prior and op_pri else 0.0,
            0.0,
            ws_show_total=True if (is_ws_2 or is_ws_3) else False,
            ws_show_breakdown=False,
        ),
    }

    investing_total_cur = float(jf_cur["totals"]["investing"])
    financing_total_cur = float(jf_cur["totals"]["financing"])

    investing_total_pri = float(jf_pri["totals"]["investing"]) if has_prior and jf_pri else 0.0
    financing_total_pri = float(jf_pri["totals"]["financing"]) if has_prior and jf_pri else 0.0

    investing_lines = []
    for row in jf_cur["lines"]["investing"]:
        cur_amt = float(row.get("amount") or 0.0)
        investing_lines.append({
            "code": "DETAIL",
            "name": row.get("account_name") or row.get("description") or "Investing item",
            "row_type": "breakdown" if (is_ws_2 or is_ws_3) else "normal",
            "values": _val(
                0.0 if (is_ws_2 or is_ws_3) else cur_amt,
                0.0,
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
            investing_total_pri,
            0.0,
            ws_show_total=True if (is_ws_2 or is_ws_3) else False,
            ws_show_breakdown=False,
        ),
    }

    financing_lines = []
    for row in jf_cur["lines"]["financing"]:
        cur_amt = float(row.get("amount") or 0.0)
        financing_lines.append({
            "code": "DETAIL",
            "name": row.get("account_name") or row.get("description") or "Financing item",
            "row_type": "breakdown" if (is_ws_2 or is_ws_3) else "normal",
            "values": _val(
                0.0 if (is_ws_2 or is_ws_3) else cur_amt,
                0.0,
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
            financing_total_pri,
            0.0,
            ws_show_total=True if (is_ws_2 or is_ws_3) else False,
            ws_show_breakdown=False,
        ),
    }

    net_cur = float(op_cur["total"]) + investing_total_cur + financing_total_cur
    net_pri = (float(op_pri["total"]) + investing_total_pri + financing_total_pri) if has_prior and op_pri else 0.0

    # Opening and closing cash balances from TB snapshots
    tb_open_rows = get_trial_balance_asof_fn(company_id, None, date_from - timedelta(days=1)) or []
    tb_close_rows = get_trial_balance_asof_fn(company_id, None, date_to) or []

    opening_cash = float(ac.cash_position_amount(tb_open_rows))
    closing_cash = float(ac.cash_position_amount(tb_close_rows))

    ctx = get_company_context_fn(company_id) or {}

    # --- ADD THIS BLOCK HERE (just before return) ---
    delta_cash_pri = 0.0
    if has_prior:
        tb_open_rows_pri = get_trial_balance_asof_fn(company_id, None, prior_from - timedelta(days=1)) or []
        tb_close_rows_pri = get_trial_balance_asof_fn(company_id, None, prior_to) or []
        opening_cash_pri = float(ac.cash_position_amount(tb_open_rows_pri))
        closing_cash_pri = float(ac.cash_position_amount(tb_close_rows_pri))
        delta_cash_pri = closing_cash_pri - opening_cash_pri

    delta_cash = closing_cash - opening_cash
    reconciliation_gap = delta_cash - net_cur
    reconciliation_gap_pri = delta_cash_pri - net_pri

    return {
        "meta": {
            "company_id": company_id,
            "company_name": ctx.get("company_name"),
            "currency": ctx.get("currency") or "ZAR",
            "statement": "cf",
            "template": template,
            "basis": basis,
            "compare": compare_mode,
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
                0.0,
                0.0,
                ws_show_total=True if (is_ws_2 or is_ws_3) else False,
                ws_show_breakdown=False,
            )
        },
        "closing_balance": {
            "label": "Closing cash and cash equivalents",
            "values": _val(
                closing_cash,
                0.0,
                0.0,
                ws_show_total=True if (is_ws_2 or is_ws_3) else False,
                ws_show_breakdown=False,
            )
        },
        "net_change": {
            "label": "Net change in cash and cash equivalents",
            "values": _val(
                net_cur,
                net_pri,
                0.0,
                ws_show_total=True if (is_ws_2 or is_ws_3) else False,
                ws_show_breakdown=False,
            )
        },
        "reconciliation": {
            "delta_from_tb": {
                "label": "Net change per TB (closing - opening)",
                "values": _val(delta_cash, delta_cash_pri, 0.0)
            },
            "gap": {
                "label": "Reconciliation gap (TB delta - cashflow net change)",
                "values": _val(reconciliation_gap, reconciliation_gap_pri, 0.0)
            },
        },
    }
