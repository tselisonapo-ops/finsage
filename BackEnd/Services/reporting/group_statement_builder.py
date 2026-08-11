from __future__ import annotations
from datetime import date
from typing import Any, Dict, List, Optional

def _n(v) -> float:
    try: return round(float(v or 0),2)
    except Exception: return 0.0

def _txt(v) -> str:
    return str(v or "").strip()

def _bucket(row: dict) -> str:
    return _txt(row.get("code_family")).upper()

def _display_balance(row: dict) -> float:
    return _n(row.get("final_balance"))

def _statement_amount(row: dict) -> float:
    """
    TB convention:
      debit  = positive
      credit = negative

    Statement presentation:
      assets/expenses normally positive
      liabilities/equity/revenue normally positive
    """
    bal = _display_balance(row)
    b = _bucket(row)

    if b.startswith(("BS_CL","BS_NCL","BS_EQ","PL_REV","PL_OI","PL_GNT","PL_DON")):
        return -bal

    return bal

def _line(row: dict, key: str = "cur") -> dict:
    return {
        "code":row.get("code"),
        "name":row.get("reporting_description") or row.get("name"),
        "values":{key:_statement_amount(row)},
        "meta":{
            "group_account_id":row.get("group_account_id"),
            "role":row.get("role"),
            "section":row.get("section"),
            "category":row.get("category"),
        },
    }

def _sum(rows: List[dict], prefixes: tuple) -> float:
    return round(sum(
        _statement_amount(r)
        for r in rows
        if _bucket(r).startswith(prefixes)
    ),2)

def _meta(
    company: dict,
    run: dict,
    statement: str,
    currency: str,
    period_from=None,
    period_to=None,
) -> dict:
    return {
        "company_id":company.get("id"),
        "company_name":f"{company.get('name') or 'Group'} Group",
        "currency":currency,
        "statement":statement,
        "is_group_statement":True,
        "consolidation_run_id":run.get("id"),
        "consolidation_run_name":run.get("run_name"),
        "period":{
            "from":period_from.isoformat() if hasattr(period_from,"isoformat") else period_from,
            "to":period_to.isoformat() if hasattr(period_to,"isoformat") else period_to,
        },
    }


def build_group_income_statement(
    *,
    company: dict,
    run: dict,
    rows: List[dict],
    currency: str,
    date_from,
    date_to,
) -> dict:
    revenue = [r for r in rows if _bucket(r)=="PL_REV"]
    revenue_adj = [r for r in rows if _bucket(r)=="PL_REV_ADJ"]
    cos = [r for r in rows if _bucket(r)=="PL_COS"]
    other_income = [
        r for r in rows
        if _bucket(r) in {"PL_OI","PL_GNT","PL_DON"}
    ]
    opex = [r for r in rows if _bucket(r)=="PL_OPEX"]
    da = [r for r in rows if _bucket(r)=="PL_DA"]
    finance = [r for r in rows if _bucket(r)=="PL_FIN"]
    adjustments = [r for r in rows if _bucket(r)=="PL_ADJ"]

    revenue_total = round(
        sum(_statement_amount(r) for r in revenue)
        - sum(_statement_amount(r) for r in revenue_adj),
        2,
    )
    cos_total = round(sum(_statement_amount(r) for r in cos),2)
    gross_profit = round(revenue_total-cos_total,2)

    other_income_total = round(
        sum(_statement_amount(r) for r in other_income),2
    )
    opex_total = round(
        sum(_statement_amount(r) for r in opex+da),2
    )

    operating_profit = round(
        gross_profit+other_income_total-opex_total,
        2,
    )

    finance_total = round(
        sum(_statement_amount(r) for r in finance),2
    )
    adjustment_total = round(
        sum(_statement_amount(r) for r in adjustments),2
    )

    profit_before_tax = round(
        operating_profit-finance_total+adjustment_total,
        2,
    )

    tax_rows = [
        r for r in rows
        if "tax" in _txt(r.get("role")).lower()
        and _bucket(r).startswith("PL_")
    ]

    tax = round(sum(_statement_amount(r) for r in tax_rows),2)

    # Avoid counting tax twice where it is already inside operating buckets.
    net_profit = round(
        sum(
            -_display_balance(r)
            for r in rows
            if _bucket(r).startswith("PL_")
        ),
        2,
    )

    return {
        "meta":_meta(
            company,run,"pnl",currency,date_from,date_to
        ),
        "columns":[{"key":"cur","label":"Current"}],
        "blocks":[
            {
                "key":"revenue",
                "label":"Revenue",
                "lines":[_line(r) for r in revenue+revenue_adj],
                "totals":{"cur":revenue_total},
            },
            {
                "key":"cost_of_sales",
                "label":"Cost of sales",
                "lines":[_line(r) for r in cos],
                "totals":{"cur":cos_total},
            },
            {
                "key":"gross_profit",
                "label":"Gross profit",
                "values":{"cur":gross_profit},
            },
            {
                "key":"other_income",
                "label":"Other income",
                "lines":[_line(r) for r in other_income],
                "totals":{"cur":other_income_total},
            },
            {
                "key":"operating_expenses",
                "label":"Operating expenses",
                "lines":[_line(r) for r in opex+da],
                "totals":{"cur":opex_total},
            },
            {
                "key":"operating_profit",
                "label":"Operating profit",
                "values":{"cur":operating_profit},
            },
            {
                "key":"finance_costs",
                "label":"Finance costs",
                "lines":[_line(r) for r in finance],
                "totals":{"cur":finance_total},
            },
        ],
        "net_result":{
            "label":"Profit for the year",
            "values":{"cur":net_profit},
        },
        "totals":{
            "revenue":{"cur":revenue_total},
            "gross_profit":{"cur":gross_profit},
            "operating_profit":{"cur":operating_profit},
            "profit_before_tax":{"cur":profit_before_tax},
            "tax":{"cur":tax},
            "net_income":{"cur":net_profit},
        },
    }

def build_group_balance_sheet(
    *,
    company: dict,
    run: dict,
    rows: List[dict],
    currency: str,
    as_of,
) -> dict:
    ca = [r for r in rows if _bucket(r)=="BS_CA"]
    nca = [r for r in rows if _bucket(r)=="BS_NCA"]
    cl = [r for r in rows if _bucket(r)=="BS_CL"]
    ncl = [r for r in rows if _bucket(r)=="BS_NCL"]
    eq = [r for r in rows if _bucket(r)=="BS_EQ"]

    ca_total = round(sum(_statement_amount(r) for r in ca),2)
    nca_total = round(sum(_statement_amount(r) for r in nca),2)
    cl_total = round(sum(_statement_amount(r) for r in cl),2)
    ncl_total = round(sum(_statement_amount(r) for r in ncl),2)
    eq_total = round(sum(_statement_amount(r) for r in eq),2)

    total_assets = round(ca_total+nca_total,2)
    total_el = round(eq_total+ncl_total+cl_total,2)
    difference = round(total_assets-total_el,2)

    return {
        "meta":_meta(
            company,run,"bs",currency,None,as_of
        ),
        "columns":[{"key":"cur","label":"Current"}],

        "assets":{
            "current_assets":{
                "lines":[_line(r) for r in ca],
                "totals":{"values":{"cur":ca_total}},
            },
            "non_current_assets":{
                "lines":[_line(r) for r in nca],
                "totals":{"values":{"cur":nca_total}},
            },
            "totals":{
                "label":"Total assets",
                "values":{"cur":total_assets},
            },
        },

        "equity_and_liabilities":{
            "equity":{
                "lines":[_line(r) for r in eq],
                "totals":{"values":{"cur":eq_total}},
            },
            "non_current_liabilities":{
                "lines":[_line(r) for r in ncl],
                "totals":{"values":{"cur":ncl_total}},
            },
            "current_liabilities":{
                "lines":[_line(r) for r in cl],
                "totals":{"values":{"cur":cl_total}},
            },
            "totals":{
                "label":"Total equity and liabilities",
                "values":{"cur":total_el},
            },
        },

        "balance_check":{
            "label":"Balance check",
            "values":{"cur":difference},
        },
    }



def get_prior_closed_group_run(
    self,
    company_id: int,
    run_id: int,
) -> Optional[dict]:
    with self._conn_cursor() as (conn,cur):
        cur.execute("""
            SELECT reporting_date
            FROM public.group_consolidation_runs
            WHERE id=%s AND parent_company_id=%s
        """,(run_id,company_id))
        current = cur.fetchone()

        if not current:
            return None

        cur.execute("""
            SELECT r.*
            FROM public.group_consolidation_runs r
            JOIN public.group_final_tb_runs f ON f.run_id=r.id
            WHERE r.parent_company_id=%s
              AND r.id<>%s
              AND r.reporting_date<%s
              AND r.close_status='closed'
              AND f.status='generated'
            ORDER BY r.reporting_date DESC,r.id DESC
            LIMIT 1
        """,(
            company_id,
            run_id,
            current["reporting_date"],
        ))

        row = cur.fetchone()
        return dict(row) if row else None

def _get_group_final_tb_rows(
    self,
    cur,
    run_id: int,
) -> list:
    cur.execute("""
        SELECT
            l.*,
            g.code,
            g.name,
            g.section,
            g.category,
            g.subcategory,
            g.reporting_description,
            g.standard,
            g.role,
            g.code_family,
            g.code_numeric,
            g.cf_section,
            g.cf_bucket,
            g.is_working_capital,
            g.is_cash_equiv,
            g.is_non_cash_addback,
            g.is_contra
        FROM public.group_final_tb_lines l
        JOIN public.group_final_tb_runs f
          ON f.id=l.final_tb_run_id
        JOIN public.group_coa g
          ON g.id=l.group_account_id
        WHERE l.run_id=%s
          AND f.status='generated'
        ORDER BY
            COALESCE(g.code_numeric,999999),
            g.code,
            g.name
    """,(run_id,))
    return [dict(r) for r in cur.fetchall()]

def build_group_cash_flow(
    *,
    company: dict,
    run: dict,
    current_rows: List[dict],
    prior_rows: List[dict],
    currency: str,
    date_from,
    date_to,
) -> dict:
    prior_map = {
        int(r["group_account_id"]):r
        for r in prior_rows
    }

    current_map = {
        int(r["group_account_id"]):r
        for r in current_rows
    }

    pnl = build_group_income_statement(
        company=company,
        run=run,
        rows=current_rows,
        currency=currency,
        date_from=date_from,
        date_to=date_to,
    )

    profit = _n(
        (pnl.get("net_result") or {})
        .get("values",{})
        .get("cur")
    )

    non_cash = []
    wc = []
    investing = []
    financing = []

    all_ids = set(current_map)|set(prior_map)

    for aid in sorted(all_ids):
        cur = current_map.get(aid) or {}
        pri = prior_map.get(aid) or {}

        closing = _display_balance(cur)
        opening = _display_balance(pri)
        movement = round(closing-opening,2)

        if abs(movement)<=0.005:
            continue

        row = cur or pri
        label = row.get("reporting_description") or row.get("name") or ""

        if row.get("is_non_cash_addback"):
            non_cash.append({
                "name":label,
                "values":{"cur":-movement},
            })
            continue

        if row.get("is_working_capital"):
            wc.append({
                "name":label,
                "values":{"cur":-movement},
            })
            continue

        section = _txt(row.get("cf_section")).lower()

        if section=="investing":
            investing.append({
                "name":label,
                "values":{"cur":-movement},
            })

        elif section=="financing":
            financing.append({
                "name":label,
                "values":{"cur":-movement},
            })

    operating_total = round(
        profit
        + sum(_n(x["values"]["cur"]) for x in non_cash)
        + sum(_n(x["values"]["cur"]) for x in wc),
        2,
    )

    investing_total = round(
        sum(_n(x["values"]["cur"]) for x in investing),2
    )

    financing_total = round(
        sum(_n(x["values"]["cur"]) for x in financing),2
    )

    net_change = round(
        operating_total+investing_total+financing_total,
        2,
    )

    def cash_total(rows):
        return round(sum(
            _display_balance(r)
            for r in rows
            if bool(r.get("is_cash_equiv"))
        ),2)

    opening_cash = cash_total(prior_rows)
    closing_cash = cash_total(current_rows)
    tb_change = round(closing_cash-opening_cash,2)
    gap = round(net_change-tb_change,2)

    return {
        "meta":{
            **_meta(
                company,run,"cashflow",
                currency,date_from,date_to
            ),
            "method":"indirect",
        },

        "columns":[{"key":"cur","label":"Current"}],

        "sections":[
            {
                "key":"operating",
                "label":"Cash flows from operating activities",
                "lines":[
                    {
                        "name":"Profit for the year",
                        "values":{"cur":profit},
                    },
                    *non_cash,
                    *wc,
                ],
                "totals":{"cur":operating_total},
            },
            {
                "key":"investing",
                "label":"Cash flows from investing activities",
                "lines":investing,
                "totals":{"cur":investing_total},
            },
            {
                "key":"financing",
                "label":"Cash flows from financing activities",
                "lines":financing,
                "totals":{"cur":financing_total},
            },
        ],

        "net_change":{
            "label":"Net increase/(decrease) in cash",
            "values":{"cur":net_change},
        },

        "cash_position":{
            "opening":{
                "label":"Cash and cash equivalents at beginning of period",
                "values":{"cur":opening_cash},
            },
            "closing":{
                "label":"Cash and cash equivalents at end of period",
                "values":{"cur":closing_cash},
            },
            "delta_from_tb":{
                "label":"Movement in cash per consolidated TB",
                "values":{"cur":tb_change},
            },
            "reconciliation_gap":{
                "label":"Cash flow reconciliation difference",
                "values":{"cur":gap},
            },
        },
    }

def build_group_socie(
    *,
    company: dict,
    run: dict,
    current_rows: List[dict],
    prior_rows: List[dict],
    currency: str,
    date_from,
    date_to,
) -> dict:
    current_eq = [
        r for r in current_rows
        if _bucket(r)=="BS_EQ"
    ]
    prior_eq = [
        r for r in prior_rows
        if _bucket(r)=="BS_EQ"
    ]

    all_accounts = {}

    for r in prior_eq+current_eq:
        all_accounts[int(r["group_account_id"])] = r

    columns = []

    for aid,row in all_accounts.items():
        columns.append({
            "key":f"eq_{aid}",
            "label":row.get("reporting_description") or row.get("name"),
        })

    columns.append({
        "key":"total",
        "label":"Total Equity",
    })

    prior_map = {
        int(r["group_account_id"]):_statement_amount(r)
        for r in prior_eq
    }
    current_map = {
        int(r["group_account_id"]):_statement_amount(r)
        for r in current_eq
    }

    opening = {}
    closing = {}

    for aid in all_accounts:
        opening[f"eq_{aid}"] = _n(prior_map.get(aid))
        closing[f"eq_{aid}"] = _n(current_map.get(aid))

    opening["total"] = round(sum(opening.values()),2)
    closing["total"] = round(sum(closing.values()),2)

    pnl = build_group_income_statement(
        company=company,
        run=run,
        rows=current_rows,
        currency=currency,
        date_from=date_from,
        date_to=date_to,
    )

    profit = _n(
        (pnl.get("net_result") or {})
        .get("values",{})
        .get("cur")
    )

    profit_values = {
        c["key"]:0
        for c in columns
    }

    retained_id = None

    for aid,row in all_accounts.items():
        role = _txt(row.get("role")).lower()
        name = _txt(row.get("name")).lower()

        if (
            "retained" in role
            or "retained earnings" in name
            or "accumulated profit" in name
        ):
            retained_id = aid
            break

    if retained_id:
        profit_values[f"eq_{retained_id}"] = profit

    profit_values["total"] = profit

    cta_values = {
        c["key"]:0
        for c in columns
    }

    for aid,row in all_accounts.items():
        role = _txt(row.get("role")).lower()

        if role in {
            "group_translation_reserve",
            "foreign_currency_translation_reserve",
            "translation_reserve",
            "cta",
        }:
            opening_cta = _n(prior_map.get(aid))
            closing_cta = _n(current_map.get(aid))
            movement = round(closing_cta-opening_cta,2)

            cta_values[f"eq_{aid}"] = movement
            cta_values["total"] = movement
            break

    residual = {}

    for aid in all_accounts:
        key = f"eq_{aid}"

        residual[key] = round(
            _n(closing.get(key))
            - _n(opening.get(key))
            - _n(profit_values.get(key))
            - _n(cta_values.get(key)),
            2,
        )

    residual["total"] = round(
        closing["total"]
        - opening["total"]
        - profit_values["total"]
        - cta_values["total"],
        2,
    )

    return {
        "meta":_meta(
            company,run,"socie",
            currency,date_from,date_to
        ),
        "columns":columns,
        "rows":[
            {
                "key":"opening_balance",
                "label":"Opening balance",
                "values":opening,
            },
            {
                "key":"profit_for_year",
                "label":"Profit for the year",
                "values":profit_values,
            },
            {
                "key":"other_comprehensive_income",
                "label":"Foreign currency translation movement",
                "values":cta_values,
            },
            {
                "key":"other_movements",
                "label":"Other equity movements",
                "values":residual,
            },
            {
                "key":"closing_balance",
                "label":"Closing balance",
                "values":closing,
            },
        ],
    }