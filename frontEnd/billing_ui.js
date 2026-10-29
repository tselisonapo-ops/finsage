/*!
 * FinSage — Phase 6: subscription billing UI (client side)
 * ========================================================
 *
 * One standalone, dependency-free file that gives BOTH dashboards the
 * subscription-aware UX the backend (Phases 0–5) has been promising:
 *
 *   1. Entitlements client  — GET /api/companies/<cid>/entitlements
 *      (60s in-memory cache + sessionStorage mirror, same TTL family as
 *      the server's resolve() cache).
 *   2. Billing banner       — plan chip, trial countdown, past-due,
 *      14-day read-only grace, scheduled downgrade, practitioner
 *      uplift chip, live quota bars, shadow-mode preview pill.
 *   3. Three 403 modals     — driven ONLY by the backend's error codes
 *      (backend stays authoritative):
 *        upgrade_required        → "Available on <plan>" + next-tier feature list
 *        subscription_expired    → read-only grace + reactivate CTA
 *        practice_limit_reached  → client companies meter + next practice plan
 *   4. Global 403 interceptor — wraps window.fetch AND window.apiFetch
 *      (both idempotent, both pass the response/error through untouched
 *      so existing error handling keeps working).
 *   5. Nav gating overlay    — hides/locks #mainNav items whose screen
 *      sits above the company's tier (dashboard.js), without editing
 *      the 10k-line NAV_MENU. data-feature hiding for the rest.
 *   6. Practice overview     — mountPracticeOverview(el): client
 *      meter (11/25), roster with each client's own plan, next
 *      practice plan upsell (practice/overview endpoint).
 *
 * DESIGN RULES (do not break them when editing):
 *   • This file is UX SUGAR. The gate (entitlement_gate.py) is the only
 *     enforcement point. If entitlements can't be fetched, everything
 *     fails OPEN (visible, clickable) — a user must never lose access
 *     because a banner crashed.
 *   • Uncertain screens stay tier 0 (visible). Wrong-hiding is worse
 *     than a late 403 modal: hidden features can't even ask to upgrade.
 *   • Prices live in the plan catalog (seeds carry real LSL amounts;
 *     free stays 0 → "Free"). Modals still sell the PLAN, not a number —
 *     render catalog amounts when the checkout CTA / billing page lands.
 *   • Shadow mode (ENTITLEMENT_MODE=shadow): nothing is hidden; gated
 *     nav items get a small "in <plan>" badge instead; console.info
 *     logs preview decisions. The banner shows a preview pill so staff
 *     understand why nothing blocks yet.
 *
 * INTEGRATION (full guide: PHASE6_FRONTEND.md)
 *   <script src="/static/billing_ui.js"></script>   (either dashboard)
 *   — auto-inits on DOMContentLoaded using window.FS_BILLING_CONFIG:
 *       window.FS_BILLING_CONFIG = { companyId: <fid>, apiBase: "" };
 *   — or manual: FinSageBilling.init({ companyId: 7 });
 *   Practitioner dashboard, after `me` resolves:
 *       FinSageBilling.mountPracticeOverview(document.getElementById("prBillingPanel"));
 *   Kill switch: window.FS_BILLING_DISABLED = true  → init() no-ops.
 */
(function () {
  "use strict";

  if (window.__FS_BILLING_UI__) return; // idempotent (double <script> safe)
  window.__FS_BILLING_UI__ = true;

  /* ============================================================
   * Constants — the two maps that mirror the backend matrix
   * ============================================================ */

  // screen name (data-nav value in #mainNav) → minimum tier.
  // Mirrors module_tiers.py BLUEPRINT_MIN_TIER + PATH_RULES as seen
  // through the NAV_MENU screens. QA cross-checks this map against the
  // python matrix (scripts/test_phase6_billing_ui.js).
  const SCREEN_TIERS = {
    // ---- tier 1: business ------------------------------------
    "inventory-items": 1,
    "inventory-movements": 1,
    "inventory-write-downs": 1,
    "inventory-valuation": 1,
    "stocktake": 1,
    "reorder": 1,
    "manufacturing": 1,
    "service-items": 1,
    "pos-launch": 1,
    "pos": 1,
    "production-performance": 1,
    "bank-setup": 1,
    "banking": 1,
    "bank-recon": 1,
    "ap": 1,
    "ar-quotes": 1,
    "cust-approvals": 1,
    "budgeting": 1,
    "vat": 1,
    "ar-recon": 1,
    "ar-statements": 1,
    "ar-aging": 1,
    "ap-recon": 1,
    "ap-statements": 1,
    "ap-aging": 1,
    "company-vat": 1,
    "company-mgmt-packs": 1,
    "data-migration": 1,
    "fixedassets": 1,
    // ---- tier 2: premium --------------------------------------
    "lease-center": 2,
    "lease-register": 2,
    "lease-payments": 2,
    "lease-monthly": 2,
    "lessors": 2,
    "lessor-subsequent": 2,
    "accrual-deferrals": 2,
    "payroll": 2,
    "projects": 2,
    "project-profitability": 2,
    "loans": 2,
    "revenue": 2,
    "revenue-setup": 2,
    "ifrs9": 2,
    "deferred-tax": 2,
    "tax-recon": 2,
    "audit-trail": 2,
    // ---- tier 3: enterprise -----------------------------------
    "group-reporting": 3,
    "company-structure": 3,
    "ias41": 3,
  };

  // Human labels for the feature keys the backend sends in
  // error.feature / entitlements.upsell (UPSELL_BY_TIER + PATH_RULES).
  const FEATURE_LABELS = {
    report_exports: "Report exports (PDF / Excel / CSV)",
    quotes: "Quotations",
    ar_ap_controls: "AR / AP control-account reconciliation",
    credit_control: "Credit control",
    bank_reconciliation: "Bank reconciliation",
    vat_recon_filing: "VAT reconstruction & filing",
    inventory: "Inventory",
    ap_subledger: "Purchase orders",
    pos: "Point of sale",
    bank_accounts: "Bank accounts & cashbook",
    budgets_forecasts: "Budgeting & forecasting",
    ppe_revaluation: "PPE revaluation model",
    ppe_subsequent_measurement: "PPE subsequent measurement",
    ppe_impairment: "PPE impairment",
    ppe_hfs: "Assets held for sale",
    lease_accounting_lessee: "Lease accounting (lessee)",
    accruals_deferrals: "Accruals & deferrals",
    loans_financing: "Loans & financing",
    revenue_contracts: "Revenue contracts (IFRS 15)",
    projects_costing: "Project costing & profitability",
    payroll_core: "Payroll",
    tax_recon_deferred_tax: "Tax reconciliation & deferred tax",
    receipt_scan: "Receipt scanning",
    disclosure_notes: "Disclosure notes",
    disclosure_notes_ppe: "PPE disclosure notes",
    disclosure_notes_ias41: "IAS 41 agriculture disclosures",
    audit_trail_view: "Audit trail",
    audit_trail_export: "Audit trail export",
    payroll_disclosure_pack: "Payroll disclosure pack",
    payroll_tax_filing_paye: "PAYE statutory filing",
    employee_benefits_accounting: "IAS 19 employee benefits",
    export_full_pack: "Full financial-statement export pack",
    ops: "Operations suite",
    consolidation: "Group consolidation & reporting",
    corporate_structure: "Corporate structure",
    management_packs: "Management packs",
    data_migration: "Data migration",
  };

  const PLAN_LABELS = {
    free: "Free",
    business: "Business",
    premium: "Premium",
    enterprise: "Enterprise",
    practice_starter: "Practice Starter",
    practice_growth: "Practice Growth",
    practice_firm: "Practice Firm",
  };

  const PLAN_RANK = {
    free: 0, business: 1, premium: 2, enterprise: 3,
    practice_starter: 1, practice_growth: 2, practice_firm: 3,
  };

  // The module ladder shown in the upgrade modal (never practice plans —
  // a practice firm upgrades via the practice UI, per module_tiers.py).
  const MODULE_LADDER = ["free", "business", "premium", "enterprise"];
  const PRACTICE_LADDER = ["practice_starter", "practice_growth", "practice_firm"];

  const ERR = {
    UPGRADE: "upgrade_required",
    EXPIRED: "subscription_expired",
    PRACTICE: "practice_limit_reached",
  };

  const ENT_TTL_MS = 60 * 1000; // mirrors server resolve() cache (60s)

  /* ============================================================
   * Tiny utils
   * ============================================================ */

  const TAG = "[FS-BILLING]";
  function log() {
    try { console.info.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {}
  }
  function warn() {
    try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function humanizeFeature(key) {
    if (!key) return "";
    if (FEATURE_LABELS[key]) return FEATURE_LABELS[key];
    // ppe_revaluation → PPE revaluation
    return String(key)
      .replace(/[_-]+/g, " ")
      .replace(/\b([a-z])/g, function (_, c) { return c.toUpperCase(); })
      .replace(/\bPpe\b/, "PPE").replace(/\bIfrs\b/, "IFRS")
      .replace(/\bIas\b/, "IAS").replace(/\bPaye\b/, "PAYE")
      .replace(/\bAr\b/, "AR").replace(/\bAp\b/, "AP").replace(/\bPos\b/, "POS")
      .replace(/\bVat\b/, "VAT").replace(/\bHfs\b/, "HFS");
  }

  function planLabel(code) {
    return PLAN_LABELS[code] || humanizeFeature(code);
  }

  function planRank(code) {
    return PLAN_RANK[code] != null ? PLAN_RANK[code] : 0;
  }

  function fmtDate(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleDateString(undefined,
        { year: "numeric", month: "short", day: "numeric" });
    } catch (e) { return String(iso); }
  }

  /* ============================================================
   * API client
   * ============================================================ */

  const state = {
    cfg: {
      apiBase: null,        // default: auto-detect like the dashboards do
      companyId: null,      // default: getActiveCompanyId() / URL / cache
      mountBanner: true,
      bannerHost: null,     // selector — defaults to first <main> / body
      hideLockedNav: null,  // null = auto (enforce→hide, shadow→badge)
      bannerMode: "always", // "always" | "attention" (only trial/due/grace)
    },
    ent: null,              // last entitlements payload (entitlements obj)
    practice: null,         // last practice/overview payload (practice obj)
    entFetchedAt: 0,
    loading: null,          // in-flight promise
    banner: null,           // rendered banner element
    fetchPatched: false,
    apiFetchPatched: false,
    navObserved: false,
    delegated: false,       // session carries a delegated uplift
    panels: [],             // mounted practice overview hosts
  };

  function apiBase() {
    if (state.cfg.apiBase != null) return state.cfg.apiBase;
    const cfg = window.FS_BILLING_CONFIG || {};
    if (cfg.apiBase != null) return cfg.apiBase;
    if (window.APP_CONFIG && window.APP_CONFIG.API_BASE != null) {
      return window.APP_CONFIG.API_BASE;
    }
    const h = window.location ? window.location.hostname : "";
    return (h === "127.0.0.1" || h === "localhost") ? "http://127.0.0.1:5000" : "";
  }

  function token() {
    try { return (typeof window.getToken === "function" && window.getToken()) || ""; }
    catch (e) { return ""; }
  }

  function authHeaders(extra) {
    const h = Object.assign({}, extra || {});
    const t = token();
    if (t) h["Authorization"] = "Bearer " + t;
    return h;
  }

  function resolveCompanyId() {
    if (state.cfg.companyId) return Number(state.cfg.companyId) || null;
    const cfg = window.FS_BILLING_CONFIG || {};
    if (cfg.companyId) return Number(cfg.companyId) || null;
    if (typeof window.getActiveCompanyId === "function") {
      try {
        const cid = Number(window.getActiveCompanyId());
        if (cid) return cid;
      } catch (e) {}
    }
    if (window.CURRENT_COMPANY && window.CURRENT_COMPANY.id) {
      return Number(window.CURRENT_COMPANY.id) || null;
    }
    // URL shape used by every company-scoped call
    const m = (window.location && window.location.href || "")
      .match(/\/api\/companies\/(\d+)/);
    if (m) return Number(m[1]) || null;
    try {
      const v = Number(localStorage.getItem("CURRENT_COMPANY_ID"));
      if (v) return v;
    } catch (e) {}
    return null;
  }

  function entCacheKey(cid) { return "fs_entitlements_" + cid; }

  function readEntCache(cid) {
    try {
      const raw = sessionStorage.getItem(entCacheKey(cid));
      if (!raw) return null;
      const box = JSON.parse(raw);
      if (!box || !box.ent) return null;
      if (Date.now() - box.t > ENT_TTL_MS) return null;
      return box.ent;
    } catch (e) { return null; }
  }

  function writeEntCache(cid, ent) {
    try {
      sessionStorage.setItem(entCacheKey(cid),
        JSON.stringify({ t: Date.now(), ent: ent }));
    } catch (e) {}
  }

  function fetchJSON(url) {
    return fetch(url, {
      method: "GET",
      headers: authHeaders({ "Accept": "application/json" }),
      credentials: "omit",
    }).then(function (res) {
      if (res.status === 401) throw new Error("unauthorized");
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  function loadEntitlements(force) {
    const cid = resolveCompanyId();
    if (!cid) return Promise.resolve(null);

    if (!force) {
      if (state.ent && state.ent.company_id === cid) {
        return Promise.resolve(state.ent);
      }
      const cached = readEntCache(cid);
      if (cached) {
        state.ent = cached;
        return Promise.resolve(cached);
      }
    }
    if (state.loading) return state.loading;

    state.loading = fetchJSON(
      apiBase() + "/api/companies/" + cid + "/entitlements"
    )
      .then(function (data) {
        const ent = (data && data.entitlements) || null;
        if (ent) {
          state.ent = ent;
          state.entFetchedAt = Date.now();
          state.delegated = !!(ent.practice_uplift && ent.practice_uplift.applied);
          writeEntCache(cid, ent);
          renderBanner();
          applyFeatureAttributes();
          applyNavGating();
          refreshPanels();
        }
        return ent;
      })
      .catch(function (e) {
        warn("entitlements unavailable — failing open:", e && e.message);
        return null;
      })
      .then(function (ent) { state.loading = null; return ent; });

    return state.loading;
  }

  function loadPracticeOverview(force) {
    const cid = resolveCompanyId();
    if (!cid) return Promise.resolve(null);
    if (state.practice && !force) return Promise.resolve(state.practice);
    return fetchJSON(
      apiBase() + "/api/companies/" + cid + "/practice/overview"
    )
      .then(function (data) {
        const pr = (data && data.practice) || null;
        if (pr) { state.practice = pr; refreshPanels(); }
        return pr;
      })
      .catch(function (e) {
        warn("practice overview unavailable — failing open:", e && e.message);
        return null;
      });
  }

  /* ============================================================
   * Pure state derivation (unit-tested)
   * ============================================================ */

  /**
   * Derives the banner model from an entitlements payload. PURE —
   * no DOM, no fetch; scripts/test_phase6_billing_ui.js feeds it the
   * full matrix.
   */
  function deriveBannerState(ent) {
    if (!ent) return { kind: "none" };

    const billing = ent.billing || {};
    const plan = ent.plan_code || "free";
    const isPractice = String(plan).indexOf("practice_") === 0;
    const status = ent.status || billing.billing_status || "active";

    if (ent.practice_uplift && ent.practice_uplift.applied) {
      return {
        kind: "delegated_uplift",
        firmId: ent.practice_uplift.source_company_id,
        plan: ent.practice_uplift.practice_plan_code,
        effectiveTier: ent.practice_uplift.effective_tier,
      };
    }

    if (billing.read_only) {
      return {
        kind: "read_only",
        plan: plan,
        graceEndsAt: billing.grace_ends_at || null,
      };
    }

    if (status === "past_due") {
      return { kind: "past_due", plan: plan };
    }

    if (status === "trialing" || (billing.trial_days_left != null &&
        Number(billing.trial_days_left) >= 0)) {
      return {
        kind: "trial",
        plan: plan,
        daysLeft: billing.trial_days_left != null
          ? Number(billing.trial_days_left) : null,
        trialEndsAt: billing.trial_ends_at || null,
        isPractice: isPractice,
      };
    }

    if (billing.scheduled_plan_code &&
        planRank(billing.scheduled_plan_code) < planRank(plan)) {
      return {
        kind: "scheduled_downgrade",
        plan: plan,
        scheduledPlan: billing.scheduled_plan_code,
      };
    }

    if (ent.grandfathered) {
      return { kind: "grandfathered", plan: plan };
    }

    return {
      kind: isPractice ? "practice_active" : "plan_active",
      plan: plan,
      tier: ent.tier,
      shadow: (ent.mode === "shadow"),
    };
  }

  /** 0–100 bar percentage + severity for a quota bucket. PURE. */
  function quotaBar(q) {
    if (!q || q.unlimited) return { pct: 0, severity: "ok", unlimited: true };
    const used = Number(q.used || 0);
    const limit = Number(q.limit || 0);
    if (limit <= 0) return { pct: 0, severity: "ok", unlimited: true };
    const pct = Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
    const severity = used >= limit ? "full" : (pct >= 80 ? "warn" : "ok");
    return { pct: pct, severity: severity, unlimited: false, used: used, limit: limit };
  }

  /**
   * Routes a 403 body to a modal kind. PURE — returns
   * null|UPGRADE|EXPIRED|PRACTICE. The interceptor and the QA both use
   * this, so the frontend contract lives in exactly one function.
   */
  function routeError(body) {
    if (!body || typeof body !== "object") return null;
    const code = body.error || body.code || body.error_code;
    if (code === ERR.UPGRADE) return ERR.UPGRADE;
    if (code === ERR.EXPIRED) return ERR.EXPIRED;
    if (code === ERR.PRACTICE) return ERR.PRACTICE;
    return null;
  }

  /** Effective tier for gating: base tier, lifted by delegated uplift. */
  function effectiveTier(ent) {
    if (!ent) return 0;
    const base = Number(ent.tier || 0);
    const up = ent.practice_uplift && ent.practice_uplift.applied
      ? Number(ent.practice_uplift.effective_tier || 0) : 0;
    return Math.max(base, up);
  }

  function canFeature(key) {
    // Fail-open: no state → allowed (backend still decides).
    if (!state.ent || !key) return true;
    const f = state.ent.features || {};
    if (!(key in f)) return true;
    return !!f[key];
  }

  function canScreen(screen) {
    if (!screen) return true;
    const min = SCREEN_TIERS[String(screen)];
    if (!min) return true;                      // unmapped → fail open
    if (!state.ent) return true;                // not loaded → fail open
    if ((state.ent.mode || "") !== "enforce") return true; // shadow: visible
    return effectiveTier(state.ent) >= min;
  }

  /* ============================================================
   * CSS (scoped .fsb-* — safe to inject on both dashboards)
   * ============================================================ */

  const CSS = ""
    + ".fsb-banner{display:flex;align-items:center;gap:12px;flex-wrap:wrap;"
    + "  padding:9px 16px;border-bottom:1px solid var(--fs-border,#e5e7eb);"
    + "  background:var(--fs-card,#fff);font-size:13.5px;color:var(--fs-ink,#111827);}"
    + ".fsb-banner[data-sev='warn']{background:#fffbeb;}"
    + ".fsb-banner[data-sev='bad']{background:#fef2f2;}"
    + ".fsb-banner[data-sev='info']{background:#f0f9ff;}"
    + ".fsb-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;"
    + "  border-radius:999px;font-weight:700;font-size:12px;letter-spacing:.02em;"
    + "  background:var(--fs-navy,#00284F);color:#fff;white-space:nowrap;}"
    + ".fsb-chip.fsb-teal{background:var(--fs-teal,#00C8C8);color:var(--fs-navy,#00284F);}"
    + ".fsb-chip.fsb-amber{background:#fef3c7;color:#92400e;}"
    + ".fsb-chip.fsb-red{background:#fee2e2;color:#991b1b;}"
    + ".fsb-chip.fsb-ghost{background:transparent;color:var(--fs-muted,#6b7280);"
    + "  border:1px dashed var(--fs-border,#e5e7eb);font-weight:600;}"
    + ".fsb-banner-msg{flex:1 1 260px;min-width:200px;}"
    + ".fsb-banner-msg b{color:var(--fs-navy,#00284F);}"
    + ".fsb-banner .fsb-muted{color:var(--fs-muted,#6b7280);}"
    + ".fsb-btn{border:0;border-radius:8px;padding:7px 14px;font-size:12.5px;"
    + "  font-weight:700;cursor:pointer;white-space:nowrap;}"
    + ".fsb-btn-primary{background:var(--fs-navy,#00284F);color:#fff;}"
    + ".fsb-btn-primary:hover{filter:brightness(1.15);}"
    + ".fsb-btn-ghost{background:transparent;color:var(--fs-muted,#6b7280);"
    + "  border:1px solid var(--fs-border,#e5e7eb);}"
    + ".fsb-quotas{display:flex;gap:14px;flex-wrap:wrap;align-items:center;}"
    + ".fsb-quota{min-width:130px;}"
    + ".fsb-quota-top{display:flex;justify-content:space-between;gap:8px;"
    + "  font-size:11.5px;color:var(--fs-muted,#6b7280);margin-bottom:3px;}"
    + ".fsb-quota-bar{height:5px;border-radius:4px;background:var(--fs-border,#e5e7eb);overflow:hidden;}"
    + ".fsb-quota-fill{height:100%;border-radius:4px;background:var(--fs-teal,#00C8C8);transition:width .4s;}"
    + ".fsb-quota-fill.fsb-warn{background:#f59e0b;}"
    + ".fsb-quota-fill.fsb-full{background:#ef4444;}"
    + ".fsb-overlay{position:fixed;inset:0;z-index:2147483000;display:none;"
    + "  align-items:center;justify-content:center;background:rgba(2,20,38,.55);padding:18px;}"
    + ".fsb-overlay.open{display:flex;}"
    + ".fsb-modal{background:var(--fs-card,#fff);border-radius:16px;max-width:560px;width:100%;"
    + "  max-height:86vh;overflow:auto;box-shadow:0 24px 70px rgba(0,0,0,.35);"
    + "  font-family:inherit;color:var(--fs-ink,#111827);}"
    + ".fsb-modal-head{padding:20px 22px 0;}"
    + ".fsb-modal-kicker{font-size:11px;font-weight:800;letter-spacing:.14em;"
    + "  text-transform:uppercase;color:var(--fs-teal,#00C8C8);margin-bottom:6px;}"
    + ".fsb-modal-title{font-size:19px;font-weight:800;color:var(--fs-navy,#00284F);margin:0 0 6px;}"
    + ".fsb-modal-sub{font-size:13.5px;color:var(--fs-muted,#6b7280);line-height:1.5;margin:0;}"
    + ".fsb-modal-body{padding:16px 22px 6px;}"
    + ".fsb-modal-foot{padding:14px 22px 20px;display:flex;gap:10px;justify-content:flex-end;"
    + "  flex-wrap:wrap;align-items:center;}"
    + ".fsb-planrow{display:flex;align-items:center;gap:10px;padding:11px 13px;"
    + "  border:1px solid var(--fs-border,#e5e7eb);border-radius:12px;margin-bottom:8px;"
    + "  font-size:13.5px;}"
    + ".fsb-planrow.is-current{border-color:var(--fs-teal,#00C8C8);"
    + "  background:rgba(0,200,200,.06);}"
    + ".fsb-planrow.is-target{border-color:var(--fs-navy,#00284F);"
    + "  box-shadow:0 0 0 1px var(--fs-navy,#00284F);}"
    + ".fsb-planrow .fsb-plan-name{font-weight:800;color:var(--fs-navy,#00284F);}"
    + ".fsb-planrow .fsb-plan-tag{margin-left:auto;font-size:11px;font-weight:800;"
    + "  letter-spacing:.08em;text-transform:uppercase;color:var(--fs-muted,#6b7280);}"
    + ".fsb-planrow.is-target .fsb-plan-tag{color:var(--fs-navy,#00284F);}"
    + ".fsb-featlist{margin:10px 0 0;padding:0;list-style:none;font-size:13px;}"
    + ".fsb-featlist li{padding:4px 0 4px 22px;position:relative;}"
    + ".fsb-featlist li:before{content:'✓';position:absolute;left:2px;top:4px;"
    + "  color:var(--fs-teal,#00C8C8);font-weight:800;}"
    + ".fsb-meter{height:8px;border-radius:6px;background:var(--fs-border,#e5e7eb);overflow:hidden;}"
    + ".fsb-meter-fill{height:100%;background:var(--fs-teal,#00C8C8);transition:width .4s;}"
    + ".fsb-meter-fill.fsb-warn{background:#f59e0b;}"
    + ".fsb-meter-fill.fsb-full{background:#ef4444;}"
    + ".fsb-panel{font-size:13.5px;color:var(--fs-ink,#111827);}"
    + ".fsb-panel table{width:100%;border-collapse:collapse;font-size:13px;}"
    + ".fsb-panel th{ text-align:left;font-size:11px;letter-spacing:.08em;"
    + "  text-transform:uppercase;color:var(--fs-muted,#6b7280);padding:7px 8px;"
    + "  border-bottom:1px solid var(--fs-border,#e5e7eb);}"
    + ".fsb-panel td{padding:8px;border-bottom:1px solid var(--fs-border,#e5e7eb);}"
    + ".fsb-navbadge{display:inline-block;margin-left:6px;padding:1px 7px;"
    + "  border-radius:999px;font-size:9.5px;font-weight:800;letter-spacing:.06em;"
    + "  text-transform:uppercase;background:rgba(0,200,200,.14);color:#007a7a;}"
    + ".fsb-navlocked{opacity:.45;}"
    + ".fsb-hidden{display:none !important;}";

  function injectCSS() {
    if (document.getElementById("fsb-css")) return;
    const el = document.createElement("style");
    el.id = "fsb-css";
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  /* ============================================================
   * Banner
   * ============================================================ */

  function quotaChipsHTML(ent) {
    const quotas = ent.quotas || {};
    const keys = Object.keys(quotas);
    if (!keys.length) return "";
    const chips = keys.slice(0, 2).map(function (k) {
      const b = quotaBar(quotas[k]);
      if (b.unlimited) return "";
      const label = humanizeFeature(k).replace(/ per month/i, "");
      return ""
        + "<div class='fsb-quota'>"
        +   "<div class='fsb-quota-top'><span>" + esc(label) + "</span>"
        +   "<span>" + b.used + " / " + b.limit + "</span></div>"
        +   "<div class='fsb-quota-bar'><div class='fsb-quota-fill "
        +     (b.severity === "full" ? "fsb-full" :
        +      b.severity === "warn" ? "fsb-warn" : "")
        +     "' style='width:" + b.pct + "%'></div></div>"
        + "</div>";
    }).join("");
    return chips ? "<div class='fsb-quotas'>" + chips + "</div>" : "";
  }

  function bannerModel(ent) {
    const s = deriveBannerState(ent);
    const sev = { trial: "info", past_due: "bad", read_only: "bad",
      scheduled_downgrade: "warn", delegated_uplift: "info",
      grandfathered: "info" }[s.kind] || "info";
    let msg = "", chip = "", actions = [];

    switch (s.kind) {
      case "trial":
        chip = "<span class='fsb-chip fsb-teal'>Trial</span>";
        msg = s.daysLeft != null
          ? ("<b>" + esc(planLabel(s.plan)) + " trial</b> — " +
             (s.daysLeft === 0 ? "ends today" :
              s.daysLeft + " day" + (s.daysLeft === 1 ? "" : "s") + " left") +
             (s.trialEndsAt ? " (until " + esc(fmtDate(s.trialEndsAt)) + ")" : ""))
          : ("<b>" + esc(planLabel(s.plan)) + " trial</b> active");
        actions.push(makeAct("primary", "Choose a plan", openPlanLadderModal));
        break;

      case "past_due":
        chip = "<span class='fsb-chip fsb-red'>Payment failed</span>";
        msg = "<b>Payment problem</b> — update your payment method to keep " +
              esc(planLabel(s.plan)) + " running. Retries are scheduled " +
              "automatically; after the final retry the workspace goes " +
              "read-only for 14 days.";
        actions.push(makeAct("primary", "Update payment", openReactivateModal));
        break;

      case "read_only":
        chip = "<span class='fsb-chip fsb-red'>Read-only</span>";
        msg = "<b>Subscription expired</b> — your workspace is read-only" +
          (s.graceEndsAt ? " until " + esc(fmtDate(s.graceEndsAt)) : "") +
          ". Nothing is deleted: reactivate and everything resumes. " +
          "Approval decisions and exports still work meanwhile.";
        actions.push(makeAct("primary", "Reactivate", openReactivateModal));
        break;

      case "scheduled_downgrade":
        chip = "<span class='fsb-chip fsb-amber'>Change scheduled</span>";
        msg = "Your plan moves from <b>" + esc(planLabel(s.plan)) +
          "</b> to <b>" + esc(planLabel(s.scheduledPlan)) +
          "</b> at the end of the current period. Kept your data — " +
          "gated modules will pause, nothing is deleted.";
        actions.push(makeAct("primary", "Keep my plan", openPlanLadderModal));
        break;

      case "delegated_uplift":
        chip = "<span class='fsb-chip fsb-teal'>Practitioner session</span>";
        msg = "You are working in a client workspace under a delegated " +
          "engagement — this session is elevated to <b>" +
          esc(planLabel(s.plan || "practice")) + "</b> by the firm " +
          "(effective tier " + esc(s.effectiveTier || 0) + "). The " +
          "client's own plan governs their users.";
        break;

      case "grandfathered":
        chip = "<span class='fsb-chip'>Founding plan</span>";
        msg = "This workspace keeps its pre-billing access (" +
          esc(planLabel(s.plan)) + ").";
        break;

      case "practice_active":
      case "plan_active":
        chip = "<span class='fsb-chip'>" + esc(planLabel(s.plan)) + "</span>";
        if (s.shadow) {
          msg = "<span class='fsb-muted'>Billing preview — enforcement " +
                "is still off, so nothing is blocked yet.</span>";
        } else {
          msg = "<span class='fsb-muted'>Current plan.</span>";
        }
        actions.push(makeAct("primary", "Upgrade", openPlanLadderModal));
        break;

      default:
        return null; // nothing worth a bar
    }

    return { sev: sev, chip: chip, msg: msg,
             actions: actions, quotas: quotaChipsHTML(ent),
             shadow: !!s.shadow };
  }

  function makeAct(kind, label, fn) {
    return { kind: kind, label: label, fn: fn };
  }

  function renderBanner() {
    try {
      const host = pickBannerHost();
      if (!host) return;
      let bar = document.getElementById("fsb-banner");
      const cfg = state.cfg;

      const show = cfg.mountBanner !== false &&
        (cfg.bannerMode !== "attention" || wantsAttentionBanner(state.ent));
      const model = show ? bannerModel(state.ent) : null;

      if (!model) { if (bar) bar.remove(); return; }
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "fsb-banner";
        bar.className = "fsb-banner";
        if (host.firstChild) host.insertBefore(bar, host.firstChild);
        else host.appendChild(bar);
      }
      bar.dataset.sev = model.sev;
      bar.innerHTML = model.chip +
        "<div class='fsb-banner-msg'>" + model.msg + "</div>" +
        model.quotas +
        model.actions.map(function (a, i) {
          return "<button type='button' class='fsb-btn " +
            (a.kind === "primary" ? "fsb-btn-primary" : "fsb-btn-ghost") +
            "' data-fsb-act='" + i + "'>" + esc(a.label) + "</button>";
        }).join("");
      [].forEach.call(bar.querySelectorAll("[data-fsb-act]"), function (btn) {
        btn.addEventListener("click", function () {
          const a = model.actions[Number(btn.dataset.fsbAct)];
          if (a && typeof a.fn === "function") a.fn();
        });
      });
    } catch (e) { warn("banner render failed (fail-open):", e); }
  }

  function wantsAttentionBanner(ent) {
    const k = deriveBannerState(ent).kind;
    return k !== "plan_active" && k !== "practice_active" && k !== "none";
  }

  function pickBannerHost() {
    if (state.cfg.bannerHost) {
      const el = document.querySelector(state.cfg.bannerHost);
      if (el) return el;
    }
    const cfg = window.FS_BILLING_CONFIG || {};
    if (cfg.bannerHost) {
      const el = document.querySelector(cfg.bannerHost);
      if (el) return el;
    }
    return document.querySelector("main") || document.body;
  }

  /* ============================================================
   * Modals (one shell, three contents + plan ladder)
   * ============================================================ */

  function ensureModalShell() {
    let ov = document.getElementById("fsb-modal-overlay");
    if (ov) return ov;
    ov = document.createElement("div");
    ov.id = "fsb-modal-overlay";
    ov.className = "fsb-overlay";
    ov.innerHTML = "<div class='fsb-modal' role='dialog' aria-modal='true'>" +
      "<div class='fsb-modal-head'>" +
        "<div class='fsb-modal-kicker' id='fsb-m-kicker'></div>" +
        "<h3 class='fsb-modal-title' id='fsb-m-title'></h3>" +
        "<p class='fsb-modal-sub' id='fsb-m-sub'></p>" +
      "</div>" +
      "<div class='fsb-modal-body' id='fsb-m-body'></div>" +
      "<div class='fsb-modal-foot'>" +
        "<button type='button' class='fsb-btn fsb-btn-ghost' id='fsb-m-later'>Maybe later</button>" +
        "<button type='button' class='fsb-btn fsb-btn-primary' id='fsb-m-cta'>Upgrade</button>" +
      "</div>" +
    "</div>";
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) {
      if (e.target === ov) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && ov.classList.contains("open")) closeModal();
    });
    document.getElementById("fsb-m-later").addEventListener("click", closeModal);
    return ov;
  }

  function openModal(opts) {
    const ov = ensureModalShell();
    document.getElementById("fsb-m-kicker").textContent = opts.kicker || "FinSage billing";
    document.getElementById("fsb-m-title").textContent = opts.title || "";
    document.getElementById("fsb-m-sub").innerHTML = opts.sub || "";
    document.getElementById("fsb-m-body").innerHTML = opts.body || "";
    const cta = document.getElementById("fsb-m-cta");
    cta.textContent = opts.cta || "Upgrade";
    cta.style.display = opts.cta ? "" : "none";
    cta.onclick = function () {
      (typeof opts.onCta === "function" ? opts.onCta : openPlanLadderModal)();
    };
    ov.classList.add("open");
  }

  function closeModal() {
    const ov = document.getElementById("fsb-modal-overlay");
    if (ov) ov.classList.remove("open");
  }

  function planLadderBody(ladder, currentCode, targetCode, featureLines) {
    const rows = ladder.map(function (code) {
      const cls = "fsb-planrow" +
        (code === currentCode ? " is-current" : "") +
        (code === targetCode ? " is-target" : "");
      const tag = code === currentCode ? "your plan"
        : code === targetCode ? "recommended"
        : "";
      return "<div class='" + cls + "'>" +
        "<span class='fsb-plan-name'>" + esc(planLabel(code)) + "</span>" +
        (tag ? "<span class='fsb-plan-tag'>" + tag + "</span>" : "") +
        "</div>";
    }).join("");
    const feats = (featureLines && featureLines.length)
      ? "<ul class='fsb-featlist'>" + featureLines.slice(0, 8).map(function (f) {
          return "<li>" + esc(f) + "</li>";
        }).join("") + "</ul>"
      : "";
    return rows + feats;
  }

  /** The module ladder (free→enterprise). Practice firms get their own. */
  function openPlanLadderModal() {
    const ent = state.ent || {};
    const plan = ent.plan_code || "free";
    const isPractice = String(plan).indexOf("practice_") === 0;
    const ladder = isPractice ? PRACTICE_LADDER : MODULE_LADDER;
    const target = isPractice
      ? nextPracticePlan(plan)
      : planLabelToCode(ent.next_tier);
    const upsell = (ent.upsell || []).slice(0, 8)
      .map(humanizeFeature);

    openModal({
      kicker: isPractice ? "Practice plans" : "Module plans",
      title: isPractice ? "Grow your practice" : "Upgrade your workspace",
      sub: "Everything on your current plan stays. Higher tiers unlock " +
           "more modules — your data and history are never touched by " +
           "an upgrade or a downgrade.",
      body: planLadderBody(ladder, plan, target, upsell),
      cta: isPractice ? "See practice plans" : "Continue",
      onCta: isPractice ? function () {
        closeModal();
        openPracticePlansModal();
      } : null,
    });
  }

  function planLabelToCode(nameOrCode) {
    if (!nameOrCode) return null;
    const code = String(nameOrCode).toLowerCase();
    if (PLAN_RANK[code] != null) return code;
    return null;
  }

  function nextPracticePlan(code) {
    const i = PRACTICE_LADDER.indexOf(code);
    return i >= 0 && i < PRACTICE_LADDER.length - 1
      ? PRACTICE_LADDER[i + 1] : null;
  }

  function openUpgradeModal(body) {
    const ent = state.ent || {};
    const feature = body.feature ? humanizeFeature(body.feature) : "";
    const required = body.required_plan ? planLabelToCode(body.required_plan) : null;
    const quota = body.quota;
    let sub, extraBody = "";

    if (quota && quota.limit != null) {
      sub = "You have used <b>" + esc(quota.used) + " of " + esc(quota.limit) +
            "</b> this month on the " + esc(planLabel(body.company_plan)) +
            " plan. " + feature + " continues next month — or upgrade now " +
            "for a higher allowance.";
      extraBody = "";
    } else {
      sub = (feature ? "<b>" + esc(feature) + "</b> is " : "This module is ") +
        "included from <b>" + esc(planLabel(required || ent.next_tier || "business")) +
        "</b> — your workspace is on <b>" +
        esc(planLabel(body.company_plan || ent.plan_code)) + "</b>.";
      const upsell = (ent.upsell || []).map(humanizeFeature);
      extraBody = planLadderBody(MODULE_LADDER,
        ent.plan_code || "free", required || planLabelToCode(ent.next_tier),
        upsell);
    }

    openModal({
      kicker: "Upgrade required",
      title: quota ? "Monthly allowance reached" : "Available on a higher plan",
      sub: sub,
      body: extraBody,
      cta: "See plans",
    });
  }

  function openReactivateModal() {
    const ent = state.ent || {};
    const b = ent.billing || {};
    openModal({
      kicker: "Subscription",
      title: "Workspace is read-only",
      sub: "Your subscription lapsed" +
        (b.grace_ends_at ? " — read-only access lasts until <b>" +
          esc(fmtDate(b.grace_ends_at)) + "</b>" : "") +
        ". After that window the workspace drops to the Free plan " +
        "(data kept, gated modules paused).",
      body: "<ul class='fsb-featlist'>" +
        "<li>Approval decisions and report exports still work</li>" +
        "<li>Nothing is deleted during the grace window</li>" +
        "<li>Reactivate from the same plan and everything resumes instantly</li>" +
        "</ul>",
      cta: "Reactivate",
    });
  }

  function openPracticeLimitModal(body) {
    const used = body && body.quota && body.quota.used != null
      ? body.quota.used : (state.practice && state.practice.clients
        ? state.practice.clients.used : null);
    const limit = body && body.quota && body.quota.limit != null
      ? body.quota.limit : (state.practice && state.practice.clients
        ? state.practice.clients.limit : null);
    const nextPlan = (body && body.next_practice_plan) ||
      (state.practice && state.practice.next_practice_plan) || "practice_firm";

    openModal({
      kicker: "Practice plan",
      title: "Client company limit reached",
      sub: "You have <b>" + esc(used != null ? used : "…") +
        (limit != null ? " of " + esc(limit) : "") +
        "</b> client companies on " +
        esc(planLabel((state.practice && state.practice.plan_code) ||
          "your practice plan")) +
        ". Existing clients are untouched — provisioning new workspaces " +
        "needs the next practice plan.",
      body: "<div class='fsb-planrow is-target'>" +
        "<span class='fsb-plan-name'>" + esc(planLabel(nextPlan)) + "</span>" +
        "<span class='fsb-plan-tag'>recommended</span></div>" +
        "<p class='fsb-modal-sub'>Practice plans bundle your own-books " +
        "tier, the practice toolkit and the client allowance — " +
        "delegated work keeps the same uplift rules.</p>",
      cta: "See practice plans",
      onCta: openPracticePlansModal,
    });
  }

  function openPracticePlansModal() {
    loadPracticeOverview().then(function (pr) {
      const catalog = (pr && pr.plans_catalog) || [];
      const ladder = catalog.length ? catalog.map(function (p) {
        return p.plan_code; }) : PRACTICE_LADDER;
      const current = pr && pr.plan_code;
      const target = (pr && pr.next_practice_plan) || nextPracticePlan(current);
      const rows = ladder.map(function (code) {
        const p = catalog.filter(function (c) { return c.plan_code === code; })[0];
        const clients = p && p.limits && p.limits.client_companies != null
          ? p.limits.client_companies
          : (code === "practice_starter" ? 5 :
             code === "practice_growth" ? 25 : "unlimited");
        const cls = "fsb-planrow" +
          (code === current ? " is-current" : "") +
          (code === target ? " is-target" : "");
        const tag = code === current ? "your plan"
          : code === target ? "recommended" : "";
        return "<div class='" + cls + "'>" +
          "<span class='fsb-plan-name'>" + esc(planLabel(code)) + "</span>" +
          "<span class='fsb-muted' style='font-size:12px'>up to " +
          esc(String(clients)) + " client companies</span>" +
          (tag ? "<span class='fsb-plan-tag'>" + tag + "</span>" : "") +
          "</div>";
      }).join("");
      openModal({
        kicker: "Practice plans",
        title: "Choose your practice plan",
        sub: "One subscription for the firm: your own books tier, the " +
             "practice toolkit and how many client companies you can " +
             "provision. 90-day no-card trial available.",
        body: rows,
        cta: null,
      });
    }).catch(function () {
      openModal({
        kicker: "Practice plans",
        title: "Practice plans",
        sub: "Practice Starter (5 clients), Practice Growth (25) and " +
             "Practice Firm (unlimited). Reach out and we will set you up.",
        body: "",
        cta: null,
      });
    });
  }

  /* ============================================================
   * Global 403 interceptor — backend stays authoritative
   * ============================================================ */

  function handleDeniedBody(body) {
    const kind = routeError(body);
    if (!kind) return false;
    try {
      if (kind === ERR.UPGRADE) openUpgradeModal(body);
      else if (kind === ERR.EXPIRED) openReactivateModal();
      else if (kind === ERR.PRACTICE) openPracticeLimitModal(body);
    } catch (e) { warn("modal failed:", e); }
    return true;
  }

  function patchFetch() {
    if (state.fetchPatched || typeof window.fetch !== "function") return;
    state.fetchPatched = true;
    const orig = window.fetch;
    window.fetch = function (input, init) {
      const p = orig.apply(this, arguments);
      // peek a CLONE — the caller's response/body stays untouched
      try {
        p.then(function (res) {
          if (!res || res.status !== 403) return;
          const ct = (res.headers && res.headers.get) ?
            (res.headers.get("Content-Type") || "") : "";
          if (ct.indexOf("application/json") === -1) return;
          res.clone().text().then(function (txt) {
            let body = null;
            try { body = JSON.parse(txt); } catch (e) { return; }
            if (handleDeniedBody(body)) {
              log("403", body && body.error, "→ modal shown (response passed through)");
            }
          }).catch(function () {});
        }).catch(function () {});
      } catch (e) {}
      return p;
    };
  }

  function patchApiFetch() {
    if (state.apiFetchPatched) return;
    if (typeof window.apiFetch !== "function") return;
    state.apiFetchPatched = true;
    const orig = window.apiFetch;
    window.apiFetch = function (url, options) {
      const p = orig.apply(this, arguments);
      try {
        p.catch(function (err) {
          try {
            if (err && err.status === 403) {
              if (handleDeniedBody(err.data)) {
                log("403 via apiFetch", err.data && err.data.error,
                    "→ modal shown (error rethrown)");
              }
            }
          } catch (e) {}
        });
      } catch (e) {}
      return p;
    };
  }

  /* ============================================================
   * Nav gating overlay + data-feature hiding
   * ============================================================ */

  function applyNavGating() {
    try {
      const host = document.getElementById("mainNav");
      if (!host) return;
      const ent = state.ent;
      const shadow = ent && (ent.mode || "") !== "enforce";
      const tier = effectiveTier(ent);

      [].forEach.call(host.querySelectorAll("a[data-nav]"), function (a) {
        const screen = a.getAttribute("data-nav");
        const min = SCREEN_TIERS[String(screen)];
        const li = a.closest("li") || a;
        // reset our marks first (re-applies must be idempotent)
        a.classList.remove("fsb-navlocked");
        const badge = a.querySelector(".fsb-navbadge");
        if (badge) badge.remove();
        a.removeAttribute("data-fsb-locked");

        if (!min || !ent) return;
        if (tier >= min) return;

        if (shadow || state.cfg.hideLockedNav === false) {
          // shadow / explicit keep-visible: badge, still clickable
          const b = document.createElement("span");
          b.className = "fsb-navbadge";
          b.textContent = (shadow ? "preview" : "plan");
          b.title = "Included from " + planLabel(tierName(min)) +
            " — enforcement is " + (shadow ? "in preview" : "on");
          a.appendChild(b);
        } else {
          li.classList.add("fsb-hidden");
          a.setAttribute("data-fsb-locked", String(min));
        }
      });
    } catch (e) { warn("nav gating failed (fail-open):", e); }
  }

  function tierName(t) {
    return { 0: "free", 1: "business", 2: "premium", 3: "enterprise" }[t] || "free";
  }

  function observeNav() {
    if (state.navObserved) return;
    const host = document.getElementById("mainNav");
    if (!host || typeof MutationObserver !== "function") return;
    state.navObserved = true;
    // NAV_MENU re-renders wipe our marks — re-apply when it happens.
    new MutationObserver(function () { applyNavGating(); })
      .observe(host, { childList: true, subtree: true });
  }

  function applyFeatureAttributes() {
    try {
      if (!state.ent) return;
      [].forEach.call(
        document.querySelectorAll("[data-feature]"),
        function (el) {
          const key = el.getAttribute("data-feature");
          if (!key) return;
          if (canFeature(key)) el.classList.remove("fsb-hidden");
          else if ((state.ent.mode || "") === "enforce") {
            el.classList.add("fsb-hidden");
          }
        });
    } catch (e) { warn("data-feature pass failed (fail-open):", e); }
  }

  /* ============================================================
   * Practice overview panel (practitioner dashboard)
   * ============================================================ */

  function practicePanelHTML(pr) {
    if (!pr) return "";
    if (pr.view === "delegated_session") {
      return "<div class='fsb-panel'>" +
        "<div class='fsb-modal-sub'>You are inside a client workspace " +
        "under a delegated engagement (firm company #" +
        esc(pr.source_company_id) + "). This session's entitlements come " +
        "from the firm's practice plan — open the firm's own company to " +
        "see plan and usage.</div></div>";
    }
    if (!pr.on_practice_plan) {
      return "<div class='fsb-panel'>" +
        "<div class='fsb-modal-title' style='font-size:16px'>Practice plans</div>" +
        "<div class='fsb-modal-sub'>This firm is not on a practice plan " +
        "yet. Practice Starter bundles business-tier own books and up to " +
        "5 client companies, with a 90-day no-card trial.</div>" +
        "<div style='margin-top:12px'>" +
        "<button type='button' class='fsb-btn fsb-btn-primary' " +
        "data-fsb-open-practice>See practice plans</button></div></div>";
    }

    const c = pr.clients || {};
    const b = quotaBar({ used: c.used, limit: c.limit,
      unlimited: !!c.unlimited });
    const roster = (pr.clients_list || []).map(function (cl) {
      return "<tr><td><b>" + esc(cl.name || ("Company #" + cl.company_id)) +
        "</b></td><td>" + esc(cl.industry || "—") + "</td>" +
        "<td><span class='fsb-chip fsb-ghost'>" +
        esc(planLabel(cl.plan_code)) + "</span></td>" +
        "<td>" + esc(cl.status || "—") + "</td></tr>";
    }).join("");

    const next = pr.next_practice_plan;
    const meterTitle = c.unlimited
      ? "Client companies: " + esc(c.used) + " (unlimited)"
      : "Client companies: " + esc(c.used) + " of " + esc(c.limit);

    return "<div class='fsb-panel'>" +
      "<div style='display:flex;align-items:center;gap:10px;flex-wrap:wrap'>" +
        "<span class='fsb-chip'>" + esc(planLabel(pr.plan_code)) + "</span>" +
        "<span class='fsb-chip fsb-ghost'>" + esc(pr.status || "—") + "</span>" +
        "<span class='fsb-muted' style='font-size:12px'>delegated work " +
        "runs at tier " + esc(pr.uplift_to_tier) + "</span>" +
      "</div>" +
      "<div style='margin:14px 0 6px;font-weight:700'>" + meterTitle + "</div>" +
      "<div class='fsb-meter'><div class='fsb-meter-fill " +
        (b.severity === "full" ? "fsb-full" :
         b.severity === "warn" ? "fsb-warn" : "") +
        "' style='width:" + (c.unlimited ? 8 : b.pct) + "%'></div></div>" +
      (!c.unlimited && next ?
        "<div style='margin-top:10px;font-size:12.5px' class='fsb-muted'>Need " +
        "room for more clients? <b>" + esc(planLabel(next)) + "</b> is one " +
        "step up." +
        " <button type='button' class='fsb-btn fsb-btn-primary' " +
        "style='margin-left:8px' data-fsb-open-practice>See plans</button></div>" : "") +
      (roster ?
        "<div style='margin-top:16px;font-weight:700'>Client roster</div>" +
        "<table><thead><tr><th>Company</th><th>Industry</th>" +
        "<th>Their plan</th><th>Status</th></tr></thead><tbody>" +
        roster + "</tbody></table>" :
        "") +
      "</div>";
  }

  function mountPracticeOverview(host) {
    if (!host) return null;
    injectCSS();
    const panel = document.createElement("div");
    panel.className = "fsb-panel";
    panel.innerHTML = "<div class='fsb-muted'>Loading practice plan…</div>";
    host.appendChild(panel);
    state.panels.push(panel);

    panel.addEventListener("click", function (e) {
      if (e.target && e.target.hasAttribute &&
          e.target.hasAttribute("data-fsb-open-practice")) {
        e.preventDefault();
        openPracticePlansModal();
      }
    });

    loadPracticeOverview().then(function (pr) {
      panel.innerHTML = pr
        ? practicePanelHTML(pr)
        : "<div class='fsb-muted'>Practice overview unavailable.</div>";
    });
    return panel;
  }

  function refreshPanels() {
    [].forEach.call(state.panels, function (panel) {
      if (!panel || !panel.isConnected) return;
      loadPracticeOverview().then(function (pr) {
        if (pr) panel.innerHTML = practicePanelHTML(pr);
      });
    });
  }

  /* ============================================================
   * Public API + auto-init
   * ============================================================ */

  function refresh(force) {
    return loadEntitlements(force !== false).then(function (ent) {
      renderBanner();
      applyFeatureAttributes();
      applyNavGating();
      return ent;
    });
  }

  window.FinSageBilling = {
    version: "6.0.0",
    init: function (cfg) {
      try {
        Object.assign(state.cfg, cfg || {});
        injectCSS();
        patchFetch();
        patchApiFetch();
        observeNav();
        return refresh(true);
      } catch (e) {
        warn("init failed (fail-open):", e);
        return Promise.resolve(null);
      }
    },
    refresh: function () { return refresh(true); },
    state: function () { return state.ent; },
    practice: function () { return state.practice; },
    can: canFeature,
    canScreen: canScreen,
    companyId: resolveCompanyId,
    openUpgrade: openPlanLadderModal,
    openReactivate: openReactivateModal,
    openPracticePlans: openPracticePlansModal,
    mountPracticeOverview: mountPracticeOverview,
    closeModal: closeModal,
    // test seams (pure functions only)
    __internals: {
      SCREEN_TIERS: SCREEN_TIERS,
      FEATURE_LABELS: FEATURE_LABELS,
      PLAN_RANK: PLAN_RANK,
      MODULE_LADDER: MODULE_LADDER,
      PRACTICE_LADDER: PRACTICE_LADDER,
      ERR: ERR,
      deriveBannerState: deriveBannerState,
      quotaBar: quotaBar,
      routeError: routeError,
      effectiveTier: effectiveTier,
      humanizeFeature: humanizeFeature,
      planLabel: planLabel,
    },
  };

  function autoInit() {
    try {
      if (window.FS_BILLING_DISABLED === true) { log("disabled by flag"); return; }
      // practitioner dashboard: banner is noise there — panels opt in.
      const isPractitioner = !!document.getElementById("prSidebarNav");
      window.FinSageBilling.init({
        mountBanner: !isPractitioner,
        companyId: (window.FS_BILLING_CONFIG || {}).companyId,
      });
      // apiFetch may not exist yet when this file loads first — retry once
      setTimeout(patchApiFetch, 1500);
      setTimeout(patchApiFetch, 6000);
    } catch (e) { warn("auto-init failed (fail-open):", e); }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }
})();
