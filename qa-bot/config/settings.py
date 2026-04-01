from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT_DIR / ".env"

if ENV_PATH.exists():
    load_dotenv(ENV_PATH)
else:
    load_dotenv()


def _get_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _get_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


@dataclass(frozen=True)
class Settings:
    base_url: str
    api_base_url: str
    login_path: str

    test_email: str
    test_password: str
    company_id: int

    db_host: str
    db_port: int
    db_name: str
    db_user: str
    db_password: str

    run_mode: str
    request_timeout: int
    verify_ssl: bool
    headless: bool

    test_prefix: str
    default_currency: str

    @property
    def login_url(self) -> str:
        return f"{self.api_base_url.rstrip('/')}{self.login_path}"

    def assert_valid(self) -> None:
        allowed_modes = {"readonly", "sandbox", "live_safe"}
        if self.run_mode not in allowed_modes:
            raise ValueError(f"RUN_MODE must be one of {allowed_modes}, got {self.run_mode!r}")

        required = {
            "BASE_URL": self.base_url,
            "API_BASE_URL": self.api_base_url,
            "LOGIN_PATH": self.login_path,
            "TEST_EMAIL": self.test_email,
            "TEST_PASSWORD": self.test_password,
            "COMPANY_ID": self.company_id,
        }
        missing = [k for k, v in required.items() if v in ("", None)]
        if missing:
            raise ValueError(f"Missing required environment values: {', '.join(missing)}")


settings = Settings(
    base_url=os.getenv("BASE_URL", "").strip(),
    api_base_url=os.getenv("API_BASE_URL", "").strip(),
    login_path=os.getenv("LOGIN_PATH", "/auth/login").strip(),
    test_email=os.getenv("TEST_EMAIL", "").strip(),
    test_password=os.getenv("TEST_PASSWORD", "").strip(),
    company_id=_get_int("COMPANY_ID", 0),

    db_host=os.getenv("DB_HOST", "127.0.0.1").strip(),
    db_port=_get_int("DB_PORT", 5432),
    db_name=os.getenv("DB_NAME", "").strip(),
    db_user=os.getenv("DB_USER", "").strip(),
    db_password=os.getenv("DB_PASSWORD", "").strip(),

    run_mode=os.getenv("RUN_MODE", "readonly").strip().lower(),
    request_timeout=_get_int("REQUEST_TIMEOUT", 30),
    verify_ssl=_get_bool("VERIFY_SSL", True),
    headless=_get_bool("HEADLESS", True),

    test_prefix=os.getenv("TEST_PREFIX", "BOT-TEST").strip(),
    default_currency=os.getenv("DEFAULT_CURRENCY", "ZAR").strip(),
)