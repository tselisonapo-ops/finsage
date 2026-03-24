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
                    source_company_id = int(payload.get("company_id") or 0)
                    role = str(payload.get("role") or "").strip().lower()
                    access_scope = str(payload.get("access_scope") or "").strip().lower()

                    # Define roles that can post via engagement
                    delegated_roles = {
                        "bookkeeper",
                        "accountant",
                        "preparer",
                        "manager",
                        "partner",
                        "reviewer",
                        "owner",
                        "admin",
                    }

                    can_use_delegated_workspace = (
                        role in delegated_roles
                        and access_scope in {"assignment", "core"}
                    )

                    engagement_id = request.headers.get("X-FS-Engagement-Id")
                    try:
                        engagement_id = int(engagement_id) if engagement_id else None
                    except Exception:
                        engagement_id = None

                    print("DELEGATED AUTH CHECK", {
                        "user_id": user_id,
                        "requested_company_id": int(cid),
                        "source_company_id": source_company_id,
                        "engagement_id_header": request.headers.get("X-FS-Engagement-Id"),
                        "engagement_id_parsed": engagement_id,
                        "can_use_delegated_workspace": can_use_delegated_workspace,
                        "path": request.path,
                    })

                delegated_ok = False
                if can_use_delegated_workspace and source_company_id:
                    with db_service._conn_cursor() as (_conn, cur):
                        delegated_ok = db_service.user_has_delegated_company_access(
                            cur,
                            user_id=user_id,
                            company_id=source_company_id,
                            target_company_id=int(cid),
                            engagement_id=engagement_id,  # can be None
                        )

                    print("DELEGATED AUTH RESULT", {
                        "user_id": user_id,
                        "requested_company_id": int(cid),
                        "source_company_id": source_company_id,
                        "engagement_id": engagement_id,
                        "delegated_ok": delegated_ok,
                        "path": request.path,
                    })

                # in require_auth

                if delegated_ok:
                    base = db_service.get_user_by_id(user_id) or {}
                    perms = payload.get("permissions") or {}

                    user = {
                        **base,
                        "id": int(base.get("id") or user_id),
                        "user_id": int(user_id),
                        "company_id": int(cid),
                        "source_company_id": int(source_company_id),
                        "email": payload.get("email") or base.get("email"),
                        "first_name": payload.get("first_name") or base.get("first_name"),
                        "last_name": payload.get("last_name") or base.get("last_name"),
                        "role": payload.get("role") or base.get("role") or "viewer",
                        "user_role": (
                            payload.get("role")
                            or base.get("user_role")
                            or base.get("role")
                            or "viewer"
                        ),
                        "company_role": (
                            payload.get("role")
                            or base.get("user_role")
                            or base.get("role")
                            or "viewer"
                        ),
                        "user_type": payload.get("user_type") or base.get("user_type"),
                        "access_scope": str(payload.get("access_scope") or "assignment").strip().lower(),
                        "access_level": payload.get("access_level") or base.get("access_level"),
                        "permissions": perms,

                        # flattened permission flags for old code paths
                        "can_view_dashboard": bool(perms.get("can_view_dashboard")),
                        "can_view_reports": bool(perms.get("can_view_reports")),
                        "can_manage_ar": bool(perms.get("can_manage_ar")),
                        "can_manage_ap": bool(perms.get("can_manage_ap")),
                        "can_manage_banking": bool(perms.get("can_manage_banking")),
                        "can_post_journals": bool(perms.get("can_post_journals")),
                        "can_prepare_financials": bool(perms.get("can_prepare_financials")),
                        "can_manage_fixed_assets": bool(perms.get("can_manage_fixed_assets")),
                        "can_manage_users": bool(perms.get("can_manage_users")),
                        "can_manage_company_setup": bool(perms.get("can_manage_company_setup")),
                        "can_edit_tax_settings": bool(perms.get("can_edit_tax_settings")),
                        "can_lock_periods": bool(perms.get("can_lock_periods")),
                        "can_approve": bool(perms.get("can_approve")),
                        "can_access_practitioner_dashboard": bool(perms.get("can_access_practitioner_dashboard")),
                        "can_access_enterprise_dashboard": bool(perms.get("can_access_enterprise_dashboard")),

                        # delegated markers
                        "delegated_via_engagement_id": engagement_id,
                        "is_delegated_company_access": True,
                        "is_native_company_member": False,
                    }
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


