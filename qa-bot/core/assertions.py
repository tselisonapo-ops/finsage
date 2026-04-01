from __future__ import annotations

from decimal import Decimal
from typing import Any


def assert_http_ok(status_code: int, body: str = "") -> None:
    if status_code >= 400:
        raise AssertionError(f"Expected HTTP success, got {status_code}. Body preview: {body[:400]}")


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def assert_equal(actual: Any, expected: Any, message: str = "") -> None:
    if actual != expected:
        suffix = f" | {message}" if message else ""
        raise AssertionError(f"Expected {expected!r}, got {actual!r}{suffix}")


def assert_in(value: Any, container: Any, message: str = "") -> None:
    if value not in container:
        suffix = f" | {message}" if message else ""
        raise AssertionError(f"Expected {value!r} to be in {container!r}{suffix}")


def assert_balanced(total_debit: Any, total_credit: Any, tolerance: str = "0.01") -> None:
    d = Decimal(str(total_debit or 0))
    c = Decimal(str(total_credit or 0))
    t = Decimal(tolerance)
    if abs(d - c) > t:
        raise AssertionError(f"Journal is not balanced: debit={d} credit={c}")