



def normalize_role(u: dict) -> str:
    return (u.get("system_role") or u.get("user_role") or u.get("role") or "viewer").strip().lower()

def role_rank(role: str) -> int:
    order = ["viewer","clerk","assistant","junior","senior","accountant","manager","credit controller","cfo","owner","admin"]
    r = (role or "viewer").strip().lower()
    return order.index(r) if r in order else 0

def is_at_least(user: dict, min_role: str) -> bool:
    return role_rank(normalize_role(user)) >= role_rank(min_role)

def can_create_quote(user: dict, company_profile: dict) -> bool:
    policy = company_profile.get("credit_policy") or {}
    mode = (policy.get("mode") or "owner_managed").strip().lower()

    if mode == "owner_managed":
        return is_at_least(user, "clerk")

    # assisted / controlled
    return is_at_least(user, "assistant")

def can_issue_quote(user: dict, company_profile: dict) -> bool:
    role = normalize_role(user)

    policy = (company_profile or {}).get("credit_policy") or {}
    mode = str(policy.get("mode") or "").strip().lower() or "owner_managed"

    owner_user_id = company_profile.get("owner_user_id")
    is_owner = owner_user_id is not None and str(owner_user_id) == str(user.get("id"))

    if mode == "owner_managed":
        return is_at_least(user, "assistant")

    if mode == "assisted":
        return is_owner or role in {"senior", "accountant", "manager", "cfo", "admin"}

    # controlled
    return is_owner or role in {"manager", "cfo", "admin"}


def can_accept_quote(user: dict, company_profile: dict) -> bool:
    role = (user.get("user_role") or user.get("role") or user.get("system_role") or "").lower()

    policy = company_profile.get("credit_policy") or {}
    mode = (policy.get("mode") or "owner_managed").strip().lower()

    # owner-managed: anyone can accept
    if mode == "owner_managed":
        return True

    # assisted / controlled
    return role in {"senior", "accountant", "manager", "cfo", "admin"}

