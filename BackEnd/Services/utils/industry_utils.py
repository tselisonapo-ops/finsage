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
    "professional association": "Clubs & Associations",

    "design creative services": "Design & Creative Services",
    "design & creative services": "Design & Creative Services",
    "design and creative services": "Design & Creative Services",
    "creative services": "Design & Creative Services",
    "design services": "Design & Creative Services",
    "creative studio": "Design & Creative Services",
    "interior design": "Design & Creative Services",

    "personal care beauty services": "Personal Care & Beauty Services",
    "personal care & beauty services": "Personal Care & Beauty Services",
    "personal care and beauty services": "Personal Care & Beauty Services",
    "beauty services": "Personal Care & Beauty Services",
    "salon": "Personal Care & Beauty Services",
    "barber": "Personal Care & Beauty Services",

    "health fitness": "Health & Fitness",
    "health & fitness": "Health & Fitness",
    "health and fitness": "Health & Fitness",
    "fitness": "Health & Fitness",
    "gym": "Health & Fitness",

    "education training": "Education & Training",
    "education & training": "Education & Training",
    "education and training": "Education & Training",
    "training": "Education & Training",

    "cleaning services": "Cleaning Services",
    "cleaning": "Cleaning Services",

    "agriculture": "Agriculture",
    "agricultural": "Agriculture",
    "agricultural services": "Agriculture",
    "farming": "Agriculture",
    "farm": "Agriculture",
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
    
    "sportsclub": "Sports Club",
    "sports club": "Sports Club",
    "socialclub": "Social Club",
    "social club": "Social Club",
    "professionalassociation": "Professional Association",
    "professional association": "Professional Association",

    "partsandspares": "Parts & Spares",
    "parts spares": "Parts & Spares",
    "parts & spares": "Parts & Spares",
    "parts_spares": "Parts & Spares",
    "spares": "Parts & Spares",
    "automotive spares": "Parts & Spares",

    "interiordesign": "Interior Design",
    "interior design": "Interior Design",
    "interior_design": "Interior Design",

    "architecture": "Architecture",
    "architectural services": "Architecture",

    # Crop farming
    "cropfarming": "Crop Farming",
    "crop farming": "Crop Farming",
    "crop_farming": "Crop Farming",
    "crop production": "Crop Farming",
    "field crops": "Crop Farming",
    "grain farming": "Crop Farming",

    # Livestock farming
    "livestockfarming": "Livestock Farming",
    "livestock farming": "Livestock Farming",
    "livestock_farming": "Livestock Farming",
    "livestock": "Livestock Farming",
    "cattle farming": "Livestock Farming",
    "sheep farming": "Livestock Farming",
    "goat farming": "Livestock Farming",
    "pig farming": "Livestock Farming",

    # Mixed farming
    "mixedfarming": "Mixed Farming",
    "mixed farming": "Mixed Farming",
    "mixed_farming": "Mixed Farming",
    "crop and livestock": "Mixed Farming",
    "crop livestock farming": "Mixed Farming",

    # Dairy
    "dairyfarming": "Dairy Farming",
    "dairy farming": "Dairy Farming",
    "dairy_farming": "Dairy Farming",
    "dairy": "Dairy Farming",
    "milk production": "Dairy Farming",

    # Poultry
    "poultryfarming": "Poultry Farming",
    "poultry farming": "Poultry Farming",
    "poultry_farming": "Poultry Farming",
    "poultry": "Poultry Farming",
    "broiler farming": "Poultry Farming",
    "egg production": "Poultry Farming",

    # Horticulture
    "horticulture": "Horticulture",
    "horticultural farming": "Horticulture",
    "vegetable farming": "Horticulture",
    "flower farming": "Horticulture",
    "nursery": "Horticulture",
    "greenhouse farming": "Horticulture",

    # Fruit
    "fruitfarming": "Fruit Farming",
    "fruit farming": "Fruit Farming",
    "fruit_farming": "Fruit Farming",
    "orchard farming": "Fruit Farming",
    "orchards": "Fruit Farming",
    "vineyard": "Fruit Farming",
    "viticulture": "Fruit Farming",

    # Forestry
    "forestryplantations": "Forestry & Plantations",
    "forestry & plantations": "Forestry & Plantations",
    "forestry and plantations": "Forestry & Plantations",
    "forestry_plantations": "Forestry & Plantations",
    "forestry": "Forestry & Plantations",
    "plantation": "Forestry & Plantations",
    "timber plantation": "Forestry & Plantations",

    # Aquaculture
    "aquaculture": "Aquaculture",
    "fish farming": "Aquaculture",
    "fishfarming": "Aquaculture",
    "fish_farming": "Aquaculture",

    # Beekeeping
    "beekeeping": "Beekeeping",
    "bee keeping": "Beekeeping",
    "bee_keeping": "Beekeeping",
    "apiculture": "Beekeeping",

    # Game and wildlife
    "gamewildlifefarming": "Game & Wildlife Farming",
    "game & wildlife farming": "Game & Wildlife Farming",
    "game and wildlife farming": "Game & Wildlife Farming",
    "game_wildlife_farming": "Game & Wildlife Farming",
    "game farming": "Game & Wildlife Farming",
    "wildlife farming": "Game & Wildlife Farming",

    # Agricultural support
    "agriculturalsupportservices": "Agricultural Support Services",
    "agricultural support services": "Agricultural Support Services",
    "agricultural_support_services": "Agricultural Support Services",
    "farm support services": "Agricultural Support Services",
    "contract farming": "Agricultural Support Services",

    "graphicdesign": "Graphic Design",
    "graphic design": "Graphic Design",
    "graphic_design": "Graphic Design",

    "advertisingagency": "Advertising Agency",
    "advertising agency": "Advertising Agency",
    "advertising_agency": "Advertising Agency",

    "creativestudio": "Creative Studio",
    "creative studio": "Creative Studio",
    "creative_studio": "Creative Studio",

    "landscapedesign": "Landscape Design",
    "landscape design": "Landscape Design",
    "landscape_design": "Landscape Design",

    "hairsalon": "Hair Salon",
    "hair salon": "Hair Salon",
    "hair_salon": "Hair Salon",
    "barbershop": "Barber Shop",
    "barber shop": "Barber Shop",
    "barber_shop": "Barber Shop",
    "nailsalon": "Nail Salon",
    "nail salon": "Nail Salon",
    "nail_salon": "Nail Salon",
    "beautyspa": "Beauty Spa",
    "beauty spa": "Beauty Spa",
    "beauty_spa": "Beauty Spa",
    "makeupartist": "Makeup Artist",
    "makeup artist": "Makeup Artist",
    "makeup_artist": "Makeup Artist",
    "wellnessmassage": "Wellness & Massage",
    "wellness massage": "Wellness & Massage",
    "wellness_massage": "Wellness & Massage",
    "massage": "Wellness & Massage",
    "tattoostudio": "Tattoo Studio",
    "tattoo studio": "Tattoo Studio",
    "tattoo_studio": "Tattoo Studio",

    "personaltrainer": "Personal Trainer",
    "personal trainer": "Personal Trainer",
    "personal_trainer": "Personal Trainer",
    "fitnessstudio": "Fitness Studio",
    "fitness studio": "Fitness Studio",
    "fitness_studio": "Fitness Studio",
    "crossfitbox": "CrossFit Box",
    "crossfit box": "CrossFit Box",
    "crossfit_box": "CrossFit Box",
    "sportsacademy": "Sports Academy",
    "sports academy": "Sports Academy",
    "sports_academy": "Sports Academy",

    "trainingprovider": "Training Provider",
    "training provider": "Training Provider",
    "training_provider": "Training Provider",
    "skillsdevelopment": "Skills Development",
    "skills development": "Skills Development",
    "skills_development": "Skills Development",
    "drivingschool": "Driving School",
    "driving school": "Driving School",
    "driving_school": "Driving School",
    "tutoringservices": "Tutoring Services",
    "tutoring services": "Tutoring Services",
    "tutoring_services": "Tutoring Services",
    "corporatetraining": "Corporate Training",
    "corporate training": "Corporate Training",
    "corporate_training": "Corporate Training",

    "residentialcleaning": "Residential Cleaning",
    "residential cleaning": "Residential Cleaning",
    "residential_cleaning": "Residential Cleaning",
    "commercialcleaning": "Commercial Cleaning",
    "commercial cleaning": "Commercial Cleaning",
    "commercial_cleaning": "Commercial Cleaning",
    "industrialcleaning": "Industrial Cleaning",
    "industrial cleaning": "Industrial Cleaning",
    "industrial_cleaning": "Industrial Cleaning",
    "pestcontrol": "Pest Control",
    "pest control": "Pest Control",
    "pest_control": "Pest Control",
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

    "design creative services": "Design & Creative Services",
    "design & creative services": "Design & Creative Services",
    "design and creative services": "Design & Creative Services",
    "creative services": "Design & Creative Services",
    "design services": "Design & Creative Services",

    # TEMPLATE_INDUSTRY_ALIASES - add these
    "personal care beauty services": "Personal Care & Beauty Services",
    "personal care & beauty services": "Personal Care & Beauty Services",
    "personal care and beauty services": "Personal Care & Beauty Services",
    "beauty services": "Personal Care & Beauty Services",

    "health fitness": "Health & Fitness",
    "health & fitness": "Health & Fitness",
    "health and fitness": "Health & Fitness",

    "education training": "Education & Training",
    "education & training": "Education & Training",
    "education and training": "Education & Training",

    "cleaning services": "Cleaning Services",
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
    "design_creative_services",
    "personal_care_beauty_services",
    "health_fitness",
    "education_training",
    "cleaning_services",
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
    "parts_spares",
    "interior_design",
    "architecture",
    "landscape_design",
    "advertising_agency",
    "creative_studio",
    "graphic_design",
    "hair_salon",
    "barber_shop",
    "nail_salon",
    "beauty_spa",
    "makeup_artist",
    "wellness_and_massage",
    "tattoo_studio",

    "gym",
    "fitness_studio",
    "crossfit_box",
    "sports_academy",

    "training_provider",
    "skills_development",
    "driving_school",
    "corporate_training",

    "residential_cleaning",
    "commercial_cleaning",
    "industrial_cleaning",
    "pest_control",

    "crop_farming",
    "livestock_farming",
    "mixed_farming",
    "dairy_farming",
    "poultry_farming",
    "horticulture",
    "fruit_farming",
    "forestry_and_plantations",
    "aquaculture",
    "beekeeping",
    "game_and_wildlife_farming",
    "agricultural_support_services",
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
        "design_creative_services",

    }:
        return True

    if sub_slug in {
        "networking_infrastructure",
        "repair_workshop",
        "vehicle_repairs",
        "panel_beating",
        "interior_design",
        "landscape_design",
        "architecture",
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
        "design_creative_services",
        "personal_care_beauty_services",
        "health_fitness",
        "education_training",
        "cleaning_services",
    }

def project_work_unit_label(
    industry: Optional[str],
    sub_industry: Optional[str] = None,
) -> str:
    _, _, ind_slug, sub_slug = normalize_industry_pair(industry, sub_industry)

    # Agriculture
    agriculture_labels = {
        "crop_farming": "Crop / Field / Season",
        "livestock_farming": "Herd / Flock / Batch",
        "mixed_farming": "Farm Activity / Batch",
        "dairy_farming": "Herd / Production Cycle",
        "poultry_farming": "Flock / Production Batch",
        "horticulture": "Crop Block / Growing Cycle",
        "fruit_farming": "Orchard / Block / Season",
        "forestry_and_plantations": "Plantation / Compartment",
        "aquaculture": "Pond / Tank / Stock Batch",
        "beekeeping": "Apiary / Colony",
        "game_and_wildlife_farming": "Herd / Camp / Population",
        "agricultural_support_services": "Farm Job / Contract",
    }

    if sub_slug in agriculture_labels:
        return agriculture_labels[sub_slug]

    if ind_slug == "agriculture":
        return "Farm Activity / Batch"
    
    # Sub-industry specific labels first
    if sub_slug in {"repair_workshop", "vehicle_repairs", "panel_beating"}:
        return "Job Card / Work Order"

    if sub_slug == "parts_spares":
        return "Parts Order / Sale"

    if sub_slug == "interior_design":
        return "Design Project"

    if sub_slug == "architecture":
        return "Design Engagement / Project"

    if sub_slug == "graphic_design":
        return "Creative Brief"

    if sub_slug == "advertising_agency":
        return "Campaign"

    if sub_slug == "creative_studio":
        return "Creative Project"

    if sub_slug == "landscape_design":
        return "Landscape Project"

    # Industry-level labels
    if ind_slug == "professional_services":
        return "Engagement"

    if ind_slug in {"construction", "engineering_technical", "design_creative_services"}:
        return "Project"

    if ind_slug == "automotive_services":
        return "Job Card / Work Order"

    if ind_slug in {"information_technology", "npo_it"}:
        return "Project / Ticket / Engagement"

    if ind_slug in {"npo_healthcare", "private_healthcare", "npo_education"}:
        return "Programme / Case"

    if ind_slug == "personal_care_beauty_services":
        return "Booking / Service"

    if ind_slug == "health_fitness":
        return "Membership / Session"

    if ind_slug == "education_training":
        return "Course / Learner"

    if ind_slug == "cleaning_services":
        return "Cleaning Job / Contract"

    return "Project / Job"