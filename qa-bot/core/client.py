from __future__ import annotations

import time
from typing import Any

import requests

from config.settings import settings
from core.logger import logger, log_event


class ApiClient:
    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.verify = settings.verify_ssl
        self.timeout = settings.request_timeout
        self.default_headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def set_bearer_token(self, token: str) -> None:
        self.session.headers.update({"Authorization": f"Bearer {token}"})

    def set_cookie_auth(self, cookies: dict[str, str]) -> None:
        self.session.cookies.update(cookies)

    def request(self, method: str, url: str, **kwargs) -> requests.Response:
        headers = kwargs.pop("headers", {})
        merged_headers = {**self.default_headers, **headers}

        started = time.perf_counter()
        try:
            response = self.session.request(
                method=method.upper(),
                url=url,
                headers=merged_headers,
                timeout=kwargs.pop("timeout", self.timeout),
                **kwargs,
            )
        except requests.RequestException as exc:
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            logger.exception("HTTP request failed: %s %s", method.upper(), url)
            log_event(
                "http_exception",
                method=method.upper(),
                url=url,
                duration_ms=duration_ms,
                error=str(exc),
            )
            raise

        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        body_preview = response.text[:600] if response.text else ""

        logger.info("%s %s -> %s in %sms", method.upper(), url, response.status_code, duration_ms)
        log_event(
            "http_response",
            method=method.upper(),
            url=url,
            status_code=response.status_code,
            duration_ms=duration_ms,
            body_preview=body_preview,
        )
        return response

    def get(self, url: str, **kwargs) -> requests.Response:
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs) -> requests.Response:
        return self.request("POST", url, **kwargs)

    def put(self, url: str, **kwargs) -> requests.Response:
        return self.request("PUT", url, **kwargs)

    def patch(self, url: str, **kwargs) -> requests.Response:
        return self.request("PATCH", url, **kwargs)

    def delete(self, url: str, **kwargs) -> requests.Response:
        return self.request("DELETE", url, **kwargs)

    @staticmethod
    def safe_json(response: requests.Response) -> dict[str, Any] | list[Any] | None:
        try:
            return response.json()
        except ValueError:
            return None