from typing import Tuple
from typing import Dict, Any, Optional
from BackEnd.Services.utils.industry_utils import (
    normalize_industry_pair,
    project_uses_material_costing,
    project_uses_boq_budgeting,
    project_work_unit_label,
)
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
        "pnl_labels": {"revenue": "Professional service income"},
        "uses_manufacturing": False,
    },

    "Management Services": {
        "pnl_layout": "service_simple",
        "is_service_only": True,
        "uses_inventory": False,
        "uses_cogs": False,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "pnl_labels": {"revenue": "Management service income"},
        "uses_manufacturing": False,
    },
    "Banking & Financial Services": {
        "pnl_layout": "service_simple",
        "is_service_only": True,
        "uses_inventory": False,
        "uses_cogs": False,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "pnl_labels": {"revenue": "Interest & service income"},
        "uses_manufacturing": False,
    },
    "Body Corporate": {
        "pnl_layout": "service_simple",
        "is_service_only": True,
        "uses_inventory": False,
        "uses_cogs": False,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "pnl_labels": {"revenue": "Levy income"},
        "uses_manufacturing": False,
    },
    "Property Management": {
        "pnl_layout": "service_simple",
        "is_service_only": True,
        "uses_inventory": False,
        "uses_cogs": False,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "uses_manufacturing": False,
    },
    "NPO Education": {
        "pnl_layout": "npo_performance",
        "is_service_only": True,
        "uses_inventory": True,
        "uses_cogs": False,
        "default_inventory_mode": "service",
        "default_valuation": None,
        "pnl_labels": {"revenue": "Education income"},
        "uses_manufacturing": False,
        "is_school": True,
        "school_type": "npo_education",
        "work_unit_label": "Learner",
        "vat_exempt": True,
        "input_vat_claimable": False,
        "uses_projects": True,
    },
    "NPO IT": {
        "pnl_layout": "npo_performance",
        "is_service_only": True,
        "uses_inventory": False,
        "uses_cogs": False,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "pnl_labels": {"revenue": "IT service income"},
        "uses_manufacturing": False,
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
        "uses_manufacturing": False,
    },
    "IT & Technology": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pnl_labels": {"cogs": "Cost of service"},
        "uses_manufacturing": False,
    },
    "Engineering & Technical": {
        "pnl_layout": "project_wip",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pnl_labels": {"cogs": "Direct project costs"},
        "uses_manufacturing": False,
    },

    "Construction": {
        "pnl_layout": "project_wip",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pnl_labels": {"cogs": "Direct project costs"},
        "uses_manufacturing": False,
    },

    "Mining": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pos_mode": "retail",
        "pnl_labels": {"cogs": "Cost of mining operations"},
        "uses_manufacturing": False,
    },

    "Transport": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pnl_labels": {"cogs": "Cost of revenue"},
        "uses_manufacturing": False,
    },

    "NPO Transport": {
        "pnl_layout": "npo_performance",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": False,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pnl_labels": {"revenue": "Transport income"},
        "uses_manufacturing": False,
    },

    # -----------------------------
    # Design & Creative Services
    # -----------------------------

    "Interior Design": {
        "pnl_layout": "project_wip",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pnl_labels": {"cogs": "Direct design & project costs"},
        "uses_manufacturing": False,
    },

    "Architecture": {
        "pnl_layout": "project_wip",
        "is_service_only": False,
        "uses_inventory": False,
        "uses_cogs": True,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "pnl_labels": {"cogs": "Direct architectural project costs"},
        "uses_manufacturing": False,
    },

    "Graphic Design": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": True,
        "uses_inventory": False,
        "uses_cogs": True,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "pnl_labels": {
            "cogs": "Production costs"
        },
        "uses_manufacturing": False,
    },

    "Advertising Agency": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": False,
        "uses_cogs": True,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "pnl_labels": {
            "cogs": "Campaign costs"
        },
        "uses_manufacturing": False,
    },

    "Creative Studio": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": False,
        "uses_cogs": True,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "pnl_labels": {"cogs": "Creative production costs"},
        "uses_manufacturing": False,
    },

    "Landscape Design": {
        "pnl_layout": "project_wip",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "uses_manufacturing": False,
    },

    # -----------------------------
    # Uses inventory (MUST have defaults)
    # -----------------------------
    "Public School": {
        "pnl_layout": "service_simple",               # ← CHANGED from "service_gross_margin"
        "is_service_only": True,                      # ← CHANGED from False
        "uses_inventory": True,                       # Keep True (for tracking)
        "uses_cogs": False,                           # ← CHANGED from True!
        "default_inventory_mode": "service",           # ← CHANGED from "optional"!
        "default_valuation": None,                    # No valuation needed
        "pos_mode": None,                             # ← CHANGED from "retail"!
        "manufacturer_dealer_lessor_capable": False,
        "pnl_labels": {"revenue": "Income"},    
        "uses_manufacturing": False,      # Changed from cogs
        
        # ══════════════════════════════════════════════════
        # School-specific fields (NEW!)
        # ══════════════════════════════════════════════════
        "is_school": True,
        "school_type": "public",
        "work_unit_label": "Learner",
        "vat_exempt": True,                           # SA public schools VAT exempt!
        "input_vat_claimable": False,                 # Cannot claim input VAT!
        "uses_projects": True,                        # Capital projects enabled
        "uses_material_costing": False,               # Non-material projects only
        "uses_boq_budgeting": False,                  # No BOQ needed
        "uses_manufacturing": False,
    },
    "Private School": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "optional",   # or "none" if you don’t want it enabled automatically
        "default_valuation": "fifo",
        "pnl_labels": {"cogs": "Cost of goods / supplies"},
        "pos_mode": "retail",
        "uses_manufacturing": False,
    },

    "College / Training Center": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "weighted_avg",
        "pnl_labels": {"cogs": "Cost of service"},
        "uses_manufacturing": False,
    },

    "Clubs & Associations": {
        "pnl_layout": "trading_hunter",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pos_mode": "club",
        "uses_manufacturing": False,
    },

    "Private Healthcare": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pnl_labels": {"cogs": "Cost of service"},
        "pos_mode": "retail",
        "uses_manufacturing": False,
    },
    "NPO Healthcare": {
        "pnl_layout": "npo_performance",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": False,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "pnl_labels": {"revenue": "Healthcare income"},
        "uses_manufacturing": False,
    },

    "Retail & Wholesale": {
        "pnl_layout": "trading_hunter",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pos_mode": "retail",
        "pnl_labels": {"cogs": "Cost of goods sold"},
        "uses_manufacturing": False,
    },

    "Car Dealership": {
        "pnl_layout": "trading_hunter",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pos_mode": "retail",
        "manufacturer_dealer_lessor_capable": True,
        "pnl_labels": {"cogs": "Cost of vehicles sold"},
        "uses_manufacturing": False,
    },

    "Restaurant": {
        "pnl_layout": "trading_hunter",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pos_mode": "restaurant",
        "pnl_labels": {"cogs": "Food & beverage costs"},
        "uses_manufacturing": False,
    },

    "Hospitality": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pos_mode": "restaurant",
        "pnl_labels": {"cogs": "Hospitality operating costs"},
        "uses_manufacturing": False,
    },

    "Automotive Services": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pos_mode": "retail",
        "pnl_labels": {"cogs": "Vehicle service & parts costs"},
        "uses_manufacturing": False,
    },

    "Security Services": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pos_mode": "retail",
        "pnl_labels": {"cogs": "Security service delivery costs"},
        "uses_manufacturing": False,
    },

    "Telecommunications": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pos_mode": "retail",
        "pnl_labels": {"cogs": "Network & service delivery costs"},
        "uses_manufacturing": False,
    },
    "Manufacturing": {
        "pnl_layout": "trading_hunter",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pos_mode": "retail",
        "manufacturer_dealer_lessor_capable": True,
        "pnl_labels": {"cogs": "Cost of goods manufactured"},
        "uses_manufacturing": True,
    },
    "Agriculture": {
        "pnl_layout": "trading_hunter",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pos_mode": "retail",
        "pnl_labels": {"cogs": "Cost of agricultural production"},
        "uses_manufacturing": False,
    },
    "Personal Care & Beauty Services": {
        "pnl_layout": "trading_hunter",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pos_mode": "retail",
        "pnl_labels": {"cogs": "Service consumables & product costs"},
        "uses_manufacturing": False,
    },

    "Health & Fitness": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pos_mode": "retail",
        "pnl_labels": {"cogs": "Trainer, class & product costs"},
        "uses_manufacturing": False,
    },

    "Education & Training": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pnl_labels": {"cogs": "Training delivery costs"},
        "uses_manufacturing": False,
    },

    "Cleaning Services": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pnl_labels": {"cogs": "Cleaning job costs"},
        "uses_manufacturing": False,
    },

    "Logistics & Transport": {
        "pnl_layout": "service_gross_margin",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pnl_labels": {"cogs": "Cost of revenue"},
        "uses_manufacturing": False,
    },

    "Personal Trainer": {
        "pnl_layout": "service_simple",
        "is_service_only": True,
        "uses_inventory": False,
        "uses_cogs": True,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "pnl_labels": {"cogs": "Training delivery costs"},
        "uses_manufacturing": False,
    },

    "Tutoring Services": {
        "pnl_layout": "service_simple",
        "is_service_only": True,
        "uses_inventory": False,
        "uses_cogs": True,
        "default_inventory_mode": "none",
        "default_valuation": None,
        "pnl_labels": {"cogs": "Tutor delivery costs"},
        "uses_manufacturing": False,
    },
    
    "Design & Creative Services": {
        "pnl_layout": "project_wip",
        "is_service_only": False,
        "uses_inventory": True,
        "uses_cogs": True,
        "default_inventory_mode": "internal",
        "default_valuation": "fifo",
        "pnl_labels": {
            "cogs": "Direct project costs"
        },
        "uses_manufacturing": False,
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
        "pos_mode": "retail",
        "uses_manufacturing": False,
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
        "manufacturer_dealer_lessor_capable": bool(
            profile.get(
                "manufacturer_dealer_lessor_capable",
                False,
            )
        ),
        "uses_inventory": bool(profile.get("uses_inventory", False)),
        "uses_cogs": bool(profile.get("uses_cogs", False)),
        "default_inventory_mode": profile.get("default_inventory_mode", "none"),
        "default_valuation": profile.get("default_valuation"),
        "pnl_layout": profile.get("pnl_layout"),
        "pnl_labels": profile.get("pnl_labels") or {},
        "pos_mode": profile.get("pos_mode"),
        "uses_manufacturing": bool(
            profile.get("uses_manufacturing", False)
        ),
        "uses_material_costing": project_uses_material_costing(industry, sub_industry),
        "uses_boq_budgeting": project_uses_boq_budgeting(industry, sub_industry),
        "work_unit_label": project_work_unit_label(industry, sub_industry),
    }


