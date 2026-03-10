from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from BackEnd.Services.company_context import get_company_context
from BackEnd.Services.industry_profiles import get_industry_profile
from BackEnd.Services import accounting_classifiers as ac

from . import reporting_helpers as rh  # ✅ same folder import


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

    # ✅ swallow any future kwargs safely
    **_unused: Any,
) -> Dict[str, Any]:
    """
    IAS 1-style multi-tier P&L (external reporting only).
    - basis is always treated as 'external'
    - cols_mode is always 1 (Current / Prior / Delta)
    - detail controls line density: summary | mid | full
    """

    # -----------------------------
    # Context from DB
    # -----------------------------
    ctx = ctx or get_company_context(self, company_id)
    if not ctx:
        ctx = {}

    currency = ctx.get("currency") or "ZAR"
    company_name = ctx.get("name") or ctx.get("company_name") or ""
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
    if compare not in ("none", "prior_period", "prior_year"):
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
    # TB (current + prior)
    # -----------------------------
    cur_rows = self.get_trial_balance(company_id, date_from, date_to) or []

    # ✅ PRIOR resolution:
    # 1) Use passed-in priors if provided AND compare != none
    # 2) Otherwise fall back to legacy build_compare_range
    pri_from = pri_to = None
    if compare != "none":
        if prior_from and prior_to:
            pri_from, pri_to = prior_from, prior_to
        else:
            pri_from, pri_to = rh.build_compare_range(date_from, date_to, compare)

    if pri_from and pri_to:
        pri_rows = self.get_trial_balance(company_id, pri_from, pri_to) or []
    else:
        pri_rows = []

    has_prior = bool(compare != "none" and pri_from and pri_to and pri_rows)

    cur_label = rh.label_period(date_from, date_to)
    pri_label = rh.label_period(pri_from, pri_to) if has_prior else ""

    # -----------------------------
    # Columns (IAS 1: cur/pri(/delta))
    # -----------------------------
    columns = rh.make_columns(
        cols_mode,
        compare if has_prior else "none",
        clean_labels=True,
        cur_label=cur_label,
        pri_label=pri_label,
    )
    want_delta = rh.has_delta(columns)

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

    def _vals(cur_amt: float, pri_amt: Optional[float]) -> Dict[str, float]:
        v = {"cur": float(cur_amt)}

        if cols_mode in (1, 3) and has_prior and pri_amt is not None:
            v["pri"] = float(pri_amt)

        if cols_mode == 1 and has_prior and pri_amt is not None:
            v["delta"] = v["cur"] - v["pri"]

        return v

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
    pri_tax_rows = [r for r in pri_rows if _is_tax(r)] if has_prior else []

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
            

    pri_by_code: Dict[str, Dict[str, Any]] = {_row_key(r): r for r in pri_rows} if has_prior else {}

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
                if (code.startswith("PL_COS_") and (name or "").strip().lower() in ("purchases", "purchase", "inventory purchases")):
                    name = "Cost of sales"
                    
            cur_amt = _pnl_contrib(r)

            pri_amt = None
            if has_prior and code in pri_by_code:
                pri_amt = _pnl_contrib(pri_by_code[code])

            v = _vals(cur_amt, pri_amt)
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

    rev_total_pri  = float(sum(_pnl_contrib(r) for r in pri_g["revenue"])) if has_prior else 0.0
    cogs_total_pri = float(sum(_pnl_contrib(r) for r in pri_g["cogs"])) if has_prior else 0.0
    exp_total_pri  = float(sum(_pnl_contrib(r) for r in pri_g["expense"])) if has_prior else 0.0
    oth_total_pri  = float(sum(_pnl_contrib(r) for r in pri_g["other"])) if has_prior else 0.0

    tax_cur = float(sum(_pnl_contrib(r) for r in cur_tax_rows))
    tax_pri = float(sum(_pnl_contrib(r) for r in pri_tax_rows)) if has_prior else 0.0

    gross_cur = rev_total + (cogs_total if show_cogs else 0.0)
    gross_pri = rev_total_pri + (cogs_total_pri if show_cogs else 0.0)

    op_profit_cur = gross_cur + exp_total
    op_profit_pri = gross_pri + exp_total_pri

    pbt_cur = op_profit_cur + oth_total
    pbt_pri = op_profit_pri + oth_total_pri

    net_cur = pbt_cur + tax_cur
    net_pri = pbt_pri + tax_pri

    # -----------------------------
    # Sections (IAS 1 style)
    # -----------------------------
    out_sections: List[Dict[str, Any]] = []

    def _section(key: str, label: str, lines: List[Dict[str, Any]],
                 total_cur: float, total_pri: float = 0.0):
        totals = _vals(total_cur, total_pri if has_prior else None)
        out_sections.append({
            "key": key,
            "label": label,
            "lines": lines,
            "totals": totals,
        })

    _section("revenue", "Revenue", rev_lines, rev_total, rev_total_pri)

    if show_cogs:
        _section("cogs", cogs_label, cogs_lines, cogs_total, cogs_total_pri)
        _section("gross_profit", "Gross profit", [], gross_cur, gross_pri)
    else:
        _section("gross_profit", "Total income", [], rev_total, rev_total_pri)

    _section("operating_expenses", "Operating expenses", exp_lines, exp_total, exp_total_pri)
    _section("operating_profit", "Operating profit", [], op_profit_cur, op_profit_pri)
    _section("other", "Other income/(expense)", oth_lines, oth_total, oth_total_pri)

    _section("profit_before_tax", "Profit before tax", [], pbt_cur, pbt_pri)

    net_values = _vals(net_cur, net_pri if has_prior else None)

    if abs(tax_cur) > 1e-9 or (has_prior and abs(tax_pri) > 1e-9):
        tax_lines, _ = _line_amounts_from_rows(cur_tax_rows)
        _section("tax", "Income tax", tax_lines, tax_cur, tax_pri)

    # -----------------------------
    # Base stmt
    # -----------------------------
    stmt: Dict[str, Any] = {
        "meta": {
            "company_id": company_id,
            "company_name": company_name,
            "currency": currency,
            "statement": "pnl",
            "template": template,
            "basis": "external",
            "detail": mode,
            "compare": compare if has_prior else "none",
            "cols_mode": cols_mode,
            "basis": basis,
            "layout": "multi_tier_pnl",
            "industry_profile": prof,
            "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
            "prior_period": {"from": pri_from.isoformat(), "to": pri_to.isoformat()} if has_prior else None,
            "labels": {"cur": cur_label, "pri": pri_label} if has_prior else {"cur": cur_label},
        },
        "columns": columns,
        "sections": out_sections,
        "net_result": {
            "label": "Net Profit",
            "values": dict(net_values),
            "amount": float(net_cur),
            "prior_amount": float(net_pri) if has_prior else None,
        },
    }

    return stmt
