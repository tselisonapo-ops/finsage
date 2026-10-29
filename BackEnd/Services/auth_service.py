# backEnd/Services/auth_service.py
import os, uuid, hashlib, jwt
from typing import Optional, Tuple, Dict, Any
from datetime import datetime, timedelta, timezone
from werkzeug.security import check_password_hash, generate_password_hash

import hmac
import secrets

from .db_service import db_service
from typing import Any, Dict, Optional
from BackEnd.Services.emailer import send_mail
from BackEnd.Services.industry_profiles import normalize_industry_pair
from BackEnd.Services.coa_service import initialize_coa  # ✅ now exists in coa_service.py
from flask import current_app

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

    # new optional delegated fields
    source_company_id: int | None = None,
    target_company_id: int | None = None,
    engagement_id: int | None = None,
    permissions: dict | None = None,
    first_name: str | None = None,
    last_name: str | None = None,
    is_delegated_company_access: bool = False,
    is_native_company_member: bool = True,
) -> str:
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user_id),
        "user_id": int(user_id),
        "email": email,
        "first_name": first_name,
        "last_name": last_name,
        "role": (role or "viewer").strip().lower(),
        "user_type": (user_type or "Enterprise").strip(),
        "company_id": int(company_id) if company_id is not None else None,
        "access_scope": (access_scope or "core").strip().lower(),
        "allowed_company_ids": [int(x) for x in (allowed_company_ids or [])],

        # delegated workspace context
        "source_company_id": int(source_company_id) if source_company_id is not None else None,
        "target_company_id": int(target_company_id) if target_company_id is not None else None,
        "engagement_id": int(engagement_id) if engagement_id is not None else None,
        "permissions": permissions or {},
        "is_delegated_company_access": bool(is_delegated_company_access),
        "is_native_company_member": bool(is_native_company_member),

        "iat": int(now.timestamp()),
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
    }

    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def make_pos_jwt(*, company_id, company_user_id, user_id, employee_code, pos_role):
    now = datetime.utcnow()

    payload = {
        "typ": "pos",
        "type": "pos",
        "token_type": "pos",

        "company_id": int(company_id),
        "company_user_id": int(company_user_id),
        "user_id": int(user_id),
        "employee_code": str(employee_code),
        "pos_role": str(pos_role or ""),

        "iat": now,
        "exp": now + timedelta(hours=12),
    }

    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm="HS256")

def make_control_jwt(
    control_user_id: int,
    email: str,
    role: str = "agent",
    permissions: dict | None = None,
) -> str:
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(control_user_id),
        "control_user_id": int(control_user_id),
        "email": (email or "").strip().lower(),
        "role": (role or "agent").strip().lower(),
        "token_type": "control",
        "access_scope": "control",
        "permissions": permissions or {},
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=JWT_EXP_DAYS)).timestamp()),
    }

    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt(token: str) -> Dict[str, Any]:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

OTP_LIFETIME_MINUTES = 3
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_SECONDS = 60


def _otp_hash(challenge_id: str, code: str) -> str:
    """Hash an OTP using its challenge ID and the server secret."""
    secret = os.getenv("JWT_SECRET_KEY", "")
    if not secret or secret == "fallback-secret-change-me":
        raise RuntimeError("A secure JWT_SECRET_KEY must be configured.")

    message = f"{challenge_id}:{code}".encode("utf-8")
    return hmac.new(
        secret.encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()


def _new_otp_code() -> str:
    """Generate a cryptographically secure six-digit OTP."""
    return f"{secrets.randbelow(1_000_000):06d}"

def issue_email_otp(
    db_service,
    user_id: int,
    email: str,
    purpose: str,
    product: str = "finsage",
) -> str:
    """Create and email a single-use OTP challenge."""
    if purpose not in {"signin", "session_unlock"}:
        raise ValueError("Invalid OTP purpose.")

    user_id = int(user_id)
    challenge_id = str(uuid.uuid4())
    code = _new_otp_code()
    code_hash = _otp_hash(challenge_id, code)

    # Lock the user row to serialize challenge creation and resend requests.
    with db_service._conn_cursor() as (conn, cur):
        try:
            user = db_service.fetch_one(
                "SELECT id FROM public.users WHERE id = %s FOR UPDATE",
                (user_id,),
                cur=cur,
            )
            if not user:
                raise ValueError("User account not found.")

            previous = db_service.fetch_one(
                """
                SELECT last_sent_at
                FROM public.auth_otp_challenges
                WHERE user_id = %s AND purpose = %s
                ORDER BY created_at DESC
                LIMIT 1
                FOR UPDATE
                """,
                (user_id, purpose),
                cur=cur,
            )

            if previous and previous.get("last_sent_at"):
                cooldown = db_service.fetch_one(
                    """
                    SELECT
                        NOW() < (%s::timestamptz
                                 + (%s * INTERVAL '1 second')) AS throttled
                    """,
                    (
                        previous["last_sent_at"],
                        OTP_RESEND_SECONDS,
                    ),
                    cur=cur,
                )
                if cooldown and cooldown.get("throttled"):
                    raise ValueError(
                        "Please wait before requesting another verification code."
                    )

            # Invalidate any earlier unconsumed code for this purpose.
            db_service.execute_sql(
                """
                UPDATE public.auth_otp_challenges
                SET consumed_at = NOW()
                WHERE user_id = %s
                  AND purpose = %s
                  AND consumed_at IS NULL
                """,
                (user_id, purpose),
                cur=cur,
                conn=conn,
                commit=False,
            )

            db_service.execute_sql(
                """
                INSERT INTO public.auth_otp_challenges
                    (id, user_id, purpose, product, otp_hash, attempts,
                    expires_at, last_sent_at, created_at)
                VALUES
                    (%s::uuid, %s, %s, %s, %s, 0,
                    NOW() + (%s * INTERVAL '1 minute'),
                    NOW(), NOW())
                """,
                (
                    challenge_id,
                    user_id,
                    purpose,
                    product,
                    code_hash,
                    OTP_LIFETIME_MINUTES,
                ),
                cur=cur,
                conn=conn,
                commit=False,
            )

            conn.commit()
        except Exception:
            conn.rollback()
            raise

    try:
        send_mail(
            to_email=email,
            subject="Your FinSage verification code",
            text_body=(
                f"Your FinSage verification code is {code}. "
                f"It expires in {OTP_LIFETIME_MINUTES} minutes. "
                "If you did not request this code, you can ignore this email."
            ),
            html_body=(
                "<p>Your FinSage verification code is:</p>"
                f"<p style='font-size:24px;font-weight:bold;"
                f"letter-spacing:4px'>{code}</p>"
                f"<p>This code expires in {OTP_LIFETIME_MINUTES} minutes.</p>"
                "<p>If you did not request this code, you can ignore this email.</p>"
            ),
        )
    except Exception:
        # Do not leave a valid challenge behind if delivery fails.
        try:
            db_service.execute_sql(
                """
                UPDATE public.auth_otp_challenges
                SET consumed_at = NOW()
                WHERE id = %s::uuid AND consumed_at IS NULL
                """,
                (challenge_id,),
            )
        except Exception:
            pass
        raise

    return challenge_id


def verify_email_otp(
    db_service,
    *,
    challenge_id: str,
    user_id: int,
    purpose: str,
    code: str,
) -> bool:
    """Verify and consume a challenge atomically."""
    if purpose not in {"signin", "session_unlock"}:
        return False

    code = str(code or "").strip()
    if len(code) != 6 or not code.isdigit():
        code = ""

    with db_service._conn_cursor() as (conn, cur):
        try:
            challenge = db_service.fetch_one(
                """
                SELECT
                    id::text AS id,
                    otp_hash,
                    attempts,
                    consumed_at,
                    (expires_at > NOW()) AS not_expired
                FROM public.auth_otp_challenges
                WHERE id = %s::uuid
                  AND user_id = %s
                  AND purpose = %s
                FOR UPDATE
                """,
                (challenge_id, int(user_id), purpose),
                cur=cur,
            )

            if (
                not challenge
                or challenge.get("consumed_at") is not None
                or not challenge.get("not_expired")
                or int(challenge.get("attempts") or 0) >= OTP_MAX_ATTEMPTS
            ):
                conn.commit()
                return False

            expected_hash = str(challenge.get("otp_hash") or "")
            supplied_hash = _otp_hash(challenge_id, code) if code else ""

            if not hmac.compare_digest(expected_hash, supplied_hash):
                new_attempts = int(challenge.get("attempts") or 0) + 1
                db_service.execute_sql(
                    """
                    UPDATE public.auth_otp_challenges
                    SET attempts = %s,
                        consumed_at = CASE
                            WHEN %s >= %s THEN NOW()
                            ELSE consumed_at
                        END
                    WHERE id = %s::uuid
                    """,
                    (
                        new_attempts,
                        new_attempts,
                        OTP_MAX_ATTEMPTS,
                        challenge_id,
                    ),
                    cur=cur,
                    conn=conn,
                    commit=False,
                )
                conn.commit()
                return False

            db_service.execute_sql(
                """
                UPDATE public.auth_otp_challenges
                SET consumed_at = NOW()
                WHERE id = %s::uuid AND consumed_at IS NULL
                """,
                (challenge_id,),
                cur=cur,
                conn=conn,
                commit=False,
            )
            conn.commit()
            return True

        except Exception:
            conn.rollback()
            raise

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
    subject = "Confirm your FinSage account"
    html = f"""
    <h2>Confirm your email</h2>
    <p>Please confirm your FinSage account by clicking the link below:</p>
    <p>
      <a href="{link}" style="background:#00C8C8;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">
        Confirm email
      </a>
    </p>
    <p>If the button does not work, use this link:</p>
    <p><code>{link}</code></p>
    """
    text = f"Confirm your FinSage account: {link}"

    send_mail(
        to_email=email,
        subject=subject,
        html_body=html,
        text_body=text,
    )
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
