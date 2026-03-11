# BackEnd/Services/auth_middleware.py
from functools import wraps
from flask import request, jsonify, g, make_response, current_app
from BackEnd.Services.auth_service import decode_jwt
from BackEnd.Services.db_service import db_service

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

def require_auth(_f=None, *, require_company: bool = True):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if request.method == "OPTIONS":
                return _corsify(make_response("", 204))

            auth_header = request.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                return _corsify(make_response(
                    jsonify({"error": "Missing or invalid Authorization header"}), 401
                ))

            token = auth_header.split(" ", 1)[1].strip()

            try:
                payload = decode_jwt(token)
            except Exception:
                return _corsify(make_response(
                    jsonify({"error": "Invalid or expired token"}), 401
                ))

            user_id = payload.get("sub") or payload.get("user_id")
            if not user_id:
                return _corsify(make_response(jsonify({"error": "Invalid token payload"}), 401))

            user_id = int(user_id)
            g.user_id = user_id
            request.jwt_payload = payload

            # -----------------------------
            # Company selection (optional)
            # -----------------------------
            cid = kwargs.get("company_id") or kwargs.get("cid")
            if cid is None:
                cid = payload.get("company_id")

            if cid is not None:
                cid = int(cid)

            # If endpoint does NOT require a company, we stop here.
            if not require_company:
                # still give a base user context for convenience
                base = db_service.get_user_by_id(user_id)
                if base:
                    g.current_user = base
                rv = f(*args, **kwargs)
                return _corsify(make_response(rv))

            # From here, endpoint REQUIRES company
            if not cid:
                return _corsify(make_response(jsonify({"error": "No company selected"}), 403))

            user = db_service.get_user_context(user_id=user_id, company_id=cid)

            if not user:
                company = db_service.fetch_one(
                    "SELECT owner_user_id FROM public.companies WHERE id=%s",
                    (cid,)
                ) or {}
                if int(company.get("owner_user_id") or 0) == user_id:
                    base = db_service.get_user_by_id(user_id) or {}
                    base["company_id"] = cid
                    base["user_role"] = base.get("user_role") or "owner"
                    user = base
                else:
                    return _corsify(make_response(
                        jsonify({"error": "User has no access to this company"}), 403
                    ))

            user["company_id"] = int(user.get("company_id") or cid)
            user["user_role"] = (user.get("user_role") or user.get("role") or "viewer")
            g.current_user = user

            rv = f(*args, **kwargs)
            return _corsify(make_response(rv))
        return wrapper

    # allow both @require_auth and @require_auth(...)
    if _f is None:
        return decorator
    return decorator(_f)


