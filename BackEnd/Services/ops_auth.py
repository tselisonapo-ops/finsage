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