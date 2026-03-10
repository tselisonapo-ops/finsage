
from BackEnd.Services.credit_policy import normalize_role
from BackEnd.Services.company_context import ASSIGNMENT_ROLES, CORE_ROLES

def validate_role_for_scope(role: str, access_scope: str) -> str:
    norm_role = normalize_role(role)
    scope = (access_scope or "core").strip().lower()

    allowed = ASSIGNMENT_ROLES if scope == "assignment" else CORE_ROLES

    if norm_role not in allowed:
        raise ValueError(f"Role '{norm_role}' is not allowed for access scope '{scope}'")

    return norm_role