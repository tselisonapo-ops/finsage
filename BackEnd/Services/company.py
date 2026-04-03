from BackEnd.Services.db_service import db_service
from BackEnd.Services.credit_policy import normalize_policy, normalize_policy_mode, is_assignment_execution_context


def company_policy(company_id: int) -> dict:
    company = db_service.get_company_profile(company_id) or {}

    # 1) normalize shape + aliases
    raw = company.get("credit_policy") or {}
    policy = normalize_policy(raw)

    # 2) normalize mode (always one of owner_managed/assisted/controlled)
    mode = normalize_policy_mode(policy)
    policy["mode"] = mode

    # 3) apply mode defaults (enforce assisted/controlled intent)
    policy, warnings = apply_mode_defaults(policy)
    mode = policy["mode"]  # in case apply_mode_defaults adjusts it

    # 4) compute effective flags using canonical + aliases
    review_enabled = bool(
        policy.get("review_enabled")
        or policy.get("invoice_review_enabled")
        or policy.get("require_invoice_review")
    )

    ap_review_enabled = bool(
        policy.get("ap_review_enabled")
        or policy.get("bill_review_enabled")
        or policy.get("require_bill_review")
    )

    ap_auto_post = bool(policy.get("ap_auto_post", False))

    require_customer_approval = bool(policy.get("require_customer_approval", False))

    payment_workflow_enabled = bool(policy.get("payment_workflow_enabled", False))
    require_payment_approval = bool(policy.get("require_payment_approval", False))

    require_quote_issue_review = bool(policy.get("require_quote_issue_review", False))
    require_quote_accept_review = bool(policy.get("require_quote_accept_review", False))

    require_kyc = bool(policy.get("require_kyc", False))
    require_vendor_kyc_on_release = bool(policy.get("require_vendor_kyc_on_release", False))

    loan_review_enabled = bool(
        (policy.get("loans") or {}).get("review_enabled")
        or policy.get("loan_review_enabled")
        or policy.get("require_loan_review")
    )

    require_loan_create_review = bool(
        (policy.get("loans") or {}).get("require_create_review")
        or policy.get("require_loan_create_review")
    )

    require_loan_payment_review = bool(
        (policy.get("loans") or {}).get("require_payment_review")
        or policy.get("require_loan_payment_review")
        or policy.get("payment_workflow_enabled")
        or policy.get("require_payment_approval")
    )
    return {
        "mode": mode,

        # AR/AP effective flags
        "review_enabled": review_enabled,
        "ap_review_enabled": ap_review_enabled,
        "ap_auto_post": ap_auto_post,

        # approvals
        "require_customer_approval": require_customer_approval,
        "payment_workflow_enabled": payment_workflow_enabled,
        "require_payment_approval": require_payment_approval,

        "require_quote_issue_review": require_quote_issue_review,
        "require_quote_accept_review": require_quote_accept_review,

        # KYC
        "require_kyc": require_kyc,
        "require_vendor_kyc_on_release": require_vendor_kyc_on_release,

        "loan_review_enabled": loan_review_enabled,
        "require_loan_create_review": require_loan_create_review,
        "require_loan_payment_review": require_loan_payment_review,

        # diagnostics
        "_warnings": warnings,

        # raw objects
        "company": company,
        "policy": policy,
    }


def apply_mode_defaults(
    policy: dict,
    *,
    supplied_top: set[str] | None = None,
    supplied_ppe: set[str] | None = None,
    supplied_leases: set[str] | None = None,
) -> tuple[dict, list[str]]:
    """
    Enforce safe defaults based on policy['mode'].

    - owner_managed: never force workflow
    - assisted: default workflow ON unless user explicitly chose (review_choice_made) or explicitly supplied review_enabled
    - controlled: workflow ALWAYS ON (separation of duties)

    When workflow ON -> enable module review gates (AR/AP/Quotes/PPE/Leases).
    Do NOT auto-enable KYC/compliance flags.
    """
    p = normalize_policy(policy or {})
    warnings: list[str] = []

    supplied_top = set(supplied_top or ())
    supplied_ppe = set(supplied_ppe or ())
    supplied_leases = set(supplied_leases or ())

    mode = normalize_policy_mode(p)
    p["mode"] = mode

    # Nested blocks (ensure dicts)
    ppe = p.get("ppe") if isinstance(p.get("ppe"), dict) else {}
    leases = p.get("leases") if isinstance(p.get("leases"), dict) else {}

    # ----------------------------
    # 1) Decide whether workflow review should be ON
    # ----------------------------
    review_choice_made = bool(p.get("review_choice_made", False))

    if mode == "owner_managed":
        workflow_on = bool(p.get("review_enabled", False))

    elif mode == "assisted":
        if "review_enabled" in supplied_top:
            workflow_on = bool(p.get("review_enabled", False))
            # mark as decided if they explicitly set it
            p["review_choice_made"] = True
        else:
            # default ON for safety unless they already made a choice previously
            if review_choice_made:
                workflow_on = bool(p.get("review_enabled", False))
            else:
                workflow_on = True
                p["review_enabled"] = True
                # still not "decided" until banner choice sets it
                # (banner sets review_choice_made=true)
                warnings.append("Assisted mode defaulted review workflow ON (no prior choice).")

    else:  # controlled
        if not bool(p.get("review_enabled", False)):
            warnings.append("Controlled mode enforces review workflow: review_enabled forced to true.")
        workflow_on = True
        p["review_enabled"] = True
        p["review_choice_made"] = True  # controlled = always decided

    # Keep AR canonical + legacy aligned
    p["invoice_review_enabled"] = bool(p["review_enabled"])
    p["require_invoice_review"] = bool(p["review_enabled"])

    # ----------------------------
    # 2) Apply module defaults when workflow is ON
    # ----------------------------
    if workflow_on:
        # --- AR gates ---
        if "require_customer_approval" not in supplied_top:
            p["require_customer_approval"] = True

        if "require_quote_issue_review" not in supplied_top:
            p["require_quote_issue_review"] = True
        if "require_quote_accept_review" not in supplied_top:
            p["require_quote_accept_review"] = True

        # --- AP gates ---
        if mode == "controlled":
            # controlled must not allow AP relaxed workflow
            if bool(p.get("ap_review_enabled")) is False:
                warnings.append("Controlled mode enforces AP review: ap_review_enabled forced to true.")
            p["ap_review_enabled"] = True
        else:
            if "ap_review_enabled" not in supplied_top:
                p["ap_review_enabled"] = True

        # Controlled: safest is prevent AP auto-post unless explicitly enabled
        if mode == "controlled" and "ap_auto_post" not in supplied_top:
            p["ap_auto_post"] = False

        # Keep AP legacy aligned
        p["bill_review_enabled"] = bool(p["ap_review_enabled"])
        p["require_bill_review"] = bool(p["ap_review_enabled"])

        # --- PPE ---
        if mode == "controlled":
            ppe["review_enabled"] = True
        else:
            if "review_enabled" not in supplied_ppe:
                ppe["review_enabled"] = True

        # --- Leases ---
        if mode == "controlled":
            leases["review_enabled"] = True
        else:
            if "review_enabled" not in supplied_leases:
                leases["review_enabled"] = True

        for k in (
            "require_lease_create_review",
            "require_monthly_posting_review",
            "require_payment_review",
            "require_modification_review",
            "require_termination_review",
        ):
            if mode == "controlled":
                leases[k] = True
            else:
                if k not in supplied_leases:
                    leases[k] = True

    # Reattach nested blocks
    p["ppe"] = ppe
    p["leases"] = leases

    # Final AP legacy sync
    p["bill_review_enabled"] = bool(p.get("ap_review_enabled", False))
    p["require_bill_review"] = bool(p.get("ap_review_enabled", False))

    return p, warnings

def ap_review_required(company_id: int, user: dict | None = None) -> bool:
    user = user or {}
    if is_assignment_execution_context(user):
        return False

    cp = company_policy(company_id) or {}
    mode = (cp.get("mode") or "owner_managed").strip().lower()
    policy = cp.get("policy") or {}

    ap_review_enabled = bool(policy.get("ap_review_enabled", False))

    if mode == "owner_managed":
        return False
    if mode == "assisted":
        return ap_review_enabled
    if mode == "controlled":
        return True
    return True

def recommend_mode_after_invite(company_profile: dict, invited_role: str) -> str | None:
    cp = company_profile.get("credit_policy") or {}
    mode = normalize_policy_mode(cp)
    invited_role = (invited_role or "").strip().lower()

    # Ignore viewer invites
    if invited_role == "viewer":
        return None

    # If owner-managed and adding a non-owner staff member -> recommend assisted
    if mode == "owner_managed":
        return "assisted"
    return None

