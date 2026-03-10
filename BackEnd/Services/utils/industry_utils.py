
import unicodedata, re
from typing import Tuple, Optional

INDUSTRY_ALIASES = {
    # IT
    "information technology": "IT & Technology",
    "it & technology": "IT & Technology",
    "it and technology": "IT & Technology",
    "it": "IT & Technology",
    "technology": "IT & Technology",

    # Logistics / Transport (private)
    "logistics & transport": "Logistics & Transport",
    "logistics and transport": "Logistics & Transport",
    "logistics": "Logistics & Transport",

    # Transport (if user types transport, keep it as Transport)
    "transport": "Transport",

    # NPO variants (keep distinct)
    "npo transport": "NPO Transport",

    # Clubs
    "clubs & associations": "Clubs & Associations",
    "clubs and associations": "Clubs & Associations",
    "club": "Clubs & Associations",
    "association": "Clubs & Associations",
}


SUB_INDUSTRY_ALIASES = {
    # collapse no-space variants to spaced canonical
    "manageditservices": "Managed IT Services",
    "softwaredevelopment": "Software Development",
    "networkinginfrastructure": "Networking & Infrastructure",

    # normalize slash spacing
    "courier / last mile": "Courier/Last Mile",
    "freight / logistics": "Freight/Logistics",

    # ✅ Car Dealership common variants
    "newvehicles": "New Vehicles",
    "usedvehicles": "Used Vehicles",
    "motorcycledealership": "Motorcycle Dealership",
    "new vehicles": "New Vehicles",
    "used vehicles": "Used Vehicles",
    "motorcycle dealership": "Motorcycle Dealership",
}

def slugify(value: Optional[str]) -> Optional[str]:
    """
    Convert display names to canonical slugs used by coa_pool scoping.

    Example:
        "Information Technology" -> "information_technology"
        "Software Development"  -> "software_development"
    """
    if not value:
        return None
    value = unicodedata.normalize("NFKD", value)
    value = value.encode("ascii", "ignore").decode("ascii")  # strip accents
    value = value.strip().lower()
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
        # 1) normalize UI -> pool/template industry
        ind_norm = TEMPLATE_INDUSTRY_ALIASES.get(k, INDUSTRY_ALIASES.get(k, ind))

    if sub:
        sk = sub.lower().replace(" ", "")
        # 2) normalize subindustry variants
        sub_norm = SUB_INDUSTRY_ALIASES.get(sub.lower(), sub)
        sub_norm = SUB_INDUSTRY_ALIASES.get(sk, sub_norm)

    ind_slug = slugify(ind_norm) if ind_norm else None
    sub_slug = slugify(sub_norm) if sub_norm else None

    return ind_norm, sub_norm, ind_slug, sub_slug

# UI/display industry -> template industry key
TEMPLATE_INDUSTRY_ALIASES = {
    # -------------------------
    # Exact matches (UI == template)
    # -------------------------
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

    # -------------------------
    # Mismatches (UI != template)
    # -------------------------
    # UI shows: "IT & Technology"
    # Templates are keyed as: "Information Technology"
    "it & technology": "Information Technology",
    "it and technology": "Information Technology",
    "information technology": "Information Technology",
}
