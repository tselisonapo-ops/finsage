# BackEnd/Services/posting_rules.py

from __future__ import annotations
from typing import Callable, Dict, List, Any, Optional, Literal, TypedDict
from BackEnd.Services.coa_service import AccountRow
from BackEnd.Services.lease_engine import handle_ifrs16_lease_entry
from datetime import date
from BackEnd.Services.lease_engine import LeaseScheduleResult
from BackEnd.Services.db_service import db_service


# ---------------------------------------------------------------
#  VAT behaviour description (for the UI)
# ---------------------------------------------------------------

VatDirection = Literal["input", "output", "either", "none"]


class VatConfig(TypedDict):
    show_vat: bool          # should VAT fields be enabled?
    vat_direction: VatDirection
    default_rate: Optional[float]  # e.g. 0.15, or None if not applicable


def _slice_account_row(row: AccountRow):
    """
    Support both 6-tuple (name, code, category, group, desc, ifrs_tag)
    and 7-tuple (with 'posting' at the end).
    """
    if len(row) >= 6:
        name, code, category, reporting_group, description, ifrs_tag = row[:6]
    else:
        raise ValueError("AccountRow must have at least 6 elements")
    return name, code, category, reporting_group, description, ifrs_tag


def vat_behavior_for_account(row: AccountRow, default_rate: float = 0.15) -> VatConfig:
    """
    Very simple VAT rules to drive the *form* behaviour.

    Rules (you can refine as you wish):
      - Cash & Equivalents (bank, petty cash) → VAT off
      - Income (Sales/Service) → output VAT by default
      - Expense & 'acquirable' assets (PPE, Inventories, Current Assets)
        → input VAT by default
      - Everything else → VAT off unless the user chooses to override.
    """
    name, code, category, reporting_group, description, ifrs_tag = _slice_account_row(row)

    lname = name.lower()
    lgroup = reporting_group.lower()

    # 1) Cash / bank / petty cash – NEVER show VAT fields
    if (
        reporting_group == "Cash & Equivalents"
        or "bank" in lname
        or "cash" in lname
        or "petty cash" in lname
    ):
        return VatConfig(show_vat=False, vat_direction="none", default_rate=None)  # type: ignore

    # 2) Income – usually OUTPUT VAT (sales, services)
    if category == "Income":
        return VatConfig(show_vat=True, vat_direction="output", default_rate=default_rate)  # type: ignore

    # 3) Expenses – usually INPUT VAT (purchases, costs)
    if category == "Expense":
        # You might want to narrow this, but for now assume recoverable
        return VatConfig(show_vat=True, vat_direction="input", default_rate=default_rate)  # type: ignore

    # 4) Acquirable assets → INPUT VAT
    if category == "Asset":
        if reporting_group in (
            "Property, Plant & Equipment",
            "Inventories",
            "Current Assets",
            "Non-Current Assets",
        ):
            return VatConfig(show_vat=True, vat_direction="input", default_rate=default_rate)  # type: ignore

    # 5) Everything else – off by default, user can override if you allow
    return VatConfig(show_vat=False, vat_direction="none", default_rate=None)  # type: ignore


# ---------------------------------------------------------------
#  IFRS-based posting handlers (lease, revenue, etc.)
# ---------------------------------------------------------------

PostingHandler = Callable[[Dict[str, Any]], Dict[str, Any]]


def get_ifrs_tag(row: AccountRow) -> Optional[str]:
    if len(row) >= 6:
        return row[5]
    return None


IFRS_POSTING_HANDLERS: Dict[str, PostingHandler] = {
    "IFRS 16": handle_ifrs16_lease_entry,
    # You can add more later:
    # "IFRS 15": handle_ifrs15_revenue_entry,
    # "IAS 16":  handle_ias16_capex_entry,
}


def dispatch_posting_rule(
    account: AccountRow,
    ui_payload: Dict[str, Any],
    vat_default_rate: float = 0.15,
) -> Dict[str, Any]:
    """
    Main entry point called by your posting API.

    It returns a dict that the frontend can use to decide:

      - If 'mode' is 'plain' → just post the JE as normal.
      - If 'mode' is 'wizard' → open a specialist wizard (e.g. lease).
      - Always returns 'vat' → how to treat VAT fields for this account.

    Example response (plain JE with VAT enabled for input tax):
      {
        "mode": "plain",
        "journals": [],
        "vat": {
          "show_vat": true,
          "vat_direction": "input",
          "default_rate": 0.15
        }
      }

    Example response (lease wizard, VAT off for the selected account):
      {
        "mode": "wizard",
        "wizard": "lease",
        "role": "lessee",
        "account_code": "2610",
        "vat": {
          "show_vat": false,
          "vat_direction": "none",
          "default_rate": null
        }
      }
    """
    tag = get_ifrs_tag(account)
    handler = IFRS_POSTING_HANDLERS.get(tag or "")

    vat_cfg = vat_behavior_for_account(account, default_rate=vat_default_rate)

    # No IFRS handler → plain JE, but still return VAT config
    if not handler:
        return {
            "mode": "plain",
            "journals": [],      # you can ignore this for now
            "vat": vat_cfg,
        }

    # IFRS handler present (e.g. IFRS 16 lease)
    rule_result = handler(ui_payload)

    # Make sure we always attach VAT config too
    if "vat" not in rule_result:
        rule_result["vat"] = vat_cfg

    # Also ensure mode is set (handler should set it, but guard for safety)
    rule_result.setdefault("mode", "plain")

    # BackEnd/Services/lease_posting.py


def liability_at_date(result: LeaseScheduleResult, as_of: date) -> float:
    """
    Find the lease liability (opening balance) at a given date.
    For now we require that as_of == period_start of one of the periods.
    """
    for p in result.periods:
        if p.period_start == as_of:
            return float(p.opening_liability)

    raise ValueError(
        "Go-live date must match a period start in the lease schedule. "
        "For existing leases, please choose a go-live date that is the first day "
        "of one of the payment periods."
    )


def build_lessee_opening_journal(
    result: LeaseScheduleResult,
    mode: str = "inception",
    go_live_date: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """
    Build the Day-1 / transition journal for a lessee:

      • mode="inception"  -> Day-1 journal at lease start (standard IFRS 16).
      • mode="existing"   -> Transition journal at go-live date (mid-term adoption).

    For the EXISTING lease (mid-term) we use a simplified modified retrospective
    approach: we set ROU at go-live equal to the lease liability at that date
    (so no retained-earnings difference line for now).
    """
    lease = result.lease_input

    if not lease.lease_liability_account or not lease.rou_asset_account:
        raise ValueError("Lease liability and ROU asset accounts are required.")

    lines: List[Dict[str, Any]] = []

    if mode == "existing":
        if go_live_date is None:
            raise ValueError("go_live_date is required for existing lease mode.")

        carrying_liab = liability_at_date(result, go_live_date)
        opening_liab = round(carrying_liab, 2)

        # Simplified modified retrospective: ROU = liability at transition
        opening_rou = opening_liab
        description = f"IFRS 16 transition - existing lease {lease.lease_name}"

    else:
        # Normal Day-1 opening balances from the schedule engine
        opening_liab = float(result.opening_lease_liability)
        opening_rou = float(result.opening_rou_asset)
        go_live_date = lease.start_date
        description = f"Initial recognition of lease - {lease.lease_name}"

    # 1) DR ROU asset
    lines.append(
        {
            "account_code": lease.rou_asset_account,
            "description": description,
            "debit": round(opening_rou, 2),
            "credit": 0.0,
        }
    )

    # 2) CR Lease liability
    lines.append(
        {
            "account_code": lease.lease_liability_account,
            "description": description,
            "debit": 0.0,
            "credit": round(opening_liab, 2),
        }
    )

    # 3) For inception only, optionally park initial direct costs to an offset account
    if (
        mode == "inception"
        and getattr(lease, "initial_direct_costs", 0.0)
        and getattr(lease, "direct_costs_offset_account", None)
    ):
        amt = float(lease.initial_direct_costs)
        if amt != 0:
            lines.append(
                {
                    "account_code": lease.direct_costs_offset_account,
                    "description": f"Initial direct costs - {lease.lease_name}",
                    "debit": 0.0,
                    "credit": round(amt, 2),
                }
            )

    return lines

def resolve_control_posting_code(company_id: int, setting_value: str, label: str) -> str:
    if not setting_value:
        raise ValueError(f"{label} control not set")

    row = db_service.get_account_row_for_posting(company_id, setting_value)
    if not row:
        raise ValueError(f"{label} control '{setting_value}' not found in COA")

    code = (row[1] or "").strip()
    if not code:
        raise ValueError(f"{label} control resolved blank posting code")

    return code
