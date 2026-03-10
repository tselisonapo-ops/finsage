from typing import Any, Dict, Tuple

from BackEnd.Services.validation import (
    validate_email,
    validate_tin,
    validate_vat,
    TIN_REGEX,
    VAT_REGEX,
)

def validate_customer_payload(payload: Dict[str, Any]) -> Tuple[bool, Dict[str, str]]:
    errors: Dict[str, str] = {}
    country = (payload.get("country") or "").upper().strip()

    email = payload.get("email")
    if email and not validate_email(email):
        errors["email"] = "Invalid email address."

    tax_no = payload.get("tax_number")
    if country in TIN_REGEX and tax_no:
        if not validate_tin(country, tax_no):
            errors["tax_number"] = f"Invalid income tax number format for {country}."

    vat_no = payload.get("vat_number")
    if country in VAT_REGEX and vat_no:
        if not validate_vat(country, vat_no):
            errors["vat_number"] = f"Invalid VAT number format for {country}."

    return (len(errors) == 0), errors
