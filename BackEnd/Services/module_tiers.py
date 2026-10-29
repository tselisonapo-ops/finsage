"""
FinSage — Phase 3: module-tier sweep (single source of truth)
============================================================

This file IS the tier matrix. It was produced by sweeping the real route
inventory (api_server.py app-level routes, bp_approvals_wf.py, and the
backend paths the two dashboards call) against the agreed tier design.

entitlement_gate.py imports everything from here, so reviewing/approving
the matrix means reviewing THIS file only.

Tiers
-----
  free        journals (25/mo posted), invoices (5/mo), customers, receipts,
              reports ON-SCREEN ONLY, dashboards, settings, approvals.
              invoice/quote PDFs stay free (operational docs, not reports).
  business    + AR/AP + control accounts, quotes, credit control, bank rec,
              VAT recon & filing, PPE cost model, inventory / manufacturing
              / POS, budgets & forecasts, report exports (the Free paywall),
              management packs, data migration.
  premium     + PPE subsequent measurement (revaluation / impairment / HFS),
              leases (lessee + lessor), disclosure notes (PPE/lease/IP/IA),
              tax recon & deferred tax, accruals/deferrals, loans, IFRS 9,
              revenue contracts, projects costing + profitability,
              payroll core + benefit deductions (NO statutory filing),
              audit-trail VIEW, receipt scan.
  enterprise  + PAYE filing, IAS 19 employee benefits, remaining disclosure
              notes (revenue, payroll pack, IAS 41), full export pack,
              audit-trail EXPORT, OPS, consolidation, corporate structure.

Evaluation order in the gate (max-wins across all matches):
  1. EXEMPT_PATHS   → allow unconditionally (downgrade rule; see below)
  2. blueprint tier (BLUEPRINT_MIN_TIER)
  3. PATH_RULES     → regex floors for mixed-tier blueprints and
                      app-level routes (request.blueprint == "")
  4. format/export special cases (audit-trail export → enterprise)
  5. QUOTA_RULES    → journals/invoices per month (POST-time only)

Downgrade rule (agreed) — encoded by EXEMPT_PATHS:
  Downgrades NEVER block approval decisions. The approvals module, the
  decide endpoint, submit-for-approval, and AP payment approve/release
  stay reachable on every plan. What a downgrade stops is NEW activity in
  gated modules — those are blocked by their own blueprint/path tiers,
  and quota bites at POST time (drafts never consume quota).

OPS note (owner: app "almost done"):
  ops_bp is already mapped to enterprise. ANY route registered inside
  ops_bp is gated enterprise regardless of its path — so when the OPS
  routes ship, nothing needs to change here as long as they live in
  ops_bp. The /ops path rule below is only a safety net for OPS-flavoured
  endpoints that end up in other blueprints.

Phase 5 additions (practice plans):
  - PRACTICE_PLAN_TIERS — how practice_* codes rank against this ladder.
    Deliberately kept OUT of TIER_ORDER/TIER_NAME: TIER_NAME names the
    module ladder in "upgrade_required" responses, and a practice plan
    must never be suggested as a module upgrade (a firm upgrades
    practice_starter→practice_growth via the practice UI, not the
    module upsell modal).
  - PRACTICE_PROVISION_RULES — the client_companies meter for POSTs
    under the FIRM's company URL (checked by the gate).
  - "practice" blueprint (practice_endpoint.py) joins FREE — it reads
    its own state, like "entitlements".
  - The delegation uplift itself lives in practice_service.py — it is
    not a tier rule, it is a session-scope merge on top of the resolved
    state (see that file for its hard properties).
"""

import re

# ------------------------------------------------------------------
# Tier model
# ------------------------------------------------------------------

TIER_ORDER = {"free": 0, "business": 1, "premium": 2, "enterprise": 3}
TIER_NAME = {v: k for k, v in TIER_ORDER.items()}

# Phase 5: practice_* plan codes and the business tier each one INCLUDES
# for the firm's own books. Entitlements.py merges this into its own
# TIER_ORDER so resolve() ranks a practice firm's ledger correctly.
PRACTICE_PLAN_TIERS = {
    "practice_starter": 1,   # own books at business level
    "practice_growth": 2,    # own books at premium level
    "practice_firm": 3,      # own books at enterprise level
}


def _rx(pattern):
    return re.compile(pattern, re.IGNORECASE)


# ------------------------------------------------------------------
# Layer 1: blueprint → minimum tier
# ------------------------------------------------------------------

FREE_BLUEPRINTS = {
    # core books & platform (tier 0: no gate, role-governed as today)
    "journal",            # journal_bp
    "coa",                # coa_bp
    "invoices",           # invoices_bp  (quota applies via QUOTA_RULES)
    "customers",          # customers_bp — moved to FREE in the Phase 3 sweep:
                          #   a Free company MUST be able to create/maintain
                          #   customers, otherwise its 5 free invoices are
                          #   unusable. Customer CRUD is sales master data.
    "receipts",           # receipts_bp
    "reports",            # reports_bp   (export floor via PATH_RULES)
    "report_run",         # report_bp    (export floor via PATH_RULES)
    "dashboard",          # dashboard_bp
    "settings",           # settings_bp
    "support",            # support_bp
    "tickets",            # tickets_bp
    "entitlements",       # entitlements_endpoint.py — reads its own state
    "practice",           # practice_endpoint.py — reads its own state (Phase 5)
    # governance infrastructure — NEVER tier-gated (downgrade rule)
    "bp_approvals",       # bp_approvals / approval inbox / decide / audit view
    # internal control room — role-governed (can_view_control_room)
    "control_auth", "control_settings", "control_customers",
    "control_system_health", "control_notifications",
    "control_audit", "control_automation",
}

BUSINESS_BLUEPRINTS = {
    "credit",             # credit_bp
    "vat_settings",       # vat_settings_bp
    "vat_utils",          # vat_utils_bp
    "bank",               # bank_bp
    "ar_reports",         # ar_reports_bp
    "ap",                 # ap_bp
    "ap_reports",         # ap_reports_bp
    "quotes",             # quotes_bp
    "pos",                # pos_bp
    "forecast",           # forecast_bp (budgets + variance)
    "ppe",                # ppe_bp            (measurement lifts via PATH_RULES)
    "ppe_reporting",      # ppe_reporting_bp
    "asset_reports",      # asset_reports_bp
    "companies_management_packs",  # bp_companies_management_packs
    "data_migration",     # data_migration_bp
}

PREMIUM_BLUEPRINTS = {
    "leases",             # leases_bp
    "ifrs16",             # bp_ifrs16
    "lessors",            # lessors_bp
    "lessor",             # lessor_bp
    "loans",              # loans_bp
    "accrual_deferral",   # bp_accrual_deferral
    "ifrs9",              # bp_ifrs9
    "revenue",            # revenue_bp
    "projects",           # projects_bp
    "payroll",            # payroll_bp
    "deferred_tax",       # deferred_tax_bp
    "asset_tax",          # bp_asset_tax
    "receipt_scan",       # receipt_scan_bp
}

ENTERPRISE_BLUEPRINTS = {
    "ops",                # ops_bp — app "almost done"; tier ready for launch
    "consolidation",      # consolidation_bp
    "corporate_structure",  # corporate_structure_bp
    "ias41",              # ias41_bp
    "ias41_disclosure",   # bp_ias41_disclosure
    "payroll_disclosure",       # payroll_disclosure_bp
    "payroll_employee_benefits",  # payroll_employee_benefits_bp
    "payroll_tax_filing",       # payroll_tax_filing_bp
}

# Phase 5: practitioner workspace ships under practice_* plans. These
# blueprints stay out of the MODULE tier ladder — their routes mostly
# carry no company_id in the URL, access is role-gated
# (can_access_practitioner_dashboard), and the commercial gates are:
# (a) the client_companies provisioning meter (below +
#     PracticeService.assert_can_provision), (b) the delegation uplift,
#     (c) the firm's own-books tier via PRACTICE_PLAN_TIERS.
PRACTICE_BLUEPRINTS = {
    "engagements", "engagement_ops", "analytics", "client_overview",
    "action_center", "practitioner_dashboard", "review_queue",
    "engagement_working_papers", "resource_planning",
    "final_deliverables_review", "approval_center",
    "risk_independence", "override_log",
}

BLUEPRINT_MIN_TIER = {}
for _b in FREE_BLUEPRINTS:
    BLUEPRINT_MIN_TIER[_b] = 0
for _b in BUSINESS_BLUEPRINTS:
    BLUEPRINT_MIN_TIER[_b] = 1
for _b in PREMIUM_BLUEPRINTS:
    BLUEPRINT_MIN_TIER[_b] = 2
for _b in ENTERPRISE_BLUEPRINTS:
    BLUEPRINT_MIN_TIER[_b] = 3
for _b in PRACTICE_BLUEPRINTS:
    BLUEPRINT_MIN_TIER[_b] = None          # Phase 5 — ungated for now

# ------------------------------------------------------------------
# Layer 2: path-level floors. ALL matching rules are evaluated and the
# HIGHEST requirement wins (max-wins). Rules matter most for:
#   - mixed-tier blueprints (PPE: cost model business, measurement premium)
#   - app-level routes registered on `app` (request.blueprint == ""),
#     which the blueprint map cannot see
# ------------------------------------------------------------------

PATH_RULES = [
    # --- ENTERPRISE -------------------------------------------------
    (_rx(r"/payroll[a-z_-]*disclosure|/disclosure[a-z_-]*payroll"),
     3, "payroll_disclosure_pack"),
    (_rx(r"/ias41"),
     3, "disclosure_notes_ias41"),
    (_rx(r"/employee[_-]?benefits"),
     3, "employee_benefits_accounting"),
    (_rx(r"/payroll[a-z_-]*tax[a-z_-]*filing|/payroll[a-z_-]*/filing|/paye"),
     3, "payroll_tax_filing_paye"),
    (_rx(r"/consolidat|/group[-_]?(report|structure)|"
         r"/corporate[-_]?structure|/intercompany"),
     3, "consolidation"),
    (_rx(r"/ops[/_-]"),
     3, "ops"),

    # --- PREMIUM ----------------------------------------------------
    # PPE subsequent measurement & related reports. The optional
    # asset[-_] prefix matters: the dashboard calls /asset-revaluations
    # and /asset-impairments, where the slash is before "asset".
    (_rx(r"/(asset[-_])?revaluations?"),
     2, "ppe_revaluation"),
    (_rx(r"/subsequent[-_]?measurement"),
     2, "ppe_subsequent_measurement"),
    (_rx(r"/(asset[-_])?impairments?"),
     2, "ppe_impairment"),
    (_rx(r"/held[-_]?for[-_]?sale|/classify[-_]?hfs"),
     2, "ppe_hfs"),
    # disclosure notes: generic /disclosure paths + the /fs-notes/<key>
    # note register endpoint. Premium floor (PPE/lease/IP/IA notes);
    # enterprise plans sit above this floor and get the full register.
    (_rx(r"/disclosure"),
     2, "disclosure_notes_ppe"),
    (_rx(r"/fs[-_]notes"),
     2, "disclosure_notes"),
    (_rx(r"/lease|/ifrs16|/lessor"),
     2, "lease_accounting_lessee"),
    (_rx(r"/accrual|/deferral"),
     2, "accruals_deferrals"),
    # loans: catches /loans, /loans/1 AND report paths like
    # /reports/loan-schedule, /reports/loan-journals (hyphen form)
    (_rx(r"/loans?[/_-]"),
     2, "loans_financing"),
    # revenue: contracts module + /reports/revenue-* report family
    (_rx(r"/revenue"),
     2, "revenue_contracts"),
    (_rx(r"/projects?[/_]"),
     2, "projects_costing"),
    (_rx(r"/payroll[/_-]|/payslips?"),
     2, "payroll_core"),
    (_rx(r"/deferred[-_]?tax|/tax[-_]?recon"),
     2, "tax_recon_deferred_tax"),
    (_rx(r"/receipt[-_]?scan"),
     2, "receipt_scan"),
    # audit-trail VIEW is premium; audit-trail EXPORT is enterprise and
    # is applied by the special case in the gate (path + /export|format)
    (_rx(r"/audit[-_]trails?"),
     2, "audit_trail_view"),

    # --- BUSINESS ---------------------------------------------------
    # industry pack + purchasing + POS: mostly app-level routes in
    # api_server.py (request.blueprint == ""), invisible to Layer 1
    (_rx(r"/inventory|/manufacturing"),
     1, "inventory"),
    (_rx(r"/purchase[-_]?orders?"),
     1, "ap_subledger"),
    (_rx(r"/pos[/_-]|/pos_imports|/pos_summaries"),
     1, "pos"),
    (_rx(r"/bank[-_]?accounts?"),
     1, "bank_accounts"),
    # AR/AP control-account reconciliations live under reports_bp (free)
    (_rx(r"/reports?/(ar|ap)-control"),
     1, "ar_ap_controls"),
    # VAT recon report lives under reports_bp (free); VAT recon & filing
    # is a Business feature, so its report gets a business floor
    (_rx(r"/reports?/vat"),
     1, "vat_recon_filing"),

    # --- the Free paywall: report exports ---------------------------
    # applies as a FLOOR on top of any module: exporting a premium note
    # still requires premium because max() is taken across all matches.
    (_rx(r"/export"),
     1, "report_exports"),
]

EXPORT_FORMATS = {"csv", "pdf", "xlsx", "xls", "excel"}

# ------------------------------------------------------------------
# Layer 2b: exempt paths (the downgrade rule). Matched against the full
# request path. A match SKIPS tier checks AND quota checks.
#
# Rationale per interaction rule 1: a downgrade must never strand a
# pending approval. Decisions keep resolving on every plan; what the
# downgrade stops is NEW gated-module activity (module tiers) and new
# postings (quota at POST time — rule 2).
# ------------------------------------------------------------------

EXEMPT_PATHS = [
    (_rx(r"^/api/companies/\d+/approvals(/|$)"),
     "approvals module: inbox, detail, create, decide, decisions, audit view"),

    (_rx(r"/invoices/\d+/submit/?$"),
     "submit-for-approval is governance; posting stays quota-checked at "
     "/post, /post_approved, /post_backlog and /mark_posted"),

    (_rx(r"/vendor_payments/\d+/(approve|release)/?$"),
     "AP payment decision + funds release are governed by credit_policy "
     "(can_release_funds), never by tier"),

    (_rx(r"/audit/?$"),
     "approvals audit viewer route (GET .../audit) — governance infra"),
]

# ------------------------------------------------------------------
# Layer 3: quotas. skip_if_draft: Free can save unlimited invoice
# drafts; the quota bites when an invoice becomes non-draft (create
# with a non-draft status, or any post/mark_posted endpoint).
# Journal regexes cover both the app-level /journal/... paths and the
# journal_bp variants (/journals...) so the sweep stays safe if routes
# move between the two.
# ------------------------------------------------------------------

QUOTA_RULES = [
    # method, path regex, quota key, options
    ("POST", _rx(r"/journals?/?$"), "journals_per_month", {}),
    ("POST", _rx(r"/journals?/\d+/reverse/?$"), "journals_per_month", {}),
    ("POST", _rx(r"/invoices/?$"), "invoices_per_month",
     {"skip_if_draft": True}),
    ("POST", _rx(r"/invoices/\d+/post/?$"), "invoices_per_month", {}),
    ("POST", _rx(r"/invoices/post_approved/?$"), "invoices_per_month", {}),
    ("POST", _rx(r"/invoices/post_backlog/?$"), "invoices_per_month", {}),
    ("PUT",  _rx(r"/invoices/\d+/mark_posted/?$"), "invoices_per_month", {}),
]

# Quotas are checked ONLY for tier-0 (free) companies in the gate:
#   if state["tier"] > 0 → limits are -1 (unlimited) anyway, but we skip
#   the count query entirely to save a round-trip per POST.

# ------------------------------------------------------------------
# Phase 5: practice provisioning meter. A POST under the FIRM's company
# URL that provisions a client workspace consumes the practice plan's
# `client_companies` quota — regardless of the firm's module tier (this
# is a practice-side meter, not a module tier). Counted from
# customer_company_links ∪ provisioned engagements by
# practice_service.count_provisioned_clients().
#
# Engagement-shaped routes WITHOUT the firm's company_id in the URL
# (e.g. POST /api/engagements) can't be matched here — those call
# PracticeService.assert_can_provision(firm_cid) directly (README).
# Conservative regex on purpose: widening it is a reviewable change to
# THIS file.
# ------------------------------------------------------------------

PRACTICE_PROVISION_RULES = [
    (_rx(r"^/api/companies/\d+/(?:customers?/\d+/)?"
         r"(?:workspace|client[-_]?compan|provision)"),
     "client_companies"),
]
