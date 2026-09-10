"""
FinSage Control — First Admin Bootstrap

One-time helper for creating the first Control administrator.

Environment variables:
    CONTROL_ADMIN_EMAIL
    CONTROL_ADMIN_PASSWORD
    CONTROL_ADMIN_NAME

Example:
    CONTROL_ADMIN_EMAIL=admin@example.com
    CONTROL_ADMIN_PASSWORD=your-secure-password
    CONTROL_ADMIN_NAME="FinSage Control Admin"

Run from the project environment:
    python -m BackEnd.Services.service_control.bootstrap_admin
"""

import os
import sys

from BackEnd.Services.db_service import db_service
from BackEnd.Services.auth_service import hash_password


def bootstrap_control_admin():
    email = (os.getenv("CONTROL_ADMIN_EMAIL") or "").strip().lower()
    password = os.getenv("CONTROL_ADMIN_PASSWORD") or ""
    display_name = (
        os.getenv("CONTROL_ADMIN_NAME")
        or "FinSage Control Admin"
    ).strip()

    if not email:
        raise RuntimeError(
            "CONTROL_ADMIN_EMAIL environment variable is required"
        )

    if not password:
        raise RuntimeError(
            "CONTROL_ADMIN_PASSWORD environment variable is required"
        )

    if len(password) < 12:
        raise RuntimeError(
            "CONTROL_ADMIN_PASSWORD must be at least 12 characters"
        )

    existing = db_service.fetch_one(
        """
        SELECT id, email, role, is_active
        FROM control.control_users
        WHERE LOWER(email) = %s
        LIMIT 1
        """,
        (email,)
    )

    if existing:
        print(
            f"Control user already exists: "
            f"{existing['email']} (id={existing['id']})"
        )
        return existing["id"]

    password_hash = hash_password(password)

    user = db_service.fetch_one(
        """
        INSERT INTO control.control_users (
            email,
            password_hash,
            display_name,
            role,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            %s,
            %s,
            %s,
            'admin',
            TRUE,
            NOW(),
            NOW()
        )
        RETURNING id, email, display_name, role, is_active
        """,
        (
            email,
            password_hash,
            display_name,
        )
    )

    if not user:
        raise RuntimeError(
            "Failed to create Control administrator"
        )

    print(
        f"Control administrator created successfully: "
        f"{user['email']} (id={user['id']})"
    )

    return user["id"]


if __name__ == "__main__":
    try:
        bootstrap_control_admin()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)