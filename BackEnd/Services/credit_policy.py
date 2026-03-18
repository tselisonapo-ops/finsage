from BackEnd.Services.company_context import normalize_role
from flask import jsonify
import sys
from typing import Optional

if sys.version_info >= (3, 10):
    UserType = dict | None
else:
    UserType = Optional[dict]

def user_role(user: dict) -> str:
    return normalize_role(user.get("user_role") or user.get("role") or user.get("system_role") or "")

def normalize_policy(policy: dict) -> dict:
    """
    Normalize credit_policy into a consistent, backward-compatible shape.

    Key goals:
    - Resolve AR/AP aliases FIRST (before defaults overwrite intent).
    - Apply defaults ONCE.
    - Keep canonical + legacy keys in sync.
    - For nested blocks (leases/ppe), only "bridge" legacy top-level keys into nested
      if nested keys were NOT explicitly supplied by the caller.
    """
    p = dict(policy or {})
    p_in = set(p.keys())  # keys explicitly supplied at top-level

    # -------------------------
    # Aliases FIRST (before defaults)
    # -------------------------
    # AR master review: derive review_enabled if missing
    if "review_enabled" not in p_in:
        if "invoice_review_enabled" in p_in:
            p["review_enabled"] = bool(p.get("invoice_review_enabled"))
        elif "require_invoice_review" in p_in:
            p["review_enabled"] = bool(p.get("require_invoice_review"))

    # AP master review: derive ap_review_enabled if missing
    if "ap_review_enabled" not in p_in:
        if "bill_review_enabled" in p_in:
            p["ap_review_enabled"] = bool(p.get("bill_review_enabled"))
        elif "require_bill_review" in p_in:
            p["ap_review_enabled"] = bool(p.get("require_bill_review"))

    # -------------------------
    # Defaults (ONCE)
    # -------------------------
    p.setdefault("mode", "owner_managed")

    p.setdefault("review_choice_made", False)
    p.setdefault("review_enabled", False)
    p.setdefault("ap_review_enabled", False)
    p.setdefault("ap_auto_post", False)

    p.setdefault("payment_workflow_enabled", False)
    p.setdefault("require_payment_approval", False)

    p.setdefault("require_customer_approval", False)
    p.setdefault("require_kyc", False)
    p.setdefault("require_vendor_kyc_on_release", False)

    # Quotes approvals (AR)
    p.setdefault("require_quote_issue_review", False)
    p.setdefault("require_quote_accept_review", False)

    # -------------------------
    # Keep canonical + legacy in sync (always)
    # -------------------------
    p["invoice_review_enabled"] = bool(p.get("review_enabled"))
    p["require_invoice_review"] = bool(p.get("review_enabled"))

    p["bill_review_enabled"] = bool(p.get("ap_review_enabled"))
    p["require_bill_review"] = bool(p.get("ap_review_enabled"))

    # -------------------------
    # PPE policy block
    # -------------------------
    ppe = p.get("ppe") if isinstance(p.get("ppe"), dict) else {}
    ppe_in = set(ppe.keys())  # keys explicitly supplied in ppe block

    ppe.setdefault("review_enabled", False)

    ppe.setdefault("require_asset_master_review", False)
    ppe.setdefault("require_depreciation_review", False)

    # conservative defaults
    ppe.setdefault("require_disposal_review", True)
    ppe.setdefault("require_impairment_review", True)
    ppe.setdefault("require_revaluation_review", True)
    ppe.setdefault("require_hfs_review", True)

    ppe.setdefault("require_transfers_review", False)
    ppe.setdefault("usage_requires_approval", False)

    # legacy mirror (kept for compatibility)
    ppe.setdefault("require_ppe_review", bool(ppe.get("review_enabled", False)))
    p["ppe"] = ppe

    # -------------------------
    # LEASES policy block (IFRS 16) + alias bridge
    # -------------------------
    leases = p.get("leases") if isinstance(p.get("leases"), dict) else {}
    leases_in = set(leases.keys())  # keys explicitly supplied in leases block

    # master switch default
    leases.setdefault("review_enabled", False)

    # canonical granular defaults (your conservative stance)
    leases.setdefault("require_lease_create_review", False)
    leases.setdefault("require_monthly_posting_review", True)
    leases.setdefault("require_payment_review", True)
    leases.setdefault("require_modification_review", True)
    leases.setdefault("require_termination_review", True)

    # behaviour knobs
    leases.setdefault("auto_post_monthly_when_review_off", True)
    leases.setdefault("auto_post_payments_when_review_off", True)

    # --- bridge master legacy -> nested (ONLY if nested not explicitly supplied) ---
    if "lease_review_enabled" in p_in and "review_enabled" not in leases_in:
        leases["review_enabled"] = bool(p.get("lease_review_enabled"))
    if "require_lease_review" in p_in and "review_enabled" not in leases_in:
        leases["review_enabled"] = bool(p.get("require_lease_review"))

    # --- bridge granular legacy -> canonical ---
    # NOTE: because we set canonical defaults above, "not in leases" would never hit.
    # So we only bridge if canonical key was NOT explicitly supplied in leases_in.
    if "require_monthly_posting_review" not in leases_in:
        if "require_lease_monthly_review" in leases_in:
            leases["require_monthly_posting_review"] = bool(leases.get("require_lease_monthly_review"))
        elif "require_lease_monthly_review" in p_in:
            leases["require_monthly_posting_review"] = bool(p.get("require_lease_monthly_review"))

    if "require_payment_review" not in leases_in:
        if "require_lease_payment_review" in leases_in:
            leases["require_payment_review"] = bool(leases.get("require_lease_payment_review"))
        elif "require_lease_payment_review" in p_in:
            leases["require_payment_review"] = bool(p.get("require_lease_payment_review"))

    if "require_modification_review" not in leases_in:
        if "require_lease_modification_review" in leases_in:
            leases["require_modification_review"] = bool(leases.get("require_lease_modification_review"))
        elif "require_lease_modification_review" in p_in:
            leases["require_modification_review"] = bool(p.get("require_lease_modification_review"))

    if "require_termination_review" not in leases_in:
        if "require_lease_termination_review" in leases_in:
            leases["require_termination_review"] = bool(leases.get("require_lease_termination_review"))
        elif "require_lease_termination_review" in p_in:
            leases["require_termination_review"] = bool(p.get("require_lease_termination_review"))

    # --- synthesize legacy keys so older UIs still see something consistent ---
    p.setdefault("lease_review_enabled", bool(leases.get("review_enabled", False)))
    p.setdefault("require_lease_review", bool(leases.get("review_enabled", False)))

    # top-level legacy granular mirrors (for older frontends)
    p.setdefault("require_lease_monthly_review", bool(leases.get("require_monthly_posting_review", True)))
    p.setdefault("require_lease_payment_review", bool(leases.get("require_payment_review", True)))
    p.setdefault("require_lease_modification_review", bool(leases.get("require_modification_review", True)))
    p.setdefault("require_lease_termination_review", bool(leases.get("require_termination_review", True)))

    # nested legacy granular mirrors (so payloads like yours remain internally consistent)
    leases.setdefault("require_lease_monthly_review", bool(leases.get("require_monthly_posting_review", True)))
    leases.setdefault("require_lease_payment_review", bool(leases.get("require_payment_review", True)))
    leases.setdefault("require_lease_modification_review", bool(leases.get("require_modification_review", True)))
    leases.setdefault("require_lease_termination_review", bool(leases.get("require_termination_review", True)))

    p["leases"] = leases
    return p

def is_company_owner(user: dict, company_profile: dict) -> bool:
    owner_user_id = (company_profile or {}).get("owner_user_id")
    return owner_user_id is not None and str(owner_user_id) == str(user.get("id"))

def normalize_policy_mode(policy) -> str:
    # Accept: "controlled" OR {"mode": "..."} OR full company_policy dict
    if isinstance(policy, str):
        m = policy.strip().lower()
    elif isinstance(policy, dict):
        m = str(policy.get("mode") or "owner_managed").strip().lower()
    else:
        m = "owner_managed"

    m = m.replace("-", "_").replace(" ", "_")

    if m in ("", "single", "owner", "owner_managed", "owner_managed_mode"):
        return "owner_managed"
    if m in ("assisted", "controlled"):
        return m
    return "owner_managed"

def company_role(user: dict) -> str:
    """
    Membership role from public.company_users.role.
    Middleware should set user["user_role"], but we fallback safely.
    """
    return str(user.get("user_role") or user.get("company_role") or "").strip().lower() or "other"

def is_company_owner(user: dict, company_profile: dict) -> bool:
    owner_user_id = (company_profile or {}).get("owner_user_id")
    return owner_user_id is not None and str(owner_user_id) == str(user.get("id"))


def customer_approval_required(mode: str, policy: dict, user: Optional[dict] = None) -> bool:
    user = user or {}
    if is_assignment_execution_context(user):
        return False

    mode = normalize_policy_mode(mode)
    p = policy or {}

    if mode == "owner_managed":
        return False

    return bool(
        p.get("review_enabled", False) or
        p.get("invoice_review_enabled", False) or
        p.get("require_invoice_review", False) or
        p.get("require_customer_approval", False)
    )


def must_approve_customer_before_invoicing(mode: str, policy: dict) -> bool:
    # ✅ tie invoicing permission to customer approval gate
    return customer_approval_required(mode, policy)

from typing import Optional

def invoice_review_required(mode: str, policy: dict, user: Optional[dict] = None) -> bool:
    user = user or {}
    if is_assignment_execution_context(user):
        return False

    mode = normalize_policy_mode(mode)
    p = policy or {}

    if mode == "owner_managed":
        return False

    return bool(
        p.get("review_enabled", False) or
        p.get("require_customer_approval", False)
    )


def must_approve_customer_before_invoicing(mode: str, policy: dict) -> bool:
    return invoice_review_required(mode, policy)

def can_post_invoices(user: dict, company_profile: dict, mode: str) -> bool:
    if is_assignment_execution_context(user):
        return True

    mode = normalize_policy_mode(mode)
    if mode == "owner_managed":
        return True

    role = company_role(user)
    return is_company_owner(user, company_profile) or role in {"senior", "cfo", "admin", "manager"}

def should_auto_post_invoice(mode: str, policy: dict) -> bool:
    """
    Auto-post invoice when review is NOT required.
    """
    mode = normalize_policy_mode(mode)
    return not invoice_review_required(mode, policy)

def should_auto_post_bill(mode: str, policy: dict) -> bool:
    """
    Bills:
    - owner_managed: auto-post unless AP review enabled
    - assisted/controlled: only auto-post if explicitly enabled via ap_auto_post
    """
    mode = normalize_policy_mode(mode)
    p = policy or {}

    if mode == "owner_managed":
        return not bool(p.get("ap_review_enabled", False))

    return bool(p.get("ap_auto_post", False))

def can_post_bills(user: dict, company_profile: dict, mode: str) -> bool:
    if is_assignment_execution_context(user):
        return True

    mode = normalize_policy_mode(mode)
    if mode == "owner_managed":
        return True

    role = company_role(user)
    return is_company_owner(user, company_profile) or role in {"senior", "cfo", "admin", "manager"}


def can_prepare_payment(user: dict, company_profile: dict, mode: str) -> bool:
    if is_assignment_execution_context(user):
        return True

    mode = normalize_policy_mode(mode)
    if mode == "owner_managed":
        return True

    role = company_role(user)
    return is_company_owner(user, company_profile) or role in {"accountant", "manager", "senior", "cfo", "admin"}

def can_approve_payment(user: dict, company_profile: dict, mode: str) -> bool:
    if is_assignment_execution_context(user):
        role = normalize_role(user.get("user_role") or user.get("role") or user.get("system_role") or "")
        return role in {
            "reviewer",
            "audit_manager",
            "client_service_manager",
            "engagement_partner",
            "quality_control_reviewer",
            "owner",
            "admin",
        }

    mode = normalize_policy_mode(mode)
    if mode == "owner_managed":
        return True

    role = company_role(user)

    if mode == "assisted":
        return is_company_owner(user, company_profile) or role in {"cfo", "admin"}

    return is_company_owner(user, company_profile) or role in {"cfo", "admin"}

def can_release_payment(user: dict, company_profile: dict, mode: str) -> bool:
    if is_assignment_execution_context(user):
        role = normalize_role(user.get("user_role") or user.get("role") or user.get("system_role") or "")
        return role in {
            "reviewer",
            "audit_manager",
            "client_service_manager",
            "engagement_partner",
            "quality_control_reviewer",
            "owner",
            "admin",
        }

    mode = (normalize_policy_mode(mode) or "").strip().lower()

    if mode == "owner_managed":
        return True

    role = (company_role(user) or "").strip().lower()
    return is_company_owner(user, company_profile) or role in {"cfo", "admin"}

def can_decide_approvals(user: dict, company_profile: dict, mode: str) -> bool:
    if is_assignment_execution_context(user):
        role = normalize_role(user.get("user_role") or user.get("role") or user.get("system_role") or "")
        return role in {
            "reviewer",
            "audit_manager",
            "client_service_manager",
            "engagement_partner",
            "quality_control_reviewer",
            "owner",
            "admin",
        }

    mode = normalize_policy_mode(mode)
    role = company_role(user)

    if mode == "owner_managed":
        return is_company_owner(user, company_profile) or role in {"admin", "cfo", "manager", "senior"}

    return is_company_owner(user, company_profile) or role in {"admin", "cfo"}

def _can_view_engagements(user: dict) -> bool:
    if not user:
        return False

    if is_assignment_execution_context(user):
        return True

    role = normalize_role(
        user.get("assignment_role")
        or user.get("user_role")
        or user.get("role")
        or user.get("system_role")
        or ""
    )

    return role in {
        "owner",
        "admin",
        "manager",
        "senior",
        "reviewer",
        "audit_manager",
        "client_service_manager",
        "engagement_partner",
        "quality_control_reviewer",
        "accountant",
        "bookkeeper",
    }

def can_decide_request(user: dict, company_profile: dict, mode: str, module: str, action: str) -> bool:
    module = str(module or "").strip().lower()
    action = str(action or "").strip().lower()

    # ✅ mode already normalized by company_policy()
    mode = str(mode or "owner_managed").strip().lower()
    if mode not in {"owner_managed", "assisted", "controlled"}:
        mode = "owner_managed"

    # ✅ AR: customer approval
    if module == "ar" and action == "approve_customer":
        role = (user.get("user_role") or user.get("role") or "").strip().lower()
        owner_id = company_profile.get("owner_user_id")
        is_owner = owner_id is not None and str(owner_id) == str(user.get("id"))

        if mode in {"owner_managed", "assisted"}:
            return is_owner or role in {"owner", "admin"}

        # controlled
        return is_owner or role in {"owner", "admin", "cfo", "manager"}

    # existing rules...
    if module == "ap" and action in {"approve_payment", "release_payment"}:
        return can_approve_payment(user, company_profile, mode)

    if module == "ar" and action in {"post_invoice"}:
        return can_post_invoices(user, company_profile, mode)

    if module == "ppe" and action in {"approve_disposal","approve_impairment","approve_revaluation","approve_hfs","approve_transfer","approve_depreciation"}:
        return can_approve_ppe(user, company_profile, mode)

    if module == "gl" and action in {"reverse_journal"}:
        return can_decide_approvals(user, company_profile, mode)

    return can_decide_approvals(user, company_profile, mode)

def _bool(x) -> bool:
    return bool(x is True) or (isinstance(x, (int, float)) and x != 0)

def _lease_flag(policy: dict, leases: dict, canonical: str, legacy: str, top_level: str | None = None, default: bool = False) -> bool:
    """
    Read a lease flag with alias support.
    Precedence:
      1) leases[canonical] if present
      2) leases[legacy] if present
      3) policy[top_level] if provided & present
      4) policy[legacy] (some payloads keep legacy keys top-level too)
      5) default
    """
    if isinstance(leases, dict):
        if canonical in leases:
            return _bool(leases.get(canonical))
        if legacy in leases:
            return _bool(leases.get(legacy))

    if isinstance(policy, dict):
        if top_level and top_level in policy:
            return _bool(policy.get(top_level))
        if legacy in policy:
            return _bool(policy.get(legacy))

    return bool(default)

def can_post_leases(user: dict, company_profile: dict, mode: str) -> bool:
    if is_assignment_execution_context(user):
        return True

    role = (user.get("user_role") or user.get("role") or user.get("system_role") or "").lower()
    owner_user_id = company_profile.get("owner_user_id")
    is_owner = owner_user_id is not None and str(owner_user_id) == str(user.get("id"))

    mode = (mode or "owner_managed").strip().lower()
    if mode in {"single", "owner_managed"}:
        return True
    return is_owner or role in {"senior", "cfo", "admin"}

def can_release_funds(user: dict, company_profile: dict) -> bool:
    r = company_role(user)
    owner_user_id = company_profile.get("owner_user_id")
    is_owner = owner_user_id is not None and str(owner_user_id) == str(user.get("id"))
    return is_owner or r in {"cfo", "admin"} 

def lease_review_enabled(pol: dict, user: dict | None = None) -> bool:
    user = user or {}
    if is_assignment_execution_context(user):
        return False

    policy = (pol or {}).get("policy") or {}
    if not isinstance(policy, dict):
        return False

    leases = policy.get("leases") if isinstance(policy.get("leases"), dict) else {}

    master = bool(
        _bool(leases.get("review_enabled")) or
        _bool(policy.get("lease_review_enabled")) or
        _bool(policy.get("require_lease_review"))
    )

    if master:
        return True

    granular = bool(
        _lease_flag(policy, leases, "require_lease_create_review", "require_lease_create_review", "require_lease_create_review", default=False) or
        _lease_flag(policy, leases, "require_monthly_posting_review", "require_lease_monthly_review", "require_lease_monthly_review", default=False) or
        _lease_flag(policy, leases, "require_payment_review", "require_lease_payment_review", "require_lease_payment_review", default=False) or
        _lease_flag(policy, leases, "require_modification_review", "require_lease_modification_review", "require_lease_modification_review", default=False) or
        _lease_flag(policy, leases, "require_termination_review", "require_lease_termination_review", "require_lease_termination_review", default=False)
    )

    return granular

def lease_action_review_required(pol: dict, action: str, user: dict | None = None) -> bool:
    user = user or {}
    if is_assignment_execution_context(user):
        return False

    policy = (pol or {}).get("policy") or {}
    if not isinstance(policy, dict):
        return False

    leases = policy.get("leases") if isinstance(policy.get("leases"), dict) else {}

    master = bool(
        _bool(leases.get("review_enabled")) or
        _bool(policy.get("lease_review_enabled")) or
        _bool(policy.get("require_lease_review"))
    )
    if master:
        return True

    action = (action or "").strip().lower()

    if action == "create":
        return _lease_flag(policy, leases, "require_lease_create_review", "require_lease_create_review", "require_lease_create_review", default=False)
    if action == "monthly":
        return _lease_flag(policy, leases, "require_monthly_posting_review", "require_lease_monthly_review", "require_lease_monthly_review", default=False)
    if action == "payment":
        return _lease_flag(policy, leases, "require_payment_review", "require_lease_payment_review", "require_lease_payment_review", default=False)
    if action == "modification":
        return _lease_flag(policy, leases, "require_modification_review", "require_lease_modification_review", "require_lease_modification_review", default=False)
    if action == "termination":
        return _lease_flag(policy, leases, "require_termination_review", "require_lease_termination_review", "require_lease_termination_review", default=False)

    return False

def lease_policy_flags(pol: dict) -> dict:
    policy = (pol or {}).get("policy") or {}
    leases = policy.get("leases") if isinstance(policy.get("leases"), dict) else {}

    review_on = lease_review_enabled(pol)

    # NOTE: keep your "conservative defaults" here if you want them ON by default
    # (these defaults only matter if key absent in BOTH canonical + legacy places)
    monthly_default = True
    payment_default = True
    mod_default = True
    term_default = True

    return {
        "review_on": bool(review_on),

        "create_review": _lease_flag(policy, leases,
            canonical="require_lease_create_review",
            legacy="require_lease_create_review",
            top_level="require_lease_create_review",
            default=False
        ),

        "monthly_review": _lease_flag(policy, leases,
            canonical="require_monthly_posting_review",
            legacy="require_lease_monthly_review",
            top_level="require_lease_monthly_review",
            default=monthly_default
        ),

        "payment_review": _lease_flag(policy, leases,
            canonical="require_payment_review",
            legacy="require_lease_payment_review",
            top_level="require_lease_payment_review",
            default=payment_default
        ),

        "mod_review": _lease_flag(policy, leases,
            canonical="require_modification_review",
            legacy="require_lease_modification_review",
            top_level="require_lease_modification_review",
            default=mod_default
        ),

        "term_review": _lease_flag(policy, leases,
            canonical="require_termination_review",
            legacy="require_lease_termination_review",
            top_level="require_lease_termination_review",
            default=term_default
        ),

        "auto_post_monthly_when_review_off": bool(leases.get("auto_post_monthly_when_review_off", True)),
        "auto_post_payments_when_review_off": bool(leases.get("auto_post_payments_when_review_off", True)),
    }


def ppe_review_required(mode: str, policy: dict, action: str, user: dict | None = None) -> bool:
    user = user or {}
    if is_assignment_execution_context(user):
        return False

    mode = normalize_policy_mode(mode)
    p = policy or {}
    ppe = p.get("ppe") if isinstance(p.get("ppe"), dict) else {}

    global_review = bool(ppe.get("review_enabled", False))

    action_flag_map = {
        "create_asset": bool(ppe.get("require_asset_master_review", False)),
        "edit_asset": bool(ppe.get("require_asset_master_review", False)),
        "post_depreciation": bool(ppe.get("require_depreciation_review", False)),
        "post_disposal": bool(ppe.get("require_disposal_review", True)),
        "post_impairment": bool(ppe.get("require_impairment_review", True)),
        "post_revaluation": bool(ppe.get("require_revaluation_review", True)),
        "classify_hfs": bool(ppe.get("require_hfs_review", True)),
        "post_transfer": bool(ppe.get("require_transfers_review", False)),
        "create_usage": bool(ppe.get("usage_requires_approval", False)),
    }

    action_key = str(action or "").strip().lower()
    needs = action_flag_map.get(action_key, global_review)

    if mode == "owner_managed":
        return bool(needs)

    return bool(global_review or needs)

def _require_approve_post_if_review(*, mode: str, policy: dict, action: str):
    """
    Returns (True, response) if caller must use /approve-post instead of /post.
    Else returns (False, None).
    """
    if ppe_review_required(mode, policy, action):
        return True, (
            jsonify({
                "ok": False,
                "error": "Review required. Use approve-post endpoint.",
                "requires_review": True,
                "next_action": "approve_post",
                "approve_post_endpoint": "approve-post",
                "action": action,
            }),
            409
        )
    return False, None

def can_post_ppe(user: dict, company_profile: dict, mode: str) -> bool:
    if is_assignment_execution_context(user):
        return True

    mode = normalize_policy_mode(mode)
    if mode == "owner_managed":
        return True

    role = company_role(user)
    return is_company_owner(user, company_profile) or role in {"senior", "cfo", "admin", "manager"}

def can_decide_ppe_approvals(user: dict, company_profile: dict, mode: str) -> bool:
    # keep consistent with your generic approval decision permission
    return can_decide_approvals(user, company_profile, mode)

def can_post_ppe(user: dict, company_profile: dict, mode: str) -> bool:
    mode = normalize_policy_mode(mode)
    if mode == "owner_managed":
        return True

    role = company_role(user)
    return is_company_owner(user, company_profile) or role in {"senior", "cfo", "admin", "manager"}


def can_approve_ppe(user: dict, company_profile: dict, mode: str) -> bool:
    if is_assignment_execution_context(user):
        role = normalize_role(user.get("user_role") or user.get("role") or user.get("system_role") or "")
        return role in {
            "reviewer",
            "audit_manager",
            "client_service_manager",
            "engagement_partner",
            "quality_control_reviewer",
            "owner",
            "admin",
        }

    mode = normalize_policy_mode(mode)
    role = company_role(user)

    if mode == "owner_managed":
        return is_company_owner(user, company_profile) or role in {"admin", "cfo", "manager", "senior"}

    return is_company_owner(user, company_profile) or role in {"admin", "cfo"}

def user_access_scope(user: dict) -> str:
    return str(
        user.get("access_scope")
        or user.get("scope")
        or user.get("user_scope")
        or ""
    ).strip().lower() or "core"


def is_assignment_scope(user: dict) -> bool:
    return user_access_scope(user) == "assignment"


def is_engagement_execution_role(user: dict) -> bool:
    role = normalize_role(
        user.get("user_role") or user.get("role") or user.get("system_role") or ""
    )
    return role in {
        "bookkeeper",
        "fs_compiler",
        "tax_preparer",
        "accounting_trainee",
        "audit_trainee",
        "audit_staff",
        "senior_associate",
        "reviewer",
        "audit_manager",
        "client_service_manager",
        "engagement_partner",
        "quality_control_reviewer",
        "owner",
        "admin",
    }


def is_assignment_execution_context(user: dict) -> bool:
    return is_assignment_scope(user) and is_engagement_execution_role(user)