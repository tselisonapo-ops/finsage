# BackEnd/Services/company_context.py
from typing import Dict, Any
from BackEnd.Services.industry_profiles import get_industry_profile

def get_company_context(db_service, company_id: int) -> Dict[str, Any]:
    c = db_service.get_company(company_id) or {}

    industry = (c.get("industry") or "").strip()
    sub_industry = (c.get("sub_industry") or "").strip()
    profile = get_industry_profile(industry, sub_industry)

    is_npo = (
        industry.startswith("NPO ")
        or industry in ("Non-Profit Organization", "NPO Education", "NPO IT", "NPO Healthcare")
        or sub_industry.startswith("NPO ")
    )
    template = "npo" if is_npo else "ifrs"

    # ✅ NEW
    acct_settings = db_service.get_company_account_settings(company_id)

    return {
        "company_id": c.get("id"),
        "company_name": c.get("name") or "",
        "industry": industry,
        "sub_industry": sub_industry,
        "currency": c.get("currency") or "ZAR",
        "fin_year_start": c.get("fin_year_start"),
        "template": template,
        "profile": profile,
        "account_settings": acct_settings,  # ✅ add this
    }

def normalize_role(role: str) -> str:
    s = (role or "").strip().lower()
    s2 = s.replace("-", "_").replace(" ", "_").replace("/", "_")

    mapping = {
        # enterprise
        "owner": "owner",
        "business_owner": "owner",
        "business_owner_founder": "owner",
        "founder": "owner",
        "practice_owner": "owner",
        "practice_owner_founding_partner": "owner",
        "founding_partner": "owner",

        "admin": "admin",

        "cfo": "cfo",
        "head_of_finance": "cfo",

        "ceo": "ceo",
        "managing_director": "ceo",

        "senior": "senior",
        "senior_accountant": "senior",

        "manager": "manager",
        "finance_manager": "manager",

        "accountant": "accountant",
        "junior": "accountant",
        "junior_accountant": "accountant",

        "assistant": "clerk",
        "clerk": "clerk",
        "accounts_clerk": "clerk",
        "bookkeeper": "bookkeeper",

        # practitioner
        "audit_staff": "audit_staff",
        "audit_associate": "audit_staff",
        "trainee_auditor": "audit_staff",

        "senior_associate": "senior_associate",
        "audit_senior": "senior_associate",
        "senior_auditor": "senior_associate",

        "audit_manager": "audit_manager",
        "engagement_manager": "audit_manager",

        "audit_partner": "audit_partner",
        "partner": "audit_partner",

        "engagement_partner": "engagement_partner",

        "quality_control_reviewer": "quality_control_reviewer",
        "eqcr": "quality_control_reviewer",
        "engagement_quality_reviewer": "quality_control_reviewer",

        "client_service_manager": "client_service_manager",

        "fs_compiler": "fs_compiler",
        "financial_statement_compiler": "fs_compiler",

        "reviewer": "reviewer",

        "viewer": "viewer",
        "read_only": "viewer",
        "readonly": "viewer",
    }

    return mapping.get(s2, "other")

CORE_ROLES = {
    "owner", "admin", "cfo", "manager", "senior",
    "accountant", "clerk", "viewer"
}

ASSIGNMENT_ROLES = {
    "bookkeeper",
    "fs_compiler",
    "audit_staff",
    "senior_associate",
    "audit_manager",
    "client_service_manager",
    "reviewer",
    "audit_partner",
    "engagement_partner",
    "quality_control_reviewer",
    "viewer",
}

ENTERPRISE_DASHBOARD_ROLES = {
    "owner",
    "admin",
    "cfo",
    "manager",
    "senior",
    "accountant",
    "clerk",
}

PRACTITIONER_DASHBOARD_ROLES = {
    "bookkeeper",
    "audit_staff",
    "senior_associate",
    "audit_manager",
    "audit_partner",
    "engagement_partner",
    "quality_control_reviewer",
    "reviewer",
    "client_service_manager",
    "fs_compiler",
}

# top dogs
DUAL_DASHBOARD_ROLES = {
    "owner",
    "audit_partner",
    "engagement_partner",
    "audit_manager",
    "client_service_manager",
}

def get_dashboard_access(role: str, access_scope: str):
    role = normalize_role(role)
    scope = (access_scope or "core").strip().lower()

    if role in DUAL_DASHBOARD_ROLES:
        return {"enterprise": True, "practitioner": True}

    if scope == "assignment":
        return {
            "enterprise": False,
            "practitioner": role in PRACTITIONER_DASHBOARD_ROLES,
        }

    return {
        "enterprise": role in ENTERPRISE_DASHBOARD_ROLES,
        "practitioner": role in PRACTITIONER_DASHBOARD_ROLES,
    }



ROLE_PERMISSION_PROFILE = {
    # -----------------------------
    # enterprise roles
    # -----------------------------
    "viewer": {
        "can_view_dashboard": True,
        "can_post_journals": False,
        "can_manage_ar": False,
        "can_manage_ap": False,
        "can_manage_banking": False,
        "can_view_reports": False,
        "can_prepare_financials": False,
        "can_manage_fixed_assets": False,
        "can_view_control_room": False,
        "can_approve": False,
        "can_lock_periods": False,
        "can_manage_users": False,
        "can_manage_company_setup": False,
        "can_edit_tax_settings": False,
    },
    "clerk": {
        "can_view_dashboard": True,
        "can_post_journals": True,
        "can_manage_ar": True,
        "can_manage_ap": True,
        "can_manage_banking": True,
        "can_view_reports": False,
        "can_prepare_financials": False,
        "can_manage_fixed_assets": False,
        "can_view_control_room": False,
        "can_approve": False,
        "can_lock_periods": False,
        "can_manage_users": False,
        "can_manage_company_setup": False,
        "can_edit_tax_settings": False,
    },
    
    "accountant": {
        "can_view_dashboard": True,
        "can_post_journals": True,
        "can_manage_ar": True,
        "can_manage_ap": True,
        "can_manage_banking": True,
        "can_view_reports": True,
        "can_prepare_financials": True,
        "can_manage_fixed_assets": True,
        "can_view_control_room": False,
        "can_approve": False,
        "can_lock_periods": False,
        "can_manage_users": False,
        "can_manage_company_setup": False,
        "can_edit_tax_settings": False,
    },
    "senior": {
        "can_view_dashboard": True,
        "can_post_journals": True,
        "can_manage_ar": True,
        "can_manage_ap": True,
        "can_manage_banking": True,
        "can_view_reports": True,
        "can_prepare_financials": True,
        "can_manage_fixed_assets": True,
        "can_view_control_room": True,
        "can_approve": False,
        "can_lock_periods": False,
        "can_manage_users": False,
        "can_manage_company_setup": False,
        "can_edit_tax_settings": False,
    },
    "manager": {
        "can_view_dashboard": True,
        "can_post_journals": True,
        "can_manage_ar": True,
        "can_manage_ap": True,
        "can_manage_banking": True,
        "can_view_reports": True,
        "can_prepare_financials": True,
        "can_manage_fixed_assets": True,
        "can_view_control_room": True,
        "can_approve": True,
        "can_lock_periods": False,
        "can_manage_users": True,
        "can_manage_company_setup": True,
        "can_edit_tax_settings": True,
    },
    "cfo": {
        "can_view_dashboard": True,
        "can_post_journals": True,
        "can_manage_ar": True,
        "can_manage_ap": True,
        "can_manage_banking": True,
        "can_view_reports": True,
        "can_prepare_financials": True,
        "can_manage_fixed_assets": True,
        "can_view_control_room": True,
        "can_approve": True,
        "can_lock_periods": True,
        "can_manage_users": True,
        "can_manage_company_setup": True,
        "can_edit_tax_settings": True,
    },
    "owner": {
        "can_view_dashboard": True,
        "can_post_journals": True,
        "can_manage_ar": True,
        "can_manage_ap": True,
        "can_manage_banking": True,
        "can_view_reports": True,
        "can_prepare_financials": True,
        "can_manage_fixed_assets": True,
        "can_view_control_room": True,
        "can_approve": True,
        "can_lock_periods": True,
        "can_manage_users": True,
        "can_manage_company_setup": True,
        "can_edit_tax_settings": True,
    },
    "admin": {
        "can_view_dashboard": True,
        "can_post_journals": True,
        "can_manage_ar": True,
        "can_manage_ap": True,
        "can_manage_banking": True,
        "can_view_reports": True,
        "can_prepare_financials": True,
        "can_manage_fixed_assets": True,
        "can_view_control_room": True,
        "can_approve": True,
        "can_lock_periods": True,
        "can_manage_users": True,
        "can_manage_company_setup": True,
        "can_edit_tax_settings": True,
    },

    # -----------------------------
    # practitioner roles
    # -----------------------------
    "audit_staff": {
        "can_view_dashboard": True,
        "can_post_journals": False,
        "can_manage_ar": False,
        "can_manage_ap": False,
        "can_manage_banking": False,
        "can_view_reports": True,
        "can_prepare_financials": False,
        "can_manage_fixed_assets": False,
        "can_view_control_room": False,
        "can_approve": False,
        "can_lock_periods": False,
        "can_manage_users": False,
        "can_manage_company_setup": False,
        "can_edit_tax_settings": False,
    },
    "senior_associate": {
        "can_view_dashboard": True,
        "can_post_journals": False,
        "can_manage_ar": False,
        "can_manage_ap": False,
        "can_manage_banking": False,
        "can_view_reports": True,
        "can_prepare_financials": True,
        "can_manage_fixed_assets": True,
        "can_view_control_room": True,
        "can_approve": False,
        "can_lock_periods": False,
        "can_manage_users": False,
        "can_manage_company_setup": False,
        "can_edit_tax_settings": False,
    },
    "reviewer": {
        "can_view_dashboard": True,
        "can_post_journals": False,
        "can_manage_ar": False,
        "can_manage_ap": False,
        "can_manage_banking": False,
        "can_view_reports": True,
        "can_prepare_financials": True,
        "can_manage_fixed_assets": True,
        "can_view_control_room": True,
        "can_approve": False,
        "can_lock_periods": False,
        "can_manage_users": False,
        "can_manage_company_setup": False,
        "can_edit_tax_settings": False,
    },
    "fs_compiler": {
        "can_view_dashboard": True,
        "can_post_journals": False,
        "can_manage_ar": False,
        "can_manage_ap": False,
        "can_manage_banking": False,
        "can_view_reports": True,
        "can_prepare_financials": True,
        "can_manage_fixed_assets": True,
        "can_view_control_room": False,
        "can_approve": False,
        "can_lock_periods": False,
        "can_manage_users": False,
        "can_manage_company_setup": False,
        "can_edit_tax_settings": False,
    },
    "bookkeeper": {
        "can_view_dashboard": True,
        "can_post_journals": True,
        "can_manage_ar": True,
        "can_manage_ap": True,
        "can_manage_banking": False,
        "can_view_reports": True,
        "can_prepare_financials": True,
        "can_manage_fixed_assets": True,
        "can_view_control_room": False,
        "can_approve": False,
        "can_lock_periods": False,
        "can_manage_users": False,
        "can_manage_company_setup": False,
        "can_edit_tax_settings": False,
    },
    "audit_manager": {
        "can_view_dashboard": True,
        "can_post_journals": True,
        "can_manage_ar": True,
        "can_manage_ap": True,
        "can_manage_banking": False,
        "can_view_reports": True,
        "can_prepare_financials": True,
        "can_manage_fixed_assets": True,
        "can_view_control_room": True,
        "can_approve": True,
        "can_lock_periods": False,
        "can_manage_users": False,
        "can_manage_company_setup": False,
        "can_edit_tax_settings": False,
    },
    "client_service_manager": {
        "can_view_dashboard": True,
        "can_post_journals": True,
        "can_manage_ar": True,
        "can_manage_ap": True,
        "can_manage_banking": False,
        "can_view_reports": True,
        "can_prepare_financials": True,
        "can_manage_fixed_assets": True,
        "can_view_control_room": True,
        "can_approve": True,
        "can_lock_periods": False,
        "can_manage_users": False,
        "can_manage_company_setup": False,
        "can_edit_tax_settings": False,
    },
    "audit_partner": {
        "can_view_dashboard": True,
        "can_post_journals": True,
        "can_manage_ar": True,
        "can_manage_ap": True,
        "can_manage_banking": False,
        "can_view_reports": True,
        "can_prepare_financials": True,
        "can_manage_fixed_assets": True,
        "can_view_control_room": True,
        "can_approve": True,
        "can_lock_periods": False,
        "can_manage_users": False,
        "can_manage_company_setup": False,
        "can_edit_tax_settings": False,
    },
    "engagement_partner": {
        "can_view_dashboard": True,
        "can_post_journals": True,
        "can_manage_ar": True,
        "can_manage_ap": True,
        "can_manage_banking": False,
        "can_view_reports": True,
        "can_prepare_financials": True,
        "can_manage_fixed_assets": True,
        "can_view_control_room": True,
        "can_approve": True,
        "can_lock_periods": False,
        "can_manage_users": False,
        "can_manage_company_setup": False,
        "can_edit_tax_settings": False,
    },
    "quality_control_reviewer": {
        "can_view_dashboard": True,
        "can_post_journals": False,
        "can_manage_ar": False,
        "can_manage_ap": False,
        "can_manage_banking": False,
        "can_view_reports": True,
        "can_prepare_financials": True,
        "can_manage_fixed_assets": False,
        "can_view_control_room": True,
        "can_approve": False,
        "can_lock_periods": False,
        "can_manage_users": False,
        "can_manage_company_setup": False,
        "can_edit_tax_settings": False,
    },
}

def build_permissions(*, role: str, access_scope: str) -> dict:
    norm_role = normalize_role(role)
    scope = (access_scope or "core").strip().lower()

    base = ROLE_PERMISSION_PROFILE.get(norm_role, ROLE_PERMISSION_PROFILE["viewer"]).copy()

    base["can_access_enterprise_dashboard"] = (
        norm_role in ENTERPRISE_DASHBOARD_ROLES or norm_role in DUAL_DASHBOARD_ROLES
    )

    base["can_access_practitioner_dashboard"] = (
        norm_role in PRACTITIONER_DASHBOARD_ROLES or norm_role in DUAL_DASHBOARD_ROLES
    )

    # NEW: limited enterprise-style workspace access for practitioner-assigned staff
    base["can_access_delegated_posting_workspace"] = bool(
        scope == "assignment" and (
            base.get("can_post_journals", False) or
            base.get("can_prepare_financials", False)
        )
    )
    # hard restriction for assignment users
    if scope == "assignment":
        base["can_manage_users"] = False
        base["can_manage_company_setup"] = False
        base["can_edit_tax_settings"] = False
        base["can_lock_periods"] = False
        base["can_manage_banking"] = False

    return base

def resolve_default_dashboard(*, user_type: str, role: str, access_scope: str) -> str | None:
    norm_role = normalize_role(role)
    scope = (access_scope or "core").strip().lower()
    dashboards = get_dashboard_access(norm_role, scope)

    # no dashboard at all
    if not dashboards["enterprise"] and not dashboards["practitioner"]:
        return None

    # dual roles keep both, but choose enterprise as default for core/internal
    if dashboards["enterprise"] and dashboards["practitioner"]:
        return "enterprise" if scope == "core" else "practitioner"

    if dashboards["enterprise"]:
        return "enterprise"

    if dashboards["practitioner"]:
        return "practitioner"

    return None

