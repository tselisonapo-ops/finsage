from __future__ import annotations
from flask import current_app
from datetime import date
import time
from typing import Optional
from BackEnd.Services.db_service import db_service
from BackEnd.Services.industry_profiles import get_industry_profile
from BackEnd.Services.coa_service import (
    get_industry_template,
    canonical_subindustry_key,
    TEMPLATE_INDUSTRY_ALIASES,
)
from BackEnd.Services.validation import validate_company_payload, get_currency_for_country
from BackEnd.Services.utils.industry_utils import normalize_industry_pair, slugify, TEMPLATE_INDUSTRY_ALIASES
from BackEnd.Services.coa_seed_service import seed_company_coa_once


def format_address(addr: dict | None) -> str | None:
    """
    Convert structured address object into a clean multi-line string.
    Expected keys: line1, line2, locality, city, region, postalCode, country
    """
    if not isinstance(addr, dict):
        return None

    def clean(x):
        if x is None:
            return None
        s = str(x).strip()
        return s if s else None

    parts = [
        clean(addr.get("line1")),
        clean(addr.get("line2")),
        clean(addr.get("locality")),
        clean(addr.get("city")),
        clean(addr.get("region")),
        clean(addr.get("postalCode")),
        clean(addr.get("country")),
    ]
    parts = [p for p in parts if p]
    return "\n".join(parts) if parts else None

def create_company_record_from_payload(
    *,
    data: dict,
    owner_user_id: int,
    make_primary_membership: bool = True,
    membership_kind: Optional[str] = None,
) -> dict:
    country        = (data.get("country") or "").upper()
    company_reg_no = data.get("companyRegNo")
    tin            = data.get("tin")
    vat            = data.get("vat")
    company_email  = data.get("companyEmail")

    ok, errors = validate_company_payload({
        "country": country,
        "companyRegNo": company_reg_no,
        "tin": tin,
        "vat": vat,
        "companyEmail": company_email,
    })
    if not ok:
        raise ValueError({"errors": errors})

    industry = None
    sub_industry = None
    industry_slug = None
    sub_industry_slug = None

    industry_raw = (data.get("industry") or "").strip()
    if not industry_raw:
        raise ValueError("Industry is required.")

    sub_industry_raw = (data.get("subIndustry") or "").strip() or None

    rows_ind = get_industry_template(industry_raw)
    if not rows_ind:
        raise ValueError(f"Industry '{industry_raw}' not recognized. Please choose a valid industry.")

    if sub_industry_raw:
        rows_sub = get_industry_template(industry_raw, sub_industry_raw)
        if not rows_sub:
            raise ValueError(
                f"Sub-industry '{sub_industry_raw}' is not valid for industry '{industry_raw}'."
            )

    industry, sub_industry, industry_slug, sub_industry_slug = normalize_industry_pair(
        industry_raw, sub_industry_raw
    )

    ind_template = TEMPLATE_INDUSTRY_ALIASES.get(
        (industry or "").strip().lower(),
        (industry or "").strip()
    )
    sub_key = canonical_subindustry_key(ind_template, sub_industry)
    if sub_key:
        sub_industry = sub_key
        sub_industry_slug = slugify(sub_industry)

    currency       = data.get("currency") or get_currency_for_country(country) or "USD"
    fin_year_start = data.get("finYearStart", "01/01")
    company_reg    = data.get("companyRegDate")

    if company_reg:
        try:
            date.fromisoformat(company_reg)
        except ValueError:
            raise ValueError("Invalid 'companyRegDate'. Expected YYYY-MM-DD.")

    reg_obj = data.get("registeredAddress")
    post_obj = data.get("postalAddress")
    postal_same = bool(data.get("postalSameAsReg") or False)

    if postal_same and isinstance(reg_obj, dict) and not isinstance(post_obj, dict):
        post_obj = reg_obj

    physical_address = format_address(reg_obj) if isinstance(reg_obj, dict) else None
    postal_address   = format_address(post_obj) if isinstance(post_obj, dict) else None

    place_id = None
    lat = None
    lng = None
    if isinstance(reg_obj, dict):
        place_id = reg_obj.get("placeId") or None
        lat = reg_obj.get("lat")
        lng = reg_obj.get("lng")

    company_phone = data.get("company_phone") or data.get("companyPhone") or data.get("phone") or None
    logo_url      = data.get("logo_url") or data.get("logoUrl") or None

    profile = get_industry_profile(industry, sub_industry)
    inventory_mode = (data.get("inventory_mode") or profile.get("default_inventory_mode") or "none")
    inventory_valuation = (data.get("inventory_valuation") or profile.get("default_valuation"))

    company_name = (data.get("name") or data.get("companyName") or "").strip() or "Company"

    entity_kind = (data.get("entity_kind") or "company").strip().lower()
    if entity_kind not in {"company", "branch_entity"}:
        entity_kind = "company"

    created_via = (data.get("created_via") or "").strip().lower() or None
    source_customer_company_id = data.get("source_customer_company_id")
    provisioning_context = (data.get("provisioning_context") or "").strip() or None

    company_id = db_service.insert_company(
        name=company_name,
        client_code=data.get("clientCode") or f"C{int(time.time())}",
        industry=industry,
        sub_industry=sub_industry,
        currency=currency,
        fin_year_start=fin_year_start,
        company_reg_date=company_reg,
        country=country,
        company_reg_no=company_reg_no,
        tin=tin,
        vat=vat,
        company_email=company_email,
        owner_user_id=owner_user_id,
        inventory_mode=inventory_mode,
        inventory_valuation=inventory_valuation,
        physical_address=physical_address,
        postal_address=postal_address,
        company_phone=company_phone,
        logo_url=logo_url,
        registered_address_json=reg_obj if isinstance(reg_obj, dict) else None,
        postal_address_json=post_obj if isinstance(post_obj, dict) else None,
        address_place_id=place_id,
        address_lat=str(lat) if lat is not None else None,
        address_lng=str(lng) if lng is not None else None,
        entity_kind=entity_kind,
        make_primary_membership=make_primary_membership,
        membership_kind=membership_kind,
        created_via=created_via,
        source_customer_company_id=source_customer_company_id,
        provisioning_context=provisioning_context,
    )

    try:
        db_service.execute_sql(
            """
            UPDATE public.companies
            SET industry_slug = %s,
                sub_industry_slug = %s
            WHERE id = %s
            """,
            (industry_slug, sub_industry_slug, company_id),
        )
    except Exception as e:
        current_app.logger.warning(
            "Industry slug update failed for company %s: %s",
            company_id,
            e,
        )

    try:
        seed_company_coa_once(
            db_service,
            company_id=company_id,
            industry=industry_slug,
            sub_industry=sub_industry_slug,
            source="pool",
        )
    except Exception:
        current_app.logger.exception("COA seed failed (non-fatal)")

    try:
        db_service.upsert_company_branding(company_id, {
            "logo_url": logo_url,
            "contact_phone": company_phone,
            "contact_email": company_email,
            "address": physical_address or postal_address,
            "vat_no": vat,
        })
    except Exception as e:
        current_app.logger.warning(f"Branding upsert failed for company {company_id}: {e}")

    return {
        "company_id": company_id,
        "industry": industry,
        "sub_industry": sub_industry,
        "industry_slug": industry_slug,
        "sub_industry_slug": sub_industry_slug,
        "currency": currency,
        "fin_year_start": fin_year_start,
        "company_reg_date": company_reg,
        "country": country,
        "companyRegNo": company_reg_no,
        "tin": tin,
        "vat": vat,
        "companyEmail": company_email,
        "physical_address": physical_address,
        "postal_address": postal_address,
        "registered_address_json": reg_obj if isinstance(reg_obj, dict) else None,
        "postal_address_json": post_obj if isinstance(post_obj, dict) else None,
        "address_place_id": place_id,
        "address_lat": str(lat) if lat is not None else None,
        "address_lng": str(lng) if lng is not None else None,
        "company_phone": company_phone,
        "logo_url": logo_url,
        "inventory_mode": inventory_mode,
        "inventory_valuation": inventory_valuation,
        "entity_kind": entity_kind,
        "name": company_name,
        "created_via": created_via,
        "source_customer_company_id": source_customer_company_id,
        "provisioning_context": provisioning_context,
    }
