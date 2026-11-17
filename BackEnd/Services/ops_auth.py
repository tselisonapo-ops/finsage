from functools import wraps
from flask import g,jsonify
from BackEnd.Services.db_service import db_service

def require_ops_access(fn):
    @wraps(fn)
    def wrapper(company_id,*args,**kwargs):
        user=getattr(g,"current_user",{}) or {}
        user_id=int(user.get("id") or user.get("user_id") or 0)

        if not user_id:
            return jsonify({"error":"FinSage Nexus authentication required"}),401

        if not db_service.user_has_ops_access(company_id,user_id):
            return jsonify({"error":"You do not have access to FinSage Nexus"}),403

        return fn(company_id,*args,**kwargs)

    return wrapper

def require_ops_permission(permission_code:str):
    def decorator(fn):
        @wraps(fn)
        def wrapper(company_id,*args,**kwargs):
            user=getattr(g,"current_user",{}) or {}
            user_id=int(user.get("id") or user.get("user_id") or 0)

            if not user_id:
                return jsonify({"error":"Authentication required"}),401

            permissions=db_service.get_ops_user_permissions(
                int(company_id),
                user_id,
            )

            if permission_code not in permissions:
                return jsonify({
                    "error":"You do not have permission to perform this action",
                    "permission":permission_code,
                }),403

            return fn(company_id,*args,**kwargs)

        return wrapper
    return decorator

def require_vendor_portal_auth(fn):
    @wraps(fn)
    def wrapper(company_id,*args,**kwargs):
        token=(
            request.headers.get(
                "Authorization"
            )
            or ""
        ).strip()


        if token.lower().startswith(
            "bearer "
        ):
            token=token[7:].strip()


        if not token:
            return jsonify({
                "error":"Vendor portal authentication required."
            }),401


        schema=db_service.company_schema(
            company_id
        )


        token_hash=db_service._ops_portal_token_hash(
            token
        )


        row=db_service.fetch_one(
            f"""
            SELECT
                s.id AS session_id,
                u.*
            FROM {schema}.ops_vendor_portal_sessions s
            JOIN {schema}.ops_vendor_portal_users u
            ON u.id=s.portal_user_id
            WHERE s.token_hash=%s
            AND s.revoked_at IS NULL
            AND s.expires_at>NOW()
            AND u.status='active'
            LIMIT 1;
            """,
            (token_hash,),
        )


        if not row:
            return jsonify({
                "error":"Vendor portal session has expired."
            }),401


        g.vendor_portal_user=dict(row)


        return fn(
            company_id,
            *args,
            **kwargs
        )


    return wrapper

def require_finsage_accounting_access(fn):
    @wraps(fn)
    def wrapper(company_id, *args, **kwargs):
        user = getattr(g, "current_user", {}) or {}
        user_id = int(user.get("id") or user.get("user_id") or 0)

        if not user_id:
            return jsonify({"error": "Authentication required"}), 401

        if not db_service.user_has_finsage_accounting_access(company_id, user_id):
            return jsonify({
                "error": "Access denied: Only accountants and administrators with FinSage ERP access can perform asset and lease accounting handovers."
            }), 403

        return fn(company_id, *args, **kwargs)
    return wrapper


def require_inquiry_token_auth(f):
    """
    Token-gated auth for external portal inquiry routes.
    Reads token from X-Inquiry-Token header or ?token= query param.
    Sets flask.g.inquiry and flask.g.inquiry_token.
    No JWT required.
    """
    from functools import wraps
    from flask import request, g, jsonify, current_app

    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("X-Inquiry-Token") or request.args.get("token")
        if not token:
            return jsonify({"error": "Inquiry token required"}), 401

        company_id = kwargs.get("company_id")
        if not company_id:
            return jsonify({"error": "Company ID required"}), 400

        from BackEnd.Services.db_service import db_service
        inquiry = db_service.get_ops_inquiry_by_token(int(company_id), token)
        if not inquiry:
            return jsonify({"error": "Invalid or unknown token"}), 401
        if inquiry.get("_expired"):
            return jsonify({"error": "Inquiry link has expired"}), 401

        g.inquiry = inquiry
        g.inquiry_token = token
        return f(*args, **kwargs)
    return decorated

