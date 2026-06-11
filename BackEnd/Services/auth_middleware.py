# BackEnd/Services/auth_middleware.py
import jwt
from functools import wraps
from flask import request, jsonify, g, make_response, current_app
from BackEnd.Services.auth_service import decode_jwt
from BackEnd.Services.db_service import db_service
from BackEnd.Services.company_context import normalize_role

def _corsify(resp):
    origin = request.headers.get("Origin")
    allowed_origins = current_app.config.get("FRONTEND_ORIGINS", [])

    if origin and origin in allowed_origins:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Vary"] = "Origin"
        resp.headers["Access-Control-Allow-Credentials"] = "true"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    else:
        if origin:
            print(f"[CORS BLOCKED] {origin}")

    return resp

def require_pos_auth(fn):
    @wraps(fn)
    def wrapper(company_id=None, *args, **kwargs):
        if request.method == "OPTIONS":
            return ("", 204)

        token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()

        if not token:
            return jsonify({"error": "POS authentication required"}), 401

        try:
            payload = jwt.decode(
                token,
                current_app.config["SECRET_KEY"],
                algorithms=["HS256"]
            )
        except Exception:
            return jsonify({"error": "Invalid POS token"}), 401

        if payload.get("typ") != "pos":
            return jsonify({"error": "Invalid POS token type"}), 401

        token_company_id = payload.get("company_id")
        company_user_id = payload.get("company_user_id")
        user_id = payload.get("user_id")

        if not token_company_id or not company_user_id or not user_id:
            return jsonify({"error": "Invalid POS session"}), 401

        # If route has company_id, it must match token company
        if company_id is not None and int(company_id) != int(token_company_id):
            return jsonify({"error": "Wrong POS company"}), 403

        row = db_service.fetch_one("""
            SELECT
                cu.id AS company_user_id,
                cu.company_id,
                cu.user_id,
                cu.employee_code,
                cu.pos_access_code,
                cu.pos_display_name,
                cu.pos_role,
                cu.pos_permissions,
                cu.pos_is_active,
                cu.is_active,
                u.email,
                u.first_name,
                u.last_name
            FROM public.company_users cu
            JOIN public.users u ON u.id = cu.user_id
            WHERE cu.company_id = %s
              AND cu.id = %s
              AND cu.user_id = %s
              AND cu.pos_is_active = TRUE
              AND cu.is_active = TRUE
            LIMIT 1;
        """, (
            int(token_company_id),
            int(company_user_id),
            int(user_id),
        ))

        if not row:
            return jsonify({"error": "POS user not found or inactive"}), 401

        company = db_service.fetch_one("""
            SELECT id, name, industry, sub_industry, currency
            FROM public.companies
            WHERE id = %s
              AND is_active = TRUE
            LIMIT 1;
        """, (int(token_company_id),))

        if not company:
            return jsonify({"error": "Company not active"}), 403

        employee = {
            "company_user_id": row["company_user_id"],
            "user_id": row["user_id"],
            "employee_code": row["employee_code"],
            "access_code": row["pos_access_code"],
            "name": row.get("pos_display_name")
                or f"{row.get('first_name') or ''} {row.get('last_name') or ''}".strip()
                or row.get("email"),
            "pos_role": row.get("pos_role"),
            "pos_permissions": row.get("pos_permissions") or {},
        }

        request.pos_user = {
            **payload,
            "company_id": int(token_company_id),
            "company_user_id": int(company_user_id),
            "user_id": int(user_id),
            "employee": employee,
            "company": company,
        }

        return fn(int(token_company_id), *args, **kwargs)

    return wrapper

def _company_auth_or_403(company_id: int):
    user = getattr(g, "current_user", {}) or {}
    if user.get("company_id") != int(company_id):
        return None, (jsonify({"error": "Not authorised for this company"}), 403)
    return user, None

def require_pos_auth(fn):
    @wraps(fn)
    def wrapper(company_id, *args, **kwargs):
        token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()

        if not token:
            return jsonify({"error": "POS authentication required"}), 401

        try:
            payload = jwt.decode(token, current_app.config["SECRET_KEY"], algorithms=["HS256"])
        except Exception:
            return jsonify({"error": "Invalid POS token"}), 401

        if payload.get("typ") != "pos":
            return jsonify({"error": "Invalid POS token type"}), 401

        if int(payload.get("company_id")) != int(company_id):
            return jsonify({"error": "Wrong POS company"}), 403

        request.pos_user = payload
        return fn(company_id, *args, **kwargs)

    return wrapper
