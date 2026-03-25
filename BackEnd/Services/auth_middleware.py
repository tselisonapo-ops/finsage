# BackEnd/Services/auth_middleware.py
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
                return _corsify(make_response(
                    jsonify({"error": "Invalid token payload"}), 401
                ))

            try:
                user_id = int(user_id)
            except Exception:
                return _corsify(make_response(
                    jsonify({"error": "Invalid user id in token"}), 401
                ))

            current_app.logger.warning("AUTH DEBUG %s", {
                "path": request.path,
                "user_id": user_id,
                "token_company_id": payload.get("company_id"),
                "source_company_id": payload.get("source_company_id"),
                "target_company_id": payload.get("target_company_id"),
                "engagement_id": payload.get("engagement_id"),
                "is_delegated_company_access": payload.get("is_delegated_company_access"),
                "access_scope": payload.get("access_scope"),
                "allowed_company_ids": payload.get("allowed_company_ids"),
            })

            g.user_id = user_id
            request.jwt_payload = payload

            cid = kwargs.get("company_id") or kwargs.get("cid")
            if cid is None:
                cid = payload.get("company_id")

            try:
                cid = int(cid) if cid is not None else None
            except Exception:
                cid = None

            if not require_company:
                base = db_service.get_user_by_id(user_id) or {}
                g.current_user = base
                rv = f(*args, **kwargs)
                return _corsify(make_response(rv))

            if not cid:
                return _corsify(make_response(
                    jsonify({"error": "No company selected"}), 403
                ))

            # -------------------------------------------------
            # 1) Direct membership / direct company access path
            # -------------------------------------------------
            user = db_service.get_user_context(
                user_id=user_id,
                company_id=cid,
            )

            if not user:
                company = db_service.fetch_one(
                    "SELECT owner_user_id FROM public.companies WHERE id=%s",
                    (cid,),
                ) or {}

                # -------------------
                # 2) Owner fallback
                # -------------------
                if int(company.get("owner_user_id") or 0) == user_id:
                    base = db_service.get_user_by_id(user_id) or {}
                    base["company_id"] = int(cid)
                    base["user_role"] = normalize_role(base.get("user_role") or "owner")
                    base["company_role"] = base["user_role"]
                    base["is_native_company_member"] = True
                    base["is_delegated_company_access"] = False
                    user = base

                else:
                    # -----------------------------------
                    # 3) Delegated workspace access path
                    # -----------------------------------
                    source_company_id = (
                        payload.get("source_company_id")
                        or payload.get("company_id")
                        or 0
                    )
                    try:
                        source_company_id = int(source_company_id) if source_company_id else 0
                    except Exception:
                        source_company_id = 0

                    role_raw = str(payload.get("role") or "").strip()
                    role_norm = normalize_role(role_raw)
                    access_scope = str(payload.get("access_scope") or "").strip().lower()

                    # Use normalized roles, not raw labels
                    delegated_roles = {
                        "owner",
                        "admin",
                        "cfo",
                        "manager",
                        "accountant",
                        "bookkeeper",
                        "clerk",
                        "audit_staff",
                        "senior_associate",
                        "audit_manager",
                        "audit_partner",
                        "engagement_partner",
                        "quality_control_reviewer",
                        "client_service_manager",
                        "fs_compiler",
                        "reviewer",
                    }

                    can_use_delegated_workspace = (
                        role_norm in delegated_roles
                        and access_scope in {"assignment", "core", "delegated_workspace"}
                    )

                    engagement_id = (
                        request.headers.get("X-FS-Engagement-Id")
                        or payload.get("engagement_id")
                    )
                    try:
                        engagement_id = int(engagement_id) if engagement_id else None
                    except Exception:
                        engagement_id = None

                    print("DELEGATED AUTH CHECK", {
                        "user_id": user_id,
                        "requested_company_id": int(cid),
                        "source_company_id": source_company_id,
                        "engagement_id": engagement_id,
                        "role_raw": role_raw,
                        "role_norm": role_norm,
                        "access_scope": access_scope,
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
                                engagement_id=engagement_id,
                            )

                    print("DELEGATED AUTH RESULT", {
                        "user_id": user_id,
                        "requested_company_id": int(cid),
                        "source_company_id": source_company_id,
                        "engagement_id": engagement_id,
                        "delegated_ok": delegated_ok,
                        "path": request.path,
                    })

                    if delegated_ok:
                        base = db_service.get_user_by_id(user_id) or {}

                        # Prefer payload permissions if present; otherwise build them
                        perms = payload.get("permissions") or {}
                        if not perms:
                            try:
                                perms = db_service.build_delegated_workspace_permissions(
                                    user_id=int(user_id),
                                    source_company_id=int(source_company_id),
                                    target_company_id=int(cid),
                                    engagement_id=int(engagement_id or 0),
                                    base_payload=payload,
                                    role=role_norm,
                                )
                            except Exception as e:
                                print("BUILD DELEGATED PERMISSIONS FAILED", {
                                    "user_id": user_id,
                                    "source_company_id": source_company_id,
                                    "target_company_id": cid,
                                    "engagement_id": engagement_id,
                                    "role_norm": role_norm,
                                    "error": str(e),
                                })
                                perms = {}

                        delegated_fallback = {
                            **base,
                            "id": int(base.get("id") or user_id),
                            "user_id": int(user_id),
                            "company_id": int(cid),
                            "source_company_id": int(source_company_id),
                            "target_company_id": int(payload.get("target_company_id") or cid),
                            "email": payload.get("email") or base.get("email"),
                            "first_name": payload.get("first_name") or base.get("first_name"),
                            "last_name": payload.get("last_name") or base.get("last_name"),
                            "role": role_raw or base.get("role") or "viewer",
                            "user_role": role_norm,
                            "company_role": role_norm,
                            "user_type": payload.get("user_type") or base.get("user_type"),
                            "access_scope": "delegated_workspace" if payload.get("is_delegated_company_access") else (access_scope or "assignment"),
                            "access_level": payload.get("access_level") or base.get("access_level"),
                            "permissions": perms,

                            # flattened permission flags for legacy checks
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

                            "delegated_via_engagement_id": engagement_id,
                            "is_delegated_company_access": True,
                            "is_native_company_member": False,
                        }

                        user = db_service.get_user_context(
                            user_id=user_id,
                            company_id=cid,
                            delegated_fallback=delegated_fallback,
                        )
                    else:
                        return _corsify(make_response(
                            jsonify({"error": "User has no access to this company"}), 403
                        ))

            user = user or {}
            user["company_id"] = int(user.get("company_id") or cid)
            user["user_role"] = normalize_role(
                user.get("user_role") or user.get("role") or "viewer"
            )
            user["company_role"] = user["user_role"]

            # Membership-only guard for delegated users
            membership_only_fragments = (
                "/users",
                "/company-settings",
                "/tax/settings",
                "/governance",
            )
            path = (request.path or "").lower()
            if bool(user.get("is_delegated_company_access")) and any(
                frag in path for frag in membership_only_fragments
            ):
                return _corsify(make_response(
                    jsonify({"error": "This action requires direct company membership"}), 403
                ))

            g.current_user = user

            rv = f(*args, **kwargs)
            return _corsify(make_response(rv))

        return wrapper

    if _f is None:
        return decorator
    return decorator(_f)