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

def _equity_present_balance(x: Any) -> Decimal:
    """
    Equity accounts are credit balances in the ledger.
    For SOCIE presentation, show them as positive.
    """
    return abs(_d(x))

def _equity_bucket_for_account(row: dict) -> str | None:
    role = str(row.get("role") or "").strip().lower()
    name = str(row.get("name") or "").strip().lower()
    category = str(row.get("category") or "").strip().lower()

    role_map = {
        "equity_share_capital": "ordinary_share_capital",
        "equity_share_capital_ordinary": "ordinary_share_capital",
        "equity_preference_share_capital": "preference_share_capital",
        "equity_share_capital_preference": "preference_share_capital",
        "equity_share_premium": "share_premium",

        "equity_owner_capital": "owner_capital",
        "equity_general": "owner_capital",

        "equity_retained_earnings": "retained_earnings",
        "equity_accumulated_surplus": "retained_earnings",
        "equity_current_year_surplus": "retained_earnings",

        "equity_revaluation_reserve": "reserves",
        "equity_fx_translation_reserve": "reserves",
        "equity_oci_reserve": "reserves",
        "equity_regulatory_reserve": "reserves",
        "equity_restricted_funds": "reserves",
    }

    if role in role_map:
        return role_map[role]

    # fallback only if role missing
    if "owner" in name and "capital" in name:
        return "owner_capital"
    if "retained" in name:
        return "retained_earnings"
    if "share premium" in name:
        return "share_premium"
    if "preference" in name and "share" in name:
        return "preference_share_capital"
    if "share capital" in name:
        return "ordinary_share_capital"
    if "reserve" in name or "fund" in category:
        return "reserves"

    return None

def build_statement_of_changes_in_equity(
    *,
    company_id: int,
    company_name: str,
    currency: str,
    organization_type: str = "private_company",
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

    organization_type = (organization_type or "private_company").strip().lower()

    SOCIE_COLUMNS_BY_ORG = {
        "private_company": [
            ("ordinary_share_capital", "Ordinary Share Capital"),
            ("owner_capital", "Owner's Capital"),
            ("preference_share_capital", "Preference Share Capital"),
            ("share_premium", "Share Premium"),
            ("retained_earnings", "Retained Earnings"),
            ("reserves", "Reserves"),
        ],
        "public_company": [
            ("ordinary_share_capital", "Ordinary Share Capital"),
            ("preference_share_capital", "Preference Share Capital"),
            ("share_premium", "Share Premium"),
            ("retained_earnings", "Retained Earnings"),
            ("reserves", "Reserves"),
        ],
        "sole_trader": [
            ("owner_capital", "Owner Capital"),
            ("retained_earnings", "Accumulated Profit / Loss"),
        ],
        "partnership": [
            ("partner_capital", "Partners' Capital"),
            ("partner_current", "Partners' Current Accounts"),
        ],
        "ngo": [
            ("restricted_funds", "Restricted Funds"),
            ("unrestricted_funds", "Unrestricted Funds"),
            ("accumulated_surplus", "Accumulated Surplus"),
        ],
        "npo": [
            ("restricted_funds", "Restricted Funds"),
            ("unrestricted_funds", "Unrestricted Funds"),
            ("accumulated_surplus", "Accumulated Surplus"),
        ],
        "trust": [
            ("trust_capital", "Trust Capital"),
            ("beneficiary_funds", "Beneficiary Funds"),
            ("accumulated_surplus", "Accumulated Income"),
        ],
        "cooperative": [
            ("member_capital", "Member Shares"),
            ("retained_earnings", "Retained Earnings"),
            ("reserves", "Reserves"),
        ],
        "body_corporate": [
            ("accumulated_surplus", "Accumulated Surplus"),
            ("restricted_funds", "Reserve Fund"),
        ],
        "club_association": [
            ("accumulated_surplus", "Accumulated Fund"),
            ("restricted_funds", "Restricted Funds"),
            ("current_year_surplus", "Current Year Surplus / (Deficit)"),
        ],
        "government_entity": [
            ("accumulated_surplus", "Accumulated Surplus"),
            ("reserves", "Reserves"),
        ],
    }

    bucket_pairs = SOCIE_COLUMNS_BY_ORG.get(
        organization_type,
        SOCIE_COLUMNS_BY_ORG["private_company"]
    )

    columns = [{"key": key, "label": label} for key, label in bucket_pairs]
    columns.append({"key": "total", "label": "Total"})

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

    bucket_keys = [key for key, label in bucket_pairs]

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

        if bucket in {
            "ordinary_share_capital",
            "preference_share_capital",
            "share_premium",
            "owner_capital",
        }:
            rows["share_issues"]["values"][bucket] += net
            continue

        if role == "equity_dividends":
            target_bucket = "retained_earnings" if "retained_earnings" in bucket_keys else bucket
            if target_bucket in bucket_keys:
                rows["dividends"]["values"][target_bucket] += net
            continue

        if role == "equity_drawings":
            target_bucket = "owner_capital" if "owner_capital" in bucket_keys else "retained_earnings"
            if target_bucket in bucket_keys:
                rows["drawings"]["values"][target_bucket] += net
            continue

        if role == "equity_opening_balance":
            target_bucket = "retained_earnings" if "retained_earnings" in bucket_keys else bucket
            if target_bucket in bucket_keys:
                rows["prior_adjustments"]["values"][target_bucket] += net
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
        if not bucket or bucket not in explicit_closing:
            continue

        explicit_closing[bucket] += _equity_present_balance(acc.get("balance"))
        explicit_found.add(bucket)

    for bk in (
        "ordinary_share_capital",
        "owner_capital",
        "preference_share_capital",
        "share_premium",
        "reserves",
    ):
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