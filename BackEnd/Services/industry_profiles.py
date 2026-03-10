from typing import Tuple
from typing import Dict, Any, Optional
from BackEnd.Services.utils.industry_utils import normalize_industry_pair

# ✅ Ensure EVERY industry that uses_inventory=True has default_inventory_mode + default_valuation
# ✅ Ensure EVERY industry has explicit default_inventory_mode (even service-only ones)
# ✅ Prevent your "Car Dealership → inventory_mode='none'" dilemma permanently

INDUSTRY_PROFILES: Dict[str, Dict[str, object]] = {
    # -----------------------------
    # Service-only (no inventory)
    # -----------------------------
    "Professional Services": {
        "pnl_layout": "service_simple",
        "is_service_only": True,
        "uses_inventory": False,
        "uses_cogs": False,
        "default_inventory_mode": "none",
        "default_valuation": None,
    },
    "Management Services": {
        "pnl_layout": "service_simple",
        "is_service_only": True,
        "uses_inventory": False,
        "uses_cogs": False,
        "default_inventory_mode": "none",
        "default_valuation": None,
    },
    "Banking & Financial Services": {
        "pnl_layout": "service_simple",
        "is_service_only": True,
        "uses_inventory": False,
        "uses_cogs": False,
        "default_inventory_mode": "none",
        "default_valuation": None,
    },
    "Body Corporate": {
        "pnl_layout": "service_simple",
        "is_service_only": True,
        "uses_inventory": False,
        "uses_cogs": False,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "pnl_labels": {"revenue": "Levy income"},
    },
    "Property Management": {
        "pnl_layout": "service_simple",
        "is_service_only": True,
        "uses_inventory": False,
        "uses_cogs": False,
        "default_inventory_mode": "none",
        "default_valuation": None,
    },
    "NPO Education": {
        "pnl_layout": "npo_performance",
        "is_service_only": True,
        "uses_inventory": False,
        "uses_cogs": False,
        "default_inventory_mode": "none",
        "default_valuation": None,
    },
    "NPO IT": {
        "pnl_layout": "npo_performance",
        "is_service_only": True,
        "uses_inventory": False,
        "uses_cogs": False,
        "default_inventory_mode": "none",
        "default_valuation": None,
    },

    # -----------------------------
    # Service-ish but has COGS (no inventory)
    # -----------------------------
    "Call Center": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": False,
        "uses_cogs": True,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "pnl_labels": {"cogs": "Cost of revenue"},
    },
    "IT & Technology": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": False,
        "uses_cogs": True,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "pnl_labels": {"cogs": "Cost of service"},
    },
    "Engineering & Technical": {
        "pnl_layout": "project_wip",
        "is_service_only": False,
        "uses_inventory": False,
        "uses_cogs": True,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "pnl_labels": {"cogs": "Direct project costs"},
    },
    "Construction": {
        "pnl_layout": "project_wip",
        "is_service_only": False,
        "uses_inventory": False,
        "uses_cogs": True,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "pnl_labels": {"cogs": "Direct project costs"},
    },
    "Mining": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": False,
        "uses_cogs": True,
        "default_inventory_mode": "none",
        "default_valuation": None,
    },
    "Transport": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": False,
        "uses_cogs": True,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "pnl_labels": {"cogs": "Cost of revenue"},
    },
    "NPO Transport": {
        "pnl_layout": "npo_performance",
        "is_service_only": False,
        "uses_inventory": False,
        "uses_cogs": False,
        "default_inventory_mode": "none",
        "default_valuation": None,
    },

    # -----------------------------
    # Uses inventory (MUST have defaults)
    # -----------------------------
    "Private School": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pnl_labels": {"cogs": "Cost of service"},
    },
    "Public School": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "optional",   # or "none" if you don’t want it enabled automatically
        "default_valuation": "fifo",
        "pnl_labels": {"cogs": "Cost of goods / supplies"},
    },

    "College / Training Center": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "weighted_avg",
        "pnl_labels": {"cogs": "Cost of service"},
    },

    "Clubs & Associations": {
        "pnl_layout": "trading_hunter",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
    },

    "Private Healthcare": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pnl_labels": {"cogs": "Cost of service"},
    },
    "NPO Healthcare": {
        "pnl_layout": "npo_performance",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": False,
        # If you truly want uses_inventory=True but inventory disabled, keep "none".
        # Otherwise set to "internal".
        "default_inventory_mode": "none",
        "default_valuation": None,
    },

    "Retail & Wholesale": {
        "pnl_layout": "trading_hunter",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
    },
    "Car Dealership": {
        "pnl_layout": "trading_hunter",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
    },
    "Restaurant": {
        "pnl_layout": "trading_hunter",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
    },
    "Hospitality": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
    },
    "Automotive Services": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
    },
    "Security Services": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
    },
    "Telecommunications": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
    },
    "Manufacturing": {
        "pnl_layout": "trading_hunter",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
    },
    "Agriculture": {
        "pnl_layout": "trading_hunter",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
    },

    "Logistics & Transport": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pnl_labels": {"cogs": "Cost of revenue"},
    },

    # -----------------------------
    # Generic / fallback
    # -----------------------------
    "General Business": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pnl_labels": {"revenue": "Revenue", "cogs": "Cost of revenue"},
    },
}

def get_industry_profile(industry: Optional[str], sub_industry: Optional[str]) -> Dict[str, Any]:
    # ✅ always normalize to DISPLAY names for profiles
    ind_norm, sub_norm, _, _ = normalize_industry_pair(industry, sub_industry)

    ind_key = (ind_norm or "").strip()
    sub_key = (sub_norm or "").strip()

    profile = INDUSTRY_PROFILES.get(ind_key) or {}

    # Optional sub-industry override only if explicitly defined
    if sub_key and sub_key in INDUSTRY_PROFILES:
        profile = {**profile, **INDUSTRY_PROFILES[sub_key]}
        key = sub_key
    else:
        key = ind_key or None

    return {
        "key": key,
        "is_service_only": bool(profile.get("is_service_only", False)),
        "uses_inventory": bool(profile.get("uses_inventory", False)),
        "uses_cogs": bool(profile.get("uses_cogs", False)),
        "default_inventory_mode": profile.get("default_inventory_mode", "none"),
        "default_valuation": profile.get("default_valuation"),
        "pnl_layout": profile.get("pnl_layout"),
        "pnl_labels": profile.get("pnl_labels") or {},
    }


