# backEnd/Services/validation.py
import re
from typing import Optional, Dict, Tuple, Any

# -----------------------------
# Email (lightweight, practical)
# -----------------------------
EMAIL_REGEX = r"^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,24}$"
def validate_email(email: Optional[str]) -> bool:
    if not email:
        return False
    return re.fullmatch(EMAIL_REGEX, email.strip(), flags=re.IGNORECASE) is not None


# ==========================================
# Company registration numbers (by country)
# NOTE: These are practical simplifications.
# ==========================================
REGNO_REGEX: Dict[str, str] = {
    # Southern Africa
    "ZA": r"^\d{4}/\d{6}/(07|08)$",        # South Africa: 2014/123456/07 or /08
    "LS": r"^A\d{4}/\d{5,6}$",             # Lesotho (your rule): A1234/12345 or /123456
    "BW": r"^\d{2,6}/\d{2,6}$",            # Botswana (very simplified CIPA)
    "NA": r"^\d{2,6}/\d{2,6}$",            # Namibia (simplified)
    "ZW": r"^\d{2,6}/\d{2,6}$",            # Zimbabwe (simplified)

    # UK / Europe
    "GB": r"^(?:\d{8}|[A-Z]{2}\d{6})$",    # UK Companies House: 8 digits OR 2 letters + 6 digits
    "IE": r"^\d{6,7}[A-Z]?$",              # Ireland CRO (rough)
    "DE": r"^HR[BAG]\s?\d{1,6}$",          # Germany Handelsregister (very rough: HRB/AG/HRA + digits)
    "FR": r"^\d{9}$",                      # France SIREN: 9 digits
    "ES": r"^[A-Z]\d{7}[A-Z0-9]$",         # Spain CIF (simplified)
    "IT": r"^\d{11}$",                     # Italy REA/Codice Fiscale for company no. (approx)
    "NL": r"^\d{8}$",                      # Netherlands KvK (8 digits)
    "BE": r"^\d{10}$",                     # Belgium BCE/KBO: 10 digits
    "PT": r"^\d{9}$",                      # Portugal NIPC (9 digits)
    "PL": r"^\d{10}$",                     # Poland KRS/NIP overlap; here 10 digits

    # Americas
    # US has no national "company reg no" format (varies by state) — skip strict check.
    # Use EIN as TIN and keep regno optional/relaxed if you want:
    "US": r"^[A-Z0-9\-]{5,20}$",           # relaxed placeholder
    "CA": r"^\d{9}$",                      # Canada (use BN 9 digits as “reg no” proxy, practical)
    "MX": r"^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$", # Mexico RFC (companies 3 letters; used as reg id in practice)

    # Oceania
    "AU": r"^(?:\d{9}|\d{11})$",           # Australia: ACN (9) or ABN (11)
    "NZ": r"^\d{13}$",                     # New Zealand NZBN: 13 digits

    # Asia
    "IN": r"^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$",  # India CIN (21 chars)
    "SG": r"^\d{4,10}[A-Z]?$",                         # Singapore UEN simplified
    "HK": r"^\d{7,8}$",                                # Hong Kong CR No. (simplified)
    "AE": r"^\d{4,8}$",                                # UAE (emirate-dependent; relaxed digits)
    "SA": r"^\d{10}$",                                 # Saudi (Commercial reg simplified)

    # East Africa (rough/relaxed)
    "KE": r"^[A-Z0-9/\-]{7,20}$",
    "TZ": r"^[A-Z0-9/\-]{7,20}$",
    "UG": r"^[A-Z0-9/\-]{7,20}$",
}

def validate_regno(country_code: str, regno: Optional[str]) -> bool:
    pattern = REGNO_REGEX.get(country_code.upper())
    return bool(pattern and regno and re.fullmatch(pattern, regno.strip(), flags=re.IGNORECASE))


# ==========================================
# TIN / Tax reference numbers (by country)
# ==========================================
TIN_REGEX: Dict[str, str] = {
    "ZA": r"^\d{10}$",                     # South Africa income tax ref
    "US": r"^\d{2}-\d{7}$",                # US EIN
    "GB": r"^\d{10}$",                     # UK UTR (10 digits)
    "IE": r"^\d{7}[A-ZA-Z]{1,2}$",         # Ireland TIN-ish (simplified)
    "DE": r"^\d{9}$",                      # Germany Steuernummer (simplified)
    "FR": r"^\d{11}$",                     # France SIRET part (rough proxy)
    "IT": r"^\d{11}$",                     # Italy Partita IVA format length (proxy for TIN)
    "ES": r"^[A-Z]\d{7}[A-Z0-9]$",         # Spain CIF (also used in tax contexts)
    "NL": r"^[A-Z0-9]{10,12}$",            # NL (very simplified)
    "BE": r"^\d{11}$",                     # Belgium (simplified)
    "PT": r"^\d{9}$",                      # Portugal NIF
    "PL": r"^\d{10}$",                     # Poland NIP
    "RO": r"^\d{2,10}$",                   # Romania CUI (2–10 digits)
    "SE": r"^\d{10,12}$",                  # Sweden (simplified)
    "DK": r"^\d{8}$",                      # Denmark (CVR length)
    "FI": r"^\d{8}$",                      # Finland (Y-tunnus numeric part)
    "NO": r"^\d{9}$",                      # Norway org no. (also used for tax)
    "CH": r"^\d{9}$",                      # Switzerland (CHE digits; simplified)
    "CA": r"^\d{9}$",                      # Canada BN 9
    "MX": r"^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$", # Mexico RFC
    "AU": r"^\d{8,9}$",                    # Australia TFN 8–9 digits
    "NZ": r"^\d{8,9}$",                    # NZ IRD 8–9 digits
    "IN": r"^[A-Z]{5}\d{4}[A-Z]$",         # India PAN (AAAAA9999A)
    "SG": r"^[A-Z0-9]{8,10}$",             # Singapore (simplified)
    "HK": r"^\d{8}$",                      # Hong Kong BR number (simplified)
    "AE": r"^\d{9,15}$",                   # UAE TRN (9+ digits; simplified)
    "SA": r"^\d{10,15}$",                  # Saudi (simplified)
    "LS": r"^\d{6,12}$",                   # Lesotho (relaxed)
    "KE": r"^[A-Z]\d{9}[A-Z]$",            # Kenya KRA PIN format (e.g., A123456789B)
}

def validate_tin(country_code: str, tin: Optional[str]) -> bool:
    pattern = TIN_REGEX.get(country_code.upper())
    return bool(pattern and tin and re.fullmatch(pattern, tin.strip(), flags=re.IGNORECASE))


# ==========================================
# VAT / GST numbers (by country)
# ==========================================
VAT_REGEX: Dict[str, str] = {
    # South Africa VAT: 10 digits
    "ZA": r"^\d{10}$",

    # UK VAT (post-Brexit still GB…); 9 digits or 12 (branch)
    "GB": r"^GB?\d{9}(\d{3})?$",

    # Core EU (very common ones)
    "DE": r"^DE\d{9}$",
    "FR": r"^FR[A-HJ-NP-Z0-9]{2}\d{9}$",
    "IT": r"^IT\d{11}$",
    "ES": r"^ES[A-Z0-9]\d{7}[A-Z0-9]$",
    "NL": r"^NL\d{9}B\d{2}$",
    "BE": r"^BE0?\d{9}$",            # sometimes written with leading 0
    "PT": r"^PT\d{9}$",
    "PL": r"^PL\d{10}$",
    "RO": r"^RO\d{2,10}$",
    "SE": r"^SE\d{12}$",
    "DK": r"^DK\d{8}$",
    "FI": r"^FI\d{8}$",
    "NO": r"^NO\d{9}MVA$",          # Norway MVA suffix
    "IE": r"^IE\d[A-Z0-9]\d{5}[A-Z]{1,2}$",  # many variants; simplified

    # Switzerland
    "CH": r"^CHE\d{9}(TVA|MWST|IVA)$",

    # Middle East
    "AE": r"^\d{15}$",               # UAE TRN is 15 digits
    "SA": r"^\d{15}$",               # KSA VAT often 15 digits

    # Africa (relaxed if no strict public spec handy)
    "LS": r"^[A-Z0-9\-]{6,15}$",
    "KE": r"^P\d{9}[A-Z]$",          # Often KRA PIN used as VAT id (P#########A) — may vary

    # Americas & Oceania (GST/VAT proxies)
    "CA": r"^\d{9}RT\d{4}$",         # Canada GST/HST: 9 digits + RT + 4 digits
    "AU": r"^\d{11}$",               # Australia GST uses ABN (11 digits)
    "NZ": r"^\d{9}$",                # NZ GST 9 digits
    "MX": r"^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$",  # Mexico RFC used for VAT as well
    "US": r"^[A-Z0-9\-]{5,20}$",     # US no federal VAT; relax if you still collect state IDs
}

def validate_vat(country_code: str, vat: Optional[str]) -> bool:
    pattern = VAT_REGEX.get(country_code.upper())
    return bool(pattern and vat and re.fullmatch(pattern, vat.strip(), flags=re.IGNORECASE))


# ==========================================
# Country → Currency (ISO 4217) quick map
# ==========================================
COUNTRY_CURRENCY: Dict[str, str] = {
    "ZA": "ZAR", "LS": "LSL", "BW": "BWP", "NA": "NAD", "ZW": "ZWL",
    "GB": "GBP", "IE": "EUR", "DE": "EUR", "FR": "EUR", "ES": "EUR",
    "IT": "EUR", "NL": "EUR", "BE": "EUR", "PT": "EUR", "PL": "PLN",
    "RO": "RON", "SE": "SEK", "DK": "DKK", "FI": "EUR", "NO": "NOK",
    "CH": "CHF",
    "US": "USD", "CA": "CAD", "MX": "MXN",
    "AU": "AUD", "NZ": "NZD",
    "IN": "INR", "SG": "SGD", "HK": "HKD", "AE": "AED", "SA": "SAR",
    "KE": "KES", "TZ": "TZS", "UG": "UGX",
}

def get_currency_for_country(country_code: str) -> Optional[str]:
    return COUNTRY_CURRENCY.get(country_code.upper())


# ==========================================
# One-shot payload validator (server-side)
# ==========================================
def validate_company_payload(payload: Dict[str, Any]) -> Tuple[bool, Dict[str, str]]:
    """
    Expecting JSON like:
    {
      "country": "ZA",
      "companyRegNo": "...",
      "tin": "...",
      "vat": "...",
      "companyEmail": "accounts@acme.com"
    }
    Returns (ok, errors) — errors is {field: message}
    """
    errors: Dict[str, str] = {}
    country = (payload.get("country") or "").upper().strip()

    # Email
    email = payload.get("companyEmail")
    if email and not validate_email(email):
        errors["companyEmail"] = "Invalid company email address."

    # Reg no
    regno = payload.get("companyRegNo")
    if country in REGNO_REGEX:
        if not regno or not validate_regno(country, regno):
            errors["companyRegNo"] = f"Invalid company registration format for {country}."
    else:
        # if you want to *require* a format for ALL countries, keep an error here,
        # otherwise allow unknown countries to pass:
        # errors["companyRegNo"] = f"No known reg no format for {country}."
        pass

    # TIN
    tin = payload.get("tin")
    if country in TIN_REGEX and tin:
        if not validate_tin(country, tin):
            errors["tin"] = f"Invalid TIN format for {country}."

    # VAT
    vat = payload.get("vat")
    if country in VAT_REGEX and vat:
        if not validate_vat(country, vat):
            errors["vat"] = f"Invalid VAT/GST format for {country}."

    return (len(errors) == 0), errors


# ==========================================
# Convenience exports (for front-end selects)
# ==========================================
def list_supported_regno_countries() -> Dict[str, str]:
    """Return {country_code: regex} for reg number."""
    return dict(REGNO_REGEX)

def list_supported_tin_countries() -> Dict[str, str]:
    return dict(TIN_REGEX)

def list_supported_vat_countries() -> Dict[str, str]:
    return dict(VAT_REGEX)

def list_country_currency() -> Dict[str, str]:
    return dict(COUNTRY_CURRENCY)
