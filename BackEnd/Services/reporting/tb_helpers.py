from __future__ import annotations

from typing import Any, Dict, List, Optional


def _num_from_code(code: str) -> int:
    """Extract last integer found in code like 'BS_CA_1000' or '1000'."""
    if not code:
        return -1
    digits = ""
    for ch in reversed(str(code).strip()):
        if ch.isdigit():
            digits = ch + digits
        elif digits:
            break
    return int(digits) if digits else -1


def _tb_debit(row: Dict[str, Any]) -> float:
    v = row.get("debit_total")
    if v is None:
        v = row.get("debit")
    return float(v or 0.0)


def _tb_credit(row: Dict[str, Any]) -> float:
    v = row.get("credit_total")
    if v is None:
        v = row.get("credit")
    return float(v or 0.0)


def _closing_balance(row: Dict[str, Any]) -> float:
    # TB convention: debit - credit
    return _tb_debit(row) - _tb_credit(row)


def split_cash_and_overdraft(tb_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    If a cash/bank account has a credit balance (closing < 0),
    reclassify it into Bank Overdraft (current liability).

    IMPORTANT:
    - Emits overdraft line with code 'BS_CL_2105' to match your COA bucket code.
    - If 'BS_CL_2105' already exists in tb_rows, it will add to it (no duplicate lines).
    """
    rows = tb_rows or []
    out: List[Dict[str, Any]] = []

    overdraft_code = "BS_CL_2105"
    overdraft_total = 0.0

    existing_overdraft: Optional[Dict[str, Any]] = None

    for r in rows:
        code = str(r.get("code") or r.get("account") or "").strip()
        name = str(r.get("name") or "").lower()
        fam = str(r.get("code_family") or "").upper().strip()

        # pick up existing overdraft row (avoid duplicate)
        if code == overdraft_code:
            existing_overdraft = dict(r)
            continue

        num = _num_from_code(code)

        # cash detection (bucket aware + numeric aware + text fallback)
        is_cash = (
            fam == "BS_CA"
            or num == 1000
            or "cash" in name
            or "bank" in name
        )

        if not is_cash:
            out.append(r)
            continue

        closing = _closing_balance(r)

        # normal cash (debit balance)
        if closing >= 0:
            out.append(r)
            continue

        # cash credit balance -> overdraft
        overdraft_total += abs(closing)

        # keep cash visible but zeroed (optional)
        z = dict(r)

        # zero using the same "shape" the row already has
        if ("debit_total" in z) or ("credit_total" in z):
            z["debit_total"] = 0.0
            z["credit_total"] = 0.0
        else:
            z["debit"] = 0.0
            z["credit"] = 0.0

        z["closing_balance"] = 0.0
        out.append(z)

        if overdraft_total > 0:
            if existing_overdraft is None:
                existing_overdraft = {
                    "code": overdraft_code,
                    "name": "Bank Overdraft",
                    "section": "Current Liabilities",
                    "category": "Liability",
                    "standard": "",
                    "template_code": "2105",
                    "code_family": "BS_CL",
                    "code_numeric": 2105,
                    "debit": 0.0,
                    "credit": 0.0,
                }
            else:
                existing_overdraft = dict(existing_overdraft)
                existing_overdraft["debit"]  = float(existing_overdraft.get("debit")  or existing_overdraft.get("debit_total")  or 0.0)
                existing_overdraft["credit"] = float(existing_overdraft.get("credit") or existing_overdraft.get("credit_total") or 0.0)

            existing_overdraft["credit"] = float(existing_overdraft.get("credit") or 0.0) + float(overdraft_total)
            out.append(existing_overdraft)

    return out
