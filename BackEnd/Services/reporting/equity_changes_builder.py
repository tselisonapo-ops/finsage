from __future__ import annotations

from decimal import Decimal
from typing import Any


def _d(x: Any) -> Decimal:
    try:
        return Decimal(str(x or 0))
    except Exception:
        return Decimal("0")


def _money(x: Decimal) -> float:
    return float(x.quantize(Decimal("0.01")))


def _equity_bucket_for_account(row: dict) -> str | None:
    code = str(row.get("code") or "").strip()
    role = str(row.get("role") or "").strip().lower()
    category = str(row.get("category") or "").strip().lower()
    name = str(row.get("name") or "").strip().lower()

    if role == "equity_share_capital_ordinary":
        return "ordinary_share_capital"
    if role == "equity_share_capital_preference":
        return "preference_share_capital"
    if role == "equity_share_premium":
        return "share_premium"
    if role == "equity_retained_earnings":
        return "retained_earnings"
    if role in {
        "equity_revaluation_reserve",
        "equity_fx_translation_reserve",
    }:
        return "reserves"

    if code == "BS_EQ_3000":
        return "ordinary_share_capital"
    if code == "BS_EQ_3003":
        return "preference_share_capital"
    if code == "BS_EQ_3005":
        return "share_premium"
    if code == "BS_EQ_3001":
        return "retained_earnings"
    if code.startswith("BS_EQ_33"):
        return "reserves"

    if "retained" in name:
        return "retained_earnings"
    if "premium" in name:
        return "share_premium"
    if "preference" in name and "share" in name:
        return "preference_share_capital"
    if "share capital" in name or ("capital" in category and "share" in name):
        return "ordinary_share_capital"
    if "reserve" in name or "oci" in category:
        return "reserves"

    return None


def build_statement_of_changes_in_equity(
    *,
    company_id: int,
    company_name: str,
    currency: str,
    period_from: str,
    period_to: str,
    opening_equity_accounts: list[dict],
    closing_equity_accounts: list[dict],
    movement_journal_lines: list[dict],
    profit_for_period: float | Decimal = 0,
    include_unclosed_profit: bool = True,
) -> dict:
    """
    opening_equity_accounts / closing_equity_accounts:
        list of coa/balance rows like:
        {
            "code": "BS_EQ_3001",
            "name": "Retained Earnings",
            "role": "equity_retained_earnings",
            "category": "Retained Earnings",
            "balance": -350000.00
        }

    movement_journal_lines:
        list of journal lines for the period, like:
        {
            "account_code": "BS_EQ_3002",
            "date": "2025-07-31",
            "debit": 200000,
            "credit": 0
        }
    """

    columns = [
        {"key": "ordinary_share_capital", "label": "Ordinary Share Capital"},
        {"key": "preference_share_capital", "label": "Preference Share Capital"},
        {"key": "share_premium", "label": "Share Premium"},
        {"key": "retained_earnings", "label": "Retained Earnings"},
        {"key": "reserves", "label": "Reserves"},
        {"key": "total", "label": "Total Equity"},
    ]

    row_keys = [
        "opening_balance",
        "share_issues",
        "profit_for_period",
        "other_comprehensive_income",
        "dividends",
        "drawings",
        "prior_adjustments",
        "closing_balance",
    ]
    row_labels = {
        "opening_balance": "Opening balance",
        "share_issues": "Share issues / capital contributions",
        "profit_for_period": "Profit for the period",
        "other_comprehensive_income": "Other comprehensive income",
        "dividends": "Dividends",
        "drawings": "Drawings",
        "prior_adjustments": "Prior period / opening balance adjustments",
        "closing_balance": "Closing balance",
    }

    bucket_keys = [
        "ordinary_share_capital",
        "preference_share_capital",
        "share_premium",
        "retained_earnings",
        "reserves",
    ]

    rows = {
        k: {"key": k, "label": row_labels[k], "values": {bk: Decimal("0") for bk in bucket_keys}}
        for k in row_keys
    }

    # Opening balances
    for acc in opening_equity_accounts:
        bucket = _equity_bucket_for_account(acc)
        if not bucket:
            continue
        rows["opening_balance"]["values"][bucket] += _d(acc.get("balance"))

    # Journal movement classification
    for jl in movement_journal_lines:
        code = str(jl.get("account_code") or jl.get("code") or "").strip()
        name = str(jl.get("name") or "").strip()
        role = str(jl.get("role") or "").strip()
        debit = _d(jl.get("debit"))
        credit = _d(jl.get("credit"))

        acc_stub = {
            "code": code,
            "name": name,
            "role": role,
            "category": jl.get("category"),
        }
        bucket = _equity_bucket_for_account(acc_stub)

        # Net credit balance logic for equity movement
        net = credit - debit

        if code in {"BS_EQ_3000", "BS_EQ_3003", "BS_EQ_3005"}:
            if bucket:
                rows["share_issues"]["values"][bucket] += net
            continue

        if code in {"BS_EQ_3002"} or role == "equity_dividends":
            rows["dividends"]["values"]["retained_earnings"] += net
            continue

        if code in {"BS_EQ_3006"} or role == "equity_drawings":
            rows["drawings"]["values"]["retained_earnings"] += net
            continue

        if code in {"BS_EQ_3105"} or role == "equity_opening_balance":
            rows["prior_adjustments"]["values"]["retained_earnings"] += net
            continue

        if bucket == "reserves":
            rows["other_comprehensive_income"]["values"]["reserves"] += net
            continue

    # Profit movement
    profit_amt = _d(profit_for_period)
    if include_unclosed_profit and profit_amt != 0:
        rows["profit_for_period"]["values"]["retained_earnings"] += profit_amt

    # Closing = opening + all movements
    for bk in bucket_keys:
        closing = rows["opening_balance"]["values"][bk]
        for rk in (
            "share_issues",
            "profit_for_period",
            "other_comprehensive_income",
            "dividends",
            "drawings",
            "prior_adjustments",
        ):
            closing += rows[rk]["values"][bk]
        rows["closing_balance"]["values"][bk] = closing

    # If explicit closing balances were supplied, prefer them for capital/premium/reserve truth
    explicit_closing = {bk: Decimal("0") for bk in bucket_keys}
    explicit_found = set()
    for acc in closing_equity_accounts:
        bucket = _equity_bucket_for_account(acc)
        if not bucket:
            continue
        explicit_closing[bucket] += _d(acc.get("balance"))
        explicit_found.add(bucket)

    # For unclosed-profit reporting, ledger RE usually excludes current-year profit.
    # So only replace non-RE structural buckets directly from closing balances.
    for bk in ("ordinary_share_capital", "preference_share_capital", "share_premium", "reserves"):
        if bk in explicit_found:
            rows["closing_balance"]["values"][bk] = explicit_closing[bk]

    # Totals
    final_rows = []
    for rk in row_keys:
        total = sum(rows[rk]["values"][bk] for bk in bucket_keys)
        values = {bk: _money(rows[rk]["values"][bk]) for bk in bucket_keys}
        values["total"] = _money(total)
        final_rows.append({
            "key": rk,
            "label": row_labels[rk],
            "values": values,
        })

    return {
        "meta": {
            "company_id": company_id,
            "company_name": company_name,
            "currency": currency,
            "period": {"from": period_from, "to": period_to},
            "statement": "socie",
        },
        "columns": columns,
        "rows": final_rows,
    }