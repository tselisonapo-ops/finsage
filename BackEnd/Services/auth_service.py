# backEnd/Services/auth_service.py
import os, uuid, hashlib, jwt
from typing import Optional, Tuple, Dict, Any
from datetime import datetime, timedelta, timezone
from werkzeug.security import check_password_hash, generate_password_hash

from .db_service import db_service
from typing import Any, Dict, Optional
from datetime import datetime, timedelta, timezone

from BackEnd.Services.industry_profiles import normalize_industry_pair
from BackEnd.Services.coa_service import initialize_coa  # ✅ now exists in coa_service.py


# JWT config
JWT_SECRET = os.getenv("JWT_SECRET_KEY", "fallback-secret-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXP_DAYS = 7

BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:5500/dashboard.html")
TRIAL_DAYS = 30

# -----------------------------
# Password helpers
# -----------------------------
def hash_password(password: str) -> str:
    return generate_password_hash(password)

def verify_password(password: str, hashed: str) -> bool:
    return check_password_hash(hashed, password)

# -----------------------------
# JWT helpers
# -----------------------------
from datetime import datetime, timezone, timedelta
import jwt

def make_jwt(
    user_id: int,
    email: str,
    role: str,
    user_type: str,
    company_id: int | None = None,
    access_scope: str = "core",
    allowed_company_ids: list[int] | None = None,
) -> str:
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user_id),
        "user_id": int(user_id),
        "email": email,
        "role": (role or "viewer").strip().lower(),
        "user_type": (user_type or "Enterprise").strip(),
        "company_id": int(company_id) if company_id is not None else None,
        "access_scope": (access_scope or "core").strip().lower(),
        "allowed_company_ids": [int(x) for x in (allowed_company_ids or [])],
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=JWT_EXP_DAYS)).timestamp()),
    }

    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt(token: str) -> Dict[str, Any]:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

def actor_from_payload(payload):
    return int(payload.get("user_id") or payload.get("sub") or 0)

# -----------------------------
# Confirmation helpers
# -----------------------------
def generate_confirmation_token(email: str) -> str:
    salt = uuid.uuid4().hex
    token_string = f"{email}{salt}{datetime.now().isoformat()}"
    return hashlib.sha256(token_string.encode()).hexdigest()

def create_confirmation_link(token: str) -> str:
    return f"{BASE_URL}?action=confirm&token={token}"

def send_confirmation_email(email: str, link: str):
    print(f"📧 Confirmation email to {email}: {link}")
    return True

# -----------------------------
# Registration
# -----------------------------

def register_user(
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    user_role: str,
    user_type: str,
    company_data: Optional[Dict[str, Any]] = None,
) -> Optional[int]:

    if db_service.check_user_exists(email):
        print("Error: Email already registered.")
        return None

    hashed_password = hash_password(password)
    confirmation_token = generate_confirmation_token(email)
    trial_start_date = datetime.now(timezone.utc).date()
    trial_end_date = (datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)).date()

    company_id: Optional[int] = None
    user_id: Optional[int] = None

    try:
        if user_type == "Enterprise":
            company_data = company_data or {}

            company_name = (company_data.get("companyName") or "").strip()
            client_code  = (company_data.get("clientCode") or "").strip()

            industry_raw = (company_data.get("industry") or "").strip()
            sub_raw      = company_data.get("subIndustry") or None
            industry, sub_industry = normalize_industry_pair(industry_raw, sub_raw)

            if not company_name or not client_code or not industry:
                print("Error: Enterprise registration requires Company Name, Client Code, and Industry.")
                return None

            # ✅ ATOMIC: company + user + schema + COA + owner all-or-nothing
            with db_service.transaction():
                # 1) Create company first (owner will be set after user exists)
                company_id = db_service.insert_company(
                    name=company_name,
                    client_code=client_code,
                    industry=industry,
                    sub_industry=sub_industry,
                    currency=company_data.get("currency"),
                    fin_year_start=company_data.get("finYearStart"),
                    company_reg_date=company_data.get("companyRegDate"),
                    country=company_data.get("country"),
                    company_reg_no=company_data.get("companyRegNo"),
                    tin=company_data.get("tin"),
                    vat=company_data.get("vat"),
                    company_email=company_data.get("companyEmail"),
                    owner_user_id=None,  # ✅ set below
                )
                if not company_id:
                    raise RuntimeError("Failed to create company")

                # 2) Create user linked to company
                user_id = db_service.insert_user(
                    email=email,
                    password_hash=hashed_password,
                    user_type=user_type,
                    first_name=first_name,
                    last_name=last_name,
                    user_role=user_role,
                    company_id=company_id,
                    is_confirmed=False,
                    confirmation_token=confirmation_token,
                    trial_start_date=trial_start_date,
                    trial_end_date=trial_end_date,
                )
                if not user_id:
                    raise RuntimeError("Failed to create user")

                # 3) Create schema + tables (ONE-TIME per company)
                db_service.initialize_company_schema(company_id)

                # 4) Seed/sync COA ONCE on company creation (pool-first, idempotent)
                initialize_coa(db_service, company_id, industry, sub_industry)

                # 5) Set company owner (prevents orphan company)
                db_service.execute_sql(
                    "UPDATE public.companies SET owner_user_id = %s WHERE id = %s;",
                    (int(user_id), int(company_id)),
                )

        elif user_type == "Practitioner":
            user_id = db_service.insert_user(
                email=email,
                password_hash=hashed_password,
                user_type=user_type,
                first_name=first_name,
                last_name=last_name,
                user_role=user_role,
                is_confirmed=False,
                confirmation_token=confirmation_token,
                trial_start_date=trial_start_date,
                trial_end_date=trial_end_date,
            )
            if not user_id:
                return None
        else:
            return None

        link = create_confirmation_link(confirmation_token)
        send_confirmation_email(email, link)

        return company_id or user_id

    except Exception as e:
        print(f"Database error during registration: {e}")
        return None


# -----------------------------
# Confirmation
# -----------------------------
def confirm_user_registration(token: str) -> Optional[int]:
    user = db_service.get_user_by_confirmation_token(token)
    if not user:
        return None
    user_id = user["id"]
    success = db_service.update_user(user_id, is_confirmed=True, confirmation_token=None)
    return user_id if success else None

# -----------------------------
# Login
# -----------------------------
def login_user(email: str, password: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    email = (email or "").strip().lower()
    if not email or not password:
        return None, None

    user = db_service.get_user_by_email(email)
    if not user or not user.get("is_confirmed"):
        return None, None

    stored_hash = user.get("password_hash")
    if not stored_hash or not check_password_hash(stored_hash, password):
        return None, None

    token = make_jwt(
        user_id=user["id"],
        email=user["email"],
        role=user.get("user_role", "assistant"),
        user_type=user.get("user_type", "Enterprise"),
        company_id=user.get("company_id"),   # ✅ add
    )
    return user, token
