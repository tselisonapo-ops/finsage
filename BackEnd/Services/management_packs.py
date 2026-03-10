from flask import Blueprint, jsonify, g
from BackEnd.Services.auth_middleware import require_auth, request
from BackEnd.Services.db_service import db_service

bp_companies_management_packs = Blueprint("companies_management_packs", __name__)

STATUS_READY = "READY"
STATUS_NEEDS = "NEEDS_SETUP"
STATUS_BLOCKED = "BLOCKED"
STATUS_OPTIONAL = "OPTIONAL"

def _is_blank(v) -> bool:
    return v is None or str(v).strip() == ""

def _missing(label: str, key: str, fix_screen: str | None = None):
    out = {"label": label, "key": key}
    if fix_screen:
        out["fix_screen"] = fix_screen
    return out

def _deny_if_wrong_company(payload, company_id: int):
    role = (payload.get("role") or "").strip().lower()

    if role == "admin":
        return None

    allowed_company_ids = payload.get("allowed_company_ids") or []
    try:
        allowed_company_ids = [int(x) for x in allowed_company_ids]
    except Exception:
        allowed_company_ids = []

    token_company_id = payload.get("company_id")
    try:
        token_company_id = int(token_company_id) if token_company_id is not None else None
    except Exception:
        token_company_id = None

    target_company_id = int(company_id)

    if target_company_id in allowed_company_ids:
        return None

    if token_company_id == target_company_id:
        return None

    return jsonify({"ok": False, "error": "Access denied for this company"}), 403

def _get_coa_count(company_id: int) -> int:
    schema = f"company_{company_id}"
    row = db_service.fetch_one(f"SELECT COUNT(*)::int AS n FROM {schema}.coa;", ())
    return int((row or {}).get("n") or 0)

@bp_companies_management_packs.get("/api/companies/<int:company_id>/management_packs")
@require_auth
def get_management_packs(company_id: int):

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    comp = db_service.fetch_one(
        """
        SELECT
          id, name, country, physical_address, postal_address,
          company_email, company_phone, company_reg_no, tin, vat,
          fin_year_start, vat_settings,
          inventory_mode, inventory_valuation,
          credit_policy
        FROM public.companies
        WHERE id=%s
        """,
        (company_id,),
    ) or {}

    cas = db_service.fetch_one(
        "SELECT * FROM public.company_account_settings WHERE company_id=%s;",
        (company_id,),
    ) or {}

    # VAT settings stored in companies.vat_settings (jsonb)
    vat_settings = comp.get("vat_settings") or {}
    if isinstance(vat_settings, str) and vat_settings.strip():
        # safety if stored as text in older rows
        try:
            import json
            vat_settings = json.loads(vat_settings)
        except Exception:
            vat_settings = {}

    # Decide VAT active/required
    vat_registered = bool(vat_settings.get("vat_registered")) if "vat_registered" in vat_settings else (not _is_blank(comp.get("vat")))
    vat_active = vat_registered or (not _is_blank(comp.get("vat")))

    # Normalize key mismatch: you used both pricing_includes_vat and prices_include_vat
    pricing_includes_vat = bool(
        vat_settings.get("pricing_includes_vat")
        or vat_settings.get("prices_include_vat")
        or False
    )

    coa_count = _get_coa_count(company_id)

    packs = []

    # 1) Company Foundation
    missing = []
    if _is_blank(comp.get("name")):
        missing.append(_missing("Company name is required", "company_name", "/company/update"))
    if _is_blank(comp.get("country")):
        missing.append(_missing("Country is required", "country", "/company/update"))
    if _is_blank(comp.get("physical_address")) and _is_blank(comp.get("postal_address")):
        missing.append(_missing("At least one address is required", "address", "/company/update"))

    packs.append({
        "key": "company_foundation",
        "title": "Company Foundation",
        "status": STATUS_READY if not missing else STATUS_NEEDS,
        "summary": "Profile, addresses, registration details, branding",
        "missing": missing,
        "open_href": "/company/update",
        "fix_href": "/company/update",
    })

    # 2) GL Base / COA
    missing = []
    status = STATUS_READY
    if coa_count <= 0:
        status = STATUS_BLOCKED
        missing.append(_missing("Chart of Accounts is empty", "coa_empty", "/standards/chart-of-accounts"))

    packs.append({
        "key": "gl_base",
        "title": "General Ledger Base",
        "status": status,
        "summary": f"COA rows: {coa_count}",
        "missing": missing,
        "open_href": "/standards/chart-of-accounts",
        "fix_href": "/standards/chart-of-accounts",
    })

    # 3) Reporting Periods
    missing = []
    if _is_blank(comp.get("fin_year_start")):
        missing.append(_missing("Financial year start date not set", "fin_year_start", "/company/reporting-periods"))

    packs.append({
        "key": "reporting_periods",
        "title": "Reporting Periods",
        "status": STATUS_READY if not missing else STATUS_NEEDS,
        "summary": "Financial year start + reporting defaults",
        "missing": missing,
        "open_href": "/company/reporting-periods",
        "fix_href": "/company/reporting-periods",
    })

    # 4) VAT Settings
    if vat_active:
        missing = []
        freq = vat_settings.get("frequency")
        anchor_month = vat_settings.get("anchor_month")
        filing_lag_days = vat_settings.get("filing_lag_days")

        if _is_blank(freq):
            missing.append(_missing("VAT filing frequency not set", "vat_frequency", "/company/vat-settings"))
        if anchor_month in (None, "", 0):
            missing.append(_missing("Anchor month not set", "vat_anchor_month", "/company/vat-settings"))
        if filing_lag_days in (None, ""):
            missing.append(_missing("Filing lag days not set", "vat_filing_lag_days", "/company/vat-settings"))

        packs.append({
            "key": "vat_settings",
            "title": "VAT Settings",
            "status": STATUS_READY if not missing else STATUS_NEEDS,
            "summary": f"VAT active · prices include VAT: {pricing_includes_vat}",
            "missing": missing,
            "open_href": "/company/vat-settings",
            "fix_href": "/company/vat-settings",
        })
    else:
        packs.append({
            "key": "vat_settings",
            "title": "VAT Settings",
            "status": STATUS_OPTIONAL,
            "summary": "VAT not enabled for this company",
            "missing": [],
            "open_href": "/company/vat-settings",
            "fix_href": "/company/vat-settings",
        })

    # 5) VAT Control Accounts (only if VAT active)
    if vat_active:
        missing = []
        if _is_blank(cas.get("vat_input_code")):
            missing.append(_missing("Input VAT account not set", "vat_input_code", "/account-settings/control-accounts"))
        if _is_blank(cas.get("vat_output_code")):
            missing.append(_missing("Output VAT account not set", "vat_output_code", "/account-settings/control-accounts"))

        packs.append({
            "key": "vat_control_accounts",
            "title": "VAT Control Accounts",
            "status": STATUS_READY if not missing else STATUS_BLOCKED,
            "summary": "Accounts used for VAT postings",
            "missing": missing,
            "open_href": "/account-settings/control-accounts",
            "fix_href": "/account-settings/control-accounts",
        })
    else:
        packs.append({
            "key": "vat_control_accounts",
            "title": "VAT Control Accounts",
            "status": STATUS_OPTIONAL,
            "summary": "Not required when VAT is disabled",
            "missing": [],
            "open_href": "/account-settings/control-accounts",
            "fix_href": "/account-settings/control-accounts",
        })

    # 6) AR Controls
    missing = []
    if _is_blank(cas.get("ar_control_code")):
        missing.append(_missing("AR control account not set", "ar_control_code", "/account-settings/control-accounts"))
    if _is_blank(cas.get("unallocated_receipts_code")):
        missing.append(_missing("Unallocated receipts account not set", "unallocated_receipts_code", "/account-settings/control-accounts"))

    packs.append({
        "key": "ar_controls",
        "title": "Receivables (AR) Controls (Auto-managed)",
        "status": STATUS_READY if not missing else STATUS_BLOCKED,
        "summary": "Customer invoices, receipts, allocations",
        "missing": missing,
        "open_screen": "ar",
        "fix_action": "autofix_controls",
    })

    # 7) AP Controls
    missing = []
    if _is_blank(cas.get("ap_control_code")):
        missing.append(_missing("AP control account not set", "ap_control_code", "/account-settings/control-accounts"))
    if _is_blank(cas.get("unallocated_payments_code")):
        missing.append(_missing("Unallocated payments account not set", "unallocated_payments_code", "/account-settings/control-accounts"))

    packs.append({
        "key": "ap_controls",
        "title": "Payables (AP) Controls",
        "status": STATUS_READY if not missing else STATUS_BLOCKED,
        "summary": "Vendor bills, payments, allocations",
        "missing": missing,
        "open_href": "/ap",
        "fix_href": "/account-settings/control-accounts",
    })

    # 8) Inventory Setup (only if enabled)
    inv_mode = (comp.get("inventory_mode") or "none").lower()
    if inv_mode != "none":
        missing = []
        if _is_blank(comp.get("inventory_valuation")):
            missing.append(_missing("Inventory valuation method not set", "inventory_valuation", "/settings/inventory"))
        packs.append({
            "key": "inventory_setup",
            "title": "Inventory Setup",
            "status": STATUS_READY if not missing else STATUS_NEEDS,
            "summary": f"Mode: {inv_mode}",
            "missing": missing,
            "open_href": "/catalog/inventory",
            "fix_href": "/settings/inventory",
        })
    else:
        packs.append({
            "key": "inventory_setup",
            "title": "Inventory Setup",
            "status": STATUS_OPTIONAL,
            "summary": "Inventory is disabled (mode: none)",
            "missing": [],
            "open_href": "/catalog/inventory",
            "fix_href": "/settings/inventory",
        })

    # 9) Optional: Procurement controls
    proc_missing = []
    if _is_blank(cas.get("grni_control_code")):
        proc_missing.append(_missing("GRNI control account not set", "grni_control_code", "/account-settings/control-accounts"))
    if _is_blank(cas.get("ppv_control_code")):
        proc_missing.append(_missing("PPV account not set", "ppv_control_code", "/account-settings/control-accounts"))

    packs.append({
        "key": "procurement_controls",
        "title": "Procurement Controls (GRNI / PPV)",
        "status": STATUS_READY if not proc_missing else STATUS_OPTIONAL,
        "summary": "Only required if using PO/receiving variance flow",
        "missing": proc_missing,
        "open_href": "/purchasing",
        "fix_href": "/account-settings/control-accounts",
    })

    # 10) Optional: WHT
    wht_missing = []
    if _is_blank(cas.get("wht_payable_code")):
        wht_missing.append(_missing("WHT payable account not set", "wht_payable_code", "/account-settings/control-accounts"))

    packs.append({
        "key": "withholding_tax",
        "title": "Withholding Tax (WHT)",
        "status": STATUS_READY if not wht_missing else STATUS_OPTIONAL,
        "summary": "Optional: only enable if you use withholding tax",
        "missing": wht_missing,
        "open_href": "/tax/wht",
        "fix_href": "/account-settings/control-accounts",
    })

    # Score + blockers
    ready = sum(1 for p in packs if p["status"] == STATUS_READY)
    total = len(packs)

    critical_blockers = []
    for p in packs:
        if p["status"] == STATUS_BLOCKED:
            for m in (p.get("missing") or []):
                critical_blockers.append({"pack": p["title"], **m})

    return jsonify({
        "company_id": company_id,
        "score": {"ready": ready, "total": total},
        "critical_blockers": critical_blockers[:6],
        "actions": [{"type": "autofix", "label": "Auto-configure missing controls"}],
        "packs": packs,
    }), 200


@bp_companies_management_packs.post("/api/companies/<int:company_id>/management_packs/autofix")
@require_auth
def autofix_management_packs(company_id: int):

    payload = getattr(request, "jwt_payload", {}) or {}
    deny = _deny_if_wrong_company(payload, company_id)
    if deny:
        return deny

    db_service.ensure_required_control_accounts(company_id)
    db_service.ensure_company_account_settings(company_id)

    return jsonify({"ok": True}), 200
