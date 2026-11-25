"""
Refresh token service for FinSage.

Implements DB-backed, hashed, revocable refresh tokens delivered via
HTTP-only cookies. Access tokens are short-lived (15 min) and kept
in memory on the client; refresh tokens are long-lived (7 days) and
stored as opaque, hashed strings in the database.

Security properties:
  - Refresh tokens are NOT JWTs — they are opaque random strings.
  - Only the SHA-256 hash is stored in the database, so a DB leak
    does not expose usable tokens.
  - Tokens are delivered exclusively via HTTP-only, SameSite=Strict
    cookies, so JavaScript (and therefore XSS) cannot read them.
  - Each refresh token is bound to a user_id and can be revoked
    individually or en masse (e.g. on sign-out / password change).
  - Token rotation: on each refresh, the old token is revoked and a
    new one issued, limiting replay windows.
"""

from __future__ import annotations

import hashlib
import secrets
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

# ── Configuration ─────────────────────────────────────────────────
REFRESH_TOKEN_BYTES = 48          # 48 bytes -> 64 base64url chars
REFRESH_TOKEN_TTL_DAYS = 7
ACCESS_TOKEN_TTL_MINUTES = 15      # short-lived access token
COOKIE_NAME = "fs_refresh_token"
COOKIE_SAMESITE = "Strict"         # CSRF protection
COOKIE_SECURE = os.getenv("APP_ENV", "development").strip().lower() == "production"
COOKIE_HTTPONLY = True
COOKIE_PATH = "/"
COOKIE_DOMAIN = None               # let browser infer

# ── Schema bootstrap ──────────────────────────────────────────────
_REFRESH_DDL = """
CREATE TABLE IF NOT EXISTS public.auth_refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ NULL,
    last_used_at TIMESTAMPTZ NULL,
    user_agent TEXT,
    ip_address INET,
    product TEXT NOT NULL DEFAULT 'finsage'
);

CREATE INDEX IF NOT EXISTS auth_refresh_tokens_user_idx
    ON public.auth_refresh_tokens (user_id, expires_at);

CREATE INDEX IF NOT EXISTS auth_refresh_tokens_hash_idx
    ON public.auth_refresh_tokens (token_hash);

CREATE INDEX IF NOT EXISTS auth_refresh_tokens_cleanup_idx
    ON public.auth_refresh_tokens (expires_at);
"""


def ensure_refresh_schema(db_service) -> None:
    """Create the refresh-token table if it does not exist."""
    with db_service._conn_cursor() as (_conn, cur):
        cur.execute(_REFRESH_DDL)
        _conn.commit()


# ── Helpers ───────────────────────────────────────────────────────
def _hash_token(raw: str) -> str:
    """SHA-256 hash of the raw token. Only the hash is stored."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _generate_raw_token() -> str:
    """Generate a cryptographically secure opaque token."""
    return secrets.token_urlsafe(REFRESH_TOKEN_BYTES)


# ── Token lifecycle ───────────────────────────────────────────────
def issue_refresh_token(
    db_service,
    *,
    user_id: int,
    product: str = "finsage",
    user_agent: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> str:
    """
    Create a new refresh token for the user and return the raw
    (unhashed) string that should be placed in the HTTP-only cookie.
    """
    raw = _generate_raw_token()
    token_hash = _hash_token(raw)
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_TTL_DAYS)

    db_service.execute_sql(
        """
        INSERT INTO public.auth_refresh_tokens
            (user_id, token_hash, expires_at, user_agent, ip_address, product)
        VALUES (%s, %s, %s, %s, %s::inet, %s)
        """,
        (
            int(user_id),
            token_hash,
            expires_at,
            (user_agent or "")[:1000] or None,
            ip_address or None,
            product,
        ),
    )
    return raw


def verify_refresh_token(db_service, raw_token: str) -> Optional[Dict[str, Any]]:
    """
    Look up a refresh token by its hash. Returns a dict with user_id,
    expires_at, etc. if the token is valid and not revoked/expired,
    otherwise None.

    Also updates last_used_at for observability.
    """
    if not raw_token:
        return None

    token_hash = _hash_token(raw_token)

    row = db_service.fetch_one(
        """
        SELECT id, user_id, expires_at, revoked_at, product
        FROM public.auth_refresh_tokens
        WHERE token_hash = %s
        LIMIT 1
        """,
        (token_hash,),
    )

    if not row:
        return None

    now = datetime.now(timezone.utc)

    if row.get("revoked_at") is not None:
        return None

    expires_at = row.get("expires_at")
    if expires_at is None:
        return None

    if hasattr(expires_at, "tzinfo") and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if now > expires_at:
        return None

    # Update last_used_at (fire-and-forget; failure is non-fatal)
    try:
        db_service.execute_sql(
            """
            UPDATE public.auth_refresh_tokens
            SET last_used_at = NOW()
            WHERE id = %s
            """,
            (row["id"],),
        )
    except Exception:
        pass

    return {
        "id": row["id"],
        "user_id": int(row["user_id"]),
        "expires_at": expires_at,
        "product": row.get("product") or "finsage",
    }


def revoke_refresh_token(db_service, raw_token: str) -> bool:
    """Revoke a single refresh token (e.g. on sign-out)."""
    if not raw_token:
        return False

    token_hash = _hash_token(raw_token)

    affected = db_service.execute_sql(
        """
        UPDATE public.auth_refresh_tokens
        SET revoked_at = NOW()
        WHERE token_hash = %s
          AND revoked_at IS NULL
        """,
        (token_hash,),
    )
    return bool(affected)


def revoke_all_user_tokens(db_service, user_id: int) -> int:
    """
    Revoke every refresh token for a user.
    Call this on password change, forced sign-out, or security incident.
    """
    affected = db_service.execute_sql(
        """
        UPDATE public.auth_refresh_tokens
        SET revoked_at = NOW()
        WHERE user_id = %s
          AND revoked_at IS NULL
        """,
        (int(user_id),),
    )
    return int(affected or 0)


def cleanup_expired_tokens(db_service) -> int:
    """Delete tokens that expired more than 30 days ago."""
    affected = db_service.execute_sql(
        """
        DELETE FROM public.auth_refresh_tokens
        WHERE expires_at < (NOW() - INTERVAL '30 days')
        """,
        (),
    )
    return int(affected or 0)


# ── Cookie helpers ────────────────────────────────────────────────
def set_refresh_cookie(
    response,
    raw_token: str,
    *,
    max_age_seconds: int = REFRESH_TOKEN_TTL_DAYS * 24 * 3600,
) -> None:
    """Attach the HTTP-only refresh-token cookie to a Flask response."""
    response.set_cookie(
        COOKIE_NAME,
        raw_token,
        max_age=max_age_seconds,
        httponly=COOKIE_HTTPONLY,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path=COOKIE_PATH,
        domain=COOKIE_DOMAIN,
    )


def clear_refresh_cookie(response) -> None:
    """Remove the refresh-token cookie (e.g. on sign-out)."""
    response.delete_cookie(
        COOKIE_NAME,
        path=COOKIE_PATH,
        domain=COOKIE_DOMAIN,
    )


def read_refresh_cookie(request) -> str:
    """Read the raw refresh token from the incoming request cookie."""
    return request.cookies.get(COOKIE_NAME, "") or ""
