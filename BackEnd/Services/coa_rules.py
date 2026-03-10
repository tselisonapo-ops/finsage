# BackEnd/Services/coa_rules.py
from __future__ import annotations
from typing import Dict, Any, Iterable, List, Optional

from BackEnd.Services.industry_profiles import get_industry_profile, normalize_industry_pair

def profile_flags(industry: Optional[str], sub_industry: Optional[str]) -> Dict[str, Any]:
    ind_norm, sub_norm, _, _ = normalize_industry_pair(industry, sub_industry)

    # If still missing, fall back safely
    ind_key = ind_norm or "General Business"

    p = get_industry_profile(ind_key, sub_norm)

    return {
        "is_service_only": bool(p.get("is_service_only")),
        "uses_inventory": bool(p.get("uses_inventory")),
        "uses_cogs": bool(p.get("uses_cogs")),
        "pnl_layout": p.get("pnl_layout"),
        "pnl_labels": p.get("pnl_labels") or {},
        "default_inventory_mode": p.get("default_inventory_mode", "none"),
        "default_valuation": p.get("default_valuation"),
    }

def should_exclude_account(
    *,
    name: str,
    section: str,
    category: str,
    flags: Dict[str, Any],
) -> bool:
    """
    Apply your business rules consistently:
    - Service-only => remove inventories + classic cost-of-sales/COGS rows
    - uses_inventory=False => remove inventory rows
    - uses_cogs=False => remove cost-of-sales/COGS rows
    """
    nm = (name or "").lower()
    sec = (section or "").lower()
    cat = (category or "").lower()

    is_service_only = flags.get("is_service_only", False)
    uses_inventory = flags.get("uses_inventory", False)
    uses_cogs = flags.get("uses_cogs", False)

    looks_inventory = ("inventor" in nm) or ("stock" in nm)
    looks_cogs = ("cost of sales" in nm) or ("cogs" in nm) or ("cost of revenue" in nm)

    # strong rule: service-only removes both
    if is_service_only:
        if looks_inventory:
            return True
        if looks_cogs:
            return True

    # explicit rules
    if not uses_inventory and looks_inventory:
        return True
    if not uses_cogs and looks_cogs:
        return True

    return False


def filter_rows_dict(
    rows: Iterable[Dict[str, Any]],
    *,
    industry: str,
    sub_industry: Optional[str],
) -> List[Dict[str, Any]]:
    flags = profile_flags(industry, sub_industry)
    out: List[Dict[str, Any]] = []
    for r in rows:
        if should_exclude_account(
            name=str(r.get("name") or ""),
            section=str(r.get("section") or ""),
            category=str(r.get("category") or ""),
            flags=flags,
        ):
            continue
        out.append(r)
    return out
