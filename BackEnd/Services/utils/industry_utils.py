import unicodedata
import re
from typing import Tuple, Optional


INDUSTRY_ALIASES = {
    "information technology": "IT & Technology",
    "it & technology": "IT & Technology",
    "it and technology": "IT & Technology",
    "it": "IT & Technology",
    "technology": "IT & Technology",

    "logistics & transport": "Logistics & Transport",
    "logistics and transport": "Logistics & Transport",
    "logistics": "Logistics & Transport",
    "transport": "Transport",
    "npo transport": "NPO Transport",

    "clubs & associations": "Clubs & Associations",
    "clubs and associations": "Clubs & Associations",
    "club": "Clubs & Associations",
    "association": "Clubs & Associations",
}


SUB_INDUSTRY_ALIASES = {
    "manageditservices": "Managed IT Services",
    "softwaredevelopment": "Software Development",
    "networkinginfrastructure": "Networking & Infrastructure",

    "courier / last mile": "Courier/Last Mile",
    "freight / logistics": "Freight/Logistics",

    "newvehicles": "New Vehicles",
    "usedvehicles": "Used Vehicles",
    "motorcycledealership": "Motorcycle Dealership",
    "new vehicles": "New Vehicles",
    "used vehicles": "Used Vehicles",
    "motorcycle dealership": "Motorcycle Dealership",
}


TEMPLATE_INDUSTRY_ALIASES = {
    "agriculture": "Agriculture",
    "automotive services": "Automotive Services",
    "body corporate": "Body Corporate",
    "call center": "Call Center",
    "car dealership": "Car Dealership",
    "construction": "Construction",
    "engineering & technical": "Engineering & Technical",
    "hospitality": "Hospitality",
    "logistics & transport": "Logistics & Transport",
    "management services": "Management Services",
    "manufacturing": "Manufacturing",
    "mining": "Mining",
    "npo education": "NPO Education",
    "private school": "Private School",
    "npo healthcare": "NPO Healthcare",
    "npo it": "NPO IT",
    "npo transport": "NPO Transport",
    "private healthcare": "Private Healthcare",
    "professional services": "Professional Services",
    "property management": "Property Management",
    "restaurant": "Restaurant",
    "retail & wholesale": "Retail & Wholesale",
    "security services": "Security Services",
    "transport": "Transport",
    "clubs & associations": "Clubs & Associations",
    "telecommunications": "Telecommunications",
    "general business": "General Business",
    "banking & financial services": "Banking & Financial Services",

    "it & technology": "Information Technology",
    "it and technology": "Information Technology",
    "information technology": "Information Technology",
}


PROJECT_MATERIAL_INDUSTRIES = {
    "agriculture",
    "automotive_services",
    "car_dealership",
    "construction",
    "engineering_technical",
    "manufacturing",
    "mining",
    "restaurant",
    "retail_wholesale",
    "transport",
    "logistics_transport",
    "telecommunications",
}


PROJECT_MATERIAL_SUB_INDUSTRIES = {
    "new_vehicles",
    "used_vehicles",
    "motorcycle_dealership",
    "repair_workshop",
    "vehicle_repairs",
    "panel_beating",
    "managed_it_services",  # optional if you track equipment/materials
    "networking_infrastructure",
    "freight_logistics",
    "courier_last_mile",
}


PROJECT_NON_MATERIAL_INDUSTRIES = {
    "professional_services",
    "banking_financial_services",
    "call_center",
    "management_services",
    "clubs_associations",
    "body_corporate",
    "private_school",
    "npo_education",
    "npo_healthcare",
    "private_healthcare",
    "npo_it",
    "general_business",
}


def slugify(value: Optional[str]) -> Optional[str]:
    if not value:
        return None

    value = unicodedata.normalize("NFKD", value)
    value = value.encode("ascii", "ignore").decode("ascii")
    value = value.strip().lower()
    value = value.replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", "_", value)
    value = re.sub(r"_+", "_", value).strip("_")

    return value or None


def normalize_industry_pair(
    industry: Optional[str],
    sub_industry: Optional[str],
) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    ind = (industry or "").strip()
    sub = (sub_industry or "").strip()

    ind_norm = None
    sub_norm = None

    if ind:
        k = ind.lower()
        ind_norm = TEMPLATE_INDUSTRY_ALIASES.get(
            k,
            INDUSTRY_ALIASES.get(k, ind),
        )

    if sub:
        sk = sub.lower().replace(" ", "")
        sub_norm = SUB_INDUSTRY_ALIASES.get(sub.lower(), sub)
        sub_norm = SUB_INDUSTRY_ALIASES.get(sk, sub_norm)

    ind_slug = slugify(ind_norm) if ind_norm else None
    sub_slug = slugify(sub_norm) if sub_norm else None

    return ind_norm, sub_norm, ind_slug, sub_slug


def project_uses_material_costing(
    industry: Optional[str],
    sub_industry: Optional[str] = None,
) -> bool:
    _, _, ind_slug, sub_slug = normalize_industry_pair(industry, sub_industry)

    if sub_slug in PROJECT_MATERIAL_SUB_INDUSTRIES:
        return True

    if ind_slug in PROJECT_MATERIAL_INDUSTRIES:
        return True

    if ind_slug in PROJECT_NON_MATERIAL_INDUSTRIES:
        return False

    return False


def project_uses_boq_budgeting(
    industry: Optional[str],
    sub_industry: Optional[str] = None,
) -> bool:
    _, _, ind_slug, sub_slug = normalize_industry_pair(industry, sub_industry)

    if ind_slug in {
        "construction",
        "engineering_technical",
        "manufacturing",
        "mining",
        "agriculture",
        "telecommunications",
    }:
        return True

    if sub_slug in {
        "networking_infrastructure",
        "repair_workshop",
        "vehicle_repairs",
        "panel_beating",
    }:
        return True

    return False


def project_uses_engagement_style(
    industry: Optional[str],
    sub_industry: Optional[str] = None,
) -> bool:
    _, _, ind_slug, sub_slug = normalize_industry_pair(industry, sub_industry)

    return ind_slug in {
        "professional_services",
        "banking_financial_services",
        "management_services",
        "call_center",
        "npo_education",
        "npo_healthcare",
        "private_healthcare",
        "private_school",
        "npo_it",
    }


def project_work_unit_label(
    industry: Optional[str],
    sub_industry: Optional[str] = None,
) -> str:
    _, _, ind_slug, sub_slug = normalize_industry_pair(industry, sub_industry)

    if ind_slug == "professional_services":
        return "Engagement"

    if ind_slug in {"construction", "engineering_technical"}:
        return "Project"

    if ind_slug == "automotive_services":
        return "Job Card / Work Order"

    if ind_slug == "information_technology" or ind_slug == "npo_it":
        return "Project / Ticket / Engagement"

    if ind_slug in {"npo_healthcare", "private_healthcare", "npo_education"}:
        return "Programme / Case"

    if sub_slug in {"repair_workshop", "vehicle_repairs", "panel_beating"}:
        return "Job Card / Work Order"

    return "Project / Job"