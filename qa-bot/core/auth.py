from __future__ import annotations

from typing import Any

from config.routes import ROUTES
from config.settings import settings
from core.client import ApiClient
from core.logger import logger


def login_api(client: ApiClient) -> dict[str, Any]:
    payload = {
        "email": settings.test_email,
        "password": settings.test_password,
    }

    response = client.post(ROUTES["login"], json=payload)

    print("LOGIN STATUS:", response.status_code)
    print("LOGIN HEADERS:", dict(response.headers))
    print("LOGIN BODY:", response.text[:1000])

    if response.status_code >= 400:
        raise RuntimeError(f"Login failed: {response.status_code} {response.text[:300]}")

    data = client.safe_json(response)
    if data is None:
        # not JSON, but session cookie may still have been set
        logger.info("Login response was not JSON; assuming cookie/session auth.")
        return {"raw_text": response.text[:1000]}

    if not isinstance(data, dict):
        raise RuntimeError("Login response was not a JSON object.")

    token = (
        data.get("token")
        or data.get("access_token")
        or data.get("jwt")
        or (data.get("data") or {}).get("token")
        or (data.get("data") or {}).get("access_token")
    )

    if token:
        client.set_bearer_token(token)
        logger.info("Authenticated using bearer token.")
        return data

    logger.info("Login succeeded without explicit bearer token; assuming cookie-based auth.")
    return data