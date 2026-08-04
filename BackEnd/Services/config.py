import os
from pathlib import Path
from dotenv import load_dotenv

APP_ENV = str(os.getenv("APP_ENV") or "development").strip().lower()

if APP_ENV != "production":
    ENV_PATH = Path(__file__).resolve().parent / ".env"
    if ENV_PATH.exists():
        load_dotenv(dotenv_path=ENV_PATH, override=False)

def _get_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _get_list(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


class Config:
    APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
    DEBUG = _get_bool("DEBUG", APP_ENV == "development")
    PORT = int(os.getenv("PORT", "5000"))
    RUN_BOOTSTRAP = _get_bool("RUN_BOOTSTRAP", APP_ENV == "development")

    SECRET_KEY = os.getenv("SECRET_KEY", os.getenv("JWT_SECRET_KEY", ""))
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")

    MASTER_DB_DSN = os.getenv("MASTER_DB_DSN", "")

    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASS = os.getenv("SMTP_PASS", "")
    MAIL_FROM = os.getenv("MAIL_FROM", "")
    SMTP_USE_SSL = _get_bool("SMTP_USE_SSL", True)
    SMTP_USE_TLS = _get_bool("SMTP_USE_TLS", False)

    FRONTEND_BASE = os.getenv("FRONTEND_BASE")

    if not FRONTEND_BASE:
        raise RuntimeError("FRONTEND_BASE must be set in production")
    BACKEND_BASE = os.getenv("BACKEND_BASE", "http://127.0.0.1:5000")
    FRONTEND_ORIGINS = _get_list(
        "FRONTEND_ORIGINS",
        default=FRONTEND_BASE,
    )

    AUTH_TOKEN_TTL = int(os.getenv("AUTH_TOKEN_TTL", "86400"))