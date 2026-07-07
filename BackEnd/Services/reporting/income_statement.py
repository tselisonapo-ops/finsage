from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from BackEnd.Services.company_context import get_company_context
from BackEnd.Services.industry_profiles import get_industry_profile
from BackEnd.Services import accounting_classifiers as ac
from . import reporting_helpers as rh


def get_pnl_full_v2(
    self,
    company_id: int,
    date_from: date,
    date_to: date,
    template: str = "ifrs",
    basis: str = "external",
    compare: str = "none",
    cols_mode: int = 1,   # kept for API compatibility but forced to 1 internally
    detail: str = "summary",
    ctx: Optional[Dict[str, Any]] = None,

    # ✅ NEW: allow caller-supplied priors (resolved by resolver)
    prior_from: Optional[date] = None,
    prior_to: Optional[date] = None,

    comparison_ranges: Optional[List[Tuple[date, date]]] = None,
    comparison_years: int = 1,

    # ✅ swallow any future kwargs safely
    **_unused: Any,
) -> Dict[str, Any]:
    """
    IAS 1-style multi-tier P&L (external reporting only).
    - basis is always treated as 'external'
    - cols_mode is always 1 (Amount / Prior / Delta)
    - detail controls line density: summary | mid | full
    """

    # -----------------------------
    # Context from DB
    # -----------------------------
    ctx = ctx or get_company_context(self, company_id)
    if not ctx:
        ctx = {}

    currency = ctx.get("currency") or "USD"
    company_name = ctx.get("name") or ctx.get("company_name") or ""

    organization_type = (
        ctx.get("organization_type")
        or ctx.get("organisation_type")
        or "private_company"
    ).strip().lower()

    org_labels = rh.org_statement_labels(organization_type)

    industry = ctx.get("industry")
    sub_industry = ctx.get("sub_industry")
    prof = ctx.get("industry_profile") or get_industry_profile(industry, sub_industry)

    template = (template or "ifrs").lower()
    if template not in ("ifrs", "npo"):
        template = "ifrs"

    # IAS 1 engine is always external
    basis = (basis or "external").lower()
    if basis not in ("external", "management"):
        basis = "external"

    compare = (compare or "none").lower()
    if compare not in ("none", "prior_period", "prior_year", "multi_year"):
        compare = "none"

    detail = (detail or "summary").lower()
    if detail not in (
        "summary", "mid", "semi", "full", "detailed",
        "semi-detailed", "semidetailed", "ias1", "collapsed"
    ):
        detail = "summary"

    # cols_mode is fixed for IAS 1
    cols_mode = 1

    DETAIL_MAP = {
        "summary": "summary",
        "ias1": "summary",
        "collapsed": "summary",
        "mid": "mid",
        "semi": "mid",
        "semi-detailed": "mid",
        "semidetailed": "mid",
        "full": "full",
        "detailed": "full",
    }
    detail = DETAIL_MAP.get(detail, "summary")

    if detail == "summary":
        mode = "summary"
    elif detail == "mid":
        mode = "semi"
    else:
        mode = "full"

    # -----------------------------
    # Industry switches
    # -----------------------------
    uses_cogs = bool(prof.get("uses_cogs", False))
    is_service_only = bool(prof.get("is_service_only", False))
    show_cogs = uses_cogs and not is_service_only

    # -----------------------------
    # Inventory method switch
    # -----------------------------
    # External = perpetual (show only COGS)
    # Management/internal = periodic (show trading breakdown)
    inventory_method = "perpetual" if basis == "external" else "periodic"

    # -----------------------------
    # TB rows for current + comparisons
    # -----------------------------
    cur_rows = self.get_pnl_trial_balance_movement(company_id, date_from, date_to) or []

    if comparison_ranges is None:
        comparison_ranges = []

        if compare == "multi_year":
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

        elif compare != "none":
            if prior_from and prior_to:
                comparison_ranges.append((prior_from, prior_to))
            else:
                pf, pt = rh.build_compare_range(date_from, date_to, compare)
                if pf and pt:
                    comparison_ranges.append((pf, pt))

    comparison_rows_by_key: Dict[str, List[Dict[str, Any]]] = {}
    comparison_labels_by_key: Dict[str, str] = {}

    for idx, (pf, pt) in enumerate(comparison_ranges, start=1):
        key = "pri" if idx == 1 else f"p{idx}"
        comparison_rows_by_key[key] = self.get_pnl_trial_balance_movement(company_id, pf, pt) or []
        comparison_labels_by_key[key] = rh.label_period(pf, pt)

    has_prior = len(comparison_ranges) > 0

    pri_from, pri_to = comparison_ranges[0] if has_prior else (None, None)
    pri_rows = comparison_rows_by_key.get("pri", []) if has_prior else []

    cur_label = rh.label_period(date_from, date_to)
    pri_label = comparison_labels_by_key.get("pri", "") if has_prior else ""

    # -----------------------------
    # Columns (IAS 1: cur/pri(/delta))
    # -----------------------------
    columns = [{"key": "cur", "label": "Current"}]

    if has_prior:
        columns.append({"key": "pri", "label": "Prior"})

        for idx in range(2, len(comparison_ranges) + 1):
            columns.append({"key": f"p{idx}", "label": f"Prior {idx}"})

        columns.append({"key": "delta", "label": "Δ"})

    # -----------------------------
    # Helpers
    # -----------------------------
    def _row_key(r: Dict[str, Any]) -> str:
        return str(r.get("code") or r.get("account") or "").strip()

    def _pnl_contrib(r: Dict[str, Any]) -> float:
        """
        Signed contribution:
          + revenue increases profit
          - cogs/expense decrease profit
        """
        kind = ac._classify_tb_row(r)
        dr = float(r.get("debit") or r.get("debit_total") or 0.0)
        cr = float(r.get("credit") or r.get("credit_total") or 0.0)

        if kind == "revenue":
            return cr - dr
        if kind in ("cogs", "expense"):
            return -(dr - cr)

        text = ac._row_text(r)
        if any(k in text for k in ("income", "interest received", "other income", "gain")):
            return cr - dr
        return -(dr - cr)

    def _emit(code: str, name: str, values: Dict[str, float],
              meta: Optional[dict] = None) -> Dict[str, Any]:
        out = {"code": code or "", "name": name or "", "values": values}
        if meta:
            out["meta"] = meta
        return out

    def _is_pnl_row(r: Dict[str, Any]) -> bool:
        k = ac._classify_tb_row(r)

        if basis == "management":
            # internal view: more permissive
            return k in ("revenue", "cogs", "expense", "other", "unknown")

        # external view
        return k in ("revenue", "cogs", "expense", "other")

    cur_rows = [r for r in cur_rows if _is_pnl_row(r)]
    pri_rows = [r for r in pri_rows if _is_pnl_row(r)] if has_prior else []

    def _group_rows(rows: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        groups = {"revenue": [], "cogs": [], "expense": [], "other": []}
        for r in rows:
            k = ac._classify_tb_row(r)
            if k in groups:
                groups[k].append(r)
        return groups

    def _is_tax(r: Dict[str, Any]) -> bool:
        text = ac._row_text(r)
        tag = (ac._std_tag(r) or "").lower()
        code = str(r.get("code") or r.get("account") or "").strip()

        if any(x in text for x in ("vat", "gst", "output vat", "input vat", "value added")):
            return False
        if code in ("1410", "2310"):
            return False

        if "income tax" in text or "corporate tax" in text:
            return True
        if "ias 12" in tag:
            return True
        return False

    def _without_tax(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [r for r in rows if not _is_tax(r)]

    # -----------------------------
    # Groups + prior mapping
    # -----------------------------
    cur_tax_rows = [r for r in cur_rows if _is_tax(r)]

    cur_g = _group_rows(_without_tax(cur_rows))

    pri_g = _group_rows(_without_tax(pri_rows)) if has_prior else {
        "revenue": [], "cogs": [], "expense": [], "other": []
    } 

    # ----------------------------------
    # Perpetual view (external only)
    # Hide periodic trading components
    # ----------------------------------
    inventory_method = (prof.get("inventory_method") or "perpetual").lower()

    if show_cogs and inventory_method == "perpetual":
        # Only show true COGS lines (from sales inventory hook)
        # Hide periodic/trading breakdown lines
        def keep_cogs_row(r):
            code = str(r.get("code") or r.get("account") or "")
            if code.startswith("PL_COS_"):
                return True  # ✅ keep real COGS postings in perpetual
            b = ac._pnl_bucket(r, prof)
            return b not in ("PURCHASES","PURCHASE_DISCOUNTS","PURCHASE_RETURNS","INV_BEGIN","INV_END","FREIGHT_IN")

        cur_g["cogs"] = [r for r in cur_g["cogs"] if keep_cogs_row(r)]
        if has_prior:
            pri_g["cogs"] = [r for r in pri_g["cogs"] if keep_cogs_row(r)]
            

    # -----------------------------
    # Prior maps for all comparison periods
    # -----------------------------
    comparison_by_code: Dict[str, Dict[str, Dict[str, Any]]] = {}

    for key, rows_for_key in comparison_rows_by_key.items():
        comparison_by_code[key] = {
            _row_key(r): r
            for r in (rows_for_key or [])
        }

    def _vals_multi(cur_amt: float, comparison_amounts: Optional[Dict[str, float]] = None) -> Dict[str, float]:
        v = {"cur": float(cur_amt)}

        comparison_amounts = comparison_amounts or {}

        if has_prior:
            pri_amt = float(comparison_amounts.get("pri", 0.0))
            v["pri"] = pri_amt

            for idx in range(2, len(comparison_ranges) + 1):
                key = f"p{idx}"
                v[key] = float(comparison_amounts.get(key, 0.0))

            v["delta"] = float(v["cur"] - v["pri"])

        return v


    def _line_amounts_from_rows(rows: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], float]:
        ranked = sorted(rows, key=lambda r: abs(_pnl_contrib(r)), reverse=True)

        if mode == "summary":
            show = ranked
        elif mode == "semi":
            show = ranked[:8]
        else:
            show = ranked

        lines: List[Dict[str, Any]] = []

        for r in show:
            code = _row_key(r)
            name = r.get("name") or code

            # ✅ Perpetual external view: rename purchases-like COS lines for display
            if show_cogs and inventory_method == "perpetual":
                if (
                    code.startswith("PL_COS_")
                    and (name or "").strip().lower() in ("purchases", "purchase", "inventory purchases")
                ):
                    name = "Cost of sales"

            cur_amt = _pnl_contrib(r)

            comparison_amounts: Dict[str, float] = {}

            if has_prior:
                for key, by_code in comparison_by_code.items():
                    comparison_row = by_code.get(code)
                    comparison_amounts[key] = (
                        _pnl_contrib(comparison_row)
                        if comparison_row
                        else 0.0
                    )

            v = _vals_multi(cur_amt, comparison_amounts)

            if not rh.line_has_amount({"values": v}):
                continue

            lines.append(_emit(code, name, v, meta={
                "section": r.get("section"),
                "category": r.get("category")
            }))

        total = float(sum(_pnl_contrib(r) for r in rows))
        return lines, total


    # -----------------------------
    # Labels / totals
    # -----------------------------
    pnl_labels = prof.get("pnl_labels") or {}
    cogs_label = pnl_labels.get("cogs") or ("Cost of sales" if show_cogs else "Cost of revenue")

    rev_lines, rev_total   = _line_amounts_from_rows(cur_g["revenue"])
    cogs_lines, cogs_total = _line_amounts_from_rows(cur_g["cogs"])
    exp_lines, exp_total   = _line_amounts_from_rows(cur_g["expense"])
    oth_lines, oth_total   = _line_amounts_from_rows(cur_g["other"])


    def _total_for_group(key: str, group_name: str) -> float:
        rows_for_key = comparison_rows_by_key.get(key, []) or []
        rows_for_key = [r for r in rows_for_key if _is_pnl_row(r)]

        tax_filtered = _without_tax(rows_for_key)
        grouped = _group_rows(tax_filtered)

        return float(sum(_pnl_contrib(r) for r in grouped.get(group_name, [])))


    def _tax_total_for_key(key: str) -> float:
        rows_for_key = comparison_rows_by_key.get(key, []) or []
        rows_for_key = [r for r in rows_for_key if _is_pnl_row(r)]
        return float(sum(_pnl_contrib(r) for r in rows_for_key if _is_tax(r)))


    rev_totals_cmp: Dict[str, float] = {}
    cogs_totals_cmp: Dict[str, float] = {}
    exp_totals_cmp: Dict[str, float] = {}
    oth_totals_cmp: Dict[str, float] = {}
    tax_totals_cmp: Dict[str, float] = {}

    if has_prior:
        for idx in range(1, len(comparison_ranges) + 1):
            key = "pri" if idx == 1 else f"p{idx}"

            rev_totals_cmp[key] = _total_for_group(key, "revenue")
            cogs_totals_cmp[key] = _total_for_group(key, "cogs")
            exp_totals_cmp[key] = _total_for_group(key, "expense")
            oth_totals_cmp[key] = _total_for_group(key, "other")
            tax_totals_cmp[key] = _tax_total_for_key(key)

    tax_cur = float(sum(_pnl_contrib(r) for r in cur_tax_rows))

    def _calc_comparison_totals() -> Dict[str, Dict[str, float]]:
        out: Dict[str, Dict[str, float]] = {}

        if not has_prior:
            return out

        for idx in range(1, len(comparison_ranges) + 1):
            k = "pri" if idx == 1 else f"p{idx}"

            rev = rev_totals_cmp.get(k, 0.0)
            cogs = cogs_totals_cmp.get(k, 0.0)
            exp = exp_totals_cmp.get(k, 0.0)
            oth = oth_totals_cmp.get(k, 0.0)
            tax = tax_totals_cmp.get(k, 0.0)

            gross = rev + (cogs if show_cogs else 0.0)
            op_profit = gross + exp
            pbt = op_profit + oth
            net = pbt + tax

            out[k] = {
                "revenue": rev,
                "cogs": cogs,
                "gross_profit": gross,
                "operating_expenses": exp,
                "operating_profit": op_profit,
                "other": oth,
                "profit_before_tax": pbt,
                "tax": tax,
                "net": net,
            }

        return out


    cmp_totals = _calc_comparison_totals()

    gross_cur = rev_total + (cogs_total if show_cogs else 0.0)
    op_profit_cur = gross_cur + exp_total
    pbt_cur = op_profit_cur + oth_total
    net_cur = pbt_cur + tax_cur

    net_pri = cmp_totals.get("pri", {}).get("net", 0.0)


    def _comparison_amounts_for(total_key: str) -> Dict[str, float]:
        out: Dict[str, float] = {}

        if not has_prior:
            return out

        for idx in range(1, len(comparison_ranges) + 1):
            k = "pri" if idx == 1 else f"p{idx}"
            out[k] = float(cmp_totals.get(k, {}).get(total_key, 0.0))

        return out


    # -----------------------------
    # Sections (IAS 1 style)
    # -----------------------------
    out_sections: List[Dict[str, Any]] = []


    def _section(
        key: str,
        label: str,
        lines: List[Dict[str, Any]],
        total_cur: float,
        comparison_amounts: Optional[Dict[str, float]] = None,
    ):
        totals = _vals_multi(total_cur, comparison_amounts if has_prior else None)

        out_sections.append({
            "key": key,
            "label": label,
            "lines": lines,
            "totals": totals,
        })


    _section(
        "revenue",
        "Revenue",
        rev_lines,
        rev_total,
        rev_totals_cmp,
    )

    if show_cogs:
        _section(
            "cogs",
            cogs_label,
            cogs_lines,
            cogs_total,
            cogs_totals_cmp,
        )

        _section(
            "gross_profit",
            org_labels["gross_profit"],
            [],
            gross_cur,
            _comparison_amounts_for("gross_profit"),
        )
    else:
        _section(
            "gross_profit",
            org_labels["total_income"],
            [],
            rev_total,
            rev_totals_cmp,
        )

    _section(
        "operating_expenses",
        "Operating expenses",
        exp_lines,
        exp_total,
        exp_totals_cmp,
    )

    _section(
        "operating_profit",
        org_labels["operating_income"],
        [],
        op_profit_cur,
        _comparison_amounts_for("operating_profit"),
    )

    _section(
        "other",
        "Other income/(expense)",
        oth_lines,
        oth_total,
        oth_totals_cmp,
    )

    _section(
        "profit_before_tax",
        org_labels["profit_before_tax"],
        [],
        pbt_cur,
        _comparison_amounts_for("profit_before_tax"),
    )

    net_values = _vals_multi(net_cur, _comparison_amounts_for("net"))

    if abs(tax_cur) > 1e-9 or any(abs(v or 0.0) > 1e-9 for v in tax_totals_cmp.values()):
        tax_lines, _ = _line_amounts_from_rows(cur_tax_rows)

        _section(
            "tax",
            org_labels["tax"],
            tax_lines,
            tax_cur,
            tax_totals_cmp,
        )


    comparison_periods = []
    if has_prior:
        for idx, (pf, pt) in enumerate(comparison_ranges, start=1):
            k = "pri" if idx == 1 else f"p{idx}"
            comparison_periods.append({
                "key": k,
                "from": pf.isoformat(),
                "to": pt.isoformat(),
                "label": comparison_labels_by_key.get(k, rh.label_period(pf, pt)),
            })

    labels = {"cur": cur_label}
    if has_prior:
        labels["pri"] = pri_label
        for idx in range(2, len(comparison_ranges) + 1):
            k = f"p{idx}"
            labels[k] = comparison_labels_by_key.get(k, "")


    # -----------------------------
    # Base stmt
    # -----------------------------
    stmt: Dict[str, Any] = {
        "meta": {
            "company_id": company_id,
            "company_name": company_name,
            "currency": currency,
            "statement": "pnl",
            "statement_title": org_labels["statement_title"],
            "organization_type": organization_type,
            "template": template,
            "basis": basis,
            "detail": mode,
            "compare": compare if has_prior else "none",
            "cols_mode": cols_mode,
            "layout": "multi_tier_pnl",
            "industry_profile": prof,
            "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
            "prior_period": {"from": pri_from.isoformat(), "to": pri_to.isoformat()} if has_prior else None,
            "comparison_periods": comparison_periods,
            "labels": labels,
        },
        "columns": columns,
        "sections": out_sections,
        "net_result": {
            "label": org_labels["net_result"],
            "values": dict(net_values),
            "amount": float(net_cur),
            "prior_amount": float(net_pri) if has_prior else None,
        },
    }

    return stmt
