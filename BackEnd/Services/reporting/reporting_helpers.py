# BackEnd/Services/reporting/reporting_helpers.py
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from BackEnd.Services.industry_profiles import get_industry_profile
from BackEnd.Services import accounting_classifiers as ac

# ============================================================
# Date / compare / column helpers (reporting-only)
# ============================================================


def parse_fin_year_start(s: Optional[str]) -> Tuple[int, int]:
    """
    Accepts '01/03', '1/3', '2025-03-01' (uses MM-DD from that), or None.
    Returns (month, day). Defaults to (1, 1) if missing.
    """
    if not s:
        return (1, 1)

    s = str(s).strip()

    # formats like '01/03' meaning DD/MM (as your UI shows)
    if "/" in s:
        parts = s.split("/")
        if len(parts) == 2:
            dd = int(parts[0]); mm = int(parts[1])
            return (mm, dd)

    # ISO 'YYYY-MM-DD'
    if "-" in s and len(s) >= 10:
        try:
            d = date.fromisoformat(s[:10])
            return (d.month, d.day)
        except Exception:
            pass

    # fallback
    return (1, 1)

def fiscal_year_range(as_of: date, fin_year_start: Optional[str]) -> Tuple[date, date]:
    """
    Given an as_of date and fin_year_start (e.g. '01/03' = 1 March),
    returns (fy_start, fy_end) where fy_end is the day before next FY start.
    """
    m, d = parse_fin_year_start(fin_year_start)

    # candidate start in as_of year
    start = date(as_of.year, m, d)
    if as_of < start:
        start = date(as_of.year - 1, m, d)

    next_start = date(start.year + 1, m, d)
    end = next_start - timedelta(days=1)
    return start, end


def parse_date_arg(request, name: str) -> Optional[date]:
    s = request.args.get(name)
    if not s:
        return None
    return date.fromisoformat(s)


def shift_year(d: date, years: int = 1) -> date:
    try:
        return d.replace(year=d.year - years)
    except ValueError:
        # handles Feb 29 -> Feb 28
        return d.replace(year=d.year - years, day=28)


def build_compare_range(date_from: date, date_to: date, mode: str) -> Tuple[Optional[date], Optional[date]]:
    """
    mode:
      - none
      - prior_year
      - prior_period
    """
    if not mode or mode == "none" or not date_from or not date_to:
        return None, None

    mode = (mode or "").lower()

    if mode == "prior_year":
        return shift_year(date_from, 1), shift_year(date_to, 1)

    # prior_period (same number of days, immediately before current range)
    days = (date_to - date_from).days
    prior_to = date_from - timedelta(days=1)
    prior_from = prior_to - timedelta(days=days)
    return prior_from, prior_to


def label_period(date_from: Optional[date], date_to: Optional[date]) -> str:
    if not date_from or not date_to:
        return ""
    return f"{date_from.isoformat()} → {date_to.isoformat()}"


def want_export(fmt: str) -> bool:
    return (fmt or "").lower() in ("csv", "xlsx", "pdf", "Tax Authority_xml")


def make_columns(
    cols: int,
    compare: str,
    *,
    clean_labels: bool,
    cur_label: str,
    pri_label: str
) -> List[Dict[str, str]]:
    compare = (compare or "none").lower()
    cols = int(cols or 1)

    if compare != "none":
        if clean_labels:
            base = [{"key": "cur", "label": "Current"}, {"key": "pri", "label": "Prior"}]
        else:
            base = [{"key": "cur", "label": cur_label}, {"key": "pri", "label": pri_label}]
        if cols >= 3:
            base.append({"key": "delta", "label": "Δ"})
        return base

    return [{"key": "cur", "label": ("Current" if clean_labels else cur_label)}]


def has_delta(columns: List[Dict[str, Any]]) -> bool:
    return any((c.get("key") == "delta") for c in (columns or []))


# ============================================================
# Totals helpers (report shaping)
# ============================================================

def sum_vals_dicts(*vals: Dict[str, float]) -> Dict[str, float]:
    out: Dict[str, float] = {}
    for v in vals:
        if not isinstance(v, dict):
            continue
        for k, num in v.items():
            out[k] = float(out.get(k, 0.0)) + float(num or 0.0)
    return out


def sub_vals_dicts(a: Dict[str, float], b: Dict[str, float]) -> Dict[str, float]:
    out: Dict[str, float] = {}
    keys = set((a or {}).keys()) | set((b or {}).keys())
    for k in keys:
        out[k] = float((a or {}).get(k, 0.0) or 0.0) - float((b or {}).get(k, 0.0) or 0.0)
    return out

def map_layout_key(layout: str) -> str:
    layout = (layout or "").strip().lower()
    mapping = {
        # ✅ Construction / project WIP should be cost-of-revenue layout
        "project_wip": "multi_tier_pnl_cost_of_revenue",
        "project": "multi_tier_pnl_cost_of_revenue",
        "wip": "multi_tier_pnl_cost_of_revenue",

        "trading_hunter": "hunter_multi_step",
        "hunter_multistep": "hunter_multi_step",
        "hunter_multi_step": "hunter_multi_step",

        "service_gross_margin": "multi_tier_pnl_cost_of_revenue",
        "service_simple": "multi_tier_pnl_service",
        "npo_performance": "multi_tier_ie",
    }
    return mapping.get(layout, layout)

# ============================================================
# Income Statement Template Builder
# ============================================================

def build_income_statement_template(
    *,
    get_trial_balance_range_fn,
    get_company_context_fn,
    company_id: int,
    date_from: date,
    date_to: date,
    template: str = "ifrs",
    basis: str = "management",
    layout: str = "auto",
    cols_mode: int = 1,   # 1 = single, 2 = breakdown/subtotal, 3 = Hunter 3-tier
) -> Dict[str, Any]:
    """
    Management / internal income statement builder.

    - Uses industry profile and layout key for grouping (Hunter, service, cost-of-revenue).
    - Supports:
        cols_mode=1: single 'cur' column (classic)
        cols_mode=2: 'col1' Breakdown, 'col2' Subtotal
        cols_mode=3: Hunter 3-tier with c1/c2/c3 (adjustments/net/total).
    """

    # -----------------------------
    # Context from DB
    # -----------------------------
    ctx = get_company_context_fn(company_id) or {}
    currency = ctx.get("currency") or "ZAR"
    company_name = ctx.get("name") or ctx.get("company_name") or ""

    industry = ctx.get("industry")
    sub_industry = ctx.get("sub_industry")

    # ✅ Use the centralized profile mapping
    profile = ctx.get("industry_profile") or get_industry_profile(industry, sub_industry)

    pnl_layout = (profile.get("pnl_layout") or "service_simple").strip().lower()
    uses_inventory = profile.get("uses_inventory", False)
    uses_cogs = profile.get("uses_cogs", False)
    pnl_labels = profile.get("pnl_labels", {})
    cogs_label = pnl_labels.get("cogs") or "Cost of goods sold"

    template = (template or "ifrs").lower()
    if template not in ("ifrs", "npo"):
        template = "ifrs"

    basis = (basis or "management").lower()
    if basis not in ("management", "internal"):
        basis = "management"

    # -----------------------------
    # Layout selection + normalization (clean + consistent)
    # -----------------------------
    raw_layout = (layout or "auto").strip().lower()

    # 1) Resolve "auto"
    if raw_layout == "auto":
        saved = (ctx.get("default_pnl_layout") or "").strip().lower()
        if saved:
            raw_layout = saved
        else:
            # choose_layout already returns a real, normalized layout key
            raw_layout = choose_layout("pnl", profile) or "multi_tier_pnl_service"

    # 2) Apply alias/typo normalization ONCE
    layout = map_layout_key(raw_layout)

    # Handle known typo/mismatch explicitly (optional safety)
    if layout in ("hunter_multistep", "hunter_multistep "):
        layout = "hunter_multi_step"

    # 3) Final fallback
    layout = layout or "multi_tier_pnl_service"

    # 4) Detect hunter (for inventory schedule logic etc.)
    is_hunter = (layout == "hunter_multi_step")

    print(
        f"[DEBUG] Layout resolved: {layout}, "
        f"raw_layout={raw_layout}, "
        f"profile_pnl_layout={(profile.get('pnl_layout') or '')}, "
        f"is_hunter={is_hunter}, uses_inventory={uses_inventory}, uses_cogs={uses_cogs}"
    )

    # -----------------------------
    # Columns mode (INTERNAL preview)
    # -----------------------------
    try:
        cols_mode = int(cols_mode or 1)
    except Exception:
        cols_mode = 1
    if cols_mode not in (1, 2, 3):
        cols_mode = 1

    # Allow 3-col for ANY layout (internal preview)
    want_3tier = (cols_mode == 3)

    # Note: keep is_hunter purely about layout behavior,
    # not about whether 3 columns are allowed.

    # -----------------------------
    # Columns + col() helper
    # -----------------------------
    if want_3tier:
        columns = [
            {"key": "c1", "label": "Adjustments / Returns"},
            {"key": "c2", "label": "Net / Subtotal"},
            {"key": "c3", "label": "Total"},
        ]

        def col(*, c1: float = 0.0, c2: float = 0.0, c3: float = 0.0, **_) -> Dict[str, float]:
            return {
                "c1": float(c1 or 0.0),
                "c2": float(c2 or 0.0),
                "c3": float(c3 or 0.0),
            }

    elif cols_mode == 2:
        columns = [
            {"key": "col1", "label": "Breakdown"},
            {"key": "col2", "label": "Subtotal"},
        ]

        def col(*, col1: float = 0.0, col2: float = 0.0, **_) -> Dict[str, float]:
            return {
                "col1": float(col1 or 0.0),
                "col2": float(col2 or 0.0),
            }

    else:
        columns = [{"key": "cur", "label": "Amount"}]

        def col(*, cur: float = 0.0, **_) -> Dict[str, float]:
            return {"cur": float(cur or 0.0)}

    # ---- zero helpers for UI ----
    def is_zero_amount(val: float) -> bool:
        return abs(float(val or 0.0)) < 0.005

    def maybe_values(amount: float) -> Dict[str, float]:
        """
        Return a values dict that the UI will render as blank when amount is zero,
        but uses the normal col() mapping when non-zero.
        """
        if is_zero_amount(amount):
            if want_3tier:
                return {"c1": 0.0, "c2": 0.0, "c3": 0.0}
            elif cols_mode == 2:
                return {"col1": 0.0, "col2": 0.0}
            else:
                return {"cur": 0.0}

        return (
            col(c3=amount) if want_3tier
            else col(col2=amount) if cols_mode == 2
            else col(cur=amount)
        )


    # -----------------------------
    # TB rows and bucketing
    # -----------------------------
    rows = get_trial_balance_range_fn(company_id, date_from, date_to) or []

    if is_hunter:
        groups: Dict[str, List[Dict[str, Any]]] = {
            "SALES": [],
            "SALES_DEDUCTIONS": [],
            "INV_BEGIN": [],
            "PURCHASES": [],
            "FREIGHT_IN": [],
            "PURCHASE_DISCOUNTS": [],
            "PURCHASE_RETURNS": [],
            "INV_END": [],
            "COGS": [],
            "SELLING": [],
            "GNA": [],
            "OTHER": [],
            "TAX": [],
        }
    else:
        groups = {
            "SALES": [],
            "SALES_DEDUCTIONS": [],
            "COGS": [],
            "SELLING": [],
            "GNA": [],
            "OTHER": [],
            "TAX": [],
        }

    for r in rows:
        # Use the same classifier as external to detect COGS,
        # but keep full Hunter bucketing when is_hunter is True.
        kind = ac._classify_tb_row(r)

        if not is_hunter and uses_cogs and kind == "cogs":
            bucket = "COGS"
        else:
            bucket = ac._pnl_bucket(r, profile)

        if bucket == "IGNORE":
            continue
        if bucket not in groups:
            continue

        amt = float(ac._pnl_amount(r))

        if is_hunter and bucket in (
            "INV_BEGIN", "INV_END", "PURCHASES", "FREIGHT_IN",
            "PURCHASE_DISCOUNTS", "PURCHASE_RETURNS"
        ):
            amt = abs(amt)

        if bucket == "SALES_DEDUCTIONS":
            amt = abs(amt)

        if abs(amt) < 0.005:
            continue

        groups[bucket].append({
            "code": ac._tb_key(r),
            "name": ac._name(r),
            "amount": amt,
            "section": r.get("section"),
            "category": r.get("category"),
            "standard": ac._std_tag(r) or None,
            "raw_row": r,
        })

    def tot(key: str) -> float:
        return float(sum(x["amount"] for x in groups.get(key, [])))

    # -----------------------------
    # Totals (management view)
    # -----------------------------
    sales = tot("SALES")
    deductions = tot("SALES_DEDUCTIONS")
    net_sales = sales - deductions

    if is_hunter:
        beg_inv = tot("INV_BEGIN")
        purch = tot("PURCHASES")
        freight = tot("FREIGHT_IN")
        pdisc = tot("PURCHASE_DISCOUNTS")
        preturn = tot("PURCHASE_RETURNS")
        end_inv = tot("INV_END")

        goods_avail = beg_inv + purch + freight - (pdisc + preturn)

        if (beg_inv or purch or freight or pdisc or preturn or end_inv):
            cogs = goods_avail - end_inv
        else:
            cogs = tot("COGS")
    else:
        cogs = tot("COGS")

    gross_profit = net_sales - cogs

    selling = tot("SELLING")
    gna = tot("GNA")
    operating_income = gross_profit - (selling + gna)

    other = tot("OTHER")
    profit_before_tax = operating_income - other

    tax = tot("TAX")
    net_income = profit_before_tax - tax

    # -----------------------------
    # Helpers for lines
    # -----------------------------
    def _is_revenue_adjustment_item(it: Dict[str, Any]) -> bool:
        r = it.get("raw_row") or {}
        fam = ac._code_family(r)
        if fam == "PL_ADJ":
            return True
        text = ac._row_text(r)
        return any(k in text for k in (
            "sales returns", "returns & allowances", "discount",
            "refund", "credit note"
        ))

    def render_lines(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for it in sorted(items, key=lambda x: (x.get("name") or "").lower()):
            amt = float(it.get("amount") or 0.0)
            r = it.get("raw_row") or {}

            if want_3tier:
                # Hunter 3-tier: adjustments vs net
                if _is_revenue_adjustment_item(it):
                    vals = col(c1=amt)   # Adjustments column
                else:
                    vals = col(c2=amt)   # Net / middle column
            elif cols_mode == 2:
                # 2-column management: all detail into Breakdown
                vals = col(col1=amt)
            else:
                vals = col(cur=amt)

            out.append({
                "code": it.get("code") or "",
                "name": it.get("name") or "",
                "values": vals,
                "meta": {
                    "section": it.get("section"),
                    "category": it.get("category"),
                    "standard": it.get("standard"),
                }
            })
        return out

    blocks: List[Dict[str, Any]] = []

    # -----------------------------
    # Revenues block
    # -----------------------------
    if want_3tier:
        # Hunter 3-tier with adjustments
        lines: List[Dict[str, Any]] = []

        # 1) Sales detail in middle column
        for it in sorted(groups["SALES"], key=lambda z: (z.get("name") or "").lower()):
            amt = float(it["amount"] or 0.0)
            lines.append({
                "code": it["code"],
                "name": it["name"],          # e.g. "Sales", "Service income" etc.
                "values": col(c2=amt),       # detail in Net / Subtotal column
                "indent": 1,
            })

        # 2) Optional deductions detail in c1
        if groups["SALES_DEDUCTIONS"]:
            lines.append({
                "code": "",
                "name": "Less:",
                "values": col(),             # zeros
                "is_less_line": True,
                "indent": 1,
            })
            for x in sorted(groups["SALES_DEDUCTIONS"], key=lambda z: (z.get("name") or "").lower()):
                lines.append({
                    "code": x["code"],
                    "name": x["name"],
                    "values": col(c1=float(x["amount"])),   # adjustments in c1
                    "indent": 2,
                    "is_less_line": True,
                })

        # 3) Net sales subtotal only in Total column
        lines.append({
            "code": "NET_SALES",
            "name": "Net sales",
            "values": col(c3=net_sales),
            "is_subtotal": True,
        })

        blocks.append({
            "key": "revenues",
            "label": "Revenues",
            "lines": lines,
        })

    else:
        # Classic single-column
        lines = render_lines(groups["SALES"])
        if groups["SALES_DEDUCTIONS"]:
            lines.append({
                "code": "",
                "name": "Less:",
                "values": (col(col1=0.0) if cols_mode == 2 else col(cur=0.0)),
                "is_less_line": True,
                "indent": 1,
            })
            for ln in render_lines(groups["SALES_DEDUCTIONS"]):
                ln["indent"] = 2
                ln["is_less_line"] = True
                lines.append(ln)

        lines.append({
            "code": "NET_SALES",
            "name": "Net sales",
            "values": (col(col2=net_sales) if cols_mode == 2 else col(cur=net_sales)),
            "is_subtotal": True,
        })

        blocks.append({
            "key": "revenues",
            "label": "Revenues",
            "lines": lines,
        })

    # -----------------------------
    # COGS / gross profit blocks
    # -----------------------------

    if is_hunter and uses_inventory:
        print(f"[DEBUG] Inventory schedule branch triggered: is_hunter={is_hunter}, uses_inventory={uses_inventory}, cogs={cogs}")
        # full inventory schedule
        beg_inv = tot("INV_BEGIN")
        purch = tot("PURCHASES")
        freight = tot("FREIGHT_IN")
        pdisc = tot("PURCHASE_DISCOUNTS")
        preturn = tot("PURCHASE_RETURNS")
        end_inv = tot("INV_END")
        goods_avail = beg_inv + purch + freight - (pdisc + preturn)

        cogs_lines: List[Dict[str, Any]] = []

        def L(name: str, amount: float, *, indent=1, less=False, subtotal=False, code=""):
            if want_3tier:
                values = col(c3=amount) if subtotal else col(c2=amount)
            elif cols_mode == 2:
                values = col(col2=amount) if subtotal else col(col1=amount)
            else:
                values = col(cur=amount)
            return {
                "code": code,
                "name": name,
                "values": values,
                "indent": indent,
                "is_less_line": bool(less),
                "is_subtotal": bool(subtotal),
            }

        if (beg_inv or purch or freight or pdisc or preturn or end_inv):
            cogs_lines += [L("Beginning inventory", beg_inv, indent=1)]
            if purch:
                cogs_lines += [L("Purchases", purch, indent=2)]
            if freight:
                cogs_lines += [L("Freight-in", freight, indent=2)]
            if pdisc:
                cogs_lines += [L("Purchase discounts", pdisc, indent=2, less=True)]
            if preturn:
                cogs_lines += [L("Purchase returns & allowances", preturn, indent=2, less=True)]
            cogs_lines += [L("Goods available for sale", goods_avail, indent=1, subtotal=True, code="GOODS_AVAIL")]
            cogs_lines += [L("Less: Ending inventory", end_inv, indent=1, less=True)]
            cogs_lines += [L(cogs_label, cogs, indent=1, subtotal=True, code="COGS")]
        else:
            cogs_lines = render_lines(groups["COGS"])
            cogs_lines.append({
                "code": "COGS_TOTAL",
                "name": cogs_label,
                "values": col(c3=cogs) if want_3tier else col(col2=cogs) if cols_mode == 2 else col(cur=cogs),
                "is_subtotal": True,
            })

        blocks.append({
            "key": "cogs",
            "label": cogs_label,
            "lines": cogs_lines,
            "totals": maybe_values(cogs),
        })
        blocks.append({
            "key": "gross_profit",
            "label": "Gross profit",
            "values": maybe_values(gross_profit),
        })

    elif (layout == "multi_tier_pnl_cost_of_revenue" and uses_cogs and cogs):
        # ✅ Construction / service gross margin: show direct costs block with detail lines
        print(f"[DEBUG] Cost of revenue branch triggered: layout={layout}, uses_cogs={uses_cogs}, cogs={cogs}")
        blocks.append({
            "key": "cost_of_revenue",
            "label": cogs_label,  # e.g. "Direct project costs"
            "lines": render_lines(groups["COGS"]),
            "totals": maybe_values(cogs),
        })
        blocks.append({
            "key": "gross_profit",
            "label": "Gross profit",
            "values": maybe_values(gross_profit),
        })

    else:
        print(f"[DEBUG] Fallback branch triggered: layout={layout}, is_hunter={is_hunter}, uses_inventory={uses_inventory}, uses_cogs={uses_cogs}, cogs={cogs}")
        blocks.append({
            "key": "gross_profit",
            "label": "Total income",
            "values": maybe_values(net_sales),
        })


    # -----------------------------
    # ✅ Operating expenses + bottom lines (ALWAYS)
    # -----------------------------

    blocks.append({
        "key": "selling",
        "label": "Selling expenses",
        "lines": render_lines(groups.get("SELLING", [])),
        "totals": maybe_values(selling),
    })

    blocks.append({
        "key": "gna",
        "label": "General and administrative",
        "lines": render_lines(groups.get("GNA", [])),
        "totals": maybe_values(gna),
    })

    blocks.append({
        "key": "other",
        "label": "Other",
        "lines": render_lines(groups.get("OTHER", [])),
        "totals": maybe_values(other),
    })

    total_expenses = selling + gna + other

    blocks.append({
        "key": "total_expenses",
        "label": "Total expenses",
        "values": maybe_values(total_expenses),
    })

    blocks.append({
        "key": "pbt",
        "label": "Profit before tax",
        "values": maybe_values(profit_before_tax),
    })

    blocks.append({
        "key": "tax_line",
        "label": "Income tax expense",
        "values": (
            col(c3=tax) if want_3tier
            else col(col2=tax) if cols_mode == 2
            else col(cur=tax)
        ),
    })

    blocks.append({
        "key": "net_income",
        "label": "Net income",
        "values": maybe_values(net_income),
    })

    # -----------------------------
    # Result
    # -----------------------------
    return {
        "meta": {
            "company_id": company_id,
            "company_name": company_name,
            "currency": currency,
            "statement": "pnl",
            "template": template,
            "basis": basis,
            "layout": layout,
            "industry_profile": profile,
            "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
            "cols_mode": int(cols_mode or 1),
        },
        "columns": columns,
        "blocks": blocks,
        "totals": {
            "net_sales": maybe_values(net_sales),
            "gross_profit": maybe_values(gross_profit),
            "operating_income": maybe_values(operating_income),
            "profit_before_tax": maybe_values(profit_before_tax),
            # tax stays as a visible 0 placeholder when zero
            "income_tax": (
                col(c3=tax) if want_3tier
                else {"col2": tax} if cols_mode == 2
                else {"cur": tax}
            ),
            "net_income": maybe_values(net_income),
        },
        "net_result": {
            "label": "Net Profit",
            "values": (
                col(c3=net_income) if want_3tier
                else {"col2": net_income} if cols_mode == 2
                else {"cur": net_income}
            ),
        },
    }

def choose_layout(statement: str, profile: Dict[str, Any]) -> str:
    if statement != "pnl":
        return "multi_tier"

    pnl_layout = (profile.get("pnl_layout") or "").strip().lower()

    mapping = {
        "npo_performance": "multi_tier_ie",
        "multi_tier_ie": "multi_tier_ie",
        "ie": "multi_tier_ie",

        # ✅ Construction / project_wip → cost-of-revenue layout
        # This ensures Direct project costs block is shown
        "project_wip": "multi_tier_pnl_cost_of_revenue",
        "project": "multi_tier_pnl_cost_of_revenue",
        "wip": "multi_tier_pnl_cost_of_revenue",

        "trading_hunter": "hunter_multi_step",
        "hunter": "hunter_multi_step",
        "hunter_multi_step": "hunter_multi_step",
        "hunter_multistep": "hunter_multi_step",

        "service_gross_margin": "multi_tier_pnl_cost_of_revenue",
        "multi_tier_pnl_cost_of_revenue": "multi_tier_pnl_cost_of_revenue",

        "service_simple": "multi_tier_pnl_service",
        "multi_tier_pnl_service": "multi_tier_pnl_service",
    }

    if pnl_layout in mapping:
        return mapping[pnl_layout]

    key = (profile.get("key") or "").lower()
    if "npo" in key or "non-profit" in key:
        return "multi_tier_ie"
    if profile.get("uses_inventory"):
        return "hunter_multi_step"
    if profile.get("uses_cogs") and not profile.get("uses_inventory"):
        return "multi_tier_pnl_cost_of_revenue"
    return "multi_tier_pnl_service"
