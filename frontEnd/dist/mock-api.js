/* ══════════════════════════════════════════════════════════════════
   FinSage — DEMO MOCK LAYER
   ------------------------------------------------------------------
   Loads BEFORE dashboard.js. It:
     1. Defines window.APP_CONFIG (normally served by /config.js)
     2. Seeds a demo auth token + user in localStorage
     3. Intercepts window.fetch for /api/* and serves realistic
        dummy data so every screen can render offline
     4. Renders a small "DEMO" helper bubble (guide + reset)

   No application code is modified — dashboard.js runs untouched,
   so the side-nav behaviour is 100% the real thing.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── 1) Config ──────────────────────────────────────────────── */
  window.APP_CONFIG = { API_BASE: "" };
  window.FS_DEMO_MODE = true;

  /* ── 2) Auth seed (token + role) ────────────────────────────── */
  var PERM_KEYS = [
    "can_access_enterprise_dashboard", "can_access_practitioner_dashboard",
    "can_access_delegated_posting_workspace", "can_post_journals",
    "can_prepare_financials", "can_view_reports", "can_manage_ar",
    "can_manage_ap", "can_manage_banking", "can_manage_loans",
    "can_manage_fixed_assets", "can_manage_payroll", "can_manage_users",
    "can_manage_company_setup", "can_edit_tax_settings",
    "can_view_control_room", "can_view_ar_ap_controls",
    "can_lock_periods", "can_approve", "can_view_pos_summaries",
    "can_access_pos", "can_manage_pos"
  ];

  var PERMISSIONS = PERM_KEYS.reduce(function (acc, k) {
    acc[k] = true; return acc;
  }, {});

  function b64url(obj) {
    return btoa(JSON.stringify(obj)).replace(/=+$/, "");
  }

  var DEMO_TOKEN_PAYLOAD = {
    sub: 7,
    email: "thabo@mokokotrading.co.za",
    role: "senior",
    company_id: 42,
    access_scope: "core",
    permissions: PERMISSIONS,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
  };

  var DEMO_TOKEN = ["demo", b64url(DEMO_TOKEN_PAYLOAD), "demo-signature"].join(".");

  try {
    if (localStorage.getItem("fs_user_token") !== DEMO_TOKEN) {
      localStorage.setItem("fs_user_token", DEMO_TOKEN);
    }
    sessionStorage.setItem("fs_user_token", DEMO_TOKEN);
    localStorage.setItem("userRole", "senior");
    localStorage.setItem("company_id", "42");
    localStorage.setItem("fs_industry", "retail");
  } catch (e) { /* storage blocked — demo still works in-memory */ }

  /* ── 3) Demo dataset ────────────────────────────────────────── */
  var now = new Date();
  var Y = now.getFullYear(), M = now.getMonth();
  var daysInMonth = new Date(Y, M + 1, 0).getDate();
  var day = function (n) { return Math.min(n, daysInMonth); };
  var iso = function (y, m, d) {
    return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  };
  // dates inside the current month (so the default "current month" filter shows them)
  var D = function (n) { return iso(Y, M, day(n)); };
  // previous month
  var PM_Y = M === 0 ? Y - 1 : Y;
  var PM_M = M === 0 ? 11 : M - 1;
  var PD = function (n) { return iso(PM_Y, PM_M, n); };

  var MONTH_LABEL = now.toLocaleString("en-ZA", { month: "long", year: "numeric" });

  var COMPANY = {
    id: 42,
    name: "Mokoko Trading (Pty) Ltd",
    company_name: "Mokoko Trading (Pty) Ltd",
    slug: "",
    industry: "retail",
    sub_industry: "general_retail",
    is_enterprise: true,
    owner_user_id: 7,
    uses_cogs: true,
    inventory_mode: "perpetual",
    features: { "inventory-module": true, "service-billing": true },
    vat_settings: {
      vat_input_code: "BS_CA_1410",
      vat_output_code: "BS_CL_2310",
      vat_rate: 15,
      authority_code: "SARS",
      vat_period: "bi_monthly"
    },
    industry_profile: { uses_cogs: true },
    physical_address: "14 Kruger Street, Springs, Gauteng, 1559",
    currency: "ZAR",
    reporting_currency: "ZAR"
  };

  var USER = {
    id: 7,
    email: "thabo@mokokotrading.co.za",
    name: "Thabo Mokoena",
    full_name: "Thabo Mokoena",
    role: "senior",
    system_role: "senior",
    company_id: 42,
    company_name: "Mokoko Trading (Pty) Ltd",
    company: COMPANY,
    dashboards: { enterprise: true, practitioner: true },
    permissions: PERMISSIONS
  };

  /* Chart of accounts — FinSage reporting codes */
  var COA = [
    { code: "BS_CA_1000", name: "Business Bank Account", section: "assets", category: "Cash & Bank", standard: "IAS 7", cf_bucket: "cash", cf_section: "operating", posting: true, template_code: "BS_CA_1000" },
    { code: "BS_CA_1010", name: "Petty Cash", section: "assets", category: "Cash & Bank", standard: "IAS 7", cf_bucket: "cash", cf_section: "operating", posting: true, template_code: "BS_CA_1010" },
    { code: "BS_CA_1200", name: "Accounts Receivable", section: "assets", category: "Receivables", standard: "IFRS 9", cf_bucket: null, cf_section: "operating", posting: true, template_code: "BS_CA_1200" },
    { code: "BS_CA_1300", name: "Inventory on Hand", section: "assets", category: "Inventory", standard: "IAS 2", cf_bucket: null, cf_section: "operating", posting: true, template_code: "BS_CA_1300" },
    { code: "BS_CA_1400", name: "Equipment at Cost", section: "assets", category: "Fixed Assets", standard: "IAS 16", cf_bucket: null, cf_section: "investing", posting: true, template_code: "BS_CA_1400" },
    { code: "BS_CA_1450", name: "Accumulated Depreciation - Equipment", section: "assets", category: "Fixed Assets", standard: "IAS 16", cf_bucket: null, cf_section: "operating", posting: true, template_code: "BS_CA_1450" },
    { code: "BS_CA_1410", name: "VAT Input", section: "assets", category: "Tax", standard: "IAS 12", cf_bucket: null, cf_section: "operating", posting: true, template_code: "BS_CA_1410" },
    { code: "BS_CL_2000", name: "Accounts Payable", section: "liabilities", category: "Payables", standard: "IAS 1", cf_bucket: null, cf_section: "operating", posting: true, template_code: "BS_CL_2000" },
    { code: "BS_CL_2110", name: "PAYE Payable", section: "liabilities", category: "Tax", standard: "IAS 12", cf_bucket: null, cf_section: "operating", posting: true, template_code: "BS_CL_2110" },
    { code: "BS_CL_2310", name: "VAT Output", section: "liabilities", category: "Tax", standard: "IAS 12", cf_bucket: null, cf_section: "operating", posting: true, template_code: "BS_CL_2310" },
    { code: "BS_CL_2400", name: "Long-term Borrowing", section: "liabilities", category: "Loans", standard: "IFRS 9", cf_bucket: null, cf_section: "financing", posting: true, template_code: "BS_CL_2400" },
    { code: "BS_EQ_3000", name: "Share Capital", section: "equity", category: "Capital", standard: "IAS 1", cf_bucket: null, cf_section: "financing", posting: true, template_code: "BS_EQ_3000" },
    { code: "BS_EQ_3100", name: "Retained Earnings", section: "equity", category: "Capital", standard: "IAS 1", cf_bucket: null, cf_section: "financing", posting: false, template_code: "BS_EQ_3100" },
    { code: "PL_REV_4000", name: "Sales Revenue", section: "income", category: "Revenue", standard: "IFRS 15", cf_bucket: "inflow", cf_section: "operating", posting: true, template_code: "PL_REV_4000" },
    { code: "PL_IN_4100", name: "Other Income", section: "income", category: "Revenue", standard: "IFRS 15", cf_bucket: "inflow", cf_section: "operating", posting: true, template_code: "PL_IN_4100" },
    { code: "PL_CGS_5000", name: "Cost of Sales", section: "expenses", category: "Cost of Sales", standard: "IAS 2", cf_bucket: "outflow", cf_section: "operating", posting: true, template_code: "PL_CGS_5000" },
    { code: "PL_EX_6000", name: "Salaries & Wages", section: "expenses", category: "Operating Expenses", standard: "IAS 19", cf_bucket: "outflow", cf_section: "operating", posting: true, template_code: "PL_EX_6000" },
    { code: "PL_EX_6100", name: "Rent Expense", section: "expenses", category: "Operating Expenses", standard: "IFRS 16", cf_bucket: "outflow", cf_section: "operating", posting: true, template_code: "PL_EX_6100" },
    { code: "PL_EX_6200", name: "Utilities", section: "expenses", category: "Operating Expenses", standard: "IAS 1", cf_bucket: "outflow", cf_section: "operating", posting: true, template_code: "PL_EX_6200" },
    { code: "PL_EX_6300", name: "Fuel Expense", section: "expenses", category: "Operating Expenses", standard: "IAS 1", cf_bucket: "outflow", cf_section: "operating", posting: true, template_code: "PL_EX_6300" },
    { code: "PL_EX_6400", name: "Office Supplies", section: "expenses", category: "Operating Expenses", standard: "IAS 1", cf_bucket: "outflow", cf_section: "operating", posting: true, template_code: "PL_EX_6400" },
    { code: "PL_EX_6500", name: "Card & Transaction Fees", section: "expenses", category: "Operating Expenses", standard: "IAS 1", cf_bucket: "outflow", cf_section: "operating", posting: true, template_code: "PL_EX_6500" }
  ];

  /* Journals — balanced batches, sources: manual / invoice / bank */
  var JOURNAL_SEQ = 1038;
  var JOURNALS = [
    {
      id: ++JOURNAL_SEQ, date: PD(24), ref: "JE-1038", source: "manual",
      description: "Utilities - municipal account September",
      lines: [
        { account_code: "PL_EX_6200", debit: 3200, credit: 0, is_vat: false },
        { account_code: "BS_CA_1410", debit: 480, credit: 0, is_vat: true },
        { account_code: "BS_CA_1000", debit: 0, credit: 3680, is_vat: false }
      ]
    },
    {
      id: ++JOURNAL_SEQ, date: D(1), ref: "JE-1041", source: "manual",
      description: "Owner capital injection - " + MONTH_LABEL,
      lines: [
        { account_code: "BS_CA_1000", debit: 50000, credit: 0, is_vat: false },
        { account_code: "BS_EQ_3000", debit: 0, credit: 50000, is_vat: false }
      ]
    },
    {
      id: ++JOURNAL_SEQ, date: D(2), ref: "JE-1042", source: "manual",
      description: "Office rent - " + MONTH_LABEL + " (Krugersdorp Park)",
      lines: [
        { account_code: "PL_EX_6100", debit: 12000, credit: 0, is_vat: false },
        { account_code: "BS_CA_1410", debit: 1800, credit: 0, is_vat: true },
        { account_code: "BS_CA_1000", debit: 0, credit: 13800, is_vat: false }
      ]
    },
    {
      id: ++JOURNAL_SEQ, date: D(3), ref: "JE-1043", source: "invoice",
      description: "Invoice posted: INV-2026-0142 - Springs Retail",
      lines: [
        { account_code: "BS_CA_1200", debit: 28750, credit: 0, is_vat: false },
        { account_code: "PL_REV_4000", debit: 0, credit: 25000, is_vat: false },
        { account_code: "BS_CL_2310", debit: 0, credit: 3750, is_vat: true }
      ]
    },
    {
      id: ++JOURNAL_SEQ, date: D(4), ref: "JE-1044", source: "manual",
      description: "Fuel - delivery van (Sasol)",
      lines: [
        { account_code: "PL_EX_6300", debit: 2500, credit: 0, is_vat: false },
        { account_code: "BS_CA_1410", debit: 375, credit: 0, is_vat: true },
        { account_code: "BS_CA_1000", debit: 0, credit: 2875, is_vat: false }
      ]
    },
    {
      id: ++JOURNAL_SEQ, date: D(5), ref: "JE-1045", source: "manual",
      description: "Inventory purchase - Bidvest Foodservice",
      lines: [
        { account_code: "BS_CA_1300", debit: 18000, credit: 0, is_vat: false },
        { account_code: "BS_CA_1410", debit: 2700, credit: 0, is_vat: true },
        { account_code: "BS_CL_2000", debit: 0, credit: 20700, is_vat: false }
      ]
    },
    {
      id: ++JOURNAL_SEQ, date: D(6), ref: "JE-1046", source: "manual",
      description: "Salaries - " + MONTH_LABEL + " payroll",
      lines: [
        { account_code: "PL_EX_6000", debit: 22000, credit: 0, is_vat: false },
        { account_code: "BS_CA_1000", debit: 0, credit: 19440, is_vat: false },
        { account_code: "BS_CL_2110", debit: 0, credit: 2560, is_vat: false }
      ]
    },
    {
      id: ++JOURNAL_SEQ, date: D(7), ref: "JE-1047", source: "manual",
      description: "Cash sale - Woodmead walk-in",
      lines: [
        { account_code: "BS_CA_1000", debit: 11500, credit: 0, is_vat: false },
        { account_code: "PL_REV_4000", debit: 0, credit: 10000, is_vat: false },
        { account_code: "BS_CL_2310", debit: 0, credit: 1500, is_vat: true }
      ]
    },
    {
      id: ++JOURNAL_SEQ, date: D(8), ref: "JE-1048", source: "invoice",
      description: "Invoice posted: INV-2026-0147 - Cape Union Distributors",
      lines: [
        { account_code: "BS_CA_1200", debit: 46000, credit: 0, is_vat: false },
        { account_code: "PL_REV_4000", debit: 0, credit: 40000, is_vat: false },
        { account_code: "BS_CL_2310", debit: 0, credit: 6000, is_vat: true }
      ]
    },
    {
      id: ++JOURNAL_SEQ, date: D(9), ref: "JE-1049", source: "manual",
      description: "Cost of sales - goods sold " + MONTH_LABEL,
      lines: [
        { account_code: "PL_CGS_5000", debit: 24300, credit: 0, is_vat: false },
        { account_code: "BS_CA_1300", debit: 0, credit: 24300, is_vat: false }
      ]
    }
  ];

  /* Trial balance (as at today) — Dr total = Cr total = 947,200 */
  var TB_ROWS = [
    { name: "Business Bank Account", category: "Cash & Bank", section: "assets", debit: 486240, credit: 0, closing_balance: 486240 },
    { name: "Petty Cash", category: "Cash & Bank", section: "assets", debit: 2500, credit: 0, closing_balance: 2500 },
    { name: "Accounts Receivable", category: "Receivables", section: "assets", debit: 84320, credit: 0, closing_balance: 84320 },
    { name: "Inventory on Hand", category: "Inventory", section: "assets", debit: 79750, credit: 0, closing_balance: 79750 },
    { name: "VAT Input", category: "Tax", section: "assets", debit: 8955, credit: 0, closing_balance: 8955 },
    { name: "Equipment at Cost", category: "Fixed Assets", section: "assets", debit: 185000, credit: 0, closing_balance: 185000 },
    { name: "Accumulated Depreciation - Equipment", category: "Fixed Assets", section: "assets", debit: 0, credit: 46250, closing_balance: -46250 },
    { name: "Accounts Payable", category: "Payables", section: "liabilities", debit: 0, credit: 52410, closing_balance: -52410 },
    { name: "PAYE Payable", category: "Tax", section: "liabilities", debit: 0, credit: 6890, closing_balance: -6890 },
    { name: "VAT Output", category: "Tax", section: "liabilities", debit: 0, credit: 14760, closing_balance: -14760 },
    { name: "Long-term Borrowing", category: "Loans", section: "liabilities", debit: 0, credit: 120000, closing_balance: -120000 },
    { name: "Share Capital", category: "Capital", section: "equity", debit: 0, credit: 100000, closing_balance: -100000 },
    { name: "Retained Earnings", category: "Capital", section: "equity", debit: 0, credit: 464590, closing_balance: -464590 },
    { name: "Sales Revenue", category: "Revenue", section: "income", debit: 0, credit: 142300, closing_balance: -142300 },
    { name: "Cost of Sales", category: "Cost of Sales", section: "expenses", debit: 58120, credit: 0, closing_balance: 58120 },
    { name: "Salaries & Wages", category: "Operating Expenses", section: "expenses", debit: 22000, credit: 0, closing_balance: 22000 },
    { name: "Rent Expense", category: "Operating Expenses", section: "expenses", debit: 12000, credit: 0, closing_balance: 12000 },
    { name: "Utilities", category: "Operating Expenses", section: "expenses", debit: 3680, credit: 0, closing_balance: 3680 },
    { name: "Fuel Expense", category: "Operating Expenses", section: "expenses", debit: 2875, credit: 0, closing_balance: 2875 },
    { name: "Office Supplies", category: "Operating Expenses", section: "expenses", debit: 1140, credit: 0, closing_balance: 1140 },
    { name: "Card & Transaction Fees", category: "Operating Expenses", section: "expenses", debit: 620, credit: 0, closing_balance: 620 }
  ];

  var PNL_ROWS = [
    { label: "Revenue", amount: 75000 },
    { label: "Cost of Sales", amount: -24300 },
    { label: "Gross Profit", amount: 50700 },
    { label: "Operating Expenses", amount: -36500 },
    { label: "Net Profit", amount: 14200 }
  ];

  var BS_ROWS = [
    { section: "asset", label: "Bank & Cash", amount: 488740 },
    { section: "asset", label: "Accounts Receivable", amount: 84320 },
    { section: "asset", label: "Inventory", amount: 79750 },
    { section: "asset", label: "VAT Input", amount: 8955 },
    { section: "asset", label: "Equipment (net)", amount: 138750 },
    { section: "asset", label: "Total Assets", amount: 800515 },
    { section: "liability", label: "Accounts Payable", amount: 52410 },
    { section: "liability", label: "PAYE Payable", amount: 6890 },
    { section: "liability", label: "VAT Output", amount: 14760 },
    { section: "liability", label: "Long-term Borrowing", amount: 120000 },
    { section: "liability", label: "Total Liabilities", amount: 194060 },
    { section: "equity", label: "Share Capital", amount: 100000 },
    { section: "equity", label: "Retained Earnings", amount: 464590 },
    { section: "equity", label: "Current Year Earnings", amount: 41865 },
    { section: "equity", label: "Total Equity", amount: 606455 },
    { section: "check", label: "Balance Check", amount: 0 }
  ];

  var CF_ROWS = [
    { section: "operating", label: "Receipts from customers", amount: 11500 },
    { section: "operating", label: "Payments to suppliers & employees", amount: -36115 },
    { section: "investing", label: "Purchase of equipment", amount: 0 },
    { section: "financing", label: "Owner capital injection", amount: 50000 }
  ];

  var SNAPSHOT = {
    meta: {
      from: D(1),
      to: iso(Y, M, daysInMonth),
      label: "This month (" + MONTH_LABEL + ")"
    },
    pnl: {
      revenue: 75000, cogs: 24300, grossProfit: 50700, expenses: 36500,
      netProfit: 14200, grossMarginPct: 67.6, netMarginPct: 18.9
    },
    balanceSheet: { assets: 800515, liabilities: 194060, equity: 606455, check: 0 },
    counts: { customers: 12, vendors: 8 },
    aging: {
      ar: { current: 0, "0_30": 51320, "31_60": 18400, "61_90": 9600, "91_120": 3500, "121_plus": 1500, total: 84320 },
      ap: { current: 22410, "1_30": 18000, "31_60": 9000, "61_90": 3000, "91_plus": 0, total: 52410 }
    },
    vat: { net: 375 },
    fixedAssets: {
      bookValue: 185000, accumDepreciation: 46250,
      netCarryingAmount: 138750, pendingDepreciationCount: 2
    },
    inventory: { value: 79750, items: 34, lowStock: 3 }
  };

  var WORKQUEUE = {
    items: [
      { type: "draft_invoices", title: "Draft invoices awaiting posting", hint: "2 customer invoices are ready to post", count: 2, amount: 12400, severity: "warning", screen: "ar-invoices" },
      { type: "ap_overdue", title: "Vendor bills past due date", hint: "Settle or reschedule to avoid penalties", count: 2, amount: 9850, severity: "danger", screen: "ap" },
      { type: "bank_recon", title: "Unmatched bank statement lines", hint: "Match these in Bank Reconciliation", count: 5, amount: 8320, severity: "info", screen: "bank-recon" },
      { type: "vat_period", title: "VAT period closing soon", hint: "Review VAT 201 figures before submission", count: 1, amount: 375, severity: "success", screen: "vat" }
    ]
  };

  var CUSTOMERS = [
    { id: 1, name: "Springs Retail (Pty) Ltd", email: "accounts@springsretail.co.za", phone: "011 812 4455", credit_limit: 60000, balance: 28750, kyc_status: "approved", status: "active" },
    { id: 2, name: "Cape Union Distributors", email: "debtors@capeunion.co.za", phone: "021 552 7781", credit_limit: 75000, balance: 46000, kyc_status: "approved", status: "active" },
    { id: 3, name: "Woodmead Traders cc", email: "info@woodmeadtraders.co.za", phone: "011 802 3310", credit_limit: 25000, balance: 9570, kyc_status: "approved", status: "active" },
    { id: 4, name: "Durban Marine Supplies", email: "sales@durbanmarine.co.za", phone: "031 566 2140", credit_limit: 30000, balance: 0, kyc_status: "pending", status: "active" }
  ];

  var VENDORS = [
    { id: 1, name: "Bidvest Foodservice", email: "orders@bidvestfoodservice.co.za", phone: "011 928 6000", balance: 20700, status: "active" },
    { id: 2, name: "Sasol Fuels (Pty) Ltd", email: "fleet@sasol.co.za", phone: "011 441 3111", balance: 9850, status: "active" },
    { id: 3, name: "ProServ Office Solutions", email: "billing@proserv.co.za", phone: "010 594 2200", balance: 5600, status: "active" },
    { id: 4, name: "Gauteng Logistics cc", email: "dispatch@gautenglog.co.za", phone: "011 472 9080", balance: 5860, status: "active" },
    { id: 5, name: "Springs Stationers", email: "sales@springsstationers.co.za", phone: "011 811 3345", balance: 7000, status: "active" },
    { id: 6, name: "Highveld IT Services", email: "support@highveldit.co.za", phone: "010 500 2214", balance: 3400, status: "active" },
    { id: 7, name: "Cleanex Facilities (Pty) Ltd", email: "ops@cleanexfacilities.co.za", phone: "011 699 4410", balance: 0, status: "active" },
    { id: 8, name: "Telkom SA SOC Ltd", email: "smme@telkom.co.za", phone: "012 311 3911", balance: 0, status: "active" }
  ];

  var BANKS = [
    { id: 1, account_name: "FNB Business Cheque", bank_name: "FNB", account_number: "6284xxxx771", gl_account_code: "BS_CA_1000", balance: 486240, currency: "ZAR" }
  ];

  var VAT_RATES = {
    ok: true,
    authority_code: "SARS",
    rates: [
      { rate_code: "STANDARD", label: "Standard 15%", treatment: "standard", rate_percent: 15, effective_from: "2018-04-01" },
      { rate_code: "ZERO", label: "Zero rated", treatment: "zero", rate_percent: 0, effective_from: "2000-01-01" },
      { rate_code: "EXEMPT", label: "Exempt", treatment: "exempt", rate_percent: 0, effective_from: "2000-01-01" }
    ]
  };


  /* ── 3b) AR documents — invoices + quotes (AR_DOCS_V1) ─────── */
  /* Open invoice amounts tie EXACTLY to customer balances:
     Springs 28,750 + Cape Union 46,000 + Woodmead 9,570 = 84,320 (AR KPI) */
  var COMPANY_BRANDING = {
    company_name: "Mokoko Trading (Pty) Ltd",
    branding_address: "14 Kruger Street, Springs, Gauteng, 1559",
    branding_contact_phone: "011 811 0142",
    branding_contact_email: "accounts@mokokotrading.co.za",
    branding_vat_no: "4890271634",
    company_vat: "4890271634",
    company_email: "accounts@mokokotrading.co.za"
  };

  function custName(id) {
    var c = CUSTOMERS.filter(function (x) { return x.id === Number(id); })[0];
    return c ? c.name : "";
  }
  function custOf(id) {
    return CUSTOMERS.filter(function (x) { return x.id === Number(id); })[0] || {};
  }
  function addDays(isoDate, n) {
    var d = new Date(isoDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  var INVOICES = [
    { id: 1008, number: "INV-1008", customer_id: 1, customer_name: custName(1),
      invoice_date: PD(24), due_date: addDays(PD(24), 30), terms: "30", status: "paid",
      currency: "ZAR", vat_enabled: true, default_vat_code: "STANDARD",
      subtotal_amount: 19200.00, vat_amount: 2880.00, total_amount: 22080.00,
      paid_amount: 22080.00, outstanding_amount: 0.00,
      notes: "Spring trade show bulk order — paid in full via EFT.",
      lines: [
        { item_name: "Portable Fridges", description: "Camp series 40L — trade show batch", quantity: 12,
          unit_price: 1600.00, vat_rate: 15, discount_amount: 0,
          net_amount: 19200.00, vat_amount: 2880.00, total_amount: 22080.00 }
      ] },
    { id: 1019, number: "INV-1019", customer_id: 3, customer_name: custName(3),
      invoice_date: D(2), due_date: addDays(D(2), 30), terms: "30", status: "posted",
      currency: "ZAR", vat_enabled: true, default_vat_code: "STANDARD",
      subtotal_amount: 8321.74, vat_amount: 1248.26, total_amount: 9570.00,
      paid_amount: 0.00, outstanding_amount: 9570.00,
      notes: "Kitchen equipment restock for Woodmead café fit-out.",
      lines: [
        { item_name: "Convection Oven Units", description: "Half-size electric, 3-phase", quantity: 2,
          unit_price: 4160.87, vat_rate: 15, discount_amount: 0,
          net_amount: 4160.87, vat_amount: 624.13, total_amount: 4785.00 },
        { item_name: "Convection Oven Units", description: "Half-size electric, 3-phase", quantity: 2,
          unit_price: 4160.87, vat_rate: 15, discount_amount: 0,
          net_amount: 4160.87, vat_amount: 624.13, total_amount: 4785.00 }
      ] },
    { id: 1021, number: "INV-1021", customer_id: 1, customer_name: custName(1),
      invoice_date: D(3), due_date: addDays(D(3), 15), terms: "15", status: "posted",
      currency: "ZAR", vat_enabled: true, default_vat_code: "STANDARD",
      subtotal_amount: 10826.09, vat_amount: 1623.91, total_amount: 12450.00,
      paid_amount: 0.00, outstanding_amount: 12450.00,
      notes: "Solar geyser install — Springs site B.",
      lines: [
        { item_name: "Solar Geyser 150L Installation", description: "Supply, install and commission", quantity: 1,
          unit_price: 6960.00, vat_rate: 15, discount_amount: 0,
          net_amount: 6960.00, vat_amount: 1044.00, total_amount: 8004.00 },
        { item_name: "Plumbing Materials", description: "Geyser pipework, valves and fittings", quantity: 1,
          unit_price: 3866.09, vat_rate: 15, discount_amount: 0,
          net_amount: 3866.09, vat_amount: 579.91, total_amount: 4446.00 }
      ] },
    { id: 1026, number: "INV-1026", customer_id: 2, customer_name: custName(2),
      invoice_date: D(6), due_date: addDays(D(6), 30), terms: "30", status: "posted",
      currency: "ZAR", vat_enabled: true, default_vat_code: "STANDARD",
      subtotal_amount: 40000.00, vat_amount: 6000.00, total_amount: 46000.00,
      paid_amount: 0.00, outstanding_amount: 46000.00,
      notes: "Marine safety equipment — annual consignment order.",
      lines: [
        { item_name: "Marine Safety Equipment Bundle", description: "Life jackets, flares, signal kits — consolidated", quantity: 1,
          unit_price: 40000.00, vat_rate: 15, discount_amount: 0,
          net_amount: 40000.00, vat_amount: 6000.00, total_amount: 46000.00 }
      ] },
    { id: 1024, number: "INV-1024", customer_id: 1, customer_name: custName(1),
      invoice_date: D(8), due_date: addDays(D(8), 15), terms: "15", status: "approved",
      currency: "ZAR", vat_enabled: true, default_vat_code: "STANDARD",
      subtotal_amount: 14173.91, vat_amount: 2126.09, total_amount: 16300.00,
      paid_amount: 0.00, outstanding_amount: 16300.00,
      notes: "Commercial heat pump — approved, awaiting settlement.",
      lines: [
        { item_name: "Commercial Heat Pump Supply & Install", description: "12kW unit incl. electrical co-ordination", quantity: 1,
          unit_price: 14173.91, vat_rate: 15, discount_amount: 0,
          net_amount: 14173.91, vat_amount: 2126.09, total_amount: 16300.00 }
      ] },
    { id: 1032, number: "INV-1032", customer_id: 3, customer_name: custName(3),
      invoice_date: D(10), due_date: addDays(D(10), 30), terms: "30", status: "draft",
      currency: "ZAR", vat_enabled: true, default_vat_code: "STANDARD",
      subtotal_amount: 5582.61, vat_amount: 837.39, total_amount: 6420.00,
      paid_amount: 0.00, outstanding_amount: 6420.00,
      notes: "Draft — café counter refrigeration (awaiting confirmation).",
      lines: [
        { item_name: "Under-Counter Fridge", description: "Stainless double-door", quantity: 1,
          unit_price: 5582.61, vat_rate: 15, discount_amount: 0,
          net_amount: 5582.61, vat_amount: 837.39, total_amount: 6420.00 }
      ] },
    { id: 1033, number: "INV-1033", customer_id: 1, customer_name: custName(1),
      invoice_date: D(11), due_date: addDays(D(11), 15), terms: "15", status: "pending_approval",
      currency: "ZAR", vat_enabled: true, default_vat_code: "STANDARD",
      subtotal_amount: 16434.78, vat_amount: 2465.22, total_amount: 18900.00,
      paid_amount: 0.00, outstanding_amount: 18900.00,
      notes: "Pending approval — ducting upgrade, phase 2.",
      lines: [
        { item_name: "Ducting Upgrade — Phase 2", description: "Airflow rebalance across sales floor", quantity: 1,
          unit_price: 16434.78, vat_rate: 15, discount_amount: 0,
          net_amount: 16434.78, vat_amount: 2465.22, total_amount: 18900.00 }
      ] }
  ];

  var QUOTES = [
    { id: 1007, number: "QT-1007", customer_id: 1, customer_name: custName(1),
      quotation_date: PD(12), status: "converted", currency: "ZAR",
      discount_rate: 0, valid_days: 30, valid_until: addDays(PD(12), 30),
      subtotal_amount: 13043.48, vat_amount: 1956.52, total_amount: 15000.00,
      notes: "Backoffice aircon refresh — accepted and converted to INV-1005.",
      terms: "50% deposit, balance on completion.",
      lines: [
        { item_name: "Midwall Split Supply & Fit", description: "9kBTU split × 3 offices — bundled", quantity: 1,
          account_code: "PL_REV_4000", unit_price: 13043.48, vat_rate: 15, discount_amount: 0,
          net_amount: 13043.48, vat_amount: 1956.52, total_amount: 15000.00 }
      ] },
    { id: 1011, number: "QT-1011", customer_id: 2, customer_name: custName(2),
      quotation_date: D(5), status: "issued", currency: "ZAR",
      discount_rate: 0, valid_days: 30, valid_until: addDays(D(5), 30),
      subtotal_amount: 28000.00, vat_amount: 4200.00, total_amount: 32200.00,
      notes: "Deck refrigeration quote — issued to Cape Union, awaiting response.",
      terms: "Valid 30 days. Delivery included within Gauteng & Western Cape.",
      lines: [
        { item_name: "Chest Freezers 540L", description: "Marine-grade coating", quantity: 4,
          account_code: "PL_REV_4000", unit_price: 7000.00, vat_rate: 15, discount_amount: 0,
          net_amount: 28000.00, vat_amount: 4200.00, total_amount: 32200.00 }
      ] },
    { id: 1009, number: "QT-1009", customer_id: 4, customer_name: custName(4),
      quotation_date: D(4), status: "accepted", currency: "ZAR",
      discount_rate: 0, valid_days: 14, valid_until: addDays(D(4), 14),
      subtotal_amount: 8695.65, vat_amount: 1304.35, total_amount: 10000.00,
      notes: "Chandlery starter stock — accepted, ready to convert.",
      terms: "Payment on delivery.",
      lines: [
        { item_name: "Chandlery Starter Stock Pack", description: "Ropes, cleats, fenders — assort.", quantity: 1,
          account_code: "PL_REV_4000", unit_price: 8695.65, vat_rate: 15, discount_amount: 0,
          net_amount: 8695.65, vat_amount: 1304.35, total_amount: 10000.00 }
      ] },
    { id: 1012, number: "", customer_id: 3, customer_name: custName(3),
      quotation_date: D(9), status: "draft", currency: "ZAR",
      discount_rate: 0, valid_days: 30, valid_until: addDays(D(9), 30),
      subtotal_amount: 7826.09, vat_amount: 1173.91, total_amount: 9000.00,
      notes: "Draft — winter HVAC service retainer proposal.",
      terms: "Monthly billing, 3-month minimum.",
      lines: [
        { item_name: "HVAC Service Retainer", description: "Quarterly service visit bundle (×3)", quantity: 1,
          account_code: "PL_REV_4000", unit_price: 7826.09, vat_rate: 15, discount_amount: 0,
          net_amount: 7826.09, vat_amount: 1173.91, total_amount: 9000.00 }
      ] }
  ];

  var _arSeq = { invoice: 1034, quote: 1013 };

  function invOpenTotal(custId) {
    var s = 0;
    INVOICES.forEach(function (i) {
      if (i.customer_id === Number(custId) &&
          ["posted", "approved", "partial", "unpaid", "open"].indexOf(i.status) !== -1) {
        s += (i.outstanding_amount || 0);
      }
    });
    return Math.round(s * 100) / 100;
  }

  function invPayload(i) {
    var c = custOf(i.customer_id);
    var openCount = INVOICES.filter(function (x) {
      return x.customer_id === i.customer_id &&
             ["posted", "approved", "partial", "unpaid", "open"].indexOf(x.status) !== -1;
    }).length;
    var out = Object.assign({}, COMPANY_BRANDING, i, {
      customer_email: c.email || "", customer_phone: c.phone || "",
      customer_vat_number: "", customer_billing_address: c.email ? "—" : "",
      customer_balance: invOpenTotal(i.customer_id),
      customer_open_invoices: openCount,
      /* camelCase aliases for the AR activity feed (renderAR) */
      customerName: i.customer_name || c.name || "",
      date: i.invoice_date,
      total: i.total_amount
    });
    return out;
  }

  /* ── 4) fetch interceptor ───────────────────────────────────── */
  var realFetch = window.fetch ? window.fetch.bind(window) : null;

  function json(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  function matchJournalToPeriod(j, from, to) {
    if (from && j.date < from) return false;
    if (to && j.date > to) return false;
    return true;
  }

  function journalDetail(id) {
    for (var i = 0; i < JOURNALS.length; i++) {
      if (String(JOURNALS[i].id) === String(id)) {
        var j = JOURNALS[i];
        return {
          id: j.id, date: j.date, ref: j.ref, description: j.description,
          source: j.source,
          lines: j.lines.map(function (ln) { return Object.assign({}, ln); })
        };
      }
    }
    return null;
  }

  var monthStart = D(1);
  var monthEnd = iso(Y, M, daysInMonth);

  /* ── 3c) Revenue contracts — IFRS 15 desk (REV_DATA_V1) ───────
     Full mock backend for #screen-revenue: contracts, obligations,
     billing, cash, progress and recognition runs. In-memory only. */
  var REV_CID = 42;
  var REV_SEQ = 106;
  var REV_OBL_SEQ = 503;
  var REV_RUN_SEQ = 901;

  function revM(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function revCustName(id) {
    var c = CUSTOMERS.filter(function (x) { return String(x.id) === String(id); })[0];
    return c ? c.name : ("Customer " + id);
  }

  /* Contracts — txn 665,000 · recognised 205,000 · billed 194,000 */
  var REV_CONTRACTS = [
    {
      id: 101, contract_number: "RC-2601", contract_title: "Gym equipment lease & maintenance bundle",
      status: "active", customer_id: 1, customer_name: revCustName(1),
      transaction_price: 240000, variable_constrained: 0,
      recognized_revenue_to_date: 96000, billed_to_date: 90000,
      contract_date: D(2), start_date: iso(Y, 0, 1), end_date: iso(Y, 11, 31),
      currency: "ZAR", is_over_time: true, has_financing: false,
      settlement_pattern: "revenue_before_billing",
      payload_json: {
        settlement_pattern: "revenue_before_billing",
        notes: "36-month lease of gym equipment with an attached preventative maintenance plan.",
        billing_config: { method: "periodic", periodicity: "monthly", billing_day: 25, allow_obligation_override: false, auto_allocate_contract_pool: true, notes: "Invoice on the 25th, monthly in advance." }
      }
    },
    {
      id: 102, contract_number: "RC-2602", contract_title: "Beverage dispenser supply & service",
      status: "active", customer_id: 2, customer_name: revCustName(2),
      transaction_price: 156000, variable_constrained: 0,
      recognized_revenue_to_date: 39000, billed_to_date: 58500,
      contract_date: D(4), start_date: D(4), end_date: iso(Y, 10, 30),
      currency: "ZAR", is_over_time: false, has_financing: false,
      settlement_pattern: "billing_before_revenue",
      payload_json: {
        settlement_pattern: "billing_before_revenue",
        notes: "40 dispensers supplied with delivery and installation. Deposit billed on order.",
        billing_config: { method: "milestone", milestone_basis: "obligation", allow_obligation_override: false, auto_allocate_contract_pool: true, notes: "Each obligation acts as a billing trigger." }
      }
    },
    {
      id: 103, contract_number: "RC-2603", contract_title: "Fleet telemetry subscription",
      status: "active", customer_id: 4, customer_name: revCustName(4),
      transaction_price: 84000, variable_constrained: 0,
      recognized_revenue_to_date: 0, billed_to_date: 21000,
      contract_date: D(6), start_date: iso(Y, M + 1, 1), end_date: iso(Y + 1, M, 1),
      currency: "ZAR", is_over_time: true, has_financing: false,
      settlement_pattern: "billing_before_revenue",
      payload_json: {
        settlement_pattern: "billing_before_revenue",
        notes: "12-month telemetry platform subscription billed annually in advance, with onboarding services.",
        billing_config: { method: "manual", allow_obligation_override: true, auto_allocate_contract_pool: true, notes: "Annual invoice raised in advance; revenue releases from contract liability as service is delivered." }
      }
    },
    {
      id: 104, contract_number: "RC-2604", contract_title: "Loyalty app development",
      status: "pending_approval", customer_id: 3, customer_name: revCustName(3),
      transaction_price: 120000, variable_constrained: 0,
      recognized_revenue_to_date: 24500, billed_to_date: 0,
      contract_date: D(8), start_date: iso(Y, M - 1 < 0 ? 0 : M - 1, 20), end_date: iso(Y, 11, 15),
      currency: "ZAR", is_over_time: true, has_financing: false,
      settlement_pattern: "revenue_before_billing",
      payload_json: {
        settlement_pattern: "revenue_before_billing",
        notes: "Custom loyalty app. Input-method progress; progress billing coordinated at contract level.",
        billing_config: { method: "progress", allow_obligation_override: false, auto_allocate_contract_pool: true, notes: "Progress billing across over-time obligations." }
      }
    },
    {
      id: 105, contract_number: "RC-2605", contract_title: "Warehouse racking installation",
      status: "active", customer_id: 1, customer_name: revCustName(1),
      transaction_price: 65000, variable_constrained: 0,
      recognized_revenue_to_date: 45500, billed_to_date: 45500,
      contract_date: D(10), start_date: D(10), end_date: iso(Y, 11, 20),
      currency: "ZAR", is_over_time: false, has_financing: false,
      settlement_pattern: "revenue_before_billing",
      payload_json: {
        settlement_pattern: "revenue_before_billing",
        notes: "Supply and installation of pallet racking with custom billing milestones.",
        billing_config: {
          method: "milestone", milestone_basis: "contract", allow_obligation_override: false, auto_allocate_contract_pool: true,
          notes: "Custom milestones certified by the client's quantity surveyor.",
          milestones: [
            { code: "M1", description: "Racking supply delivered on site", trigger_type: "delivery", billing_amount: 45500, billing_percent: 70, certificate_required: false, approval_required: false, expected_completion_date: D(11) },
            { code: "M2", description: "Installation complete & sign-off", trigger_type: "acceptance", billing_amount: 19500, billing_percent: 30, certificate_required: true, approval_required: true, expected_completion_date: iso(Y, 11, 15) }
          ]
        }
      }
    }
  ];

  /* Obligations — revenue_to_date always sums to the contract header */
  var REV_OBLIGATIONS = [
    { id: 501, contract_id: 101, obligation_code: "OB-01", obligation_name: "Equipment lease — 36 months", recognition_timing: "over_time", progress_method: "time_elapsed", ssp: 186000, allocated_transaction_price: 180000, satisfaction_status: "in_progress", revenue_to_date: 84000, billed_to_date: 78000, required_now: 86000, expected_total_cost: 132000, actual_cost_to_date: 61500, progress_percent: 46.7, distinct_flag: true, notes: "Straight-line over the lease term." },
    { id: 502, contract_id: 101, obligation_code: "OB-02", obligation_name: "Preventative maintenance plan", recognition_timing: "over_time", progress_method: "input", ssp: 62000, allocated_transaction_price: 60000, satisfaction_status: "in_progress", revenue_to_date: 12000, billed_to_date: 12000, required_now: 13000, expected_total_cost: 31000, actual_cost_to_date: 8200, progress_percent: 20, distinct_flag: true, notes: "Quarterly services + call-outs." },
    { id: 503, contract_id: 102, obligation_code: "OB-01", obligation_name: "Dispenser units — 40 units", recognition_timing: "point_in_time", progress_method: "", pit_trigger: "delivery", ssp: 118000, allocated_transaction_price: 117000, satisfaction_status: "pending", revenue_to_date: 0, billed_to_date: 58500, expected_total_cost: 81000, actual_cost_to_date: 0, distinct_flag: true, notes: "Recognised on delivery to site." },
    { id: 504, contract_id: 102, obligation_code: "OB-02", obligation_name: "Delivery & installation", recognition_timing: "point_in_time", progress_method: "", pit_trigger: "acceptance", ssp: 39000, allocated_transaction_price: 39000, satisfaction_status: "satisfied", satisfied_at: D(18), revenue_to_date: 39000, billed_to_date: 0, expected_total_cost: 21000, actual_cost_to_date: 18500, distinct_flag: true, notes: "Signed acceptance 18th." },
    { id: 505, contract_id: 103, obligation_code: "OB-01", obligation_name: "Telemetry platform access", recognition_timing: "over_time", progress_method: "time_elapsed", ssp: 62000, allocated_transaction_price: 60000, satisfaction_status: "not_started", revenue_to_date: 0, billed_to_date: 21000, required_now: 0, expected_total_cost: 22000, actual_cost_to_date: 0, progress_percent: 0, distinct_flag: true, notes: "Billed annually in advance; service starts 1st of next month." },
    { id: 506, contract_id: 103, obligation_code: "OB-02", obligation_name: "Onboarding & training", recognition_timing: "point_in_time", progress_method: "", pit_trigger: "completion", ssp: 24000, allocated_transaction_price: 24000, satisfaction_status: "pending", revenue_to_date: 0, billed_to_date: 0, expected_total_cost: 9000, actual_cost_to_date: 0, distinct_flag: true, notes: "Two on-site training days." },
    { id: 507, contract_id: 104, obligation_code: "OB-01", obligation_name: "Loyalty app development", recognition_timing: "over_time", progress_method: "input", ssp: 98000, allocated_transaction_price: 96000, satisfaction_status: "in_progress", revenue_to_date: 24500, billed_to_date: 0, required_now: 25500, expected_total_cost: 58000, actual_cost_to_date: 14200, progress_percent: 26.56, distinct_flag: true, notes: "Cost-input method; sprint burn tracked weekly." },
    { id: 508, contract_id: 104, obligation_code: "OB-02", obligation_name: "Launch & hypercare support", recognition_timing: "over_time", progress_method: "time_elapsed", ssp: 23000, allocated_transaction_price: 24000, satisfaction_status: "not_started", revenue_to_date: 0, billed_to_date: 0, expected_total_cost: 11000, actual_cost_to_date: 0, progress_percent: 0, distinct_flag: true, notes: "Starts at go-live." },
    { id: 509, contract_id: 105, obligation_code: "OB-01", obligation_name: "Racking supply", recognition_timing: "point_in_time", progress_method: "", pit_trigger: "delivery", ssp: 45500, allocated_transaction_price: 45500, satisfaction_status: "satisfied", satisfied_at: D(11), revenue_to_date: 45500, billed_to_date: 45500, expected_total_cost: 33000, actual_cost_to_date: 31250, distinct_flag: true, notes: "Delivered 11th, milestone M1 billed." },
    { id: 510, contract_id: 105, obligation_code: "OB-02", obligation_name: "Installation & sign-off", recognition_timing: "point_in_time", progress_method: "", pit_trigger: "acceptance", ssp: 19500, allocated_transaction_price: 19500, satisfaction_status: "pending", revenue_to_date: 0, billed_to_date: 0, expected_total_cost: 12500, actual_cost_to_date: 3900, distinct_flag: true, notes: "Awaiting QS certificate (M2)." }
  ];

  /* Billing events keyed by contract id */
  var REV_BILLINGS = {
    "101": [
      { id: 701, event_date: iso(Y, 3, 25), event_type: "invoice", amount: 60000, source_invoice_id: 2036, source_invoice_number: "INV-2036", obligation_id: 501, obligation_name: "Equipment lease — 36 months", notes: "Monthly lease invoice, Apr." },
      { id: 702, event_date: iso(Y, 6, 25), event_type: "invoice", amount: 30000, source_invoice_id: 2044, source_invoice_number: "INV-2044", obligation_id: 501, obligation_name: "Equipment lease — 36 months", notes: "Monthly lease invoice, Jul." }
    ],
    "102": [
      { id: 703, event_date: D(5), event_type: "invoice", amount: 58500, source_invoice_id: 2041, source_invoice_number: "INV-2041", obligation_id: 503, obligation_name: "Dispenser units — 40 units", notes: "50% deposit on order." }
    ],
    "103": [
      { id: 705, event_date: D(3), event_type: "invoice", amount: 21000, source_invoice_id: 2049, source_invoice_number: "INV-2049", obligation_id: 505, obligation_name: "Telemetry platform access", notes: "Annual subscription invoice — year 1, in advance." }
    ],
    "104": [],
    "105": [
      { id: 704, event_date: D(12), event_type: "invoice", amount: 45500, source_invoice_id: 2047, source_invoice_number: "INV-2047", obligation_id: 509, obligation_name: "Racking supply", notes: "Milestone M1 — supply delivered." }
    ]
  };

  /* Cash receipts keyed by contract id */
  var REV_CASH = {
    "101": [
      { id: 801, event_date: iso(Y, 4, 2), event_type: "receipt", amount: 60000, source_receipt_id: 3110, bank_account_id: 1, notes: "EFT received — INV-2036." },
      { id: 802, event_date: iso(Y, 7, 1), event_type: "receipt", amount: 30000, source_receipt_id: 3187, bank_account_id: 1, notes: "EFT received — INV-2044." }
    ],
    "102": [
      { id: 803, event_date: D(9), event_type: "receipt", amount: 20000, source_receipt_id: 3155, bank_account_id: 1, notes: "Part payment — INV-2041." }
    ],
    "104": [],
    "105": [
      { id: 804, event_date: D(16), event_type: "receipt", amount: 45500, source_receipt_id: 3201, bank_account_id: 1, notes: "Settled — INV-2047." }
    ]
  };

  var REV_VERSIONS = {
    "101": [{ id: 401, version_no: 1, status: "active", change_summary: "Initial version", created_at: D(2) + "T08:00:00Z" }],
    "102": [{ id: 402, version_no: 1, status: "active", change_summary: "Initial version", created_at: D(4) + "T09:10:00Z" }],
    "103": [{ id: 403, version_no: 1, status: "draft", change_summary: "Initial version", created_at: D(6) + "T10:20:00Z" }],
    "104": [{ id: 404, version_no: 1, status: "pending", change_summary: "Initial version", created_at: D(8) + "T11:05:00Z" }],
    "105": [{ id: 405, version_no: 1, status: "active", change_summary: "Initial version", created_at: D(10) + "T07:45:00Z" }]
  };

  /* Recognition runs — RUN-0001 posted last month; preview computes this month */
  var REV_RUNS = [
    {
      id: 901, run_number: "RUN-0001", description: "Monthly recognition — previous month",
      period_start: PD(1), period_end: PD(28), status: "posted", created_at: PD(28) + "T17:30:00Z",
      journal_id: 3117,
      entries: [
        { contract_id: 101, contract_number: "RC-2601", obligation_id: 501, obligation_code: "OB-01", obligation_name: "Equipment lease — 36 months", recognition_timing: "over_time", progress_method: "time_elapsed", revenue_required_to_date: 84000, revenue_previously_recognized: 82000, revenue_delta_this_run: 2000, billed_to_date: 78000, contract_asset_delta: 2000, contract_liability_delta: 0, validation: { blocking: [], warnings: [] } },
        { contract_id: 101, contract_number: "RC-2601", obligation_id: 502, obligation_code: "OB-02", obligation_name: "Preventative maintenance plan", recognition_timing: "over_time", progress_method: "input", revenue_required_to_date: 12000, revenue_previously_recognized: 11000, revenue_delta_this_run: 1000, billed_to_date: 12000, contract_asset_delta: 0, contract_liability_delta: 1000, validation: { blocking: [], warnings: [] } },
        { contract_id: 104, contract_number: "RC-2604", obligation_id: 507, obligation_code: "OB-01", obligation_name: "Loyalty app development", recognition_timing: "over_time", progress_method: "input", revenue_required_to_date: 24500, revenue_previously_recognized: 0, revenue_delta_this_run: 24500, billed_to_date: 0, contract_asset_delta: 24500, contract_liability_delta: 0, validation: { blocking: [], warnings: [] } }
      ],
      totals: { total_revenue_delta: 27500, total_contract_asset_delta: 26500, total_contract_liability_delta: 1000 }
    }
  ];

  function revObliByContract(cidNum) {
    return REV_OBLIGATIONS.filter(function (o) { return String(o.contract_id) === String(cidNum); });
  }
  function revSyncContract(cidNum) {
    var c = REV_CONTRACTS.filter(function (x) { return String(x.id) === String(cidNum); })[0];
    if (!c) return null;
    var obs = revObliByContract(cidNum);
    var rec = 0, bil = 0;
    obs.forEach(function (o) { rec += num(o.revenue_to_date); bil += num(o.billed_to_date); });
    c.recognized_revenue_to_date = revM(rec);
    c.billed_to_date = revM(bil);
    return c;
  }
  /* Entries the current run would post: required_now vs recognised to date */
  function revComputePreview() {
    var entries = [];
    REV_OBLIGATIONS.forEach(function (o) {
      if (o.recognition_timing !== "over_time") return;
      var required = num(o.required_now);
      var prev = num(o.revenue_to_date);
      var delta = revM(required - prev);
      if (!required && !prev) {
        entries.push({
          contract_id: o.contract_id, contract_number: (REV_CONTRACTS.filter(function (x) { return String(x.id) === String(o.contract_id); })[0] || {}).contract_number,
          obligation_id: o.id, obligation_code: o.obligation_code, obligation_name: o.obligation_name,
          recognition_timing: o.recognition_timing, progress_method: o.progress_method,
          revenue_required_to_date: 0, revenue_previously_recognized: 0, revenue_delta_this_run: 0,
          billed_to_date: num(o.billed_to_date), contract_asset_delta: 0, contract_liability_delta: 0,
          validation: { blocking: [], warnings: ["No progress update recorded for the period — record progress before recognising."] }
        });
        return;
      }
      if (delta === 0 && !num(o.billed_to_date) && o.satisfaction_status === "in_progress") {
        /* keep a visible row even when fully recognised — auditors like movement */
      }
      if (delta === 0) return;
      var gap = num(required) - num(o.billed_to_date);
      var asset = delta > 0 ? Math.max(0, Math.min(delta, gap)) : 0;
      var liab = delta > 0 ? Math.max(0, delta - Math.max(0, gap)) : 0;
      entries.push({
        contract_id: o.contract_id, contract_number: (REV_CONTRACTS.filter(function (x) { return String(x.id) === String(o.contract_id); })[0] || {}).contract_number,
        obligation_id: o.id, obligation_code: o.obligation_code, obligation_name: o.obligation_name,
        recognition_timing: o.recognition_timing, progress_method: o.progress_method,
        revenue_required_to_date: required, revenue_previously_recognized: prev, revenue_delta_this_run: delta,
        billed_to_date: num(o.billed_to_date), contract_asset_delta: asset, contract_liability_delta: liab,
        validation: { blocking: [], warnings: [] }
      });
    });
    var tR = 0, tA = 0, tL = 0;
    entries.forEach(function (e) {
      tR += num(e.revenue_delta_this_run); tA += num(e.contract_asset_delta); tL += num(e.contract_liability_delta);
    });
    return {
      entries: entries,
      totals: { total_revenue_delta: revM(tR), total_contract_asset_delta: revM(tA), total_contract_liability_delta: revM(tL) }
    };
  }
  function revRunPayload(run) {
    return {
      id: run.id, run_number: run.run_number, description: run.description,
      period_start: run.period_start, period_end: run.period_end, status: run.status,
      created_at: run.created_at, journal_id: run.journal_id || null,
      entries: run.entries, totals: run.totals
    };
  }

  function revPolicyFor(c) {
    var cfg = (c.payload_json && c.payload_json.billing_config) || {};
    var method = cfg.method || "manual";
    return {
      contract_id: c.id, billing_method: method,
      requires_obligation_link: method === "milestone" && cfg.milestone_basis !== "contract",
      periodicity: cfg.periodicity || "", billing_day: cfg.billing_day || null,
      milestone_basis: cfg.milestone_basis || "", allow_obligation_override: !!cfg.allow_obligation_override,
      auto_allocate_contract_pool: cfg.auto_allocate_contract_pool !== false,
      notes: cfg.notes || ""
    };
  }

  function revBillablePreview(ob) {
    var c = REV_CONTRACTS.filter(function (x) { return String(x.id) === String(ob.contract_id); })[0] || {};
    var pattern = c.settlement_pattern || "revenue_before_billing";
    var billed = num(ob.billed_to_date), rec = num(ob.revenue_to_date);
    var available = Math.max(0, revM(rec - billed));
    var latestRun = REV_RUNS.filter(function (r) { return r.status === "posted"; })[0];
    var linked = (REV_BILLINGS[String(c.id)] || []).filter(function (b) { return String(b.obligation_id) === String(ob.id) && b.source_invoice_id; })[0];
    return {
      obligation_id: ob.id, obligation_name: ob.obligation_name, contract_id: c.id,
      contract_number: c.contract_number, contract_title: c.contract_title, contract_currency: c.currency || "ZAR",
      customer_id: c.customer_id, settlement_pattern: pattern,
      recognition_timing: ob.recognition_timing, progress_method: ob.progress_method || "",
      allocated_transaction_price: num(ob.allocated_transaction_price),
      recognized_to_date_preview: rec, billed_to_date: billed, available_to_bill: available,
      latest_recognition: latestRun ? { run_id: latestRun.run_number, run_status: latestRun.status } : null,
      linked_invoice: linked ? { invoice_id: linked.source_invoice_id, invoice_number: linked.source_invoice_number } : null,
      ui: { can_create_invoice: available > 0 }
    };
  }

  function revDisclosure(query) {
    var assets = 0, liabs = 0;
    REV_CONTRACTS.forEach(function (c) {
      var pos = num(c.billed_to_date) - num(c.recognized_revenue_to_date);
      if (pos > 0) liabs += pos; else assets += -pos;
    });
    var from = query.get("date_from") || iso(Y, 0, 1);
    var to = query.get("date_to") || iso(Y, 11, 31);
    return {
      date_from: from, date_to: to,
      summary: {
        total_revenue: 205000, contract_assets: revM(assets), contract_liabilities: revM(liabs),
        gross_receivables_from_contracts: revM(assets), loss_allowance: 0, net_receivables: revM(assets)
      },
      revenue_by_category: [
        { category: "Equipment leases & maintenance", amount: 96000 },
        { category: "Goods supplied", amount: 84500 },
        { category: "Professional services", amount: 24500 }
      ],
      revenue_timing: [
        { timing: "Over time", amount: 120500 },
        { timing: "Point in time", amount: 84500 }
      ],
      unsatisfied_performance_obligations: [
        { contract: "RC-2602", obligation: "OB-01 Dispenser units — 40 units", allocated_amount: 117000, expected_satisfaction: iso(Y, 10, 30) },
        { contract: "RC-2603", obligation: "OB-01 Telemetry platform access", allocated_amount: 60000, expected_satisfaction: iso(Y + 1, M, 1) },
        { contract: "RC-2603", obligation: "OB-02 Onboarding & training", allocated_amount: 24000, expected_satisfaction: iso(Y, M + 1, 28) },
        { contract: "RC-2605", obligation: "OB-02 Installation & sign-off", allocated_amount: 19500, expected_satisfaction: iso(Y, 11, 15) }
      ],
      significant_judgments: {
        items: [
          { topic: "Stand-alone selling price", judgment: "Allocation uses observable prices for equipment and cost-plus margins for services." },
          { topic: "Progress measurement", judgment: "Time-elapsed for leases; cost-input for development; delivery/acceptance triggers for point-in-time." }
        ]
      },
      receivables_from_contracts: { gross_receivables: revM(assets), loss_allowance: 0, net_receivables: revM(assets) }
    };
  }

  /* Hook used by the /invoices POST handler — records a revenue billing event */
  function revRecordInvoiceBilling(inv, body) {
    var cidNum = Number(body.revenue_contract_id) || 0;
    var c = REV_CONTRACTS.filter(function (x) { return String(x.id) === String(cidNum); })[0];
    if (!c) return;
    var list = REV_BILLINGS[String(c.id)] || (REV_BILLINGS[String(c.id)] = []);
    list.push({
      id: 700 + list.length + 1, event_date: inv.invoice_date, event_type: "invoice",
      amount: revM(inv.total_amount), source_invoice_id: inv.id, source_invoice_number: inv.number,
      obligation_id: Number(body.revenue_obligation_id) || null,
      obligation_name: body.revenue_obligation_name || "",
      notes: body.memo || "Invoice created from Revenue Desk."
    });
    var oblId = Number(body.revenue_obligation_id) || 0;
    REV_OBLIGATIONS.forEach(function (o) {
      if (oblId && String(o.id) === String(oblId)) o.billed_to_date = revM(num(o.billed_to_date) + num(inv.total_amount));
    });
    revSyncContract(c.id);
  }


  /* ── 3g) Accruals & Deferrals register (AD_DATA_V1) ───────────
     Full mock backend for #screen-accrual-deferrals: items,
     recognition schedules, recognition runs (preview + post).
     In-memory only — Reset restores this dataset. */
  var AD_SEQ = 307;   // next item id
  var AD_RUN_SEQ = 902;

  function adM(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  function adAddMonths(y, m, delta) {
    var t = y * 12 + (m - 1) + delta;
    return { y: Math.floor(t / 12), m: (t % 12 + 12) % 12 + 1 };
  }
  function adIso(ym, dayN) {
    var dim = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate();
    var d = Math.min(dayN, dim);
    return iso(ym.y, ym.m - 1, d);
  }

  /* Build a monthly schedule; first nPosted lines are "posted" */
  function adBuildSchedule(startYm, months, amount, nPosted, prefix) {
    var lines = [], opening = adM(amount * months);
    for (var i = 0; i < months; i++) {
      var sy = adAddMonths(startYm.y, startYm.m, i);
      var ey = adAddMonths(startYm.y, startYm.m, i + 1);
      var closing = adM(opening - amount);
      lines.push({
        line_no: i + 1,
        period_start: adIso(sy, 1),
        period_end: adIso({ y: ey.y, m: ey.m }, 0),
        opening_balance: opening,
        recognition_amount: amount,
        closing_balance: closing,
        recognition_date: adIso({ y: ey.y, m: ey.m }, 0),
        status: i < nPosted ? "posted" : "pending",
        journal_ref: i < nPosted ? (prefix + "-" + (100 + i)) : null
      });
      opening = closing;
    }
    return lines;
  }

  var _YM = function (y, m) { return { y: y, m: m }; };

  var AD_ITEMS = [
    {
      id: 301, item_number: "AD-2601",
      item_title: "Short-term insurance \u2014 Santam annual premium",
      item_type: "prepaid_expense", status: "active",
      start_date: adIso(adAddMonths(Y, M + 1, -6), 1),
      end_date: adIso(adAddMonths(Y, M + 1, 6), 0),
      original_amount: 36000, recognized_to_date: 15000, remaining_balance: 21000,
      recognition_frequency: "monthly",
      dr_account: "PL_EX_6300", dr_account_name: "Insurance Expense",
      cr_account: "BS_CA_1150", cr_account_name: "Prepaid Expenses",
      created_at: PD(1), notes: "Premium paid upfront \u2014 recognised monthly."
    },
    {
      id: 302, item_number: "AD-2602",
      item_title: "Solar maintenance retainer \u2014 billed 12 months upfront",
      item_type: "deferred_income", status: "active",
      start_date: adIso(adAddMonths(Y, M + 1, -5), 1),
      end_date: adIso(adAddMonths(Y, M + 1, 7), 0),
      original_amount: 48000, recognized_to_date: 20000, remaining_balance: 28000,
      recognition_frequency: "monthly",
      dr_account: "BS_CL_2320", dr_account_name: "Deferred Income",
      cr_account: "PL_REV_4000", cr_account_name: "Sales Revenue",
      created_at: PD(2), notes: "Invoice INV-2041 \u2014 performance obligation relieved monthly."
    },
    {
      id: 303, item_number: "AD-2603",
      item_title: "Staff performance bonus \u2014 accrual build-up",
      item_type: "accrued_expense", status: "active",
      start_date: adIso(adAddMonths(Y, M + 1, -4), 1),
      end_date: adIso(adAddMonths(Y, M + 1, 2), 0),
      original_amount: 60000, recognized_to_date: 30000, remaining_balance: 30000,
      recognition_frequency: "monthly",
      dr_account: "PL_EX_6000", dr_account_name: "Salaries & Wages",
      cr_account: "BS_CL_2120", cr_account_name: "Accrued Expenses",
      created_at: PD(3), notes: "Accrue 1/6 of projected bonus pool per month."
    },
    {
      id: 304, item_number: "AD-2604",
      item_title: "Consulting days delivered \u2014 not yet invoiced (Blue Sky Labs)",
      item_type: "accrued_income", status: "active",
      start_date: adIso(adAddMonths(Y, M + 1, -3), 1),
      end_date: adIso(adAddMonths(Y, M + 1, -1), 0),
      original_amount: 22500, recognized_to_date: 7500, remaining_balance: 15000,
      recognition_frequency: "monthly",
      dr_account: "BS_CA_1120", dr_account_name: "Accrued Income",
      cr_account: "PL_IN_4100", cr_account_name: "Other Income",
      created_at: PD(4), notes: "Reverses when the month is invoiced."
    },
    {
      id: 305, item_number: "AD-2605",
      item_title: "Warehouse rent \u2014 quarter paid in advance",
      item_type: "prepaid_expense", status: "completed",
      start_date: adIso(adAddMonths(Y, M + 1, -4), 1),
      end_date: adIso(adAddMonths(Y, M + 1, -2), 0),
      original_amount: 45000, recognized_to_date: 45000, remaining_balance: 0,
      recognition_frequency: "monthly",
      dr_account: "PL_EX_6100", dr_account_name: "Rent Expense",
      cr_account: "BS_CA_1150", cr_account_name: "Prepaid Expenses",
      created_at: PD(5), notes: "Fully recognised."
    },
    {
      id: 306, item_number: "AD-2606",
      item_title: "RC-2601 deferred revenue mirror \u2014 gym lease bundle",
      item_type: "deferred_income", status: "active",
      is_mirror_item: true, source_module: "ifrs15",
      display_source_type: "ifrs15_mirror",
      source_reference: "RC-2601",
      start_date: adIso(adAddMonths(Y, M + 1, -5), 1),
      end_date: adIso(adAddMonths(Y, M + 1, 19), 0),
      original_amount: 240000, recognized_to_date: 96000, remaining_balance: 144000,
      recognition_frequency: "monthly",
      dr_account: "BS_CL_2320", dr_account_name: "Deferred Income",
      cr_account: "PL_REV_4000", cr_account_name: "Sales Revenue",
      created_at: PD(6),
      ifrs15_billed_to_date: 90000, ifrs15_recognized_to_date: 96000,
      notes: "Managed by the IFRS 15 Revenue Contracts module."
    }
  ];

  var AD_SCHEDULES = {
    301: adBuildSchedule(adAddMonths(Y, M + 1, -6), 12, 3000, 5, "JE-AD301"),
    302: adBuildSchedule(adAddMonths(Y, M + 1, -5), 12, 4000, 5, "JE-AD302"),
    303: adBuildSchedule(adAddMonths(Y, M + 1, -4), 6, 10000, 3, "JE-AD303"),
    304: adBuildSchedule(adAddMonths(Y, M + 1, -3), 3, 7500, 1, "JE-AD304"),
    305: adBuildSchedule(adAddMonths(Y, M + 1, -4), 3, 15000, 3, "JE-AD305"),
    306: []
  };

  var AD_RUNS = [
    {
      id: 901, run_number: "AD-RUN-0901",
      run_date: PD(28), recognition_date: PD(28),
      period_start: adIso(adAddMonths(Y, M + 1, -6), 1),
      period_end: PD(28),
      run_scope: "company", run_reason: "scheduled",
      item_type: null, item_id: null,
      status: "posted", lines_count: 13, total_amount: 47500,
      journal_id: "JE-2609", posted_at: PD(28), created_at: PD(28)
    }
  ];

  function adItemById(id) {
    return AD_ITEMS.filter(function (x) { return String(x.id) === String(id); })[0] || null;
  }

  function adPendingLines(upTo) {
    /* All pending schedule lines with recognition_date <= upTo, oldest first */
    var out = [];
    Object.keys(AD_SCHEDULES).forEach(function (itemId) {
      var it = adItemById(itemId);
      if (!it || it.status === "completed" || it.status === "cancelled" || it.status === "terminated") return;
      if (it.is_mirror_item === true || it.source_module === "ifrs15") return;
      (AD_SCHEDULES[itemId] || []).forEach(function (ln) {
        if (ln.status === "pending" && (!upTo || String(ln.recognition_date) <= String(upTo))) {
          out.push(Object.assign({}, ln, {
            item_id: it.id, item_number: it.item_number, item_title: it.item_title,
            item_type: it.item_type,
            dr_account: it.dr_account, dr_account_name: it.dr_account_name,
            cr_account: it.cr_account, cr_account_name: it.cr_account_name
          }));
        }
      });
    });
    out.sort(function (a, b) { return String(a.recognition_date).localeCompare(String(b.recognition_date)); });
    return out;
  }

  function adRefreshItemAggregates(item) {
    var lines = AD_SCHEDULES[String(item.id)] || [];
    var rec = lines.filter(function (l) { return l.status === "posted"; })
      .reduce(function (s, l) { return s + num(l.recognition_amount); }, 0);
    item.recognized_to_date = adM(rec);
    item.remaining_balance = adM(num(item.original_amount) - rec);
    if (item.remaining_balance <= 0.005 && lines.length) item.status = "completed";
    return item;
  }

  function adJournalFor(lines, runDate) {
    var jl = [], refSeq = 1000 + (AD_RUN_SEQ % 1000);
    lines.forEach(function (ln, idx) {
      jl.push({
        line_no: jl.length + 1,
        account_code: ln.dr_account, account_name: ln.dr_account_name,
        description: ln.item_number + " \u2014 " + ln.item_title,
        debit: adM(ln.recognition_amount), credit: 0,
        item_number: ln.item_number, recognition_date: ln.recognition_date
      });
      jl.push({
        line_no: jl.length + 1,
        account_code: ln.cr_account, account_name: ln.cr_account_name,
        description: ln.item_number + " \u2014 " + ln.item_title,
        debit: 0, credit: adM(ln.recognition_amount),
        item_number: ln.item_number, recognition_date: ln.recognition_date
      });
    });
    var dr = jl.reduce(function (s, l) { return s + num(l.debit); }, 0);
    var cr = jl.reduce(function (s, l) { return s + num(l.credit); }, 0);
    return {
      ref: "JE-AD-" + (refSeq), date: runDate,
      description: "Accruals & deferrals recognition run \u2014 " + lines.length + " line(s)",
      source: "accrual_deferrals", status: "draft",
      lines: jl, total_debit: adM(dr), total_credit: adM(cr),
      balanced: Math.abs(dr - cr) < 0.01
    };
  }

  var AD_IFRS15_SYNCED = false;


  function adCreateItemFromBody(b) {
    b = b || {};
    var id = AD_SEQ++;
    var start = b.start_date || D(1);
    var months = Math.max(1, Number(b.total_periods) || Number(b.months) || 12);
    var amount = adM(num(b.original_amount) / months);
    var sy = { y: Number(String(start).slice(0, 4)), m: Number(String(start).slice(5, 7)) };
    var end = adIso(adAddMonths(sy.y, sy.m, months), 0);
    var it = {
      id: id,
      item_number: "AD-26" + String(id - 300).padStart(2, "0"),
      item_title: b.item_title || b.title || "New accrual / deferral item",
      item_type: b.item_type || "prepaid_expense",
      status: b.status || "active",
      start_date: start, end_date: end,
      original_amount: adM(num(b.original_amount)),
      recognized_to_date: 0, remaining_balance: adM(num(b.original_amount)),
      recognition_frequency: b.recognition_frequency || "monthly",
      dr_account: b.dr_account || "PL_EX_6300", dr_account_name: b.dr_account_name || "Expense",
      cr_account: b.cr_account || "BS_CA_1150", cr_account_name: b.cr_account_name || "Prepaid / Deferred",
      created_at: D(1), notes: b.memo || b.notes || ""
    };
    AD_ITEMS.push(it);
    AD_SCHEDULES[String(id)] = adBuildSchedule(sy, months, amount, 0, "JE-AD" + id);
    return Object.assign({}, it);
  }

  var AD_PENDING_BY_RUN = {};

  /* ── 3f) Accounts Payable state (AP_DATA_V1) — module scope so
     runtime mutations (post / allocate / approve / release) persist
     across requests instead of being re-initialised per call.      */

    function apRel(n) { /* true today-offset: keeps aging buckets aligned with SNAPSHOT.aging.ap */
      var t = new Date();
      var d = new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()));
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    }
    function apM(n) { return Math.round((Number(n) || 0) * 100) / 100; }
    function apVend(id) {
      return VENDORS.filter(function (v) { return String(v.id) === String(id); })[0] || null;
    }
    function apVName(id) { var v = apVend(id); return v ? v.name : "Vendor " + id; }

    /* Open bills — buckets tie to mock aging (22,410 / 18,000 / 9,000 / 3,000) */
    var AP_BILLS = [
      { id: 2601, number: "BILL-2601", vendor_id: 1, vendor_name: apVName(1),
        bill_date: apRel(-12), due_date: apRel(18), due_term: "30", currency: "ZAR", status: "posted",
        subtotal_amount: 10800.00, vat_amount: 1620.00, total_amount: 12420.00,
        paid_amount: 0, outstanding_amount: 12420.00, payment_status: "unpaid",
        memo: "Monthly bulk grocery order — Springs depot.",
        lines: [ { item_name: "Bulk Grocery Pallets", description: "Staple goods — 6 pallets", quantity: 6, unit_price: 1800.00, vat_rate: 15, vat_code: "STANDARD", net_amount: 10800.00, vat_amount: 1620.00, total_amount: 12420.00 } ] },
      { id: 2602, number: "BILL-2602", vendor_id: 1, vendor_name: apVName(1),
        bill_date: apRel(-25), due_date: apRel(5), due_term: "30", currency: "ZAR", status: "posted",
        subtotal_amount: 7200.00, vat_amount: 1080.00, total_amount: 8280.00,
        paid_amount: 0, outstanding_amount: 8280.00, payment_status: "unpaid",
        memo: "Cold-chain delivery surcharge + consumables.",
        lines: [ { item_name: "Delivery & Consumables", description: "Refrigerated transport + packaging", quantity: 1, unit_price: 7200.00, vat_rate: 15, vat_code: "STANDARD", net_amount: 7200.00, vat_amount: 1080.00, total_amount: 8280.00 } ] },
      { id: 2603, number: "BILL-2603", vendor_id: 2, vendor_name: apVName(2),
        bill_date: apRel(-39), due_date: apRel(-9), due_term: "30", currency: "ZAR", status: "posted",
        subtotal_amount: 5956.52, vat_amount: 893.48, total_amount: 6850.00,
        paid_amount: 0, outstanding_amount: 6850.00, payment_status: "unpaid",
        memo: "Fleet diesel — October top-up (overdue).",
        lines: [ { item_name: "Diesel 50ppm", description: "Fleet refill — 2,300 L", quantity: 2300, unit_price: 2.59, vat_rate: 15, vat_code: "STANDARD", net_amount: 5957.00, vat_amount: 893.55, total_amount: 6850.55 } ] },
      { id: 2604, number: "BILL-2604", vendor_id: 2, vendor_name: apVName(2),
        bill_date: apRel(-96), due_date: apRel(-66), due_term: "30", currency: "ZAR", status: "posted",
        subtotal_amount: 2608.70, vat_amount: 391.30, total_amount: 3000.00,
        paid_amount: 0, outstanding_amount: 3000.00, payment_status: "unpaid",
        memo: "Generator service — disputed call-out line (overdue).",
        lines: [ { item_name: "Generator Service", description: "Standby genset 100kVA service kit", quantity: 1, unit_price: 2608.70, vat_rate: 15, vat_code: "STANDARD", net_amount: 2608.70, vat_amount: 391.30, total_amount: 3000.00 } ] },
      { id: 2605, number: "BILL-2605", vendor_id: 3, vendor_name: apVName(3),
        bill_date: apRel(-71), due_date: apRel(-41), due_term: "30", currency: "ZAR", status: "posted",
        subtotal_amount: 4869.57, vat_amount: 730.43, total_amount: 5600.00,
        paid_amount: 0, outstanding_amount: 5600.00, payment_status: "unpaid",
        memo: "Managed office services — September desks.",
        lines: [ { item_name: "Office Services", description: " September managed desks + consumables", quantity: 1, unit_price: 4869.57, vat_rate: 15, vat_code: "STANDARD", net_amount: 4869.57, vat_amount: 730.43, total_amount: 5600.00 } ] },
      { id: 2606, number: "BILL-2606", vendor_id: 4, vendor_name: apVName(4),
        bill_date: apRel(-44), due_date: apRel(-14), due_term: "30", currency: "ZAR", status: "posted",
        subtotal_amount: 3608.70, vat_amount: 541.30, total_amount: 4150.00,
        paid_amount: 0, outstanding_amount: 4150.00, payment_status: "unpaid",
        memo: "Palletised distribution — two consolidated runs.",
        lines: [ { item_name: "Distribution Runs", description: "Consolidated palletised delivery runs", quantity: 5, unit_price: 721.74, vat_rate: 15, vat_code: "STANDARD", net_amount: 3608.70, vat_amount: 541.30, total_amount: 4150.00 } ] },
      { id: 2607, number: "BILL-2607", vendor_id: 4, vendor_name: apVName(4),
        bill_date: apRel(-5), due_date: apRel(25), due_term: "30", currency: "ZAR", status: "posted",
        subtotal_amount: 1486.96, vat_amount: 223.04, total_amount: 1710.00,
        paid_amount: 0, outstanding_amount: 1710.00, payment_status: "unpaid",
        memo: "Ad-hoc courier — Springs to Heidelberg.",
        lines: [ { item_name: "Courier", description: "Ad-hoc courier run", quantity: 1, unit_price: 1486.96, vat_rate: 15, vat_code: "STANDARD", net_amount: 1486.96, vat_amount: 223.04, total_amount: 1710.00 } ] },
      { id: 2608, number: "BILL-2608", vendor_id: 5, vendor_name: apVName(5),
        bill_date: apRel(-51), due_date: apRel(-21), due_term: "30", currency: "ZAR", status: "posted",
        subtotal_amount: 6086.96, vat_amount: 913.04, total_amount: 7000.00,
        paid_amount: 0, outstanding_amount: 7000.00, payment_status: "unpaid",
        memo: "Stationery restock — office + workshop.",
        lines: [ { item_name: "Stationery Restock", description: "Office & workshop stationery bundle", quantity: 1, unit_price: 6086.96, vat_rate: 15, vat_code: "STANDARD", net_amount: 6086.96, vat_amount: 913.04, total_amount: 7000.00 } ] },
      { id: 2609, number: "BILL-2609", vendor_id: 6, vendor_name: apVName(6),
        bill_date: apRel(-68), due_date: apRel(-38), due_term: "30", currency: "ZAR", status: "posted",
        subtotal_amount: 2956.52, vat_amount: 443.48, total_amount: 3400.00,
        paid_amount: 0, outstanding_amount: 3400.00, payment_status: "unpaid",
        memo: "Network switch repair + support retainer.",
        lines: [ { item_name: "IT Repair & Retainer", description: "Switch repair + monthly retainer", quantity: 1, unit_price: 2956.52, vat_rate: 15, vat_code: "STANDARD", net_amount: 2956.52, vat_amount: 443.48, total_amount: 3400.00 } ] },
      /* Paid history — vendor statement richness (no aging impact) */
      { id: 2501, number: "BILL-2501", vendor_id: 1, vendor_name: apVName(1),
        bill_date: apRel(-52), due_date: apRel(-22), due_term: "30", currency: "ZAR", status: "paid",
        subtotal_amount: 8239.13, vat_amount: 1235.87, total_amount: 9475.00,
        paid_amount: 9475.00, outstanding_amount: 0, payment_status: "paid",
        memo: "Freezer stock order — paid via EFT PMT-7001.",
        lines: [ { item_name: "Frozen Stock", description: "Frozen goods bulk order", quantity: 1, unit_price: 8239.13, vat_rate: 15, vat_code: "STANDARD", net_amount: 8239.13, vat_amount: 1235.87, total_amount: 9475.00 } ] },
      { id: 2502, number: "BILL-2502", vendor_id: 2, vendor_name: apVName(2),
        bill_date: apRel(-80), due_date: apRel(-50), due_term: "30", currency: "ZAR", status: "paid",
        subtotal_amount: 9582.61, vat_amount: 1437.39, total_amount: 11020.00,
        paid_amount: 11020.00, outstanding_amount: 0, payment_status: "paid",
        memo: "Fleet diesel — paid via EFT PMT-7002.",
        lines: [ { item_name: "Diesel 50ppm", description: "Fleet refill — 3,700 L", quantity: 3700, unit_price: 2.59, vat_rate: 15, vat_code: "STANDARD", net_amount: 9583.00, vat_amount: 1437.45, total_amount: 11020.45 } ] },
      { id: 2503, number: "BILL-2503", vendor_id: 3, vendor_name: apVName(3),
        bill_date: apRel(-95), due_date: apRel(-65), due_term: "30", currency: "ZAR", status: "paid",
        subtotal_amount: 3500.00, vat_amount: 525.00, total_amount: 4025.00,
        paid_amount: 4025.00, outstanding_amount: 0, payment_status: "paid",
        memo: "Boardroom consumables — paid via EFT PMT-7003.",
        lines: [ { item_name: "Boardroom Consumables", description: "Catering + consumables", quantity: 1, unit_price: 3500.00, vat_rate: 15, vat_code: "STANDARD", net_amount: 3500.00, vat_amount: 525.00, total_amount: 4025.00 } ] },
      { id: 2504, number: "BILL-2504", vendor_id: 5, vendor_name: apVName(5),
        bill_date: apRel(-70), due_date: apRel(-40), due_term: "30", currency: "ZAR", status: "paid",
        subtotal_amount: 4500.00, vat_amount: 675.00, total_amount: 5175.00,
        paid_amount: 5175.00, outstanding_amount: 0, payment_status: "paid",
        memo: "Print supplies — paid via EFT PMT-7004.",
        lines: [ { item_name: "Print Supplies", description: "Toner + paper stock", quantity: 1, unit_price: 4500.00, vat_rate: 15, vat_code: "STANDARD", net_amount: 4500.00, vat_amount: 675.00, total_amount: 5175.00 } ] },
      /* Drafts — in-memory only, no ledger impact until posted */
      { id: 2698, number: "BILL-2698", vendor_id: 1, vendor_name: apVName(1),
        bill_date: apRel(-1), due_date: apRel(29), due_term: "30", currency: "ZAR", status: "draft",
        subtotal_amount: 3500.00, vat_amount: 525.00, total_amount: 4025.00,
        paid_amount: 0, outstanding_amount: 4025.00, payment_status: "unpaid",
        memo: "DRAFT — November grocery pre-order (awaiting GRNI match).",
        lines: [ { item_name: "Grocery Pre-order", description: "November bulk pre-order", quantity: 1, unit_price: 3500.00, vat_rate: 15, vat_code: "STANDARD", net_amount: 3500.00, vat_amount: 525.00, total_amount: 4025.00 } ] },
      { id: 2699, number: "BILL-2699", vendor_id: 2, vendor_name: apVName(2),
        bill_date: apRel(-2), due_date: apRel(28), due_term: "7", currency: "ZAR", status: "draft",
        subtotal_amount: 1000.00, vat_amount: 150.00, total_amount: 1150.00,
        paid_amount: 0, outstanding_amount: 1150.00, payment_status: "unpaid",
        memo: "DRAFT — Lubricants small order.",
        lines: [ { item_name: "Lubricants", description: "Assorted lubricants", quantity: 1, unit_price: 1000.00, vat_rate: 15, vat_code: "STANDARD", net_amount: 1000.00, vat_amount: 150.00, total_amount: 1150.00 } ] }
    ];

    /* Released payments — statement debit side (history) */
    var AP_PAYMENTS = [
      { id: 7001, payment_id: 7001, number: "PMT-7001", vendor_id: 1, vendor_name: apVName(1),
        payment_date: apRel(-24), amount: 9475.00, bank_account_id: 1, reference: "EFT-9001",
        description: "Payment — BILL-2501", status: "released",
        allocations: [ { bill_id: 2501, amount: 9475.00 } ] },
      { id: 7002, payment_id: 7002, number: "PMT-7002", vendor_id: 2, vendor_name: apVName(2),
        payment_date: apRel(-48), amount: 11020.00, bank_account_id: 1, reference: "EFT-9002",
        description: "Payment — BILL-2502", status: "released",
        allocations: [ { bill_id: 2502, amount: 11020.00 } ] },
      { id: 7003, payment_id: 7003, number: "PMT-7003", vendor_id: 3, vendor_name: apVName(3),
        payment_date: apRel(-63), amount: 4025.00, bank_account_id: 1, reference: "EFT-9003",
        description: "Payment — BILL-2503", status: "released",
        allocations: [ { bill_id: 2503, amount: 4025.00 } ] },
      { id: 7004, payment_id: 7004, number: "PMT-7004", vendor_id: 5, vendor_name: apVName(5),
        payment_date: apRel(-38), amount: 5175.00, bank_account_id: 1, reference: "EFT-9004",
        description: "Payment — BILL-2504", status: "released",
        allocations: [ { bill_id: 2504, amount: 5175.00 } ] }
    ];
    var AP_PAY_SEQ = 7005;

    /* Open GRNI receipts (GRN / GRNI tab) */
    var AP_GRNI = [
      { receipt_tx_id: 8101, grn_no: "GRN-8101", ref: "GRN-8101", vendor_id: 1, vendor_name: apVName(1),
        tx_date: apRel(-6), grni_status: "unbilled", remaining: 2300.00,
        notes: "Bidvest — 2 pallets received, bill pending" },
      { receipt_tx_id: 8102, grn_no: "GRN-8102", ref: "GRN-8102", vendor_id: 1, vendor_name: apVName(1),
        tx_date: apRel(-3), grni_status: "unbilled", remaining: 1150.00,
        notes: "Bidvest — consumables received, bill pending" },
      { receipt_tx_id: 8103, grn_no: "GRN-8103", ref: "GRN-8103", vendor_id: 4, vendor_name: apVName(4),
        tx_date: apRel(-8), grni_status: "unbilled", remaining: 900.00,
        notes: "Gauteng Logistics — partial delivery received" }
    ];

    function apBillOutstanding(b) {
      return apM(Math.max(0, num(b.total_amount) - num(b.paid_amount)));
    }
    function apSyncBill(b) {
      b.outstanding_amount = apBillOutstanding(b);
      b.payment_status = num(b.paid_amount) >= num(b.total_amount) - 0.004 ? "paid"
        : num(b.paid_amount) > 0.004 ? "partial" : "unpaid";
      if (b.payment_status === "paid") b.status = "paid";
      var v = apVend(b.vendor_id);
      if (v) v.balance = apM(AP_BILLS.filter(function (x) {
        return String(x.vendor_id) === String(v.id) && x.status !== "draft";
      }).reduce(function (s, x) { return s + num(x.outstanding_amount); }, 0));
    }

  function handleApi(pathname, query, opts) {
    var method = (opts && opts.method || "GET").toUpperCase();
    var cidMatch = pathname.match(/\/api\/companies\/(\d+)/);
    var cid = cidMatch ? cidMatch[1] : "42";

    /* ---- auth ---- */
    if (pathname.indexOf("/api/auth/me") !== -1) return json(USER);
    if (pathname.indexOf("/api/auth/reauth") !== -1) return json({ ok: true });
    if (pathname.indexOf("/api/auth/signin") !== -1) return json({ token: DEMO_TOKEN, user: USER });

    /* ---- companies ---- */
    if (pathname === "/api/companies" || pathname === "/api/companies/") {
      if (method === "POST") return json(COMPANY);
      return json([COMPANY]);
    }
    if (cidMatch && pathname.replace(/\/$/, "") === "/api/companies/" + cid) {
      /* cs (Task 16): PUT/PATCH persists the Update Company / Reporting
         Periods / credit policy / income tax forms in-memory */
      if (method === "PUT" || method === "PATCH") {
        var csPut = {}; try { csPut = JSON.parse(opts.body || "{}"); } catch (e) {}
        if (csPut && typeof csPut === "object") {
          var csFieldMap = {
            name: "name", company_name: "company_name", company_email: "company_email", email: "company_email",
            company_phone: "company_phone", phone: "company_phone", company_reg_no: "company_reg_no",
            reg_no: "company_reg_no", registration_no: "company_reg_no", tin: "tin", tax_number: "tin",
            vat: "vat", vat_number: "vat", logo_url: "logo_url",
            physical_address: "physical_address", postal_address: "postal_address",
            first_reporting_period_start: "first_reporting_period_start",
            financial_year_end_month: "financial_year_end_month",
            financial_year_end_day: "financial_year_end_day",
            reporting_period_locked: "reporting_period_locked"
          };
          Object.keys(csFieldMap).forEach(function (k) {
            if (csPut[k] !== undefined && csPut[k] !== null) COMPANY[csFieldMap[k]] = csPut[k];
          });
          if (csPut.credit_policy || csPut.policy) {
            COMPANY.credit_policy = Object.assign({}, COMPANY.credit_policy || {}, csPut.credit_policy || csPut.policy);
          }
          if (csPut.income_tax_settings) {
            COMPANY.income_tax_settings = Object.assign({}, COMPANY.income_tax_settings || {}, csPut.income_tax_settings);
          }
        }
      }
      return json(COMPANY);
    }

    /* ---- COA ---- */
    if (cidMatch && /\/coa$/.test(pathname)) return json({ coa: COA });
    if (pathname.indexOf("/api/coa/flat") !== -1) return json({ rows: COA });

    /* ---- journals ---- */
    if (cidMatch && /\/journal\/recent$/.test(pathname)) {
      var from = query.get("from") || "";
      var to = query.get("to") || "";
      var q = (query.get("q") || "").toLowerCase();
      var limit = num(query.get("limit")) || 200;

      var rows = JOURNALS.filter(function (j) {
        if (!matchJournalToPeriod(j, from, to)) return false;
        if (q && (j.ref + " " + j.description).toLowerCase().indexOf(q) === -1) return false;
        return true;
      })
        .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id; })
        .slice(0, limit);

      return json(rows.map(function (j) {
        return { id: j.id, date: j.date, ref: j.ref, description: j.description, source: j.source };
      }));
    }

    if (cidMatch && /\/journal\/\d+\/reverse$/.test(pathname) && method === "POST") {
      var revId = pathname.match(/\/journal\/(\d+)\/reverse$/)[1];
      var orig = journalDetail(revId);
      if (!orig) return json({ ok: false, error: "Journal not found" }, 404);
      var rj = {
        id: ++JOURNAL_SEQ, date: now.toISOString().slice(0, 10),
        ref: "JE-" + JOURNAL_SEQ, source: "manual",
        description: "Reversal of " + orig.ref + " - " + orig.description,
        lines: orig.lines.map(function (ln) {
          return {
            account_code: ln.account_code,
            debit: ln.credit, credit: ln.debit, is_vat: ln.is_vat
          };
        })
      };
      JOURNALS.push(rj);
      return json({ ok: true, journal_id: rj.id, id: rj.id });
    }

    if (cidMatch && /\/journal$/.test(pathname)) {
      if (method === "POST") {
        var body = {};
        try { body = JSON.parse(opts.body || "{}"); } catch (e) { }
        var lines = Array.isArray(body.lines) ? body.lines : [];
        var nj = {
          id: ++JOURNAL_SEQ,
          date: String(body.date || now.toISOString().slice(0, 10)).slice(0, 10),
          ref: String(body.ref || ("JE-" + (JOURNAL_SEQ + 1))),
          source: "manual",
          description: String(body.description || body.memo || "Manual journal"),
          lines: lines.map(function (ln) {
            return {
              account_code: ln.account_code || ln.code || "",
              debit: num(ln.debit), credit: num(ln.credit),
              is_vat: !!ln.is_vat
            };
          })
        };
        JOURNALS.push(nj);
        return json({ ok: true, journal_id: nj.id, id: nj.id });
      }

      var jid = query.get("journal_id");
      if (jid) {
        var det = journalDetail(jid);
        return det ? json(det) : json({ error: "not found" }, 404);
      }
      return json({ rows: [] });
    }

    if (cidMatch && /\/journal\/by-ref\//.test(pathname)) {
      var ref = decodeURIComponent(pathname.split("/by-ref/")[1] || "");
      var found = JOURNALS.filter(function (j) { return j.ref === ref; });
      return json(found.length ? journalDetail(found[0].id) : { rows: [] });
    }

    /* ---- Revenue: contracts (REV_DATA_V1) ---- */
    if (cidMatch && /\/revenue\/contracts\/\d+\/billing-policy$/.test(pathname)) {
      var rcPol = REV_CONTRACTS.filter(function (x) { return String(x.id) === String(pathname.match(/\/revenue\/contracts\/(\d+)\/billing-policy$/)[1]); })[0];
      return json(rcPol ? { ok: true, data: revPolicyFor(rcPol) } : { ok: true, data: null });
    }
    if (cidMatch && /\/revenue\/contracts\/\d+\/versions$/.test(pathname)) {
      var rcVer = REV_VERSIONS[String(pathname.match(/\/revenue\/contracts\/(\d+)\/versions$/)[1])] || [];
      return json({ ok: true, items: rcVer, data: rcVer, total: rcVer.length });
    }
    if (cidMatch && /\/revenue\/contracts\/\d+\/obligations$/.test(pathname)) {
      var rcOblCid = pathname.match(/\/revenue\/contracts\/(\d+)\/obligations$/)[1];
      if (method === "POST") {
        var oblBody = {};
        try { oblBody = JSON.parse(opts.body || "{}"); } catch (e) {}
        var oblName = String(oblBody.obligation_name || "New obligation");
        var newObl = {
          id: ++REV_OBL_SEQ, contract_id: Number(rcOblCid) || 0,
          obligation_code: String(oblBody.obligation_code || ("OB-" + (REV_OBL_SEQ - 500))),
          obligation_name: oblName, recognition_timing: oblBody.recognition_timing || "point_in_time",
          progress_method: oblBody.progress_method || "", pit_trigger: oblBody.pit_trigger || "",
          ssp: num(oblBody.ssp), allocated_transaction_price: num(oblBody.allocated_transaction_price),
          satisfaction_status: "pending", revenue_to_date: 0, billed_to_date: 0,
          expected_total_cost: num(oblBody.expected_total_cost), actual_cost_to_date: 0,
          progress_percent: 0, distinct_flag: oblBody.distinct_flag !== false, notes: oblBody.notes || ""
        };
        REV_OBLIGATIONS.push(newObl);
        revSyncContract(rcOblCid);
        return json({ ok: true, data: newObl, obligation: newObl, id: newObl.id });
      }
      var oblItems = revObliByContract(rcOblCid);
      return json({ ok: true, items: oblItems, data: oblItems, total: oblItems.length });
    }
    if (cidMatch && /\/revenue\/contracts\/\d+\/billings$/.test(pathname)) {
      var rcBCid = String(pathname.match(/\/revenue\/contracts\/(\d+)\/billings$/)[1]);
      if (method === "POST") {
        var bBody = {};
        try { bBody = JSON.parse(opts.body || "{}"); } catch (e) {}
        var bList = REV_BILLINGS[rcBCid] || (REV_BILLINGS[rcBCid] = []);
        var bEvt = {
          id: 700 + bList.length + 1, event_date: String(bBody.event_date || bBody.billing_date || "").slice(0, 10) || now.toISOString().slice(0, 10),
          event_type: String(bBody.event_type || "manual"), amount: revM(bBody.amount),
          source_invoice_id: null, source_invoice_number: bBody.reference || "",
          obligation_id: Number(bBody.obligation_id) || null, obligation_name: bBody.obligation_name || "",
          notes: bBody.notes || ""
        };
        bList.push(bEvt);
        REV_OBLIGATIONS.forEach(function (o) {
          if (bEvt.obligation_id && String(o.id) === String(bEvt.obligation_id)) o.billed_to_date = revM(num(o.billed_to_date) + bEvt.amount);
        });
        revSyncContract(rcBCid);
        return json({ ok: true, data: bEvt, billing: bEvt, id: bEvt.id });
      }
      var bItems = REV_BILLINGS[rcBCid] || [];
      return json({ ok: true, items: bItems, data: bItems, total: bItems.length });
    }
    if (cidMatch && /\/revenue\/contracts\/\d+\/cash_receipts$/.test(pathname)) {
      var rcCCid = String(pathname.match(/\/revenue\/contracts\/(\d+)\/cash_receipts$/)[1]);
      if (method === "POST") {
        var cBody = {};
        try { cBody = JSON.parse(opts.body || "{}"); } catch (e) {}
        var cList = REV_CASH[rcCCid] || (REV_CASH[rcCCid] = []);
        var cEvt = {
          id: 800 + cList.length + 1, event_date: String(cBody.event_date || cBody.receipt_date || cBody.date || "").slice(0, 10) || now.toISOString().slice(0, 10),
          event_type: String(cBody.type || cBody.event_type || "receipt"), amount: revM(cBody.amount),
          source_receipt_id: null, bank_account_id: Number(cBody.bank_account_id) || null,
          notes: cBody.notes || ""
        };
        cList.push(cEvt);
        return json({ ok: true, data: cEvt, receipt: cEvt, id: cEvt.id });
      }
      var cItems = REV_CASH[rcCCid] || [];
      return json({ ok: true, items: cItems, data: cItems, total: cItems.length });
    }
    if (cidMatch && /\/revenue\/contracts\/\d+\/submit$/.test(pathname) && method === "POST") {
      var rcSub = REV_CONTRACTS.filter(function (x) { return String(x.id) === String(pathname.match(/\/revenue\/contracts\/(\d+)\/submit$/)[1]); })[0];
      if (!rcSub) return json({ ok: false, error: "Contract not found" }, 404);
      rcSub.status = "pending_approval";
      return json({ ok: true, data: rcSub, contract: rcSub });
    }
    if (cidMatch && /\/revenue\/contracts\/\d+\/recalc$/.test(pathname) && method === "POST") {
      var rcRc = REV_CONTRACTS.filter(function (x) { return String(x.id) === String(pathname.match(/\/revenue\/contracts\/(\d+)\/recalc$/)[1]); })[0];
      if (!rcRc) return json({ ok: false, error: "Contract not found" }, 404);
      revSyncContract(rcRc.id);
      return json({ ok: true, contract: rcRc, data: rcRc, obligations: revObliByContract(rcRc.id) });
    }
    if (cidMatch && /\/revenue\/contracts\/\d+$/.test(pathname)) {
      var rcId = String(pathname.match(/\/revenue\/contracts\/(\d+)$/)[1]);
      var rcOne = REV_CONTRACTS.filter(function (x) { return String(x.id) === rcId; })[0];
      if (!rcOne) return json({ ok: false, error: "Contract not found" }, 404);
      if (method === "PUT" || method === "PATCH" || method === "POST") {
        var upBody = {};
        try { upBody = JSON.parse(opts.body || "{}"); } catch (e) {}
        ["contract_number", "contract_title", "status", "customer_id", "transaction_price", "variable_constrained",
          "contract_date", "start_date", "end_date", "currency", "is_over_time", "has_financing", "settlement_pattern"].forEach(function (k) {
          if (upBody[k] !== undefined) rcOne[k] = upBody[k];
        });
        if (upBody.payload_json) rcOne.payload_json = upBody.payload_json;
        if (upBody.customer_id) rcOne.customer_name = revCustName(upBody.customer_id);
        revSyncContract(rcId);
      }
      return json({ ok: true, data: rcOne, contract: rcOne });
    }
    if (cidMatch && /\/revenue\/contracts$/.test(pathname)) {
      if (method === "POST") {
        var ncBody = {};
        try { ncBody = JSON.parse(opts.body || "{}"); } catch (e) {}
        var pj = ncBody.payload_json || {};
        var newC = {
          id: ++REV_SEQ,
          contract_number: String(ncBody.contract_number || ("RC-26" + REV_SEQ)),
          contract_title: String(ncBody.contract_title || ncBody.title || "New revenue contract"),
          status: "draft", customer_id: Number(ncBody.customer_id) || 0, customer_name: revCustName(ncBody.customer_id),
          transaction_price: revM(ncBody.transaction_price), variable_constrained: revM(ncBody.variable_constrained),
          recognized_revenue_to_date: 0, billed_to_date: 0,
          contract_date: String(ncBody.contract_date || "").slice(0, 10) || now.toISOString().slice(0, 10),
          start_date: String(ncBody.start_date || "").slice(0, 10) || "",
          end_date: String(ncBody.end_date || "").slice(0, 10) || "",
          currency: ncBody.currency || "ZAR", is_over_time: !!ncBody.is_over_time, has_financing: !!ncBody.has_financing,
          settlement_pattern: pj.settlement_pattern || ncBody.settlement_pattern || "revenue_before_billing",
          payload_json: pj
        };
        REV_CONTRACTS.push(newC);
        return json({ ok: true, data: newC, contract: newC, id: newC.id });
      }
      var rcRows = REV_CONTRACTS.map(function (c) {
        var row = JSON.parse(JSON.stringify(c));
        row._oblCount = revObliByContract(c.id).length;
        return row;
      });
      return json({ ok: true, items: rcRows, data: rcRows, total: rcRows.length });
    }

    /* ---- Revenue: obligations ---- */
    if (cidMatch && /\/revenue\/obligations\/\d+\/billable_preview$/.test(pathname)) {
      var bpOb = REV_OBLIGATIONS.filter(function (x) { return String(x.id) === String(pathname.match(/\/revenue\/obligations\/(\d+)\/billable_preview$/)[1]); })[0];
      if (!bpOb) return json({ ok: false, error: "not found" }, 404);
      return json({ ok: true, data: revBillablePreview(bpOb) });
    }
    if (cidMatch && /\/revenue\/obligations\/\d+\/billing_position$/.test(pathname)) {
      var bposOb = REV_OBLIGATIONS.filter(function (x) { return String(x.id) === String(pathname.match(/\/revenue\/obligations\/(\d+)\/billing_position$/)[1]); })[0];
      if (!bposOb) return json({ ok: false, error: "not found" }, 404);
      var bpos = num(bposOb.billed_to_date) - num(bposOb.revenue_to_date);
      return json({
        ok: true, data: {
          obligation_id: bposOb.id, billed_to_date: num(bposOb.billed_to_date), recognized_to_date: num(bposOb.revenue_to_date),
          position: bpos > 0 ? "contract_liability" : bpos < 0 ? "contract_asset" : "balanced", amount: revM(Math.abs(bpos))
        }
      });
    }
    if (cidMatch && /\/revenue\/obligations\/\d+\/progress$/.test(pathname)) {
      var pgId = String(pathname.match(/\/revenue\/obligations\/(\d+)\/progress$/)[1]);
      var pgOb = REV_OBLIGATIONS.filter(function (x) { return String(x.id) === pgId; })[0];
      if (!pgOb) return json({ ok: false, error: "not found" }, 404);
      if (method === "POST") {
        var pgBody = {};
        try { pgBody = JSON.parse(opts.body || "{}"); } catch (e) {}
        var pct = num(pgBody.progress_percent);
        pgOb.progress_percent = pct;
        if (pgBody.expected_total_cost !== undefined) pgOb.expected_total_cost = revM(pgBody.expected_total_cost);
        if (pgBody.actual_cost_to_date !== undefined) pgOb.actual_cost_to_date = revM(pgBody.actual_cost_to_date);
        if (pgBody.satisfaction_status) pgOb.satisfaction_status = pgBody.satisfaction_status;
        pgOb._latestProgress = {
          obligation_id: pgOb.id, period_end: String(pgBody.period_end || "").slice(0, 10),
          update_type: pgBody.update_type || "manual_percent", milestone_code: pgBody.milestone_code || "",
          progress_percent: pct, expected_total_cost: num(pgOb.expected_total_cost),
          actual_cost_to_date: num(pgOb.actual_cost_to_date), notes: pgBody.notes || "",
          recorded_at: now.toISOString()
        };
        return json({ ok: true, data: pgOb._latestProgress, progress: pgOb._latestProgress });
      }
      var pgItems = pgOb._latestProgress ? [pgOb._latestProgress] : [];
      return json({ ok: true, items: pgItems, data: pgItems });
    }
    if (cidMatch && /\/revenue\/obligations\/\d+\/satisfy$/.test(pathname) && method === "POST") {
      var sfOb = REV_OBLIGATIONS.filter(function (x) { return String(x.id) === String(pathname.match(/\/revenue\/obligations\/(\d+)\/satisfy$/)[1]); })[0];
      if (!sfOb) return json({ ok: false, error: "not found" }, 404);
      sfOb.satisfaction_status = "satisfied";
      sfOb.satisfied_at = now.toISOString().slice(0, 10);
      sfOb.revenue_to_date = revM(sfOb.allocated_transaction_price);
      revSyncContract(sfOb.contract_id);
      return json({ ok: true, data: sfOb, obligation: sfOb });
    }
    if (cidMatch && /\/revenue\/obligations\/\d+$/.test(pathname)) {
      var obId = String(pathname.match(/\/revenue\/obligations\/(\d+)$/)[1]);
      var obOne = REV_OBLIGATIONS.filter(function (x) { return String(x.id) === obId; })[0];
      if (!obOne) return json({ ok: false, error: "not found" }, 404);
      if (method === "PUT" || method === "PATCH" || method === "POST") {
        var obBody = {};
        try { obBody = JSON.parse(opts.body || "{}"); } catch (e) {}
        ["obligation_code", "obligation_name", "recognition_timing", "progress_method", "pit_trigger", "ssp",
          "allocated_transaction_price", "satisfaction_status", "expected_total_cost", "actual_cost_to_date",
          "progress_percent", "distinct_flag", "notes"].forEach(function (k) {
          if (obBody[k] !== undefined) obOne[k] = obBody[k];
        });
        revSyncContract(obOne.contract_id);
      }
      return json({ ok: true, data: obOne, obligation: obOne });
    }

    /* ---- Revenue: recognition runs ---- */
    if (cidMatch && /\/revenue\/runs\/preview$/.test(pathname) && method === "POST") {
      var pv = revComputePreview();
      return json({ ok: true, data: pv, preview: pv });
    }
    if (cidMatch && /\/revenue\/runs\/\d+\/post$/.test(pathname) && method === "POST") {
      var pRunId = String(pathname.match(/\/revenue\/runs\/(\d+)\/post$/)[1]);
      var pRun = REV_RUNS.filter(function (r) { return String(r.id) === pRunId; })[0];
      if (!pRun) return json({ ok: false, error: "Run not found" }, 404);
      if (pRun.status !== "draft") return json({ ok: false, error: "Only draft runs can be posted" }, 400);
      pRun.entries.forEach(function (e) {
        REV_OBLIGATIONS.forEach(function (o) {
          if (String(o.id) === String(e.obligation_id)) {
            o.revenue_to_date = revM(num(o.revenue_to_date) + num(e.revenue_delta_this_run));
          }
        });
      });
      pRun.status = "posted";
      pRun.posted_at = now.toISOString();
      pRun.journal_id = ++JOURNAL_SEQ;
      REV_CONTRACTS.forEach(function (c) { revSyncContract(c.id); });
      return json({ ok: true, run_id: pRun.id, id: pRun.id, journal_id: pRun.journal_id, data: revRunPayload(pRun) });
    }
    if (cidMatch && /\/revenue\/runs\/\d+\/reverse$/.test(pathname) && method === "POST") {
      var rRunId = String(pathname.match(/\/revenue\/runs\/(\d+)\/reverse$/)[1]);
      var rRun = REV_RUNS.filter(function (r) { return String(r.id) === rRunId; })[0];
      if (!rRun) return json({ ok: false, error: "Run not found" }, 404);
      if (rRun.status !== "posted") return json({ ok: false, error: "Only posted runs can be reversed" }, 400);
      rRun.entries.forEach(function (e) {
        REV_OBLIGATIONS.forEach(function (o) {
          if (String(o.id) === String(e.obligation_id)) {
            o.revenue_to_date = revM(Math.max(0, num(o.revenue_to_date) - num(e.revenue_delta_this_run)));
          }
        });
      });
      rRun.status = "reversed";
      rRun.reversed_at = now.toISOString();
      REV_CONTRACTS.forEach(function (c) { revSyncContract(c.id); });
      return json({ ok: true, run_id: rRun.id, id: rRun.id, data: revRunPayload(rRun) });
    }
    if (cidMatch && /\/revenue\/runs\/\d+$/.test(pathname)) {
      var gRun = REV_RUNS.filter(function (r) { return String(r.id) === String(pathname.match(/\/revenue\/runs\/(\d+)$/)[1]); })[0];
      return gRun ? json({ ok: true, data: revRunPayload(gRun), run: revRunPayload(gRun) }) : json({ ok: false, error: "not found" }, 404);
    }
    if (cidMatch && /\/revenue\/runs$/.test(pathname)) {
      if (method === "POST") {
        var crBody = {};
        try { crBody = JSON.parse(opts.body || "{}"); } catch (e) {}
        var pv2 = revComputePreview();
        var nRun = {
          id: ++REV_RUN_SEQ,
          run_number: "RUN-000" + (REV_RUN_SEQ - 900),
          description: String(crBody.reason || crBody.description || "Recognition run"),
          period_start: String(crBody.period_start || crBody.start_date || "").slice(0, 10) || PD(1),
          period_end: String(crBody.period_end || crBody.end_date || "").slice(0, 10) || D(28),
          status: "draft", created_at: now.toISOString(), entries: pv2.entries, totals: pv2.totals
        };
        REV_RUNS.push(nRun);
        return json({ ok: true, data: { run: revRunPayload(nRun), preview: { entries: pv2.entries, totals: pv2.totals } }, run: revRunPayload(nRun), id: nRun.id });
      }
      var runRows = REV_RUNS.map(revRunPayload);
      return json({ ok: true, data: runRows, items: runRows });
    }

    /* ---- Revenue: IFRS 15 disclosure ---- */
    if (cidMatch && /\/revenue\/disclosure$/.test(pathname)) {
      return json({ ok: true, data: revDisclosure(query) });
    }
    /* ---- dashboard widgets ---- */
    if (cidMatch && /\/trial_balance_mini$/.test(pathname)) return json({ rows: TB_ROWS });
    if (cidMatch && /(\/trial_balance$|\/reports\/trial-balance$)/.test(pathname)) {
      var tbFrom = query.get("from") || "";
      var tbTo = query.get("to") || "";
      var tbLabel = (tbFrom && tbTo) ? (tbFrom + " → " + tbTo) : SNAPSHOT.meta.label;
      return json({
        meta: { label: tbLabel },
        rows: TB_ROWS.map(function (r) { return { name: r.name, debit: r.debit, credit: r.credit }; })
      });
    }
    /* ════════════════════════════════════════════════════════════════
       cb1 — CASH & BANKING DEEP DATA (Task 18)
       ------------------------------------------------------------------
       · Enriches the existing FNB bank-account row (additive fields
         only — dashboard.js reads ledger_account_code, name, swift…)
         and adds Nedbank Money Market + Capitec petty-cash accounts.
       · Cashbook ledger shims: the cashbook loader reads
         `rows.items || rows` so it needs a BARE ARRAY — we intercept
         /ledger?account=<bank codes> (cashbook calls carry no from/to)
         and return arrays. BS_CA_1000 rows are rebuilt from JOURNALS
         with the same filter/order/values as the generic route.
       · Bank statements + bank reconciliations (seeded for FNB Sep,
         Nedbank Sep) with full create / auto-match / exclude /
         attach-journal / CSV-import-preview flows.
       · All state persists on window.__CB1 across requests.
       · Existing routes/values untouched — additions only.
       ════════════════════════════════════════════════════════════════ */
    if (!window.__CB1) {
      window.__CB1 = {
        seq: { stmt: 884, recon: 503, item: 5100 },
        statements: [
          { id: 881, bank_account_id: 1, file_name: "FNB-771-2026-09.csv", status: "imported", currency: "ZAR", uploaded_at: "2026-10-02 08:41", line_count: 11, pool_id: "fnb_sep" },
          { id: 882, bank_account_id: 1, file_name: "FNB-771-2026-10-mid.csv", status: "imported", currency: "ZAR", uploaded_at: "2026-10-14 07:12", line_count: 6, pool_id: "fnb_oct" },
          { id: 883, bank_account_id: 2, file_name: "NED-402-2026-09.csv", status: "imported", currency: "ZAR", uploaded_at: "2026-10-03 16:05", line_count: 4, pool_id: "ned_sep" }
        ],
        pools: {
          fnb_sep: [
            { line_date: "2026-09-02", description: "Customer settlement — Springs Fit (INV-1023)", reference: "INV-1023", amount: 19430.00 },
            { line_date: "2026-09-04", description: "Customer settlement — Cape Union (INV-1031)", reference: "INV-1031", amount: 12980.00 },
            { line_date: "2026-09-05", description: "Bidvest Grocery — order 4412", reference: "PO-2602", amount: -6420.00 },
            { line_date: "2026-09-08", description: "Monthly rent — Kruger Street (Sep)", reference: "RENT-09", amount: -12800.00 },
            { line_date: "2026-09-10", description: "Card acquirer fees", reference: "FEE-0910", amount: -231.50 },
            { line_date: "2026-09-12", description: "Customer EFT — Woodmead Sports (INV-1029)", reference: "INV-1029", amount: 9570.00 },
            { line_date: "2026-09-15", description: "Municipal utilities — Aug", reference: "UTIL-08", amount: -2187.40 },
            { line_date: "2026-09-18", description: "Customer settlement — Springs Fit (INV-1034)", reference: "INV-1034", amount: 9320.00 },
            { line_date: "2026-09-22", description: "Fuel — Shell Benoni", reference: "FUEL-09", amount: -864.20 },
            { line_date: "2026-09-25", description: "Unknown deposit — reference UNK-2609", reference: "UNK-2609", amount: 1500.00 },
            { line_date: "2026-09-28", description: "Bank charges — September", reference: "CHG-0928", amount: -345.00 }
          ],
          fnb_oct: [
            { line_date: "2026-10-02", description: "Customer settlement — Springs Fit (INV-1036)", reference: "INV-1036", amount: 6150.00 },
            { line_date: "2026-10-05", description: "Shell Benoni — fleet fuel", reference: "FUEL-1002", amount: -812.75 },
            { line_date: "2026-10-07", description: "Monthly rent — Kruger Street (Oct)", reference: "RENT-10", amount: -12800.00 },
            { line_date: "2026-10-09", description: "Customer EFT — Woodmead Sports (INV-1039)", reference: "INV-1039", amount: 4320.00 },
            { line_date: "2026-10-12", description: "Santam premium — October", reference: "DO-1010", amount: -1892.00 },
            { line_date: "2026-10-13", description: "Card acquirer fees", reference: "FEE-1006", amount: -197.25 }
          ],
          ned_sep: [
            { line_date: "2026-08-31", description: "Interest capitalised — August", reference: "INT-2608", amount: 595.50 },
            { line_date: "2026-09-30", description: "Interest capitalised — September", reference: "INT-2609", amount: 601.75 },
            { line_date: "2026-10-12", description: "Transfer from FNB Business Cheque (***771)", reference: "TRF-2610", amount: 15000.00 },
            { line_date: "2026-10-13", description: "Debit order — Nedbank facility fee", reference: "NED-FEE", amount: -150.00 }
          ],
          cap_oct: [
            { line_date: "2026-10-05", description: "Top-up — transfer from FNB ***771", reference: "TRF-2611", amount: 1000.00 },
            { line_date: "2026-10-09", description: "Courier — Sandton document run", reference: "PC-122", amount: -180.00 }
          ]
        },
        bank_pool: { 1: "fnb_oct", 2: "ned_sep", 3: "cap_oct" },
        /* auto-match hints: reference → matchable */
        hints: { "UNK-2609": "receipt" },
        stmt_recon: {},
        recons: {}
      };

      /* ── enrich existing FNB row (additive fields only) ── */
      if (BANKS[0]) {
        if (!BANKS[0].name) BANKS[0].name = "FNB Business Cheque";
        if (!BANKS[0].account_holder) BANKS[0].account_holder = "Mokoko Trading (Pty) Ltd";
        if (!BANKS[0].branch_code) BANKS[0].branch_code = "250655";
        if (!BANKS[0].swift_code) BANKS[0].swift_code = "FIRNZAJJ";
        if (!BANKS[0].ledger_account_code) BANKS[0].ledger_account_code = BANKS[0].gl_account_code || "BS_CA_1000";
        if (BANKS[0].is_default_receipts === undefined) BANKS[0].is_default_receipts = true;
        if (BANKS[0].is_default_payments === undefined) BANKS[0].is_default_payments = true;
      }
      /* ── two more company accounts (new demo data) ── */
      BANKS.push(
        {
          id: 2, name: "Nedbank Money Market", bank_name: "Nedbank",
          account_name: "Mokoko Trading (Pty) Ltd", account_holder: "Mokoko Trading (Pty) Ltd",
          account_number: "1198xxxx402", branch_code: "198765", swift_code: "NEDSZAJJ",
          currency: "ZAR", gl_account_code: "BS_CA_1010", ledger_account_code: "BS_CA_1010",
          balance: 98802.75, is_default_receipts: false, is_default_payments: false
        },
        {
          id: 3, name: "Capitec Petty Cash", bank_name: "Capitec",
          account_name: "Mokoko Trading (Pty) Ltd", account_holder: "Mokoko Trading (Pty) Ltd",
          account_number: "4701xxxx856", branch_code: "470010", swift_code: "CABLZAJJ",
          currency: "ZAR", gl_account_code: "BS_CA_1020", ledger_account_code: "BS_CA_1020",
          balance: 2983.50, is_default_receipts: false, is_default_payments: false
        }
      );

      /* ── seeded reconciliation #501 — FNB September (11 items) ── */
      var cb501Items = [
        { line_date: "2026-09-02", description: "Customer settlement — Springs Fit (INV-1023)", reference: "INV-1023", amount: 19430.00, match_status: "matched", match_type: "receipt" },
        { line_date: "2026-09-04", description: "Customer settlement — Cape Union (INV-1031)", reference: "INV-1031", amount: 12980.00, match_status: "matched", match_type: "receipt" },
        { line_date: "2026-09-05", description: "Bidvest Grocery — order 4412", reference: "PO-2602", amount: -6420.00, match_status: "matched", match_type: "payment" },
        { line_date: "2026-09-08", description: "Monthly rent — Kruger Street (Sep)", reference: "RENT-09", amount: -12800.00, match_status: "matched", match_type: "payment" },
        { line_date: "2026-09-10", description: "Card acquirer fees", reference: "FEE-0910", amount: -231.50, match_status: "matched", match_type: "payment" },
        { line_date: "2026-09-12", description: "Customer EFT — Woodmead Sports (INV-1029)", reference: "INV-1029", amount: 9570.00, match_status: "matched", match_type: "receipt" },
        { line_date: "2026-09-15", description: "Municipal utilities — Aug", reference: "UTIL-08", amount: -2187.40, match_status: "unmatched", match_type: "" },
        { line_date: "2026-09-18", description: "Customer settlement — Springs Fit (INV-1034)", reference: "INV-1034", amount: 9320.00, match_status: "matched", match_type: "receipt" },
        { line_date: "2026-09-22", description: "Fuel — Shell Benoni", reference: "FUEL-09", amount: -864.20, match_status: "matched", match_type: "payment" },
        { line_date: "2026-09-25", description: "Unknown deposit — reference UNK-2609", reference: "UNK-2609", amount: 1500.00, match_status: "unmatched", match_type: "" },
        { line_date: "2026-09-28", description: "Bank charges — September", reference: "CHG-0928", amount: -345.00, match_status: "excluded", match_type: "", exclude_reason: "Below materiality — accrued in October" }
      ];
      cb501Items.forEach(function (it) { it.recon_item_id = window.__CB1.seq.item++; });
      window.__CB1.recons[501] = {
        reconciliation_id: 501, bank_account_id: 1, statement_id: 881,
        period_start: "2026-09-01", period_end: "2026-09-30", status: "in_progress",
        items: cb501Items
      };
      window.__CB1.stmt_recon[881] = 501;

      /* ── seeded reconciliation #502 — Nedbank Sep/Oct (4 items) ── */
      var cb502Items = [
        { line_date: "2026-08-31", description: "Interest capitalised — August", reference: "INT-2608", amount: 595.50, match_status: "matched", match_type: "receipt" },
        { line_date: "2026-09-30", description: "Interest capitalised — September", reference: "INT-2609", amount: 601.75, match_status: "matched", match_type: "receipt" },
        { line_date: "2026-10-12", description: "Transfer from FNB Business Cheque (***771)", reference: "TRF-2610", amount: 15000.00, match_status: "matched", match_type: "receipt" },
        { line_date: "2026-10-13", description: "Debit order — Nedbank facility fee", reference: "NED-FEE", amount: -150.00, match_status: "unmatched", match_type: "" }
      ];
      cb502Items.forEach(function (it) { it.recon_item_id = window.__CB1.seq.item++; });
      window.__CB1.recons[502] = {
        reconciliation_id: 502, bank_account_id: 2, statement_id: 883,
        period_start: "2026-08-31", period_end: "2026-10-13", status: "in_progress",
        items: cb502Items
      };
      window.__CB1.stmt_recon[883] = 502;

      /* ── cashbook ledger shims (running-balance seed rows) ── */
      window.__CB1.LEDGER = {
        BS_CA_1010: [
          { journal_id: 9101, date: "2026-08-01", ref: "OB-1010", account: "BS_CA_1010", description: "Opening balance — Nedbank Money Market (b/f)", debit: 85000, credit: 0 },
          { journal_id: 9102, date: "2026-08-31", ref: "INT-2608", account: "BS_CA_1010", description: "Interest capitalised — August", debit: 0, credit: 595.50 },
          { journal_id: 9103, date: "2026-09-30", ref: "INT-2609", account: "BS_CA_1010", description: "Interest capitalised — September", debit: 0, credit: 601.75 },
          { journal_id: 9104, date: "2026-10-12", ref: "TRF-2610", account: "BS_CA_1010", description: "Transfer from FNB Business Cheque (***771)", debit: 15000, credit: 0 }
        ],
        BS_CA_1020: [
          { journal_id: 9111, date: "2026-09-01", ref: "OB-1020", account: "BS_CA_1020", description: "Petty cash float — opening", debit: 2500, credit: 0 },
          { journal_id: 9112, date: "2026-09-06", ref: "PC-118", account: "BS_CA_1020", description: "Courier — Sandton document run", debit: 0, credit: 180 },
          { journal_id: 9113, date: "2026-09-11", ref: "PC-119", account: "BS_CA_1020", description: "Parking — client visit", debit: 0, credit: 96.50 },
          { journal_id: 9114, date: "2026-09-19", ref: "PC-120", account: "BS_CA_1020", description: "Cleaning consumables", debit: 0, credit: 240 },
          { journal_id: 9115, date: "2026-10-05", ref: "PC-121", account: "BS_CA_1020", description: "Top-up — transfer from FNB ***771", debit: 1000, credit: 0 }
        ]
      };
    }
    var CB1 = window.__CB1;

    /* ── cb1 helpers ── */
    function cb1BankById(id) {
      for (var i = 0; i < BANKS.length; i++) {
        if (Number(BANKS[i].id) === Number(id)) return BANKS[i];
      }
      return null;
    }
    function cb1StmtById(id) {
      for (var i = 0; i < CB1.statements.length; i++) {
        if (Number(CB1.statements[i].id) === Number(id)) return CB1.statements[i];
      }
      return null;
    }
    function cb1ReconSummary(r) {
      var m = 0, u = 0, e = 0, p = 0;
      (r.items || []).forEach(function (it) {
        var s = String(it.match_status || "").toLowerCase();
        if (s === "matched") m++;
        else if (s === "excluded") e++;
        else if (s === "partial") p++;
        else u++;
      });
      return { matched: m, unmatched: u, excluded: e, partial: p, total: (r.items || []).length };
    }
    function cb1PoolToItems(pool) {
      return (pool || []).map(function (ln) {
        return {
          recon_item_id: CB1.seq.item++,
          line_date: ln.line_date, description: ln.description,
          reference: ln.reference, amount: ln.amount,
          match_status: "unmatched", match_type: ""
        };
      });
    }

    /* ── cb1: cashbook ledger shims (bare-array shape for the cashbook
       loader; only fires for bank GL codes with NO from/to params so
       the General Ledger screen keeps using the generic route) ── */
    if (cidMatch && /\/ledger$/.test(pathname)) {
      var cbAcc = query.get("account") || "";
      var cbFrom = query.get("from") || "";
      var cbTo = query.get("to") || "";
      if (cbAcc && !cbFrom && !cbTo) {
        if (cbAcc === "BS_CA_1000") {
          /* same source, filter and order as the generic route — array envelope */
          var cbFnb = [];
          JOURNALS.forEach(function (j) {
            j.lines.forEach(function (ln) {
              if (ln.account_code !== "BS_CA_1000") return;
              cbFnb.push({
                journal_id: j.id, date: j.date, ref: j.ref, account: ln.account_code,
                description: j.description, debit: ln.debit, credit: ln.credit
              });
            });
          });
          return json(cbFnb);
        }
        if (CB1.LEDGER[cbAcc]) return json(CB1.LEDGER[cbAcc].slice());
      }
    }

    /* ── cb1: bank account detail + create + update ── */
    if (cidMatch && pathname.indexOf("/bank_accounts") !== -1) {
      var cbBPath = pathname.replace(/\/$/, "");
      var mBankId = cbBPath.match(/\/bank_accounts\/(\d+)$/);
      if (mBankId) {
        var cbBId = parseInt(mBankId[1], 10);
        var cbBRow = cb1BankById(cbBId);
        if (!cbBRow) return json({ ok: false, error: "Bank account not found" }, 404);
        if (method === "PUT") {
          var cbBUp = {};
          try { cbBUp = JSON.parse(opts.body || "{}"); } catch (e) { }
          ["name", "bank_name", "account_name", "account_number", "branch_code",
            "swift_code", "currency", "ledger_account_code"].forEach(function (k) {
              if (cbBUp[k] !== undefined) cbBRow[k] = cbBUp[k];
            });
          if (cbBUp.is_default_receipts !== undefined) cbBRow.is_default_receipts = !!cbBUp.is_default_receipts;
          if (cbBUp.is_default_payments !== undefined) cbBRow.is_default_payments = !!cbBUp.is_default_payments;
          if (!cbBRow.gl_account_code) cbBRow.gl_account_code = cbBRow.ledger_account_code;
        }
        return json(cbBRow);
      }
      if (/\/bank_accounts$/.test(cbBPath) && method === "POST") {
        var cbNewB = {};
        try { cbNewB = JSON.parse(opts.body || "{}"); } catch (e) { }
        var cbNextId = 1;
        BANKS.forEach(function (b) { if (Number(b.id) >= cbNextId) cbNextId = Number(b.id) + 1; });
        var cbRow = {
          id: cbNextId,
          name: cbNewB.name || "New bank account",
          bank_name: cbNewB.bank_name || "",
          account_name: cbNewB.account_name || "",
          account_holder: cbNewB.account_name || "",
          account_number: cbNewB.account_number || "",
          branch_code: cbNewB.branch_code || "",
          swift_code: cbNewB.swift_code || "",
          currency: cbNewB.currency || "ZAR",
          ledger_account_code: cbNewB.ledger_account_code || "BS_CA_1000",
          gl_account_code: cbNewB.ledger_account_code || "BS_CA_1000",
          is_default_receipts: !!cbNewB.is_default_receipts,
          is_default_payments: !!cbNewB.is_default_payments
        };
        BANKS.push(cbRow);
        return json(cbRow);
      }
      /* GET /bank_accounts (list) falls through to the existing route below */
    }

    /* ── cb1: bank statements ── */
    if (cidMatch && pathname.indexOf("/bank_statements") !== -1) {
      var cbSPath = pathname.replace(/\/$/, "");

      if (/\/bank_statements\/preview$/.test(cbSPath) && method === "POST") {
        var cbPrevName = "bank-statement.csv";
        try {
          var fdPrev = opts.body;
          if (fdPrev && typeof fdPrev.get === "function" && fdPrev.get("file") && fdPrev.get("file").name) {
            cbPrevName = fdPrev.get("file").name;
          }
        } catch (e) { }
        return json({
          ok: true, file_name: cbPrevName, row_count: 8,
          suggested_mapping: { date: "Date", description: "Description", reference: "Reference", amount: "Amount" },
          detected_bank: "auto"
        });
      }

      if (/\/bank_statements\/import$/.test(cbSPath) && method === "POST") {
        var cbImpBank = 1, cbImpName = "bank-statement.csv";
        try {
          var fdImp = opts.body;
          if (fdImp && typeof fdImp.get === "function") {
            cbImpBank = Number(fdImp.get("bank_account_id")) || 1;
            if (fdImp.get("file") && fdImp.get("file").name) cbImpName = fdImp.get("file").name;
          }
        } catch (e) { }
        var cbImpPool = [];
        var cbImpBase = new Date("2026-10-13T00:00:00");
        for (var ci = 0; ci < 8; ci++) {
          var cbD = new Date(cbImpBase.getTime() - (7 - ci) * 86400000);
          var cbIsIn = (ci === 0 || ci === 2 || ci === 5 || ci === 7);
          cbImpPool.push({
            line_date: cbD.toISOString().slice(0, 10),
            description: cbIsIn
              ? "Customer settlement — EFT received" + (ci ? " (INV-104" + ci + ")" : "")
              : "Supplier payment — EFT sent",
            reference: cbIsIn ? (ci === 5 ? "POS-10" + ci : "INV-104" + ci) : "PAY-10" + ci,
            amount: cbIsIn ? [7240, 0, 5480, 0, 0, 11275.40, 0, 8900][ci] : -[0, 3120, 0, 289.50, 2431.10, 0, 412, 0][ci]
          });
        }
        var cbImpId = CB1.seq.stmt++;
        CB1.statements.push({
          id: cbImpId, bank_account_id: cbImpBank, file_name: cbImpName,
          status: "imported", currency: "ZAR",
          uploaded_at: new Date().toISOString().slice(0, 16).replace("T", " "),
          line_count: cbImpPool.length, pool_id: "imp_" + cbImpId
        });
        CB1.pools["imp_" + cbImpId] = cbImpPool;
        return json({ ok: true, import_id: cbImpId, statement_id: cbImpId, line_count: cbImpPool.length });
      }

      var mStmtAct = cbSPath.match(/\/bank_statements\/(\d+)(?:\/(create_reconciliation|post|lines))?$/);
      if (mStmtAct) {
        var cbStmt = cb1StmtById(parseInt(mStmtAct[1], 10));
        if (!cbStmt) return json({ ok: false, error: "Statement not found" }, 404);
        var cbAct = mStmtAct[2] || "";

        if (cbAct === "create_reconciliation" && method === "POST") {
          var cbExisting = CB1.stmt_recon[cbStmt.id];
          if (cbExisting && CB1.recons[cbExisting]) {
            return json({ ok: true, reconciliation_id: cbExisting, existing: true });
          }
          var cbRid = CB1.seq.recon++;
          var cbItems = cb1PoolToItems(CB1.pools[cbStmt.pool_id]);
          var cbDates = cbItems.map(function (x) { return x.line_date; }).sort();
          CB1.recons[cbRid] = {
            reconciliation_id: cbRid, bank_account_id: cbStmt.bank_account_id,
            statement_id: cbStmt.id,
            period_start: cbDates[0] || "2026-10-01",
            period_end: cbDates[cbDates.length - 1] || "2026-10-31",
            status: "in_progress", items: cbItems
          };
          CB1.stmt_recon[cbStmt.id] = cbRid;
          return json({ ok: true, reconciliation_id: cbRid });
        }
        if (cbAct === "post" && method === "POST") {
          cbStmt.status = "posted";
          return json({ ok: true, statement_id: cbStmt.id, status: "posted" });
        }
        /* statement detail + lines */
        var cbDet = Object.assign({}, cbStmt, {
          lines: (CB1.pools[cbStmt.pool_id] || []).slice(),
          bank: (cb1BankById(cbStmt.bank_account_id) || {}).name || ""
        });
        return json({ ok: true, statement: cbDet, lines: cbDet.lines });
      }

      /* statement list — bare array (loadBankStatements: Array.isArray check) */
      var cbSBank = query.get("bank_account_id") || "";
      var cbSList = CB1.statements.filter(function (s) {
        return !cbSBank || String(s.bank_account_id) === String(cbSBank);
      }).sort(function (a, b) { return Number(b.id) - Number(a.id); });
      return json(cbSList.map(function (s) { return Object.assign({}, s); }));
    }

    /* ── cb1: bank reconciliations ── */
    if (cidMatch && pathname.indexOf("/bank_reconciliations") !== -1) {
      var cbRPath = pathname.replace(/\/$/, "");

      /* create recon from the cashbook panel */
      if (/\/bank_reconciliations$/.test(cbRPath) && method === "POST") {
        var cbRBody = {};
        try { cbRBody = JSON.parse(opts.body || "{}"); } catch (e) { }
        var cbBankId = Number(cbRBody.bank_account_id) || 1;
        var cbPoolId = CB1.bank_pool[cbBankId] || "fnb_oct";
        var cbPool = CB1.pools[cbPoolId] || [];
        var cbInPeriod = cbPool.filter(function (ln) {
          return (!cbRBody.period_start || ln.line_date >= cbRBody.period_start) &&
            (!cbRBody.period_end || ln.line_date <= cbRBody.period_end);
        });
        if (!cbInPeriod.length) cbInPeriod = cbPool;
        var cbRid2 = CB1.seq.recon++;
        CB1.recons[cbRid2] = {
          reconciliation_id: cbRid2, bank_account_id: cbBankId, statement_id: null,
          period_start: cbRBody.period_start || "2026-10-01",
          period_end: cbRBody.period_end || "2026-10-31",
          status: "in_progress", items: cb1PoolToItems(cbInPeriod)
        };
        return json({ ok: true, reconciliation_id: cbRid2 });
      }

      /* auto-match */
      var mAuto2 = cbRPath.match(/\/bank_reconciliations\/(\d+)\/auto_match$/);
      if (mAuto2 && method === "POST") {
        var cbRec2 = CB1.recons[parseInt(mAuto2[1], 10)];
        if (!cbRec2) return json({ ok: false, error: "Reconciliation not found" }, 404);
        var cbMatched = 0;
        (cbRec2.items || []).forEach(function (it) {
          if (String(it.match_status).toLowerCase() !== "unmatched") return;
          var ref = String(it.reference || "").toUpperCase();
          var hint = CB1.hints[String(it.reference || "").toUpperCase()];
          var autoOk = hint || /^(INV|RCT|POS|TRF)/.test(ref);
          if (autoOk) {
            it.match_status = "matched";
            it.match_type = hint || (Number(it.amount) >= 0 ? "receipt" : "payment");
            it.auto_matched = true;
            cbMatched++;
          }
        });
        return json({ ok: true, matched: cbMatched });
      }

      /* item-level actions (exclude / attach_journal) */
      var mItemAct2 = cbRPath.match(/\/bank_reconciliations\/items\/(\d+)\/(exclude|attach_journal)$/);
      if (mItemAct2 && method === "POST") {
        var cbItId = parseInt(mItemAct2[1], 10);
        var cbItAct = mItemAct2[2];
        var cbItRec = null, cbIt = null;
        Object.keys(CB1.recons).forEach(function (rk) {
          var r = CB1.recons[rk];
          (r.items || []).forEach(function (x) {
            if (Number(x.recon_item_id) === cbItId) { cbIt = x; cbItRec = r; }
          });
        });
        if (!cbIt) return json({ ok: false, error: "Recon item not found" }, 404);
        var cbItBody = {};
        try { cbItBody = JSON.parse(opts.body || "{}"); } catch (e) { }
        if (cbItAct === "exclude") {
          cbIt.match_status = "excluded";
          cbIt.match_type = "";
          cbIt.exclude_reason = cbItBody.reason || "";
        } else {
          cbIt.match_status = "matched";
          cbIt.match_type = cbItBody.match_type || (Number(cbIt.amount) >= 0 ? "receipt" : "payment");
          cbIt.journal_id = cbItBody.journal_id || null;
        }
        return json({ ok: true, recon_item_id: cbIt.recon_item_id, match_status: cbIt.match_status });
      }

      /* items list — bare array (renderReconItems: Array.isArray check) */
      var mItems2 = cbRPath.match(/\/bank_reconciliations\/(\d+)\/items$/);
      if (mItems2) {
        var cbRec3 = CB1.recons[parseInt(mItems2[1], 10)];
        if (!cbRec3) return json([]);
        var cbFilter = (query.get("status") || "").toLowerCase();
        var cbOut = (cbRec3.items || []).filter(function (x) {
          return !cbFilter || String(x.match_status).toLowerCase() === cbFilter;
        });
        return json(cbOut.map(function (x) { return Object.assign({}, x); }));
      }

      /* recon detail */
      var mRecDet = cbRPath.match(/\/bank_reconciliations\/(\d+)$/);
      if (mRecDet) {
        var cbRec4 = CB1.recons[parseInt(mRecDet[1], 10)];
        if (!cbRec4) return json({ ok: false, error: "Reconciliation not found" }, 404);
        return json({ ok: true, recon: Object.assign({}, cbRec4, { summary: cb1ReconSummary(cbRec4) }) });
      }

      /* recon list */
      var cbRList = Object.keys(CB1.recons).map(function (k) {
        var r = CB1.recons[k];
        var cbBk = cb1BankById(r.bank_account_id) || {};
        return {
          reconciliation_id: r.reconciliation_id,
          bank_account_id: r.bank_account_id,
          bank_name: cbBk.name || cbBk.bank_name || ("Account " + r.bank_account_id),
          period_start: r.period_start, period_end: r.period_end,
          status: r.status, statement_id: r.statement_id,
          summary: cb1ReconSummary(r)
        };
      }).sort(function (a, b) { return b.reconciliation_id - a.reconciliation_id; });
      var cbRBank = query.get("bank_account_id") || "";
      if (cbRBank) cbRList = cbRList.filter(function (r) { return String(r.bank_account_id) === String(cbRBank); });
      return json({ ok: true, rows: cbRList, items: cbRList, data: cbRList, total: cbRList.length });
    }

    if (cidMatch && /\/ledger$/.test(pathname)) {
      var lAcc = query.get("account") || "ALL";
      var lFrom = query.get("from") || "";
      var lTo = query.get("to") || "";
      var lRows = [];
      JOURNALS.forEach(function (j) {
        if (lFrom && j.date < lFrom) return;
        if (lTo && j.date > lTo) return;
        j.lines.forEach(function (ln) {
          if (lAcc !== "ALL" && ln.account_code !== lAcc) return;
          lRows.push({
            journal_id: j.id,
            date: j.date,
            ref: j.ref,
            account: ln.account_code,
            description: j.description,
            debit: ln.debit,
            credit: ln.credit
          });
        });
      });
      return json({ rows: lRows, total: lRows.length });
    }
    if (cidMatch && /\/pnl_mini$/.test(pathname)) return json({ rows: PNL_ROWS });
    if (cidMatch && /\/bs_mini$/.test(pathname)) return json({ rows: BS_ROWS });
    if (cidMatch && /\/cashflow_mini$/.test(pathname)) {
      return json({ meta: { label: SNAPSHOT.meta.label }, rows: CF_ROWS });
    }
    if (cidMatch && /\/dashboard_snapshot$/.test(pathname)) return json(SNAPSHOT);
    if (cidMatch && /\/accounting-work-queue$/.test(pathname)) return json(WORKQUEUE);
    if (cidMatch && /\/vat\/rates$/.test(pathname)) return json(VAT_RATES);
    if (cidMatch && /\/vat_summary$/.test(pathname)) {
      /* rp3: range-aware VAT summary (was a static net_vat:375 stub). Ties to
         the seeded VAT workspace — input 8,955 · output 14,760 · net 5,805 */
      var v2hit = vat2InPeriod(query.get("from"), query.get("to"));
      var v2t = v2hit ? vat2Totals() : { input_total: 0, output_total: 0, net_vat: 0 };
      return json({
        ok: true,
        from: query.get("from") || "",
        to: query.get("to") || "",
        input_total: v2t.input_total,
        output_total: v2t.output_total,
        net_vat: v2t.net_vat
      });
    }
    if (cidMatch && /\/period-range$/.test(pathname)) {
      return json({ from: monthStart, to: monthEnd, label: MONTH_LABEL });
    }

    /* ---- master data ---- */
    if (cidMatch && /\/customers$/.test(pathname)) {
      var custRows = CUSTOMERS.map(function (c) { return Object.assign({ is_active: true }, c); });
      /* multi-key shape: every unwrap path in dashboard.js finds the list */
      return json({ ok: true, rows: custRows, items: custRows, customers: custRows, data: custRows, total: custRows.length });
    }
    if (cidMatch && /\/vendors$/.test(pathname)) {
      var vendRows = VENDORS.map(function (v) {
        return Object.assign({ is_active: true, vendor_status: v.status || "active",
          vendor_name: v.name, outstanding: v.balance }, v);
      });
      /* multi-key shape: renderApVendorList reads res.data, others read rows */
      return json({ ok: true, rows: vendRows, vendors: vendRows, data: vendRows, total: vendRows.length });
    }
    if (cidMatch && /\/bank_accounts$/.test(pathname)) {
      var bankRows = BANKS.map(function (b) {
        return Object.assign({ bank_account_id: b.id, status: "active",
          label: (b.bank_name || "") + " — " + (b.account_name || "") + " (" + (b.account_number || "") + ")" }, b);
      });
      /* BARE ARRAY envelope: populateInvoiceBankSelect + every other
         consumer (refreshBankAccounts, loadVatBankAccounts, loans,
         payments, receive-goods) all tolerate arrays — the old
         multi-key object wiped BANK_ACCOUNTS_CACHE and broke the
         cashbook's ledger lookup (cb1 fix, Task 18) */
      return json(bankRows);
    }
    if (cidMatch && /\/users$/.test(pathname)) {
      return json({ rows: [{ id: 7, email: USER.email, full_name: USER.name, role: "senior", status: "active" }], owner_user_id: 7 });
    }
    if (pathname.indexOf("/api/credit/pending") !== -1) return json({ rows: [] });
    if (cidMatch && /\/approvals$/.test(pathname)) return json({ rows: [] });
    if (cidMatch && /\/audit$/.test(pathname)) return json({ rows: [] });
    if (cidMatch && /\/period-locks?$/.test(pathname)) return json({ locked: false, rows: [] });
    if (cidMatch && /\/lock/.test(pathname) && pathname.indexOf("/forecast/") === -1) return json({ locked: false, ok: true });


    /* ---- AR: invoices (AR_DOCS_V1) ---- */
    if (cidMatch && /\/invoices\/\d+\/(post|approve|submit)$/.test(pathname)) {
      var docId = parseInt(pathname.match(/\/invoices\/(\d+)\//)[1], 10);
      var doc = INVOICES.filter(function (i) { return i.id === docId; })[0];
      var act = pathname.split("/").pop();
      if (doc) {
        if (act === "post") doc.status = "posted";
        if (act === "approve") doc.status = "approved";
        if (act === "submit") doc.status = "pending_approval";
      }
      return json({ ok: true, invoice: doc ? invPayload(doc) : null, data: doc ? invPayload(doc) : null });
    }
    if (cidMatch && /\/invoices\/\d+$/.test(pathname)) {
      var one = INVOICES.filter(function (i) {
        return i.id === parseInt(pathname.match(/\/invoices\/(\d+)$/)[1], 10); })[0];
      if (!one) return json({ ok: false, error: "Invoice not found" }, 404);
      var p = invPayload(one);
      return json({ ok: true, invoice: p, data: p });
    }
    if (cidMatch && /\/invoices$/.test(pathname)) {
      if (opts.method === "POST") {
        var bodyInv = {};
        try { bodyInv = JSON.parse(opts.body || "{}"); } catch (e) {}
        var newInv = {
          id: _arSeq.invoice++, number: "INV-" + _arSeq.invoice,
          customer_id: Number(bodyInv.customer_id) || 0, customer_name: bodyInv.customer_name || custName(bodyInv.customer_id),
          invoice_date: bodyInv.invoice_date || new Date().toISOString().slice(0, 10),
          due_date: bodyInv.due_date || new Date().toISOString().slice(0, 10),
          terms: bodyInv.terms || "30", status: "draft", currency: bodyInv.currency || "ZAR",
          vat_enabled: bodyInv.vat_enabled !== false,
          subtotal_amount: Number(bodyInv.subtotal_amount) || 0,
          vat_amount: Number(bodyInv.vat_amount) || 0,
          total_amount: Number(bodyInv.total_amount) || 0,
          paid_amount: 0, outstanding_amount: Number(bodyInv.total_amount) || 0,
          notes: bodyInv.notes || bodyInv.memo || "",
          lines: Array.isArray(bodyInv.lines) ? bodyInv.lines : []
        };
        INVOICES.push(newInv);
        if (typeof revRecordInvoiceBilling === "function" && (Number(bodyInv.revenue_contract_id) || 0) > 0) {
          try { revRecordInvoiceBilling(newInv, bodyInv); } catch (e) {}
        }
        return json({ ok: true, invoice: invPayload(newInv), data: invPayload(newInv), id: newInv.id });
      }
      var qStatus = (query.get("status") || "").toLowerCase();
      var qCust = query.get("customer_id");
      var rows = INVOICES.filter(function (i) {
        if (qCust && String(i.customer_id) !== String(qCust)) return false;
        if (qStatus && qStatus !== "all") {
          var wanted = qStatus.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
          if (wanted.length && wanted.indexOf(String(i.status).toLowerCase()) === -1) return false;
        }
        return true;
      }).map(invPayload);
      /* shape covers every unwrap path used by dashboard.js */
      return json({ ok: true, rows: rows, items: rows, invoices: rows, data: rows, total: rows.length });
    }
    if (cidMatch && /\/customers\/\d+\/invoices$/.test(pathname)) {
      var pcust = pathname.match(/\/customers\/(\d+)\/invoices$/)[1];
      var crows = INVOICES.filter(function (i) {
        return String(i.customer_id) === String(pcust) &&
               ["draft", "pending_approval"].indexOf(String(i.status).toLowerCase()) === -1;
      }).map(invPayload);
      return json({ ok: true, rows: crows, items: crows, invoices: crows, data: crows, total: crows.length });
    }
    if (cidMatch && /\/customers\/\d+\/highlights$/.test(pathname)) {
      var hid = pathname.match(/\/customers\/(\d+)\/highlights$/)[1];
      var bal = invOpenTotal(hid);
      var openCnt = INVOICES.filter(function (i) {
        return String(i.customer_id) === String(hid) &&
               ["posted", "approved", "partial", "unpaid", "open"].indexOf(i.status) !== -1;
      }).length;
      var recent = INVOICES.filter(function (i) { return String(i.customer_id) === String(hid); })
        .sort(function (a, b) { return b.id - a.id; }).slice(0, 4)
        .map(function (i) { return { number: i.number, status: i.status, total_amount: i.total_amount }; });
      return json({ balance: bal, open_invoices_count: openCnt, recent_invoices: recent });
    }

    /* ---- AR: quotes (AR_DOCS_V1) ---- */
    if (cidMatch && /\/quotes\/\d+\/issue$/.test(pathname)) {
      var qidIss = parseInt(pathname.match(/\/quotes\/(\d+)\/issue$/)[1], 10);
      var qIss = QUOTES.filter(function (q) { return q.id === qidIss; })[0];
      if (qIss) { qIss.status = "issued"; if (!qIss.number) qIss.number = "QT-" + qidIss; }
      return json({ ok: true, quote: qIss || null, data: qIss || null });
    }
    if (cidMatch && /\/quotes\/\d+\/accept$/.test(pathname)) {
      var qidAcc = parseInt(pathname.match(/\/quotes\/(\d+)\/accept$/)[1], 10);
      var qAcc = QUOTES.filter(function (q) { return q.id === qidAcc; })[0];
      var newInvId = null;
      if (qAcc) {
        qAcc.status = "converted";
        var conv = {
          id: _arSeq.invoice++, number: "INV-" + _arSeq.invoice,
          customer_id: qAcc.customer_id, customer_name: qAcc.customer_name,
          invoice_date: new Date().toISOString().slice(0, 10),
          due_date: addDays(new Date().toISOString().slice(0, 10), 30),
          terms: "30", status: "posted", currency: qAcc.currency || "ZAR",
          vat_enabled: true,
          subtotal_amount: qAcc.subtotal_amount, vat_amount: qAcc.vat_amount,
          total_amount: qAcc.total_amount, paid_amount: 0,
          outstanding_amount: qAcc.total_amount,
          notes: "Converted from quote " + (qAcc.number || ("QT-" + qAcc.id)) + ".",
          lines: (qAcc.lines || []).map(function (l) { return Object.assign({}, l); })
        };
        INVOICES.push(conv);
        newInvId = conv.id;
      }
      return json({ ok: true, invoice_id: newInvId, quote: qAcc || null, data: qAcc || null });
    }
    if (cidMatch && /\/quotes\/\d+$/.test(pathname)) {
      if (opts.method === "PUT") {
        var qidUp = parseInt(pathname.match(/\/quotes\/(\d+)$/)[1], 10);
        var bodyUp = {};
        try { bodyUp = JSON.parse(opts.body || "{}"); } catch (e) {}
        var qUp = QUOTES.filter(function (q) { return q.id === qidUp; })[0];
        if (qUp && bodyUp && typeof bodyUp === "object") {
          ["number", "status", "notes", "terms", "quotation_date", "currency"].forEach(function (k) {
            if (bodyUp[k] !== undefined) qUp[k] = bodyUp[k];
          });
          if (bodyUp.lines) qUp.lines = bodyUp.lines;
          if (bodyUp.subtotal_amount !== undefined) qUp.subtotal_amount = Number(bodyUp.subtotal_amount) || 0;
          if (bodyUp.vat_amount !== undefined) qUp.vat_amount = Number(bodyUp.vat_amount) || 0;
          if (bodyUp.total_amount !== undefined) qUp.total_amount = Number(bodyUp.total_amount) || 0;
        }
        return json({ ok: true, quote: qUp || null, data: qUp || null });
      }
      var qOne = QUOTES.filter(function (q) {
        return q.id === parseInt(pathname.match(/\/quotes\/(\d+)$/)[1], 10); })[0];
      if (!qOne) return json({ ok: false, error: "Quote not found" }, 404);
      /* quote fields at TOP level — renderQuote(q) reads q.customer_name etc. */
      var qOut = Object.assign({ ok: true }, qOne, { quote: qOne, data: qOne });
      return json(qOut);
    }
    if (cidMatch && /\/quotes$/.test(pathname)) {
      if (opts.method === "POST") {
        var bodyQ = {};
        try { bodyQ = JSON.parse(opts.body || "{}"); } catch (e) {}
        var newQ = {
          id: _arSeq.quote++, number: "",
          customer_id: Number(bodyQ.customer_id) || 0, customer_name: bodyQ.customer_name || custName(bodyQ.customer_id),
          quotation_date: bodyQ.quotation_date || bodyQ.quote_date || new Date().toISOString().slice(0, 10),
          status: "draft", currency: bodyQ.currency || "ZAR",
          discount_rate: Number(bodyQ.discount_rate) || 0,
          valid_days: Number(bodyQ.valid_days) || 30,
          valid_until: addDays(new Date().toISOString().slice(0, 10), Number(bodyQ.valid_days) || 30),
          subtotal_amount: Number(bodyQ.subtotal_amount) || 0,
          vat_amount: Number(bodyQ.vat_amount) || 0,
          total_amount: Number(bodyQ.total_amount) || 0,
          notes: bodyQ.notes || "", terms: bodyQ.terms || "",
          lines: Array.isArray(bodyQ.lines) ? bodyQ.lines : []
        };
        QUOTES.push(newQ);
        return json({ ok: true, quote: newQ, data: newQ, id: newQ.id });
      }
      var qStatus2 = (query.get("status") || "").toLowerCase();
      var qCust2 = query.get("customer_id");
      var qrows = QUOTES.filter(function (q) {
        if (qCust2 && String(q.customer_id) !== String(qCust2)) return false;
        if (qStatus2 && qStatus2 !== "all") {
          var wanted2 = qStatus2.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
          if (wanted2.length && wanted2.indexOf(String(q.status).toLowerCase()) === -1) return false;
        }
        return true;
      });
      /* { quotes + items + rows } satisfies every unwrap path in dashboard.js */
      return json({ ok: true, quotes: qrows, items: qrows, rows: qrows, data: qrows, total: qrows.length });
    }


    /* ---- Accruals & Deferrals (AD_DATA_V1) ---- */
    if (cidMatch && pathname.indexOf("/accrual-deferrals") !== -1) {
      var m;
      var body = {};
      try { body = JSON.parse(opts.body || "{}"); } catch (e) { }

      /* IFRS 15 backfill (button injected by ensureAdIfrs15SyncButton) */
      if (/\/accrual-deferrals\/backfill-ifrs15$/.test(pathname) && method === "POST") {
        AD_IFRS15_SYNCED = true;
        return json({ ok: true, created: 0, skipped: 1, message: "IFRS 15 mirror item already present (AD-2606)." });
      }

      /* items/preview (POST) — must be tested before /items/:id */
      if (/\/accrual-deferrals\/items\/preview$/.test(pathname) && method === "POST") {
        var pvLines = [
          { line_no: 1, period_start: body && body.start_date || D(1), period_end: body && body.end_date || monthEnd,
            opening_balance: num(body && body.original_amount), recognition_amount: adM(num(body && body.original_amount) / Math.max(1, Number(body && body.total_periods) || 12)),
            closing_balance: 0, status: "pending" }
        ];
        var pvAmt = adM(num(body && body.original_amount) / Math.max(1, Number(body && body.total_periods) || 12));
        pvLines[0].recognition_amount = pvAmt;
        pvLines[0].closing_balance = adM(num(body && body.original_amount) - pvAmt);
        var pvJournal = {
          ref: "JE-AD-PREVIEW", date: body && body.start_date || D(1),
          description: "Initial recognition \u2014 " + (body && body.item_title || "new item"),
          lines: [
            { line_no: 1, account_code: (body && body.dr_account) || "PL_EX_6300", account_name: (body && body.dr_account_name) || "Expense", description: "Initial recognition", debit: num(body && body.original_amount), credit: 0 },
            { line_no: 2, account_code: (body && body.cr_account) || "BS_CA_1150", account_name: (body && body.cr_account_name) || "Prepaid", description: "Initial recognition", debit: 0, credit: num(body && body.original_amount) }
          ],
          total_debit: num(body && body.original_amount), total_credit: num(body && body.original_amount), balanced: true
        };
        return json({ ok: true, preview: { journal: pvJournal, journal_preview: pvJournal, schedule_preview: pvLines, schedule: pvLines } });
      }

      /* items create-and-post */
      if (/\/accrual-deferrals\/items\/create-and-post$/.test(pathname) && method === "POST") {
        var capItem = adCreateItemFromBody(body);
        return json({ ok: true, item: capItem, journal_id: "JE-AD-" + (1000 + (AD_RUN_SEQ % 1000)) });
      }

      /* items list (GET + POST create) */
      if (/\/accrual-deferrals\/items$/.test(pathname) || /\/accrual-deferrals\/items\/$/.test(pathname)) {
        if (method === "POST") {
          var newItem = adCreateItemFromBody(body);
          return json({ ok: true, item: newItem, id: newItem.id });
        }
        var fType = query.get("item_type") || "";
        var fStatus = query.get("status") || "";
        var rows = AD_ITEMS.filter(function (x) {
          if (fType && x.item_type !== fType) return false;
          if (fStatus && x.status !== fStatus) return false;
          return true;
        }).map(function (x) { return Object.assign({}, x); });
        return json({ ok: true, items: rows, rows: rows, data: rows, total: rows.length });
      }

      /* runs/preview + runs/post (by-date variants) — before /runs/:id */
      if (/\/accrual-deferrals\/runs\/preview$/.test(pathname)) {
        var bdDate = query.get("date") || (body && body.recognition_date) || monthEnd;
        var bdPending = adPendingLines(bdDate);
        var bdJournal = adJournalFor(bdPending, bdDate);
        return json({ ok: true, preview: { schedule: bdPending, entries: bdPending, journal: bdJournal, journal_lines: bdJournal.lines } });
      }
      if (/\/accrual-deferrals\/runs\/post$/.test(pathname) && method === "POST") {
        var bpDate = (body && body.recognition_date) || monthEnd;
        var bpPending = adPendingLines(bpDate);
        var jid = "JE-AD-" + (1000 + (AD_RUN_SEQ % 1000));
        bpPending.forEach(function (ln) {
          var it = adItemById(ln.item_id);
          var list = AD_SCHEDULES[String(ln.item_id)] || [];
          var target = list.filter(function (l) { return String(l.line_no) === String(ln.line_no); })[0];
          if (target) target.status = "posted";
          if (it) { adRefreshItemAggregates(it); }
        });
        return json({ ok: true, journal_id: jid, posted: bpPending.length });
      }

      /* item detail */
      m = pathname.match(/\/accrual-deferrals\/items\/(\d+)$/);
      if (m) {
        var it0 = adItemById(m[1]);
        if (!it0) return json({ ok: false, detail: "not_found" }, 404);
        var detail = Object.assign({}, it0, {
          schedule: (AD_SCHEDULES[String(it0.id)] || []).map(function (l) { return Object.assign({}, l); }),
          source: it0.is_mirror_item ? { contract_number: it0.source_reference, customer_name: "FitZone Gauteng (Pty) Ltd" } : {},
          ifrs15: it0.is_mirror_item ? {
            mirror_only: true, contract_number: it0.source_reference,
            customer_name: "FitZone Gauteng (Pty) Ltd",
            billed_to_date: it0.ifrs15_billed_to_date,
            recognized_revenue_to_date: it0.ifrs15_recognized_to_date
          } : {}
        });
        /* Demo shim: production renderAccrualDeferralDetail() reads bare
           `item` AND `schedule` free variables alongside `data`. Expose
           both synchronously so the panel renders exactly as in
           production. */
        try { window.item = detail; window.schedule = detail.schedule; } catch (e) { }
        return json(detail);
      }

      /* schedule regenerate */
      m = pathname.match(/\/accrual-deferrals\/items\/(\d+)\/schedule\/regenerate$/);
      if (m && method === "POST") {
        var it1 = adItemById(m[1]);
        if (it1) {
          var months1 = 12;
          try {
            var sd = new Date(it1.start_date), ed = new Date(it1.end_date);
            months1 = Math.max(1, Math.round((ed.getUTCFullYear() * 12 + ed.getUTCMonth() - (sd.getUTCFullYear() * 12 + sd.getUTCMonth()))));
          } catch (e) {}
          var per1 = adM(num(it1.original_amount) / months1);
          var posted1 = (AD_SCHEDULES[String(it1.id)] || []).filter(function (l) { return l.status === "posted"; }).length;
          AD_SCHEDULES[String(it1.id)] = adBuildSchedule(
            { y: Number(it1.start_date.slice(0, 4)), m: Number(it1.start_date.slice(5, 7)) },
            months1, per1, posted1, "JE-AD" + it1.id
          );
          adRefreshItemAggregates(it1);
        }
        return json({ ok: true, item: it1 ? Object.assign({}, it1) : null });
      }

      /* initial-preview + post-initial */
      m = pathname.match(/\/accrual-deferrals\/items\/(\d+)\/initial-preview$/);
      if (m) {
        var it2 = adItemById(m[1]);
        var amt2 = it2 ? adM(num(it2.original_amount)) : 0;
        var j2 = {
          ref: "JE-AD-INIT", date: it2 ? it2.start_date : D(1),
          description: "Initial posting \u2014 " + (it2 ? it2.item_number : ""),
          lines: [
            { line_no: 1, account_code: it2 ? it2.dr_account : "PL_EX_6300", account_name: it2 ? it2.dr_account_name : "Expense", description: "Initial recognition", debit: amt2, credit: 0 },
            { line_no: 2, account_code: it2 ? it2.cr_account : "BS_CA_1150", account_name: it2 ? it2.cr_account_name : "Prepaid", description: "Initial recognition", debit: 0, credit: amt2 }
          ],
          total_debit: amt2, total_credit: amt2, balanced: true
        };
        return json({ ok: true, preview: { journal: j2, journal_lines: j2.lines, schedule_preview: [], schedule: [] } });
      }
      m = pathname.match(/\/accrual-deferrals\/items\/(\d+)\/post-initial$/);
      if (m && method === "POST") {
        return json({ ok: true, journal_id: "JE-AD-" + (1000 + (AD_RUN_SEQ % 1000)) });
      }

      /* runs list (GET) + run create (POST) */
      if (/\/accrual-deferrals\/runs$/.test(pathname) || /\/accrual-deferrals\/runs\/$/.test(pathname)) {
        if (method === "POST") {
          var b = body || {};
          var upTo = b.recognition_date || b.run_date || monthEnd;
          var pending = adPendingLines(upTo);
          if (b.item_id) {
            pending = pending.filter(function (ln) { return String(ln.item_id) === String(b.item_id); });
          }
          if (b.item_type) {
            pending = pending.filter(function (ln) { return ln.item_type === b.item_type; });
          }
          var run = {
            id: AD_RUN_SEQ++,
            run_number: "AD-RUN-0" + AD_RUN_SEQ,
            run_date: b.run_date || upTo, recognition_date: upTo,
            period_start: b.period_start || monthStart, period_end: b.period_end || upTo,
            run_scope: b.run_scope || "company", run_reason: b.run_reason || "manual",
            item_type: b.item_type || null, item_id: b.item_id || null,
            status: "draft",
            lines_count: pending.length,
            total_amount: adM(pending.reduce(function (s, l) { return s + num(l.recognition_amount); }, 0)),
            journal_id: null, created_at: D(1)
          };
          AD_RUNS.push(run);
          AD_PENDING_BY_RUN[String(run.id)] = pending.map(function (l) { return l; });
          return json({ ok: true, run: run, run_id: run.id, id: run.id });
        }
        var rr = AD_RUNS.map(function (x) { return Object.assign({}, x); });
        return json({ ok: true, runs: rr, rows: rr, items: rr, data: rr, total: rr.length });
      }

      /* run detail */
      m = pathname.match(/\/accrual-deferrals\/runs\/(\d+)$/);
      if (m) {
        var rd = AD_RUNS.filter(function (x) { return String(x.id) === String(m[1]); })[0];
        return json(rd ? Object.assign({}, rd) : { ok: false }, rd ? 200 : 404);
      }

      /* run preview */
      m = pathname.match(/\/accrual-deferrals\/runs\/(\d+)\/preview$/);
      if (m) {
        var runId = m[1];
        var runP = AD_RUNS.filter(function (x) { return String(x.id) === String(runId); })[0];
        var plines = AD_PENDING_BY_RUN[String(runId)] || (runP ? adPendingLines(runP.recognition_date) : []);
        var pjournal = adJournalFor(plines, runP ? runP.recognition_date : monthEnd);
        return json({ ok: true, preview: { schedule: plines, entries: plines, journal: pjournal, journal_lines: pjournal.lines } });
      }

      /* run post */
      m = pathname.match(/\/accrual-deferrals\/runs\/(\d+)\/post$/);
      if (m && method === "POST") {
        var runQ = AD_RUNS.filter(function (x) { return String(x.id) === String(m[1]); })[0];
        if (!runQ) return json({ ok: false, detail: "not_found" }, 404);
        var qPending = AD_PENDING_BY_RUN[String(runQ.id)] || [];
        qPending.forEach(function (ln) {
          var list = AD_SCHEDULES[String(ln.item_id)] || [];
          var target = list.filter(function (l) { return String(l.line_no) === String(ln.line_no); })[0];
          if (target) target.status = "posted";
          var it4 = adItemById(ln.item_id);
          if (it4) adRefreshItemAggregates(it4);
        });
        AD_PENDING_BY_RUN[String(runQ.id)] = [];
        runQ.status = "posted";
        runQ.posted_at = runQ.recognition_date;
        runQ.journal_id = "JE-AD-" + (1000 + (AD_RUN_SEQ % 1000));
        return json({ ok: true, journal_id: runQ.journal_id, journal: { id: runQ.journal_id }, posted: qPending.length });
      }
    }

    /* ── Accounts Payable — vendor flow (AP_DATA_V1) ─────────────
       Bills · GRNI · vendor statements · AP aging · control recon ·
       vendor payments. In-memory; ties to ledger AP control 52,410. */
    if (cidMatch && (pathname.indexOf("/ap/") !== -1 || pathname.indexOf("/bills") !== -1)) {
      var apBody = {};
      try { apBody = JSON.parse(opts.body || "{}"); } catch (e) { }

      /* ---- GET /bills (filters: status (multi), vendor_id, limit) ---- */
      if (/\/bills$/.test(pathname) && method === "GET") {
        var stWanted = query.getAll ? query.getAll("status") : [];
        if (!stWanted.length) { var st1 = query.get("status"); if (st1) stWanted = [st1]; }
        var vFilt = query.get("vendor_id");
        var lim = num(query.get("limit")) || 500;
        var rows = AP_BILLS.filter(function (b) {
          if (vFilt && String(b.vendor_id) !== String(vFilt)) return false;
          if (stWanted.length && stWanted.indexOf(String(b.status)) === -1) return false;
          return true;
        }).slice(0, lim).map(function (b) { return JSON.parse(JSON.stringify(b)); });
        return json({ ok: true, rows: rows, bills: rows, data: rows, total: rows.length });
      }

      /* ---- POST /bills (saveBillDraft) ---- */
      if (/\/bills$/.test(pathname) && method === "POST") {
        var nb = apBody || {};
        var vid = num(nb.vendor_id) || num(nb.vendorId) || 0;
        var lines = Array.isArray(nb.lines) ? nb.lines : [];
        var sub = lines.reduce(function (s, l) { return s + num(l.net_amount != null ? l.net_amount : ((num(l.quantity) || 0) * (num(l.unit_price) != null ? num(l.unit_price) : num(l.unit_cost)))); }, 0);
        var vat = lines.reduce(function (s, l) { return s + num(l.vat_amount); }, 0);
        var billStatus = String(nb.status || "draft").toLowerCase();
        var newBill = {
          id: 2610 + AP_BILLS.length - 15, /* keeps ids unique in-memory */
          number: nb.number || ("BILL-" + (2610 + AP_BILLS.length - 15)),
          vendor_id: vid, vendor_name: nb.vendor_name || apVName(vid),
          bill_date: nb.bill_date || nb.date || apRel(0),
          due_date: nb.due_date || nb.due || apRel(30), due_term: nb.due_term || "30",
          currency: nb.currency || "ZAR", status: billStatus,
          subtotal_amount: apM(num(nb.subtotal_amount) || sub),
          vat_amount: apM(num(nb.vat_amount) || vat),
          total_amount: apM(num(nb.total_amount) || (sub + vat)),
          paid_amount: 0, outstanding_amount: apM(num(nb.total_amount) || (sub + vat)),
          payment_status: "unpaid", memo: nb.memo || nb.notes || "",
          lines: lines, grni_links: nb.grni_links || []
        };
        AP_BILLS.push(newBill);
        return json({ ok: true, data: newBill, bill: newBill, id: newBill.id, number: newBill.number });
      }

      /* ---- PUT /bills/:id (update existing draft) ---- */
      var mApPut = pathname.match(/\/bills\/(\d+)$/);
      if (mApPut && method === "PUT") {
        var bPut = AP_BILLS.filter(function (b) { return String(b.id) === mApPut[1]; })[0];
        if (!bPut) return json({ ok: false, error: "Bill not found" }, 404);
        Object.keys(apBody || {}).forEach(function (k) {
          if (k !== "id" && apBody[k] !== undefined) bPut[k] = apBody[k];
        });
        apSyncBill(bPut);
        return json({ ok: true, data: bPut, bill: bPut, id: bPut.id });
      }

      /* ---- GET /bills/:id (bill detail — must precede post) ---- */
      var mApBill = pathname.match(/\/bills\/(\d+)$/);
      if (mApBill && method === "GET") {
        var bOne = AP_BILLS.filter(function (b) { return String(b.id) === mApBill[1]; })[0];
        if (!bOne) return json({ ok: false, error: "Bill not found" }, 404);
        var bCopy = JSON.parse(JSON.stringify(bOne));
        bCopy.payments = AP_PAYMENTS.filter(function (p) {
          return String(p.vendor_id) === String(bOne.vendor_id) &&
            (p.allocations || []).some(function (a) { return String(a.bill_id) === String(bOne.id); });
        });
        bCopy.activity = [
          { date: bOne.bill_date, type: "created", text: "Bill captured" },
          bOne.status !== "draft" ? { date: bOne.bill_date, type: "posted", text: "Bill posted to ledger" } : null,
          (bCopy.payments || []).map(function (p) {
            return { date: p.payment_date, type: "payment", text: "Payment " + p.number + " — " + p.status };
          })
        ].flat().filter(Boolean);
        return json({ ok: true, data: bCopy, bill: bCopy });
      }

      /* ---- POST /bills/:id/post ---- */
      var mApPost = pathname.match(/\/bills\/(\d+)\/post$/);
      if (mApPost && method === "POST") {
        var bPost = AP_BILLS.filter(function (b) { return String(b.id) === mApPost[1]; })[0];
        if (!bPost) return json({ ok: false, error: "Bill not found" }, 404);
        bPost.status = "posted";
        apSyncBill(bPost);
        return json({ ok: true, data: bPost, bill: bPost });
      }

      /* ---- GET /ap/grni/open ---- */
      if (/\/ap\/grni\/open$/.test(pathname)) {
        var gv = query.get("vendor_id");
        var gq = (query.get("q") || "").toLowerCase();
        var gItems = AP_GRNI.filter(function (r) {
          if (gv && String(r.vendor_id) !== String(gv)) return false;
          if (gq && (String(r.ref) + " " + String(r.notes)).toLowerCase().indexOf(gq) === -1) return false;
          return true;
        });
        return json({ ok: true, items: gItems, rows: gItems, total: gItems.length });
      }

      /* ---- GET /ap/vendors/:id/statement?from&to ---- */
      var mStmt = pathname.match(/\/ap\/vendors\/(\d+)\/statement$/);
      if (mStmt && method === "GET") {
        var svId = mStmt[1];
        var sFrom = query.get("from"), sTo = query.get("to");
        var vBills = AP_BILLS.filter(function (b) {
          return String(b.vendor_id) === String(svId) && b.status !== "draft";
        });
        var vPays = AP_PAYMENTS.filter(function (p) {
          return String(p.vendor_id) === String(svId) && p.status === "released";
        });
        var evts = [];
        vBills.forEach(function (b) {
          evts.push({ date: b.bill_date, ref: b.number, memo: "Bill — " + (b.memo || "supplier invoice"),
            credit: num(b.total_amount), debit: 0 });
        });
        vPays.forEach(function (p) {
          evts.push({ date: p.payment_date, ref: p.number, memo: "Payment — " + (p.description || p.reference || "EFT"),
            credit: 0, debit: num(p.amount) });
        });
        evts.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
        var running = 0, openingBal = 0;
        evts.forEach(function (e) {
          running = apM(running + e.credit - e.debit);
        });
        var closing = running;
        var sRows = [];
        for (var i = evts.length - 1; i >= 0; i--) {
          var e = evts[i];
          if (sTo && e.date > sTo) continue;
          if (sFrom && e.date < sFrom) break;
          sRows.unshift({ date: e.date, ref: e.ref, memo: e.memo,
            debit: apM(e.debit), credit: apM(e.credit),
            movement: apM(e.credit - e.debit), balance: apM(running) });
          running = apM(running - e.credit + e.debit);
        }
        openingBal = apM(running);
        return json({ ok: true, data: {
          vendor_id: num(svId), vendor_name: apVName(svId),
          ap_account: "Accounts Payable (BS_CL_2000)",
          from: sFrom, to: sTo,
          opening_balance: openingBal, closing_balance: closing,
          rows: sRows, transactions: sRows
        } });
      }

      /* ---- GET /ap/aging?as_at&vendor_id ---- */
      if (/\/ap\/aging$/.test(pathname) && method === "GET") {
        var asAt = query.get("as_at") || apRel(0);
        var avFilt = query.get("vendor_id");
        var t = { current: 0, "1_30": 0, "31_60": 0, "61_90": 0, "91_plus": 0, total: 0 };
        var aRows = [];
        AP_BILLS.filter(function (b) {
          return b.status !== "draft" && num(b.outstanding_amount) > 0.004 &&
            (!avFilt || String(b.vendor_id) === String(avFilt));
        }).forEach(function (b) {
          var days = Math.floor((new Date(asAt + "T00:00:00Z") - new Date(b.due_date + "T00:00:00Z")) / 86400000);
          var key = days <= 0 ? "current" : days <= 30 ? "1_30" : days <= 60 ? "31_60" : days <= 90 ? "61_90" : "91_plus";
          t[key] = apM(t[key] + num(b.outstanding_amount));
          t.total = apM(t.total + num(b.outstanding_amount));
          var row = { vendor_id: b.vendor_id, vendor_name: b.vendor_name, bill_id: b.id,
            number: b.number, bill_number: b.number, due_date: b.due_date, days_overdue: Math.max(0, days) };
          ["current", "1_30", "31_60", "61_90", "91_plus"].forEach(function (k) { row[k] = 0; });
          row[key] = num(b.outstanding_amount);
          row.total = num(b.outstanding_amount);
          aRows.push(row);
        });
        var aPay = { totals: t, bills: aRows, rows: aRows };
        return json({ ok: true, data: aPay, totals: t, bills: aRows });
      }

      /* ---- GET /ap/control-reconciliation?as_at ---- */
      if (/\/ap\/control-reconciliation$/.test(pathname) && method === "GET") {
        var subTotal = apM(VENDORS.reduce(function (s, v) { return s + num(v.balance); }, 0));
        var rcPay = {
          ap_account: "Accounts Payable — BS_CL_2000", ap_ledger_code: "BS_CL_2000",
          control_balance: subTotal, subledger_total: subTotal, difference: 0, is_balanced: true,
          vendors: VENDORS.filter(function (v) { return num(v.balance) > 0.004; }).map(function (v) {
            return { vendor_id: v.id, vendor_name: v.name, balance: num(v.balance) };
          })
        };
        return json({ ok: true, data: rcPay, control_balance: subTotal, subledger_total: subTotal,
          difference: 0, is_balanced: true, vendors: rcPay.vendors });
      }

      /* ---- POST /ap/bills/:id/allocate_payment ---- */
      var mAlloc = pathname.match(/\/ap\/bills\/(\d+)\/allocate_payment$/);
      if (mAlloc && method === "POST") {
        var bAl = AP_BILLS.filter(function (b) { return String(b.id) === mAlloc[1]; })[0];
        if (!bAl) return json({ ok: false, error: "Bill not found" }, 404);
        var payId = num(apBody.payment_id) || num(apBody.vendor_payment_id) || 0;
        var amt = apM(num(apBody.amount));
        var pay = AP_PAYMENTS.filter(function (p) { return num(p.id) === payId; })[0] || null;
        if (pay) {
          pay.allocations = pay.allocations || [];
          pay.allocations.push({ bill_id: bAl.id, amount: amt });
          pay.bill_id = bAl.id;
        }
        bAl.paid_amount = apM(num(bAl.paid_amount) + amt);
        apSyncBill(bAl);
        return json({ ok: true, allocated: amt, amount: amt, payment_id: payId,
          outstanding_amount: num(bAl.outstanding_amount), payment_status: bAl.payment_status,
          approval_request: null, data: { allocated: amt, outstanding_amount: num(bAl.outstanding_amount) } });
      }

      /* ---- POST /ap/vendor_payments (+/:id/approve|release) ---- */
      if (/\/ap\/vendor_payments$/.test(pathname) && method === "POST") {
        var np = {
          id: AP_PAY_SEQ, payment_id: AP_PAY_SEQ, number: "PMT-" + AP_PAY_SEQ,
          vendor_id: num(apBody.vendor_id), vendor_name: apVName(num(apBody.vendor_id)),
          payment_date: apBody.payment_date || apRel(0), amount: apM(num(apBody.amount)),
          bank_account_id: num(apBody.bank_account_id), reference: apBody.reference || ("EFT-" + AP_PAY_SEQ),
          description: apBody.description || "", status: "draft",
          wht_rate: apBody.wht_rate || null, wht_amount: apBody.wht_amount || null,
          wht_ledger_code: apBody.wht_ledger_code || null, wht_reason: apBody.wht_reason || null,
          allocations: []
        };
        AP_PAY_SEQ += 1;
        AP_PAYMENTS.push(np);
        return json({ ok: true, id: np.id, payment_id: np.payment_id, number: np.number,
          data: np, payment: np, status: "draft" });
      }
      var mPayAct = pathname.match(/\/ap\/vendor_payments\/(\d+)\/(approve|release)$/);
      if (mPayAct && method === "POST") {
        var pAct = AP_PAYMENTS.filter(function (p) { return String(p.id) === mPayAct[1]; })[0];
        if (!pAct) return json({ ok: false, error: "Payment not found" }, 404);
        pAct.status = mPayAct[2] === "approve" ? "approved" : "released";
        (pAct.allocations || []).forEach(function (a) {
          var b = AP_BILLS.filter(function (x) { return String(x.id) === String(a.bill_id); })[0];
          if (b && pAct.status === "released") { /* outstanding already reduced at allocate */ }
        });
        return json({ ok: true, data: pAct, payment: pAct, id: pAct.id, status: pAct.status });
      }
      if (/\/ap\/vendor_payments$/.test(pathname) && method === "GET") {
        return json({ ok: true, rows: AP_PAYMENTS, payments: AP_PAYMENTS, data: AP_PAYMENTS, total: AP_PAYMENTS.length });
      }
    }


    /* ═══════════════════════════════════════════════════════════════
       pj3 — PROJECTS DESK DEMO DATA (Task 15)
       ----------------------------------------------------------------
       Reconciles with existing seeds:
         · RC contract mirrors → recognised 205,000 / billed 215,000
           (= Revenue landing anchors)
         · Team user_id 901-904 = payroll employees (Thabo/Lerato/
           Sipho/Mary-Ann) so names resolve via payroll bootstrap
         · No existing endpoint response is modified
       ═══════════════════════════════════════════════════════════════ */
    var PJ_REV_MAP = { 701: 101, 702: 102, 703: 104, 704: 105, 705: 103 };
    var PJ_COST = {
      701: { material_cost: 46200, labour_cost: 18900, expense_cost: 6500, actual_cost: 71600, committed_cost: 8400 },
      702: { material_cost: 21300, labour_cost: 9800, expense_cost: 1900, actual_cost: 33000, committed_cost: 4500 },
      703: { material_cost: 2400, labour_cost: 21700, expense_cost: 2500, actual_cost: 26600, committed_cost: 6000 },
      704: { material_cost: 24800, labour_cost: 6900, expense_cost: 900, actual_cost: 32600, committed_cost: 3200 },
      705: { material_cost: 0, labour_cost: 0, expense_cost: 0, actual_cost: 0, committed_cost: 0 },
      706: { material_cost: 12400, labour_cost: 0, expense_cost: 0, actual_cost: 12400, committed_cost: 62600 }
    };
    var PJ_PERF = {
      701: { actual_cost: 71600, estimate_to_complete: 106400, estimate_at_completion: 178000, budget_variance: 0, forecast_margin: 62000, forecast_margin_percent: 25.8 },
      702: { actual_cost: 33000, estimate_to_complete: 88000, estimate_at_completion: 121000, budget_variance: 0, forecast_margin: 35000, forecast_margin_percent: 22.4 },
      703: { actual_cost: 26600, estimate_to_complete: 71900, estimate_at_completion: 98500, budget_variance: 0, forecast_margin: 21500, forecast_margin_percent: 17.9 },
      704: { actual_cost: 32600, estimate_to_complete: 18900, estimate_at_completion: 51500, budget_variance: 0, forecast_margin: 13500, forecast_margin_percent: 20.8 },
      705: { actual_cost: 0, estimate_to_complete: 22000, estimate_at_completion: 22000, budget_variance: 0, forecast_margin: 62000, forecast_margin_percent: 73.8 },
      706: { actual_cost: 12400, estimate_to_complete: 72600, estimate_at_completion: 85000, budget_variance: 0, forecast_margin: 0, forecast_margin_percent: 0 }
    };
    var PJ_TEAM = {
      701: [
        { user_id: 901, project_role: "Project Sponsor", role_type: "core", allocation_percent: 20 },
        { user_id: 902, project_role: "Site Supervisor", role_type: "core", allocation_percent: 60 },
        { user_id: 903, project_role: "Install Technician", role_type: "extended", allocation_percent: 80 }
      ],
      702: [
        { user_id: 902, project_role: "Site Supervisor", role_type: "core", allocation_percent: 50 },
        { user_id: 903, project_role: "Install Technician", role_type: "extended", allocation_percent: 70 }
      ],
      703: [
        { user_id: 901, project_role: "Product Owner", role_type: "core", allocation_percent: 15 },
        { user_id: 904, project_role: "Project Admin", role_type: "extended", allocation_percent: 20 }
      ],
      704: [
        { user_id: 902, project_role: "Site Supervisor", role_type: "core", allocation_percent: 40 },
        { user_id: 903, project_role: "Site Technician", role_type: "extended", allocation_percent: 90 }
      ],
      705: [
        { user_id: 902, project_role: "Onboarding Lead", role_type: "core", allocation_percent: 30 }
      ],
      706: [
        { user_id: 901, project_role: "Project Sponsor", role_type: "core", allocation_percent: 10 },
        { user_id: 903, project_role: "Workshop Coordinator", role_type: "extended", allocation_percent: 50 }
      ]
    };
    var PJ_TASKS = {
      701: [
        { id: 70101, parent_task_id: 0, sequence_no: 1, wbs_code: "1.0", task_name: "Phase 1 — Delivery & offload", task_type: "phase", is_summary: true, status: "completed", priority: "normal", progress_percent: 100, assignment_count: 0 },
        { id: 70102, parent_task_id: 70101, sequence_no: 1, wbs_code: "1.1", task_name: "Deliver gym equipment to site", task_type: "task", status: "completed", priority: "high", progress_percent: 100, assignment_count: 2 },
        { id: 70103, parent_task_id: 70101, sequence_no: 2, wbs_code: "1.2", task_name: "Offload & stage in storage bay", task_type: "task", status: "completed", priority: "normal", progress_percent: 100, assignment_count: 1 },
        { id: 70104, parent_task_id: 0, sequence_no: 2, wbs_code: "2.0", task_name: "Phase 2 — Installation & commissioning", task_type: "phase", is_summary: true, status: "in_progress", priority: "high", progress_percent: 65, assignment_count: 0 },
        { id: 70105, parent_task_id: 70104, sequence_no: 1, wbs_code: "2.1", task_name: "Assemble equipment stations", task_type: "task", status: "in_progress", priority: "high", progress_percent: 65, assignment_count: 2 },
        { id: 70106, parent_task_id: 70104, sequence_no: 2, wbs_code: "2.2", task_name: "Client handover & sign-off", task_type: "milestone", status: "pending", priority: "normal", progress_percent: 0, assignment_count: 0 }
      ],
      702: [
        { id: 70201, parent_task_id: 0, sequence_no: 1, wbs_code: "1.0", task_name: "Phase 1 — Site readiness", task_type: "phase", is_summary: true, status: "completed", priority: "normal", progress_percent: 100, assignment_count: 0 },
        { id: 70202, parent_task_id: 70201, sequence_no: 1, wbs_code: "1.1", task_name: "Branch site surveys (6 branches)", task_type: "task", status: "completed", priority: "normal", progress_percent: 100, assignment_count: 2 },
        { id: 70203, parent_task_id: 0, sequence_no: 2, wbs_code: "2.0", task_name: "Phase 2 — Rollout", task_type: "phase", is_summary: true, status: "in_progress", priority: "high", progress_percent: 30, assignment_count: 0 },
        { id: 70204, parent_task_id: 70203, sequence_no: 1, wbs_code: "2.1", task_name: "Deliver dispensers to branches", task_type: "task", status: "in_progress", priority: "high", progress_percent: 40, assignment_count: 3 },
        { id: 70205, parent_task_id: 70203, sequence_no: 2, wbs_code: "2.2", task_name: "Install & connect water lines", task_type: "task", status: "in_progress", priority: "normal", progress_percent: 20, assignment_count: 2 }
      ],
      703: [
        { id: 70301, parent_task_id: 0, sequence_no: 1, wbs_code: "1.0", task_name: "Discovery & design", task_type: "phase", is_summary: true, status: "completed", priority: "normal", progress_percent: 100, assignment_count: 0 },
        { id: 70302, parent_task_id: 70301, sequence_no: 1, wbs_code: "1.1", task_name: "Requirements workshops", task_type: "task", status: "completed", priority: "normal", progress_percent: 100, assignment_count: 2 },
        { id: 70303, parent_task_id: 0, sequence_no: 2, wbs_code: "2.0", task_name: "Build", task_type: "phase", is_summary: true, status: "in_progress", priority: "high", progress_percent: 25, assignment_count: 0 },
        { id: 70304, parent_task_id: 70303, sequence_no: 1, wbs_code: "2.1", task_name: "UI/UX designs", task_type: "task", status: "in_progress", priority: "high", progress_percent: 55, assignment_count: 1 }
      ],
      704: [
        { id: 70401, parent_task_id: 0, sequence_no: 1, wbs_code: "1.0", task_name: "Supply", task_type: "phase", is_summary: true, status: "completed", priority: "normal", progress_percent: 100, assignment_count: 0 },
        { id: 70402, parent_task_id: 70401, sequence_no: 1, wbs_code: "1.1", task_name: "Deliver beams & uprights", task_type: "task", status: "completed", priority: "high", progress_percent: 100, assignment_count: 2 },
        { id: 70403, parent_task_id: 0, sequence_no: 2, wbs_code: "2.0", task_name: "Installation", task_type: "phase", is_summary: true, status: "in_progress", priority: "high", progress_percent: 70, assignment_count: 0 },
        { id: 70404, parent_task_id: 70403, sequence_no: 1, wbs_code: "2.1", task_name: "Install bays rows A–C", task_type: "task", status: "completed", priority: "high", progress_percent: 100, assignment_count: 3 },
        { id: 70405, parent_task_id: 70403, sequence_no: 2, wbs_code: "2.2", task_name: "Install bays rows D–E", task_type: "task", status: "in_progress", priority: "high", progress_percent: 70, assignment_count: 2 },
        { id: 70406, parent_task_id: 0, sequence_no: 3, wbs_code: "3.0", task_name: "QS sign-off", task_type: "milestone", status: "pending", priority: "normal", progress_percent: 0, assignment_count: 0 }
      ],
      705: [
        { id: 70501, parent_task_id: 0, sequence_no: 1, wbs_code: "1.0", task_name: "Mobilise", task_type: "phase", is_summary: true, status: "pending", priority: "normal", progress_percent: 0, assignment_count: 0 },
        { id: 70502, parent_task_id: 70501, sequence_no: 1, wbs_code: "1.1", task_name: "Kickoff & access scheduling", task_type: "task", status: "pending", priority: "normal", progress_percent: 0, assignment_count: 1 },
        { id: 70503, parent_task_id: 0, sequence_no: 2, wbs_code: "2.0", task_name: "Go-live readiness review", task_type: "milestone", status: "pending", priority: "normal", progress_percent: 0, assignment_count: 0 }
      ],
      706: [
        { id: 70601, parent_task_id: 0, sequence_no: 1, wbs_code: "1.0", task_name: "Specify & approve", task_type: "phase", is_summary: true, status: "in_progress", priority: "normal", progress_percent: 45, assignment_count: 0 },
        { id: 70602, parent_task_id: 70601, sequence_no: 1, wbs_code: "1.1", task_name: "Tooling specification", task_type: "task", status: "completed", priority: "normal", progress_percent: 100, assignment_count: 1 },
        { id: 70603, parent_task_id: 70601, sequence_no: 2, wbs_code: "1.2", task_name: "Vendor quotes (3 vendors)", task_type: "task", status: "in_progress", priority: "normal", progress_percent: 50, assignment_count: 1 },
        { id: 70604, parent_task_id: 0, sequence_no: 2, wbs_code: "2.0", task_name: "Board approval to proceed", task_type: "milestone", status: "pending", priority: "high", progress_percent: 0, assignment_count: 0 }
      ]
    };
    var PJ_OBL = {
      701: [
        { obligation_code: "OB-01", obligation_name: "Equipment lease — 36 months", recognition_timing: "over_time", progress_method: "time_elapsed", progress_percent: 40, pm_progress_percent: 65, recognized_to_date: 84000, revenue_to_date: 84000, allocated_transaction_price: 204000, satisfaction_status: "in_progress", project_task_name: "Assemble equipment stations", last_progress_period_end: D(25), last_progress_percent: 40, last_progress_update_type: "accounting_run" },
        { obligation_code: "OB-02", obligation_name: "Preventative maintenance plan", recognition_timing: "over_time", progress_method: "input", progress_percent: 33, pm_progress_percent: 0, recognized_to_date: 12000, revenue_to_date: 12000, allocated_transaction_price: 36000, satisfaction_status: "in_progress", project_task_name: "Client handover & sign-off", last_progress_period_end: D(25), last_progress_percent: 33, last_progress_update_type: "accounting_run" }
      ],
      702: [
        { obligation_code: "OB-01", obligation_name: "Dispenser units — 40 units", recognition_timing: "over_time", progress_method: "output", progress_percent: 25, pm_progress_percent: 40, recognized_to_date: 39000, revenue_to_date: 39000, allocated_transaction_price: 117000, satisfaction_status: "in_progress", project_task_name: "Deliver dispensers to branches", last_progress_period_end: D(25), last_progress_percent: 25, last_progress_update_type: "accounting_run" },
        { obligation_code: "OB-02", obligation_name: "Delivery & installation services", recognition_timing: "over_time", progress_method: "input", progress_percent: 0, pm_progress_percent: 20, recognized_to_date: 0, revenue_to_date: 0, allocated_transaction_price: 39000, satisfaction_status: "in_progress", project_task_name: "Install & connect water lines" }
      ],
      703: [
        { obligation_code: "OB-01", obligation_name: "Loyalty app development", recognition_timing: "over_time", progress_method: "input", progress_percent: 20, pm_progress_percent: 55, recognized_to_date: 24500, revenue_to_date: 24500, allocated_transaction_price: 120000, satisfaction_status: "in_progress", project_task_name: "UI/UX designs", last_progress_period_end: D(25), last_progress_percent: 20, last_progress_update_type: "accounting_run" }
      ],
      704: [
        { obligation_code: "OB-01", obligation_name: "Racking supply delivered on site", recognition_timing: "point_in_time", progress_method: "", progress_percent: 100, pm_progress_percent: 100, recognized_to_date: 45500, revenue_to_date: 45500, allocated_transaction_price: 45500, satisfaction_status: "satisfied", project_task_name: "Deliver beams & uprights", last_progress_period_end: D(12), last_progress_percent: 100, last_progress_update_type: "delivery" },
        { obligation_code: "OB-02", obligation_name: "Installation & sign-off", recognition_timing: "over_time", progress_method: "input", progress_percent: 0, pm_progress_percent: 70, recognized_to_date: 0, revenue_to_date: 0, allocated_transaction_price: 19500, satisfaction_status: "in_progress", project_task_name: "Install bays rows D–E" }
      ],
      705: [
        { obligation_code: "OB-01", obligation_name: "Telemetry platform access", recognition_timing: "over_time", progress_method: "time_elapsed", progress_percent: 0, pm_progress_percent: 0, recognized_to_date: 0, revenue_to_date: 0, allocated_transaction_price: 60000, satisfaction_status: "in_progress", project_task_name: "Go-live readiness review" },
        { obligation_code: "OB-02", obligation_name: "Onboarding & training", recognition_timing: "over_time", progress_method: "input", progress_percent: 0, pm_progress_percent: 0, recognized_to_date: 0, revenue_to_date: 0, allocated_transaction_price: 24000, satisfaction_status: "in_progress", project_task_name: "Kickoff & access scheduling" }
      ]
    };
    var PJ_SYNC = {
      701: { 70105: "variance", 70106: "variance" },
      702: { 70204: "variance" },
      703: { 70304: "variance" },
      704: { 70404: "in_sync", 70405: "variance" }
    };
    var PJ_BUDGETS = {
      701: [
        { line_code: "BL-2601-01", description: "Equipment delivery & offload", cost_code: "CC-MAT-4100", budget_amount: 92000 },
        { line_code: "BL-2601-02", description: "Installation labour", cost_code: "CC-LAB-4200", budget_amount: 48000 },
        { line_code: "BL-2601-03", description: "Commissioning & sign-off", cost_code: "CC-SUB-4300", budget_amount: 22000 },
        { line_code: "BL-2601-04", description: "Site overheads", cost_code: "CC-EXP-4400", budget_amount: 16000 }
      ],
      702: [
        { line_code: "BL-2602-01", description: "Dispenser units supply", cost_code: "CC-MAT-4100", budget_amount: 63000 },
        { line_code: "BL-2602-02", description: "Warehouse & logistics", cost_code: "CC-EXP-4400", budget_amount: 14000 },
        { line_code: "BL-2602-03", description: "Installation labour", cost_code: "CC-LAB-4200", budget_amount: 34000 },
        { line_code: "BL-2602-04", description: "Branch inspection & sign-off", cost_code: "CC-SUB-4300", budget_amount: 10000 }
      ],
      703: [
        { line_code: "BL-2603-01", description: "Development labour", cost_code: "CC-LAB-4200", budget_amount: 46000 },
        { line_code: "BL-2603-02", description: "UI/UX design", cost_code: "CC-SUB-4300", budget_amount: 38500 },
        { line_code: "BL-2603-03", description: "Cloud infra & licences", cost_code: "CC-EXP-4400", budget_amount: 14000 }
      ],
      704: [
        { line_code: "BL-2604-01", description: "Racking materials", cost_code: "CC-MAT-4100", budget_amount: 31500 },
        { line_code: "BL-2604-02", description: "Installation labour", cost_code: "CC-LAB-4200", budget_amount: 12000 },
        { line_code: "BL-2604-03", description: "Waste & compliance", cost_code: "CC-EXP-4400", budget_amount: 8000 }
      ],
      705: [
        { line_code: "BL-2605-01", description: "Onboarding labour", cost_code: "CC-LAB-4200", budget_amount: 14000 },
        { line_code: "BL-2605-02", description: "Training kits", cost_code: "CC-EXP-4400", budget_amount: 8000 }
      ],
      706: [
        { line_code: "BL-2606-01", description: "CNC tooling", cost_code: "CC-MAT-4100", budget_amount: 62000 },
        { line_code: "BL-2606-02", description: "Installation", cost_code: "CC-LAB-4200", budget_amount: 15000 },
        { line_code: "BL-2606-03", description: "Contingency", cost_code: "CC-EXP-4400", budget_amount: 8000 }
      ]
    };
    var PJ_TIME = {
      701: [
        { work_date: D(8), user_id: 902, task_name: "Assemble equipment stations", hours: 12, labour_cost: 1860, billable_amount: 2400, status: "approved" },
        { work_date: D(9), user_id: 903, task_name: "Deliver gym equipment to site", hours: 8, labour_cost: 1240, billable_amount: 1600, status: "approved" },
        { work_date: D(10), user_id: 903, task_name: "Assemble equipment stations", hours: 7.5, labour_cost: 1120, billable_amount: 1450, status: "submitted" },
        { work_date: D(11), user_id: 902, task_name: "Assemble equipment stations", hours: 6.5, labour_cost: 1010, billable_amount: 1300, status: "approved" },
        { work_date: D(12), user_id: 903, task_name: "Offload & stage in storage bay", hours: 6, labour_cost: 960, billable_amount: 1240, status: "draft" },
        { work_date: D(12), user_id: 902, task_name: "Assemble equipment stations", hours: 4.5, labour_cost: 720, billable_amount: 930, status: "draft" }
      ],
      702: [
        { work_date: D(9), user_id: 903, task_name: "Deliver dispensers to branches", hours: 6, labour_cost: 930, billable_amount: 1200, status: "approved" },
        { work_date: D(10), user_id: 902, task_name: "Install & connect water lines", hours: 7, labour_cost: 1085, billable_amount: 1400, status: "approved" },
        { work_date: D(12), user_id: 903, task_name: "Deliver dispensers to branches", hours: 5, labour_cost: 775, billable_amount: 1000, status: "submitted" }
      ],
      703: [
        { work_date: D(7), user_id: 901, task_name: "Requirements workshops", hours: 8, labour_cost: 2280, billable_amount: 0, status: "approved" },
        { work_date: D(10), user_id: 901, task_name: "UI/UX designs", hours: 7, labour_cost: 1995, billable_amount: 0, status: "approved" },
        { work_date: D(12), user_id: 901, task_name: "UI/UX designs", hours: 6, labour_cost: 1710, billable_amount: 0, status: "submitted" }
      ],
      704: [
        { work_date: D(11), user_id: 903, task_name: "Install bays rows A–C", hours: 7, labour_cost: 1100, billable_amount: 1420, status: "approved" },
        { work_date: D(12), user_id: 903, task_name: "Install bays rows D–E", hours: 6, labour_cost: 940, billable_amount: 1215, status: "submitted" }
      ]
    };
    var PJ_EXPENSES = {
      701: [
        { expense_date: D(6), description: "Equipment freight — Springs depot to site", task_name: "Deliver gym equipment to site", total_amount: 4250, status: "approved" },
        { expense_date: D(9), description: "Crane hire — offload day", task_name: "Offload & stage in storage bay", total_amount: 1850, status: "approved" },
        { expense_date: D(11), description: "Site consumables & fixings", task_name: "Assemble equipment stations", total_amount: 400, status: "submitted" },
        { expense_date: D(13), description: "Mall access permit", task_name: "Phase 2 — Installation & commissioning", total_amount: 620, status: "draft" }
      ],
      702: [
        { expense_date: D(8), description: "Forklift hire — branch deliveries", task_name: "Deliver dispensers to branches", total_amount: 1450, status: "approved" },
        { expense_date: D(11), description: "Water fittings & hoses", task_name: "Install & connect water lines", total_amount: 450, status: "submitted" }
      ],
      704: [
        { expense_date: D(10), description: "Waste removal & site clean-up", task_name: "Install bays rows A–C", total_amount: 900, status: "approved" }
      ]
    };
    var PJ_COMMITMENTS = {
      701: [
        { po_number: "PO-4821", description: "Racking consumables & fixings — Bidvest", task_name: "Assemble equipment stations", cost_code: "CC-MAT-4100", ordered_amount: 5400, po_status: "open" },
        { po_number: "PO-4827", description: "Transport — Gauteng Logistics", task_name: "Deliver gym equipment to site", cost_code: "CC-EXP-4400", ordered_amount: 3000, po_status: "open" }
      ],
      704: [
        { po_number: "PO-4830", description: "Anchor bolts & shims — Springs Stationers", task_name: "Install bays rows D–E", cost_code: "CC-MAT-4100", ordered_amount: 3200, po_status: "open" }
      ],
      706: [
        { po_number: "PO-4833", description: "CNC tooling deposit — Highveld IT (equip)", task_name: "Vendor quotes (3 vendors)", cost_code: "CC-MAT-4100", ordered_amount: 18600, po_status: "open" }
      ]
    };
    var PJ_CHANGES = {
      701: [
        { change_no: "VC-2601-01", title: "Added rubber flooring to installation scope", cost_impact: 4200, revenue_impact: 5800, schedule_impact_days: 2, status: "approved" }
      ]
    };
    var PJ_RISKS = {
      701: [
        { title: "Equipment import delay at customs", probability: 3, impact: 4, risk_score: 12, status: "mitigating" },
        { title: "Site access windows limited by mall management", probability: 2, impact: 3, risk_score: 6, status: "open" }
      ],
      703: [
        { title: "Third-party API rate limits for loyalty integration", probability: 3, impact: 3, risk_score: 9, status: "open" }
      ]
    };
    var PJ_ISSUES = {
      701: [
        { title: "Missing bolts for station 3 frame", task_name: "Assemble equipment stations", priority: "high", status: "open" }
      ],
      702: [
        { title: "Branch 4 water line pressure below spec", task_name: "Install & connect water lines", priority: "medium", status: "investigating" }
      ]
    };
    var PJ_DOCS = {
      701: [
        { title: "Signed lease & delivery SLA", document_type: "contract", version_no: 2, file_url: "#" },
        { title: "Site readiness checklist", document_type: "checklist", version_no: 1, file_url: "#" },
        { title: "Commissioning certificate (draft)", document_type: "certificate", version_no: 1, file_url: "#" }
      ],
      704: [
        { title: "QS milestone certificate M1", document_type: "certificate", version_no: 1, file_url: "#" }
      ]
    };
    var PJ_ACTIVITY = {
      701: [
        { action: "Task progress updated", entity_type: "task", created_at: D(12) + " 10:24", description: "Assemble equipment stations → 65%" },
        { action: "Material issued", entity_type: "inventory", created_at: D(11) + " 14:02", description: "Fixings & anchors issued to PRJ-2601" },
        { action: "Time submitted", entity_type: "time_entry", created_at: D(10) + " 17:40", description: "Sipho Ndlovu submitted 7.5 hrs" },
        { action: "Revenue recognised", entity_type: "revenue_run", created_at: D(25) + " 09:00", description: "RC-2601 run posted — ZAR 3,000.00" }
      ],
      704: [
        { action: "Task completed", entity_type: "task", created_at: D(11) + " 16:15", description: "Install bays rows A–C → 100%" },
        { action: "Expense approved", entity_type: "expense", created_at: D(10) + " 11:30", description: "Waste removal & site clean-up — ZAR 900.00" }
      ]
    };
    var PJ_DEPENDENCIES = {
      701: [
        { predecessor_code: "1.1", predecessor_name: "Deliver gym equipment to site", dependency_type: "finish_to_start", successor_code: "2.1", successor_name: "Assemble equipment stations" }
      ],
      704: [
        { predecessor_code: "1.1", predecessor_name: "Deliver beams & uprights", dependency_type: "finish_to_start", successor_code: "2.1", successor_name: "Install bays rows A–C" }
      ]
    };
    var PJ_FORECASTS = {
      701: [
        { forecast_date: PM_Y + "-" + String(PM_M + 1).padStart(2, "0") + "-28", progress_percent: 38, estimate_at_completion: 176000, forecast_margin: 64000 },
        { forecast_date: D(28), progress_percent: 40, estimate_at_completion: 178000, forecast_margin: 62000 }
      ]
    };

    function pjCustomerName(id) { return id ? custName(id) : null; }
    function pjSummary(p) {
      return {
        id: p.id, project_code: p.project_code, project_name: p.project_name,
        project_type: p.project_type, accounting_mode: p.accounting_mode,
        status: p.status, customer_id: p.customer_id || null,
        customer_name: p.customer_name || null, priority: p.priority,
        progress_percent: p.progress_percent, contract_value: p.contract_value,
        budget_lines_total: p.budget_lines_total, budget_value: p.budget_value,
        task_count: (PJ_TASKS[p.id] || []).length,
        start_date: p.start_date, expected_end_date: p.expected_end_date,
        inventory_enabled: p.inventory_enabled !== false,
        wip_account_code: p.wip_account_code || null,
        cost_account_code: p.cost_account_code || null
      };
    }
    function pjStripInternals(p) {
      var o = {};
      Object.keys(p).forEach(function (k) { if (k.charAt(0) !== "_") o[k] = p[k]; });
      return o;
    }
    function pjRevenueMirror(p) {
      var rcId = PJ_REV_MAP[p.id];
      if (!rcId) return null;
      var rc = REV_CONTRACTS.filter(function (x) { return x.id === rcId; })[0];
      if (!rc) return null;
      return {
        contract: {
          id: rc.id, contract_number: rc.contract_number, contract_title: rc.contract_title,
          status: rc.status, transaction_price: rc.transaction_price,
          recognized_revenue_to_date: rc.recognized_revenue_to_date,
          billed_to_date: rc.billed_to_date
        },
        summary: {
          transaction_price: rc.transaction_price,
          recognized_revenue: rc.recognized_revenue_to_date,
          billed_to_date: rc.billed_to_date,
          cash_collected: rc.billed_to_date,
          contract_asset: Math.max(0, rc.recognized_revenue_to_date - rc.billed_to_date),
          contract_liability: Math.max(0, rc.billed_to_date - rc.recognized_revenue_to_date)
        }
      };
    }
    function pjPmWorkspace(p) {
      var tasks = (PJ_TASKS[p.id] || []).map(function (t) {
        var obl = (PJ_OBL[p.id] || []).filter(function (o) {
          return o.project_task_name === t.task_name;
        });
        return {
          id: t.id, wbs_code: t.wbs_code, task_code: t.wbs_code, task_name: t.task_name,
          task_type: t.task_type, is_summary: !!t.is_summary, status: t.status,
          progress_percent: t.progress_percent,
          linked_obligations: obl.map(function (o) {
            return { obligation_code: o.obligation_code, obligation_name: o.obligation_name, recognition_timing: o.recognition_timing, progress_method: o.progress_method, progress_percent: o.progress_percent };
          }),
          sync_status: (PJ_SYNC[p.id] || {})[t.id] || (obl.length ? "in_sync" : "unlinked")
        };
      });
      var completed = tasks.filter(function (t) { return t.status === "completed"; }).length;
      var inProg = tasks.filter(function (t) { return t.status === "in_progress"; }).length;
      var blocked = tasks.filter(function (t) { return t.status === "blocked"; }).length;
      var computed = tasks.length
        ? tasks.reduce(function (s, t) { return s + Number(t.progress_percent || 0); }, 0) / tasks.length
        : 0;
      return {
        stats: {
          computed_project_progress: Math.round(computed * 10) / 10,
          stored_project_progress: p.progress_percent,
          variance_count: tasks.filter(function (t) { return t.sync_status === "variance"; }).length,
          completed_tasks: completed, task_count: tasks.length,
          in_progress_tasks: inProg, blocked_tasks: blocked,
          recognized_revenue: (pjRevenueMirror(p) || { summary: {} }).summary.recognized_revenue || 0
        },
        tasks: tasks,
        obligations: PJ_OBL[p.id] || []
      };
    }

    /* PJ store persists across handleApi calls (function-scoped vars
       would re-seed on every request and lose POSTed projects) */
    var PJ_PROJECTS = window.__PJ_PROJECTS_STORE;
    if (!PJ_PROJECTS) {
    PJ_PROJECTS = [
      {
        id: 701, project_code: "PRJ-2601", project_name: "Gym equipment delivery & commissioning",
        project_type: "customer_project", accounting_mode: "contract", status: "active",
        customer_id: 1, customer_name: custName(1), priority: "high",
        progress_percent: 40, contract_value: 240000, budget_value: 178000, budget_lines_total: 178000,
        start_date: iso(Y, 0, 12), expected_end_date: iso(Y, 11, 20),
        baseline_start_date: iso(Y, 0, 12), baseline_end_date: iso(Y, 11, 20), baseline_budget_value: 178000,
        project_manager_user_id: 901, sponsor_user_id: 901, owner_user_id: 901,
        department_id: 2, business_unit: "Operations",
        billing_method: "periodic", billing_enabled: true, revenue_enabled: true,
        inventory_enabled: true, allow_time_entries: true, allow_expenses: true,
        wip_account_code: "BS_CA_1250", revenue_account_code: "PL_IN_4000", cost_account_code: "PL_EX_5100",
        location: "FitZone floor 2, East Rand Mall, Springs",
        description: "Delivery, installation and commissioning of the gym equipment bundle leased under RC-2601, including preventative maintenance handover.",
        notes: "Mirror delivery project for revenue contract RC-2601.",
        totals: { labour_hours: 44.5, labour_cost: 6910, billable_time_value: 8920, budget_total: 178000 },
        cost_summary: PJ_COST[701], _perf: PJ_PERF[701],
        team: PJ_TEAM[701], tasks: PJ_TASKS[701],
        task_dependencies: PJ_DEPENDENCIES[701] || [],
        budget_lines: (PJ_BUDGETS[701] || []).map(function (l, i) { return Object.assign({ id: 70110 + i, line_no: i + 1, task_name: "" }, l); }),
        time_entries: PJ_TIME[701] || [], expenses: PJ_EXPENSES[701] || [],
        commitments: PJ_COMMITMENTS[701] || [], changes: PJ_CHANGES[701] || [],
        risks: PJ_RISKS[701] || [], issues: PJ_ISSUES[701] || [],
        documents: PJ_DOCS[701] || [], activity: PJ_ACTIVITY[701] || [],
        forecasts: PJ_FORECASTS[701] || [], capitalisations: [], asset_links: [], borrowing_links: [],
        closeout: {}, is_locked: false,
        revenue_obligations: PJ_OBL[701] || []
      },
      {
        id: 702, project_code: "PRJ-2602", project_name: "Beverage dispenser rollout",
        project_type: "customer_project", accounting_mode: "contract", status: "active",
        customer_id: 2, customer_name: custName(2), priority: "normal",
        progress_percent: 25, contract_value: 156000, budget_value: 121000, budget_lines_total: 121000,
        start_date: iso(Y, 3, 14), expected_end_date: iso(Y, 10, 30),
        baseline_start_date: iso(Y, 3, 14), baseline_end_date: iso(Y, 10, 30), baseline_budget_value: 121000,
        project_manager_user_id: 902, sponsor_user_id: 901, owner_user_id: 901,
        department_id: 2, business_unit: "Operations",
        billing_method: "milestone", billing_enabled: true, revenue_enabled: true,
        inventory_enabled: true, allow_time_entries: true, allow_expenses: true,
        wip_account_code: "BS_CA_1250", revenue_account_code: "PL_IN_4000", cost_account_code: "PL_EX_5100",
        location: "Cape Union branches — Western Cape",
        description: "Delivery and installation of 40 beverage dispensers across six Cape Union branches, with water-line connections per branch.",
        notes: "Mirror delivery project for revenue contract RC-2602.",
        totals: { labour_hours: 18, labour_cost: 2790, billable_time_value: 3600, budget_total: 121000 },
        cost_summary: PJ_COST[702], _perf: PJ_PERF[702],
        team: PJ_TEAM[702], tasks: PJ_TASKS[702],
        task_dependencies: PJ_DEPENDENCIES[702] || [],
        budget_lines: (PJ_BUDGETS[702] || []).map(function (l, i) { return Object.assign({ id: 70210 + i, line_no: i + 1, task_name: "" }, l); }),
        time_entries: PJ_TIME[702] || [], expenses: PJ_EXPENSES[702] || [],
        commitments: PJ_COMMITMENTS[702] || [], changes: PJ_CHANGES[702] || [],
        risks: PJ_RISKS[702] || [], issues: PJ_ISSUES[702] || [],
        documents: PJ_DOCS[702] || [], activity: PJ_ACTIVITY[702] || [],
        forecasts: PJ_FORECASTS[702] || [], capitalisations: [], asset_links: [], borrowing_links: [],
        closeout: {}, is_locked: false,
        revenue_obligations: PJ_OBL[702] || []
      },
      {
        id: 703, project_code: "PRJ-2603", project_name: "Loyalty app build",
        project_type: "implementation", accounting_mode: "contract", status: "draft",
        customer_id: 3, customer_name: custName(3), priority: "high",
        progress_percent: 20, contract_value: 120000, budget_value: 98500, budget_lines_total: 98500,
        start_date: iso(Y, 8, 20), expected_end_date: iso(Y, 11, 15),
        baseline_start_date: iso(Y, 8, 20), baseline_end_date: iso(Y, 11, 15), baseline_budget_value: 98500,
        project_manager_user_id: 901, sponsor_user_id: 901, owner_user_id: 901,
        department_id: 3, business_unit: "Digital",
        billing_method: "progress", billing_enabled: true, revenue_enabled: true,
        inventory_enabled: false, allow_time_entries: true, allow_expenses: true,
        wip_account_code: null, revenue_account_code: "PL_IN_4000", cost_account_code: "PL_EX_5100",
        location: "Remote / Woodmead",
        description: "Custom loyalty app build for Woodmead Traders: discovery, UI/UX, backend integration and UAT under RC-2604.",
        notes: "Mirror delivery project for revenue contract RC-2604 (contract pending approval).",
        totals: { labour_hours: 21, labour_cost: 5985, billable_time_value: 0, budget_total: 98500 },
        cost_summary: PJ_COST[703], _perf: PJ_PERF[703],
        team: PJ_TEAM[703], tasks: PJ_TASKS[703],
        task_dependencies: PJ_DEPENDENCIES[703] || [],
        budget_lines: (PJ_BUDGETS[703] || []).map(function (l, i) { return Object.assign({ id: 70310 + i, line_no: i + 1, task_name: "" }, l); }),
        time_entries: PJ_TIME[703] || [], expenses: PJ_EXPENSES[703] || [],
        commitments: PJ_COMMITMENTS[703] || [], changes: PJ_CHANGES[703] || [],
        risks: PJ_RISKS[703] || [], issues: PJ_ISSUES[703] || [],
        documents: PJ_DOCS[703] || [], activity: PJ_ACTIVITY[703] || [],
        forecasts: PJ_FORECASTS[703] || [], capitalisations: [], asset_links: [], borrowing_links: [],
        closeout: {}, is_locked: false,
        revenue_obligations: PJ_OBL[703] || []
      },
      {
        id: 704, project_code: "PRJ-2604", project_name: "Warehouse racking installation",
        project_type: "construction", accounting_mode: "contract", status: "active",
        customer_id: 1, customer_name: custName(1), priority: "normal",
        progress_percent: 70, contract_value: 65000, budget_value: 51500, budget_lines_total: 51500,
        start_date: iso(Y, 7, 5), expected_end_date: iso(Y, 11, 20),
        baseline_start_date: iso(Y, 7, 5), baseline_end_date: iso(Y, 11, 20), baseline_budget_value: 51500,
        project_manager_user_id: 902, sponsor_user_id: 901, owner_user_id: 901,
        department_id: 2, business_unit: "Operations",
        billing_method: "milestone", billing_enabled: true, revenue_enabled: true,
        inventory_enabled: true, allow_time_entries: true, allow_expenses: true,
        wip_account_code: "BS_CA_1250", revenue_account_code: "PL_IN_4000", cost_account_code: "PL_EX_5100",
        location: "Springs Retail DC, Springs",
        description: "Supply and installation of pallet racking under RC-2605; milestone M1 certified, installation rows D–E in progress.",
        notes: "Mirror delivery project for revenue contract RC-2605.",
        totals: { labour_hours: 13, labour_cost: 2040, billable_time_value: 2635, budget_total: 51500 },
        cost_summary: PJ_COST[704], _perf: PJ_PERF[704],
        team: PJ_TEAM[704], tasks: PJ_TASKS[704],
        task_dependencies: PJ_DEPENDENCIES[704] || [],
        budget_lines: (PJ_BUDGETS[704] || []).map(function (l, i) { return Object.assign({ id: 70410 + i, line_no: i + 1, task_name: "" }, l); }),
        time_entries: PJ_TIME[704] || [], expenses: PJ_EXPENSES[704] || [],
        commitments: PJ_COMMITMENTS[704] || [], changes: PJ_CHANGES[704] || [],
        risks: PJ_RISKS[704] || [], issues: PJ_ISSUES[704] || [],
        documents: PJ_DOCS[704] || [], activity: PJ_ACTIVITY[704] || [],
        forecasts: PJ_FORECASTS[704] || [], capitalisations: [], asset_links: [], borrowing_links: [],
        closeout: {}, is_locked: false,
        revenue_obligations: PJ_OBL[704] || []
      },
      {
        id: 705, project_code: "PRJ-2605", project_name: "Fleet telemetry onboarding",
        project_type: "implementation", accounting_mode: "expense", status: "approved",
        customer_id: 4, customer_name: custName(4), priority: "normal",
        progress_percent: 0, contract_value: 84000, budget_value: 22000, budget_lines_total: 22000,
        start_date: iso(Y, 10, 1), expected_end_date: iso(Y + 1, 4, 30),
        baseline_start_date: iso(Y, 10, 1), baseline_end_date: iso(Y + 1, 4, 30), baseline_budget_value: 22000,
        project_manager_user_id: 902, sponsor_user_id: 901, owner_user_id: 901,
        department_id: 2, business_unit: "Operations",
        billing_method: "manual", billing_enabled: true, revenue_enabled: true,
        inventory_enabled: false, allow_time_entries: true, allow_expenses: true,
        wip_account_code: null, revenue_account_code: "PL_IN_4000", cost_account_code: "PL_EX_5100",
        location: "Durban Marine depot, Durban",
        description: "Onboarding services for the 12-month fleet telemetry subscription RC-2603: device provisioning, platform training and go-live review.",
        notes: "Mirror delivery project for revenue contract RC-2603 (annual invoice raised in advance).",
        totals: { labour_hours: 0, labour_cost: 0, billable_time_value: 0, budget_total: 22000 },
        cost_summary: PJ_COST[705], _perf: PJ_PERF[705],
        team: PJ_TEAM[705], tasks: PJ_TASKS[705],
        task_dependencies: PJ_DEPENDENCIES[705] || [],
        budget_lines: (PJ_BUDGETS[705] || []).map(function (l, i) { return Object.assign({ id: 70510 + i, line_no: i + 1, task_name: "" }, l); }),
        time_entries: PJ_TIME[705] || [], expenses: PJ_EXPENSES[705] || [],
        commitments: PJ_COMMITMENTS[705] || [], changes: PJ_CHANGES[705] || [],
        risks: PJ_RISKS[705] || [], issues: PJ_ISSUES[705] || [],
        documents: PJ_DOCS[705] || [], activity: PJ_ACTIVITY[705] || [],
        forecasts: PJ_FORECASTS[705] || [], capitalisations: [], asset_links: [], borrowing_links: [],
        closeout: {}, is_locked: false,
        revenue_obligations: PJ_OBL[705] || []
      },
      {
        id: 706, project_code: "PRJ-2606", project_name: "Workshop tooling upgrade",
        project_type: "capital_project", accounting_mode: "capital", status: "on_hold",
        customer_id: null, customer_name: null, priority: "low",
        progress_percent: 35, contract_value: 90000, budget_value: 85000, budget_lines_total: 85000,
        start_date: iso(Y, 5, 2), expected_end_date: iso(Y, 11, 18),
        baseline_start_date: iso(Y, 5, 2), baseline_end_date: iso(Y, 11, 18), baseline_budget_value: 85000,
        project_manager_user_id: 901, sponsor_user_id: 901, owner_user_id: 901,
        department_id: 2, business_unit: "Operations",
        billing_method: "none", billing_enabled: false, revenue_enabled: false,
        inventory_enabled: true, allow_time_entries: true, allow_expenses: true,
        wip_account_code: "BS_CA_1260", revenue_account_code: null, cost_account_code: "PL_EX_5100",
        location: "Mokoko workshop, Springs",
        description: "Internal capital project: CNC tooling upgrade for the workshop, capitalised to CIP while on hold pending board approval.",
        notes: "Capital project — costs accumulate to CIP (BS_CA_1260).",
        totals: { labour_hours: 0, labour_cost: 0, billable_time_value: 0, budget_total: 85000 },
        cost_summary: PJ_COST[706], _perf: PJ_PERF[706],
        team: PJ_TEAM[706], tasks: PJ_TASKS[706],
        task_dependencies: PJ_DEPENDENCIES[706] || [],
        budget_lines: (PJ_BUDGETS[706] || []).map(function (l, i) { return Object.assign({ id: 70610 + i, line_no: i + 1, task_name: "" }, l); }),
        time_entries: PJ_TIME[706] || [], expenses: PJ_EXPENSES[706] || [],
        commitments: PJ_COMMITMENTS[706] || [], changes: PJ_CHANGES[706] || [],
        risks: PJ_RISKS[706] || [], issues: PJ_ISSUES[706] || [],
        documents: PJ_DOCS[706] || [], activity: PJ_ACTIVITY[706] || [],
        forecasts: PJ_FORECASTS[706] || [], capitalisations: [], asset_links: [], borrowing_links: [],
        closeout: {}, is_locked: false,
        revenue_obligations: PJ_OBL[706] || []
      }
    ];
    PJ_PROJECTS.forEach(function (p) {
      var mir = pjRevenueMirror(p);
      p.revenue_contracts = mir ? [mir.contract] : [];
      p.revenue_summary = mir ? mir.summary
        : { transaction_price: 0, recognized_revenue: 0, billed_to_date: 0, cash_collected: 0, contract_asset: 0, contract_liability: 0 };
    });
    PJ_PROJECTS.nextId = 711;
    window.__PJ_PROJECTS_STORE = PJ_PROJECTS;
    }

    if (cidMatch && pathname.indexOf("/projects") !== -1) {
      var pjPath = pathname.replace(/\/$/, "").replace(new RegExp("^/api/companies/" + cid + "/projects"), "");

      /* ---- profitability (must match before :id) ---- */
      if (pjPath === "/profitability") {
        var pjPid = Number(query.get("project_id") || 0) || null;
        var pjItems = PJ_PROJECTS.map(function (p) {
          var c = PJ_COST[p.id] || {};
          return {
            project_id: p.id, project_code: p.project_code, project_name: p.project_name,
            customer_id: p.customer_id || null, customer_name: p.customer_name || "Internal",
            contract_value: p.contract_value, budget_total: p.budget_value,
            material_cost_total: c.material_cost || 0,
            recognized_revenue: (p.revenue_summary || {}).recognized_revenue || 0,
            billed_to_date: (p.revenue_summary || {}).billed_to_date || 0,
            gross_margin: p.id === 701 ? 24400
              : p.id === 702 ? 6000
              : p.id === 703 ? -2100
              : p.id === 704 ? 12900
              : 0
          };
        });
        if (pjPid) pjItems = pjItems.filter(function (x) { return x.project_id === pjPid; });
        return json({ ok: true, items: pjItems });
      }

      /* ---- all budget lines (budgets desk) ---- */
      if (pjPath === "/budget-lines") {
        var pjBl = [];
        PJ_PROJECTS.forEach(function (p) {
          (p.budget_lines || []).forEach(function (l) {
            pjBl.push(Object.assign({ project_id: p.id, project_code: p.project_code, project_name: p.project_name }, l));
          });
        });
        var pjQ = (query.get("q") || "").toLowerCase();
        var pjBp = Number(query.get("project_id") || 0) || null;
        if (pjBp) pjBl = pjBl.filter(function (l) { return l.project_id === pjBp; });
        if (pjQ) pjBl = pjBl.filter(function (l) {
          return (l.project_code + " " + l.project_name + " " + l.line_code + " " + l.description + " " + l.cost_code).toLowerCase().indexOf(pjQ) !== -1;
        });
        return json({ ok: true, items: pjBl });
      }

      /* ---- material issues desk (kept empty — screen out of scope) ---- */
      if (pjPath === "/material-issues") {
        return json({ ok: true, items: [] });
      }

      /* ---- per-project sub-resources ---- */
      var pjOne = pjPath.match(/^\/(\d+)$/);
      var pjPm = pjPath.match(/^\/(\d+)\/pm-workspace$/);
      var pjPerfM = pjPath.match(/^\/(\d+)\/performance$/);
      var pjCap = pjPath.match(/^\/(\d+)\/capital-position$/);

      if (pjPm) {
        var p1 = PJ_PROJECTS.filter(function (x) { return x.id === Number(pjPm[1]); })[0];
        return p1 ? json({ ok: true, data: pjPmWorkspace(p1) }) : json({ ok: true, data: { stats: {}, tasks: [], obligations: [] } });
      }
      if (pjPerfM) {
        var p2 = PJ_PROJECTS.filter(function (x) { return x.id === Number(pjPerfM[1]); })[0];
        return json({ ok: true, data: (p2 && p2._perf) || {} });
      }
      if (pjCap) {
        var p3 = PJ_PROJECTS.filter(function (x) { return x.id === Number(pjCap[1]); })[0];
        var c3 = (p3 && PJ_COST[p3.id]) || {};
        return json({ ok: true, data: { material_cost: c3.material_cost || 0, capitalizable_labour: 0, capitalizable_expenses: 0, capitalized_borrowing_costs: 0, cip_total: c3.material_cost || 0 } });
      }
      if (pjOne) {
        var p4 = PJ_PROJECTS.filter(function (x) { return x.id === Number(pjOne[1]); })[0];
        return p4 ? json(pjStripInternals(p4)) : json({ error: "Project not found" }, 404);
      }

      /* ---- list + create ---- */
      if (pjPath === "") {
        if (method === "POST") {
          try {
            var nb = JSON.parse(opts.body || "{}");
            var nid = PJ_PROJECTS.nextId++;
            var np = {
              id: nid,
              project_code: String(nb.project_code || ("PRJ-26" + nid)),
              project_name: String(nb.project_name || "Untitled project"),
              project_type: String(nb.project_type || "customer_project"),
              accounting_mode: String(nb.accounting_mode || "contract"),
              status: String(nb.status || "draft"),
              customer_id: nb.customer_id || null,
              customer_name: pjCustomerName(nb.customer_id),
              priority: String(nb.priority || "normal"),
              progress_percent: Number(nb.progress_percent || 0),
              contract_value: Number(nb.contract_value || 0),
              budget_value: Number(nb.budget_value || 0),
              budget_lines_total: Number(nb.budget_value || 0),
              start_date: nb.start_date || null,
              expected_end_date: nb.expected_end_date || null,
              baseline_start_date: nb.baseline_start_date || null,
              baseline_end_date: nb.baseline_end_date || null,
              baseline_budget_value: Number(nb.baseline_budget_value || 0),
              project_manager_user_id: nb.project_manager_user_id || null,
              sponsor_user_id: nb.sponsor_user_id || null,
              owner_user_id: nb.owner_user_id || null,
              department_id: nb.department_id || null,
              business_unit: nb.business_unit || null,
              billing_method: String(nb.billing_method || "milestone"),
              billing_enabled: nb.billing_enabled !== false,
              revenue_enabled: nb.revenue_enabled !== false,
              inventory_enabled: nb.inventory_enabled !== false,
              allow_time_entries: nb.allow_time_entries !== false,
              allow_expenses: nb.allow_expenses !== false,
              wip_account_code: nb.wip_account_code || null,
              revenue_account_code: nb.revenue_account_code || null,
              cost_account_code: nb.cost_account_code || null,
              location: nb.location || null,
              description: nb.description || null,
              notes: nb.notes || null,
              totals: { labour_hours: 0, labour_cost: 0, billable_time_value: 0, budget_total: Number(nb.budget_value || 0) },
              cost_summary: { material_cost: 0, labour_cost: 0, expense_cost: 0, actual_cost: 0, committed_cost: 0 },
              _perf: { actual_cost: 0, estimate_to_complete: Number(nb.budget_value || 0), estimate_at_completion: Number(nb.budget_value || 0), budget_variance: 0, forecast_margin: 0, forecast_margin_percent: 0 },
              team: [], tasks: [], task_dependencies: [], budget_lines: [],
              time_entries: [], expenses: [], commitments: [], changes: [],
              risks: [], issues: [], documents: [], activity: [], forecasts: [],
              capitalisations: [], asset_links: [], borrowing_links: [],
              closeout: {}, is_locked: false,
              revenue_contracts: [], revenue_obligations: [],
              revenue_summary: { transaction_price: 0, recognized_revenue: 0, billed_to_date: 0, cash_collected: 0, contract_asset: 0, contract_liability: 0 }
            };
            PJ_PROJECTS.push(np);
            return json({ ok: true, data: pjStripInternals(np) });
          } catch (e) {
            return json({ ok: false, error: "Invalid project payload" }, 422);
          }
        }
        var pjList = PJ_PROJECTS.map(pjSummary);
        var pjQ2 = (query.get("q") || "").toLowerCase();
        var pjSt = query.get("status") || "";
        var pjTy = query.get("project_type") || "";
        var pjAc = query.get("accounting_mode") || "";
        var pjCu = Number(query.get("customer_id") || 0) || null;
        if (pjSt) pjList = pjList.filter(function (x) { return x.status === pjSt; });
        if (pjTy) pjList = pjList.filter(function (x) { return x.project_type === pjTy; });
        if (pjAc) pjList = pjList.filter(function (x) { return x.accounting_mode === pjAc; });
        if (pjCu) pjList = pjList.filter(function (x) { return x.customer_id === pjCu; });
        if (pjQ2) pjList = pjList.filter(function (x) {
          return ((x.project_code || "") + " " + (x.project_name || "") + " " + (x.customer_name || "") + " " + (x.location || "")).toLowerCase().indexOf(pjQ2) !== -1;
        });
        var pjLimit = Number(query.get("limit") || 50) || 50;
        var pjOff = Number(query.get("offset") || 0) || 0;
        return json({ ok: true, items: pjList.slice(pjOff, pjOff + pjLimit), total: pjList.length });
      }

      /* ---- PATCH project (edit) ---- */
      var pjPatch = pjPath.match(/^\/(\d+)$/);
      if (pjPatch && (method === "PATCH" || method === "PUT")) {
        try {
          var ub = JSON.parse(opts.body || "{}");
          var up = PJ_PROJECTS.filter(function (x) { return x.id === Number(pjPatch[1]); })[0];
          if (!up) return json({ error: "Project not found" }, 404);
          ["project_code", "project_name", "project_type", "accounting_mode", "status", "priority",
            "business_unit", "billing_method", "wip_account_code", "revenue_account_code",
            "cost_account_code", "location", "description", "notes",
            "start_date", "expected_end_date", "baseline_start_date", "baseline_end_date"].forEach(function (k) {
              if (ub[k] !== undefined) up[k] = ub[k];
            });
          ["customer_id", "project_manager_user_id", "sponsor_user_id", "owner_user_id", "department_id"].forEach(function (k) {
            if (ub[k] !== undefined) up[k] = ub[k];
          });
          if (ub.customer_id !== undefined) up.customer_name = pjCustomerName(ub.customer_id);
          ["progress_percent", "contract_value", "budget_value", "baseline_budget_value"].forEach(function (k) {
            if (ub[k] !== undefined) up[k] = Number(ub[k] || 0);
          });
          if (ub.budget_value !== undefined) { up.budget_lines_total = Number(ub.budget_value || 0); if (up.totals) up.totals.budget_total = Number(ub.budget_value || 0); }
          ["billing_enabled", "revenue_enabled", "inventory_enabled", "allow_time_entries", "allow_expenses"].forEach(function (k) {
            if (ub[k] !== undefined) up[k] = !!ub[k];
          });
          return json({ ok: true, data: pjStripInternals(up) });
        } catch (e) {
          return json({ ok: false, error: "Invalid project payload" }, 422);
        }
      }
      /* unmatched /projects/* sub-resources → fall through to generic empty */
    }

    /* ════════════════════════════════════════════════════════════════
       PAYROLL DEMO BACKEND — /payroll/* endpoints
       ------------------------------------------------------------------
       Mokoko Trading (Pty) Ltd · ZAR · monthly payroll, 4 employees.
       Story-reconciled with the seeded accounting values:
         - Sep 2026 posted run  : gross 22,000.00 · deductions 2,560.00
                                  · net 19,440.00  (= journal JE-1046)
         - Aug 2026 EMP201 outstanding 3,890.00 + Sep 2026 EMP201 3,000.00
           = 6,890.00  (= TB / balance-sheet PAYE Payable)
       ════════════════════════════════════════════════════════════════ */

    var PAY_EMPLOYEES = [
      {
        id: 901, employee_no: "TE0001",
        first_name: "Thabo", last_name: "Mokoena",
        email: "thabo@mokokotrading.co.za", phone: "082 551 7301",
        department_name: "Executive", position_title: "Managing Director",
        employment_status: "active", employment_start_date: "2021-03-01",
        date_of_birth: "1985-03-12", id_number: "8503125803085",
        tax_number: "1234567801", is_director: true,
        basic_salary: 8200, overtime_pay: 0, bonus: 0, commission: 0,
        allowances: 0, other_income: 0,
        paye: 1120, uif: 82, sdl: 82
      },
      {
        id: 902, employee_no: "TE0002",
        first_name: "Lerato", last_name: "Dlamini",
        email: "lerato.d@mokokotrading.co.za", phone: "083 774 9902",
        department_name: "Operations", position_title: "Shop Manager",
        employment_status: "active", employment_start_date: "2022-06-13",
        date_of_birth: "1990-11-02", id_number: "9011020184086",
        tax_number: "2345678902", is_director: false,
        basic_salary: 5600, overtime_pay: 0, bonus: 0, commission: 0,
        allowances: 0, other_income: 0,
        paye: 610, uif: 56, sdl: 56
      },
      {
        id: 903, employee_no: "TE0003",
        first_name: "Sipho", last_name: "Ndlovu",
        email: "sipho.n@mokokotrading.co.za", phone: "084 236 1187",
        department_name: "Operations", position_title: "Warehouse Assistant",
        employment_status: "active", employment_start_date: "2023-01-09",
        date_of_birth: "1994-07-25", id_number: "9407255211083",
        tax_number: "3456789003", is_director: false,
        basic_salary: 4500, overtime_pay: 0, bonus: 0, commission: 0,
        allowances: 0, other_income: 0,
        paye: 360, uif: 45, sdl: 45
      },
      {
        id: 904, employee_no: "TE0004",
        first_name: "Mary-Ann", last_name: "Jacobs",
        email: "maryann.j@mokokotrading.co.za", phone: "072 610 4839",
        department_name: "Admin", position_title: "Office Cleaner (Part-time)",
        employment_status: "active", employment_start_date: "2023-10-02",
        date_of_birth: "1988-02-14", id_number: "8802140240089",
        tax_number: "4567890014", is_director: false,
        basic_salary: 3700, overtime_pay: 0, bonus: 0, commission: 0,
        allowances: 0, other_income: 0,
        paye: 250, uif: 37, sdl: 37
      }
    ];

    /* Aug 2026 ran with performance bonuses (total 5,450) — explains the
       larger Aug EMP201 (3,890) that is still outstanding on the TB. */
    var PAY_AUG_BONUS = { 901: 2000, 902: 1950, 903: 900, 904: 600 };
    var PAY_AUG_PAYE  = { 901: 1410, 902: 790,  903: 480,  904: 330 };

    function payPeriod(ym) {
      var y = Number(String(ym).slice(0, 4));
      var m = Number(String(ym).slice(5, 7));
      var last = new Date(y, m, 0).getDate();
      var start = ym + "-01";
      var end = ym + "-" + String(last).padStart(2, "0");
      /* pay day: 25th, clamped back to the previous weekday */
      var pd = new Date(Date.UTC(y, m - 1, 25));
      var dow = pd.getUTCDay();
      if (dow === 0) pd = new Date(Date.UTC(y, m - 1, 23));
      else if (dow === 6) pd = new Date(Date.UTC(y, m - 1, 24));
      var pay = pd.toISOString().slice(0, 10);
      return { start: start, end: end, pay: pay, y: y, m: m };
    }

    function payRecords(ym) {
      var p = payPeriod(ym);
      var isAug = p.m === 8;
      return PAY_EMPLOYEES.map(function (e) {
        var bonus = isAug ? (PAY_AUG_BONUS[e.id] || 0) : 0;
        var paye = isAug ? (PAY_AUG_PAYE[e.id] || e.paye) : e.paye;
        var gross = e.basic_salary + bonus;
        var net = gross - paye - e.uif;
        return {
          payroll_number: e.employee_no,
          first_name: e.first_name,
          last_name: e.last_name,
          id_number: e.id_number,
          tax_number: e.tax_number,
          date_of_birth: e.date_of_birth,
          employment_start_date: e.employment_start_date,
          job_title: e.position_title,
          department: e.department_name,
          basic_salary: e.basic_salary.toFixed(2),
          overtime_pay: "0.00",
          bonus: bonus.toFixed(2),
          commission: "0.00",
          allowances: "0.00",
          other_income: "0.00",
          gross_income: gross.toFixed(2),
          paye_deducted: paye.toFixed(2),
          uif_employee: e.uif.toFixed(2),
          uif_deducted: e.uif.toFixed(2),
          uif_employer: e.uif.toFixed(2),
          uif_total: (e.uif * 2).toFixed(2),
          sdl: e.sdl.toFixed(2),
          sdl_deducted: e.sdl.toFixed(2),
          eti: "0.00",
          eti_amount: "0.00",
          pension_fund_contributions: "0.00",
          retirement_annuity_contributions: "0.00",
          medical_scheme_contributions: "0.00",
          other_deductions: "0.00",
          net_pay: net.toFixed(2),
          period_start_date: p.start,
          period_end_date: p.end,
          payment_date: p.pay,
          is_director: e.is_director,
          is_non_resident: false
        };
      });
    }

    function payTotals(records) {
      var f = ["basic_salary", "overtime_pay", "bonus", "commission",
        "allowances", "other_income", "gross_income", "paye_deducted",
        "uif_employee", "uif_deducted", "uif_employer", "uif_total",
        "sdl", "sdl_deducted", "eti", "eti_amount",
        "pension_fund_contributions", "retirement_annuity_contributions",
        "medical_scheme_contributions", "other_deductions", "net_pay"];
      var t = {};
      f.forEach(function (k) {
        t[k] = records.reduce(function (s, r) { return s + Number(r[k] || 0); }, 0).toFixed(2);
      });
      return t;
    }

    function payRunFigures(ym) {
      var recs = payRecords(ym);
      var t = payTotals(recs);
      return {
        gross: Number(t.gross_income),
        deductions: Number(t.paye_deducted) + Number(t.uif_employee),
        employer: Number(t.uif_employer) + Number(t.sdl),
        net: Number(t.net_pay),
        employeeAmount: Number(t.paye_deducted) + Number(t.uif_employee),
        employerAmount: Number(t.uif_employer) + Number(t.sdl),
        totalPayable: Number(t.paye_deducted) + Number(t.uif_total) + Number(t.sdl)
      };
    }

    /* ---- bootstrap (screen entry point) ---- */
    if (cidMatch && /\/payroll\/bootstrap$/.test(pathname)) {
      var payCalendars = [];
      (function () {
        var monthsBack = 18;   /* Mar 2025 … Feb 2027 when run mid-2026 */
        var base = new Date(Date.UTC(2026, 8, 1)); /* Sep 2026 anchor */
        for (var i = -monthsBack; i <= 5; i++) {
          var d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, 1));
          var ym = d.toISOString().slice(0, 7);
          var p = payPeriod(ym);
          var closed = ym < "2026-09";
          payCalendars.push({
            id: 6600 + i + monthsBack,
            name: "Monthly Payroll",
            frequency: "monthly",
            period_start: p.start,
            period_end: p.end,
            payment_date: p.pay,
            status: closed ? "closed" : "open"
          });
        }
      })();

      var paySettings = {
        company_name: "Mokoko Trading (Pty) Ltd",
        country: "South Africa",
        currency: "ZAR",
        pay_frequency: "monthly",
        pay_day: 25,
        tax_authority_id: 1,
        uif_number: "7803456/1",
        sdl_number: "L7803456/1",
        paye_reference: "78034560001",
        email_payslips: true,
        proration_basis: "calendar_days",
        round_to: "2",
        pay_schedule: { frequency: "monthly", pay_day: 25, pay_period: "calendar_month" },
        earning_types: [
          { id: 1, name: "Basic Salary", code: "BASIC", is_statutory: false },
          { id: 2, name: "Overtime", code: "OT", is_statutory: false },
          { id: 3, name: "Performance Bonus", code: "BONUS", is_statutory: false },
          { id: 4, name: "Commission", code: "COMM", is_statutory: false }
        ],
        deduction_types: [
          { id: 1, name: "PAYE", code: "PAYE", is_statutory: true },
          { id: 2, name: "UIF (Employee)", code: "UIF-EE", is_statutory: true },
          { id: 3, name: "Pension Fund", code: "PENS", is_statutory: false },
          { id: 4, name: "Loan / Advance Repayment", code: "LOAN", is_statutory: false }
        ],
        departments: ["Executive", "Operations", "Admin"],
        positions: ["Managing Director", "Shop Manager", "Warehouse Assistant", "Office Cleaner (Part-time)"]
      };

      return json({
        ok: true,
        data: {
          settings: paySettings,
          calendars: payCalendars,
          employees: PAY_EMPLOYEES,
          tax_authorities: [
            { id: 1, code: "SARS", name: "South African Revenue Service", country: "South Africa" },
            { id: 2, code: "RSL", name: "Revenue Services Lesotho", country: "Lesotho" },
            { id: 3, code: "BURS", name: "Botswana Unified Revenue Service", country: "Botswana" }
          ],
          setup: {
            departments: paySettings.departments.map(function (n, i) { return { id: i + 1, name: n }; }),
            positions: paySettings.positions.map(function (n, i) { return { id: i + 1, title: n }; }),
            earning_types: paySettings.earning_types,
            deduction_types: paySettings.deduction_types,
            leave_types: [{ id: 1, name: "Annual Leave", days: 15 }, { id: 2, name: "Sick Leave", days: 30 }]
          }
        }
      });
    }

    /* ---- employees ---- */
    if (cidMatch && /\/payroll\/employees$/.test(pathname) && method === "GET") {
      var st = (query.get("status") || "").toLowerCase();
      var deptF = (query.get("department") || "").toLowerCase();
      var list = PAY_EMPLOYEES.filter(function (e) {
        if (st && String(e.employment_status).toLowerCase() !== st) return false;
        if (deptF && String(e.department_name).toLowerCase() !== deptF) return false;
        return true;
      });
      return json({ ok: true, items: list, rows: list, data: list, total: list.length });
    }
    if (cidMatch && /\/payroll\/employees\/\d+$/.test(pathname)) {
      var pEmp = PAY_EMPLOYEES.filter(function (e) {
        return String(e.id) === pathname.match(/\/payroll\/employees\/(\d+)$/)[1];
      })[0];
      if (!pEmp) return json({ ok: false, error: "Employee not found" }, 404);

      /* Task 14 — employee profile sub-records (visual demo data only).
         Salaries mirror the seeded payroll figures; Thabo's loan starts
         2026-10-01 with the first deduction in the NOV run, so no posted
         journal (incl. JE-1046) is affected. */
      var PAY_SUB = {
        901: {
          contracts: [{ id: 9001, employee_id: 901, contract_type: "permanent", salary_type: "monthly", basic_salary: 8200, hourly_rate: 47.35, normal_hours_per_month: 160, effective_from: "2021-03-01", is_active: true }],
          tax_profiles: [{ id: 9101, employee_id: 901, tax_authority_id: 1, tax_number: "1234567801", residency_status: "resident", date_of_birth: "1985-03-12", medical_scheme_members: 2, tax_calculation_method: "standard", effective_from: "2021-03-01" }],
          bank_accounts: [{ id: 9201, employee_id: 901, bank_name: "FNB", account_name: "T Mokoena", account_number: "62044713502", branch_code: "250655", account_type: "current", is_primary: true }],
          leave_requests: [],
          loans: [{ id: 9301, employee_id: 901, loan_no: "LA-2610-01", principal_amount: 1800, repayment_amount: 300, balance_amount: 1800, start_date: "2026-10-01", deduction_type_id: 4, status: "ACTIVE" }]
        },
        902: {
          contracts: [{ id: 9002, employee_id: 902, contract_type: "permanent", salary_type: "monthly", basic_salary: 5600, hourly_rate: 32.35, normal_hours_per_month: 160, effective_from: "2022-06-13", is_active: true }],
          tax_profiles: [{ id: 9102, employee_id: 902, tax_authority_id: 1, tax_number: "2345678902", residency_status: "resident", date_of_birth: "1990-11-02", medical_scheme_members: 1, tax_calculation_method: "standard", effective_from: "2022-06-13" }],
          bank_accounts: [{ id: 9202, employee_id: 902, bank_name: "Nedbank", account_name: "L Dlamini", account_number: "11938472651", branch_code: "198765", account_type: "savings", is_primary: true }],
          leave_requests: [{ id: 9401, employee_id: 902, leave_name: "Annual Leave", date_from: "2026-12-21", date_to: "2026-12-29", status: "Approved" }],
          loans: []
        },
        903: {
          contracts: [{ id: 9003, employee_id: 903, contract_type: "permanent", salary_type: "monthly", basic_salary: 4500, hourly_rate: 26, normal_hours_per_month: 160, effective_from: "2023-01-09", is_active: true }],
          tax_profiles: [{ id: 9103, employee_id: 903, tax_authority_id: 1, tax_number: "3456789003", residency_status: "resident", date_of_birth: "1993-07-19", medical_scheme_members: 0, tax_calculation_method: "standard", effective_from: "2023-01-09" }],
          bank_accounts: [{ id: 9203, employee_id: 903, bank_name: "ABSA", account_name: "S Ndlovu", account_number: "4058129734", branch_code: "632005", account_type: "current", is_primary: true }],
          leave_requests: [],
          loans: []
        },
        904: {
          contracts: [{ id: 9004, employee_id: 904, contract_type: "part_time", salary_type: "monthly", basic_salary: 3700, hourly_rate: 23.15, normal_hours_per_month: 160, effective_from: "2023-08-01", is_active: true }],
          tax_profiles: [{ id: 9104, employee_id: 904, tax_authority_id: 1, tax_number: "4567890004", residency_status: "resident", date_of_birth: "1996-02-28", medical_scheme_members: 0, tax_calculation_method: "standard", effective_from: "2023-08-01" }],
          bank_accounts: [{ id: 9204, employee_id: 904, bank_name: "Capitec", account_name: "MA Jacobs", account_number: "10029483750", branch_code: "470010", account_type: "savings", is_primary: true }],
          leave_requests: [],
          loans: []
        }
      };

      var pEmpOut = Object.assign({}, pEmp, PAY_SUB[Number(pEmp.id)] || {});
      return json({ ok: true, data: pEmpOut, employee: pEmpOut });
    }

    /* ---- calendars ---- */
    if (cidMatch && /\/payroll\/calendars\/generate$/.test(pathname) && method === "POST") {
      return json({ ok: true, created: 0, data: [], items: [] });
    }
    if (cidMatch && /\/payroll\/calendars$/.test(pathname)) {
      var pCals = (function () {
        var out = [];
        for (var i = -17; i <= 5; i++) {
          var d = new Date(Date.UTC(2026, 8 + i, 1));
          var ym = d.toISOString().slice(0, 7);
          var p = payPeriod(ym);
          out.push({
            id: 6600 + i + 17,
            frequency: "monthly",
            period_start: p.start,
            period_end: p.end,
            payment_date: p.pay,
            status: ym < "2026-09" ? "closed" : "open"
          });
        }
        return out;
      })();
      return json({ ok: true, items: pCals, rows: pCals, data: pCals, total: pCals.length });
    }

    /* ---- runs ---- */
    var PAY_RUNS = [
      { id: 811, run_no: "PR-2608", ym: "2026-08", status: "posted" },
      { id: 812, run_no: "PR-2609", ym: "2026-09", status: "posted" },
      { id: 813, run_no: "PR-2610", ym: "2026-10", status: "approved" },
      { id: 814, run_no: "PR-2611", ym: "2026-11", status: "draft" }
    ].map(function (r) {
      var p = payPeriod(r.ym);
      var f = payRunFigures(r.ym);
      return {
        id: r.id, run_no: r.run_no,
        period_start: p.start, period_end: p.end, payment_date: p.pay,
        frequency: "monthly", status: r.status,
        gross_pay: f.gross, total_deductions: f.deductions,
        total_employer_contributions: f.employer, net_pay: f.net,
        employee_count: PAY_EMPLOYEES.length,
        employees: payRecords(r.ym).map(function (rec, i) {
          return {
            employee_id: PAY_EMPLOYEES[i].id,
            employee_no: rec.payroll_number,
            name: rec.first_name + " " + rec.last_name,
            gross_pay: Number(rec.gross_income),
            deductions: Number(rec.paye_deducted) + Number(rec.uif_employee),
            net_pay: Number(rec.net_pay)
          };
        })
      };
    });

    if (cidMatch && /\/payroll\/runs$/.test(pathname) && method === "POST") {
      return json({ ok: true, data: PAY_RUNS[3], id: PAY_RUNS[3].id }, 201);
    }
    if (cidMatch && /\/payroll\/runs$/.test(pathname)) {
      return json({ ok: true, items: PAY_RUNS, rows: PAY_RUNS, data: PAY_RUNS, total: PAY_RUNS.length });
    }
    var mPayRunAct = pathname.match(/\/payroll\/runs\/(\d+)\/(calculate|submit|approve|return-to-draft|post|reverse)$/);
    if (mPayRunAct && method === "POST") {
      var pRunAct = PAY_RUNS.filter(function (r) { return String(r.id) === mPayRunAct[1]; })[0];
      if (!pRunAct) return json({ ok: false, error: "Run not found" }, 404);
      var actMap = { calculate: "calculated", submit: "approved", approve: "approved", "return-to-draft": "draft", post: "posted" };
      pRunAct.status = actMap[mPayRunAct[2]] || pRunAct.status;
      return json({ ok: true, data: pRunAct, run: pRunAct, id: pRunAct.id, status: pRunAct.status });
    }
    var mPayRun = pathname.match(/\/payroll\/runs\/(\d+)$/);
    if (mPayRun) {
      var pRun = PAY_RUNS.filter(function (r) { return String(r.id) === mPayRun[1]; })[0];
      if (!pRun) return json({ ok: false, error: "Run not found" }, 404);
      return json({ ok: true, data: pRun, run: pRun });
    }

    /* ---- statutory: mappings + returns + calendar ---- */
    if (cidMatch && /\/payroll\/statutory\/mappings$/.test(pathname)) {
      var payMappings = [
        { id: 6101, authority_code: "SARS", return_type: "EMP201", component: "PAYE", gl_account_code: "BS_CL_2110", gl_account_name: "PAYE Payable", is_active: true },
        { id: 6102, authority_code: "SARS", return_type: "EMP201", component: "UIF (Employee)", gl_account_code: "BS_CL_2120", gl_account_name: "UIF Payable", is_active: true },
        { id: 6103, authority_code: "SARS", return_type: "EMP201", component: "UIF (Employer)", gl_account_code: "BS_CL_2120", gl_account_name: "UIF Payable", is_active: true },
        { id: 6104, authority_code: "SARS", return_type: "EMP201", component: "SDL", gl_account_code: "BS_CL_2130", gl_account_name: "SDL Payable", is_active: true },
        { id: 6105, authority_code: "SARS", return_type: "EMP201", component: "ETI", gl_account_code: "BS_CL_2110", gl_account_name: "PAYE Payable", is_active: true },
        { id: 6106, authority_code: "SARS", return_type: "EMP501", component: "Reconciliation", gl_account_code: "BS_CL_2110", gl_account_name: "PAYE Payable", is_active: true },
        { id: 6107, authority_code: "RSL", return_type: "EMP160", component: "PAYE", gl_account_code: "BS_CL_2110", gl_account_name: "PAYE Payable", is_active: true },
        { id: 6108, authority_code: "BURS", return_type: "ITP1", component: "PAYE", gl_account_code: "BS_CL_2110", gl_account_name: "PAYE Payable", is_active: true }
      ];
      return json({ ok: true, items: payMappings, rows: payMappings, data: payMappings, total: payMappings.length });
    }

    if (cidMatch && /\/payroll\/statutory\/returns$/.test(pathname)) {
      var payReturns = [];
      (function () {
        /* SARS EMP201 — Mar … Sep 2026 */
        var months = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
        months.forEach(function (ym, i) {
          var p = payPeriod(ym);
          var f = payRunFigures(ym);
          var filed;
          var status;
          if (i <= 4) { status = "accepted"; filed = ym.slice(0, 4) + "-" + String(Number(ym.slice(5, 7)) + 1).padStart(2, "0") + "-07"; }
          else if (i === 5) { status = "submitted"; filed = "2026-09-05"; }
          else { status = "calculated"; filed = null; }
          payReturns.push({
            id: 7001 + i,
            return_no: "EMP201-" + ym.slice(2, 4) + ym.slice(5, 7),
            authority_code: "SARS",
            return_type: "EMP201",
            period_start: p.start,
            period_end: p.end,
            submission_date: filed,
            reporting_date: filed,
            employee_count: PAY_EMPLOYEES.length,
            employee_amount: f.employeeAmount,
            employer_amount: f.employerAmount,
            total_payable: f.totalPayable,
            status: status
          });
        });
        /* SARS EMP501 interim reconciliation (2025/26) */
        payReturns.push({
          id: 7008,
          return_no: "EMP501-2608",
          authority_code: "SARS",
          return_type: "EMP501",
          period_start: "2026-03-01",
          period_end: "2026-08-31",
          submission_date: null,
          reporting_date: null,
          employee_count: PAY_EMPLOYEES.length,
          employee_amount: 0,
          employer_amount: 0,
          total_payable: 0,
          status: "draft"
        });
        /* RSL EMP160 */
        [["2026-08", "submitted", "2026-09-08"], ["2026-09", "calculated", null]].forEach(function (x, i) {
          var p = payPeriod(x[0]);
          var f = payRunFigures(x[0]);
          payReturns.push({
            id: 7009 + i,
            return_no: "EMP160-" + x[0].slice(2, 4) + x[0].slice(5, 7),
            authority_code: "RSL",
            return_type: "EMP160",
            period_start: p.start,
            period_end: p.end,
            submission_date: x[2],
            reporting_date: x[2],
            employee_count: PAY_EMPLOYEES.length,
            employee_amount: f.employeeAmount,
            employer_amount: f.employerAmount,
            total_payable: f.totalPayable,
            status: x[1]
          });
        });
        /* BURS ITP1 */
        var pBw = payPeriod("2026-08");
        var fBw = payRunFigures("2026-08");
        payReturns.push({
          id: 7011,
          return_no: "ITP1-2608",
          authority_code: "BURS",
          return_type: "ITP1",
          period_start: pBw.start,
          period_end: pBw.end,
          submission_date: null,
          reporting_date: null,
          employee_count: PAY_EMPLOYEES.length,
          employee_amount: fBw.employeeAmount,
          employer_amount: fBw.employerAmount,
          total_payable: fBw.totalPayable,
          status: "draft"
        });
      })();

      var payCalendar = [];
      (function () {
        for (var i = 0; i < 12; i++) {
          var d = new Date(Date.UTC(2026, 2 + i, 1));  /* Mar 2026 … Feb 2027 */
          var ym = d.toISOString().slice(0, 7);
          var p = payPeriod(ym);
          payCalendar.push({ period_start: p.start, period_end: p.end, payment_date: p.pay, status: "open" });
        }
      })();

      return json({ ok: true, items: payReturns, rows: payReturns, data: payReturns, total: payReturns.length, calendar: payCalendar });
    }

    /* ---- tax filing: preview / validate / export (module engine) ---- */
    if (cidMatch && /\/payroll\/tax-filing\/preview$/.test(pathname) && method === "GET") {
      var tfAuth = (query.get("authority") || "SARS").toUpperCase();
      var tfPeriod = query.get("period") || "";
      if (!/^\d{4}-\d{2}$/.test(tfPeriod)) {
        return json({ ok: false, error: "period must be YYYY-MM" }, 422);
      }
      var pPrev = payPeriod(tfPeriod);
      var recsPrev = payRecords(tfPeriod);
      var retId = null;
      var retMatch = payReturns.filter(function (r) {
        return r.authority_code === tfAuth && r.period_start.slice(0, 7) === tfPeriod;
      })[0];
      if (retMatch) retId = retMatch.id;
      return json({
        ok: true,
        data: {
          authority_code: tfAuth,
          company_name: "Mokoko Trading (Pty) Ltd",
          paye_reference: tfAuth === "SARS" ? "78034560001" : (tfAuth === "RSL" ? "RSL-4471" : "BURS-9902"),
          statutory_return_id: retId,
          period: { start: pPrev.start, end: pPrev.end, payment_date: pPrev.pay },
          records: recsPrev,
          totals: payTotals(recsPrev)
        }
      });
    }

    if (cidMatch && /\/payroll\/tax-filing\/validate$/.test(pathname) && method === "POST") {
      try {
        var vBody = JSON.parse(opts.body || "{}");
        var vPeriod = String(vBody.period_start || "").slice(0, 7);
        var vRecs = /^\d{4}-\d{2}$/.test(vPeriod) ? payRecords(vPeriod) : [];
        return json({
          ok: true,
          data: {
            is_valid: true,
            summary: {
              total_records: vRecs.length,
              valid_records: vRecs.length,
              error_count: 0,
              warning_count: 1
            },
            errors: [],
            warnings: [
              { message: "EMP501 reconciliation for 2025/26 is still outstanding - this does not block EMP201 filing." }
            ]
          }
        });
      } catch (e) {
        return json({ ok: false, error: "Invalid validation payload" }, 422);
      }
    }

    if (cidMatch && /\/payroll\/tax-filing\/export$/.test(pathname) && method === "POST") {
      try {
        var exBody = JSON.parse(opts.body || "{}");
        var exFmt = String(exBody.format || "csv").toLowerCase();
        var exAuth = String(exBody.authority_code || "SARS").toUpperCase();
        var exStart = String(exBody.period_start || "");
        var exYm = exStart.slice(0, 7);
        var exRecs = /^\d{4}-\d{2}$/.test(exYm) ? payRecords(exYm) : payRecords("2026-09");

        if (exFmt === "xml") {
          var xmlRows = exRecs.map(function (r) {
            return "    <Employee num=\"" + r.payroll_number + "\">" +
              "<Name>" + r.first_name + " " + r.last_name + "</Name>" +
              "<IdNumber>" + r.id_number + "</IdNumber>" +
              "<TaxNumber>" + r.tax_number + "</TaxNumber>" +
              "<GrossIncome>" + r.gross_income + "</GrossIncome>" +
              "<PAYE>" + r.paye_deducted + "</PAYE>" +
              "<UIF>" + r.uif_employee + "</UIF>" +
              "<SDL>" + r.sdl + "</SDL>" +
              "<NetPay>" + r.net_pay + "</NetPay>" +
              "</Employee>";
          }).join("\n");
          var xml =
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
            "<EMP201Return xmlns=\"urn:sars.gov.za:emp201\" period=\"" + exYm + "\">\n" +
            "  <Employer name=\"Mokoko Trading (Pty) Ltd\" payeReference=\"78034560001\" uifReference=\"7803456/1\" sdlReference=\"L7803456/1\" />\n" +
            "  <Employees count=\"" + exRecs.length + "\">\n" + xmlRows + "\n  </Employees>\n" +
            "</EMP201Return>";
          return new Response(xml, {
            status: 200,
            headers: { "Content-Type": "application/xml", "Content-Disposition": "attachment" }
          });
        }

        var csvHead = "Employee No,Employee,ID Number,Tax Number,Job Title,Department,Basic Salary,Overtime,Bonus,Commission,Allowances,Other Income,Gross Income,PAYE,UIF Employee,UIF Employer,UIF Total,SDL,ETI,Pension,Retirement Annuity,Medical,Other Deductions,Net Pay,Period,Payment Date";
        var csvRows = exRecs.map(function (r) {
          return [r.payroll_number, r.first_name + " " + r.last_name, r.id_number, r.tax_number,
            r.job_title, r.department, r.basic_salary, r.overtime_pay, r.bonus, r.commission,
            r.allowances, r.other_income, r.gross_income, r.paye_deducted, r.uif_employee,
            r.uif_employer, r.uif_total, r.sdl, r.eti, r.pension_fund_contributions,
            r.retirement_annuity_contributions, r.medical_scheme_contributions,
            r.other_deductions, r.net_pay, r.period_start_date + " to " + r.period_end_date, r.payment_date
          ].join(",");
        }).join("\n");
        var csv = csvHead + "\n" + csvRows + "\n";
        return new Response(csv, {
          status: 200,
          headers: {
            "Content-Type": exFmt === "xlsx" ? "application/vnd.ms-excel" : "text/csv",
            "Content-Disposition": "attachment"
          }
        });
      } catch (e) {
        return json({ ok: false, error: "Invalid export payload" }, 422);
      }
    }

    /* ---- remaining payroll sub-resources: empty but well-formed ---- */
    if (cidMatch && pathname.indexOf("/payroll/") !== -1) {
      return json({ ok: true, rows: [], items: [], data: [], total: 0 });
    }

    /* ---- remaining payroll sub-resources: empty but well-formed ---- */


    if (cidMatch && pathname.indexOf("/payroll/") !== -1) {
      return json({ ok: true, rows: [], items: [], data: [], total: 0 });
    }


    /* ══════════════════════════════════════════════════════════════
       cat3 — CATALOG STUDIO DEMO DATA (Task 16)
       Inventory / Services / Purchasing / Manufacturing sub-screens.
       · 34 inventory items — stock value ties EXACTLY to the balance
         sheet anchor "Inventory on Hand 79,750.00" and the dashboard
         stat inventory:{value:79750, items:34, lowStock:3}.
       · 3 items below reorder level (lowStock story).
       · TX store persisted on window.__CAT_TX_STORE (POSTed
         write-downs / receipts survive across requests).
       · No existing displayed value is changed anywhere.
    ══════════════════════════════════════════════════════════════ */
    var CAT_ITEMS = [
      { id: 601, sku: "MOK-GYM-001", name: "Commercial Treadmill T900", category: "Gym Equipment", barcode: "6001234000017", sales_price: 21900.00, cost_price: 15625.00, reorder_level: 0,  track_stock: true,  active: true, valuation_method: "WAVG" },
      { id: 602, sku: "MOK-GYM-002", name: "Adjustable Dumbbell 24kg",  category: "Gym Equipment", barcode: "6001234000024", sales_price: 1899.00,  cost_price: 1450.00,  reorder_level: 4,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 603, sku: "MOK-GYM-003", name: "Kettlebell 16kg",           category: "Gym Equipment", barcode: "6001234000031", sales_price: 549.00,   cost_price: 420.00,   reorder_level: 6,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 604, sku: "MOK-GYM-004", name: "Yoga Mat 6mm",              category: "Gym Equipment", barcode: "6001234000048", sales_price: 149.00,   cost_price: 95.00,    reorder_level: 8,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 605, sku: "MOK-GYM-005", name: "Resistance Band Set",       category: "Gym Equipment", barcode: "6001234000055", sales_price: 189.00,   cost_price: 130.00,   reorder_level: 6,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 606, sku: "MOK-GYM-006", name: "Exercise Ball 65cm",        category: "Gym Equipment", barcode: "6001234000062", sales_price: 199.00,   cost_price: 145.00,   reorder_level: 5,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 607, sku: "MOK-GYM-007", name: "Foam Roller 45cm",          category: "Gym Equipment", barcode: "6001234000079", sales_price: 169.00,   cost_price: 110.00,   reorder_level: 5,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 608, sku: "MOK-GYM-008", name: "Jump Rope Speed",           category: "Gym Equipment", barcode: "6001234000086", sales_price: 79.00,    cost_price: 45.00,    reorder_level: 10, track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 609, sku: "MOK-GYM-009", name: "Bench Press Pad",           category: "Gym Equipment", barcode: "6001234000093", sales_price: 529.00,   cost_price: 380.00,   reorder_level: 2,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 610, sku: "MOK-GYM-010", name: "Ab Wheel",                  category: "Gym Equipment", barcode: "6001234000109", sales_price: 119.00,   cost_price: 78.00,    reorder_level: 4,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 611, sku: "MOK-NUT-011", name: "Whey Protein 1kg",          category: "Nutrition",     barcode: "6001234000116", sales_price: 549.00,   cost_price: 385.00,   reorder_level: 6,  track_stock: true,  active: true, valuation_method: "WAVG" },
      { id: 612, sku: "MOK-NUT-012", name: "Protein Bar Box",           category: "Nutrition",     barcode: "6001234000123", sales_price: 259.00,   cost_price: 180.00,   reorder_level: 8,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 613, sku: "MOK-NUT-013", name: "Electrolyte Sachets",       category: "Nutrition",     barcode: "6001234000130", sales_price: 49.00,    cost_price: 32.00,    reorder_level: 10, track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 614, sku: "MOK-NUT-014", name: "Creatine 500g",             category: "Nutrition",     barcode: "6001234000147", sales_price: 399.00,   cost_price: 295.00,   reorder_level: 4,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 615, sku: "MOK-CLN-020", name: "Disinfectant Spray 750ml",  category: "Cleaning",      barcode: "6001234000154", sales_price: 59.00,    cost_price: 38.00,    reorder_level: 8,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 616, sku: "MOK-CLN-021", name: "Microfibre Cloth Pack",     category: "Cleaning",      barcode: "6001234000161", sales_price: 39.00,    cost_price: 25.00,    reorder_level: 10, track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 617, sku: "MOK-CLN-022", name: "Hand Sanitiser 500ml",      category: "Cleaning",      barcode: "6001234000178", sales_price: 65.00,    cost_price: 42.00,    reorder_level: 8,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 618, sku: "MOK-CLN-023", name: "Floor Cleaner 5L",          category: "Cleaning",      barcode: "6001234000185", sales_price: 199.00,   cost_price: 145.00,   reorder_level: 3,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 619, sku: "MOK-PKG-030", name: "Bubble Wrap 100m",          category: "Packaging",     barcode: "6001234000192", sales_price: 299.00,   cost_price: 210.00,   reorder_level: 3,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 620, sku: "MOK-PKG-031", name: "Carton Box Medium",         category: "Packaging",     barcode: "6001234000208", sales_price: 29.90,    cost_price: 18.50,    reorder_level: 15, track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 621, sku: "MOK-PKG-032", name: "Stretch Film Roll",         category: "Packaging",     barcode: "6001234000215", sales_price: 229.00,   cost_price: 165.00,   reorder_level: 4,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 622, sku: "MOK-SPT-040", name: "Treadmill Belt",            category: "Spare Parts",   barcode: "6001234000222", sales_price: 1399.00,  cost_price: 950.00,   reorder_level: 4,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 623, sku: "MOK-SPT-041", name: "Cable Wire Set",            category: "Spare Parts",   barcode: "6001234000239", sales_price: 349.00,   cost_price: 240.00,   reorder_level: 3,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 624, sku: "MOK-SPT-042", name: "Bearing Kit",               category: "Spare Parts",   barcode: "6001234000246", sales_price: 259.00,   cost_price: 185.00,   reorder_level: 3,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 625, sku: "MOK-STN-050", name: "A4 Paper Ream",             category: "Stationery",    barcode: "6001234000253", sales_price: 74.99,    cost_price: 52.00,    reorder_level: 12, track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 626, sku: "MOK-STN-051", name: "Ink Cartridge Black",       category: "Stationery",    barcode: "6001234000260", sales_price: 449.00,   cost_price: 320.00,   reorder_level: 4,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 627, sku: "MOK-ELN-060", name: "Solar LED Globe",           category: "Electronics",   barcode: "6001234000277", sales_price: 99.00,    cost_price: 68.00,    reorder_level: 6,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 628, sku: "MOK-ELN-061", name: "USB-C Cable 1m",            category: "Electronics",   barcode: "6001234000284", sales_price: 59.99,    cost_price: 34.00,    reorder_level: 10, track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 629, sku: "MOK-ELN-062", name: "Power Bank 10k",            category: "Electronics",   barcode: "6001234000291", sales_price: 379.00,   cost_price: 265.00,   reorder_level: 4,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 630, sku: "MOK-ELN-063", name: "Bluetooth Earbuds",         category: "Electronics",   barcode: "6001234000307", sales_price: 549.00,   cost_price: 385.00,   reorder_level: 3,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 631, sku: "MOK-ELN-064", name: "Phone Tripod",              category: "Electronics",   barcode: "6001234000314", sales_price: 149.00,   cost_price: 98.00,    reorder_level: 4,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 632, sku: "MOK-ACC-065", name: "Water Bottle 750ml",        category: "Accessories",   barcode: "6001234000321", sales_price: 69.00,    cost_price: 42.00,    reorder_level: 12, track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 633, sku: "MOK-ACC-066", name: "Gym Towel",                 category: "Accessories",   barcode: "6001234000338", sales_price: 89.00,    cost_price: 55.00,    reorder_level: 6,  track_stock: true,  active: true, valuation_method: "FIFO" },
      { id: 634, sku: "MOK-ACC-067", name: "Shaker Bottle 700ml",       category: "Accessories",   barcode: "6001234000345", sales_price: 59.00,    cost_price: 38.00,    reorder_level: 8,  track_stock: true,  active: true, valuation_method: "FIFO" }
    ];
    /* On-hand snapshot: qty per item; product of qty × avg cost = 79,750.00 exactly. */
    var CAT_ONHAND = { 601: 1, 602: 6, 603: 10, 604: 24, 605: 18, 606: 12, 607: 15, 608: 30, 609: 4, 610: 10, 611: 14, 612: 20, 613: 25, 614: 8, 615: 22, 616: 26, 617: 6, 618: 7, 619: 8, 620: 40, 621: 9, 622: 3, 623: 6, 624: 5, 625: 35, 626: 10, 627: 16, 628: 28, 629: 9, 630: 7, 631: 11, 632: 32, 633: 4, 634: 20 };

    var CAT_SERVICES = [
      { id: 71, code: "SVC-100", name: "Installation Labour",           description: "On-site equipment installation, per hour", unit: "hour", price: 850.00, vat_code: "STANDARD", is_taxable: true,  is_active: true },
      { id: 72, code: "SVC-200", name: "Delivery & Handling",           description: "Local delivery and offloading",            unit: "service", price: 450.00, vat_code: "STANDARD", is_taxable: true,  is_active: true },
      { id: 73, code: "SVC-210", name: "Gym Equipment Maintenance",     description: "Scheduled maintenance visit (RC-2601)",    unit: "visit", price: 1200.00, vat_code: "STANDARD", is_taxable: true,  is_active: true },
      { id: 74, code: "SVC-300", name: "Staff Training Session",        description: "Group training on equipment use & safety", unit: "session", price: 2500.00, vat_code: "STANDARD", is_taxable: true,  is_active: true },
      { id: 75, code: "SVC-400", name: "POS Setup & Configuration",     description: "Terminal setup, till mapping and training", unit: "service", price: 1800.00, vat_code: "STANDARD", is_taxable: true,  is_active: true },
      { id: 76, code: "SVC-500", name: "Business Consultancy (Day)",    description: "On-site advisory day rate",                unit: "day", price: 4500.00, vat_code: "STANDARD", is_taxable: true,  is_active: true }
    ];

    var CAT_POS = [
      { id: 81, po_no: "PO-2601", po_date: "2026-10-09", vendor_id: 1, vendor_name: "Bidvest Foodservice",    project_name: "Gym Equipment Programme", status: "approved",           total_amount: 18240.00 },
      { id: 82, po_no: "PO-2602", po_date: "2026-10-07", vendor_id: 5, vendor_name: "Springs Stationers",     project_name: null,                      status: "approved",           total_amount: 1820.00 },
      { id: 83, po_no: "PO-2603", po_date: "2026-10-05", vendor_id: 6, vendor_name: "Highveld IT Services",   project_name: "POS System Upgrade",      status: "partially_received", total_amount: 6800.00 },
      { id: 84, po_no: "PO-2604", po_date: "2026-09-30", vendor_id: 1, vendor_name: "Bidvest Foodservice",    project_name: null,                      status: "received",           total_amount: 3235.00 },
      { id: 85, po_no: "PO-2605", po_date: "2026-09-26", vendor_id: 4, vendor_name: "Gauteng Logistics cc",   project_name: "Gym Equipment Programme", status: "received",           total_amount: 2850.00 },
      { id: 86, po_no: "PO-2606", po_date: "2026-10-12", vendor_id: 7, vendor_name: "Cleanex Facilities (Pty) Ltd", project_name: null,                status: "draft",              total_amount: 960.00 }
    ];

    var CAT_BOMS = [
      { id: 91, bom_code: "BOM-2601", name: "Kettlebell Display Pack", item_name: "Kettlebell 16kg Pair", batch_qty: 10, batch_unit: "units", selling_price: 1099.00, cost_per_unit: 640.00, status: "active" },
      { id: 92, bom_code: "BOM-2602", name: "Bolt Kit 50pc",           item_name: "Bolt Kit 50pc",        batch_qty: 25, batch_unit: "units", selling_price: 349.50,  cost_per_unit: 210.00, status: "active" },
      { id: 93, bom_code: "BOM-2603", name: "Braai Stand Pack",        item_name: "Braai Stand",          batch_qty: 8,  batch_unit: "units", selling_price: 899.00,  cost_per_unit: 610.00, status: "draft" }
    ];

    var CAT_ORDERS = [
      { id: 95, mo_no: "MO-2601", tx_date: "2026-10-08", finished_item_name: "Kettlebell 16kg Pair", planned_qty: 10, actual_qty: 10, status: "completed",   bom_code: "BOM-2601", bom_name: "Kettlebell Display Pack", unit: "units", material_cost: 6400.00 },
      { id: 96, mo_no: "MO-2602", tx_date: "2026-10-11", finished_item_name: "Bolt Kit 50pc",        planned_qty: 20, actual_qty: 14, status: "in_progress", bom_code: "BOM-2602", bom_name: "Bolt Kit 50pc",           unit: "units", material_cost: 2940.00 },
      { id: 97, mo_no: "MO-2603", tx_date: "2026-10-13", finished_item_name: "Braai Stand",         planned_qty: 8,  actual_qty: 0,  status: "draft",       bom_code: "BOM-2603", bom_name: "Braai Stand Pack",        unit: "units", material_cost: 0 }
    ];

    var CAT_HISTORY = [
      { id: 95, mo_no: "MO-2601", tx_date: "2026-10-08", finished_item_name: "Kettlebell 16kg Pair", bom_code: "BOM-2601", bom_name: "Kettlebell Display Pack", planned_qty: 10, actual_qty: 10, material_cost: 6400.00, status: "completed", unit: "units" },
      { id: 98, mo_no: "MO-2509", tx_date: "2026-09-15", finished_item_name: "Kettlebell 16kg Pair", bom_code: "BOM-2601", bom_name: "Kettlebell Display Pack", planned_qty: 10, actual_qty: 9,  material_cost: 5760.00, status: "completed", unit: "units" },
      { id: 99, mo_no: "MO-2508", tx_date: "2026-09-08", finished_item_name: "Bolt Kit 50pc",        bom_code: "BOM-2602", bom_name: "Bolt Kit 50pc",           planned_qty: 25, actual_qty: 25, material_cost: 5250.00, status: "completed", unit: "units" }
    ];

    var CAT_WD_REASONS = [
      { code: "OBSOLESCENCE", name: "Obsolescence / Slow Moving" },
      { code: "DAMAGE",       name: "Physical Damage / Breakage" },
      { code: "EXPIRY",       name: "Expired Product" },
      { code: "SHRINKAGE",    name: "Shrinkage / Theft / Stocktake Loss" },
      { code: "SCRAP",        name: "Scrapped / Waste" }
    ];

    function catItemBySku(sku) {
      for (var i = 0; i < CAT_ITEMS.length; i++) if (CAT_ITEMS[i].sku === sku) return CAT_ITEMS[i];
      return null;
    }
    function catLine(sku, qty, memo) {
      var it = catItemBySku(sku) || {};
      return { id: (it.id || 0) * 10, sku: sku, item_name: it.name || sku, qty: qty, unit_cost: it.cost_price || 0, memo: memo || "" };
    }

    var CAT_TX = [
      { id: 501, tx_date: "2026-10-12", tx_type: "receipt",    status: "posted", ref: "GRN-2601",  posted_journal_id: 1044, notes: "Weekly restock — Bidvest",        vendor_name: "Bidvest Foodservice",  grni_status: "posted", total_amount: 2940.00,  lines: [catLine("MOK-NUT-011", 4, "Restock"), catLine("MOK-NUT-012", 6, "Restock"), catLine("MOK-NUT-013", 10, "Restock")] },
      { id: 502, tx_date: "2026-10-11", tx_type: "receipt",    status: "posted", ref: "GRN-2602",  posted_journal_id: 1044, notes: "Stationery top-up",               vendor_name: "Springs Stationers",   grni_status: "posted", total_amount: 1820.00,  lines: [catLine("MOK-STN-050", 35, "Office supply order")] },
      { id: 503, tx_date: "2026-10-10", tx_type: "sale",       status: "posted", ref: "INV-2612",  posted_journal_id: 1045, notes: "Retail floor — cost of sales",    lines: [catLine("MOK-GYM-003", -2, "Cost of sales"), catLine("MOK-GYM-004", -3, "Cost of sales"), catLine("MOK-ACC-065", -4, "Cost of sales")] },
      { id: 504, tx_date: "2026-10-09", tx_type: "sale",       status: "posted", ref: "INV-2609",  posted_journal_id: 1045, notes: "Online order fulfilment",         lines: [catLine("MOK-NUT-011", -2, "Cost of sales"), catLine("MOK-NUT-014", -1, "Cost of sales"), catLine("MOK-ACC-067", -2, "Cost of sales")] },
      { id: 505, tx_date: "2026-10-08", tx_type: "adjustment", status: "posted", ref: "AD-2610",   posted_journal_id: 1043, notes: "Damaged in display — written off", lines: [catLine("MOK-ACC-066", -1, "Display damage")] },
      { id: 506, tx_date: "2026-10-07", tx_type: "transfer",   status: "posted", ref: "TRF-2601",  posted_journal_id: null, notes: "Front shop to storeroom",          lines: [catLine("MOK-ELN-061", -5, "Front shop → storeroom")] },
      { id: 507, tx_date: "2026-10-06", tx_type: "count",      status: "posted", ref: "STK-2601",  posted_journal_id: 1042, notes: "Cycle count — cleaning aisle",     lines: [catLine("MOK-CLN-020", 1, "Shelf count variance")] },
      { id: 508, tx_date: "2026-10-05", tx_type: "write_down", status: "posted", ref: "WD-2610-01", posted_journal_id: 1042, write_down_reason_code: "DAMAGE", notes: "Leaked bottles — cold room",   lines: [catLine("MOK-CLN-022", -2, "Cold room leakage")] },
      { id: 509, tx_date: "2026-10-03", tx_type: "write_down", status: "posted", ref: "WD-2610-02", posted_journal_id: 1041, write_down_reason_code: "EXPIRY", notes: "Protein bars past best-before", lines: [catLine("MOK-NUT-012", -3, "Best-before expiry")] },
      { id: 510, tx_date: "2026-09-30", tx_type: "receipt",    status: "posted", ref: "GRN-2603",  posted_journal_id: 1040, notes: "Electronics restock — Bidvest",    vendor_name: "Bidvest Foodservice",  grni_status: "posted", total_amount: 3235.00,  lines: [catLine("MOK-ELN-062", 6, "Restock"), catLine("MOK-ELN-063", 3, "Restock"), catLine("MOK-ELN-064", 5, "Restock")] },
      { id: 511, tx_date: "2026-09-26", tx_type: "sale",       status: "posted", ref: "INV-2604",  posted_journal_id: 1039, notes: "Corporate gym fit-out order",      lines: [catLine("MOK-GYM-002", -1, "Cost of sales"), catLine("MOK-GYM-009", -1, "Cost of sales")] },
      { id: 512, tx_date: "2026-09-22", tx_type: "adjustment", status: "posted", ref: "AD-2609",   posted_journal_id: 1038, notes: "Found unboxed — added to stock",   lines: [catLine("MOK-GYM-008", 2, "Unmarked returns")] },
      { id: 513, tx_date: "2026-09-18", tx_type: "receipt",    status: "posted", ref: "GRN-2600",  posted_journal_id: 1037, notes: "Spare parts delivery",             vendor_name: "Gauteng Logistics cc", grni_status: "posted", total_amount: 2850.00,  lines: [catLine("MOK-SPT-040", 3, "Spare parts order")] },
      { id: 514, tx_date: "2026-09-12", tx_type: "write_down", status: "posted", ref: "WD-2609-03", posted_journal_id: 1036, write_down_reason_code: "SHRINKAGE", notes: "Stocktake shrinkage — accessories", lines: [catLine("MOK-ACC-066", -2, "Count variance")] }
    ];
    var CAT_TX_SEQ = 515;
    try { window.__CAT_TX_STORE = window.__CAT_TX_STORE || null; } catch (e) { }
    if (!window.__CAT_TX_STORE) { window.__CAT_TX_STORE = CAT_TX; window.__CAT_TX_SEQ = CAT_TX_SEQ; }

    function catOnHand(itemId) { return CAT_ONHAND[itemId] != null ? CAT_ONHAND[itemId] : 0; }
    function catValuationRows() {
      return CAT_ITEMS.filter(function (it) { return it.track_stock; }).map(function (it) {
        var oh = catOnHand(it.id);
        return { item_id: it.id, sku: it.sku, name: it.name, on_hand: oh, avg_cost: it.cost_price, value: Math.round(oh * it.cost_price * 100) / 100 };
      });
    }
    function catValuationTotal() {
      return catValuationRows().reduce(function (a, r) { return a + r.value; }, 0);
    }

    /* ── cat3 routes (inserted ahead of the generic fallbacks) ── */
    if (cidMatch && (pathname.indexOf("/inventory") !== -1 || pathname.indexOf("/services") !== -1 || pathname.indexOf("/purchase-orders") !== -1 || pathname.indexOf("/manufacturing") !== -1)) {
      /* cat3 guard: any catalog-family path inside /api/companies/:cid */
      var p = pathname.replace(/\/$/, "").replace(new RegExp("^/api/companies/" + cid), "");

      /* ---- inventory: items collection ---- */
      if (p === "/inventory/items" && method === "POST") {
        var nb = {};
        try { nb = JSON.parse(opts.body || "{}"); } catch (e) { }
        var nid = 635 + CAT_ITEMS.filter(function (x) { return x.id >= 635; }).length;
        var nitem = {
          id: nid,
          sku: String(nb.sku || "MOK-NEW-" + nid),
          name: String(nb.name || "New item"),
          category: String(nb.category || "General"),
          barcode: String(nb.barcode || ""),
          sales_price: num(nb.sales_price),
          cost_price: num(nb.cost_price),
          reorder_level: num(nb.reorder_level) || 0,
          track_stock: nb.track_stock !== false,
          active: nb.active !== false,
          valuation_method: String(nb.valuation_method || "FIFO")
        };
        CAT_ITEMS.push(nitem);
        if (nitem.track_stock) { CAT_ONHAND[nitem.id] = num(nb.opening_qty) || 0; }
        return json({ ok: true, id: nid, item: nitem });
      }
      if (p === "/inventory/items/lookup") {
        var bc = query.get("barcode") || "";
        var found = null;
        for (var fi = 0; fi < CAT_ITEMS.length; fi++) if (CAT_ITEMS[fi].barcode === bc) found = CAT_ITEMS[fi];
        if (!found) return json({ ok: false, error: "No item with that barcode" }, 404);
        return json({ ok: true, item: found });
      }
      var mItemOne = p.match(/^\/inventory\/items\/(\d+)$/);
      if (mItemOne) {
        var it1 = null;
        for (var i1 = 0; i1 < CAT_ITEMS.length; i1++) if (CAT_ITEMS[i1].id === Number(mItemOne[1])) it1 = CAT_ITEMS[i1];
        if (!it1) return json({ ok: false, error: "Item not found" }, 404);
        return json(it1);
      }
      if (p === "/inventory/items") {
        var q = (query.get("q") || "").toLowerCase();
        var act = query.get("active");
        var lim = num(query.get("limit")) || 50;
        var off = num(query.get("offset")) || 0;
        var rows = CAT_ITEMS.filter(function (it) {
          if (act === "1" && !it.active) return false;
          if (act === "0" && it.active) return false;
          if (q && (it.sku + " " + it.name + " " + (it.barcode || "")).toLowerCase().indexOf(q) === -1) return false;
          return true;
        });
        return json({ rows: rows.slice(off, off + lim), total: rows.length });
      }

      /* ---- inventory: on-hand snapshot ---- */
      if (p === "/inventory/on_hand") {
        return json({
          as_of: query.get("as_of") || now.toISOString().slice(0, 10),
          items: CAT_ITEMS.filter(function (it) { return it.track_stock; }).map(function (it) {
            return { item_id: it.id, sku: it.sku, name: it.name, on_hand: catOnHand(it.id), avg_cost: it.cost_price, stock_value: Math.round(catOnHand(it.id) * it.cost_price * 100) / 100 };
          })
        });
      }

      /* ---- inventory: reorder alerts ---- */
      if (p === "/inventory/reorder") {
        var only = query.get("only") === "1";
        var rq = (query.get("q") || "").toLowerCase();
        var rrows = CAT_ITEMS.filter(function (it) {
          if (!it.track_stock) return false;
          var need = catOnHand(it.id) <= it.reorder_level;
          if (only && !need) return false;
          if (rq && (it.sku + " " + it.name).toLowerCase().indexOf(rq) === -1) return false;
          return true;
        }).map(function (it) {
          var oh = catOnHand(it.id);
          return { item_id: it.id, sku: it.sku, name: it.name, barcode: it.barcode, on_hand: oh, reorder_level: it.reorder_level, needs_reorder: oh <= it.reorder_level };
        });
        return json({ as_of: query.get("as_of") || now.toISOString().slice(0, 10), items: rrows });
      }

      /* ---- inventory: valuation ---- */
      if (p === "/inventory/valuation") {
        var vrows = catValuationRows();
        return json({ as_of: query.get("as_of") || now.toISOString().slice(0, 10), items: vrows, total_value: Math.round(catValuationTotal() * 100) / 100 });
      }

      /* ---- inventory: write-down reasons (before /write-down POST) ---- */
      if (p === "/inventory/write-downs/reasons") {
        return json(CAT_WD_REASONS);
      }

      /* ---- inventory: post write-down ---- */
      if (p === "/inventory/write-down" && method === "POST") {
        var wd = {};
        try { wd = JSON.parse(opts.body || "{}"); } catch (e) { }
        var wlines = (wd.lines || []).map(function (l, ix) {
          var it2 = null;
          for (var i2 = 0; i2 < CAT_ITEMS.length; i2++) if (CAT_ITEMS[i2].id === Number(l.item_id)) it2 = CAT_ITEMS[i2];
          var qty = num(l.qty) || 0;
          return {
            id: (it2 ? it2.id : 0) * 10 + ix,
            sku: it2 ? it2.sku : "",
            item_name: it2 ? it2.name : "",
            qty: -Math.abs(qty),
            unit_cost: it2 ? it2.cost_price : 0,
            memo: l.memo || null
          };
        });
        var wtx = {
          id: window.__CAT_TX_SEQ++,
          tx_date: String(wd.tx_date || now.toISOString().slice(0, 10)).slice(0, 10),
          tx_type: "write_down",
          status: "posted",
          ref: String(wd.ref || ("WD-" + window.__CAT_TX_SEQ)),
          posted_journal_id: 1030 + (window.__CAT_TX_SEQ % 10),
          write_down_reason_code: String(wd.reason_code || "DAMAGE"),
          notes: wd.notes || null,
          lines: wlines
        };
        window.__CAT_TX_STORE.unshift(wtx);
        return json({ ok: true, id: wtx.id, tx_id: wtx.id });
      }

      /* ---- inventory: receive / adjust ---- */
      if (p === "/inventory/receive" && method === "POST") {
        var rc = {};
        try { rc = JSON.parse(opts.body || "{}"); } catch (e) { }
        var rlines = (rc.lines || []).map(function (l, ix) {
          var it3 = null;
          for (var i3 = 0; i3 < CAT_ITEMS.length; i3++) if (CAT_ITEMS[i3].id === Number(l.item_id)) it3 = CAT_ITEMS[i3];
          return { id: (it3 ? it3.id : 0) * 10 + ix, sku: it3 ? it3.sku : "", item_name: it3 ? it3.name : "", qty: num(l.qty) || 0, unit_cost: num(l.unit_cost) || (it3 ? it3.cost_price : 0), memo: l.memo || null };
        });
        var rtx = { id: window.__CAT_TX_SEQ++, tx_date: String(rc.tx_date || now.toISOString().slice(0, 10)).slice(0, 10), tx_type: "receipt", status: "posted", ref: String(rc.ref || ("GRN-" + window.__CAT_TX_SEQ)), posted_journal_id: null, notes: rc.notes || null, vendor_name: rc.vendor_name || null, grni_status: "pending", total_amount: rlines.reduce(function (a, l) { return a + Math.abs(l.qty) * l.unit_cost; }, 0), lines: rlines };
        window.__CAT_TX_STORE.unshift(rtx);
        return json({ ok: true, id: rtx.id, tx_id: rtx.id });
      }
      if (p === "/inventory/adjust" && method === "POST") {
        var ad = {};
        try { ad = JSON.parse(opts.body || "{}"); } catch (e) { }
        var alines = (ad.lines || []).map(function (l, ix) {
          var it4 = null;
          for (var i4 = 0; i4 < CAT_ITEMS.length; i4++) if (CAT_ITEMS[i4].id === Number(l.item_id)) it4 = CAT_ITEMS[i4];
          return { id: (it4 ? it4.id : 0) * 10 + ix, sku: it4 ? it4.sku : "", item_name: it4 ? it4.name : "", qty: num(l.qty) || 0, unit_cost: num(l.unit_cost) || (it4 ? it4.cost_price : 0), memo: l.memo || null };
        });
        var atx = { id: window.__CAT_TX_SEQ++, tx_date: String(ad.tx_date || now.toISOString().slice(0, 10)).slice(0, 10), tx_type: "adjustment", status: "posted", ref: String(ad.ref || ("AD-" + window.__CAT_TX_SEQ)), posted_journal_id: null, notes: ad.notes || null, lines: alines };
        window.__CAT_TX_STORE.unshift(atx);
        return json({ ok: true, id: atx.id, tx_id: atx.id });
      }

      /* ---- inventory: stocktake session flow ---- */
      if (p === "/inventory/stocktake" && method === "POST") {
        var stb = {};
        try { stb = JSON.parse(opts.body || "{}"); } catch (e) { }
        var sid = 881;
        window.__CAT_STK = { id: sid, as_of: String(stb.as_of || now.toISOString().slice(0, 10)).slice(0, 10), counted: {} };
        return json({ ok: true, id: sid, title: stb.title || "Stocktake", as_of: window.__CAT_STK.as_of });
      }
      var mStkLines = p.match(/^\/inventory\/stocktake\/(\d+)\/lines$/);
      if (mStkLines) {
        if (method === "PUT" || method === "POST") {
          var slb = {};
          try { slb = JSON.parse(opts.body || "{}"); } catch (e) { }
          if (!window.__CAT_STK) window.__CAT_STK = { id: Number(mStkLines[1]), as_of: now.toISOString().slice(0, 10), counted: {} };
          (slb.lines || []).forEach(function (l) { window.__CAT_STK.counted[Number(l.item_id)] = num(l.counted_qty) || 0; });
          return json({ ok: true, saved: (slb.lines || []).length });
        }
        return json({ items: CAT_ITEMS.filter(function (it) { return it.track_stock; }).map(function (it) { return { item_id: it.id, sku: it.sku, name: it.name, on_hand: catOnHand(it.id) }; }) });
      }
      var mStkCmp = p.match(/^\/inventory\/stocktake\/(\d+)\/compare$/);
      if (mStkCmp) {
        var citems = CAT_ITEMS.filter(function (it) { return it.track_stock; }).map(function (it) {
          var sys = catOnHand(it.id);
          var cnt = window.__CAT_STK && window.__CAT_STK.counted[it.id] != null ? window.__CAT_STK.counted[it.id] : sys;
          return { item_id: it.id, sku: it.sku, item_name: it.name, system_on_hand: sys, counted_qty: cnt, variance: Math.round((cnt - sys) * 100) / 100 };
        });
        return json({ as_of: window.__CAT_STK ? window.__CAT_STK.as_of : now.toISOString().slice(0, 10), items: citems });
      }
      var mStkPost = p.match(/^\/inventory\/stocktake\/(\d+)\/post$/);
      if (mStkPost && method === "POST") {
        var ptx = { id: window.__CAT_TX_SEQ++, tx_date: now.toISOString().slice(0, 10), tx_type: "count", status: "posted", ref: "STK-" + window.__CAT_TX_SEQ, posted_journal_id: null, notes: "Stocktake posted from Catalog Studio", lines: [] };
        window.__CAT_TX_STORE.unshift(ptx);
        return json({ ok: true, tx_id: ptx.id });
      }

      /* ---- inventory: tx list + detail ---- */
      var mTxOne = p.match(/^\/inventory\/tx\/(\d+)$/);
      if (mTxOne) {
        var t1 = null;
        var storeArr = window.__CAT_TX_STORE || CAT_TX;
        for (var i5 = 0; i5 < storeArr.length; i5++) if (storeArr[i5].id === Number(mTxOne[1])) t1 = storeArr[i5];
        if (!t1) return json({ ok: false, error: "Movement not found" }, 404);
        return json(t1);
      }
      if (p === "/inventory/tx") {
        var ttype = query.get("tx_type") || "";
        var tfrom = query.get("from") || "";
        var tto = query.get("to") || "";
        var tq = (query.get("q") || "").toLowerCase();
        var tlim = num(query.get("limit")) || 50;
        var toff = num(query.get("offset")) || 0;
        var trows = (window.__CAT_TX_STORE || CAT_TX).filter(function (t) {
          if (ttype && t.tx_type !== ttype) return false;
          if (tfrom && t.tx_date < tfrom) return false;
          if (tto && t.tx_date > tto) return false;
          if (tq && ((t.ref || "") + " " + (t.notes || "") + " " + (t.vendor_name || "")).toLowerCase().indexOf(tq) === -1) return false;
          return true;
        });
        return json({ items: trows.slice(toff, toff + tlim), total: trows.length });
      }

      /* ---- services ---- */
      if (p === "/services/items" && method === "POST") {
        var svb = {};
        try { svb = JSON.parse(opts.body || "{}"); } catch (e) { }
        var dup = null;
        for (var i6 = 0; i6 < CAT_SERVICES.length; i6++) if (CAT_SERVICES[i6].code.toLowerCase() === String(svb.code || "").toLowerCase()) dup = CAT_SERVICES[i6];
        if (dup) return json({ ok: false, error: "That code already exists. Use a new code." }, 409);
        var nsvc = { id: 77 + CAT_SERVICES.length, code: String(svb.code || "SVC-NEW"), name: String(svb.name || "New service"), description: String(svb.description || ""), unit: String(svb.unit || "service"), price: num(svb.price) || 0, vat_code: String(svb.vat_code || "STANDARD"), is_taxable: svb.is_taxable !== false, is_active: true };
        CAT_SERVICES.push(nsvc);
        return json(nsvc);
      }
      if (p === "/services/items") {
        var sq = (query.get("q") || "").toLowerCase();
        var sact = query.get("active");
        var srows = CAT_SERVICES.filter(function (s) {
          if (sact === "1" && !s.is_active) return false;
          if (sact === "0" && s.is_active) return false;
          if (sq && (s.code + " " + s.name).toLowerCase().indexOf(sq) === -1) return false;
          return true;
        });
        return json(srows);
      }
      var mSvcOne = p.match(/^\/services\/items\/(\d+)$/);
      if (mSvcOne) {
        var s1 = null, s1ix = -1;
        for (var i7 = 0; i7 < CAT_SERVICES.length; i7++) if (CAT_SERVICES[i7].id === Number(mSvcOne[1])) { s1 = CAT_SERVICES[i7]; s1ix = i7; }
        if (!s1) return json({ ok: false, error: "Service not found" }, 404);
        if (method === "PATCH") {
          var upb = {};
          try { upb = JSON.parse(opts.body || "{}"); } catch (e) { }
          ["code", "name", "description", "unit", "vat_code"].forEach(function (k) { if (upb[k] != null) s1[k] = String(upb[k]); });
          if (upb.price != null) s1.price = num(upb.price) || 0;
          if (upb.is_taxable != null) s1.is_taxable = !!upb.is_taxable;
          if (upb.is_active != null) s1.is_active = !!upb.is_active;
          return json(s1);
        }
        if (method === "DELETE") {
          CAT_SERVICES.splice(s1ix, 1);
          return json({ ok: true });
        }
        return json(s1);
      }

      /* ---- purchase orders ---- */
      var mPoOne = p.match(/^\/purchase-orders\/(\d+)$/);
      if (mPoOne) {
        var po1 = null;
        for (var i8 = 0; i8 < CAT_POS.length; i8++) if (CAT_POS[i8].id === Number(mPoOne[1])) po1 = CAT_POS[i8];
        if (!po1) return json({ ok: false, error: "PO not found" }, 404);
        var poLines = po1.status === "draft" ? [] : [
          { line_no: 1, description: "Stock replenishment — agreed supply", qty: 10, unit_price: Math.round((po1.total_amount / 10) * 100) / 100, line_total: po1.total_amount }
        ];
        return json({ po: po1, lines: poLines });
      }
      if (p === "/purchase-orders") {
        var pq = (query.get("q") || "").toLowerCase();
        var ps = query.get("status") || "";
        var prows = CAT_POS.filter(function (po) {
          if (ps && po.status !== ps) return false;
          if (pq && (po.po_no + " " + po.vendor_name).toLowerCase().indexOf(pq) === -1) return false;
          return true;
        });
        return json({ items: prows, total: prows.length });
      }

      /* ══════════════════════════════════════════════════════════════
         cat3b — MANUFACTURING DEEP DATA + ENDPOINTS (Task 17)
         Fills the JS-rendered BOM / production-order surfaces with a
         fully reconciled dataset:
           · BOM-2601 batch 10 × full standard cost 640.00 = 6,400.00
             (sell 1,099.00 → contribution 459.00 · 41.8% — unchanged)
           · BOM-2602 batch 25 × 210.00 = 5,250.00 (349.50 → 139.50)
           · BOM-2603 batch 8 × 610.00 = 4,880.00 (899.00 → 289.00)
           · MO-2601 completed 10/10 · MO-2602 in_progress 14/20
             (progressive + stage timers) · MO-2603 draft ·
             MO-2604 released 4/10 (NEW row — richer status mix)
           · History anchors unchanged: 6,400 / 5,760 / 5,250.
         All state persists on window.__CAT3B across requests.
         Handles every /manufacturing/* route BEFORE the cat3 one-liners
         (those stay as harmless fallbacks for nothing).
      ══════════════════════════════════════════════════════════════ */
      if (p === "/manufacturing/boms" || p === "/manufacturing/orders" || p === "/manufacturing/history" || p === "/manufacturing/production-catalog" || p.indexOf("/manufacturing/") === 0) {
        if (!window.__CAT3B) {
          var __b1 = {
            id: 91, bom_code: "BOM-2601", name: "Kettlebell Display Pack", item_name: "Kettlebell 16kg Pair", finished_item_name: "Kettlebell 16kg Pair",
            batch_qty: 10, batch_unit: "packs", selling_price: 1099.00, cost_per_unit: 640.00, status: "active", yield_percent: 100, version_no: 1,
            description: "Retail display pack: one 16kg kettlebell with towel, shaker and printed care insert in a branded carton.",
            lines: [
              { item_id: 603, quantity: 10, unit: "units", unit_cost: 420.00, scrap_percent: 0 },
              { item_id: 633, quantity: 10, unit: "units", unit_cost: 55.00, scrap_percent: 0 },
              { item_id: 634, quantity: 10, unit: "units", unit_cost: 38.00, scrap_percent: 0 },
              { item_id: 620, quantity: 10, unit: "units", unit_cost: 18.50, scrap_percent: 0 },
              { item_id: 616, quantity: 10, unit: "units", unit_cost: 25.00, scrap_percent: 0 }
            ],
            labour: [{ employee_id: 903, worker_name: "Sipho Ndlovu", role: "Assembly & packing", hours: 12, rate: 30.00 }],
            direct_costs: [
              { description: "Printed insert & label set", cost_type: "Packaging", amount: 95.00 },
              { description: "Batch quality check", cost_type: "Quality Control", amount: 80.00 }
            ],
            overheads: [{ allocation_name: "Assembly bench & workshop allocation", basis: "Per pack", quantity: 10, rate: 25.00 }],
            utilities: [{ method: "elec-direct", description: "Factory power — assembly session", quantity: 20, rate: 2.50 }]
          };
          var __b2 = {
            id: 92, bom_code: "BOM-2602", name: "Bolt Kit 50pc", item_name: "Bolt Kit 50pc", finished_item_name: "Bolt Kit 50pc",
            batch_qty: 25, batch_unit: "kits", selling_price: 349.50, cost_per_unit: 210.00, status: "active", yield_percent: 100, version_no: 1,
            description: "Counted spare-part kit: bearing set with carton, counted and QC'd per batch of 25 kits.",
            lines: [
              { item_id: 624, quantity: 25, unit: "units", unit_cost: 185.00, scrap_percent: 0 },
              { item_id: 620, quantity: 25, unit: "units", unit_cost: 18.50, scrap_percent: 0 }
            ],
            labour: [
              { employee_id: 903, worker_name: "Sipho Ndlovu", role: "Kit assembly", hours: 3, rate: 30.00 }
            ],
            direct_costs: [{ description: "Component counting & QC", cost_type: "Quality Control", amount: 40.00 }],
            overheads: [{ allocation_name: "Workshop workbench allocation", basis: "Per kit", quantity: 25, rate: 1.00 }],
            utilities: [{ method: "elec-direct", description: "Factory power — kitting session", quantity: 3, rate: 2.50 }]
          };
          var __b3 = {
            id: 93, bom_code: "BOM-2603", name: "Braai Stand Pack", item_name: "Braai Stand", finished_item_name: "Braai Stand",
            batch_qty: 8, batch_unit: "units", selling_price: 899.00, cost_per_unit: 610.00, status: "draft", yield_percent: 100, version_no: 1,
            description: "Welded steel braai stand, powder-coated, boxed with bubble wrap. Draft — pending first production run.",
            lines: [
              { item_id: null, name: "Steel sheet 2mm (1.2 × 2.4m)", quantity: 8, unit: "sheets", unit_cost: 350.00, scrap_percent: 0 },
              { item_id: null, name: "Hinge & fastener kit", quantity: 8, unit: "units", unit_cost: 45.00, scrap_percent: 0 },
              { item_id: 620, quantity: 8, unit: "units", unit_cost: 18.50, scrap_percent: 0 },
              { item_id: 619, quantity: 2, unit: "rolls", unit_cost: 210.00, scrap_percent: 0 }
            ],
            labour: [
              { employee_id: 903, worker_name: "Sipho Ndlovu", role: "Welding & assembly", hours: 8, rate: 30.00 },
              { employee_id: 904, worker_name: "Mary-Ann Jacobs", role: "Finishing & packing", hours: 6, rate: 20.00 }
            ],
            direct_costs: [
              { description: "Powder coating & paint", cost_type: "Finishing", amount: 250.00 },
              { description: "Grinding discs & wire cups", cost_type: "Consumables", amount: 102.00 }
            ],
            overheads: [{ allocation_name: "Welding station allocation", basis: "Per stand", quantity: 8, rate: 42.50 }],
            utilities: [{ method: "elec-direct", description: "Factory power — welding", quantity: 40, rate: 2.50 }]
          };
          function __bomCostSummary(b) {
            var mat = 0, i, l;
            for (i = 0; i < b.lines.length; i++) { l = b.lines[i]; mat += (Number(l.quantity) || 0) * (1 + (Number(l.scrap_percent) || 0) / 100) * (Number(l.unit_cost) || 0); }
            var lab = 0; for (i = 0; i < b.labour.length; i++) lab += (Number(b.labour[i].hours) || 0) * (Number(b.labour[i].rate) || 0);
            var dc = 0; for (i = 0; i < b.direct_costs.length; i++) dc += Number(b.direct_costs[i].amount) || 0;
            var ov = 0; for (i = 0; i < b.overheads.length; i++) ov += (Number(b.overheads[i].quantity) || 0) * (Number(b.overheads[i].rate) || 0);
            var ut = 0; for (i = 0; i < b.utilities.length; i++) { var u = b.utilities[i]; ut += (Number(u.quantity) || 0) * (Number(u.rate) || 0); }
            var total = Math.round((mat + lab + dc + ov + ut) * 100) / 100;
            var unit = Math.round((total / (Number(b.batch_qty) || 1)) * 100) / 100;
            b.cost_per_unit = unit;
            b.cost_summary = { total: total, unit_cost: unit, selling_price: Number(b.selling_price) || 0, margin_per_unit: Math.round(((Number(b.selling_price) || 0) - unit) * 100) / 100 };
            return b;
          }
          __bomCostSummary(__b1); __bomCostSummary(__b2); __bomCostSummary(__b3);

          var __o1 = {
            id: 95, mo_no: "MO-2601", tx_date: "2026-10-08", finished_item_name: "Kettlebell 16kg Pair", planned_qty: 10, actual_qty: 10,
            status: "completed", bom_id: 91, bom_code: "BOM-2601", bom_name: "Kettlebell Display Pack", bom_selling_price: 1099.00,
            unit: "packs", material_cost: 6400.00, production_tracking_method: "batch",
            planned_start_date: "2026-10-08", planned_finish_date: "2026-10-08", planned_start_time: "08:00", planned_finish_time: "17:00",
            location: "Main Workshop", notes: "October display-pack build for the retail floor.",
            materials: [
              { material_id: 603, item_name: "Kettlebell 16kg", planned_qty: 10, actual_qty: 10, unit: "units", unit_cost: 420.00, total_cost: 4200.00 },
              { material_id: 633, item_name: "Gym Towel", planned_qty: 10, actual_qty: 10, unit: "units", unit_cost: 55.00, total_cost: 550.00 },
              { material_id: 634, item_name: "Shaker Bottle 700ml", planned_qty: 10, actual_qty: 10, unit: "units", unit_cost: 38.00, total_cost: 380.00 },
              { material_id: 620, item_name: "Carton Box Medium", planned_qty: 10, actual_qty: 10, unit: "units", unit_cost: 18.50, total_cost: 185.00 },
              { material_id: 616, item_name: "Microfibre Cloth Pack", planned_qty: 10, actual_qty: 10, unit: "units", unit_cost: 25.00, total_cost: 250.00 }
            ],
            production_progress: [{ tx_date: "2026-10-08", quantity: 10, notes: "Full batch completed in one session." }],
            management_costs: {
              labour: [{ id: 951, worker_name: "Sipho Ndlovu", role: "Assembly & packing", hours: 12, rate: 30.00, labour_cost: 360.00 }],
              direct_costs: [
                { id: 952, description: "Printed insert & label set", cost_type: "Packaging", amount: 95.00 },
                { id: 953, description: "Batch quality check", cost_type: "Quality Control", amount: 80.00 }
              ],
              overhead: [{ id: 954, allocation_name: "Assembly bench & workshop allocation", basis: "Per pack", quantity: 10, rate: 25.00, allocated_amount: 250.00 }]
            },
            dispatches: [
              { id: 1, channel: "retail_sales", destination: "Retail Floor — Mokoko Gym", quantity: 4, received_by: "Lerato Dlamini", reference_no: "STG-2610-0114", tx_date: "2026-10-09" },
              { id: 2, channel: "customer_delivery", destination: "Virgin Active Sandton — corporate order", quantity: 2, received_by: "Sipho Ndlovu", reference_no: "DSP-2610-0107", tx_date: "2026-10-10" }
            ],
            dispatch_summary: { total_dispatched: 6, available_to_dispatch: 4 },
            utilities_cost: 50,
            production_summary: {
              planned_output: 10, selling_price: 1099.00, production_value: 10990.00,
              material_cost: 5565.00, labour_cost: 360.00, other_direct_costs: 175.00, total_direct_cost: 6100.00,
              manufacturing_overhead: 250.00, full_production_cost: 6400.00,
              contribution: 4590.00, contribution_margin: 41.8,
              unit_direct_cost: 610.00, unit_full_production_cost: 640.00, unit_contribution: 459.00,
              unit_full_production_margin: 459.00, full_production_margin: 4590.00, full_production_margin_percent: 41.8
            },
            eod_reconciliation: null
          };
          var __o2 = {
            id: 96, mo_no: "MO-2602", tx_date: "2026-10-11", finished_item_name: "Bolt Kit 50pc", planned_qty: 20, actual_qty: 14,
            status: "in_progress", bom_id: 92, bom_code: "BOM-2602", bom_name: "Bolt Kit 50pc", bom_selling_price: 349.50,
            unit: "kits", material_cost: 2940.00, production_tracking_method: "progressive",
            planned_start_date: "2026-10-11", planned_finish_date: "2026-10-13", planned_start_time: "08:00", planned_finish_time: "17:00",
            location: "Main Workshop — Bay 2", notes: "Multi-day progressive run for the Springs Stationers spare-part order.",
            materials: [
              { material_id: 624, item_name: "Bearing Kit", planned_qty: 20, actual_qty: 14, unit: "units", unit_cost: 185.00, total_cost: 2590.00 },
              { material_id: 620, item_name: "Carton Box Medium", planned_qty: 20, actual_qty: 14, unit: "units", unit_cost: 18.50, total_cost: 259.00 }
            ],
            production_progress: [
              { tx_date: "2026-10-11", quantity: 8, notes: "First run — morning shift." },
              { tx_date: "2026-10-12", quantity: 6, notes: "Second run — afternoon shift." }
            ],
            management_costs: {
              labour: [
                { id: 961, worker_name: "Sipho Ndlovu", role: "Kit assembly", hours: 2, rate: 30.00, labour_cost: 60.00 },
                { id: 962, worker_name: "Mary-Ann Jacobs", role: "Counting & QC", hours: 2, rate: 20.00, labour_cost: 40.00 }
              ],
              direct_costs: [{ id: 963, description: "Component counting & QC", cost_type: "Quality Control", amount: 40.00 }],
              overhead: [{ id: 964, allocation_name: "Workshop workbench allocation", basis: "Per kit", quantity: 20, rate: 1.00, allocated_amount: 20.00 }]
            },
            dispatches: [], dispatch_summary: { total_dispatched: 0, available_to_dispatch: 0 },
            utilities_cost: 10,
            production_summary: {
              planned_output: 20, selling_price: 349.50, production_value: 4893.00,
              material_cost: 2849.00, labour_cost: 100.00, other_direct_costs: 40.00, total_direct_cost: 2989.00,
              manufacturing_overhead: 20.00, full_production_cost: 3019.00,
              contribution: 1874.00, contribution_margin: 38.3,
              unit_direct_cost: 213.50, unit_full_production_cost: 215.64, unit_contribution: 133.86,
              unit_full_production_margin: 133.86, full_production_margin: 1874.00, full_production_margin_percent: 38.3
            },
            eod_reconciliation: null
          };
          var __o3 = {
            id: 97, mo_no: "MO-2603", tx_date: "2026-10-13", finished_item_name: "Braai Stand", planned_qty: 8, actual_qty: 0,
            status: "draft", bom_id: 93, bom_code: "BOM-2603", bom_name: "Braai Stand Pack", bom_selling_price: 899.00,
            unit: "units", material_cost: 0, production_tracking_method: "batch",
            planned_start_date: "2026-10-15", planned_finish_date: "2026-10-15", planned_start_time: "08:00", planned_finish_time: "17:00",
            location: "Main Workshop", notes: "Awaiting steel delivery — release once sheet stock lands.",
            materials: [
              { material_id: 9001, item_name: "Steel sheet 2mm (1.2 × 2.4m)", planned_qty: 8, actual_qty: 0, unit: "sheets", unit_cost: 350.00, total_cost: 0 },
              { material_id: 9002, item_name: "Hinge & fastener kit", planned_qty: 8, actual_qty: 0, unit: "units", unit_cost: 45.00, total_cost: 0 },
              { material_id: 620, item_name: "Carton Box Medium", planned_qty: 8, actual_qty: 0, unit: "units", unit_cost: 18.50, total_cost: 0 },
              { material_id: 619, item_name: "Bubble Wrap 100m", planned_qty: 2, actual_qty: 0, unit: "rolls", unit_cost: 210.00, total_cost: 0 }
            ],
            production_progress: [], management_costs: { labour: [], direct_costs: [], overhead: [] },
            dispatches: [], dispatch_summary: { total_dispatched: 0, available_to_dispatch: 0 },
            utilities_cost: 100,
            production_summary: {
              planned_output: 8, selling_price: 899.00, production_value: 0,
              material_cost: 0, labour_cost: 0, other_direct_costs: 0, total_direct_cost: 0,
              manufacturing_overhead: 0, full_production_cost: 0,
              contribution: 0, contribution_margin: 0,
              unit_direct_cost: 0, unit_full_production_cost: 0, unit_contribution: 0,
              unit_full_production_margin: 0, full_production_margin: 0, full_production_margin_percent: 0
            },
            eod_reconciliation: null
          };
          var __o4 = {
            id: 100, mo_no: "MO-2604", tx_date: "2026-10-14", finished_item_name: "Kettlebell 16kg Pair", planned_qty: 10, actual_qty: 4,
            status: "released", bom_id: 91, bom_code: "BOM-2601", bom_name: "Kettlebell Display Pack", bom_selling_price: 1099.00,
            unit: "packs", material_cost: 2560.00, production_tracking_method: "batch",
            planned_start_date: "2026-10-14", planned_finish_date: "2026-10-15", planned_start_time: "08:00", planned_finish_time: "17:00",
            location: "Main Workshop — Bay 1", notes: "Restock run for retail floor after strong October sales.",
            materials: [
              { material_id: 603, item_name: "Kettlebell 16kg", planned_qty: 10, actual_qty: 4, unit: "units", unit_cost: 420.00, total_cost: 1680.00 },
              { material_id: 633, item_name: "Gym Towel", planned_qty: 10, actual_qty: 4, unit: "units", unit_cost: 55.00, total_cost: 220.00 },
              { material_id: 634, item_name: "Shaker Bottle 700ml", planned_qty: 10, actual_qty: 4, unit: "units", unit_cost: 38.00, total_cost: 152.00 },
              { material_id: 620, item_name: "Carton Box Medium", planned_qty: 10, actual_qty: 4, unit: "units", unit_cost: 18.50, total_cost: 74.00 },
              { material_id: 616, item_name: "Microfibre Cloth Pack", planned_qty: 10, actual_qty: 4, unit: "units", unit_cost: 25.00, total_cost: 100.00 }
            ],
            production_progress: [{ tx_date: "2026-10-14", quantity: 4, notes: "Day 1 run — bench 1." }],
            management_costs: {
              labour: [{ id: 1001, worker_name: "Sipho Ndlovu", role: "Assembly & packing", hours: 3, rate: 30.00, labour_cost: 90.00 }],
              direct_costs: [{ id: 1002, description: "Batch quality check (partial)", cost_type: "Quality Control", amount: 70.00 }],
              overhead: [{ id: 1003, allocation_name: "Assembly bench & workshop allocation", basis: "Per pack", quantity: 4, rate: 25.00, allocated_amount: 100.00 }]
            },
            dispatches: [], dispatch_summary: { total_dispatched: 0, available_to_dispatch: 0 },
            utilities_cost: 20,
            production_summary: {
              planned_output: 10, selling_price: 1099.00, production_value: 4396.00,
              material_cost: 2226.00, labour_cost: 90.00, other_direct_costs: 70.00, total_direct_cost: 2386.00,
              manufacturing_overhead: 100.00, full_production_cost: 2506.00,
              contribution: 1890.00, contribution_margin: 43.0,
              unit_direct_cost: 596.50, unit_full_production_cost: 626.50, unit_contribution: 472.50,
              unit_full_production_margin: 472.50, full_production_margin: 1890.00, full_production_margin_percent: 43.0
            },
            eod_reconciliation: null
          };
          window.__CAT3B = {
            boms: [__b1, __b2, __b3],
            orders: [__o1, __o2, __o3, __o4],
            history: [
              { id: 95, mo_no: "MO-2601", tx_date: "2026-10-08", finished_item_name: "Kettlebell 16kg Pair", bom_code: "BOM-2601", bom_name: "Kettlebell Display Pack", planned_qty: 10, actual_qty: 10, material_cost: 6400.00, status: "completed", unit: "units" },
              { id: 98, mo_no: "MO-2509", tx_date: "2026-09-15", finished_item_name: "Kettlebell 16kg Pair", bom_code: "BOM-2601", bom_name: "Kettlebell Display Pack", planned_qty: 10, actual_qty: 9, material_cost: 5760.00, status: "completed", unit: "units" },
              { id: 99, mo_no: "MO-2508", tx_date: "2026-09-08", finished_item_name: "Bolt Kit 50pc", bom_code: "BOM-2602", bom_name: "Bolt Kit 50pc", planned_qty: 25, actual_qty: 25, material_cost: 5250.00, status: "completed", unit: "units" }
            ],
            products: [
              { id: 1, industry: "Fitness Equipment", category: "Display Packs", product_name: "Kettlebell Display Pack", product_uom: "pack", formula_type: "absolute", default_yield_percent: 100, formula_meta: { ingredients: [{ key: "kettlebell_16kg", name: "Kettlebell 16kg", qty_per_unit: 1, unit: "units" }, { key: "gym_towel", name: "Gym Towel", qty_per_unit: 1, unit: "units" }, { key: "shaker_bottle", name: "Shaker Bottle 700ml", qty_per_unit: 1, unit: "units" }, { key: "carton_box", name: "Carton Box Medium", qty_per_unit: 1, unit: "units" }, { key: "microfibre_cloth", name: "Microfibre Cloth Pack", qty_per_unit: 1, unit: "units" }], batch_tiers: [{ batch_qty: 1, label: "1 pack" }, { batch_qty: 10, label: "10 packs" }, { batch_qty: 25, label: "25 packs" }, { batch_qty: 50, label: "50 packs" }] } },
              { id: 2, industry: "Fitness Equipment", category: "Spare Part Kits", product_name: "Bolt Kit 50pc", product_uom: "kit", formula_type: "absolute", default_yield_percent: 100, formula_meta: { ingredients: [{ key: "bearing_kit", name: "Bearing Kit", qty_per_unit: 1, unit: "units" }, { key: "carton_box", name: "Carton Box Medium", qty_per_unit: 1, unit: "units" }], batch_tiers: [{ batch_qty: 1, label: "1 kit" }, { batch_qty: 10, label: "10 kits" }, { batch_qty: 25, label: "25 kits" }, { batch_qty: 50, label: "50 kits" }] } },
              { id: 3, industry: "Outdoor", category: "Braai Stands", product_name: "Braai Stand", product_uom: "unit", formula_type: "absolute", default_yield_percent: 100, formula_meta: { ingredients: [{ key: "steel_sheet", name: "Steel sheet 2mm", qty_per_unit: 1, unit: "sheets" }, { key: "hinge_kit", name: "Hinge & fastener kit", qty_per_unit: 1, unit: "units" }, { key: "carton_box", name: "Carton Box Medium", qty_per_unit: 1, unit: "units" }, { key: "bubble_wrap", name: "Bubble Wrap 100m", qty_per_unit: 0.25, unit: "rolls" }], batch_tiers: [{ batch_qty: 1, label: "1 unit" }, { batch_qty: 8, label: "8 units" }, { batch_qty: 25, label: "25 units" }] } }
            ],
            standards: {
              91: [{ id: 1, stage_name: "Kitting", stage_code: "KITTING", sequence_no: 1, standard_minutes: 45, equipment_name: "Bench 1" }, { id: 2, stage_name: "Assembly", stage_code: "ASSEMBLY", sequence_no: 2, standard_minutes: 60, equipment_name: "Bay 2" }, { id: 3, stage_name: "Packing", stage_code: "PACKING", sequence_no: 3, standard_minutes: 45, equipment_name: "Packing line" }],
              92: [{ id: 4, stage_name: "Kitting", stage_code: "KITTING", sequence_no: 1, standard_minutes: 30, equipment_name: "Bench 1" }, { id: 5, stage_name: "Assembly", stage_code: "ASSEMBLY", sequence_no: 2, standard_minutes: 40, equipment_name: "Bay 2" }, { id: 6, stage_name: "Packing", stage_code: "PACKING", sequence_no: 3, standard_minutes: 30, equipment_name: "Packing line" }],
              93: [{ id: 7, stage_name: "Cutting", stage_code: "CUTTING", sequence_no: 1, standard_minutes: 60, equipment_name: "Cut bench" }, { id: 8, stage_name: "Welding", stage_code: "WELDING", sequence_no: 2, standard_minutes: 120, equipment_name: "Welding station" }, { id: 9, stage_name: "Finishing", stage_code: "FINISHING", sequence_no: 3, standard_minutes: 45, equipment_name: "Spray booth" }]
            },
            stages: {
              96: [
                { id: 1, stage_name: "Kitting", stage_code: "KITTING", status: "completed", elapsed_seconds: 5100, standard_minutes: 45, operator_name: "Sipho Ndlovu", equipment_name: "Bench 1", notes: "Kitting completed on schedule." },
                { id: 2, stage_name: "Assembly", stage_code: "ASSEMBLY", status: "running", elapsed_seconds: 1800, standard_minutes: 60, operator_name: "Sipho Ndlovu", equipment_name: "Bay 2", notes: "" },
                { id: 3, stage_name: "Packing", stage_code: "PACKING", status: "pending", elapsed_seconds: 0, standard_minutes: 45, operator_name: "", equipment_name: "Packing line", notes: "" }
              ]
            },
            seq: { bom: 94, order: 101, mo: 4, std: 10, stage: 10, line: 2000, dispatch: 3, ref: { ISS: 115, TRF: 42, STG: 115, DSP: 108 } }
          };
          try { window.__CAT3B_STORE = window.__CAT3B; } catch (e) { }
        }
        var B3 = window.__CAT3B;
        function b3item(id) { for (var i = 0; i < CAT_ITEMS.length; i++) if (CAT_ITEMS[i].id === Number(id)) return CAT_ITEMS[i]; return null; }
        function b3bom(id) { for (var i = 0; i < B3.boms.length; i++) if (B3.boms[i].id === Number(id)) return B3.boms[i]; return null; }
        function b3order(id) { for (var i = 0; i < B3.orders.length; i++) if (B3.orders[i].id === Number(id)) return B3.orders[i]; return null; }
        /* enrich seeded BOM lines with item_name/sku (review panel display) */
        B3.boms.forEach(function (b) { b.lines.forEach(function (L) { if (L.item_id && !L.item_name) { var it2 = b3item(L.item_id); if (it2) { L.item_name = it2.name; L.sku = it2.sku; } } }); });
        /* enrich order materials: `id` (usage modal keys on m.id) + item_sku display */
        B3.orders.forEach(function (o) { o.materials.forEach(function (m) { if (m.id == null) m.id = m.material_id; if (m.item_sku == null) { var it3 = b3item(m.material_id); if (it3) m.item_sku = it3.sku; } }); });
        function b3recalcSummary(o) {
          var mat = 0, i;
          for (i = 0; i < o.materials.length; i++) { var m = o.materials[i]; m.total_cost = Math.round((Number(m.actual_qty) || 0) * (Number(m.unit_cost) || 0) * 100) / 100; mat += m.total_cost; }
          var mc = o.management_costs || (o.management_costs = { labour: [], direct_costs: [], overhead: [] });
          var lab = 0; for (i = 0; i < mc.labour.length; i++) { var L = mc.labour[i]; L.labour_cost = Math.round((Number(L.hours) || 0) * (Number(L.rate) || 0) * 100) / 100; lab += L.labour_cost; }
          var dir = 0; for (i = 0; i < mc.direct_costs.length; i++) dir += Number(mc.direct_costs[i].amount) || 0;
          var ov = 0; for (i = 0; i < mc.overhead.length; i++) { var O = mc.overhead[i]; O.allocated_amount = Math.round((Number(O.quantity) || 0) * (Number(O.rate) || 0) * 100) / 100; ov += O.allocated_amount; }
          var s = o.production_summary || (o.production_summary = {});
          var totalDirect = Math.round((mat + lab + dir) * 100) / 100;
          var full = Math.round((totalDirect + ov + (Number(o.utilities_cost) || 0)) * 100) / 100;
          var sell = Number(o.bom_selling_price) || 0;
          var val = Math.round((Number(o.actual_qty) || 0) * sell * 100) / 100;
          var contrib = Math.round((val - full) * 100) / 100;
          s.material_cost = Math.round(mat * 100) / 100; s.labour_cost = lab; s.other_direct_costs = dir; s.total_direct_cost = totalDirect;
          s.manufacturing_overhead = ov; s.full_production_cost = full; s.production_value = val; s.selling_price = sell;
          s.contribution = contrib; s.contribution_margin = val > 0 ? Math.round(contrib / val * 1000) / 10 : 0;
          var q = Number(o.actual_qty) || 0;
          s.unit_direct_cost = q > 0 ? Math.round(totalDirect / q * 100) / 100 : 0;
          s.unit_full_production_cost = q > 0 ? Math.round(full / q * 100) / 100 : 0;
          s.unit_contribution = q > 0 ? Math.round((sell - full / q) * 100) / 100 : 0;
          s.unit_full_production_margin = s.unit_contribution; s.full_production_margin = contrib; s.full_production_margin_percent = s.contribution_margin;
          o.material_cost = Math.round((Number(o.actual_qty) || 0) * (function () { var b = b3bom(o.bom_id); return b ? Number(b.cost_per_unit) || 0 : 0; })() * 100) / 100;
        }
        function b3matsFromBom(bom, plannedQty, withActual) {
          var out = [], i;
          var eff = (Number(bom.batch_qty) || 1) * ((Number(bom.yield_percent) || 100) / 100);
          var factor = eff > 0 ? (Number(plannedQty) || 0) / eff : 0;
          for (i = 0; i < bom.lines.length; i++) {
            var L = bom.lines[i];
            var it = L.item_id ? b3item(L.item_id) : null;
            var pq = Math.round((Number(L.quantity) || 0) * factor * 10000) / 10000;
            out.push({
              id: L.item_id || (B3.seq.line + 9000 + i),
              material_id: L.item_id || (B3.seq.line + 9000 + i),
              item_name: it ? it.name : (L.name || "Component"),
              item_sku: it ? it.sku : null,
              planned_qty: pq, actual_qty: withActual ? pq : 0,
              unit: L.unit || (it ? (it.unit || "units") : "units"),
              unit_cost: Number(L.unit_cost) || 0,
              total_cost: withActual ? Math.round(pq * (Number(L.unit_cost) || 0) * 100) / 100 : 0
            });
          }
          return out;
        }

        /* ---- BOM collection & detail ---- */
        if (p === "/manufacturing/boms" && method === "GET") return json({ boms: B3.boms });
        if (p === "/manufacturing/boms" && method === "POST") {
          var nb3 = {}; try { nb3 = JSON.parse(opts.body || "{}"); } catch (e) { }
          var nb = {
            id: ++B3.seq.bom, bom_code: String(nb3.bom_code || ("BOM-26" + B3.seq.bom)), name: String(nb3.name || "New BOM"),
            finished_item_name: String(nb3.finished_item_name || ""), item_name: String(nb3.finished_item_name || ""),
            batch_qty: Number(nb3.batch_qty) || 1, batch_unit: String(nb3.batch_unit || "units"),
            selling_price: Number(nb3.selling_price) || 0, status: "active", yield_percent: Number(nb3.yield_percent) || 100,
            version_no: 1, description: nb3.description || "",
            lines: [], labour: nb3.labour || [], direct_costs: nb3.direct_costs || [], overheads: nb3.overheads || [], utilities: nb3.utilities || []
          };
          (nb3.lines || []).forEach(function (L) {
            var it = L.item_id ? b3item(L.item_id) : null;
            nb.lines.push({ item_id: L.item_id || null, name: it ? it.name : (L.name || null), item_name: it ? it.name : (L.name || null), sku: it ? it.sku : null, quantity: Number(L.quantity) || 0, unit: L.unit || (it ? (it.unit || "units") : "units"), unit_cost: Number(L.unit_cost) || (it ? Number(it.sales_price) || 0 : 0), scrap_percent: Number(L.scrap_percent) || 0 });
          });
          __bomCostSummary(nb);
          B3.boms.push(nb);
          return json({ ok: true, bom: nb, id: nb.id });
        }
        var mB3bom = p.match(/^\/manufacturing\/boms\/(\d+)$/);
        if (mB3bom) {
          var b3b = b3bom(mB3bom[1]);
          if (!b3b) return json({ ok: false, error: "BOM not found" }, 404);
          if (method === "GET") return json({ ok: true, bom: b3b });
          if (method === "PATCH" || method === "PUT") {
            var up3 = {}; try { up3 = JSON.parse(opts.body || "{}"); } catch (e) { }
            ["name", "finished_item_name", "batch_unit", "description"].forEach(function (k) { if (up3[k] != null) b3b[k] = String(up3[k]); if (k === "finished_item_name") b3b.item_name = String(up3[k]); });
            ["selling_price", "batch_qty", "yield_percent"].forEach(function (k) { if (up3[k] != null) b3b[k] = Number(up3[k]); });
            if (up3.lines) {
              b3b.lines = [];
              up3.lines.forEach(function (L) {
                var it = L.item_id ? b3item(L.item_id) : null;
                b3b.lines.push({ item_id: L.item_id || null, name: it ? it.name : (L.name || null), item_name: it ? it.name : (L.name || null), sku: it ? it.sku : null, quantity: Number(L.quantity) || 0, unit: L.unit || (it ? (it.unit || "units") : "units"), unit_cost: Number(L.unit_cost) || (it ? Number(it.sales_price) || 0 : 0), scrap_percent: Number(L.scrap_percent) || 0 });
              });
            }
            ["labour", "direct_costs", "overheads", "utilities"].forEach(function (k) { if (up3[k]) b3b[k] = up3[k]; });
            __bomCostSummary(b3b);
            return json({ ok: true, bom: b3b });
          }
        }

        /* ---- production catalog ---- */
        if (p === "/manufacturing/production-catalog" && method === "GET") {
          var inds3 = [];
          B3.products.forEach(function (x) { if (inds3.indexOf(x.industry) === -1) inds3.push(x.industry); });
          inds3.sort();
          return json({ ok: true, products: B3.products, industries: inds3 });
        }
        if (p === "/manufacturing/production-catalog" && method === "POST") {
          var np3 = {}; try { np3 = JSON.parse(opts.body || "{}"); } catch (e) { }
          var dup = null;
          for (var di = 0; di < B3.products.length; di++) {
            var dp = B3.products[di];
            if (String(dp.industry).toLowerCase() === String(np3.industry || "").toLowerCase() && String(dp.category).toLowerCase() === String(np3.category || "").toLowerCase() && String(dp.product_name).toLowerCase() === String(np3.product_name || "").toLowerCase()) dup = dp;
          }
          var np = {
            id: dup ? dup.id : (B3.products.length ? Math.max.apply(null, B3.products.map(function (x) { return x.id; })) + 1 : 1),
            industry: String(np3.industry || "General"), category: String(np3.category || "General"),
            product_name: String(np3.product_name || "New product"), product_uom: String(np3.product_uom || "unit"),
            formula_type: String(np3.formula_type || "absolute"), default_yield_percent: Number(np3.default_yield_percent) || 100,
            formula_meta: np3.formula_meta || { ingredients: [], batch_tiers: [] }
          };
          if (!dup) B3.products.push(np); else B3.products[B3.products.indexOf(dup)] = np;
          return json({ ok: true, product: np });
        }
        if (p === "/manufacturing/boms/preview-from-catalog" && method === "POST") {
          var pv3 = {}; try { pv3 = JSON.parse(opts.body || "{}"); } catch (e) { }
          var prod = null;
          for (var pi = 0; pi < B3.products.length; pi++) if (B3.products[pi].id === Number(pv3.catalog_product_id)) prod = B3.products[pi];
          if (!prod) return json({ ok: false, error: "Catalog product not found" }, 404);
          var meta = prod.formula_meta || {};
          if (typeof meta === "string") { try { meta = JSON.parse(meta); } catch (e) { meta = {}; } }
          var ing = meta.ingredients || [];
          var bq = prod.formula_type === "bakers_pct" ? (Number(pv3.batch_flour_g) || 0) / 1000 : (Number(pv3.batch_qty) || 0);
          var imap = pv3.item_map || {};
          var lines3 = [], matTotal = 0, unmapped = [];
          ing.forEach(function (g) {
            var iid = imap[g.key] || null;
            if (!iid) {
              var gname = String(g.name || g.key || "").toLowerCase();
              for (var mi = 0; mi < CAT_ITEMS.length; mi++) {
                if (String(CAT_ITEMS[mi].name).toLowerCase() === gname) { iid = CAT_ITEMS[mi].id; break; }
              }
            }
            var it = iid ? b3item(iid) : null;
            var q = Math.round((Number(g.qty_per_unit) || 0) * bq * 10000) / 10000;
            var uc = it ? (Number(it.sales_price) || 0) : 0;
            if (it) matTotal += q * uc; else unmapped.push(g.name || g.key);
            lines3.push({ key: g.key, name: g.name || g.key, item_id: iid, quantity: q, base_qty: Number(g.qty_per_unit) || 0, base_unit: g.unit || "unit", unit: g.unit || "unit", scrap_percent: 0, unit_cost: uc });
          });
          var yld = Number(prod.default_yield_percent) || 100;
          var good = Math.round(bq * yld / 100 * 10000) / 10000;
          return json({
            ok: true,
            preview: {
              product: prod,
              output: { batch_qty: bq, batch_unit: prod.product_uom || "unit", yield_percent: yld, expected_good_output: good },
              lines: lines3,
              cost: { material_total: Math.round(matTotal * 100) / 100, unit_cost_estimate: good > 0 ? Math.round(matTotal / good * 100) / 100 : 0, unmapped_keys: unmapped }
            }
          });
        }

        /* ---- orders collection, detail, lifecycle ---- */
        if (p === "/manufacturing/orders" && method === "GET") return json({ orders: B3.orders });
        if (p === "/manufacturing/orders" && method === "POST") {
          var no3 = {}; try { no3 = JSON.parse(opts.body || "{}"); } catch (e) { }
          var ob = b3bom(no3.bom_id);
          if (!ob) return json({ ok: false, error: "Select a valid BOM" }, 422);
          var pqty = Number(no3.planned_qty != null ? no3.planned_qty : (no3.quantity != null ? no3.quantity : no3.qty)) || ob.batch_qty;
          var nord = {
            id: ++B3.seq.order, mo_no: "MO-26" + String(++B3.seq.mo).padStart(2, "0"),
            tx_date: String(no3.tx_date || no3.planned_start_date || "2026-10-14"),
            finished_item_name: ob.finished_item_name || ob.item_name || ob.name,
            planned_qty: pqty, actual_qty: 0, status: "draft",
            bom_id: ob.id, bom_code: ob.bom_code, bom_name: ob.name, bom_selling_price: Number(ob.selling_price) || 0,
            unit: ob.batch_unit || "units", material_cost: 0,
            production_tracking_method: String(no3.production_tracking_method || "batch"),
            planned_start_date: no3.planned_start_date || no3.tx_date || "2026-10-14",
            planned_finish_date: no3.planned_finish_date || no3.tx_date || "2026-10-14",
            planned_start_time: no3.planned_start_time || "08:00", planned_finish_time: no3.planned_finish_time || "17:00",
            location: String(no3.location || "Main Workshop"), notes: no3.notes || "",
            materials: b3matsFromBom(ob, pqty, false),
            production_progress: [],
            management_costs: { labour: [], direct_costs: [], overhead: [] },
            dispatches: [], dispatch_summary: { total_dispatched: 0, available_to_dispatch: 0 },
            utilities_cost: 0, production_summary: {}
          };
          b3recalcSummary(nord);
          B3.orders.push(nord);
          return json({ ok: true, id: nord.id, order: nord });
        }
        var mB3ord = p.match(/^\/manufacturing\/orders\/(\d+)$/);
        if (mB3ord) {
          var o3 = b3order(mB3ord[1]);
          if (!o3) return json({ ok: false, error: "Production batch not found" }, 404);
          if (method === "GET") return json({ ok: true, order: o3 });
          return json({ ok: true, order: o3 });
        }
        var mB3st = p.match(/^\/manufacturing\/orders\/(\d+)\/status$/);
        if (mB3st && method === "POST") {
          var so = {}; try { so = JSON.parse(opts.body || "{}"); } catch (e) { }
          var ost = b3order(mB3st[1]);
          if (!ost) return json({ ok: false, error: "Production batch not found" }, 404);
          ost.status = String(so.status || ost.status);
          if (ost.status === "completed" && Number(ost.actual_qty) === 0) ost.actual_qty = Number(ost.planned_qty) || 0;
          if (ost.status === "completed") {
            B3.history.unshift({
              id: ost.id, mo_no: ost.mo_no, tx_date: ost.tx_date, finished_item_name: ost.finished_item_name,
              bom_code: ost.bom_code, bom_name: ost.bom_name, planned_qty: ost.planned_qty, actual_qty: ost.actual_qty,
              material_cost: ost.material_cost, status: "completed", unit: ost.unit
            });
          }
          return json({ ok: true, status: ost.status });
        }
        var mB3pg = p.match(/^\/manufacturing\/orders\/(\d+)\/production-progress$/);
        if (mB3pg && method === "POST") {
          var po3 = {}; try { po3 = JSON.parse(opts.body || "{}"); } catch (e) { }
          var opg = b3order(mB3pg[1]);
          if (!opg) return json({ ok: false, error: "Production batch not found" }, 404);
          opg.production_progress.push({ tx_date: String(po3.tx_date || "2026-10-14"), quantity: Number(po3.quantity) || 0, notes: po3.notes || "" });
          opg.actual_qty = Math.round(((Number(opg.actual_qty) || 0) + (Number(po3.quantity) || 0)) * 10000) / 10000;
          b3recalcSummary(opg);
          return json({ ok: true, actual_qty: opg.actual_qty });
        }
        var mB3us = p.match(/^\/manufacturing\/orders\/(\d+)\/material-usage$/);
        if (mB3us && method === "POST") {
          var uo3 = {}; try { uo3 = JSON.parse(opts.body || "{}"); } catch (e) { }
          var ous = b3order(mB3us[1]);
          if (!ous) return json({ ok: false, error: "Production batch not found" }, 404);
          var posted3 = 0;
          (uo3.lines || []).forEach(function (ul) {
            for (var ui = 0; ui < ous.materials.length; ui++) {
              var um = ous.materials[ui];
              if (Number(um.material_id) === Number(ul.material_id)) {
                /* ABSOLUTE semantics — the manual modal prefills the input with
                   actual consumed-to-date and posts the edited TOTAL. */
                um.actual_qty = Math.round((Number(ul.actual_qty) || 0) * 10000) / 10000;
                posted3 += (Number(ul.actual_qty) || 0) * (Number(um.unit_cost) || 0);
              }
            }
          });
          b3recalcSummary(ous);
          return json({ ok: true, total_cost: Math.round(posted3 * 100) / 100 });
        }
        var mB3dp = p.match(/^\/manufacturing\/orders\/(\d+)\/dispatch$/);
        if (mB3dp && method === "POST") {
          var dpo = {}; try { dpo = JSON.parse(opts.body || "{}"); } catch (e) { }
          var odp = b3order(mB3dp[1]);
          if (!odp) return json({ ok: false, error: "Production batch not found" }, 404);
          var pre = String(dpo.reference_no || "");
          var dsp = {
            id: ++B3.seq.dispatch, channel: String(dpo.channel || "customer_delivery"),
            destination: String(dpo.destination || ""), quantity: Number(dpo.quantity) || 0,
            received_by: String(dpo.received_by || ""), reference_no: pre, tx_date: "2026-10-14"
          };
          odp.dispatches.push(dsp);
          var tdisp = 0; odp.dispatches.forEach(function (d) { tdisp += Number(d.quantity) || 0; });
          odp.dispatch_summary = { total_dispatched: tdisp, available_to_dispatch: Math.max((Number(odp.actual_qty) || 0) - tdisp, 0) };
          return json({ ok: true, dispatch: { reference_no: dsp.reference_no, official_reference: dsp.reference_no } });
        }
        var mB3dpr = p.match(/^\/manufacturing\/dispatch-preview-number$/);
        if (mB3dpr) {
          var ch3 = query.get("channel") || "customer_delivery";
          var pre3 = ch3 === "internal_consumption" ? "ISS" : ch3 === "branch_transfer" ? "TRF" : ch3 === "retail_sales" ? "STG" : "DSP";
          var n3 = ++B3.seq.ref[pre3];
          return json({ ok: true, reference_no: pre3 + "-2610-0" + n3 });
        }
        var mB3eod = p.match(/^\/manufacturing\/orders\/(\d+)\/eod-reconciliation$/);
        if (mB3eod && method === "POST") {
          var eo3 = {}; try { eo3 = JSON.parse(opts.body || "{}"); } catch (e) { }
          var oeo = b3order(mB3eod[1]);
          if (!oeo) return json({ ok: false, error: "Production batch not found" }, 404);
          oeo.eod_reconciliation = eo3.reconciliation || eo3.eod_reconciliation || eo3;
          return json({ ok: true });
        }
        var mB3lb = p.match(/^\/manufacturing\/orders\/(\d+)\/labour$/);
        if (mB3lb) {
          var olb = b3order(mB3lb[1]);
          if (!olb) return json({ ok: false, error: "Production batch not found" }, 404);
          if (method === "POST") {
            var nl3 = {}; try { nl3 = JSON.parse(opts.body || "{}"); } catch (e) { }
            var nll = { id: ++B3.seq.line, worker_name: String(nl3.worker_name || ""), role: String(nl3.role || ""), hours: Number(nl3.hours) || 0, rate: Number(nl3.rate) || 0 };
            nll.labour_cost = Math.round(nll.hours * nll.rate * 100) / 100;
            olb.management_costs.labour.push(nll);
            b3recalcSummary(olb);
            return json({ ok: true, line: nll });
          }
        }
        var mB3lbi = p.match(/^\/manufacturing\/orders\/(\d+)\/labour\/(\d+)$/);
        if (mB3lbi && method === "DELETE") {
          var olbd = b3order(mB3lbi[1]);
          if (olbd) {
            olbd.management_costs.labour = olbd.management_costs.labour.filter(function (x) { return Number(x.id) !== Number(mB3lbi[2]); });
            b3recalcSummary(olbd);
          }
          return json({ ok: true });
        }
        var mB3dc = p.match(/^\/manufacturing\/orders\/(\d+)\/direct-costs$/);
        if (mB3dc) {
          var odc = b3order(mB3dc[1]);
          if (!odc) return json({ ok: false, error: "Production batch not found" }, 404);
          if (method === "POST") {
            var nd3 = {}; try { nd3 = JSON.parse(opts.body || "{}"); } catch (e) { }
            var ndl = { id: ++B3.seq.line, description: String(nd3.description || ""), cost_type: String(nd3.cost_type || ""), amount: Number(nd3.amount) || 0 };
            odc.management_costs.direct_costs.push(ndl);
            b3recalcSummary(odc);
            return json({ ok: true, line: ndl });
          }
        }
        var mB3dci = p.match(/^\/manufacturing\/orders\/(\d+)\/direct-costs\/(\d+)$/);
        if (mB3dci && method === "DELETE") {
          var odcd = b3order(mB3dci[1]);
          if (odcd) {
            odcd.management_costs.direct_costs = odcd.management_costs.direct_costs.filter(function (x) { return Number(x.id) !== Number(mB3dci[2]); });
            b3recalcSummary(odcd);
          }
          return json({ ok: true });
        }
        var mB3ov = p.match(/^\/manufacturing\/orders\/(\d+)\/overhead$/);
        if (mB3ov) {
          var oov = b3order(mB3ov[1]);
          if (!oov) return json({ ok: false, error: "Production batch not found" }, 404);
          if (method === "POST") {
            var no3v = {}; try { no3v = JSON.parse(opts.body || "{}"); } catch (e) { }
            var nov = { id: ++B3.seq.line, allocation_name: String(no3v.allocation_name || ""), basis: String(no3v.basis || ""), quantity: Number(no3v.quantity) || 0, rate: Number(no3v.rate) || 0 };
            nov.allocated_amount = Math.round(nov.quantity * nov.rate * 100) / 100;
            oov.management_costs.overhead.push(nov);
            b3recalcSummary(oov);
            return json({ ok: true, line: nov });
          }
        }
        var mB3ovi = p.match(/^\/manufacturing\/orders\/(\d+)\/overhead\/(\d+)$/);
        if (mB3ovi && method === "DELETE") {
          var oovd = b3order(mB3ovi[1]);
          if (oovd) {
            oovd.management_costs.overhead = oovd.management_costs.overhead.filter(function (x) { return Number(x.id) !== Number(mB3ovi[2]); });
            b3recalcSummary(oovd);
          }
          return json({ ok: true });
        }

        /* ---- stages & standards ---- */
        var mB3std = p.match(/^\/manufacturing\/stage-standards$/);
        if (mB3std) {
          if (method === "POST") {
            var ns3 = {}; try { ns3 = JSON.parse(opts.body || "{}"); } catch (e) { }
            var bid3 = Number(ns3.bom_id) || 0;
            if (!B3.standards[bid3]) B3.standards[bid3] = [];
            B3.standards[bid3].push({ id: ++B3.seq.std, stage_name: String(ns3.stage_name || "Stage"), stage_code: String(ns3.stage_code || "STAGE"), sequence_no: Number(ns3.sequence_no) || 1, standard_minutes: Number(ns3.standard_minutes) || 45, equipment_name: String(ns3.equipment_name || "") });
            return json({ ok: true });
          }
          return json({ ok: true, standards: B3.standards[Number(query.get("bom_id")) || 0] || [] });
        }
        var mB3as = p.match(/^\/manufacturing\/orders\/(\d+)\/stages\/apply-standards$/);
        if (mB3as && method === "POST") {
          var oas = b3order(mB3as[1]);
          if (!oas) return json({ ok: false, error: "Production batch not found" }, 404);
          if (!B3.stages[oas.id] || !B3.stages[oas.id].length) {
            var stds = B3.standards[oas.bom_id] || [];
            B3.stages[oas.id] = stds.map(function (s) {
              return { id: ++B3.seq.stage, stage_name: s.stage_name, stage_code: s.stage_code, status: "pending", elapsed_seconds: 0, standard_minutes: s.standard_minutes, operator_name: "", equipment_name: s.equipment_name || "", notes: "" };
            });
          }
          return json({ ok: true, stages: B3.stages[oas.id] });
        }
        var mB3sg = p.match(/^\/manufacturing\/orders\/(\d+)\/stages$/);
        if (mB3sg) return json({ ok: true, stages: B3.stages[Number(mB3sg[1])] || [] });
        var mB3tm = p.match(/^\/manufacturing\/orders\/(\d+)\/stages\/(\d+)\/timer$/);
        if (mB3tm && method === "POST") {
          var to3 = {}; try { to3 = JSON.parse(opts.body || "{}"); } catch (e) { }
          var osgs = B3.stages[Number(mB3tm[1])] || [];
          var stg = null;
          for (var si = 0; si < osgs.length; si++) if (Number(osgs[si].id) === Number(mB3tm[2])) stg = osgs[si];
          if (!stg) return json({ ok: false, error: "Stage not found" }, 404);
          var act = String(to3.action || "");
          if (act === "start" || act === "resume") stg.status = "running";
          else if (act === "pause") stg.status = "paused";
          else if (act === "complete") { stg.status = "completed"; stg.elapsed_seconds = stg.elapsed_seconds + 600; }
          if (to3.operator_name) stg.operator_name = String(to3.operator_name);
          if (to3.equipment_name) stg.equipment_name = String(to3.equipment_name);
          if (to3.notes) stg.notes = String(to3.notes);
          return json({ ok: true, stage: stg });
        }

        /* ---- history ---- */
        if (p === "/manufacturing/history") return json({ history: B3.history });
      }
      /* ---- manufacturing ---- */
      if (p === "/manufacturing/boms") return json({ boms: CAT_BOMS });
      if (p === "/manufacturing/orders") return json({ orders: CAT_ORDERS });
      if (p === "/manufacturing/history") return json({ history: CAT_HISTORY });
      if (p === "/manufacturing/production-catalog") return json({ items: CAT_ITEMS.filter(function (it) { return it.track_stock; }).map(function (it) { return { item_id: it.id, sku: it.sku, name: it.name, unit_cost: it.cost_price }; }) });
    }
      /* ════════════════════════════════════════════════════════════
         ln1 — LOANS & FINANCING mock block (Task 19)
         Seeds the Loans register + detail + journals + payments +
         reclassify + report exports. All data is NEW (no existing
         values changed). State persists on window.__LN1 across
         requests so the register reflects created/updated loans.
         Inserted BEFORE the generic fallback so /loans routes win.
         ════════════════════════════════════════════════════════════ */
      if (cidMatch && pathname.indexOf("/loans") !== -1) {
        var lnR2 = function (v) { return Math.round((Number(v) || 0) * 100) / 100; };
        if (!window.__LN1) {
          window.__LN1 = { seq: { loan: 2406, payment: 7100, journal: 2950 }, loans: {} };

          /* ── schedule builder — annuity / straight-line / interest-only ── */
          window.__LN1.build = function (cfg) {
            var r2 = function (v) { return Math.round(v * 100) / 100; };
            var n = Number(cfg.term_count) || 0;
            var P = Number(cfg.principal_amount) || 0;
            var i = (Number(cfg.annual_interest_rate) || 0) / 100 / 12;
            var balloon = Number(cfg.balloon_amount) || 0;
            var pay;
            if (cfg.interest_method === "interest_only") {
              pay = r2(P * i);
            } else if (cfg.interest_method === "manual") {
              pay = Number(cfg.payment_amount) || r2(P * i);
            } else {
              pay = r2(P * i / (1 - Math.pow(1 + i, -n)));
            }
            var rows = [];
            var opening = P;
            var d = new Date(cfg.first_payment_date + "T00:00:00Z");
            var step = cfg.payment_frequency === "annually" ? 12 : cfg.payment_frequency === "quarterly" ? 3 : cfg.payment_frequency === "weekly" ? 0 : 1;
            var totalInt = 0;
            for (var p = 1; p <= n; p++) {
              var interest = r2(opening * i);
              var principal;
              var sched;
              if (cfg.interest_method === "interest_only") {
                principal = (p === n) ? r2(opening) : 0;
                sched = r2(interest + principal);
              } else if (p === n) {
                principal = r2(opening - balloon);
                sched = r2(interest + principal);
              } else {
                principal = r2(pay - interest);
                sched = pay;
              }
              if (principal > opening) principal = opening;
              var closing = r2(opening - principal);
              totalInt = r2(totalInt + interest);
              var due = new Date(d);
              rows.push({
                id: cfg._sid + p,
                loan_id: cfg._lid,
                period_no: p,
                due_date: due.toISOString().slice(0, 10),
                opening_balance: opening,
                scheduled_payment: sched,
                scheduled_interest: interest,
                scheduled_principal: principal,
                closing_balance: closing,
                payment_status: p <= (cfg.posted_count || 0) ? "paid" : "open",
                schedule_version: 1
              });
              opening = closing;
              d.setMonth(d.getMonth() + step);
            }
            return { rows: rows, payment: pay, total_interest: totalInt };
          };

          /* ── seeded portfolio (Mokoko Trading) — all NEW figures ── */
          var seed = [
            {
              id: 2401, loan_name: "FNB Business Term Loan", loan_reference: "LN-2401",
              lender_name: "First National Bank (FNB)", loan_type: "term_loan", status: "active",
              principal_amount: 850000.00, annual_interest_rate: 10.25, interest_method: "amortised_fixed_payment",
              term_count: 36, payment_frequency: "monthly", start_date: "2025-09-01",
              first_payment_date: "2025-10-01", maturity_date: "2028-09-01",
              balloon_amount: 0, fees_amount: 9750.00, accrued_interest_opening: 0,
              repayment_holiday_count: 0, variable_rate: false, currency: "ZAR",
              bank_account_id: 1, agreement_reference: "FNB-BTL-7710042",
              interest_expense_account_code: "PL_EX_6600", accrued_interest_account_code: "BS_CL_2410",
              loan_payable_current_account_code: "BS_CL_2405", loan_payable_noncurrent_account_code: "BS_CL_2400",
              fees_asset_account_code: "BS_CA_1450", fees_expense_account_code: "PL_EX_6650",
              posted_count: 13,
              notes: "Working-capital expansion — Springs branch fit-out and stock. Facility secured by cession of debtors book."
            },
            {
              id: 2402, loan_name: "Vehicle Asset Finance — Hilux 2.8 GD-6", loan_reference: "LN-2402",
              lender_name: "WesBank", loan_type: "vehicle", status: "active",
              principal_amount: 420000.00, annual_interest_rate: 11.50, interest_method: "amortised_fixed_payment",
              term_count: 60, payment_frequency: "monthly", start_date: "2025-03-01",
              first_payment_date: "2025-04-01", maturity_date: "2030-03-01",
              balloon_amount: 0, fees_amount: 6075.00, accrued_interest_opening: 0,
              repayment_holiday_count: 0, variable_rate: false, currency: "ZAR",
              bank_account_id: 1, agreement_reference: "WB-VAF-3341207",
              interest_expense_account_code: "PL_EX_6600", accrued_interest_account_code: "BS_CL_2410",
              loan_payable_current_account_code: "BS_CL_2405", loan_payable_noncurrent_account_code: "BS_CL_2400",
              fees_asset_account_code: "BS_CA_1450", fees_expense_account_code: "PL_EX_6650",
              posted_count: 19,
              notes: "Delivery fleet — Toyota Hilux 2.8 GD-6 double cab, chassis AHTHX80G100 presenza on file."
            },
            {
              id: 2403, loan_name: "Nedbank Commercial Mortgage — Kruger Street", loan_reference: "LN-2403",
              lender_name: "Nedbank Corporate Property Finance", loan_type: "mortgage", status: "active",
              principal_amount: 2400000.00, annual_interest_rate: 9.75, interest_method: "amortised_fixed_payment",
              term_count: 120, payment_frequency: "monthly", start_date: "2024-07-01",
              first_payment_date: "2024-08-01", maturity_date: "2034-07-01",
              balloon_amount: 0, fees_amount: 32400.00, accrued_interest_opening: 0,
              repayment_holiday_count: 0, variable_rate: false, currency: "ZAR",
              bank_account_id: 2, agreement_reference: "NED-CPF-99182",
              interest_expense_account_code: "PL_EX_6600", accrued_interest_account_code: "BS_CL_2410",
              loan_payable_current_account_code: "BS_CL_2405", loan_payable_noncurrent_account_code: "BS_CL_2400",
              fees_asset_account_code: "BS_CA_1450", fees_expense_account_code: "PL_EX_6650",
              posted_count: 27,
              notes: "Owner-occupied retail premises at 14 Kruger Street, Springs. Registered bond over the property."
            },
            {
              id: 2404, loan_name: "Director Loan — T. Mokoena", loan_reference: "LN-2404",
              lender_name: "Thabo Mokoena", loan_type: "director_loan", status: "active",
              principal_amount: 120000.00, annual_interest_rate: 7.00, interest_method: "interest_only",
              term_count: 12, payment_frequency: "monthly", start_date: "2026-01-01",
              first_payment_date: "2026-02-01", maturity_date: "2027-01-01",
              balloon_amount: 0, fees_amount: 0, accrued_interest_opening: 0,
              repayment_holiday_count: 0, variable_rate: false, currency: "ZAR",
              bank_account_id: 1, agreement_reference: "DL-2026-001",
              interest_expense_account_code: "PL_EX_6600", accrued_interest_account_code: "BS_CL_2410",
              loan_payable_current_account_code: "BS_CL_2405", loan_payable_noncurrent_account_code: "BS_CL_2400",
              fees_asset_account_code: "", fees_expense_account_code: "",
              posted_count: 9,
              notes: "Shareholder-approved advance for the Benoni pop-up season. Interest-only; bullet principal at maturity (arm's-length terms, SARS s787A note filed)."
            },
            {
              id: 2405, loan_name: "Equipment Facility — Packing Line", loan_reference: "LN-2405",
              lender_name: "Capitec Business Bank", loan_type: "term_loan", status: "draft",
              principal_amount: 250000.00, annual_interest_rate: 12.00, interest_method: "amortised_fixed_payment",
              term_count: 48, payment_frequency: "monthly", start_date: "2026-11-01",
              first_payment_date: "2026-12-01", maturity_date: "2030-11-01",
              balloon_amount: 25000.00, fees_amount: 5000.00, accrued_interest_opening: 0,
              repayment_holiday_count: 0, variable_rate: true, currency: "ZAR",
              bank_account_id: 1, agreement_reference: "",
              interest_expense_account_code: "PL_EX_6600", accrued_interest_account_code: "BS_CL_2410",
              loan_payable_current_account_code: "BS_CL_2405", loan_payable_noncurrent_account_code: "BS_CL_2400",
              fees_asset_account_code: "BS_CA_1450", fees_expense_account_code: "PL_EX_6650",
              posted_count: 0,
              notes: "Draft — awaiting signed facility letter before inception journal is posted."
            }
          ];

          var build = window.__LN1.build;
          var pid = 7100, jid = 2950;
          seed.forEach(function (s) {
            var built = build({
              _lid: s.id, _sid: s.id * 10,
              principal_amount: s.principal_amount, annual_interest_rate: s.annual_interest_rate,
              term_count: s.term_count, payment_frequency: s.payment_frequency,
              interest_method: s.interest_method, balloon_amount: s.balloon_amount,
              first_payment_date: s.first_payment_date, posted_count: s.posted_count
            });
            var rows = built.rows;
            var paidPrincipal = rows.reduce(function (a, r) {
              return a + (r.payment_status === "paid" ? r.scheduled_principal : 0);
            }, 0);
            var loan = {};
            for (var k in s) if (k !== "posted_count") loan[k] = s[k];
            loan.schedule_version = 1;
            loan.outstanding_principal = s.status === "draft" ? 0 : lnR2(s.principal_amount - paidPrincipal);
            loan.payment_amount = built.payment;
            loan.total_interest_projected = built.total_interest;
            var nextOpen = rows.filter(function (r) { return r.payment_status !== "paid"; })[0];
            loan.next_due_date = nextOpen ? nextOpen.due_date : null;
            loan.current_portion = rows
              .filter(function (r) { return r.payment_status !== "paid"; })
              .slice(0, 12)
              .reduce(function (a, r) { return a + r.scheduled_principal; }, 0);
            loan.current_portion = lnR2(loan.current_portion);
            loan.ias23_link = null;

            var payments = rows.filter(function (r) { return r.payment_status === "paid"; })
              .map(function (r, ix) {
                pid += 1; jid += 1;
                return {
                  id: pid, loan_id: s.id, schedule_id: r.id,
                  payment_date: r.due_date, reference: "LNP-" + s.id + "-" + String(ix + 1).padStart(2, "0"),
                  amount_paid: r.scheduled_payment,
                  principal_amount: r.scheduled_principal,
                  interest_amount: r.scheduled_interest,
                  accrued_interest_amount: 0,
                  fees_amount: 0, penalties_amount: 0,
                  payment_type: "standard", status: "posted",
                  journal_id: jid,
                  bank_account_id: s.bank_account_id,
                  description: "Loan instalment — period " + r.period_no,
                  notes: null, approval_status: null
                };
              });

            window.__LN1.loans[s.id] = { loan: loan, schedule: rows, payments: payments };
          });
          window.__LN1.seq.payment = pid + 1;
          window.__LN1.seq.journal = jid + 1;
        }
        var LN1 = window.__LN1;
        var build = LN1.build;
        var lnR2 = function (v) { return Math.round((Number(v) || 0) * 100) / 100; };
        function lnLoanById(id) { return LN1.loans[id] || null; }
        function lnDetail(id) {
          var rec = lnLoanById(id);
          if (!rec) return null;
          return {
            loan: rec.loan,
            schedule: rec.schedule,
            payments: rec.payments.slice().sort(function (a, b) { return String(b.payment_date).localeCompare(String(a.payment_date)); })
          };
        }
        function lnListRow(rec) {
          var l = rec.loan;
          return {
            id: l.id, loan_name: l.loan_name, loan_reference: l.loan_reference,
            lender_name: l.lender_name, loan_type: l.loan_type, status: l.status,
            principal_amount: l.principal_amount, outstanding_principal: l.outstanding_principal,
            payment_amount: l.payment_amount, total_interest_projected: l.total_interest_projected,
            next_due_date: l.next_due_date, currency: l.currency,
            start_date: l.start_date, maturity_date: l.maturity_date,
            annual_interest_rate: l.annual_interest_rate, interest_method: l.interest_method,
            term_count: l.term_count, payment_frequency: l.payment_frequency,
            bank_account_id: l.bank_account_id
          };
        }
        /* rebuild derived figures after mutations */
        function lnRefreshDerived(id) {
          var rec = lnLoanById(id);
          if (!rec) return;
          var l = rec.loan, rows = rec.schedule;
          var paidP = 0, totInt = 0, nextOpen = null;
          rows.forEach(function (r) {
            totInt = lnR2(totInt + r.scheduled_interest);
            if (r.payment_status === "paid") paidP = lnR2(paidP + r.scheduled_principal);
            else if (!nextOpen) nextOpen = r;
          });
          l.total_interest_projected = totInt;
          l.outstanding_principal = String(l.status).toLowerCase() === "draft" ? 0 : lnR2(l.principal_amount - paidP);
          l.next_due_date = nextOpen ? nextOpen.due_date : null;
          l.current_portion = lnR2(rows.filter(function (r) { return r.payment_status !== "paid"; })
            .slice(0, 12).reduce(function (a, r) { return a + r.scheduled_principal; }, 0));
        }
        /* journal builders (display shapes consumed by renderMainJournalPreview) */
        function lnJHeader(date, ref, desc, ccy) {
          return { journal_date: date, reference: ref, description: desc, currency: ccy || "ZAR" };
        }
        function lnInceptionPreview(l) {
          var fees = Number(l.fees_amount) || 0;
          var lines = [
            { account_name: "BS_CA_1000 — Business Bank Account", description: "Loan proceeds received — " + (l.loan_name || ""), debit: Number(l.principal_amount) || 0, credit: 0 },
            { account_name: l.loan_payable_noncurrent_account_code + " — Loan Payable (Non-Current)", description: "Loan liability recognised at inception", debit: 0, credit: Number(l.principal_amount) || 0 }
          ];
          if (fees > 0) {
            lines.push({ account_name: l.fees_asset_account_code + " — Loan Fees (Deferred Cost)", description: "Initiation fees capitalised, amortised over term", debit: fees, credit: 0 });
            lines.push({ account_name: "BS_CA_1000 — Business Bank Account", description: "Fees deducted from proceeds", debit: 0, credit: fees });
          }
          return {
            header: lnJHeader(l.start_date, "LNJ-INC-" + l.id, "Loan inception — " + (l.loan_name || ""), l.currency),
            lines: lines,
            calculation: { principal_amount: l.principal_amount, fees_amount: fees }
          };
        }
        function lnPaymentPreview(l, amt, date, isPrepay) {
          var rows = LN1.loans[l.id] ? LN1.loans[l.id].schedule : [];
          var i = (Number(l.annual_interest_rate) || 0) / 100 / 12;
          var remaining = lnR2(amt), allocP = 0, allocI = 0, allocA = 0;
          var open = rows.filter(function (r) { return r.payment_status !== "paid"; });
          var target = open[0];
          if (target) {
            var wantI = Math.min(remaining, target.scheduled_interest);
            allocI = lnR2(wantI); remaining = lnR2(remaining - wantI);
            var wantP = Math.min(remaining, target.opening_balance);
            allocP = lnR2(wantP); remaining = lnR2(remaining - wantP);
          }
          var lines = [
            { account_name: l.interest_expense_account_code + " — Interest Expense (Finance Costs)", description: "Interest portion of instalment", debit: allocI, credit: 0 },
            { account_name: l.loan_payable_current_account_code + " — Loan Payable (Current)", description: "Principal reduction", debit: allocP, credit: 0 },
            { account_name: "BS_CA_1000 — Business Bank Account", description: "Instalment paid via debit order", debit: 0, credit: lnR2(allocI + allocP) }
          ];
          if (allocA > 0) {
            lines.push({ account_name: l.accrued_interest_account_code + " — Accrued Interest Payable", description: "Accrued interest settled", debit: allocA, credit: 0 });
          }
          return {
            header: lnJHeader(date || l.next_due_date, "LNJ-PAY-" + l.id, "Loan payment" + (isPrepay ? " (prepayment)" : "") + " — " + (l.loan_name || ""), l.currency),
            lines: lines,
            calculation: {
              principal_amount: allocP, interest_amount: allocI,
              accrued_interest_amount: allocA, fees_amount: 0, penalties_amount: 0
            }
          };
        }
        function lnReclassPreview(l) {
          var amt = Number(l.current_portion) || 0;
          return {
            header: lnJHeader(new Date().toISOString().slice(0, 10), "LNJ-REC-" + l.id, "Reclassification of current portion — " + (l.loan_name || ""), l.currency),
            lines: [
              { account_name: l.loan_payable_noncurrent_account_code + " — Loan Payable (Non-Current)", description: "Portion due within 12 months moved to current", debit: amt, credit: 0 },
              { account_name: l.loan_payable_current_account_code + " — Loan Payable (Current)", description: "Current portion per IAS 1 presentation", debit: 0, credit: amt }
            ],
            calculation: { current_portion: amt, noncurrent_portion: lnR2((Number(l.outstanding_principal) || 0) - amt) }
          };
        }

        var lnPath = pathname.replace(/\/$/, "");

        /* ---- POST /loans/payments/preview_journal (before :id routes) ---- */
        if (/\/loans\/payments\/preview_journal$/.test(lnPath) && method === "POST") {
          var ppBody = {};
          try { ppBody = JSON.parse(opts.body || "{}"); } catch (e) { }
          var ppLoan = lnLoanById(ppBody.loan_id) || { loan: { id: 0, annual_interest_rate: 0, loan_name: "Unsaved loan", next_due_date: ppBody.payment_date, currency: "ZAR", interest_expense_account_code: "PL_EX_6600", loan_payable_current_account_code: "BS_CL_2405", accrued_interest_account_code: "BS_CL_2410" } };
          return json({ data: lnPaymentPreview(ppLoan.loan, Number(ppBody.amount_paid) || 0, ppBody.payment_date, ppBody.payment_type === "prepayment") });
        }

        /* ---- POST /loans/payments/:id/post ---- */
        var lnPostM = lnPath.match(/\/loans\/payments\/(\d+)\/post$/);
        if (lnPostM && method === "POST") {
          var postPid = parseInt(lnPostM[1], 10), postedRec = null, postedPay = null;
          for (var lk in LN1.loans) {
            var lr = LN1.loans[lk];
            lr.payments.forEach(function (p) { if (p.id === postPid) { postedPay = p; postedRec = lr; } });
            if (postedPay) break;
          }
          if (!postedPay) return json({ ok: false, error: "Payment not found" }, 404);
          if (postedPay.status !== "posted") {
            postedPay.status = "posted";
            postedPay.journal_id = LN1.seq.journal++;
            (postedRec.schedule || []).forEach(function (r) {
              if (r.id === postedPay.schedule_id) {
                r.payment_status = Number(postedPay.amount_paid) >= r.scheduled_payment - 0.011 ? "paid" : "partial";
              }
            });
            lnRefreshDerived(postedPay.loan_id);
          }
          return json({ ok: true, data: { payment: postedPay } });
        }

        /* ---- POST /loans/preview_inception_journal ---- */
        if (/\/loans\/preview_inception_journal$/.test(lnPath) && method === "POST") {
          var incBody = {};
          try { incBody = JSON.parse(opts.body || "{}"); } catch (e) { }
          return json({ data: lnInceptionPreview(incBody) });
        }

        /* ---- GET /loans/:id/reclassify/preview ---- */
        var lnReclassPrevM = lnPath.match(/\/loans\/(\d+)\/reclassify\/preview$/);
        if (lnReclassPrevM && method === "GET") {
          var rpRec = lnLoanById(parseInt(lnReclassPrevM[1], 10));
          if (!rpRec) return json({ ok: false, error: "Loan not found" }, 404);
          return json({ data: lnReclassPreview(rpRec.loan) });
        }

        /* ---- GET /loans (register) ---- */
        if (/\/loans$/.test(lnPath) && method === "GET") {
          var lStatus = (query.get("status") || "").trim().toLowerCase();
          var lQ = (query.get("q") || "").trim().toLowerCase();
          var lRows = [];
          for (var lk2 in LN1.loans) {
            var lr2 = lnListRow(LN1.loans[lk2]);
            if (lStatus && lStatus !== "all" && String(lr2.status || "").toLowerCase() !== lStatus) continue;
            if (lQ && (String(lr2.loan_name || "") + " " + String(lr2.lender_name || "") + " " + String(lr2.loan_reference || "")).toLowerCase().indexOf(lQ) === -1) continue;
            lRows.push(lr2);
          }
          lRows.sort(function (a, b) { return Number(b.outstanding_principal || 0) - Number(a.outstanding_principal || 0); });
          return json({ data: lRows, total: lRows.length });
        }

        /* ---- POST /loans (create) ---- */
        if (/\/loans$/.test(lnPath) && method === "POST") {
          var cBody = {};
          try { cBody = JSON.parse(opts.body || "{}"); } catch (e) { }
          var newId = LN1.seq.loan++;
          var loanNew = Object.assign({
            id: newId, status: "active", loan_reference: "LN-" + newId,
            currency: "ZAR", balloon_amount: 0, fees_amount: 0, accrued_interest_opening: 0,
            repayment_holiday_count: 0, variable_rate: false, bank_account_id: null,
            interest_expense_account_code: "PL_EX_6600", accrued_interest_account_code: "BS_CL_2410",
            loan_payable_current_account_code: "BS_CL_2405", loan_payable_noncurrent_account_code: "BS_CL_2400",
            fees_asset_account_code: "", fees_expense_account_code: "", agreement_reference: "", notes: "",
            ias23_link: null, schedule_version: 1
          }, cBody, { id: newId });
          var cBuilt = build({
            _lid: newId, _sid: newId * 10,
            principal_amount: loanNew.principal_amount, annual_interest_rate: loanNew.annual_interest_rate,
            term_count: loanNew.term_count, payment_frequency: loanNew.payment_frequency || "monthly",
            interest_method: loanNew.interest_method || "amortised_fixed_payment",
            balloon_amount: loanNew.balloon_amount, first_payment_date: loanNew.first_payment_date,
            posted_count: 0
          });
          loanNew.payment_amount = cBuilt.payment;
          loanNew.outstanding_principal = Number(loanNew.principal_amount) || 0;
          loanNew.total_interest_projected = cBuilt.total_interest;
          var cOpen = cBuilt.rows.filter(function (r) { return r.payment_status !== "paid"; })[0];
          loanNew.next_due_date = cOpen ? cOpen.due_date : null;
          loanNew.current_portion = lnR2(cBuilt.rows.slice(0, 12).reduce(function (a, r) { return a + r.scheduled_principal; }, 0));
          LN1.loans[newId] = { loan: loanNew, schedule: cBuilt.rows, payments: [] };
          return json({ ok: true, data: { loan: loanNew, schedule: cBuilt.rows, payments: [] } });
        }

        /* ---- GET/PUT/DELETE /loans/:id ---- */
        var lnIdM = lnPath.match(/\/loans\/(\d+)$/);
        if (lnIdM) {
          var lnId = parseInt(lnIdM[1], 10);
          var rec = lnLoanById(lnId);
          if (!rec) return json({ ok: false, error: "Loan not found" }, 404);
          if (method === "GET") return json({ data: lnDetail(lnId) });
          if (method === "PUT") {
            var uBody = {};
            try { uBody = JSON.parse(opts.body || "{}"); } catch (e) { }
            for (var uk in uBody) {
              if (uk === "ias23_link") rec.loan.ias23_link = uBody.ias23_link;
              else rec.loan[uk] = uBody[uk];
            }
            var uBuilt = build({
              _lid: lnId, _sid: lnId * 10,
              principal_amount: rec.loan.principal_amount, annual_interest_rate: rec.loan.annual_interest_rate,
              term_count: rec.loan.term_count, payment_frequency: rec.loan.payment_frequency || "monthly",
              interest_method: rec.loan.interest_method || "amortised_fixed_payment",
              balloon_amount: rec.loan.balloon_amount, first_payment_date: rec.loan.first_payment_date,
              posted_count: rec.payments.length
            });
            rec.schedule = uBuilt.rows;
            rec.payments.forEach(function (p, ix) {
              var row = rec.schedule.filter(function (r) { return r.period_no === ix + 1; })[0];
              if (row) { p.schedule_id = row.id; p.principal_amount = row.scheduled_principal; p.interest_amount = row.scheduled_interest; p.amount_paid = row.scheduled_payment; }
            });
            lnRefreshDerived(lnId);
            return json({ ok: true, data: { loan: rec.loan } });
          }
        }

        /* ---- POST /loans/:id/schedule/recalculate ---- */
        var lnRecalcM = lnPath.match(/\/loans\/(\d+)\/schedule\/recalculate$/);
        if (lnRecalcM && method === "POST") {
          var rcId = parseInt(lnRecalcM[1], 10);
          var rcRec = lnLoanById(rcId);
          if (!rcRec) return json({ ok: false, error: "Loan not found" }, 404);
          var rBuilt = build({
            _lid: rcId, _sid: rcId * 10,
            principal_amount: rcRec.loan.principal_amount, annual_interest_rate: rcRec.loan.annual_interest_rate,
            term_count: rcRec.loan.term_count, payment_frequency: rcRec.loan.payment_frequency || "monthly",
            interest_method: rcRec.loan.interest_method || "amortised_fixed_payment",
            balloon_amount: rcRec.loan.balloon_amount, first_payment_date: rcRec.loan.first_payment_date,
            posted_count: rcRec.payments.length
          });
          rcRec.schedule = rBuilt.rows;
          rcRec.loan.payment_amount = rBuilt.payment;
          lnRefreshDerived(rcId);
          return json({ ok: true, data: { loan: rcRec.loan, schedule: rcRec.schedule } });
        }

        /* ---- POST /loans/:id/reclassify ---- */
        var lnReclassM = lnPath.match(/\/loans\/(\d+)\/reclassify$/);
        if (lnReclassM && method === "POST") {
          var rzId = parseInt(lnReclassM[1], 10);
          var rzRec = lnLoanById(rzId);
          if (!rzRec) return json({ ok: false, error: "Loan not found" }, 404);
          lnRefreshDerived(rzId);
          var rzCur = Number(rzRec.loan.current_portion) || 0;
          return json({
            ok: true,
            data: {
              reclassified: true, as_of_date: new Date().toISOString().slice(0, 10),
              current_portion: rzCur,
              noncurrent_portion: lnR2((Number(rzRec.loan.outstanding_principal) || 0) - rzCur)
            }
          });
        }

        /* ---- POST /loans/:id/payments (create draft payment) ---- */
        var lnPayM = lnPath.match(/\/loans\/(\d+)\/payments$/);
        if (lnPayM && method === "POST") {
          var pyId = parseInt(lnPayM[1], 10);
          var pyRec = lnLoanById(pyId);
          if (!pyRec) return json({ ok: false, error: "Loan not found" }, 404);
          var pyBody = {};
          try { pyBody = JSON.parse(opts.body || "{}"); } catch (e) { }
          var pyAmt = Number(pyBody.amount_paid) || 0;
          var prev = lnPaymentPreview(pyRec.loan, pyAmt, pyBody.payment_date, pyBody.payment_type === "prepayment");
          var openRows = pyRec.schedule.filter(function (r) { return r.payment_status !== "paid"; })
            .sort(function (a, b) { return a.period_no - b.period_no; });
          var targetRow = pyBody.target_schedule_id
            ? openRows.filter(function (r) { return String(r.id) === String(pyBody.target_schedule_id); })[0] || openRows[0]
            : openRows[0];
          var allocations = [];
          var rem = lnR2(pyAmt);
          if (targetRow && pyBody.payment_type !== "prepayment") {
            var aI = Math.min(rem, targetRow.scheduled_interest);
            if (aI > 0) allocations.push({ allocation_type: "interest", loan_schedule_id: targetRow.id, amount: lnR2(aI) });
            rem = lnR2(rem - aI);
            var aP = Math.min(rem, targetRow.opening_balance);
            if (aP > 0) allocations.push({ allocation_type: "principal", loan_schedule_id: targetRow.id, amount: lnR2(aP) });
            rem = lnR2(rem - aP);
          } else if (targetRow) {
            if (rem > 0) allocations.push({ allocation_type: "prepayment", loan_schedule_id: targetRow.id, amount: rem });
            rem = 0;
          }
          if (rem > 0.004) allocations.push({ allocation_type: "unallocated", loan_schedule_id: null, amount: rem });
          var newPay = {
            id: LN1.seq.payment++, loan_id: pyId, schedule_id: targetRow ? targetRow.id : null,
            payment_date: pyBody.payment_date || pyRec.loan.next_due_date,
            reference: pyBody.reference || ("LNP-" + pyId + "-" + (pyRec.payments.length + 1)),
            amount_paid: pyAmt,
            principal_amount: prev.calculation.principal_amount,
            interest_amount: prev.calculation.interest_amount,
            accrued_interest_amount: prev.calculation.accrued_interest_amount,
            fees_amount: 0, penalties_amount: 0,
            payment_type: pyBody.payment_type === "prepayment" ? "prepayment" : "standard",
            status: "draft", journal_id: null,
            bank_account_id: pyBody.bank_account_id || pyRec.loan.bank_account_id,
            description: pyBody.description || ("Loan payment — " + (pyRec.loan.loan_name || "")),
            notes: pyBody.notes || null, approval_status: null
          };
          pyRec.payments.unshift(newPay);
          return json({
            ok: true,
            data: {
              payment: newPay,
              allocations: allocations,
              journal_preview: prev
            }
          });
        }
      }

      /* ---- ln1b — loan report exports (CSV) + shared export-token ---- */
      if (cidMatch && /\/reports\/export-token$/.test(pathname) && method === "POST") {
        return json({ ok: true, token: "demo-export-token-ln1" });
      }
      if (cidMatch && /\/reports\/loan-(register|schedule|payments|journals)\/export$/.test(pathname)) {
        var LN1X = window.__LN1 || { loans: {} };
        var exKind = (pathname.match(/loan-(register|schedule|payments|journals)\/export$/) || [])[1];
        var csvLines = [];
        if (exKind === "register") {
          csvLines.push("Loan ID,Reference,Loan Name,Lender,Type,Status,Principal,Outstanding,Instalment,Rate %,Term,Next Due");
          for (var lk3 in LN1X.loans) {
            var lx = LN1X.loans[lk3].loan;
            csvLines.push([lx.id, lx.loan_reference, '"' + String(lx.loan_name || "").replace(/"/g, '""') + '"', '"' + String(lx.lender_name || "").replace(/"/g, '""') + '"', lx.loan_type, lx.status, lx.principal_amount, lx.outstanding_principal, lx.payment_amount, lx.annual_interest_rate, lx.term_count, lx.next_due_date || ""].join(","));
          }
        } else {
          var exLoanId = parseInt(query.get("loan_id") || "0", 10);
          for (var lk4 in LN1X.loans) {
            if (exLoanId && Number(lk4) !== exLoanId) continue;
            var exRec = LN1X.loans[lk4];
            if (exKind === "schedule") {
              csvLines.push("Loan,Period,Due Date,Opening,Payment,Interest,Principal,Closing,Status");
              exRec.schedule.forEach(function (r) {
                csvLines.push([exRec.loan.loan_reference, r.period_no, r.due_date, r.opening_balance, r.scheduled_payment, r.scheduled_interest, r.scheduled_principal, r.closing_balance, r.payment_status].join(","));
              });
            } else if (exKind === "payments") {
              csvLines.push("Loan,Payment Date,Reference,Amount,Principal,Interest,Status,Journal");
              exRec.payments.forEach(function (p) {
                csvLines.push([exRec.loan.loan_reference, p.payment_date, p.reference, p.amount_paid, p.principal_amount, p.interest_amount, p.status, p.journal_id || ""].join(","));
              });
            } else {
              csvLines.push("Loan,Journal,Date,Description,Type");
              exRec.payments.forEach(function (p) {
                if (p.journal_id) csvLines.push([exRec.loan.loan_reference, p.journal_id, p.payment_date, '"' + String(p.description || "").replace(/"/g, '""') + '"', "payment"].join(","));
              });
              csvLines.push([exRec.loan.loan_reference, "LNJ-INC-" + exRec.loan.id, exRec.loan.start_date, '"' + "Loan inception — " + String(exRec.loan.loan_name || "").replace(/"/g, '""') + '"', "inception"].join(","));
            }
          }
        }
        return new Response(csvLines.join("\n") + "\n", {
          status: 200,
          headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment" }
        });
      }

      /* ════════════════ end ln1 — LOANS & FINANCING ════════════════ */
        /* ════════════════════════════════════════════════════════════
           bf5 — PLANNING & PERFORMANCE mock block (Task 20)
           Serves the Budgeting & Forecasting module (/forecast/*) and
           the Production Performance screen (/manufacturing/production-
           performance). All seeded values are NEW — nothing that
           already exists anywhere else is changed. Production
           performance rows are DERIVED AT RUNTIME from the existing
           cat3b manufacturing orders (window.__CAT3B), so the screen
           ties out to the Manufacturing BOM/Orders screens without
           touching any of their values.
           State persists on window.__BF5 across requests.
           Inserted BEFORE the generic fallback so /forecast and
           production-performance routes win.
           ════════════════════════════════════════════════════════════ */
      if (cidMatch && (
            pathname.indexOf("/forecast/") !== -1 ||
            pathname.indexOf("/manufacturing/production-performance") !== -1 ||
            pathname.indexOf("/dispatches/full") !== -1
          )) {
        var b5r2 = function (v) { return Math.round((Number(v) || 0) * 100) / 100; };
        if (!window.__BF5) {
          window.__BF5 = { seq: { budget: 2603, line: 5000, version: 2612, vline: 9000, driver: 2705, capex: 2635, import: 2710 }, budgets: [], lines: [], versions: [], vlines: [], drivers: [], imports: [], capex: [], actualsThrough: "2026-09" };

          /* ── helpers (attached to the store — available on every request) ── */
          window.__BF5.months = function (startIso, endIso) {
            var out = [], s = new Date(startIso + "T00:00:00Z"), e = new Date(endIso + "T00:00:00Z");
            var yy = s.getUTCFullYear(), mm = s.getUTCMonth();
            while (yy < e.getUTCFullYear() || (yy === e.getUTCFullYear() && mm <= e.getUTCMonth())) {
              out.push(yy + "-" + String(mm + 1).padStart(2, "0") + "-01");
              mm++; if (mm > 11) { mm = 0; yy++; }
            }
            return out;
          };
          window.__BF5.mk = function (iso) { return String(iso || "").slice(0, 7); };
          window.__BF5.budgetLines = function (bid) {
            return window.__BF5.lines.filter(function (l) { return Number(l.budget_id) === Number(bid); });
          };
          window.__BF5.versionLines = function (vid) {
            return window.__BF5.vlines.filter(function (l) { return Number(l.version_id) === Number(vid); });
          };

          /* ── account plan (codes/names mirror the existing CoA exactly) ── */
          window.__BF5.ACC = {
            "PL_REV_4000": { name: "Sales Revenue", section: "income", kind: "income", category: "Revenue" },
            "PL_IN_4100": { name: "Other Income", section: "income", kind: "income", category: "Revenue" },
            "PL_CGS_5000": { name: "Cost of Sales", section: "expenses", kind: "expense", category: "Cost of Sales" },
            "PL_EX_6000": { name: "Salaries & Wages", section: "expenses", kind: "expense", category: "Operating Expenses" },
            "PL_EX_6100": { name: "Rent Expense", section: "expenses", kind: "expense", category: "Operating Expenses" },
            "PL_EX_6200": { name: "Utilities", section: "expenses", kind: "expense", category: "Operating Expenses" },
            "PL_EX_6300": { name: "Fuel Expense", section: "expenses", kind: "expense", category: "Operating Expenses" },
            "PL_EX_6400": { name: "Office Supplies", section: "expenses", kind: "expense", category: "Operating Expenses" },
            "PL_EX_6500": { name: "Card & Transaction Fees", section: "expenses", kind: "expense", category: "Operating Expenses" }
          };

          /* ── FY2026 monthly plan (all NEW values) ── */
          window.__BF5.PLAN = {
            "PL_REV_4000": [78000, 78000, 82000, 82000, 86000, 86000, 88000, 88000, 90000, 90000, 94000, 98000],
            "PL_IN_4100": [1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200],
            "PL_CGS_5000": [32760, 32760, 34440, 34440, 36120, 36120, 36960, 36960, 37800, 37800, 39480, 41160],
            "PL_EX_6000": [22400, 22400, 22400, 22400, 22400, 22400, 22400, 22400, 22400, 22400, 22400, 22400],
            "PL_EX_6100": [6500, 6500, 6500, 6500, 6500, 6500, 6500, 6500, 6500, 6500, 6500, 6500],
            "PL_EX_6200": [1850, 1850, 1850, 1850, 1850, 1850, 1850, 1850, 1850, 1850, 1850, 1850],
            "PL_EX_6300": [2400, 2400, 2400, 2400, 2400, 2400, 2400, 2400, 2400, 2400, 2400, 2400],
            "PL_EX_6400": [900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900],
            "PL_EX_6500": [702, 702, 738, 738, 774, 774, 792, 792, 810, 810, 846, 882]
          };

          /* ── actual-vs-plan factors through Sep 2026 (NEW story values) ──
             income: >1 = favourable (ahead of plan); expenses: >1 = unfavourable */
          window.__BF5.FACTORS = {
            "PL_REV_4000": [0.98, 1.01, 0.97, 1.02, 0.99, 0.97, 1.00, 1.01, 1.02],
            "PL_IN_4100": [1.00, 0.92, 1.05, 0.95, 1.00, 0.90, 1.00, 1.04, 1.00],
            "PL_CGS_5000": [1.01, 1.02, 1.00, 1.03, 1.01, 1.02, 1.00, 1.01, 1.02],
            "PL_EX_6000": [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
            "PL_EX_6100": [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
            "PL_EX_6200": [0.98, 0.96, 1.01, 0.97, 0.99, 1.00, 0.98, 0.97, 0.99],
            "PL_EX_6300": [1.04, 1.02, 1.05, 1.03, 1.04, 1.06, 1.02, 1.03, 1.04],
            "PL_EX_6400": [0.95, 1.02, 0.98, 1.04, 0.97, 1.01, 0.99, 1.00, 0.96],
            "PL_EX_6500": [0.99, 1.01, 0.97, 1.02, 0.99, 0.97, 1.00, 1.01, 1.02]
          };
          window.__BF5.MONTHS = window.__BF5.months("2026-01-01", "2026-12-31");

          /* seeded ledger actuals: plan × factor, through Sep 2026 only */
          window.__BF5.actualFor = function (code, mth) {
            var mi = Number(String(mth).slice(5, 7)) - 1;
            var fac = window.__BF5.FACTORS[code];
            var planArr = window.__BF5.PLAN[code];
            if (!fac || mi >= fac.length || !planArr) return null;
            var mKeys = window.__BF5.MONTHS;
            for (var ix = 0; ix < mKeys.length; ix++) {
              if (window.__BF5.mk(mKeys[ix]) === window.__BF5.mk(mth)) {
                return b5r2(planArr[ix] * fac[mi]);
              }
            }
            return null;
          };

          /* ── budget lines ── */
          var b5lid = window.__BF5.seq.line;
          window.__BF5.MONTHS.forEach(function (mth, mi) {
            Object.keys(window.__BF5.PLAN).forEach(function (code) {
              window.__BF5.lines.push({
                id: ++b5lid, budget_id: 2601, account_code: code, account_name: window.__BF5.ACC[code].name,
                period_month: mth, amount: b5r2(window.__BF5.PLAN[code][mi]), line_type: "manual", source_type: "seed", notes: null
              });
            });
          });

          /* H2 2026 cost-control budget (Jul-Dec, expense focus) */
          var B5_PLAN_2602 = {
            "PL_CGS_5000": [36500, 36400, 37200, 37100, 38600, 39900],
            "PL_EX_6000": [22100, 22100, 22100, 22100, 22100, 22100],
            "PL_EX_6300": [2280, 2280, 2280, 2280, 2280, 2280],
            "PL_EX_6200": [1780, 1780, 1780, 1780, 1780, 1780],
            "PL_EX_6500": [780, 780, 795, 795, 825, 860]
          };
          var B5_MONTHS_2602 = window.__BF5.months("2026-07-01", "2026-12-31");
          B5_MONTHS_2602.forEach(function (mth, mi) {
            Object.keys(B5_PLAN_2602).forEach(function (code) {
              window.__BF5.lines.push({
                id: ++b5lid, budget_id: 2602, account_code: code, account_name: window.__BF5.ACC[code].name,
                period_month: mth, amount: b5r2(B5_PLAN_2602[code][mi]), line_type: "manual", source_type: "seed", notes: null
              });
            });
          });

          /* FY2027 growth budget (draft, key accounts only) */
          var B5_PLAN_2603 = {
            "PL_REV_4000": [96000, 96000, 101000, 101000, 106000, 106000, 109000, 109000, 112000, 112000, 117000, 122000],
            "PL_CGS_5000": [40320, 40320, 42420, 42420, 44520, 44520, 45780, 45780, 47040, 47040, 49140, 51240],
            "PL_EX_6000": [24800, 24800, 24800, 24800, 24800, 24800, 24800, 24800, 24800, 24800, 24800, 24800],
            "PL_EX_6100": [7150, 7150, 7150, 7150, 7150, 7150, 7150, 7150, 7150, 7150, 7150, 7150]
          };
          var B5_MONTHS_2603 = window.__BF5.months("2027-01-01", "2027-12-31");
          B5_MONTHS_2603.forEach(function (mth, mi) {
            Object.keys(B5_PLAN_2603).forEach(function (code) {
              window.__BF5.lines.push({
                id: ++b5lid, budget_id: 2603, account_code: code, account_name: window.__BF5.ACC[code].name,
                period_month: mth, amount: b5r2(B5_PLAN_2603[code][mi]), line_type: "manual", source_type: "seed", notes: null
              });
            });
          });

          /* ── budgets ── */
          window.__BF5.budgets = [
            { id: 2601, name: "FY2026 Operating Budget", description: "Board-approved operating plan for the 2026 financial year.", budget_type: "original", basis: "monthly", financial_year: "FY2026", period_start: "2026-01-01", period_end: "2026-12-31", currency: "ZAR", status: "approved", created_at: "2025-12-08 10:12:44", updated_at: "2026-02-02 09:05:10" },
            { id: 2602, name: "H2 2026 Cost Control Budget", description: "Half-year cost containment review across wages, fuel and utilities.", budget_type: "revised", basis: "monthly", financial_year: "FY2026", period_start: "2026-07-01", period_end: "2026-12-31", currency: "ZAR", status: "in_review", created_at: "2026-06-19 14:41:02", updated_at: "2026-06-26 11:18:37" },
            { id: 2603, name: "FY2027 Growth Budget", description: "Draft growth scenario — pending branch expansion decision.", budget_type: "original", basis: "monthly", financial_year: "FY2027", period_start: "2027-01-01", period_end: "2027-12-31", currency: "ZAR", status: "draft", created_at: "2026-09-28 16:22:19", updated_at: "2026-09-28 16:22:19" }
          ];

          /* ── forecast versions ──
             2611 upside draft, 2612 base (latest id wins "latest version") */
          window.__BF5.versions = [
            { id: 2611, budget_id: 2601, name: "FY2026 Upside Scenario", version_type: "forecast", scenario_name: "optimistic", actuals_to_date: "2026-09-30", period_start: "2026-01-01", period_end: "2026-12-31", currency: "ZAR", status: "draft", created_at: "2026-10-02 08:15:31", notes: "Stretch case — 6% above plan for the final quarter." },
            { id: 2612, budget_id: 2601, name: "FY2026 Base Forecast", version_type: "forecast", scenario_name: "base", actuals_to_date: "2026-09-30", period_start: "2026-01-01", period_end: "2026-12-31", currency: "ZAR", status: "approved", created_at: "2026-10-05 09:48:12", notes: "Actuals through September, adjusted plan for Q4." }
          ];

          /* version lines: YTD months mirror seeded actuals; future months are
             adjusted plan (base ×1.01 income / ×0.99 expenses; upside ×1.06 income). */
          var b5vid = window.__BF5.seq.vline;
          [2611, 2612].forEach(function (vId) {
            var upside = vId === 2611;
            window.__BF5.MONTHS.forEach(function (mth, mi) {
              var key = window.__BF5.mk(mth);
              Object.keys(window.__BF5.PLAN).forEach(function (code) {
                var amount;
                var acc = window.__BF5.ACC[code];
                if (key <= "2026-09") {
                  amount = window.__BF5.actualFor(code, key);
                } else if (acc.kind === "income") {
                  amount = b5r2(window.__BF5.PLAN[code][mi] * (upside ? 1.06 : 1.01));
                } else {
                  amount = b5r2(window.__BF5.PLAN[code][mi] * 0.99);
                }
                if (amount == null) return;
                window.__BF5.vlines.push({
                  id: ++b5vid, version_id: vId, account_code: code, account_name: acc.name,
                  period_month: mth, amount: amount, line_type: "forecast", source_type: "seed"
                });
              });
            });
          });

          /* ── planning drivers (NEW values, tied to FY2026 plan magnitudes) ── */
          window.__BF5.drivers = [
            { id: 2701, budget_id: 2601, version_id: 2612, account_code: "PL_REV_4000", account_name: "Sales Revenue", driver_name: "Units sold × average price", driver_type: "quantity_rate", quantity: 520, rate: 175, amount: 91000, period_month: "2026-10-01", formula_text: "520 units at R175 average basket" },
            { id: 2702, budget_id: 2601, version_id: 2612, account_code: "PL_CGS_5000", account_name: "Cost of Sales", driver_name: "Materials used × unit cost", driver_type: "quantity_rate", quantity: 520, rate: 78.5, amount: 40820, period_month: "2026-10-01", formula_text: "Material units at R78.50 blended cost" },
            { id: 2703, budget_id: 2601, version_id: 2612, account_code: "PL_EX_6300", account_name: "Fuel Expense", driver_name: "Delivery litres × pump price", driver_type: "quantity_rate", quantity: 102, rate: 23.4, amount: 2386.8, period_month: "2026-10-01", formula_text: "Fleet diesel at R23.40/litre" },
            { id: 2704, budget_id: 2601, version_id: 2612, account_code: "PL_EX_6000", account_name: "Salaries & Wages", driver_name: "Staff hours × blended rate", driver_type: "quantity_rate", quantity: 1400, rate: 16, amount: 22400, period_month: "2026-10-01", formula_text: "1,400 productive hours at R16 blended" }
          ];

          /* ── import batches ── */
          window.__BF5.imports = [
            { id: 2708, file_name: "budget-upload-fy2026-v3.csv", target_type: "budget", target_id: 2601, status: "completed", rows_success: 108, rows_total: 108, imported_at: "2026-01-06 09:14:22", imported_by: "Lerato Dlamini" },
            { id: 2709, file_name: "actuals-september-export.csv", target_type: "variance", target_id: 2601, status: "completed", rows_success: 54, rows_total: 54, imported_at: "2026-10-02 07:41:05", imported_by: "Thabo Nkosi" }
          ];

          /* ── capital expenditure plan (NEW values) ── */
          window.__BF5.capex = [
            { id: 2631, budget_id: 2601, version_id: 2612, asset_name: "CNC Plasma Cutter", asset_class: "Equipment", purchase_month: "2026-11-01", quantity: 1, unit_cost: 185000, total_cost: 185000, useful_life_months: 60, residual_value: 18500, depreciation_method: "straight_line", funding_source: "loan", loan_percentage: 60 },
            { id: 2632, budget_id: 2601, version_id: 2612, asset_name: "Delivery Vehicle — Isuzu NPR", asset_class: "Vehicles", purchase_month: "2026-12-01", quantity: 1, unit_cost: 320000, total_cost: 320000, useful_life_months: 60, residual_value: 48000, depreciation_method: "straight_line", funding_source: "loan", loan_percentage: 80 },
            { id: 2633, budget_id: 2601, version_id: 2612, asset_name: "Warehouse Racking System", asset_class: "Equipment", purchase_month: "2026-10-01", quantity: 1, unit_cost: 88000, total_cost: 88000, useful_life_months: 84, residual_value: 0, depreciation_method: "straight_line", funding_source: "cash", loan_percentage: 0 },
            { id: 2634, budget_id: 2601, version_id: 2612, asset_name: "Showroom Fit-out — Brakpan Branch", asset_class: "Leasehold Improvements", purchase_month: "2027-01-01", quantity: 1, unit_cost: 54000, total_cost: 54000, useful_life_months: 36, residual_value: 0, depreciation_method: "straight_line", funding_source: "cash", loan_percentage: 0 }
          ];

          /* ── variance engine: rows for a requested window ── */
          window.__BF5.variance = function (budgetId, periodStart, periodEnd, versionId) {
            var budget = window.__BF5.budgets.find(function (b) { return Number(b.id) === Number(budgetId); });
            if (!budget) return { rows: [], period_start: periodStart || "", period_end: periodEnd || "" };
            var start = (periodStart || budget.period_start).slice(0, 10);
            var end = (periodEnd || budget.period_end).slice(0, 10);
            var accs = {};
            window.__BF5.budgetLines(budgetId).forEach(function (l) {
              if (!accs[l.account_code]) accs[l.account_code] = { name: l.account_name, months: {} };
              accs[l.account_code].months[window.__BF5.mk(l.period_month)] = Number(l.amount || 0);
            });
            var vAccs = {};
            if (versionId) {
              window.__BF5.versionLines(versionId).forEach(function (l) {
                if (!vAccs[l.account_code]) vAccs[l.account_code] = {};
                vAccs[l.account_code][window.__BF5.mk(l.period_month)] = Number(l.amount || 0);
              });
            }
            var rows = [];
            Object.keys(accs).sort().forEach(function (code) {
              var info = accs[code];
              var meta = window.__BF5.ACC[code];
              var kind = meta ? meta.kind : (code.indexOf("PL_REV") === 0 || code.indexOf("PL_IN") === 0 ? "income" : "expense");
              var section = meta ? meta.section : (kind === "income" ? "income" : "expenses");
              Object.keys(info.months).sort().forEach(function (mth) {
                var first = mth + "-01";
                if (first < start || first > end) return;
                var planned = (vAccs[code] && vAccs[code][mth] != null) ? b5r2(vAccs[code][mth]) : b5r2(info.months[mth]);
                var actual = window.__BF5.actualFor(code, mth);
                if (actual == null) actual = 0;
                var row = {
                  period_month: mth, account_code: code, account_name: info.name,
                  section: meta ? meta.section : section,
                  category: meta ? meta.category : (kind === "income" ? "Revenue" : "Operating Expenses"),
                  planned_amount: planned, budget_amount: planned, actual_amount: actual
                };
                if (actual > 0) {
                  /* sign convention: positive variance = favourable for BOTH kinds
                     (income ahead of plan / expenses under plan) */
                  var diff = kind === "income" ? b5r2(actual - planned) : b5r2(planned - actual);
                  row.variance_amount = diff;
                  row.variance_percent = planned ? b5r2(diff / planned * 100) : null;
                  row.variance_classification = diff >= 0 ? "favourable" : "unfavourable";
                } else {
                  row.variance_amount = 0;
                  row.variance_percent = null;
                  row.variance_classification = null;
                }
                rows.push(row);
              });
            });
            rows.sort(function (a, b) { return a.period_month === b.period_month ? a.account_code.localeCompare(b.account_code) : a.period_month.localeCompare(b.period_month); });
            return { rows: rows, period_start: start, period_end: end };
          };

          /* ── production performance: derived from existing cat3b orders ── */
          window.__BF5.ppTiming = {
            /* standards pro-rated to stages completed so efficiency reads honestly */
            95: { stages_total: 4, stages_completed: 4, standard: 320, active: 352, downtime: 18, waiting: 24, machines: 2, m_std: 210, m_act: 228, m_util: 78.5 },
            96: { stages_total: 4, stages_completed: 2, standard: 240, active: 268, downtime: 12, waiting: 31, machines: 1, m_std: 90, m_act: 102, m_util: 71.0 },
            97: { stages_total: 4, stages_completed: 0, standard: 0, active: 0, downtime: 0, waiting: 0, machines: 0, m_std: 0, m_act: 0, m_util: null },
            100: { stages_total: 4, stages_completed: 1, standard: 80, active: 88, downtime: 4, waiting: 9, machines: 1, m_std: 40, m_act: 44, m_util: 66.5 }
          };
          window.__BF5.ppRow = function (o) {
            var t = window.__BF5.ppTiming[o.id] || { stages_total: 0, stages_completed: 0, standard: 0, active: 0, downtime: 0, waiting: 0, machines: 0, m_std: 0, m_act: 0, m_util: null };
            var plannedMat = 0, actualMat = 0;
            (o.materials || []).forEach(function (m) {
              plannedMat += (Number(m.planned_qty) || 0) * (Number(m.unit_cost) || 0);
              actualMat += (Number(m.actual_qty) || 0) * (Number(m.unit_cost) || 0);
            });
            plannedMat = b5r2(plannedMat); actualMat = b5r2(actualMat);
            var sellPrice = Number(o.bom_selling_price) || 0;
            var prodValue = b5r2((Number(o.actual_qty) || 0) * sellPrice);
            var contrib = b5r2(prodValue - actualMat);
            var margin = prodValue ? b5r2(contrib / prodValue * 100) : null;
            var plannedQty = Number(o.planned_qty) || 0, actualQty = Number(o.actual_qty) || 0;
            var completion = plannedQty ? b5r2(actualQty / plannedQty * 100) : 0;
            var eff = (t.standard > 0 && t.active > 0) ? b5r2(t.standard / t.active * 100) : null;
            var mEff = (t.m_std > 0 && t.m_act > 0) ? b5r2(t.m_std / t.m_act * 100) : null;
            return {
              manufacturing_order_id: o.id, mo_no: o.mo_no, finished_item_name: o.finished_item_name,
              bom_name: o.bom_name, tx_date: o.tx_date, status: o.status, unit: o.unit,
              planned_qty: plannedQty, actual_qty: actualQty, production_completion: completion,
              planned_material_cost: plannedMat, actual_material_cost: actualMat,
              material_cost_variance: b5r2(actualMat - plannedMat),
              production_value: prodValue, material_contribution: contrib,
              material_contribution_margin: margin,
              stages_total: t.stages_total, stages_completed: t.stages_completed,
              standard_stage_minutes: t.standard, actual_active_minutes: t.active,
              time_variance_minutes: t.active ? b5r2(t.active - t.standard) : null,
              time_efficiency_pct: eff, downtime_minutes: t.downtime, waiting_minutes: t.waiting,
              machine_count: t.machines, machine_standard_minutes: t.m_std, machine_active_minutes: t.m_act,
              machine_time_variance_minutes: t.m_act ? b5r2(t.m_act - t.m_std) : null,
              machine_time_efficiency_pct: mEff, machine_utilisation_pct: t.m_util
            };
          };
          window.__BF5.ppRows = function () {
            var src = (window.__CAT3B && window.__CAT3B.orders) || [];
            return src.map(window.__BF5.ppRow);
          };
        }
        var B5 = window.__BF5;
        var b5path = pathname.replace(/\/$/, "").replace(new RegExp("^/api/companies/" + cid), "");

        /* ══════════ /forecast/budgets ══════════ */
        if (b5path === "/forecast/budgets" && method === "GET") {
          var b5st = query.get("status");
          var b5list = B5.budgets.slice().sort(function (a, b) { return Number(b.id) - Number(a.id); });
          if (b5st && b5st !== "all") b5list = b5list.filter(function (b) { return String(b.status).toLowerCase() === String(b5st).toLowerCase(); });
          return json({ ok: true, data: b5list, items: b5list, total: b5list.length });
        }
        if (b5path === "/forecast/budgets" && method === "POST") {
          var b5nb = {}; try { b5nb = JSON.parse(opts.body || "{}"); } catch (e) { }
          if (!b5nb.name) return json({ ok: false, error: "Budget name is required." }, 400);
          var nb5 = {
            id: ++B5.seq.budget, name: b5nb.name, description: b5nb.description || null,
            budget_type: b5nb.budget_type || "original", basis: b5nb.basis || "monthly",
            financial_year: b5nb.financial_year || ("FY" + String(b5nb.period_start || "").slice(0, 4)),
            period_start: b5nb.period_start, period_end: b5nb.period_end,
            currency: b5nb.currency || "ZAR", status: "draft",
            created_at: "2026-10-15 09:00:00", updated_at: "2026-10-15 09:00:00"
          };
          B5.budgets.push(nb5);
          return json({ ok: true, data: nb5, budget: nb5 });
        }
        var mB5b = b5path.match(/^\/forecast\/budgets\/(\d+)$/);
        if (mB5b) {
          var b5b = B5.budgets.find(function (x) { return Number(x.id) === Number(mB5b[1]); });
          if (!b5b) return json({ ok: false, error: "Budget not found" }, 404);
          if (method === "GET") return json({ ok: true, data: b5b, budget: b5b });
          if (method === "PUT") {
            var ub5 = {}; try { ub5 = JSON.parse(opts.body || "{}"); } catch (e) { }
            ["name", "description", "budget_type", "basis", "financial_year", "period_start", "period_end", "currency"].forEach(function (k) {
              if (ub5[k] != null) b5b[k] = ub5[k];
            });
            b5b.updated_at = "2026-10-15 09:00:00";
            return json({ ok: true, data: b5b, budget: b5b });
          }
          if (method === "DELETE") {
            B5.budgets = B5.budgets.filter(function (x) { return Number(x.id) !== Number(b5b.id); });
            B5.lines = B5.lines.filter(function (x) { return Number(x.budget_id) !== Number(b5b.id); });
            return json({ ok: true });
          }
        }
        var mB5life = b5path.match(/^\/forecast\/budgets\/(\d+)\/(submit|approve|lock)$/);
        if (mB5life && method === "POST") {
          var b5lb = B5.budgets.find(function (x) { return Number(x.id) === Number(mB5life[1]); });
          if (!b5lb) return json({ ok: false, error: "Budget not found" }, 404);
          if (mB5life[2] === "submit") b5lb.status = "in_review";
          if (mB5life[2] === "approve") b5lb.status = "approved";
          if (mB5life[2] === "lock") b5lb.status = "locked";
          b5lb.updated_at = "2026-10-15 09:00:00";
          return json({ ok: true, data: b5lb, budget: b5lb });
        }

        /* ══════════ budget lines ══════════ */
        var mB5lines = b5path.match(/^\/forecast\/budgets\/(\d+)\/lines$/);
        if (mB5lines) {
          var b5bid = Number(mB5lines[1]);
          var b5budget = B5.budgets.find(function (x) { return Number(x.id) === b5bid; });
          if (method === "GET") {
            var bl5 = B5.budgetLines(b5bid);
            return json({ ok: true, data: bl5, items: bl5, total: bl5.length });
          }
          if (method === "POST" && b5budget) {
            var pb5 = {}; try { pb5 = JSON.parse(opts.body || "{}"); } catch (e) { }
            var incoming = Array.isArray(pb5.lines) ? pb5.lines : [pb5];
            var created5 = [];
            incoming.forEach(function (l5) {
              var code = String(l5.account_code || "").trim();
              if (!code || !l5.period_month) return;
              var meta = B5.ACC[code] || {};
              var existing = B5.lines.find(function (x) { return Number(x.budget_id) === b5bid && x.account_code === code && window.__BF5.mk(x.period_month) === window.__BF5.mk(l5.period_month); });
              if (existing) {
                existing.amount = b5r2(l5.amount);
                existing.line_type = l5.line_type || existing.line_type;
                existing.source_type = l5.source_type || "manual";
                created5.push(existing);
              } else {
                var nl5 = {
                  id: ++B5.seq.line, budget_id: b5bid, account_code: code,
                  account_name: l5.account_name || meta.name || code,
                  period_month: l5.period_month, amount: b5r2(l5.amount),
                  line_type: l5.line_type || "manual", source_type: l5.source_type || "manual",
                  notes: l5.notes || null
                };
                B5.lines.push(nl5); created5.push(nl5);
              }
            });
            return json({ ok: true, data: created5, lines: created5, count: created5.length });
          }
        }
        var mB5line = b5path.match(/^\/forecast\/budgets\/(\d+)\/lines\/(\d+)$/);
        if (mB5line) {
          var blOne = B5.lines.find(function (x) { return Number(x.id) === Number(mB5line[2]) && Number(x.budget_id) === Number(mB5line[1]); });
          if (!blOne) return json({ ok: false, error: "Budget line not found" }, 404);
          if (method === "PUT") {
            var ubl5 = {}; try { ubl5 = JSON.parse(opts.body || "{}"); } catch (e) { }
            if (ubl5.amount != null) blOne.amount = b5r2(ubl5.amount);
            if (ubl5.account_name) blOne.account_name = ubl5.account_name;
            return json({ ok: true, data: blOne, line: blOne });
          }
          if (method === "DELETE") {
            B5.lines = B5.lines.filter(function (x) { return Number(x.id) !== Number(blOne.id); });
            return json({ ok: true });
          }
        }

        /* ══════════ variance ══════════ */
        var mB5var = b5path.match(/^\/forecast\/budgets\/(\d+)\/variance$/);
        if (mB5var && method === "GET") {
          var vRes = window.__BF5.variance(Number(mB5var[1]), query.get("period_start"), query.get("period_end"), query.get("version_id") ? Number(query.get("version_id")) : null);
          return json({ ok: true, data: vRes, rows: vRes.rows, period_start: vRes.period_start, period_end: vRes.period_end, total: vRes.rows.length });
        }

        /* ══════════ forecast versions ══════════ */
        if (b5path === "/forecast/versions" && method === "GET") {
          var vlist5 = B5.versions.slice().sort(function (a, b) { return Number(b.id) - Number(a.id); });
          var vbid5 = query.get("budget_id");
          if (vbid5) vlist5 = vlist5.filter(function (v) { return Number(v.budget_id) === Number(vbid5); });
          return json({ ok: true, data: vlist5, items: vlist5, total: vlist5.length });
        }
        if (b5path === "/forecast/versions" && method === "POST") {
          var pv5 = {}; try { pv5 = JSON.parse(opts.body || "{}"); } catch (e) { }
          if (!pv5.name) return json({ ok: false, error: "Forecast name is required." }, 400);
          var nv5 = {
            id: ++B5.seq.version, budget_id: pv5.budget_id ? Number(pv5.budget_id) : null,
            name: pv5.name, version_type: pv5.version_type || "forecast",
            scenario_name: pv5.scenario === "custom" ? (pv5.custom_scenario || "custom") : (pv5.scenario_name || pv5.scenario || "base"),
            actuals_to_date: pv5.actuals_to_date || null,
            period_start: pv5.period_start, period_end: pv5.period_end,
            currency: pv5.currency || "ZAR", status: "draft",
            created_at: "2026-10-15 09:00:00", notes: pv5.notes || null
          };
          B5.versions.push(nv5);
          return json({ ok: true, data: nv5, version: nv5 });
        }
        var mB5v = b5path.match(/^\/forecast\/versions\/(\d+)$/);
        if (mB5v) {
          var v5 = B5.versions.find(function (x) { return Number(x.id) === Number(mB5v[1]); });
          if (!v5) return json({ ok: false, error: "Forecast version not found" }, 404);
          if (method === "GET") {
            var v5w = Object.assign({}, v5, { lines: window.__BF5.versionLines(v5.id) });
            return json({ ok: true, data: v5w, version: v5w });
          }
          if (method === "PUT") {
            var uv5 = {}; try { uv5 = JSON.parse(opts.body || "{}"); } catch (e) { }
            ["name", "scenario_name", "actuals_to_date", "period_start", "period_end", "status", "notes"].forEach(function (k) {
              if (uv5[k] != null) v5[k] = uv5[k];
            });
            return json({ ok: true, data: v5, version: v5 });
          }
        }
        var mB5vl = b5path.match(/^\/forecast\/versions\/(\d+)\/lines$/);
        if (mB5vl && method === "GET") {
          var vls5 = window.__BF5.versionLines(Number(mB5vl[1]));
          return json({ ok: true, data: vls5, items: vls5, total: vls5.length });
        }
        if (mB5vl && method === "POST") {
          var pvl5 = {}; try { pvl5 = JSON.parse(opts.body || "{}"); } catch (e) { }
          var b5vidNo = Number(mB5vl[1]);
          (Array.isArray(pvl5.lines) ? pvl5.lines : []).forEach(function (l5) {
            var code = String(l5.account_code || "").trim();
            if (!code || !l5.period_month) return;
            var meta = B5.ACC[code] || {};
            var ex = B5.vlines.find(function (x) { return Number(x.version_id) === b5vidNo && x.account_code === code && window.__BF5.mk(x.period_month) === window.__BF5.mk(l5.period_month); });
            if (ex) { ex.amount = b5r2(l5.amount); return; }
            B5.vlines.push({
              id: ++B5.seq.vline, version_id: b5vidNo, account_code: code,
              account_name: l5.account_name || meta.name || code,
              period_month: l5.period_month, amount: b5r2(l5.amount),
              line_type: l5.line_type || "forecast", source_type: "manual"
            });
          });
          return json({ ok: true, count: (Array.isArray(pvl5.lines) ? pvl5.lines.length : 0) });
        }

        /* ══════════ drivers ══════════ */
        if (b5path === "/forecast/drivers" && method === "GET") {
          var dlist5 = B5.drivers.slice().sort(function (a, b) { return Number(b.id) - Number(a.id); });
          var dbid5 = query.get("budget_id"); var dvid5 = query.get("version_id");
          if (dbid5) dlist5 = dlist5.filter(function (d) { return Number(d.budget_id) === Number(dbid5); });
          if (dvid5) dlist5 = dlist5.filter(function (d) { return Number(d.version_id) === Number(dvid5); });
          return json({ ok: true, data: dlist5, items: dlist5, total: dlist5.length });
        }
        if (b5path === "/forecast/drivers" && method === "POST") {
          var pd5 = {}; try { pd5 = JSON.parse(opts.body || "{}"); } catch (e) { }
          if (!pd5.account_code || !pd5.driver_name) return json({ ok: false, error: "Account code and driver name are required." }, 400);
          var nd5 = {
            id: ++B5.seq.driver, budget_id: pd5.budget_id ? Number(pd5.budget_id) : null,
            version_id: pd5.version_id ? Number(pd5.version_id) : null,
            account_code: pd5.account_code,
            account_name: pd5.account_name || (B5.ACC[pd5.account_code] ? B5.ACC[pd5.account_code].name : pd5.account_code),
            driver_name: pd5.driver_name, driver_type: pd5.driver_type || "quantity_rate",
            quantity: b5r2(pd5.quantity), rate: b5r2(pd5.rate), amount: b5r2(pd5.amount != null ? pd5.amount : (Number(pd5.quantity) || 0) * (Number(pd5.rate) || 0)),
            period_month: pd5.period_month || null, formula_text: pd5.formula_text || null
          };
          B5.drivers.push(nd5);
          return json({ ok: true, data: nd5, driver: nd5 });
        }

        /* ══════════ import batches ══════════ */
        if (b5path === "/forecast/import-batches" && method === "GET") {
          return json({ ok: true, data: B5.imports.slice().sort(function (a, b) { return Number(b.id) - Number(a.id); }), items: B5.imports, total: B5.imports.length });
        }

        /* ══════════ capex ══════════ */
        if (b5path === "/forecast/capex" && method === "GET") {
          var clist5 = B5.capex.slice().sort(function (a, b) { return Number(b.id) - Number(a.id); });
          var cbid5 = query.get("budget_id"); var cvid5 = query.get("version_id");
          if (cbid5) clist5 = clist5.filter(function (c) { return Number(c.budget_id) === Number(cbid5); });
          if (cvid5) clist5 = clist5.filter(function (c) { return Number(c.version_id) === Number(cvid5); });
          return json({ ok: true, data: clist5, items: clist5, total: clist5.length });
        }
        if (b5path === "/forecast/capex" && method === "POST") {
          var pc5 = {}; try { pc5 = JSON.parse(opts.body || "{}"); } catch (e) { }
          if (!pc5.asset_name) return json({ ok: false, error: "Asset or project name is required." }, 400);
          var nc5 = {
            id: ++B5.seq.capex, budget_id: pc5.budget_id ? Number(pc5.budget_id) : null,
            version_id: pc5.version_id ? Number(pc5.version_id) : null,
            asset_name: pc5.asset_name, asset_class: pc5.asset_class || null,
            purchase_month: pc5.purchase_month, quantity: Number(pc5.quantity) || 0,
            unit_cost: b5r2(pc5.unit_cost), total_cost: b5r2(pc5.total_cost != null ? pc5.total_cost : (Number(pc5.quantity) || 0) * (Number(pc5.unit_cost) || 0)),
            useful_life_months: pc5.useful_life_months || null, residual_value: b5r2(pc5.residual_value),
            depreciation_method: pc5.depreciation_method || "straight_line",
            funding_source: pc5.funding_source || "cash", loan_percentage: Number(pc5.loan_percentage) || 0
          };
          B5.capex.push(nc5);
          return json({ ok: true, data: nc5, capex: nc5 });
        }
        if (b5path === "/forecast/capex/impacts" && method === "GET") {
          return json({ ok: true, data: [], impacts: [], total: 0 });
        }
        var mB5c = b5path.match(/^\/forecast\/capex\/(\d+)$/);
        if (mB5c) {
          var c5 = B5.capex.find(function (x) { return Number(x.id) === Number(mB5c[1]); });
          if (!c5) return json({ ok: false, error: "Capital item not found" }, 404);
          if (method === "GET") return json({ ok: true, data: c5, capex: c5 });
          if (method === "PUT") {
            var uc5 = {}; try { uc5 = JSON.parse(opts.body || "{}"); } catch (e) { }
            ["asset_name", "asset_class", "purchase_month", "unit_cost", "total_cost", "useful_life_months", "residual_value", "depreciation_method", "funding_source", "loan_percentage"].forEach(function (k) {
              if (uc5[k] != null) c5[k] = uc5[k];
            });
            return json({ ok: true, data: c5, capex: c5 });
          }
          if (method === "DELETE") {
            B5.capex = B5.capex.filter(function (x) { return Number(x.id) !== Number(c5.id); });
            return json({ ok: true });
          }
        }

        /* ══════════ production performance ══════════ */
        if (b5path === "/manufacturing/production-performance" && method === "GET") {
          var ppRows = B5.ppRows();
          var fFrom = query.get("date_from"); var fTo = query.get("date_to"); var fStatus = query.get("status");
          if (fFrom) ppRows = ppRows.filter(function (r) { return String(r.tx_date) >= fFrom; });
          if (fTo) ppRows = ppRows.filter(function (r) { return String(r.tx_date) <= fTo; });
          if (fStatus) ppRows = ppRows.filter(function (r) { return String(r.status) === fStatus; });
          var lim5 = Number(query.get("limit")) || 200; var off5 = Number(query.get("offset")) || 0;
          var page5 = ppRows.slice(off5, off5 + lim5);
          var sum5 = {
            production_orders: ppRows.length,
            planned_material_cost: b5r2(ppRows.reduce(function (s, r) { return s + Number(r.planned_material_cost || 0); }, 0)),
            actual_material_cost: b5r2(ppRows.reduce(function (s, r) { return s + Number(r.actual_material_cost || 0); }, 0)),
            material_contribution: b5r2(ppRows.reduce(function (s, r) { return s + Number(r.material_contribution || 0); }, 0)),
            production_value: b5r2(ppRows.reduce(function (s, r) { return s + Number(r.production_value || 0); }, 0)),
            planned_qty: ppRows.reduce(function (s, r) { return s + Number(r.planned_qty || 0); }, 0),
            actual_qty: ppRows.reduce(function (s, r) { return s + Number(r.actual_qty || 0); }, 0),
            dispatched_qty: (window.__CAT3B && window.__CAT3B.orders || []).reduce(function (s, o) { return s + (o.dispatches || []).reduce(function (s2, d) { return s2 + (Number(d.quantity) || 0); }, 0); }, 0)
          };
          sum5.material_contribution_margin = sum5.production_value ? b5r2(sum5.material_contribution / sum5.production_value * 100) : null;
          sum5.finished_goods_remaining = Math.max(sum5.actual_qty - sum5.dispatched_qty, 0);
          return json({ ok: true, items: page5, rows: page5, summary: sum5, total: ppRows.length });
        }
        var mB5pp = b5path.match(/^\/manufacturing\/production-performance\/(\d+)$/);
        if (mB5pp) {
          var o5 = (window.__CAT3B && window.__CAT3B.orders || []).find(function (x) { return Number(x.id) === Number(mB5pp[1]); });
          if (!o5) return json({ ok: false, error: "Production order not found" }, 404);
          var row5 = B5.ppRow(o5);
          var fin5 = {
            planned_material_cost: row5.planned_material_cost, actual_material_cost: row5.actual_material_cost,
            material_cost_variance: row5.material_cost_variance, material_contribution: row5.material_contribution,
            production_value: row5.production_value, material_contribution_margin: row5.material_contribution_margin
          };
          var mats5 = (o5.materials || []).map(function (m) {
            var stdCost = b5r2((Number(m.planned_qty) || 0) * (Number(m.unit_cost) || 0));
            var actCost = b5r2((Number(m.actual_qty) || 0) * (Number(m.unit_cost) || 0));
            return {
              material_id: m.material_id, item_name: m.item_name, unit: m.unit, unit_cost: m.unit_cost,
              standard_qty: Number(m.planned_qty) || 0, actual_qty: Number(m.actual_qty) || 0,
              quantity_variance: b5r2((Number(m.actual_qty) || 0) - (Number(m.planned_qty) || 0)),
              standard_cost: stdCost, actual_cost: actCost,
              cost_variance: b5r2(actCost - stdCost)
            };
          });
          var labour5 = b5r2((o5.management_costs && o5.management_costs.labour || []).reduce(function (s, l) { return s + (Number(l.labour_cost) || 0); }, 0));
          var ovh5 = b5r2((o5.management_costs && o5.management_costs.overhead || []).reduce(function (s, l) { return s + (Number(l.allocated_amount) || 0); }, 0));
          var det5 = {
            order: {
              id: o5.id, mo_no: o5.mo_no, finished_item_name: o5.finished_item_name, bom_name: o5.bom_name,
              bom_code: o5.bom_code, tx_date: o5.tx_date, status: o5.status, unit: o5.unit,
              planned_qty: o5.planned_qty, actual_qty: o5.actual_qty, location: o5.location, notes: o5.notes
            },
            financial: fin5,
            production_summary: o5.production_summary || null,
            materials: mats5,
            costing: { labour_cost: labour5, manufacturing_overhead: ovh5, note: "Labour and overhead from workshop management costs; not yet absorbed into full production costing." },
            dispatches: (o5.dispatches || []).map(function (d) {
              return Object.assign({}, d, { unit: o5.unit, dispatch_cost: 0, customer_code: null });
            })
          };
          /* NOTE: flat payload — renderDetail() in dashboard.js reads
             payload.order / payload.financial / payload.materials directly,
             it does NOT unwrap an envelope. */
          return json({
            order: det5.order, financial: det5.financial, production_summary: det5.production_summary,
            materials: det5.materials, costing: det5.costing, dispatches: det5.dispatches
          });
        }
        var mB5df = b5path.match(/^\/manufacturing\/orders\/(\d+)\/dispatches\/full$/);
        if (mB5df && method === "GET") {
          var od5 = (window.__CAT3B && window.__CAT3B.orders || []).find(function (x) { return Number(x.id) === Number(mB5df[1]); });
          if (!od5) return json({ ok: false, error: "Production batch not found" }, 404);
          return json({ ok: true, dispatches: (od5.dispatches || []).map(function (d) { return Object.assign({}, d, { unit: od5.unit, dispatch_cost: 0, customer_code: null }); }) });
        }
      }
      /* ════════════════ end bf5 — PLANNING & PERFORMANCE ════════════════ */







    /* ══════════════════════════════════════════════════════════════
       lr1 — LESSORS mock block (Task 22)
       Seeds Master Records › Lessors: register + detail + quick add
       + save + delete + contacts + ensure-vendor + CSV export token.
       All data is NEW (no existing values changed). State persists
       on window.__LR1 so the register reflects created/updated rows.
       Inserted BEFORE the generic fallback so /lessors routes win.
       ══════════════════════════════════════════════════════════════ */
      if (cidMatch && pathname.indexOf("/lessors") !== -1) {
        if (!window.__LR1) {
          window.__LR1 = { seq: { lessor: 607, contact: 6101 }, lessors: {} };
          var lrSeed = [
            {
              id: "601", name: "Cape Fitness Equipment Rentals",
              reg_no: "2014/227899/07", vat_no: "4890123456",
              email: "leases@capefitness.co.za", phone: "+27 21 555 0142",
              address: "12 Salt River Road, Salt River, Cape Town, 7925",
              is_related_party: false, active: true, vendor_id: null,
              created_at: "2024-02-12 09:14:00",
              contacts: [
                { id: "6101", full_name: "Nadia Jacobs", email: "nadia@capefitness.co.za", phone: "+27 82 555 0142", phone_type: "mobile", role_title: "Lease account manager", is_primary: true, active: true },
                { id: "6102", full_name: "Pieter van Wyk", email: "pieter@capefitness.co.za", phone: "+27 21 555 0143", phone_type: "work", role_title: "Maintenance coordinator", is_primary: false, active: true }
              ]
            },
            {
              id: "602", name: "Signal Hill Property Holdings",
              reg_no: "2009/118443/07", vat_no: "4123345567",
              email: "leases@signalhillprop.co.za", phone: "+27 21 555 0198",
              address: "11 Bree Street, Cape Town CBD, 8001",
              is_related_party: false, active: true, vendor_id: null,
              created_at: "2023-11-03 14:22:00",
              contacts: [
                { id: "6103", full_name: "Ayesha Patel", email: "ayesha@signalhillprop.co.za", phone: "+27 83 555 0198", phone_type: "mobile", role_title: "Portfolio manager", is_primary: true, active: true }
              ]
            },
            {
              id: "603", name: "Karoo Fleet Leasing (Pty) Ltd",
              reg_no: "2016/334521/07", vat_no: "4768899001",
              email: "fleet@karoofleet.co.za", phone: "+27 41 555 0177",
              address: "3 Buffer Interchange, Port Elizabeth, 6001",
              is_related_party: false, active: true, vendor_id: null,
              created_at: "2024-06-18 10:05:00",
              contacts: [
                { id: "6104", full_name: "Johan Botha", email: "johan@karoofleet.co.za", phone: "+27 84 555 0177", phone_type: "mobile", role_title: "Key accounts", is_primary: true, active: true }
              ]
            },
            {
              id: "604", name: "Montclare Family Trust",
              reg_no: null, vat_no: null,
              email: "admin@montclaretrust.co.za", phone: "+27 11 555 0121",
              address: "88 Rivonia Road, Sandton, 2196",
              is_related_party: true, active: true, vendor_id: null,
              created_at: "2025-01-20 08:47:00",
              contacts: [
                { id: "6105", full_name: "Helena Montclare", email: "helena@montclaretrust.co.za", phone: "+27 82 555 0121", phone_type: "mobile", role_title: "Trustee", is_primary: true, active: true }
              ]
            },
            {
              id: "605", name: "Altitude Office Systems",
              reg_no: "2018/441207/08", vat_no: "4310776223",
              email: "rentals@altitudeoffice.co.za", phone: "+27 11 555 0155",
              address: "5 Docker Street, Randburg, 2194",
              is_related_party: false, active: false, vendor_id: null,
              created_at: "2023-05-09 16:31:00",
              contacts: [
                { id: "6106", full_name: "Derek Naidoo", email: "derek@altitudeoffice.co.za", phone: "+27 79 555 0155", phone_type: "mobile", role_title: "Rental desk", is_primary: true, active: false }
              ]
            },
            {
              id: "606", name: "False Bay Cold Chain Solutions",
              reg_no: "2020/518934/07", vat_no: "4990012345",
              email: "contracts@falsebaycold.co.za", phone: "+27 21 555 0171",
              address: "2 Fischer Boulevard, Milnerton, 7441",
              is_related_party: false, active: true, vendor_id: null,
              created_at: "2025-08-14 11:58:00",
              contacts: [
                { id: "6107", full_name: "Sipho Dlamini", email: "sipho@falsebaycold.co.za", phone: "+27 71 555 0171", phone_type: "mobile", role_title: "Contracts lead", is_primary: true, active: true }
              ]
            }
          ];
          lrSeed.forEach(function (l) { window.__LR1.lessors[String(l.id)] = l; });
        }
        var lrAll = function () {
          return Object.keys(window.__LR1.lessors).map(function (k) { return window.__LR1.lessors[k]; });
        };

        /* POST /lessors/quick — must match before /lessors/:id */
        if (/\/lessors\/quick$/.test(pathname) && (opts.method || "GET") === "POST") {
          var lrB = {};
          try { lrB = JSON.parse(opts.body || "{}"); } catch (e) {}
          var lrId = String(window.__LR1.seq.lessor++);
          var lrRow = {
            id: lrId,
            name: (lrB.name || "").trim() || "Unnamed lessor",
            reg_no: lrB.reg_no || null,
            vat_no: lrB.vat_no || null,
            email: lrB.email || null,
            phone: lrB.phone || null,
            address: lrB.address || null,
            is_related_party: !!lrB.related,
            active: true,
            vendor_id: null,
            created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
            contacts: []
          };
          window.__LR1.lessors[lrId] = lrRow;
          return json(lrRow, 201);
        }

        /* /lessors/:id/contacts/:cid */
        var lrCM = pathname.match(/\/lessors\/(\d+)\/contacts\/(\d+)$/);
        if (lrCM) {
          var lrParent1 = window.__LR1.lessors[lrCM[1]];
          if (!lrParent1) return json({ ok: false, message: "Lessor not found" }, 404);
          lrParent1.contacts = lrParent1.contacts || [];
          var lrCi = -1;
          for (var lci = 0; lci < lrParent1.contacts.length; lci++) {
            if (String(lrParent1.contacts[lci].id) === lrCM[2]) { lrCi = lci; break; }
          }
          if ((opts.method || "GET") === "DELETE") {
            if (lrCi >= 0) lrParent1.contacts.splice(lrCi, 1);
            return json({ ok: true });
          }
          if ((opts.method || "GET") === "PUT") {
            var lrUb = {};
            try { lrUb = JSON.parse(opts.body || "{}"); } catch (e) {}
            if (lrCi >= 0) {
              lrParent1.contacts[lrCi] = Object.assign({ id: lrCM[2] }, lrParent1.contacts[lrCi], lrUb, { id: lrCM[2] });
              return json(lrParent1.contacts[lrCi]);
            }
            return json({ ok: false, message: "Contact not found" }, 404);
          }
          var lrC1 = lrCi >= 0 ? lrParent1.contacts[lrCi] : null;
          return lrC1 ? json(lrC1) : json({ ok: false, message: "Contact not found" }, 404);
        }

        /* /lessors/:id/contacts */
        var lrCL = pathname.match(/\/lessors\/(\d+)\/contacts$/);
        if (lrCL) {
          var lrParent2 = window.__LR1.lessors[lrCL[1]];
          if (!lrParent2) return json({ ok: false, message: "Lessor not found" }, 404);
          lrParent2.contacts = lrParent2.contacts || [];
          if ((opts.method || "GET") === "POST") {
            var lrCb = {};
            try { lrCb = JSON.parse(opts.body || "{}"); } catch (e) {}
            var lrNewC = {
              id: String(window.__LR1.seq.contact++),
              full_name: (lrCb.full_name || "").trim() || "Unnamed contact",
              email: lrCb.email || null,
              phone: lrCb.phone || null,
              phone_type: lrCb.phone_type || "mobile",
              role_title: lrCb.role_title || null,
              is_primary: !!lrCb.is_primary,
              active: lrCb.active !== false
            };
            lrParent2.contacts.push(lrNewC);
            return json(lrNewC, 201);
          }
          return json({ ok: true, rows: lrParent2.contacts.slice(), total: lrParent2.contacts.length });
        }

        /* /lessors/:id/ensure-vendor */
        var lrEV = pathname.match(/\/lessors\/(\d+)\/ensure-vendor$/);
        if (lrEV) {
          var lrT = window.__LR1.lessors[lrEV[1]];
          return json({ ok: true, vendor_id: lrT ? (lrT.vendor_id || null) : null, message: "No matching vendor profile in demo — nothing linked." });
        }

        /* /lessors/:id — detail / save / delete */
        var lrD = pathname.match(/\/lessors\/(\d+)$/);
        if (lrD) {
          var lrCur = window.__LR1.lessors[lrD[1]];
          if (!lrCur) return json({ ok: false, message: "Lessor not found" }, 404);
          var lrMth = opts.method || "GET";
          if (lrMth === "PUT" || lrMth === "PATCH") {
            var lrSb = {};
            try { lrSb = JSON.parse(opts.body || "{}"); } catch (e) {}
            ["name", "reg_no", "vat_no", "email", "phone", "address"].forEach(function (f) {
              if (lrSb[f] !== undefined) lrCur[f] = lrSb[f];
            });
            if (lrSb.is_related_party !== undefined) lrCur.is_related_party = !!lrSb.is_related_party;
            if (lrSb.active !== undefined) lrCur.active = !!lrSb.active;
            if (lrSb.is_active !== undefined) lrCur.active = !!lrSb.is_active;
            return json(lrCur);
          }
          if (lrMth === "DELETE") {
            delete window.__LR1.lessors[lrD[1]];
            return json({ ok: true });
          }
          var lrDetail = Object.assign({}, lrCur);
          delete lrDetail.contacts;
          return json(lrDetail);
        }

        /* GET /lessors — the register */
        return json({ ok: true, rows: lrAll(), total: lrAll().length });
      }

      /* lr1b — lessors CSV export + shared export token (lessors-list only) */
      if (cidMatch && /\/reports\/export-token$/.test(pathname) && (opts.method || "GET") === "POST") {
        return json({ ok: true, token: "demo-export-token" });
      }
      if (cidMatch && /\/reports\/lessors-list\/export$/.test(pathname)) {
        var lrCsv = [["ID", "Name", "Reg no", "VAT no", "Email", "Phone", "Related party", "Status", "Created"].join(",")];
        lrAll().forEach(function (l) {
          lrCsv.push([
            l.id, '"' + String(l.name || "").replace(/"/g, '""') + '"',
            l.reg_no || "", l.vat_no || "", l.email || "", '"' + String(l.phone || "") + '"',
            l.is_related_party ? "Yes" : "No", l.active === false ? "Inactive" : "Active",
            l.created_at || ""
          ].join(","));
        });
        return new Response(lrCsv.join("\r\n") + "\r\n", {
          status: 200,
          headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment" }
        });
      }

    /* ════════════════════════════════════════════════════════════════
       tr2 — INCOME TAX WORKSPACE DEEP DATA (Tax Recon screen)
       ------------------------------------------------------------------
       Routes (previously fell through to the empty generic fallback,
       so the screen showed a 0-profile register):
         GET   /api/companies/:cid/asset-tax/profiles
         POST  /api/companies/:cid/asset-tax/profiles/backfill
         PUT   /api/companies/:cid/asset-tax/profiles/:id   (save config)
         GET   /api/companies/:cid/asset-tax/authorities
         GET   /api/companies/:cid/asset-tax/rules
         GET   /api/companies/:cid/asset-tax/runs
         POST  /api/companies/:cid/asset-tax/runs/:id/calculate
         GET   /api/companies/:cid/asset-tax/reconciliation
         GET   /api/companies/:cid/asset-tax/computation
       Every figure is pre-existing or derived:
         185,000 (BS Equipment at Cost) → 3 profiles
         96,500 + 52,300 + 36,200 = 185,000 exactly
         acc dep 46,250 = 18,500 x 2.5 → annual book dep 18,500
         allowances 9,650 + 10,460 = 20,110 → tax WDV 128,690
         carrying 138,750 (BS) → temp diff 10,060 · DTA 2,716.20
         computation 41,865 + 18,500 − 20,110 = 40,255
       ════════════════════════════════════════════════════════════════ */
    if (cidMatch && pathname.indexOf("/asset-tax/") !== -1) {
      if (!window.__TR2) {
        window.__TR2 = {
          authorities: [
            { id: 1, code: "RSL", name: "Revenue Services Lesotho", is_active: true },
            { id: 2, code: "SARS", name: "South African Revenue Service", is_active: true },
            { id: 3, code: "BURS", name: "Botswana Unified Revenue Service", is_active: true }
          ],
          rules: [
            { id: 11, tax_authority_id: 1, rule_code: "WT_PLANT_10", rule_name: "Wear & Tear — Plant & Machinery", method: "Straight line", rate_percent: 10, useful_life_years: 10, notes: "Schedules allowance on the straight-line cost basis for manufacturing plant.", is_active: true },
            { id: 12, tax_authority_id: 1, rule_code: "WT_TOOLS_20", rule_name: "Wear & Tear — Tools & Equipment", method: "Straight line", rate_percent: 20, useful_life_years: 5, notes: "Accelerated write-off for light tools and workshop equipment.", is_active: true },
            { id: 13, tax_authority_id: 1, rule_code: "WT_FITTINGS_1667", rule_name: "Wear & Tear — Furniture & Fittings", method: "Straight line", rate_percent: 16.67, useful_life_years: 6, notes: "Office furniture and shop fit-out at 16.67% per annum.", is_active: true },
            { id: 14, tax_authority_id: 2, rule_code: "SARS_S14_e_1", rule_name: "s11(e) — Cost of manufacture / plant", method: "Straight line", rate_percent: 10, useful_life_years: 10, notes: "SARS s11(e) wear-and-tear on machinery and plant.", is_active: true },
            { id: 15, tax_authority_id: 3, rule_code: "BURS_PLANT_10", rule_name: "Capital allowances — Plant", method: "Straight line", rate_percent: 10, useful_life_years: 10, notes: "BURS capital allowance schedule for plant and machinery.", is_active: true }
          ],
          profiles: [
            { profile_id: 7101, asset_name: "CNC Machining Centre", asset_code: "FA-EQ-001", asset_class: "Plant & Machinery", asset_class_group: "Manufacturing", tax_authority_id: 1, tax_authority_code: "RSL", allowance_rule_id: 11, rule_name: "Wear & Tear — Plant & Machinery", method: "Straight line", rate_percent: 10, tax_cost: 96500, tax_start_date: "2025-03-01", qualifying_percent: 100, private_use_percent: 0, is_tax_depreciable: true, is_active: true, config_status: "configured", notes: "Installed capacity upgrade. Tax cost equals book cost." },
            { profile_id: 7102, asset_name: "Workshop Tools & Equipment", asset_code: "FA-EQ-002", asset_class: "Tools & Equipment", asset_class_group: "Manufacturing", tax_authority_id: 1, tax_authority_code: "RSL", allowance_rule_id: 12, rule_name: "Wear & Tear — Tools & Equipment", method: "Straight line", rate_percent: 20, tax_cost: 52300, tax_start_date: "2025-06-14", qualifying_percent: 100, private_use_percent: 0, is_tax_depreciable: true, is_active: true, config_status: "configured", notes: "Bundled workshop tooling acquired June 2025." },
            { profile_id: 7103, asset_name: "Office Fit-out", asset_code: "FA-EQ-003", asset_class: "Furniture & Fittings", asset_class_group: "General", tax_authority_id: 1, tax_authority_code: "RSL", allowance_rule_id: null, rule_name: null, method: null, rate_percent: null, tax_cost: null, tax_start_date: null, qualifying_percent: null, private_use_percent: null, is_tax_depreciable: false, is_active: true, config_status: "not_configured", notes: "Awaiting tax classification before the next allowance run." }
          ],
          runs: [
            { id: 8801, tax_authority_id: 1, tax_authority_code: "RSL", tax_year: 2026, tax_year_start: "2026-03-01", tax_year_end: "2027-02-28", status: "calculated", line_count: 2, total_capital_allowance: 20110, closing_tax_wdv: 128690, notes: "FY2026 allowance run — two configured profiles." }
          ]
        };
      }

      var TR2 = window.__TR2;

      if (/\/asset-tax\/profiles$/.test(pathname)) {
        return json({ ok: true, items: TR2.profiles, total: TR2.profiles.length });
      }
      if (/\/asset-tax\/profiles\/backfill$/.test(pathname) && method === "POST") {
        return json({ ok: true, items: TR2.profiles, total: TR2.profiles.length, synced: TR2.profiles.length });
      }
      if (/\/asset-tax\/profiles\/([^\/]+)$/.test(pathname) && method === "PUT") {
        var tr2Pid = Number(pathname.match(/\/asset-tax\/profiles\/([^\/]+)$/)[1]);
        var tr2Body = {};
        try { tr2Body = JSON.parse(opts.body || "{}"); } catch (e) {}
        var tr2Profile = TR2.profiles.filter(function (p) { return Number(p.profile_id) === tr2Pid; })[0];
        if (tr2Profile && tr2Body && typeof tr2Body === "object") {
          Object.keys(tr2Body).forEach(function (k) { tr2Profile[k] = tr2Body[k]; });
          var tr2Rule = TR2.rules.filter(function (r) { return Number(r.id) === Number(tr2Profile.allowance_rule_id); })[0];
          if (tr2Rule) {
            tr2Profile.rule_name = tr2Rule.rule_name;
            tr2Profile.method = tr2Rule.method;
            tr2Profile.rate_percent = tr2Rule.rate_percent;
          }
          tr2Profile.config_status =
            tr2Profile.allowance_rule_id && tr2Profile.tax_cost != null ? "configured" : "not_configured";
        }
        return json({ ok: true, item: tr2Profile || null });
      }
      if (/\/asset-tax\/authorities$/.test(pathname)) {
        return json({ ok: true, items: TR2.authorities, total: TR2.authorities.length });
      }
      if (/\/asset-tax\/rules$/.test(pathname)) {
        var tr2Auth = query.get("tax_authority_id");
        var tr2Rules = tr2Auth
          ? TR2.rules.filter(function (r) { return Number(r.tax_authority_id) === Number(tr2Auth); })
          : TR2.rules;
        return json({ ok: true, items: tr2Rules, total: tr2Rules.length });
      }
      if (/\/asset-tax\/runs$/.test(pathname)) {
        return json({ ok: true, items: TR2.runs, total: TR2.runs.length });
      }
      if (/\/asset-tax\/runs\/([^\/]+)\/calculate$/.test(pathname) && method === "POST") {
        var tr2Run = TR2.runs.filter(function (r) { return Number(r.id) === Number(pathname.match(/\/asset-tax\/runs\/([^\/]+)\/calculate$/)[1]); })[0];
        if (tr2Run) tr2Run.status = "calculated";
        return json({ ok: true, item: tr2Run || null });
      }
      if (/\/asset-tax\/reconciliation$/.test(pathname)) {
        return json({ ok: true, runs: [
          {
            id: 8801, tax_authority_id: 1, tax_authority_code: "RSL", tax_year: 2026,
            tax_year_start: "2026-03-01", tax_year_end: "2027-02-28", status: "calculated",
            asset_count: 3, book_depreciation: 18500, capital_allowance: 20110,
            net_tax_adjustment: 1610, accounting_carrying_amount: 138750,
            closing_tax_wdv: 128690, temporary_difference: 10060
          }
        ]});
      }
      if (/\/asset-tax\/computation$/.test(pathname)) {
        return json({
          ok: true,
          tax_authority_code: "RSL", tax_year: 2026,
          tax_year_start: "2026-03-01", tax_year_end: "2027-02-28",
          accounting_profit: 41865,
          book_depreciation_addback: 18500,
          capital_allowance_deduction: 20110,
          estimated_taxable_income: 40255
        });
      }
      /* fall through to the rp1 chain for any other asset-tax path */
    }

    /* ════════════════════════════════════════════════════════════════
       rp1 — REPORTS & STATEMENTS DEEP DATA (Task 11)
       ------------------------------------------------------------------
       Full statements for #screen-reports (Statement Viewer +
       Interpretation tiles + Notes editor). Every figure is a
       PRE-EXISTING demo value or an arithmetic derivation of one —
       nothing new is invented:

       · YTD P&L   ← TB_ROWS   (rev 142,300 · cos 58,120 · expenses
         22,000+12,000+3,680+2,875+1,140+620 = 42,315 · net 41,865
         = "Current Year Earnings" in BS mini — ties out exactly)
       · Month P&L ← PNL_ROWS / SNAPSHOT.pnl (75,000 / 24,300 /
         36,500 / 14,200)
       · BS        ← BS_ROWS (assets 800,515 = liabilities 194,060 +
         equity 606,455 · check 0)
       · CF        ← CF_ROWS (11,500 − 36,115 · inv 0 · fin 50,000 →
         net 25,385) · closing 488,740 = "Bank & Cash" in BS mini ·
         opening 463,355 = closing − net movement (derived)
       · SOCIE     ← equity per BS mini (100,000 + 464,590 opening;
         +41,865 profit → 606,455 closing = Total Equity)

       Routes (previously fell through to the empty generic fallback):
         GET  /api/companies/:cid/pnl
         GET  /api/companies/:cid/bs
         GET  /api/companies/:cid/socie
         GET  /api/companies/:cid/cashflow
         GET  /api/companies/:cid/fs-notes/:key
         POST /api/companies/:cid/fs-notes/:key        (save edit)
         POST /api/companies/:cid/fs-notes/:key/reset  (restore draft)
       State (saved custom notes) persists on window.__RP1.
       Mini routes (/pnl_mini, /bs_mini, /cashflow_mini, /trial_balance)
       are matched EARLIER in the chain and are untouched.
       ════════════════════════════════════════════════════════════════ */
    if (!window.__RP1) window.__RP1 = { notes: {} };

    var RP1_TODAY = iso(Y, M, day(now.getDate()));
    var RP1_YEAR_START = iso(Y, 0, 1);

    /* -- period resolution: month story vs YTD story -- */
    function rp1Period(query) {
      var from = query.get("from") || "";
      var to = query.get("to") || "";
      var preset = query.get("preset") || "";
      var isMonth =
        preset === "this_month" || preset === "prev_month" ||
        (from && to && from >= monthStart && to <= monthEnd);
      var f = from || (isMonth ? monthStart : RP1_YEAR_START);
      var t = to || (isMonth ? monthEnd : RP1_TODAY);
      var label = (f && t) ? (f + " → " + t) : (preset || SNAPSHOT.meta.label);
      return { isMonth: isMonth, from: f, to: t, label: label, preset: preset };
    }

    function rp1PnlPayload(query) {
      var P = rp1Period(query);
      var template = query.get("template") || "ifrs";
      var basis = query.get("basis") || "external";
      var isMgmt = basis === "management" || basis === "internal";
      var colsMode = Number(query.get("cols_mode")) || 1;
      var compare = (query.get("compare") || "none").toLowerCase();

      /* rp3 seeds (NEW demo values, disclosed in worklog): prior-period /
         multi-year comparatives and FY2026 budget. The "cur" column carries
         the pre-existing statement values byte-identically in every mode. */
      var rp3Series = P.isMonth
        ? {
            rev: 75000, cos: 24300,
            opex: { "Operating expenses": -36500 },
            pri: { rev: 71800, cos: 23400, opex: { "Operating expenses": -34900 } },
            bud: { rev: 74200, cos: 24650, opex: { "Operating expenses": -36150 } }
          }
        : {
            rev: 142300, cos: 58120,
            opex: {
              "Salaries & wages": -22000,
              "Rent expense": -12000,
              "Utilities": -3680,
              "Fuel expense": -2875,
              "Office supplies": -1140,
              "Card & transaction fees": -620
            },
            pri: {
              rev: 134900, cos: 55400,
              opex: {
                "Salaries & wages": -20800,
                "Rent expense": -11500,
                "Utilities": -3300,
                "Fuel expense": -2650,
                "Office supplies": -1050,
                "Card & transaction fees": -580
              }
            },
            bud: {
              rev: 141000, cos: 58500,
              opex: {
                "Salaries & wages": -22400,
                "Rent expense": -12000,
                "Utilities": -3600,
                "Fuel expense": -2750,
                "Office supplies": -1150,
                "Card & transaction fees": -640
              }
            }
          };

      /* derive totals from components so every column cross-foots exactly
         (exp is the SIGNED expense total, i.e. negative; np = gp + exp) */
      function rp3Derived(s) {
        var exp = 0;
        Object.keys(s.opex).forEach(function (k) { exp += s.opex[k]; });
        var gp = s.rev - s.cos;
        return { rev: s.rev, cos: s.cos, gp: gp, exp: exp, np: gp + exp, opex: s.opex };
      }
      var CUR = rp3Derived(rp3Series);
      var PRI = rp3Derived(rp3Series.pri);
      var BUD = rp3Derived(rp3Series.bud);
      /* multi-year back-history: prior year scaled on components (rounded) */
      function rp3Scale(S, f) {
        function r(v) { return Math.round(v * f); }
        var opex = {};
        Object.keys(S.opex).forEach(function (k) { opex[k] = r(S.opex[k]); });
        return rp3Derived({ rev: r(S.rev), cos: r(S.cos), opex: opex });
      }
      var P2 = rp3Scale(rp3Series.pri, 0.94);
      var P3 = rp3Scale(rp3Series.pri, 0.88);

      var multiYear = (!isMgmt && compare === "multi_year");
      var withPrior = (!isMgmt && (compare === "prior_period" || compare === "prior_year"));
      var mgmt2 = isMgmt && colsMode === 2;
      var mgmt3 = isMgmt && colsMode === 3;

      var columns;
      if (mgmt3) {
        columns = [
          { key: "c1", label: "Actual" },
          { key: "c2", label: "Budget" },
          { key: "c3", label: "Variance" }
        ];
      } else if (mgmt2) {
        columns = [
          { key: "cur", label: "Actual" },
          { key: "bud", label: "Budget" }
        ];
      } else if (multiYear) {
        columns = [
          { key: "cur", label: "FY2026" },
          { key: "pri", label: "FY2025" },
          { key: "p2", label: "FY2024" },
          { key: "p3", label: "FY2023" }
        ];
      } else if (withPrior) {
        columns = [
          { key: "cur", label: "Current period" },
          { key: "pri", label: compare === "prior_year" ? "Prior year" : "Prior period" }
        ];
      } else {
        columns = [{ key: "cur", label: "Amount" }];
      }

      /* value object per mode; variance = actual - budget (signed, so it
         cross-foots and positive is always favourable) */
      function vals(curV, priV, budV) {
        var v = { cur: curV };
        if (withPrior || multiYear) { v.pri = priV; v.p2 = Math.round(priV * 0.94); v.p3 = Math.round(priV * 0.88); }
        if (mgmt2 || mgmt3) { v.bud = budV; v.c1 = curV; v.c2 = budV; v.c3 = curV - budV; }
        return v;
      }

      var sections, blocks, netResult;

      if (multiYear) {
        var myOpexLines = rp3SeriesOpexLines(rp3Series, function (name, curV) {
          return {
            name: name,
            values: {
              cur: curV, pri: PRI.opex[name], p2: P2.opex[name], p3: P3.opex[name]
            }
          };
        });
        sections = [
          { key: "revenue", label: "Revenue", lines: [{ name: "Sales revenue", values: { cur: CUR.rev, pri: PRI.rev, p2: P2.rev, p3: P3.rev } }], totals: { cur: CUR.rev, pri: PRI.rev, p2: P2.rev, p3: P3.rev } },
          { key: "cost_of_sales", label: "Cost of sales", lines: [{ name: "Cost of sales", values: { cur: -CUR.cos, pri: -PRI.cos, p2: -P2.cos, p3: -P3.cos } }], totals: { cur: -CUR.cos, pri: -PRI.cos, p2: -P2.cos, p3: -P3.cos } },
          { key: "gross_profit", label: "Gross profit", lines: [], totals: { cur: CUR.gp, pri: PRI.gp, p2: P2.gp, p3: P3.gp } },
          { key: "operating_expenses", label: "Operating expenses", lines: myOpexLines, totals: { cur: CUR.exp, pri: PRI.exp, p2: P2.exp, p3: P3.exp } },
          { key: "operating_profit", label: "Operating profit", lines: [], totals: { cur: CUR.np, pri: PRI.np, p2: P2.np, p3: P3.np } }
        ];
        blocks = [
          { key: "revenue", label: "Revenue", lines: [{ name: "Sales revenue", values: { cur: CUR.rev, pri: PRI.rev, p2: P2.rev, p3: P3.rev } }], totals: { cur: CUR.rev, pri: PRI.rev, p2: P2.rev, p3: P3.rev } },
          { key: "cost_of_sales", label: "Cost of sales", lines: [{ name: "Cost of sales", values: { cur: -CUR.cos, pri: -PRI.cos, p2: -P2.cos, p3: -P3.cos } }], totals: { cur: -CUR.cos, pri: -PRI.cos, p2: -P2.cos, p3: -P3.cos } },
          { key: "gross_profit", label: "Gross profit", values: { cur: CUR.gp, pri: PRI.gp, p2: P2.gp, p3: P3.gp } },
          { key: "operating_expenses", label: "Operating expenses", lines: myOpexLines, totals: { cur: CUR.exp, pri: PRI.exp, p2: P2.exp, p3: P3.exp } },
          { key: "operating_profit", label: "Operating profit", values: { cur: CUR.np, pri: PRI.np, p2: P2.np, p3: P3.np } }
        ];
        netResult = { label: netLabel(), values: { cur: CUR.np, pri: PRI.np, p2: P2.np, p3: P3.np } };
      } else if (mgmt2 || mgmt3) {
        var mOpexLines = rp3SeriesOpexLines(rp3Series, function (name, curV) {
          return { name: name, values: vals(curV, PRI.opex[name], BUD.opex[name]) };
        });
        sections = [
          { key: "revenue", label: "Revenue", lines: [{ name: "Sales revenue", values: vals(CUR.rev, PRI.rev, BUD.rev) }], totals: vals(CUR.rev, PRI.rev, BUD.rev) },
          { key: "cost_of_sales", label: "Cost of sales", lines: [{ name: "Cost of sales", values: vals(-CUR.cos, -PRI.cos, -BUD.cos) }], totals: vals(-CUR.cos, -PRI.cos, -BUD.cos) },
          { key: "gross_profit", label: "Gross profit", lines: [], totals: vals(CUR.gp, PRI.gp, BUD.gp) },
          { key: "operating_expenses", label: "Operating expenses", lines: mOpexLines, totals: vals(CUR.exp, PRI.exp, BUD.exp) },
          { key: "operating_profit", label: "Operating profit", lines: [], totals: vals(CUR.np, PRI.np, BUD.np) }
        ];
        blocks = [
          { key: "revenue", label: "Revenue", lines: [{ name: "Sales revenue", values: vals(CUR.rev, PRI.rev, BUD.rev) }], totals: vals(CUR.rev, PRI.rev, BUD.rev) },
          { key: "cost_of_sales", label: "Cost of sales", lines: [{ name: "Cost of sales", values: vals(-CUR.cos, -PRI.cos, -BUD.cos) }], totals: vals(-CUR.cos, -PRI.cos, -BUD.cos) },
          { key: "gross_profit", label: "Gross profit", values: vals(CUR.gp, PRI.gp, BUD.gp) },
          { key: "operating_expenses", label: "Operating expenses", lines: mOpexLines, totals: vals(CUR.exp, PRI.exp, BUD.exp) },
          { key: "operating_profit", label: "Operating profit", values: vals(CUR.np, PRI.np, BUD.np) }
        ];
        netResult = { label: netLabel(), values: vals(CUR.np, PRI.np, BUD.np) };
      } else if (withPrior) {
        var pOpexLines = rp3SeriesOpexLines(rp3Series, function (name, curV) {
          return {
            name: name,
            values: { cur: curV, pri: PRI.opex[name], p2: Math.round(PRI.opex[name] * 0.94), p3: Math.round(PRI.opex[name] * 0.88) }
          };
        });
        sections = [
          { key: "revenue", label: "Revenue", lines: [{ name: "Sales revenue", values: { cur: CUR.rev, pri: PRI.rev, p2: Math.round(PRI.rev * 0.94), p3: Math.round(PRI.rev * 0.88) } }], totals: { cur: CUR.rev, pri: PRI.rev } },
          { key: "cost_of_sales", label: "Cost of sales", lines: [{ name: "Cost of sales", values: { cur: -CUR.cos, pri: -PRI.cos, p2: Math.round(-PRI.cos * 0.94), p3: Math.round(-PRI.cos * 0.88) } }], totals: { cur: -CUR.cos, pri: -PRI.cos } },
          { key: "gross_profit", label: "Gross profit", lines: [], totals: { cur: CUR.gp, pri: PRI.gp } },
          { key: "operating_expenses", label: "Operating expenses", lines: pOpexLines, totals: { cur: CUR.exp, pri: PRI.exp } },
          { key: "operating_profit", label: "Operating profit", lines: [], totals: { cur: CUR.np, pri: PRI.np } }
        ];
        blocks = [
          { key: "revenue", label: "Revenue", lines: [{ name: "Sales revenue", values: { cur: CUR.rev, pri: PRI.rev } }], totals: { cur: CUR.rev, pri: PRI.rev } },
          { key: "cost_of_sales", label: "Cost of sales", lines: [{ name: "Cost of sales", values: { cur: -CUR.cos, pri: -PRI.cos } }], totals: { cur: -CUR.cos, pri: -PRI.cos } },
          { key: "gross_profit", label: "Gross profit", values: { cur: CUR.gp, pri: PRI.gp } },
          { key: "operating_expenses", label: "Operating expenses", lines: pOpexLines, totals: { cur: CUR.exp, pri: PRI.exp } },
          { key: "operating_profit", label: "Operating profit", values: { cur: CUR.np, pri: PRI.np } }
        ];
        netResult = { label: netLabel(), values: { cur: CUR.np, pri: PRI.np } };
      } else {
        /* external, no comparison — pre-existing payload, unchanged values */
        var opexLines = P.isMonth
          ? [{ name: "Operating expenses", values: { cur: -36500 } }]
          : [
              { name: "Salaries & wages", values: { cur: -22000 } },
              { name: "Rent expense", values: { cur: -12000 } },
              { name: "Utilities", values: { cur: -3680 } },
              { name: "Fuel expense", values: { cur: -2875 } },
              { name: "Office supplies", values: { cur: -1140 } },
              { name: "Card & transaction fees", values: { cur: -620 } }
            ];
        var REV = P.isMonth ? 75000 : 142300;
        var COS = P.isMonth ? 24300 : 58120;
        var GP = P.isMonth ? 50700 : 84180;
        var EXP = P.isMonth ? 36500 : 42315;
        var OP = P.isMonth ? 14200 : 41865;
        var NP = OP;

        sections = [
          { key: "revenue", label: "Revenue",
            lines: [{ name: "Sales revenue", values: { cur: REV } }],
            totals: { cur: REV } },
          { key: "cost_of_sales", label: "Cost of sales",
            lines: [{ name: "Cost of sales", values: { cur: -COS } }],
            totals: { cur: -COS } },
          { key: "gross_profit", label: "Gross profit",
            lines: [], totals: { cur: GP } },
          { key: "operating_expenses", label: "Operating expenses",
            lines: opexLines, totals: { cur: -EXP } },
          { key: "operating_profit", label: "Operating profit",
            lines: [], totals: { cur: OP } }
        ];
        blocks = [
          { key: "revenue", label: "Revenue",
            lines: [{ name: "Sales revenue", values: { cur: REV } }],
            totals: { cur: REV } },
          { key: "cost_of_sales", label: "Cost of sales",
            lines: [{ name: "Cost of sales", values: { cur: -COS } }],
            totals: { cur: -COS } },
          { key: "gross_profit", label: "Gross profit", values: { cur: GP } },
          { key: "operating_expenses", label: "Operating expenses",
            lines: opexLines, totals: { cur: -EXP } },
          { key: "operating_profit", label: "Operating profit", values: { cur: OP } }
        ];
        netResult = { label: netLabel(), values: { cur: NP } };
      }

      function netLabel() {
        return template === "npo" ? "Surplus for the period" : "Net profit for the period";
      }

      /* opex line builder shared by the comparative/management modes */
      function rp3SeriesOpexLines(series, mk) {
        return Object.keys(series.opex).map(function (name) { return mk(name, series.opex[name]); });
      }

      return {
        ok: true,
        meta: {
          statement: "pnl",
          statement_title: template === "npo"
            ? "Statement of Financial Performance"
            : (template === "ifrs_sme"
              ? "Statement of Comprehensive Income (IFRS for SMEs)"
              : "Statement of Profit or Loss"),
          template: template,
          template_label: template === "npo"
            ? "NPO \u2014 Funds statement"
            : (template === "ifrs_sme"
              ? "IFRS for SMEs (Section 4)"
              : "IFRS (Company)"),
          company_name: COMPANY.company_name,
          currency: COMPANY.currency,
          basis: isMgmt ? "management" : "external",
          compare: compare,
          cols_mode: colsMode,
          detail: query.get("detail") || "summary",
          label: P.label,
          period: { from: P.from, to: P.to }
        },
        columns: columns,
        sections: sections,
        blocks: blocks,
        net_result: netResult
      };
    }

    function rp1BsPayload(query) {
      var template = ((query && query.get("template")) || "ifrs").toLowerCase();
      var isNpo = template === "npo";
      var eqLabel = isNpo ? "Accumulated Funds" : "Equity";
      var capName = isNpo ? "Capital fund" : "Share capital";
      var retName = isNpo ? "Accumulated surplus" : "Retained earnings";
      var curName = isNpo ? "Surplus for the period" : "Current year earnings";
      var bsTitle = template === "ifrs_sme"
        ? "Statement of Financial Position (IFRS for SMEs)"
        : "Statement of Financial Position";

      /* rp3: internal (management) presentation — Non-current / Current / Total
         split. Every figure is the pre-existing BS value re-classified per line;
         total always equals the original amount. */
      var bsBasis = ((query && query.get("basis")) || "external").toLowerCase();
      if (bsBasis === "management" || bsBasis === "internal") {
        var N = function (nc, c) { return { noncur: nc, cur: c, total: nc + c }; };
        return {
          ok: true,
          meta: {
            statement: "bs",
            statement_title: bsTitle,
            template: template,
            template_label: isNpo
              ? "NPO \u2014 Funds statement"
              : (template === "ifrs_sme" ? "IFRS for SMEs (Section 4)" : "IFRS (Company)"),
            company_name: COMPANY.company_name,
            currency: COMPANY.currency,
            basis: "management",
            view: "internal",
            cols_mode: Number((query && query.get("cols_mode"))) || 2,
            as_of: RP1_TODAY,
            label: "As at " + RP1_TODAY
          },
          columns: [
            { key: "noncur", label: "Non-current" },
            { key: "cur", label: "Current" },
            { key: "total", label: "Total" }
          ],
          assets: {
            non_current_assets: {
              label: "Non-current assets",
              lines: [
                { name: "Equipment at cost", values: N(185000, 0) },
                { name: "Accumulated depreciation - equipment", values: N(0, 46250), is_contra: true }
              ],
              totals: { noncur: 185000, cur: -46250, total: 138750 }
            },
            current_assets: {
              label: "Current assets",
              lines: [
                { name: "Bank & cash", values: N(0, 488740) },
                { name: "Accounts receivable", values: N(0, 84320) },
                { name: "Inventory on hand", values: N(0, 79750) },
                { name: "VAT input", values: N(0, 8955) }
              ],
              totals: { noncur: 0, cur: 661765, total: 661765 }
            },
            totals: { values: { noncur: 138750, cur: 661765, total: 800515 } }
          },
          equity_and_liabilities: {
            equity: {
              label: eqLabel,
              lines: [
                { name: capName, values: N(100000, 0) },
                { name: retName, values: N(464590, 0) },
                { name: curName, values: N(41865, 0) }
              ],
              totals: { noncur: 606455, cur: 0, total: 606455 }
            },
            non_current_liabilities: {
              label: "Non-current liabilities",
              lines: [{ name: "Long-term borrowing", values: N(120000, 0) }],
              totals: { noncur: 120000, cur: 0, total: 120000 }
            },
            current_liabilities: {
              label: "Current liabilities",
              lines: [
                { name: "Accounts payable", values: N(0, 52410) },
                { name: "PAYE payable", values: N(0, 6890) },
                { name: "VAT output", values: N(0, 14760) }
              ],
              totals: { noncur: 0, cur: 74060, total: 74060 }
            },
            totals: { values: { noncur: 726455, cur: 74060, total: 800515 } }
          },
          balance_check: { values: { noncur: 0, cur: 0, total: 0 } }
        };
      }

      return {
        ok: true,
        meta: {
          statement: "bs",
          statement_title: bsTitle,
          template: template,
          template_label: isNpo
            ? "NPO \u2014 Funds statement"
            : (template === "ifrs_sme" ? "IFRS for SMEs (Section 4)" : "IFRS (Company)"),
          company_name: COMPANY.company_name,
          currency: COMPANY.currency,
          basis: "external",
          as_of: RP1_TODAY,
          label: "As at " + RP1_TODAY
        },
        columns: [{ key: "cur", label: "Amount" }],
        assets: {
          non_current_assets: {
            label: "Non-current assets",
            lines: [
              { name: "Equipment at cost", values: { cur: 185000 } },
              { name: "Accumulated depreciation - equipment", values: { cur: 46250 }, is_contra: true }
            ],
            totals: { cur: 138750 }
          },
          current_assets: {
            label: "Current assets",
            lines: [
              { name: "Bank & cash", values: { cur: 488740 } },
              { name: "Accounts receivable", values: { cur: 84320 } },
              { name: "Inventory on hand", values: { cur: 79750 } },
              { name: "VAT input", values: { cur: 8955 } }
            ],
            totals: { cur: 661765 }
          },
          totals: { values: { cur: 800515 } }
        },
        equity_and_liabilities: {
          equity: {
            label: eqLabel,
            lines: [
              { name: capName, values: { cur: 100000 } },
              { name: retName, values: { cur: 464590 } },
              { name: curName, values: { cur: 41865 } }
            ],
            totals: { cur: 606455 }
          },
          non_current_liabilities: {
            label: "Non-current liabilities",
            lines: [{ name: "Long-term borrowing", values: { cur: 120000 } }],
            totals: { cur: 120000 }
          },
          current_liabilities: {
            label: "Current liabilities",
            lines: [
              { name: "Accounts payable", values: { cur: 52410 } },
              { name: "PAYE payable", values: { cur: 6890 } },
              { name: "VAT output", values: { cur: 14760 } }
            ],
            totals: { cur: 74060 }
          },
          totals: { values: { cur: 800515 } }
        },
        balance_check: { values: { cur: 0 } }
      };
    }

    function rp1CfPayload(query) {
      var P = rp1Period(query);
      var template = ((query && query.get("template")) || "ifrs").toLowerCase();
      var cfTitle = template === "npo"
        ? "Cash Flow Statement"
        : (template === "ifrs_sme"
          ? "Statement of Cash Flows (IFRS for SMEs)"
          : "Statement of Cash Flows");
      return {
        ok: true,
        meta: {
          statement: "cf",
          statement_title: cfTitle,
          template: template,
          template_label: template === "npo"
            ? "NPO \u2014 Funds statement"
            : (template === "ifrs_sme" ? "IFRS for SMEs (Section 4)" : "IFRS (Company)"),
          company_name: COMPANY.company_name,
          currency: COMPANY.currency,
          method: query.get("method") || "direct",
          basis: query.get("basis") || "external",
          label: P.label,
          period: { from: P.from, to: P.to }
        },
        columns: [{ key: "cur", label: "Amount" }],
        sections: [
          { key: "operating",
            lines: [
              { name: "Receipts from customers", values: { cur: 11500 },
                /* rp3: first-line detail drives the 2-column Inflow/Outflow preview */
                detail: { cur: [
                  { account_name: "Receipts from customers", amount: 11500 },
                  { account_name: "Payments to suppliers & employees", amount: -36115 }
                ] } },
              { name: "Payments to suppliers & employees", values: { cur: -36115 } }
            ],
            totals: { cur: -24615 } },
          { key: "investing",
            lines: [{ name: "Purchase of equipment", values: { cur: 0 },
              detail: { cur: [
                { account_name: "Purchase of equipment", amount: 0 }
              ] } }],
            totals: { cur: 0 } },
          { key: "financing",
            lines: [{ name: "Owner capital injection", values: { cur: 50000 },
              detail: { cur: [
                { account_name: "Owner capital injection", amount: 50000 }
              ] } }],
            totals: { cur: 50000 } }
        ],
        net_change: { label: "Net change in cash and cash equivalents", values: { cur: 25385 } },
        opening_balance: { label: "Opening cash and cash equivalents", values: { cur: 463355 } },
        closing_balance: { label: "Closing cash and cash equivalents", values: { cur: 488740 } }
      };
    }

    function rp1SociePayload(query) {
      var P = rp1Period(query);
      var template = ((query && query.get("template")) || "ifrs").toLowerCase();
      var isNpo = template === "npo";
      var socieTitle = isNpo
        ? "Statement of Changes in Accumulated Funds"
        : (template === "ifrs_sme"
          ? "Statement of Changes in Equity (IFRS for SMEs)"
          : "Statement of Changes in Equity");
      var colCap = isNpo ? "Capital Fund" : "Share Capital";
      var colRet = isNpo ? "Accumulated Surplus" : "Retained Earnings";
      var colTot = isNpo ? "Total Funds" : "Total Equity";
      var rowProfit = isNpo ? "Surplus for the period" : "Profit for the period";
      return {
        ok: true,
        meta: {
          statement: "socie",
          statement_title: socieTitle,
          template: template,
          template_label: isNpo
            ? "NPO \u2014 Funds statement"
            : (template === "ifrs_sme" ? "IFRS for SMEs (Section 4)" : "IFRS (Company)"),
          company_name: COMPANY.company_name,
          currency: COMPANY.currency,
          label: P.label,
          period: { from: P.isMonth ? RP1_YEAR_START : P.from, to: P.to }
        },
        columns: [
          { key: "capital", label: colCap },
          { key: "retained", label: colRet },
          { key: "total", label: colTot }
        ],
        rows: [
          { key: "opening_balance", label: "Balance at " + (P.isMonth ? monthStart : P.from),
            values: { capital: 100000, retained: 464590, total: 564590 } },
          { key: "profit_for_period", label: rowProfit,
            values: { capital: 0, retained: 41865, total: 41865 } },
          { key: "total_comprehensive_income", label: "Total comprehensive income for the period",
            values: { capital: 0, retained: 41865, total: 41865 } },
          { key: "closing_balance", label: "Balance at " + RP1_TODAY,
            values: { capital: 100000, retained: 506455, total: 606455 } }
        ]
      };
    }

    /* -- fs-notes editor backend (visual demo; prose only, no figures) -- */
    var RP1_NOTE_TITLES = {
      ias16_ppe_policy: "Property, plant and equipment",
      ifrs16_lease_policy: "Leases — lessee",
      ifrs16_lessor_lease_policy: "Leases — lessor",
      ias16_ppe_disclosure: "Property, plant and equipment — disclosures",
      ifrs15_revenue_policy: "Revenue recognition",
      ifrs15_revenue_disclosure: "Revenue — disclosures",
      ias40_ip_policy: "Investment property",
      ias40_ip_disclosure: "Investment property — disclosures",
      ias38_ia_policy: "Intangible assets",
      ias38_ia_disclosure: "Intangible assets — disclosures",
      ifrs9_financial_instruments_policy: "Financial instruments",
      ias41_agriculture_disclosure: "Agriculture — disclosures",
      ias19_employee_cost_policy: "Employee benefits — accounting policy",
      ias19_leave_liability_policy: "Leave pay liability",
      ias19_leave_liability: "Leave pay liability — disclosures",
      ias19_employee_cost_disclosure: "Employee benefit expense",
      ias19_bonus_provision_policy: "Bonus provision",
      ias19_bonus_provision_disclosure: "Bonus provision — disclosures",
      ias19_termination_benefits_policy: "Termination benefits",
      ias19_termination_benefits_disclosure: "Termination benefit obligation",
      ias19_defined_contribution_policy: "Defined-contribution plans",
      ias19_defined_contribution_disclosure: "Defined-contribution plans — disclosures",
      ias19_defined_benefit_policy: "Defined-benefit plans",
      ias19_defined_benefit_disclosure: "Defined-benefit plans — disclosures",
      ias19_employee_benefits_pack: "Employee benefits"
    };

    function rp1NoteStd(key) {
      if (key.indexOf("ias16") === 0) return "IAS 16 Property, Plant and Equipment";
      if (key.indexOf("ifrs16") === 0) return "IFRS 16 Leases";
      if (key.indexOf("ifrs15") === 0) return "IFRS 15 Revenue from Contracts with Customers";
      if (key.indexOf("ias40") === 0) return "IAS 40 Investment Property";
      if (key.indexOf("ias38") === 0) return "IAS 38 Intangible Assets";
      if (key.indexOf("ifrs9") === 0) return "IFRS 9 Financial Instruments";
      if (key.indexOf("ias41") === 0) return "IAS 41 Agriculture";
      if (key.indexOf("ias19") === 0) return "IAS 19 Employee Benefits";
      return "applicable IFRS";
    }

    function rp1SystemNote(key, query) {
      var P = rp1Period(query);
      var title = RP1_NOTE_TITLES[key] || key.replace(/_/g, " ");
      var std = rp1NoteStd(key);
      var body =
        "Accounting policy — " + title + "\n\n" +
        COMPANY.company_name + " applies " + std + " in preparing these financial statements. " +
        "The accounting policies set out below have been applied consistently to all periods presented " +
        "in these financial statements, and have been applied by the entity for the period " +
        P.from + " to " + P.to + ".\n\n" +
        "Judgements and estimates\n\n" +
        "In preparing the financial statements, management made judgements, estimates and assumptions " +
        "that affect the reported amounts of income, expenses, assets and liabilities, and the accompanying " +
        "disclosures, and the disclosure of contingent liabilities. Uncertainty about these assumptions and " +
        "estimates could result in outcomes that require a material adjustment to the carrying amounts of " +
        "the affected assets or liabilities in future periods.\n\n" +
        "Standards issued but not yet effective\n\n" +
        "New and amended standards and interpretations that are effective for annual periods beginning " +
        "after the reporting date have been reviewed. To the extent that they are relevant to the entity, " +
        "management anticipates that their adoption in future periods will be disclosed in the appropriate note.";
      return {
        note_key: key,
        note_title: title,
        content_text: body,
        system_draft: body,
        is_custom: false,
        is_outdated: false,
        period_from: P.from,
        period_to: P.to
      };
    }

    if (cidMatch && /\/fs-notes\/([^\/]+)\/reset$/.test(pathname) && opts.method === "POST") {
      var rp1ResetKey = decodeURIComponent(pathname.match(/\/fs-notes\/([^\/]+)\/reset$/)[1]);
      delete window.__RP1.notes[rp1ResetKey];
      return json({ ok: true, note: rp1SystemNote(rp1ResetKey, query) });
    }
    if (cidMatch && /\/fs-notes\/([^\/]+)$/.test(pathname)) {
      var rp1NoteKey = decodeURIComponent(pathname.match(/\/fs-notes\/([^\/]+)$/)[1]);
      if (opts.method === "POST") {
        var rp1Body = {};
        try { rp1Body = JSON.parse(opts.body || "{}"); } catch (e) {}
        var rp1Base = rp1SystemNote(rp1NoteKey, query);
        var rp1Saved = {
          note_key: rp1NoteKey,
          note_title: rp1Body.note_title || rp1Base.note_title,
          content_text: rp1Body.content_text != null ? rp1Body.content_text : rp1Base.content_text,
          system_draft: rp1Base.system_draft,
          is_custom: true,
          is_outdated: false,
          period_from: rp1Base.period_from,
          period_to: rp1Base.period_to
        };
        window.__RP1.notes[rp1NoteKey] = rp1Saved;
        return json({ ok: true, note: rp1Saved, data: rp1Saved });
      }
      var rp1Custom = window.__RP1.notes[rp1NoteKey];
      var rp1Note = rp1Custom || rp1SystemNote(rp1NoteKey, query);
      return json({ ok: true, note: rp1Note, data: rp1Note });
    }

    /* ════════════ vat2 (rp3): VAT & Tax workspace ════════════
       Seeded on window.__VAT2. Figures tie out to the pre-existing BS:
       VAT input 8,955 (debit lines sum) · VAT output 14,760 (credit lines
       sum) · net VAT payable 5,805. Bi-monthly Category C (SARS). */
    function vat2Store() {
      if (!window.__VAT2) {
        window.__VAT2 = {
          seq: { filing: 912, journal: 5210 },
          periods: [
            { label: "Feb \u2013 Mar 2026", start_date: "2026-02-01", end_date: "2026-03-31", due_date: "2026-04-24" },
            { label: "Apr \u2013 May 2026", start_date: "2026-04-01", end_date: "2026-05-31", due_date: "2026-06-25" },
            { label: "Jun \u2013 Jul 2026", start_date: "2026-06-01", end_date: "2026-07-31", due_date: "2026-08-25" },
            { label: "Aug \u2013 Sep 2026", start_date: "2026-08-01", end_date: "2026-09-30", due_date: "2026-10-23" },
            { label: "Oct \u2013 Nov 2026", start_date: "2026-10-01", end_date: "2026-11-30", due_date: "2026-12-24" }
          ],
          currentKey: "2026-08-01",
          lines: [
            { date: "2026-08-05", ref: "TAX-0812", account: "1440", account_name: "VAT Input \u2014 Purchases", vat_side: "input", debit: 3420, credit: 0 },
            { date: "2026-08-07", ref: "INV-1042", account: "2310", account_name: "VAT Output \u2014 Sales", vat_side: "output", debit: 0, credit: 5820 },
            { date: "2026-08-19", ref: "TAX-0831", account: "1440", account_name: "VAT Input \u2014 Fuel", vat_side: "input", debit: 2265, credit: 0 },
            { date: "2026-08-21", ref: "INV-1051", account: "2310", account_name: "VAT Output \u2014 Sales", vat_side: "output", debit: 0, credit: 4440 },
            { date: "2026-09-02", ref: "TAX-0847", account: "1440", account_name: "VAT Input \u2014 Utilities", vat_side: "input", debit: 1860, credit: 0 },
            { date: "2026-09-04", ref: "INV-1063", account: "2310", account_name: "VAT Output \u2014 Sales", vat_side: "output", debit: 0, credit: 4500 },
            { date: "2026-09-15", ref: "TAX-0861", account: "1440", account_name: "VAT Input \u2014 Office supplies", vat_side: "input", debit: 1410, credit: 0 }
          ],
          filings: {
            "2026-06-01|2026-07-31": { status: "submitted", submitted_at: "2026-08-27T09:12:00", reference: "VAT-2026-0412", net_vat: 4382.5, settlement_journal_id: "JV-VAT-2551", payment_journal_id: "CPJ-2884" },
            "2026-08-01|2026-09-30": { status: "open", net_vat: 5805 }
          }
        };
      }
      return window.__VAT2;
    }
    function vat2InPeriod(fromStr, toStr) {
      return String(fromStr || "") <= "2026-09-30" && String(toStr || "") >= "2026-08-01";
    }
    function vat2Totals() {
      return { input_total: 8955, output_total: 14760, net_vat: 5805 };
    }

    if (cidMatch && /\/vat\/periods$/.test(pathname)) {
      var v2s = vat2Store();
      var v2cur = v2s.periods.filter(function (p) { return p.start_date === v2s.currentKey; })[0] || v2s.periods[3];
      return json({
        ok: true,
        periods: v2s.periods,
        current: v2cur,
        context: { authority_name: "SARS", authority_code: "SARS", category_code: "C", frequency: "bi_monthly" }
      });
    }
    if (cidMatch && /\/vat\/lines$/.test(pathname)) {
      var vs2 = vat2Store();
      var f2 = query.get("from") || "", t22 = query.get("to") || "";
      var rows2 = vs2.lines.filter(function (l) { return (!f2 || l.date >= f2) && (!t22 || l.date <= t22); });
      return json({ ok: true, lines: rows2, total: rows2.length });
    }
    if (cidMatch && /\/vat\/filings\/prepare$/.test(pathname) && opts.method === "POST") {
      var vp2 = {};
      try { vp2 = JSON.parse(opts.body || "{}"); } catch (e) {}
      var key2 = (vp2.from || "") + "|" + (vp2.to || "");
      var st2 = vat2Store();
      if (vp2.preview_only) {
        var tt2 = vat2InPeriod(vp2.from, vp2.to) ? vat2Totals() : { input_total: 0, output_total: 0, net_vat: 0 };
        return json({
          ok: true,
          preview: {
            input_total: tt2.input_total,
            output_total: tt2.output_total,
            net_vat: tt2.net_vat,
            journal_lines: [
              { account: "2310", name: "VAT Output", debit: tt2.output_total, credit: 0 },
              { account: "1440", name: "VAT Input", debit: 0, credit: tt2.input_total },
              { account: "2320", name: "VAT Payable \u2014 SARS", debit: 0, credit: tt2.net_vat }
            ]
          }
        });
      }
      var filing2 = st2.filings[key2] || (st2.filings[key2] = { status: "open", net_vat: 0 });
      filing2.status = "prepared";
      filing2.prepared_at = RP1_TODAY + "T10:42:00";
      filing2.settlement_journal_id = "JV-VAT-" + (++st2.seq.journal);
      filing2.net_vat = vat2InPeriod(vp2.from, vp2.to) ? 5805 : filing2.net_vat || 0;
      return json({ ok: true, filing: filing2 });
    }
    if (cidMatch && /\/vat\/filings\/pay$/.test(pathname) && opts.method === "POST") {
      var vb2 = {};
      try { vb2 = JSON.parse(opts.body || "{}"); } catch (e) {}
      var pk2 = (vb2.from || "") + "|" + (vb2.to || "");
      var pf2 = vat2Store().filings[pk2];
      if (!pf2) return json({ ok: false, error: "No filing found for this period." }, 404);
      pf2.payment_journal_id = "CPJ-" + (++vat2Store().seq.journal);
      pf2.payment_posted_at = RP1_TODAY + "T11:05:00";
      pf2.payment_reference = vb2.reference || "SARS EFT";
      return json({ ok: true, filing: pf2 });
    }
    if (cidMatch && /\/vat\/filings$/.test(pathname)) {
      var fk2 = (query.get("from") || "") + "|" + (query.get("to") || "");
      var vf2 = vat2Store().filings[fk2] || { status: "open", net_vat: vat2InPeriod(query.get("from"), query.get("to")) ? 5805 : 0 };
      return json({ ok: true, filing: vf2 });
    }

    /* -- full statements -- */
    if (cidMatch && /\/pnl$/.test(pathname)) {
      return json(rp1PnlPayload(query));
    }
    if (cidMatch && /\/bs$/.test(pathname)) {
      return json(rp1BsPayload(query));
    }
    if (cidMatch && /\/socie$/.test(pathname)) {
      return json(rp1SociePayload(query));
    }
    if (cidMatch && /\/cashflow$/.test(pathname)) {
      return json(rp1CfPayload(query));
    }
    
  
  
  
  
  
  
  
  /* ============================================================
     grp1 — GROUP REPORTING / CONSOLIDATION WORKSPACE (Task 14)
     Routes previously fell through to the generic empty fallback:
     #screen-group-reporting was completely inert (no runs, no TBs,
     no mapping, no eliminations — every tab disabled forever).
     This seed implements the full /consolidation/* family from the
     frozen ENDPOINTS contract in dashboard.js.

     STORY (all ZAR unless noted; new values disclosed here):
     Parent  : Mokoko Trading (Pty) Ltd — statutory TB ties EXACTLY
               to the existing TB_ROWS (Dr = Cr = 947,200.00:
               assets 846,765 + expenses 100,435 / contra+liab+
               equity+income 947,200).
     Group   : Mokoko Holdings Group — FY2026 period Sep-2026 YTD.
     Entities: Mokoko Logistics (100%, ZAR, TB 516,580.00),
               Cape Distribution (80%, ZAR, TB 735,380.00),
               Windhoek Trading (100%, NAD, TB 352,850.00 NAD).
     Layers  : precon Dr 2,681,188.20 / Cr 2,680,632.45 (diff 555.75
               = pending CTA) -> adjusted Dr 2,554,848.20 /
               Cr 2,554,292.45 (diff 555.75) -> final Dr = Cr =
               2,901,601.20 (diff 0.00 after CTA 555.75 Cr).
     Group-layer positions the statutory parent ledger does not
     carry (IC 146,900.00 Dr, equity-method investments 95,000.00,
     investment recognition 200,000.00) are held in account 3900
     "Group Consolidation Memorandum" (441,900.00 Cr) and surfaced
     in the Control & Close checks — nothing pre-existing changed.
     State persists on window.__GRP1 across requests.
     ============================================================ */
  if (!window.__GRP1) {
    window.__GRP1 = { seq: { run: 4, runEntity: 5, line: 1000, mapping: 2000, adj: 4, elim: 4, balance: 7, match: 3, wp: 3, check: 1 } };
  }
  var GRP1 = (function () {
    if (window.__GRP1.booted) return window.__GRP1;
    var G = window.__GRP1;
    var R2 = function (n) { return Math.round(n * 100) / 100; };

    G.group = {
      id: 1, profile_name: "Mokoko Holdings Group", group_name: "Mokoko Holdings Group",
      parent_company_id: 42, reporting_currency: "ZAR", framework: "IFRS",
      period_start: "2026-10-01", period_end: "2025-09-30", status: "configured"
    };

    /* ---- group chart of accounts ---- */
    G.coa = [
      { id: 1, code: "1000", name: "Cash & Bank", type: "asset", statement: "bs", normal: "dr" },
      { id: 2, code: "1100", name: "Trade & Other Receivables", type: "asset", statement: "bs", normal: "dr" },
      { id: 3, code: "1200", name: "Inventory", type: "asset", statement: "bs", normal: "dr" },
      { id: 4, code: "1400", name: "Intercompany Receivables", type: "asset", statement: "bs", normal: "dr", ic: true },
      { id: 5, code: "1500", name: "Property, Plant & Equipment", type: "asset", statement: "bs", normal: "dr" },
      { id: 6, code: "1550", name: "Accumulated Depreciation", type: "asset", statement: "bs", normal: "cr", contra: true },
      { id: 7, code: "1650", name: "Investments in Associates & JVs", type: "asset", statement: "bs", normal: "dr" },
      { id: 8, code: "1700", name: "Goodwill", type: "asset", statement: "bs", normal: "dr" },
      { id: 9, code: "2000", name: "Trade & Other Payables", type: "liability", statement: "bs", normal: "cr" },
      { id: 10, code: "2100", name: "Intercompany Payables", type: "liability", statement: "bs", normal: "cr", ic: true },
      { id: 11, code: "2150", name: "VAT Control", type: "liability", statement: "bs", normal: "cr" },
      { id: 12, code: "2200", name: "Borrowings", type: "liability", statement: "bs", normal: "cr" },
      { id: 13, code: "2250", name: "Lease Liabilities", type: "liability", statement: "bs", normal: "cr" },
      { id: 14, code: "2300", name: "Current Tax Liabilities", type: "liability", statement: "bs", normal: "cr" },
      { id: 15, code: "2400", name: "Deferred Tax Liability", type: "liability", statement: "bs", normal: "cr" },
      { id: 16, code: "3000", name: "Share Capital", type: "equity", statement: "bs", normal: "cr" },
      { id: 17, code: "3100", name: "Retained Earnings", type: "equity", statement: "bs", normal: "cr" },
      { id: 18, code: "3200", name: "Non-Controlling Interests", type: "equity", statement: "bs", normal: "cr" },
      { id: 19, code: "3300", name: "Translation Reserve", type: "equity", statement: "bs", normal: "cr" },
      { id: 20, code: "3900", name: "Group Consolidation Memorandum", type: "equity", statement: "bs", normal: "cr", memo: true },
      { id: 21, code: "4000", name: "Revenue", type: "income", statement: "pl", normal: "cr" },
      { id: 22, code: "4550", name: "Share of Profit of Associates & JVs", type: "income", statement: "pl", normal: "cr" },
      { id: 23, code: "4600", name: "Intercompany Reconciliation Variance", type: "income", statement: "pl", normal: "cr" },
      { id: 24, code: "5000", name: "Cost of Sales", type: "expense", statement: "pl", normal: "dr" },
      { id: 25, code: "6000", name: "Operating Expenses", type: "expense", statement: "pl", normal: "dr" },
      { id: 26, code: "6100", name: "Distribution Costs", type: "expense", statement: "pl", normal: "dr" },
      { id: 27, code: "7000", name: "Income Tax Expense", type: "expense", statement: "pl", normal: "dr" },
      { id: 28, code: "7100", name: "Profit Attributable to NCI", type: "expense", statement: "pl", normal: "dr" }
    ];
    G.coaByCode = {};
    G.coa.forEach(function (a) { G.coaByCode[a.code] = a; });

    /* ---- entities ---- */
    G.entities = [
      { id: 1, company_id: 42, code: "MTL", name: "Mokoko Trading (Pty) Ltd", type: "parent", ownership_pct: 100, currency: "ZAR", method: "full", acquisition_date: "2019-03-01" },
      { id: 2, company_id: 101, code: "MLOG", name: "Mokoko Logistics (Pty) Ltd", type: "subsidiary", ownership_pct: 100, currency: "ZAR", method: "full", acquisition_date: "2024-03-01" },
      { id: 3, company_id: 102, code: "CDH", name: "Cape Distribution (Pty) Ltd", type: "subsidiary", ownership_pct: 80, currency: "ZAR", method: "full", acquisition_date: "2025-07-01" },
      { id: 4, company_id: 103, code: "WHT", name: "Windhoek Trading (Pty) Ltd", type: "subsidiary", ownership_pct: 100, currency: "NAD", method: "full", acquisition_date: "2023-11-01" },
      { id: 5, company_id: 104, code: "KAJ", name: "Karoo Agri JV", type: "joint_venture", ownership_pct: 50, currency: "ZAR", method: "equity", acquisition_date: "2024-09-01" },
      { id: 6, company_id: 105, code: "NKR", name: "Namakwa Retail (Pty) Ltd", type: "associate", ownership_pct: 25, currency: "ZAR", method: "equity", acquisition_date: "2025-02-01" }
    ];

    /* ---- consolidation runs ---- */
    G.runs = [
      { id: 1, code: "CON-2026-08", name: "August 2026 consolidation", period_start: "2026-08-01", period_end: "2026-08-31", status: "approved", framework: "IFRS", reporting_currency: "ZAR", prepared_by: "T. Mokoena", prepared_at: "2026-09-09T10:20:00", approved_by: "A. Petersen", approved_at: "2026-09-14T15:45:00", closed_at: "2026-09-14T15:45:00", group_profile_id: 1 },
      { id: 2, code: "CON-2026-09", name: "September 2026 consolidation (FY2026 YTD)", period_start: "2026-09-01", period_end: "2026-09-30", status: "prepared", framework: "IFRS", reporting_currency: "ZAR", prepared_by: "T. Mokoena", prepared_at: "2026-10-09T09:05:00", approved_by: null, approved_at: null, closed_at: null, group_profile_id: 1 },
      { id: 3, code: "CON-2026-10", name: "October 2026 consolidation (month-to-date)", period_start: "2026-10-01", period_end: "2026-10-31", status: "draft", framework: "IFRS", reporting_currency: "ZAR", prepared_by: null, prepared_at: null, approved_by: null, approved_at: null, closed_at: null, group_profile_id: 1 }
    ];

    /* run-entity membership + per-run TB state */
    G.runEntities = [
      { id: 1, run_id: 2, entity_id: 1, tb_status: "ready", loaded_at: "2026-10-09T08:41:00", note: null },
      { id: 2, run_id: 2, entity_id: 2, tb_status: "ready", loaded_at: "2026-10-09T08:44:00", note: null },
      { id: 3, run_id: 2, entity_id: 3, tb_status: "warning", loaded_at: "2026-10-09T08:47:00", note: "80% ownership — acquisition & NCI workpaper required" },
      { id: 4, run_id: 2, entity_id: 4, tb_status: "ready", loaded_at: "2026-10-09T08:52:00", note: "Functional currency NAD — FX translation workpaper required" },
      { id: 5, run_id: 3, entity_id: 1, tb_status: "pending", loaded_at: null, note: null },
      { id: 6, run_id: 3, entity_id: 2, tb_status: "pending", loaded_at: null, note: null },
      { id: 7, run_id: 3, entity_id: 3, tb_status: "pending", loaded_at: null, note: null },
      { id: 8, run_id: 3, entity_id: 4, tb_status: "pending", loaded_at: null, note: null }
    ];

    /* ---- entity TB lines (mapped to group accounts) ----
       balance > 0 = debit, < 0 = credit (ZAR; Windhoek carries
       both NAD source and translated ZAR values). */
    function L(ent, eacc, ename, role, bal, gcode, src, nad, zar) {
      return { id: ++G.seq.line, run_id: 2, entity_id: ent, entity_account_code: eacc, entity_account_name: ename, role: role, balance: (nad !== undefined ? nad : bal), balance_zar: (zar !== undefined ? zar : bal), group_account_code: gcode, source: src || "auto" };
    }
    G.tbLines = [
      /* parent — ties EXACTLY to TB_ROWS (947,200.00) */
      L(1, "1000", "Business Bank Account", "asset", 486240, "1000"),
      L(1, "1005", "Petty Cash", "asset", 2500, "1000"),
      L(1, "1100", "Accounts Receivable", "asset", 84320, "1100"),
      L(1, "1200", "Inventory on Hand", "asset", 79750, "1200"),
      L(1, "2100", "VAT Input", "tax", 8955, "2150"),
      L(1, "1500", "Equipment at Cost", "asset", 185000, "1500"),
      L(1, "1550", "Accumulated Depreciation - Equipment", "asset", -46250, "1550"),
      L(1, "2000", "Accounts Payable", "liability", -52410, "2000"),
      L(1, "2300", "PAYE Payable", "tax", -6890, "2300"),
      L(1, "2105", "VAT Output", "tax", -14760, "2150"),
      L(1, "2200", "Long-term Borrowing", "liability", -120000, "2200"),
      L(1, "3000", "Share Capital", "equity", -100000, "3000"),
      L(1, "3100", "Retained Earnings", "equity", -464590, "3100"),
      L(1, "4000", "Sales Revenue", "income", -142300, "4000"),
      L(1, "5000", "Cost of Sales", "expense", 58120, "5000"),
      L(1, "6000", "Salaries & Wages", "expense", 22000, "6000"),
      L(1, "6001", "Rent Expense", "expense", 12000, "6000"),
      L(1, "6002", "Utilities", "expense", 3680, "6000"),
      L(1, "6003", "Fuel Expense", "expense", 2875, "6000"),
      L(1, "6004", "Office Supplies", "expense", 1140, "6000"),
      L(1, "6005", "Card & Transaction Fees", "expense", 620, "6000"),
      /* logistics — 516,580.00 */
      L(2, "1000", "Business Bank Account", "asset", 96400, "1000"),
      L(2, "1100", "Trade Receivables", "asset", 58900, "1100"),
      L(2, "1200", "Inventory", "asset", 41200, "1200"),
      L(2, "2100", "VAT Input", "tax", 5880, "2150"),
      L(2, "1500", "Delivery Vehicles at Cost", "asset", 210000, "1500"),
      L(2, "1550", "Accumulated Depreciation - Vehicles", "asset", -63000, "1550"),
      L(2, "2000", "Trade Payables", "liability", -34600, "2000"),
      L(2, "2105", "VAT Output", "tax", -7140, "2150"),
      L(2, "1450", "Due to Mokoko Trading (current account)", "ic", -42500, "2100", "manual"),
      L(2, "3000", "Share Capital", "equity", -80000, "3000"),
      L(2, "3100", "Retained Earnings", "equity", -92940, "3100"),
      L(2, "4000", "Distribution Revenue", "income", -196400, "4000"),
      L(2, "5000", "Cost of Distribution", "expense", 78900, "5000"),
      L(2, "6000", "Operating Expenses", "expense", 25300, "6000"),
      /* cape — 735,380.00 */
      L(3, "1000", "Business Bank Account", "asset", 74300, "1000"),
      L(3, "1100", "Trade Receivables", "asset", 96700, "1100"),
      L(3, "1200", "Inventory", "asset", 88400, "1200"),
      L(3, "2100", "VAT Input", "tax", 7420, "2150"),
      L(3, "1500", "Warehouse & Equipment at Cost", "asset", 320000, "1500"),
      L(3, "1550", "Accumulated Depreciation", "asset", -98500, "1550"),
      L(3, "2000", "Trade Payables", "liability", -61300, "2000"),
      L(3, "2105", "VAT Output", "tax", -9980, "2150"),
      L(3, "1450", "Due to Mokoko Trading (current account)", "ic", -19400, "2100", "manual"),
      L(3, "2200", "Bank Borrowings", "liability", -150000, "2200"),
      L(3, "3000", "Share Capital", "equity", -100000, "3000"),
      L(3, "3100", "Retained Earnings", "equity", -31400, "3100"),
      L(3, "4000", "Wholesale Revenue", "income", -264800, "4000"),
      L(3, "5000", "Cost of Sales", "expense", 108600, "5000"),
      L(3, "6000", "Operating Expenses", "expense", 39960, "6000"),
      /* windhoek — NAD source, translated at closing 0.9500 / avg 0.9480 / hist 0.9450 */
      L(4, "1000", "Bank Windhoek Current Account", "asset", 142400, "1000", "auto", 142400, 135280),
      L(4, "1100", "Trade Receivables", "asset", 41300, "1100", "auto", 41300, 39235),
      L(4, "1200", "Inventory", "asset", 33500, "1200", "auto", 33500, 31825),
      L(4, "1500", "Equipment at Cost", "asset", 96000, "1500", "auto", 96000, 91200),
      L(4, "1550", "Accumulated Depreciation", "asset", -54800, "1550", "auto", -54800, -52060),
      L(4, "2000", "Trade Payables", "liability", -52900, "2000", "auto", -52900, -50255),
      L(4, "1450", "Loan from Mokoko Trading", "ic", -90000, "2100", "manual", -90000, -85500),
      L(4, "3000", "Share Capital", "equity", -100000, "3000", "auto", -100000, -94500),
      L(4, "3100", "Retained Earnings", "equity", -8250, "3100", "auto", -8250, -7796.25),
      L(4, "4000", "Sales Revenue", "income", -46900, "4000", "auto", -46900, -44461.20),
      L(4, "5000", "Cost of Sales", "expense", 24300, "5000", "auto", 24300, 23036.40),
      L(4, "6000", "Operating Expenses", "expense", 15350, "6000", "auto", 15350, 14551.80)
    ];

    /* ---- group-layer consolidation positions (parent statutory
       ledger does not carry these; see memorandum note) ---- */
    G.layerLines = [
      { id: 991, run_id: 2, entity_id: 0, entity_code: "GRP", label: "Intercompany positions declared by parent (due from MLOG 42,500.00 · due from CDH 18,900.00 · loan to WHT 85,500.00)", group_account_code: "1400", debit: 146900, credit: 0 },
      { id: 992, run_id: 2, entity_id: 0, entity_code: "GRP", label: "Memorandum — group-layer recognition of intercompany positions", group_account_code: "3900", debit: 0, credit: 146900 }
    ];

    /* ---- mapping metadata (derived from tbLines) ---- */
    G.mappingRows = function (runId, entityCompanyId, unmappedOnly) {
      var rows = G.tbLines.filter(function (l) { return l.run_id === runId; });
      if (entityCompanyId) rows = rows.filter(function (l) { var e = G.entities.filter(function (x) { return x.id === l.entity_id; })[0]; return e && String(e.company_id) === String(entityCompanyId); });
      var out = rows.map(function (l) {
        var e = G.entities.filter(function (x) { return x.id === l.entity_id; })[0];
        var g = G.coaByCode[l.group_account_code];
        return { id: l.id, run_id: l.run_id, entity_company_id: e ? e.company_id : null, entity_code: e ? e.code : "?", entity_name: e ? e.name : "?", entity_account_code: l.entity_account_code, entity_account_name: l.entity_account_name, role: l.role, balance: l.balance, balance_zar: l.balance_zar, currency: e ? e.currency : "ZAR", group_account_id: g ? g.id : null, group_account_code: l.group_account_code, group_account_name: g ? g.name : "?", source: l.source, mapped: !!l.group_account_code };
      });
      if (unmappedOnly) out = out.filter(function (r) { return !r.mapped; });
      return out;
    };

    /* ---- pre-consolidation (derived) ---- */
    G.preconGenerated = { 1: true, 2: true, 3: false };
    G.adjustedGenerated = { 1: true, 2: true, 3: false };
    G.finalGenerated = { 1: true, 2: false, 3: false };
    G.preconRows = function (runId) {
      if (!G.preconGenerated[runId]) return null;
      var by = {};
      function add(code, dr, cr, ent, name) {
        if (!by[code]) by[code] = { group_account_code: code, group_account_name: G.coaByCode[code] ? G.coaByCode[code].name : code, debit: 0, credit: 0, entities: {} };
        by[code].debit = R2(by[code].debit + (dr || 0));
        by[code].credit = R2(by[code].credit + (cr || 0));
        if (ent) { var k = by[code].entities[ent] || 0; by[code].entities[ent] = R2(k + (dr || 0) - (cr || 0)); }
      }
      G.tbLines.filter(function (l) { return l.run_id === runId; }).forEach(function (l) {
        var zar = R2(l.balance_zar !== undefined ? l.balance_zar : l.balance);
        if (zar >= 0) add(l.group_account_code, zar, 0, l.entity_id); else add(l.group_account_code, 0, -zar, l.entity_id);
      });
      G.layerLines.filter(function (l) { return l.run_id === runId; }).forEach(function (l) { add(l.group_account_code, l.debit, l.credit, 0); });
      return Object.keys(by).sort(function (a, b) { return a < b ? -1 : 1; }).map(function (k) { return by[k]; });
    };

    /* ---- adjustments ---- */
    G.adjustments = [
      { id: 1, run_id: 2, reference: "ADJ-2026-09-01", memo: "IFRS 16 — recognise right-of-use asset and lease liability for group head-office lease", status: "approved", prepared_by: "T. Mokoena", prepared_at: "2026-10-09T09:30:00", lines: [ { id: 1, group_account_code: "1500", account_name: "Property, Plant & Equipment", debit: 18400, credit: 0, memo: "Right-of-use asset — head office" }, { id: 2, group_account_code: "2250", account_name: "Lease Liabilities", debit: 0, credit: 18400, memo: "Lease liability at present value" } ] },
      { id: 2, run_id: 2, reference: "ADJ-2026-09-02", memo: "Deferred tax on group provisions and accelerated capital allowances", status: "reviewed", prepared_by: "T. Mokoena", prepared_at: "2026-10-10T11:15:00", lines: [ { id: 3, group_account_code: "7000", account_name: "Income Tax Expense", debit: 2160, credit: 0, memo: "Deferred tax movement" }, { id: 4, group_account_code: "2400", account_name: "Deferred Tax Liability", debit: 0, credit: 2160, memo: "Net deferred tax liability" } ] },
      { id: 3, run_id: 2, reference: "ADJ-2026-09-03", memo: "Reclassify Windhoek distribution costs out of operating expenses", status: "draft", prepared_by: "T. Mokoena", prepared_at: "2026-10-12T14:02:00", lines: [ { id: 5, group_account_code: "6100", account_name: "Distribution Costs", debit: 3120, credit: 0, memo: "Distribution costs — WHT" }, { id: 6, group_account_code: "6000", account_name: "Operating Expenses", debit: 0, credit: 3120, memo: "Reclassification" } ] }
    ];

    /* ---- intercompany ---- */
    G.icRules = [
      { id: 1, name: "Current accounts by counterparty + reference", nature: "current_account", tolerance: 0, action: "match_exact", enabled: true },
      { id: 2, name: "Loan accounts by counterparty (closing FX)", nature: "loan", tolerance: 0, action: "match_exact", enabled: true },
      { id: 3, name: "Tolerance sweep — small recon variances", nature: "any", tolerance: 500, action: "match_with_variance", enabled: true }
    ];
    G.icBalances = [
      { id: 1, run_id: 2, entity_id: 1, counterparty_entity_id: 2, account_name: "Due from Mokoko Logistics (current account)", nature: "current_account", amount: 42500, currency: "ZAR", amount_zar: 42500, direction: "receivable", status: "matched", match_id: 1 },
      { id: 2, run_id: 2, entity_id: 2, counterparty_entity_id: 1, account_name: "Due to Mokoko Trading (current account)", nature: "current_account", amount: -42500, currency: "ZAR", amount_zar: -42500, direction: "payable", status: "matched", match_id: 1 },
      { id: 3, run_id: 2, entity_id: 1, counterparty_entity_id: 3, account_name: "Due from Cape Distribution (current account)", nature: "current_account", amount: 18900, currency: "ZAR", amount_zar: 18900, direction: "receivable", status: "unmatched", match_id: null },
      { id: 4, run_id: 2, entity_id: 3, counterparty_entity_id: 1, account_name: "Due to Mokoko Trading (current account)", nature: "current_account", amount: -19400, currency: "ZAR", amount_zar: -19400, direction: "payable", status: "unmatched", match_id: null },
      { id: 5, run_id: 2, entity_id: 1, counterparty_entity_id: 4, account_name: "Loan to Windhoek Trading", nature: "loan", amount: 85500, currency: "ZAR", amount_zar: 85500, direction: "receivable", status: "matched", match_id: 2 },
      { id: 6, run_id: 2, entity_id: 4, counterparty_entity_id: 1, account_name: "Loan from Mokoko Trading", nature: "loan", amount: -90000, currency: "NAD", amount_zar: -85500, direction: "payable", status: "matched", match_id: 2 }
    ];
    G.icMatches = [
      { id: 1, run_id: 2, balance_a_id: 1, balance_b_id: 2, entity_a: "MTL", entity_b: "MLOG", amount_a: 42500, amount_b: 42500, currency: "ZAR", variance: 0, status: "matched", method: "rules" },
      { id: 2, run_id: 2, balance_a_id: 5, balance_b_id: 6, entity_a: "MTL", entity_b: "WHT", amount_a: 85500, amount_b: 85500, currency: "ZAR", variance: 0, status: "matched", method: "rules" }
    ];

    /* ---- eliminations ---- */
    G.eliminations = [
      { id: 1, run_id: 2, reference: "ELIM-2026-09-01", memo: "Eliminate intercompany current account — MTL ↔ MLOG", status: "approved", match_id: 1, prepared_at: "2026-10-10T09:12:00", lines: [ { group_account_code: "2100", account_name: "Intercompany Payables", debit: 42500, credit: 0 }, { group_account_code: "1400", account_name: "Intercompany Receivables", debit: 0, credit: 42500 } ] },
      { id: 2, run_id: 2, reference: "ELIM-2026-09-02", memo: "Eliminate intercompany loan — MTL ↔ WHT (closing rate)", status: "approved", match_id: 2, prepared_at: "2026-10-10T09:14:00", lines: [ { group_account_code: "2100", account_name: "Intercompany Payables", debit: 85500, credit: 0 }, { group_account_code: "1400", account_name: "Intercompany Receivables", debit: 0, credit: 85500 } ] }
    ];

    /* ---- acquisition & NCI workpapers ---- */
    G.acquisition = [
      { id: 1, run_id: 2, entity_id: 2, entity_name: "Mokoko Logistics (Pty) Ltd", ownership_pct: 100, acquisition_date: "2024-03-01", cost_of_investment: 80000, nci_at_acquisition: 0, net_assets_at_acquisition: 80000, goodwill: 0, post_acquisition_profit: 92940, nci_share_post: 0, closing_nci: 0, status: "approved", detail: { capital_at_acquisition: 80000, pre_acquisition_profits: 0, fair_value_uplift: 0, impairment: 0 } },
      { id: 2, run_id: 2, entity_id: 3, entity_name: "Cape Distribution (Pty) Ltd", ownership_pct: 80, acquisition_date: "2025-07-01", cost_of_investment: 120000, nci_at_acquisition: 27500, net_assets_at_acquisition: 122500, goodwill: 25000, post_acquisition_profit: 125140, nci_share_post: 25028, closing_nci: 52528, status: "approved", detail: { capital_at_acquisition: 100000, pre_acquisition_profits: 22500, fair_value_uplift: 3000, impairment: 0, nci_reclass_prior: 1780, note: "NCI at fair value (IFRS 3). Prior post-acquisition NCI share (20% × 8,900.00 = 1,780.00) reclassified from retained earnings." } }
    ];

    /* ---- equity method workpapers ---- */
    G.equityMethod = [
      { id: 1, run_id: 2, entity_id: 5, entity_name: "Karoo Agri JV", classification: "joint_venture", ownership_pct: 50, cost: 60000, share_of_profit: 4125, other_movements: 0, carrying_amount: 64125, status: "approved", note: "50% JV — share of FY2026 profit 50% × 8,250.00" },
      { id: 2, run_id: 2, entity_id: 6, entity_name: "Namakwa Retail (Pty) Ltd", classification: "associate", ownership_pct: 25, cost: 35000, share_of_profit: -620, other_movements: 0, carrying_amount: 34380, status: "approved", note: "25% associate — share of FY2026 loss 25% × (2,480.00)" }
    ];

    /* ---- FX translation ---- */
    G.translation = [
      { id: 1, run_id: 2, entity_id: 4, entity_name: "Windhoek Trading (Pty) Ltd", functional_currency: "NAD", reporting_currency: "ZAR", closing_rate: 0.95, average_rate: 0.948, historical_rate: 0.945, tb_total_nad: 352850, tb_total_zar: 335128.20, cta: 555.75, status: "approved", detail: { monetary_rate: 0.95, income_rate: 0.948, equity_rate: 0.945, cta_direction: "credit", note: "Monetary items at closing rate, income & expenses at average rate, equity at historical rate. CTA of 555.75 credited to the translation reserve restores balance." } }
    ];

    /* ---- derived: FINAL group TB (adjusted + acquisition + equity method + CTA)
       Layers post GROSS double-entry (recognition + elimination both booked)
       so the TB totals balance; per-account NETS drive the statements. ---- */
    G.finalRows = function (runId) {
      var adj = {};
      function bump(code, dr, cr) { if (!adj[code]) adj[code] = { group_account_code: code, precon_debit: 0, precon_credit: 0, adj_debit: 0, adj_credit: 0, elim_debit: 0, elim_credit: 0, acq_debit: 0, acq_credit: 0, em_debit: 0, em_credit: 0, cta_debit: 0, cta_credit: 0 }; var r = adj[code]; r.precon_debit = R2(r.precon_debit + (dr || 0)); r.precon_credit = R2(r.precon_credit + (cr || 0)); }
      function bumpIn(map, drField, crField, code, dr, cr) { if (!adj[code]) bump(code, 0, 0); var r = adj[code]; r[drField] = R2(r[drField] + (dr || 0)); r[crField] = R2(r[crField] + (cr || 0)); }
      (G.preconRows(runId) || []).forEach(function (r) { bump(r.group_account_code, r.debit, r.credit); });
      G.adjustments.filter(function (x) { return x.run_id === runId; }).forEach(function (a) { a.lines.forEach(function (l) { bumpIn(adj, "adj_debit", "adj_credit", l.group_account_code, l.debit, l.credit); }); });
      G.eliminations.filter(function (x) { return x.run_id === runId; }).forEach(function (a) { a.lines.forEach(function (l) { bumpIn(adj, "elim_debit", "elim_credit", l.group_account_code, l.debit, l.credit); }); });
      /* acquisition layer: recognise investment at cost, then eliminate it
         against subsidiary equity acquired (IFRS 3, NCI at fair value) */
      G.acquisition.filter(function (x) { return x.run_id === runId && x.status === "approved"; }).forEach(function (wp) {
        var cap = G.tbLines.filter(function (l) { return l.run_id === runId && l.entity_id === wp.entity_id && l.group_account_code === "3000"; })[0];
        var capBal = cap ? Math.abs(cap.balance_zar !== undefined ? cap.balance_zar : cap.balance) : 0;
        var preAcqRe = wp.detail && wp.detail.pre_acquisition_profits ? wp.detail.pre_acquisition_profits : 0;
        var nciReclass = wp.detail && wp.detail.nci_reclass_prior ? wp.detail.nci_reclass_prior : 0;
        bumpIn(adj, "acq_debit", "acq_credit", "1600", wp.cost_of_investment, 0);           /* recognise investment (gross) */
        bumpIn(adj, "acq_debit", "acq_credit", "3900", 0, wp.cost_of_investment);           /* memorandum funding */
        bumpIn(adj, "acq_debit", "acq_credit", "1600", 0, wp.cost_of_investment);           /* eliminate investment (gross) */
        bumpIn(adj, "acq_debit", "acq_credit", "3000", capBal, 0);                          /* eliminate subsidiary capital */
        bumpIn(adj, "acq_debit", "acq_credit", "3100", preAcqRe + nciReclass, 0);           /* eliminate pre-acquisition profits + NCI reclass */
        bumpIn(adj, "acq_debit", "acq_credit", "1700", wp.goodwill || 0, 0);                /* goodwill */
        bumpIn(adj, "acq_debit", "acq_credit", "3200", 0, wp.nci_at_acquisition + nciReclass); /* NCI at acquisition */
      });
      /* equity-method layer: recognise investment, post share of profit,
         allocate profit to NCI (IAS 28) */
      G.equityMethod.filter(function (x) { return x.run_id === runId && x.status === "approved"; }).forEach(function (wp) {
        bumpIn(adj, "em_debit", "em_credit", "1650", wp.cost, 0);
        bumpIn(adj, "em_debit", "em_credit", "3900", 0, wp.cost);
        if (wp.share_of_profit >= 0) { bumpIn(adj, "em_debit", "em_credit", "1650", wp.share_of_profit, 0); bumpIn(adj, "em_debit", "em_credit", "4550", 0, wp.share_of_profit); }
        else { bumpIn(adj, "em_debit", "em_credit", "1650", 0, -wp.share_of_profit); bumpIn(adj, "em_debit", "em_credit", "4550", -wp.share_of_profit, 0); }
      });
      var subsApproved = G.acquisition.filter(function (a) { return a.run_id === runId && a.status === "approved"; });
      var nciPost = R2(subsApproved.reduce(function (s, a) { return s + (a.nci_share_post - (a.detail && a.detail.nci_reclass_prior ? a.detail.nci_reclass_prior : 0)); }, 0));
      if (nciPost > 0) { bumpIn(adj, "em_debit", "em_credit", "7100", nciPost, 0); bumpIn(adj, "em_debit", "em_credit", "3200", 0, nciPost); }
      /* CTA layer (translation approved) */
      G.translation.filter(function (x) { return x.run_id === runId && x.status === "approved"; }).forEach(function (wp) { bumpIn(adj, "cta_debit", "cta_credit", "3300", 0, wp.cta); });
      var rows = Object.keys(adj).sort().map(function (k) {
        var r = adj[k], g = G.coaByCode[k] || {};
        var finalDr = R2(r.precon_debit + r.adj_debit + r.elim_debit + r.acq_debit + r.em_debit + r.cta_debit);
        var finalCr = R2(r.precon_credit + r.adj_credit + r.elim_credit + r.acq_credit + r.em_credit + r.cta_credit);
        return { group_account_code: k, group_account_name: g.name || k, statement: g.statement || "bs", memo: !!g.memo, precon_debit: r.precon_debit, precon_credit: r.precon_credit, adj_debit: r.adj_debit, adj_credit: r.adj_credit, elim_debit: r.elim_debit, elim_credit: r.elim_credit, acq_debit: r.acq_debit, acq_credit: r.acq_credit, em_debit: r.em_debit, em_credit: r.em_credit, cta_debit: r.cta_debit, cta_credit: r.cta_credit, final_debit: finalDr, final_credit: finalCr };
      });
      var td = 0, tc = 0; rows.forEach(function (r) { td = R2(td + r.final_debit); tc = R2(tc + r.final_credit); });
      return { rows: rows, accounts: rows.length, debit: td, credit: tc, difference: R2(td - tc) };
    };

    /* ---- derived: control checks ---- */
    G.controlChecks = function (runId) {
      var ents = G.runEntities.filter(function (x) { return x.run_id === runId; });
      var map = G.mappingRows(runId, null, false);
      var mappedN = map.filter(function (r) { return r.mapped; }).length;
      var adjs = G.adjustments.filter(function (x) { return x.run_id === runId; });
      var elims = G.eliminations.filter(function (x) { return x.run_id === runId; });
      var unmatchedIc = G.icBalances.filter(function (b) { return b.run_id === runId && b.status === "unmatched"; }).length;
      var acq = G.acquisition.filter(function (x) { return x.run_id === runId; });
      var em = G.equityMethod.filter(function (x) { return x.run_id === runId; });
      var tr = G.translation.filter(function (x) { return x.run_id === runId; });
      var st = function (ok, warn) { return ok ? "pass" : (warn ? "warn" : "fail"); };
      return [
        { id: 1, title: "Entity trial balances loaded", detail: ents.filter(function (x) { return x.tb_status !== "pending"; }).length + " of " + ents.length + " entities loaded", state: st(ents.length > 0 && ents.every(function (x) { return x.tb_status !== "pending"; }), false) },
        { id: 2, title: "Group account mapping complete", detail: mappedN + " of " + map.length + " accounts mapped", state: st(map.length > 0 && mappedN === map.length, mappedN > 0) },
        { id: 3, title: "Pre-consolidation TB generated", detail: G.preconGenerated[runId] ? "Combined working TB available" : "Not generated", state: st(!!G.preconGenerated[runId], false) },
        { id: 4, title: "Group adjustments approved", detail: adjs.filter(function (x) { return x.status !== "approved"; }).length + " awaiting approval", state: st(adjs.length > 0 && adjs.every(function (x) { return x.status === "approved"; }), true) },
        { id: 5, title: "Intercompany balances reconciled", detail: unmatchedIc ? unmatchedIc + " unmatched declaration(s)" : "All declarations matched", state: st(unmatchedIc === 0, true) },
        { id: 6, title: "Eliminations approved", detail: elims.length ? elims.filter(function (x) { return x.status !== "approved"; }).length + " of " + elims.length + " awaiting approval" : "None generated", state: st(elims.length > 0 && elims.every(function (x) { return x.status === "approved"; }), true) },
        { id: 7, title: "Acquisition & NCI workpapers approved", detail: acq.filter(function (x) { return x.status === "approved"; }).length + " of " + acq.length + " approved", state: st(acq.length > 0 && acq.every(function (x) { return x.status === "approved"; }), false) },
        { id: 8, title: "Equity-method workpapers approved", detail: em.filter(function (x) { return x.status === "approved"; }).length + " of " + em.length + " approved", state: st(em.length > 0 && em.every(function (x) { return x.status === "approved"; }), false) },
        { id: 9, title: "FX translation approved", detail: tr.length ? tr.filter(function (x) { return x.status === "approved"; }).length + " of " + tr.length + " approved" : "No foreign entities", state: st(tr.every(function (x) { return x.status === "approved"; }), false) },
        { id: 10, title: "Final Group TB generated & balanced", detail: G.finalGenerated && G.finalGenerated[runId] ? "Balanced at 0.00 difference" : "Not generated", state: st(!!(G.finalGenerated && G.finalGenerated[runId]), false) }
      ];
    };

    /* ---- derived: group financial statements ---- */
    G.statements = function (runId) {
      var f = G.finalRows(runId);
      function val(code, side) { var r = f.rows.filter(function (x) { return x.group_account_code === code; })[0]; if (!r) return 0; var net = R2(r.final_debit - r.final_credit); return side === "dr" ? net : -net; }
      var cash = R2(val("1000", "dr")), ar = R2(val("1100", "dr")), inv = R2(val("1200", "dr"));
      var ppe = R2(val("1500", "dr") - val("1550", "cr")), emv = R2(val("1650", "dr")), gw = R2(val("1700", "dr"));
      var assets = R2(cash + ar + inv + ppe + emv + gw);
      var ap = R2(val("2000", "cr")), vat = R2(val("2150", "cr")), bor = R2(val("2200", "cr")), lease = R2(val("2250", "cr")), ctax = R2(val("2300", "cr")), dtax = R2(val("2400", "cr"));
      var liab = R2(ap + vat + bor + lease + ctax + dtax);
      var sc = R2(val("3000", "cr")), re = R2(val("3100", "cr")), nci = R2(val("3200", "cr")), tr = R2(val("3300", "cr")), memo = R2(val("3900", "cr"));
      var rev = R2(val("4000", "cr")), sop = R2(val("4550", "cr")), varr = R2(val("4600", "cr"));
      var cos = R2(val("5000", "dr")), opx = R2(val("6000", "dr") + val("6100", "dr")), tax = R2(val("7000", "dr")), nciP = R2(val("7100", "dr"));
      var gp = R2(rev - cos), pbt = R2(gp - opx + sop + varr), np = R2(pbt - tax), owners = R2(np - nciP);
      var equity = R2(sc + re + tr + memo + nci);
      var bs = {
        title: "Consolidated Statement of Financial Position", as_at: "30 Sep 2026", currency: "ZAR",
        sections: [
          { label: "ASSETS", rows: [
            { label: "Cash & bank", amount: cash }, { label: "Trade & other receivables", amount: ar },
            { label: "Inventory", amount: inv }, { label: "Property, plant & equipment (net)", amount: ppe },
            { label: "Investments in associates & JVs", amount: emv }, { label: "Goodwill", amount: gw } ],
            total: { label: "TOTAL ASSETS", amount: assets } },
          { label: "EQUITY", rows: [
            { label: "Share capital (parent, incl. consolidation layer eliminations)", amount: sc },
            { label: "Retained earnings", amount: re }, { label: "Translation reserve", amount: tr },
            { label: "Group consolidation memorandum (pending statutory posting)", amount: memo, note: true },
            { label: "Non-controlling interests", amount: nci },
            { label: "Current year earnings", amount: R2(assets - liab - equity) } ],
            total: { label: "TOTAL EQUITY", amount: R2(equity + (assets - liab - equity)) } },
          { label: "LIABILITIES", rows: [
            { label: "Trade & other payables", amount: ap }, { label: "VAT payable (net)", amount: vat },
            { label: "Borrowings", amount: bor }, { label: "Lease liabilities", amount: lease },
            { label: "Current tax payable", amount: ctax }, { label: "Deferred tax liability", amount: dtax } ],
            total: { label: "TOTAL LIABILITIES", amount: liab } }
        ],
        grand: { label: "TOTAL EQUITY AND LIABILITIES", amount: R2(equity + (assets - liab - equity) + liab) }
      };
      var pl = {
        title: "Consolidated Statement of Profit or Loss", period: "Year ended 30 Sep 2026 (FY2026 YTD)", currency: "ZAR",
        sections: [
          { label: null, rows: [
            { label: "Revenue", amount: rev }, { label: "Cost of sales", amount: -cos, paren: true } ],
            total: { label: "GROSS PROFIT", amount: gp } },
          { label: null, rows: [
            { label: "Distribution costs", amount: -R2(val("6100", "dr")), paren: true },
            { label: "Operating expenses", amount: -R2(val("6000", "dr")), paren: true },
            { label: "Share of profit of associates & JVs", amount: sop },
            { label: "Intercompany reconciliation variance", amount: varr } ],
            total: { label: "PROFIT BEFORE TAX", amount: pbt } },
          { label: null, rows: [ { label: "Income tax expense", amount: -tax, paren: true } ],
            total: { label: "PROFIT FOR THE PERIOD", amount: np } }
        ],
        foot: [
          { label: "Attributable to non-controlling interests", amount: -nciP, paren: true },
          { label: "Attributable to owners of the parent", amount: owners }
        ]
      };
      var cf = {
        title: "Consolidated Statement of Cash Flows", period: "Year ended 30 Sep 2026", currency: "ZAR",
        sections: [
          { label: "CASH FLOWS FROM OPERATING ACTIVITIES", rows: [
            { label: "Profit before tax", amount: pbt }, { label: "Depreciation & amortisation", amount: 63410 },
            { label: "Deferred tax movement", amount: dtax }, { label: "Share of profit of associates & JVs", amount: -sop, paren: true },
            { label: "Intercompany reconciliation variance", amount: -varr, paren: true },
            { label: "Movement in receivables", amount: -41209, paren: true }, { label: "Movement in inventory", amount: -28844, paren: true },
            { label: "Movement in payables", amount: 36905 } ],
            total: { label: "Cash generated from operations", amount: 289600 } },
          { label: null, rows: [
            { label: "Interest paid", amount: -18400, paren: true }, { label: "Income taxes paid", amount: -6890, paren: true } ],
            total: { label: "NET CASH FROM OPERATING ACTIVITIES", amount: 264310 } },
          { label: "CASH FLOWS FROM INVESTING ACTIVITIES", rows: [ { label: "Purchase of property, plant & equipment", amount: -145000, paren: true } ],
            total: { label: "NET CASH USED IN INVESTING ACTIVITIES", amount: -145000 } },
          { label: "CASH FLOWS FROM FINANCING ACTIVITIES", rows: [
            { label: "Borrowings raised", amount: 60000 }, { label: "Lease payments", amount: -9200, paren: true } ],
            total: { label: "NET CASH FROM FINANCING ACTIVITIES", amount: 50800 } }
        ],
        foot: [
          { label: "Net increase in cash & cash equivalents", amount: 170110 },
          { label: "Cash & cash equivalents at 1 Oct 2025", amount: 624610 },
          { label: "Cash & cash equivalents at 30 Sep 2026", amount: cash }
        ]
      };
      var socie = {
        title: "Consolidated Statement of Changes in Equity", period: "Year ended 30 Sep 2026", currency: "ZAR",
        columns: ["Share Capital", "Retained Earnings", "Translation Reserve", "Group Memo", "NCI", "Total"],
        rows: [
          { label: "At 1 Oct 2025", cells: [194500, 572446.25, 0, 0, 29280, 796226.25], bold: true },
          { label: "Profit for the period", cells: [null, owners, null, null, nciP, np] },
          { label: "Foreign currency translation", cells: [null, null, tr, null, null, tr] },
          { label: "Group consolidation layer recognition", cells: [null, null, null, memo, null, memo] },
          { label: "At 30 Sep 2026", cells: [194500, R2(572446.25 + owners), tr, memo, nci, R2(equity + (assets - liab - equity))], bold: true }
        ]
      };
      return { "balance-sheet": bs, "income-statement": pl, "cash-flow": cf, "socie": socie };
    };

    G.R2 = R2; /* exposed for the route handlers below (same handleApi scope) */
    window.__GRP1.booted = true;
    return G;
  })();
  var R2 = GRP1.R2;

  /* ================= grp1 route handlers ================= */
  if (cidMatch && pathname.indexOf("/consolidation") !== -1) {
    var G1 = GRP1;
    var gb = {};
    try { gb = JSON.parse(opts.body || "{}"); } catch (e) { gb = {}; }
    var pth = pathname.replace(/^.*\/consolidation/, "");
    var gRun = function () { var m = pth.match(/^\/runs\/([^\/]+)/); return m ? decodeURIComponent(m[1]) : null; };
    var gRunObj = function () { var c = gRun(); return G1.runs.filter(function (r) { return r.id === Number(c) || r.code === c; })[0] || null; };
    var gEnt = function () { var m = pth.match(/\/entities\/([^\/]+)/); return m ? decodeURIComponent(m[1]) : null; };
    var gRunEnt = function () { var c = gRun(), re = gEnt(); return G1.runEntities.filter(function (x) { var r = G1.runs.filter(function (rr) { return rr.id === x.run_id; })[0]; return r && (r.id === Number(c) || r.code === c) && String(x.id) === String(re); })[0] || null; };

    /* ---- runs ---- */
    if (pth === "" || pth === "/runs") {
      if (method === "POST") {
        var nr = { id: ++G1.seq.run, code: "CON-2026-" + String(100 + G1.seq.run).slice(1), name: "New consolidation run", period_start: query.get("period_start") || "2026-10-01", period_end: query.get("period_end") || "2026-10-31", status: "draft", framework: "IFRS", reporting_currency: "ZAR", prepared_by: null, prepared_at: null, approved_by: null, approved_at: null, closed_at: null, group_profile_id: 1 };
        G1.runs.push(nr);
        G1.entities.filter(function (e) { return e.method === "full"; }).forEach(function (e) { G1.runEntities.push({ id: ++G1.seq.runEntity, run_id: nr.id, entity_id: e.id, tb_status: "pending", loaded_at: null, note: null }); });
        G1.preconGenerated[nr.id] = false;
        return json({ ok: true, run: nr });
      }
      var runsOut = G1.runs.map(function (r) {
        var ents = G1.runEntities.filter(function (x) { return x.run_id === r.id; });
        return Object.assign({}, r, { entity_count: ents.length, ready_count: ents.filter(function (x) { return x.tb_status === "ready" || x.tb_status === "warning"; }).length });
      });
      return json({ ok: true, runs: runsOut, stats: { total: runsOut.length, draft: runsOut.filter(function (r) { return r.status === "draft"; }).length, prepared: runsOut.filter(function (r) { return r.status === "prepared"; }).length, approved: runsOut.filter(function (r) { return r.status === "approved"; }).length } });
    }

    /* ---- trial balances ---- */
    if (pth.indexOf("/trial-balances") !== -1 && pth.indexOf("/entities/") === -1) {
      var ro2 = gRunObj(); if (!ro2) return json({ ok: false, message: "Run not found" }, 404);
      if (method === "POST" && /load-all$/.test(pth)) {
        G1.runEntities.filter(function (x) { return x.run_id === ro2.id; }).forEach(function (x) { x.tb_status = x.tb_status === "warning" ? "warning" : "ready"; if (!x.loaded_at) x.loaded_at = RP1_TODAY + "T09:00:00"; });
        return json({ ok: true, loaded: G1.runEntities.filter(function (x) { return x.run_id === ro2.id; }).length });
      }
      var rows2 = G1.runEntities.filter(function (x) { return x.run_id === ro2.id; }).map(function (x) {
        var e = G1.entities.filter(function (y) { return y.id === x.entity_id; })[0];
        var ls = G1.tbLines.filter(function (l) { return l.run_id === ro2.id && l.entity_id === e.id; });
        var dr = 0, cr = 0;
        ls.forEach(function (l) { var z = R2(l.balance_zar !== undefined ? l.balance_zar : l.balance); if (z >= 0) dr = R2(dr + z); else cr = R2(cr - z); });
        if (e.currency === "NAD") { var n = 0; ls.forEach(function (l) { n = R2(n + Math.abs(l.balance)); }); return Object.assign({}, x, { entity: e, debit: R2(dr), credit: R2(cr), debit_src: n, credit_src: n, source_currency: "NAD" }); }
        return Object.assign({}, x, { entity: e, debit: R2(dr), credit: R2(cr), difference: R2(dr - cr), source_currency: "ZAR" });
      });
      return json({ ok: true, run: ro2, entities: rows2, stats: { total: rows2.length, ready: rows2.filter(function (x) { return x.tb_status === "ready"; }).length, warnings: rows2.filter(function (x) { return x.tb_status === "warning"; }).length, blocked: rows2.filter(function (x) { return x.tb_status === "pending"; }).length } });
    }
    if (pth.indexOf("/entities/") !== -1 && pth.indexOf("/trial-balance") !== -1) {
      var ro3 = gRunObj(), re3 = gRunEnt(); if (!ro3 || !re3) return json({ ok: false, message: "Not found" }, 404);
      var e3 = G1.entities.filter(function (y) { return y.id === re3.entity_id; })[0];
      if (method === "POST" && /load$/.test(pth)) { re3.tb_status = re3.tb_status === "warning" ? "warning" : "ready"; re3.loaded_at = RP1_TODAY + "T09:00:00"; }
      var ls3 = G1.tbLines.filter(function (l) { return l.run_id === ro3.id && l.entity_id === e3.id; });
      var dr3 = 0, cr3 = 0; ls3.forEach(function (l) { var z = R2(l.balance_zar !== undefined ? l.balance_zar : l.balance); if (z >= 0) dr3 = R2(dr3 + z); else cr3 = R2(cr3 - z); });
      return json({ ok: true, run_entity: re3, entity: e3, lines: ls3, debit: dr3, credit: cr3, difference: R2(dr3 - cr3) });
    }

    /* ---- group COA ---- */
    if (pth === "/group-coa" || pth.indexOf("/group-coa") === 0) {
      if (method === "POST" && /bootstrap$/.test(pth)) {
        var added = 0;
        G1.tbLines.filter(function (l) { return l.run_id === 2; }).forEach(function (l) { if (!G1.coaByCode[l.group_account_code]) { ++added; } });
        return json({ ok: true, added: added, accounts: G1.coa.length, message: added ? added + " account(s) added from parent COA" : "Group chart already complete — 28 accounts" });
      }
      return json({ ok: true, accounts: G1.coa });
    }

    /* ---- account mapping ---- */
    if (pth.indexOf("/account-mapping") !== -1) {
      var ro4 = gRunObj(); if (!ro4) return json({ ok: false, message: "Run not found" }, 404);
      if (method === "POST" && /auto$/.test(pth)) {
        var unmapped = G1.tbLines.filter(function (l) { return l.run_id === ro4.id && !l.group_account_code; });
        unmapped.forEach(function (l) { l.group_account_code = "6000"; l.source = "auto"; });
        return json({ ok: true, mapped: unmapped.length });
      }
      if (method === "PUT") {
        var tbId = Number(pth.match(/\/account-mapping\/([^\/]+)\/?$/)[1]);
        var line4 = G1.tbLines.filter(function (l) { return l.id === tbId; })[0];
        if (line4) { line4.group_account_code = gb.group_account_code || line4.group_account_code; line4.source = "manual"; }
        return json({ ok: true, line: line4 });
      }
      var mrows = G1.mappingRows(ro4.id, query.get("entityCompanyId"), query.get("unmappedOnly") === "1");
      var mappedN = mrows.filter(function (r) { return r.mapped; }).length;
      return json({ ok: true, rows: mrows, stats: { accounts: mrows.length, mapped: mappedN, unmapped: mrows.length - mappedN, completion: mrows.length ? Math.round(100 * mappedN / mrows.length) : 0 } });
    }

    /* ---- preconsolidation ---- */
    if (pth.indexOf("/preconsolidation") !== -1) {
      var ro5 = gRunObj(); if (!ro5) return json({ ok: false, message: "Run not found" }, 404);
      if (method === "POST" && /validate$/.test(pth)) {
        var pv = G1.preconRows(ro5.id);
        if (!pv) return json({ ok: false, message: "Pre-consolidation TB not generated yet" }, 400);
        var pd = 0, pc = 0; pv.forEach(function (r) { pd = R2(pd + r.debit); pc = R2(pc + r.credit); });
        var pdiff = R2(pd - pc);
        return json({ ok: true, valid: Math.abs(pdiff) < 0.005, debit: pd, credit: pc, difference: pdiff, message: Math.abs(pdiff) < 0.005 ? "Pre-consolidation TB is balanced" : "Difference of " + pdiff.toFixed(2) + " — FX translation pending for Windhoek Trading (Pty) Ltd (CTA 555.75)" });
      }
      if (method === "POST" && /generate$/.test(pth)) { G1.preconGenerated[ro5.id] = true; }
      var prow = G1.preconRows(ro5.id);
      if (!prow) return json({ ok: true, generated: false, rows: [], message: "Not generated — load entity trial balances and generate." });
      var pd2 = 0, pc2 = 0; prow.forEach(function (r) { pd2 = R2(pd2 + r.debit); pc2 = R2(pc2 + r.credit); });
      return json({ ok: true, generated: true, rows: prow, accounts: prow.length, debit: pd2, credit: pc2, difference: R2(pd2 - pc2) });
    }

    /* ---- adjustments ---- */
    if (pth.indexOf("/adjustments") !== -1) {
      var ro6 = gRunObj(); if (!ro6) return json({ ok: false, message: "Run not found" }, 404);
      if (method === "POST" && pth.replace(/\/$/, "") === "/runs/" + (gRun() || "") + "/adjustments") {
        var b6 = gb||{};
        var na = { id: ++G1.seq.adj, run_id: ro6.id, reference: "ADJ-2026-09-" + String(G1.seq.adj).padStart(2, "0"), memo: b6.memo || "Group adjustment", status: "draft", prepared_by: "Demo user", prepared_at: RP1_TODAY + "T" + new Date().toTimeString().slice(0, 5) + ":00", lines: [ { group_account_code: b6.debit_account || "6000", account_name: (G1.coaByCode[b6.debit_account] || {}).name || "—", debit: Number(b6.amount) || 0, credit: 0, memo: b6.debit_memo || "" }, { group_account_code: b6.credit_account || "3100", account_name: (G1.coaByCode[b6.credit_account] || {}).name || "—", debit: 0, credit: Number(b6.amount) || 0, memo: b6.credit_memo || "" } ] };
        G1.adjustments.push(na);
        return json({ ok: true, adjustment: na });
      }
      if (method === "PUT" && /status$/.test(pth)) {
        var a6 = G1.adjustments.filter(function (x) { return x.id === Number(pth.match(/\/adjustments\/([^\/]+)\/status/)[1]); })[0];
        if (a6) a6.status = gb.status || a6.status;
        return json({ ok: true, adjustment: a6 });
      }
      var adjRows = G1.adjustments.filter(function (x) { return x.run_id === ro6.id; });
      return json({ ok: true, adjustments: adjRows, stats: { total: adjRows.length, draft: adjRows.filter(function (x) { return x.status === "draft"; }).length, reviewed: adjRows.filter(function (x) { return x.status === "reviewed"; }).length, approved: adjRows.filter(function (x) { return x.status === "approved"; }).length } });
    }

    /* ---- intercompany ---- */
    if (pth.indexOf("/intercompany") !== -1) {
      var ro7 = gRunObj(); if (!ro7) return json({ ok: false, message: "Run not found" }, 404);
      if (method === "GET" && /rules$/.test(pth)) return json({ ok: true, rules: G1.icRules });
      if (method === "POST" && /apply-rules$/.test(pth)) return json({ ok: true, applied: G1.icRules.filter(function (r) { return r.enabled; }).length, message: "3 rules applied — exact matches already flagged" });
      if (method === "POST" && /auto-match$/.test(pth)) {
        var tol = (G1.icRules.filter(function (r) { return r.action === "match_with_variance"; })[0] || {}).tolerance || 0;
        var unmatched = G1.icBalances.filter(function (b) { return b.run_id === ro7.id && b.status === "unmatched"; });
        var nm = 0;
        for (var i = 0; i < unmatched.length; i++) {
          for (var j = i + 1; j < unmatched.length; j++) {
            var A = unmatched[i], B = unmatched[j];
            if (A.counterparty_entity_id === B.entity_id && B.counterparty_entity_id === A.entity_id && Math.abs(Math.abs(A.amount_zar) - Math.abs(B.amount_zar)) <= tol) {
              var mv = { id: ++G1.seq.match, run_id: ro7.id, balance_a_id: A.id, balance_b_id: B.id, entity_a: (G1.entities.filter(function (e) { return e.id === A.entity_id; })[0] || {}).code, entity_b: (G1.entities.filter(function (e) { return e.id === B.entity_id; })[0] || {}).code, amount_a: A.amount_zar, amount_b: B.amount_zar, currency: "ZAR", variance: R2(Math.abs(A.amount_zar) - Math.abs(B.amount_zar)), status: Math.abs(A.amount_zar) !== Math.abs(B.amount_zar) ? "matched_variance" : "matched", method: "auto" };
              G1.icMatches.push(mv); A.status = B.status = "matched"; A.match_id = B.match_id = mv.id; nm++; i = unmatched.length; break;
            }
          }
        }
        return json({ ok: true, matched: nm, message: nm ? nm + " balance pair(s) matched within tolerance — recon variance of 500.00 will post through the elimination" : "No unmatched pairs within tolerance" });
      }
      if (method === "POST" && /balances$/.test(pth) && !/balances\/[^\/]+$/.test(pth)) {
        var b7 = gb||{};
        var nb = { id: ++G1.seq.balance, run_id: ro7.id, entity_id: Number(b7.entity_id) || 1, counterparty_entity_id: Number(b7.counterparty_entity_id) || 2, account_name: b7.account_name || "Intercompany balance", nature: b7.nature || "current_account", amount: Number(b7.amount) || 0, currency: "ZAR", amount_zar: Number(b7.amount) || 0, direction: (Number(b7.amount) || 0) >= 0 ? "receivable" : "payable", status: "unmatched", match_id: null };
        G1.icBalances.push(nb);
        return json({ ok: true, balance: nb });
      }
      var balRows = G1.icBalances.filter(function (b) { return b.run_id === ro7.id; }).map(function (b) {
        return Object.assign({}, b, { entity_code: (G1.entities.filter(function (e) { return e.id === b.entity_id; })[0] || {}).code, counterparty_code: (G1.entities.filter(function (e) { return e.id === b.counterparty_entity_id; })[0] || {}).code });
      });
      var matches7 = G1.icMatches.filter(function (m) { return m.run_id === ro7.id; });
      var unmatchedN = balRows.filter(function (b) { return b.status === "unmatched"; }).length;
      return json({ ok: true, balances: balRows, matches: matches7, stats: { declarations: balRows.length, matched: balRows.filter(function (b) { return b.status === "matched"; }).length, unmatched: unmatchedN, variances: matches7.filter(function (m) { return m.variance > 0; }).length } });
    }

    /* ---- eliminations ---- */
    if (pth.indexOf("/eliminations") !== -1) {
      var ro8 = gRunObj(); if (!ro8) return json({ ok: false, message: "Run not found" }, 404);
      if (method === "POST" && /generate$/.test(pth)) {
        var matchedPairs = G1.icMatches.filter(function (m) { return m.run_id === ro8.id; });
        var existing = G1.eliminations.filter(function (x) { return x.run_id === ro8.id; }).map(function (x) { return x.match_id; });
        var created = 0;
        matchedPairs.forEach(function (m) {
          if (existing.indexOf(m.id) !== -1) return;
          var A = G1.icBalances.filter(function (b) { return b.id === m.balance_a_id; })[0];
          var B = G1.icBalances.filter(function (b) { return b.id === m.balance_b_id; })[0];
          var amt = Math.min(Math.abs(A.amount_zar), Math.abs(B.amount_zar));
          var varc = R2(Math.abs(Math.abs(A.amount_zar) - Math.abs(B.amount_zar)));
          var lines = [ { group_account_code: "2100", account_name: "Intercompany Payables", debit: Math.max(Math.abs(A.amount_zar), Math.abs(B.amount_zar)), credit: 0 }, { group_account_code: "1400", account_name: "Intercompany Receivables", debit: 0, credit: amt } ];
          if (varc > 0) lines.push({ group_account_code: "4600", account_name: "Intercompany Reconciliation Variance", debit: 0, credit: varc, memo: "Recon variance within tolerance" });
          G1.eliminations.push({ id: ++G1.seq.elim, run_id: ro8.id, reference: "ELIM-2026-09-" + String(G1.seq.elim).padStart(2, "0"), memo: "Eliminate intercompany balances — " + m.entity_a + " ↔ " + m.entity_b + (varc ? " (variance 500.00 to recon variance)" : ""), status: "draft", match_id: m.id, prepared_at: RP1_TODAY + "T" + new Date().toTimeString().slice(0, 5) + ":00", lines: lines });
          created++;
        });
        return json({ ok: true, created: created, message: created ? created + " elimination journal(s) generated as draft" : "All matched pairs already eliminated" });
      }
      if (method === "PUT" && /status$/.test(pth)) {
        var e8 = G1.eliminations.filter(function (x) { return x.id === Number(pth.match(/\/eliminations\/([^\/]+)\/status/)[1]); })[0];
        if (e8) e8.status = gb.status || e8.status;
        return json({ ok: true, elimination: e8 });
      }
      var elRows = G1.eliminations.filter(function (x) { return x.run_id === ro8.id; });
      return json({ ok: true, eliminations: elRows, stats: { total: elRows.length, draft: elRows.filter(function (x) { return x.status === "draft"; }).length, reviewed: elRows.filter(function (x) { return x.status === "reviewed"; }).length, approved: elRows.filter(function (x) { return x.status === "approved"; }).length } });
    }

    /* ---- adjusted TB ---- */
    if (pth.indexOf("/adjusted-tb") !== -1) {
      var ro9 = gRunObj(); if (!ro9) return json({ ok: false, message: "Run not found" }, 404);
      var adjMap = {};
      function bump(code, dr, cr) { if (!adjMap[code]) adjMap[code] = { debit: 0, credit: 0 }; adjMap[code].debit = R2(adjMap[code].debit + (dr || 0)); adjMap[code].credit = R2(adjMap[code].credit + (cr || 0)); }
      function buildAdjusted() {
        adjMap = {};
        (G1.preconRows(ro9.id) || []).forEach(function (r) { bump(r.group_account_code, r.debit, r.credit); });
        G1.adjustments.filter(function (x) { return x.run_id === ro9.id; }).forEach(function (a) { a.lines.forEach(function (l) { bump(l.group_account_code, l.debit, l.credit); }); });
        G1.eliminations.filter(function (x) { return x.run_id === ro9.id; }).forEach(function (a) { a.lines.forEach(function (l) { bump(l.group_account_code, l.debit, l.credit); }); });
      }
      if (method === "POST" && /validate$/.test(pth)) {
        if (!G1.adjustedGenerated[ro9.id]) return json({ ok: false, message: "Adjusted TB not generated yet" }, 400);
        buildAdjusted();
        var ad = 0, ac = 0; Object.keys(adjMap).forEach(function (k) { ad = R2(ad + adjMap[k].debit); ac = R2(ac + adjMap[k].credit); });
        var adiff = R2(ad - ac);
        return json({ ok: true, valid: Math.abs(adiff) < 0.005, debit: ad, credit: ac, difference: adiff, message: Math.abs(adiff) < 0.005 ? "Adjusted Group TB is balanced" : "Difference of " + adiff.toFixed(2) + " Dr — FX translation pending for Windhoek Trading (Pty) Ltd (CTA 555.75 Cr will clear it in the Final Group TB)" });
      }
      if (method === "POST" && /generate$/.test(pth)) { G1.adjustedGenerated = G1.adjustedGenerated || {}; G1.adjustedGenerated[ro9.id] = true; }
      G1.adjustedGenerated = G1.adjustedGenerated || {};
      if (!G1.adjustedGenerated[ro9.id]) return json({ ok: true, generated: false, rows: [], message: "Not generated — complete pre-consolidation, adjustments and eliminations, then generate." });
      buildAdjusted();
      var arows = Object.keys(adjMap).sort().map(function (k) {
        var pre = (G1.preconRows(ro9.id) || []).filter(function (r) { return r.group_account_code === k; })[0] || { debit: 0, credit: 0 };
        var adjD = 0, adjC = 0;
        G1.adjustments.filter(function (x) { return x.run_id === ro9.id; }).forEach(function (a) { a.lines.forEach(function (l) { if (l.group_account_code === k) { adjD = R2(adjD + l.debit); adjC = R2(adjC + l.credit); } }); });
        var elD = 0, elC = 0;
        G1.eliminations.filter(function (x) { return x.run_id === ro9.id; }).forEach(function (a) { a.lines.forEach(function (l) { if (l.group_account_code === k) { elD = R2(elD + l.debit); elC = R2(elC + l.credit); } }); });
        var g = G1.coaByCode[k] || {};
        return { group_account_code: k, group_account_name: g.name || k, precon_debit: R2(pre.debit), precon_credit: R2(pre.credit), adj_debit: adjD, adj_credit: adjC, elim_debit: elD, elim_credit: elC, final_debit: adjMap[k].debit, final_credit: adjMap[k].credit, statement: g.statement || "bs" };
      });
      var tad = 0, tac = 0; arows.forEach(function (r) { tad = R2(tad + r.final_debit); tac = R2(tac + r.final_credit); });
      return json({ ok: true, generated: true, rows: arows, accounts: arows.length, debit: tad, credit: tac, difference: R2(tad - tac) });
    }
    /* adjusted-tb account detail falls through to generic handler below */

    /* ---- acquisition & NCI ---- */
    if (pth.indexOf("/acquisition") !== -1) {
      var roA = gRunObj(); if (!roA) return json({ ok: false, message: "Run not found" }, 404);
      if (method === "POST" && /prepare$/.test(pth)) return json({ ok: true, created: 0, message: "2 workpapers already prepared for this run" });
      if (method === "POST" && /calculate$/.test(pth)) {
        var wpA = G1.acquisition.filter(function (x) { return x.id === Number(pth.match(/\/acquisition\/([^\/]+)\/calculate/)[1]); })[0];
        if (wpA) { wpA.goodwill = R2(wpA.cost_of_investment + wpA.nci_at_acquisition - wpA.net_assets_at_acquisition); wpA.closing_nci = R2(wpA.nci_at_acquisition + wpA.nci_share_post); }
        return json({ ok: true, workpaper: wpA });
      }
      if (method === "PUT" && /status$/.test(pth)) {
        var wpA2 = G1.acquisition.filter(function (x) { return x.id === Number(pth.match(/\/acquisition\/([^\/]+)\/status/)[1]); })[0];
        if (wpA2) wpA2.status = gb.status || wpA2.status;
        return json({ ok: true, workpaper: wpA2 });
      }
      var acqRows = G1.acquisition.filter(function (x) { return x.run_id === roA.id; });
      return json({ ok: true, workpapers: acqRows, stats: { subsidiaries: acqRows.length, approved: acqRows.filter(function (x) { return x.status === "approved"; }).length, goodwill: R2(acqRows.reduce(function (s, x) { return s + x.goodwill; }, 0)), closing_nci: R2(acqRows.reduce(function (s, x) { return s + x.closing_nci; }, 0)) } });
    }

    /* ---- equity method ---- */
    if (pth.indexOf("/equity-method") !== -1) {
      var roE = gRunObj(); if (!roE) return json({ ok: false, message: "Run not found" }, 404);
      if (method === "POST" && /prepare$/.test(pth)) return json({ ok: true, created: 0, message: "2 workpapers already prepared for this run" });
      if (method === "POST" && /calculate$/.test(pth)) {
        var wpE = G1.equityMethod.filter(function (x) { return x.id === Number(pth.match(/\/equity-method\/([^\/]+)\/calculate/)[1]); })[0];
        if (wpE) wpE.carrying_amount = R2(wpE.cost + wpE.share_of_profit + wpE.other_movements);
        return json({ ok: true, workpaper: wpE });
      }
      if (method === "PUT" && /status$/.test(pth)) {
        var wpE2 = G1.equityMethod.filter(function (x) { return x.id === Number(pth.match(/\/equity-method\/([^\/]+)\/status/)[1]); })[0];
        if (wpE2) wpE2.status = gb.status || wpE2.status;
        return json({ ok: true, workpaper: wpE2 });
      }
      if (method === "POST" && /journals\/generate$/.test(pth)) return json({ ok: true, created: 1, message: "Equity-method journal generated: Dr Investments in Associates & JVs 3,505.00 / Cr Share of Profit of Associates & JVs 3,505.00 (draft)" });
      var emRows = G1.equityMethod.filter(function (x) { return x.run_id === roE.id; });
      return json({ ok: true, workpapers: emRows, stats: { investments: emRows.length, associates: emRows.filter(function (x) { return x.classification === "associate"; }).length, jvs: emRows.filter(function (x) { return x.classification === "joint_venture"; }).length, share_of_profit: R2(emRows.reduce(function (s, x) { return s + x.share_of_profit; }, 0)), closing_investment: R2(emRows.reduce(function (s, x) { return s + x.carrying_amount; }, 0)) } });
    }

    /* ---- FX translation ---- */
    if (pth.indexOf("/translation") !== -1) {
      var roT = gRunObj(); if (!roT) return json({ ok: false, message: "Run not found" }, 404);
      if (method === "POST" && /prepare$/.test(pth)) return json({ ok: true, created: 0, message: "Translation workpaper already prepared for Windhoek Trading (Pty) Ltd" });
      if (method === "POST" && /translate$/.test(pth)) return json({ ok: true, message: "Translation recalculated — CTA 555.75 Cr" });
      if (method === "PUT" && /status$/.test(pth)) {
        var wpT = G1.translation.filter(function (x) { return x.id === Number(pth.match(/\/translation\/([^\/]+)\/status/)[1]); })[0];
        if (wpT) wpT.status = gb.status || wpT.status;
        return json({ ok: true, workpaper: wpT });
      }
      var tRows = G1.translation.filter(function (x) { return x.run_id === roT.id; });
      return json({ ok: true, workpapers: tRows, stats: { entities: tRows.length, foreign: tRows.filter(function (x) { return x.functional_currency !== "ZAR"; }).length, approved: tRows.filter(function (x) { return x.status === "approved"; }).length, cta: R2(tRows.reduce(function (s, x) { return s + x.cta; }, 0)) } });
    }

    /* ---- controls & close ---- */
    if (pth.indexOf("/controls") !== -1 || /\/(close|reopen)$/.test(pth)) {
      var roC = gRunObj(); if (!roC) return json({ ok: false, message: "Run not found" }, 404);
      if (method === "POST" && /close$/.test(pth)) {
        var checksC = G1.controlChecks(roC.id);
        var failing = checksC.filter(function (c) { return c.state !== "pass"; });
        if (failing.length) return json({ ok: false, message: "Cannot close — " + failing.length + " check(s) outstanding: " + failing.map(function (c) { return c.title; }).join("; ") }, 400);
        roC.status = "approved"; roC.approved_by = "A. Petersen"; roC.approved_at = RP1_TODAY + "T" + new Date().toTimeString().slice(0, 5) + ":00"; roC.closed_at = roC.approved_at;
        return json({ ok: true, run: roC, message: "Consolidation " + roC.code + " closed and locked" });
      }
      if (method === "POST" && /reopen$/.test(pth)) { roC.status = "prepared"; roC.closed_at = null; return json({ ok: true, run: roC }); }
      return json({ ok: true, run: { code: roC.code, status: roC.status, period_start: roC.period_start, period_end: roC.period_end }, checks: G1.controlChecks(roC.id) });
    }

    /* ---- final TB ---- */
    if (pth.indexOf("/final-tb") !== -1) {
      var roF = gRunObj(); if (!roF) return json({ ok: false, message: "Run not found" }, 404);
      G1.finalGenerated = G1.finalGenerated || {};
      if (method === "POST" && /validate$/.test(pth)) {
        if (!G1.finalGenerated[roF.id]) return json({ ok: false, message: "Final TB not generated yet" }, 400);
        var f = G1.finalRows(roF.id);
        return json({ ok: true, valid: Math.abs(f.difference) < 0.005, debit: f.debit, credit: f.credit, difference: f.difference, message: "Final Group TB is balanced — ready for Group Financial Statements" });
      }
      if (method === "POST" && /generate$/.test(pth)) G1.finalGenerated[roF.id] = true;
      if (!G1.finalGenerated[roF.id]) return json({ ok: true, generated: false, rows: [], message: "Not generated — approve acquisition, equity-method and translation workpapers, then generate." });
      return json(Object.assign({ ok: true, generated: true }, G1.finalRows(roF.id)));
    }

    /* ---- group statements ---- */
    if (pth.indexOf("/group-statements") !== -1) {
      var roS = gRunObj(); if (!roS) return json({ ok: false, message: "Run not found" }, 404);
      var stType = pth.match(/\/group-statements\/([^\/]+)/);
      var statements = G1.statements(roS.id);
      if (method === "POST" && /export$/.test(pth)) {
        return json({ ok: true, token: "grp1-" + Date.now(), url: "/api/companies/" + cid + "/reports/export?token=grp1-" + Date.now(), format: gb.format || "csv" });
      }
      if (stType) return json({ ok: true, statement: statements[decodeURIComponent(stType[1])] || null, run: { code: roS.code, period_end: roS.period_end } });
      return json({ ok: true, run: { code: roS.code, period_end: roS.period_end }, available: Object.keys(statements), statements: statements });
    }

    /* ---- run detail / prepare ---- */
    if (pth === "/runs/" + (gRun() || "") && method === "GET") { var roG = gRunObj(); return roG ? json({ ok: true, run: roG }) : json({ ok: false, message: "Run not found" }, 404); }
    if (/\/prepare$/.test(pth)) {
      var roP = gRunObj(); if (!roP) return json({ ok: false, message: "Run not found" }, 404);
      if (roP.status === "draft") { roP.status = "prepared"; roP.prepared_by = "Demo user"; roP.prepared_at = RP1_TODAY + "T" + new Date().toTimeString().slice(0, 5) + ":00"; }
      return json({ ok: true, run: roP });
    }
    /* adjusted-tb account detail */
    if (/\/adjusted-tb\/accounts\//.test(pth)) {
      var accC = decodeURIComponent(pth.match(/\/adjusted-tb\/accounts\/([^\/]+)/)[1]);
      var det = (G1.preconRows(2) || []).filter(function (r) { return r.group_account_code === accC; })[0];
      return json({ ok: true, account: G1.coaByCode[accC] || null, entity_balances: det ? det.entities : {}, layer_note: accC === "3900" ? "Group-layer memorandum: IC recognition 146,900.00 + equity-method recognition 95,000.00 + investment funding 200,000.00" : null });
    }
  }

  /* === fifadt-mock-start (Task 15) === */
      /* ══════════════════════════════════════════════════════════════════
         fa2 — FIXED ASSETS mock block (Task 15)
         Inserted BEFORE the generic fallback so /assets*, /depreciation*,
         /asset-reports/*, /subsequent-measurements* routes win.

         DATA TIE-OUTS (all disclosed here, nothing pre-existing changes):
         · Register = the 3 assets behind BS "Equipment (net)":
             cost 96,500 + 52,300 + 36,200            = 185,000.00
             acc-dep 24,125 + 13,075 + 9,050          = 46,250.00
             carrying 72,375 + 39,225 + 27,150        = 138,750.00
           → ties byte-exact to BS_ROWS Equipment (net) 138,750 and to the
             dashboard Fixed-Assets snapshot (185,000 / 46,250 / 138,750).
         · Asset codes/names/classes mirror the tr2 tax profiles
           (FA-EQ-001/002/003, Plant & Machinery / Tools & Equipment /
           Furniture & Fittings).
         · All three assets: acquired 2024-04-01, SL over 120 months →
           30 months of depreciation to 2026-09-30 = exactly 25% each;
           monthly run-rate 804.17 + 435.83 + 301.67 = 1,541.67/mo
           (18,500.00/yr — matches the tax-recon derivation 46,250/2.5yrs).
         · Posted depreciation history seeded: Apr…Sep 2026 monthly drafts
           NOT included in acc-dep (already inside the 46,250 cumulative).
         · Journal codes (new, follow ln1 convention): PL_EX_6700
           "Depreciation Expense (PPE)" / BS_CA_1450 (existing COA) /
           BS_CA_1400 (existing COA).
         · SM history: FA-EQ-001 posted add_cost 12,500 on 2026-09-30 is
           ALREADY inside the 96,500 cost (original cost was 84,000).
         State persists on window.__FA2 for the session.
         ══════════════════════════════════════════════════════════════════ */
      if (cidMatch && (pathname.indexOf("/assets") !== -1 || pathname.indexOf("/asset-") !== -1 || pathname.indexOf("/depreciation") !== -1 || pathname.indexOf("/subsequent-measurements") !== -1 || pathname.indexOf("/transfers") !== -1 || pathname.indexOf("/revaluations") !== -1 || pathname.indexOf("/disposals") !== -1 || pathname.indexOf("/impairments") !== -1)) {
        if (!window.__FA2) {
          var fa2Assets = [
            { id: 601, asset_code: "FA-EQ-001", asset_name: "CNC Machining Centre", asset_class: "Plant & Machinery", accounting_standard: "ias16", acquisition_date: "2024-04-01", available_for_use_date: "2024-04-01", cost: 96500.00, accumulated_depreciation: 24125.00, carrying_amount: 72375.00, status: "active", location: "Main Factory — Springs", serial_no: "CNC-88214", asset_tag: "MOK-PPE-001", custodian: "Production Team", depreciation_method: "SL", useful_life_months: 120, residual_value: 0, measurement_basis: "cost", is_component_group: false, notes: "Installed capacity upgrade. Brought into use for tax on 2025-03-01 (RSL wear & tear 10%)." },
            { id: 602, asset_code: "FA-EQ-002", asset_name: "Workshop Tools & Equipment", asset_class: "Tools & Equipment", accounting_standard: "ias16", acquisition_date: "2024-04-01", available_for_use_date: "2024-04-01", cost: 52300.00, accumulated_depreciation: 13075.00, carrying_amount: 39225.00, status: "active", location: "Workshop — Springs", serial_no: "WT-44170", asset_tag: "MOK-PPE-002", custodian: "Workshop Supervisor", depreciation_method: "SL", useful_life_months: 120, residual_value: 0, measurement_basis: "cost", is_component_group: false, notes: "Bundled workshop tooling. Tax allowances from 2025-06-14 (RSL wear & tear 20%)." },
            { id: 603, asset_code: "FA-EQ-003", asset_name: "Office Fit-out", asset_class: "Furniture & Fittings", accounting_standard: "ias16", acquisition_date: "2024-04-01", available_for_use_date: "2024-04-01", cost: 36200.00, accumulated_depreciation: 9050.00, carrying_amount: 27150.00, status: "active", location: "Head Office — Kruger Street", serial_no: "OF-11023", asset_tag: "MOK-PPE-003", custodian: "Administration", depreciation_method: "SL", useful_life_months: 120, residual_value: 0, measurement_basis: "cost", is_component_group: false, notes: "Office fit-out at 14 Kruger Street. Awaiting tax classification (profile not configured)." }
          ];
          window.__FA2 = {
            assets: fa2Assets,
            nextAssetId: 604,
            depDrafts: [],   /* created by Run Depreciation */
            depPosted: [
              /* Sep 2026 posted run (inside the 46,250 cumulative) */
              { id: 7001, asset_id: 601, asset_code: "FA-EQ-001", asset_name: "CNC Machining Centre", asset_class: "Plant & Machinery", period_start: "2026-09-01", period_end: "2026-09-30", depreciation_amount: 804.17, status: "posted", journal_id: 6811 },
              { id: 7002, asset_id: 602, asset_code: "FA-EQ-002", asset_name: "Workshop Tools & Equipment", asset_class: "Tools & Equipment", period_start: "2026-09-01", period_end: "2026-09-30", depreciation_amount: 435.83, status: "posted", journal_id: 6811 },
              { id: 7003, asset_id: 603, asset_code: "FA-EQ-003", asset_name: "Office Fit-out", asset_class: "Furniture & Fittings", period_start: "2026-09-01", period_end: "2026-09-30", depreciation_amount: 301.67, status: "posted", journal_id: 6811 }
            ],
            nextDepId: 7004,
            nextJournalId: 6901,
            activity: {
              601: [
                { event_date: "2024-04-01", event_type: "acquisition", status: "posted", amount: 84000.00, reference: "FA-EQ-001", source_table: "assets", source_id: 601 },
                { event_date: "2026-09-30", event_type: "add_cost", status: "posted", amount: 12500.00, reference: "SM-901", source_table: "subsequent_measurements", source_id: 901 },
                { event_date: "2026-09-30", event_type: "depreciation", status: "posted", amount: 804.17, reference: "DEP-2026-09", source_table: "depreciation", source_id: 7001 }
              ],
              602: [
                { event_date: "2024-04-01", event_type: "acquisition", status: "posted", amount: 52300.00, reference: "FA-EQ-002", source_table: "assets", source_id: 602 },
                { event_date: "2026-09-30", event_type: "depreciation", status: "posted", amount: 435.83, reference: "DEP-2026-09", source_table: "depreciation", source_id: 7002 }
              ],
              603: [
                { event_date: "2024-04-01", event_type: "acquisition", status: "posted", amount: 36200.00, reference: "FA-EQ-003", source_table: "assets", source_id: 603 },
                { event_date: "2026-09-30", event_type: "depreciation", status: "posted", amount: 301.67, reference: "DEP-2026-09", source_table: "depreciation", source_id: 7003 }
              ]
            },
            documents: {
              601: [ { id: 8801, doc_type: "invoice", file_name: "cnc-machining-centre-invoice.pdf", file_url: "#", reference: "INV-88214", notes: "Supplier invoice — installed capacity upgrade (84,000.00 + add-cost 12,500.00).", is_archived: false, status: "active" } ],
              602: [ { id: 8802, doc_type: "warranty", file_name: "workshop-tooling-warranty.pdf", file_url: "#", reference: "WT-WAR-24", notes: "24-month supplier warranty on bundled tooling.", is_archived: false, status: "active" } ],
              603: [ { id: 8803, doc_type: "contract", file_name: "office-fitout-contract.pdf", file_url: "#", reference: "FIT-2024-03", notes: "Fit-out contract — 14 Kruger Street.", is_archived: false, status: "active" } ]
            },
            verifications: {
              601: [ { id: 8901, verification_date: "2026-08-31", status: "verified", location: "Main Factory — Springs", custodian: "Production Team", verified_by: "L. Dlamini", notes: "Half-year count — serial CNC-88214 confirmed.", is_archived: false } ],
              602: [ { id: 8902, verification_date: "2026-08-31", status: "verified", location: "Workshop — Springs", custodian: "Workshop Supervisor", verified_by: "L. Dlamini", notes: "Tooling count matched register.", is_archived: false } ],
              603: [ { id: 8903, verification_date: "2026-08-31", status: "mismatch", location: "Head Office — Kruger Street", custodian: "Administration", verified_by: "P. Naidoo", notes: "Two workstations relocated — follow-up scheduled.", is_archived: false } ]
            },
            smEvents: [
              { id: 901, asset_id: 601, event_date: "2026-09-30", event_type: "add_cost", amount: 12500.00, status: "posted", debit_account_code: "BS_CA_1400", credit_account_code: "BS_CA_1000", vat_treatment: "standard_claimed", notes: "Tooling package added to CNC centre (already reflected in register cost)." },
              { id: 902, asset_id: 602, event_date: "2026-09-30", event_type: "change_estimate", amount: 0, status: "draft", useful_life_months: 108, residual_value: 0, depreciation_method: "SL", notes: "Draft — review tooling useful life from 120 to 108 months." }
            ],
            nextSmId: 903,
            policies: {
              classification: { classes: {
                "plant_machinery": { label: "Plant & Machinery", includes: ["CNC machinery", "production equipment"] },
                "tools_equipment": { label: "Tools & Equipment", includes: ["workshop tools", "light equipment"] },
                "furniture_fittings": { label: "Furniture & Fittings", includes: ["office fit-out", "furniture"] }
              } },
              capitalization: { threshold_amount: 2000, rule: "expense_below_threshold", apply_to_event_types: ["add_cost"] },
              models: {
                ias16: { allowed_switches: [ { from: "cost", to: "revaluation", classes: ["plant_machinery"] } ] },
                ias40: { allowed_switches: [] },
                ias38: { allowed_switches: [] }
              }
            },
            cgus: [ { id: 1, cgu_code: "CGU-FACTORY", cgu_name: "Springs Factory Line", member_count: 2 } ],
            valuers: [
              { id: 1, valuer_name: "Thandeka Rooke", valuer_firm: "Rooke & Naidoo Property Valuers", valuer_registration_no: "SACPVP 4412", valuer_is_external: true },
              { id: 2, valuer_name: "Pieter Vosloo", valuer_firm: "Vosloo Plant & Machinery Valuations", valuer_registration_no: "SACPVP 2287", valuer_is_external: true }
            ],
            nextDocId: 8804, nextVerId: 8904
          };
        }
        var FA2 = window.__FA2;
        var fa2AssetById = function (id) {
          return FA2.assets.filter(function (a) { return Number(a.id) === Number(id); })[0] || null;
        };
        var fa2MonthsBetween = function (ps, pe) {
          if (!ps || !pe) return 1;
          var a = new Date(ps + "T00:00:00Z"), b = new Date(pe + "T00:00:00Z");
          var m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
          if (b.getUTCDate() >= a.getUTCDate()) m += 1; /* inclusive month */
          return Math.max(1, m);
        };
        var fa2R2 = function (n) { return Math.round(Number(n) * 100) / 100; };

        /* ---- GET /assets (register list) ---- */
        var faListM = pathname.match(/\/assets$/);
        if (faListM && method === "GET") {
          var faRows = FA2.assets.slice();
          var faQ = (query.get("q") || "").trim().toLowerCase();
          var faSt = (query.get("status") || "").trim().toLowerCase();
          var faCl = (query.get("class") || "").trim().toLowerCase();
          if (faSt && faSt !== "all") faRows = faRows.filter(function (a) { return String(a.status || "").toLowerCase() === faSt; });
          if (faCl) faRows = faRows.filter(function (a) { return String(a.asset_class || "").toLowerCase().indexOf(faCl) !== -1; });
          if (faQ) faRows = faRows.filter(function (a) {
            var hay = [a.asset_name, a.asset_code, a.asset_class, a.location, a.status, a.serial_no, a.asset_tag].join(" ").toLowerCase();
            return hay.indexOf(faQ) !== -1;
          });
          return json({ data: faRows, items: faRows, total: faRows.length });
        }

        /* ---- GET /assets/policies (before :id routes) ---- */
        if (/\/assets\/policies$/.test(pathname) && method === "GET") {
          return json({ item: FA2.policies, data: FA2.policies });
        }
        if (/\/assets\/policies$/.test(pathname) && method === "POST") {
          try { var faPolBody = JSON.parse(opts.body || "{}"); if (faPolBody && typeof faPolBody === "object") FA2.policies = faPolBody; } catch (e) {}
          return json({ ok: true, item: FA2.policies });
        }

        /* ---- GET /assets/:id / PUT /assets/:id / reclassify ---- */
        var faIdM = pathname.match(/\/assets\/(\d+)\/reclassify$/);
        if (faIdM && method === "POST") {
          var faRcBody = {}; try { faRcBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var faRcAsset = fa2AssetById(faIdM[1]);
          if (faRcAsset && faRcBody.accounting_standard) faRcAsset.accounting_standard = faRcBody.accounting_standard;
          return json({ ok: true, message: "Asset reclassified." });
        }
        var faOneM = pathname.match(/\/assets\/(\d+)$/);
        if (faOneM && method === "GET") {
          var faOne = fa2AssetById(faOneM[1]);
          return json({ item: faOne, data: faOne });
        }
        if (faOneM && method === "PUT") {
          var faUpd = {}; try { faUpd = JSON.parse(opts.body || "{}"); } catch (e) {}
          var faTarget = fa2AssetById(faOneM[1]);
          if (faTarget) {
            ["asset_name", "asset_class", "status", "location", "serial_no", "asset_tag", "custodian", "notes", "available_for_use_date", "ready_for_use_date", "useful_life_months", "residual_value"].forEach(function (k) {
              if (faUpd[k] !== undefined) faTarget[k] = faUpd[k];
            });
          }
          return json({ ok: true, data: faTarget, item: faTarget });
        }

        /* ---- activity / documents / verifications / SM context ---- */
        var faActM = pathname.match(/\/assets\/(\d+)\/activity$/);
        if (faActM && method === "GET") {
          var faAct = (FA2.activity[Number(faActM[1])] || []).slice();
          return json({ data: faAct, items: faAct });
        }
        var faDocM = pathname.match(/\/assets\/(\d+)\/documents$/);
        if (faDocM && method === "GET") {
          var faDocs = (FA2.documents[Number(faDocM[1])] || []).slice();
          return json({ data: faDocs });
        }
        if (faDocM && method === "POST") {
          var faDocBody = {}; try { faDocBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var faDocAsset = Number(faDocM[1]);
          FA2.documents[faDocAsset] = FA2.documents[faDocAsset] || [];
          var faDocNew = { id: FA2.nextDocId++, doc_type: faDocBody.doc_type || "other", file_name: faDocBody.file_name || "document", file_url: faDocBody.file_url || "#", reference: faDocBody.reference || "", notes: faDocBody.notes || "", is_archived: false, status: "active" };
          FA2.documents[faDocAsset].push(faDocNew);
          return json({ ok: true, data: faDocNew, item: faDocNew });
        }
        var faVerM = pathname.match(/\/assets\/(\d+)\/verifications$/);
        if (faVerM && method === "GET") {
          return json({ data: (FA2.verifications[Number(faVerM[1])] || []).slice() });
        }
        if (faVerM && method === "POST") {
          var faVerBody = {}; try { faVerBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var faVerAsset = Number(faVerM[1]);
          FA2.verifications[faVerAsset] = FA2.verifications[faVerAsset] || [];
          var faVerNew = { id: FA2.nextVerId++, verification_date: faVerBody.verification_date || "2026-10-16", status: faVerBody.status || "open", location: faVerBody.location || "", custodian: faVerBody.custodian || "", verified_by: faVerBody.verified_by || "", notes: faVerBody.notes || "", is_archived: false };
          FA2.verifications[faVerAsset].push(faVerNew);
          return json({ ok: true, data: faVerNew });
        }
        var faSmiM = pathname.match(/\/assets\/(\d+)\/subsequent-measurement-context$/);
        if (faSmiM && method === "GET") {
          var faCtxAsset = fa2AssetById(faSmiM[1]) || {};
          return json({
            asset_id: faCtxAsset.id, standard: faCtxAsset.accounting_standard || "ias16", model: faCtxAsset.measurement_basis || "cost", status: faCtxAsset.status || "active",
            allowed_event_types: ["add_cost", "change_estimate", "impairment_loss", "impairment_reversal", "revaluation", "fair_value_valuation"],
            additions: { total: 12500.00, last_date: "2026-09-30" },
            impairment: { losses: 0, reversals: 0, balance: 0 },
            latest_impairment: null,
            revaluations: { count: 0, increases: 0, decreases: 0, net_change: 0 },
            latest_revaluation: null
          });
        }

        /* ---- depreciation preview / run / list / post-batch / recalculate ---- */
        if (/\/depreciation\/preview$/.test(pathname) && method === "POST") {
          var faPvBody = {}; try { faPvBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var faPvRows = [];
          FA2.assets.forEach(function (a) {
            if (faPvBody.asset_id && Number(faPvBody.asset_id) !== Number(a.id)) return;
            if (faPvBody.asset_class && String(a.asset_class).toLowerCase().indexOf(String(faPvBody.asset_class).toLowerCase()) === -1) return;
            var months = fa2MonthsBetween(faPvBody.period_start, faPvBody.period_end);
            var perMonth = Number(a.cost || 0) / (Number(a.useful_life_months) || 120);
            var dep = fa2R2(Math.min(perMonth * months, Math.max(0, Number(a.carrying_amount || 0) - Number(a.residual_value || 0))));
            faPvRows.push({
              asset_id: a.id, asset_name: a.asset_name, asset_code: a.asset_code, asset_class: a.asset_class,
              period_start: faPvBody.period_start, period_end: faPvBody.period_end,
              depreciation_amount: dep, carrying_after: fa2R2(Number(a.carrying_amount || 0) - dep), status: "draft",
              journal_lines: [
                { account_code: "PL_EX_6700", account_name: "Depreciation Expense (PPE)", debit: dep, credit: 0 },
                { account_code: "BS_CA_1450", account_name: "Accumulated Depreciation - Equipment", debit: 0, credit: dep }
              ]
            });
          });
          return json({ data: faPvRows, items: faPvRows });
        }
        if (/\/depreciation\/run$/.test(pathname) && method === "POST") {
          var faRunBody = {}; try { faRunBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var faCreated = 0;
          FA2.assets.forEach(function (a) {
            if (faRunBody.asset_id && Number(faRunBody.asset_id) !== Number(a.id)) return;
            if (faRunBody.asset_class && String(a.asset_class).toLowerCase().indexOf(String(faRunBody.asset_class).toLowerCase()) === -1) return;
            var months = fa2MonthsBetween(faRunBody.period_start, faRunBody.period_end);
            var perMonth = Number(a.cost || 0) / (Number(a.useful_life_months) || 120);
            var dep = fa2R2(Math.min(perMonth * months, Math.max(0, Number(a.carrying_amount || 0) - Number(a.residual_value || 0))));
            FA2.depDrafts.push({ id: FA2.nextDepId++, asset_id: a.id, asset_code: a.asset_code, asset_name: a.asset_name, asset_class: a.asset_class, period_start: faRunBody.period_start, period_end: faRunBody.period_end, depreciation_amount: dep, status: "draft", journal_id: null });
            faCreated++;
          });
          return json({ count: faCreated, data: [] });
        }
        if (/\/depreciation\/post-batch$/.test(pathname) && method === "POST") {
          var faPbBody = {}; try { faPbBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var faIds = (faPbBody.dep_ids || []).map(Number);
          var faPosted = 0;
          FA2.depDrafts.forEach(function (d) {
            if (faIds.indexOf(Number(d.id)) === -1) return;
            d.status = "posted"; d.journal_id = FA2.nextJournalId++;
            FA2.depPosted.push(d);
            var a = fa2AssetById(d.asset_id);
            if (a) {
              a.accumulated_depreciation = fa2R2(Number(a.accumulated_depreciation || 0) + Number(d.depreciation_amount || 0));
              a.carrying_amount = fa2R2(Number(a.cost || 0) - Number(a.accumulated_depreciation || 0));
              FA2.activity[a.id] = FA2.activity[a.id] || [];
              FA2.activity[a.id].push({ event_date: d.period_end, event_type: "depreciation", status: "posted", amount: d.depreciation_amount, reference: "DEP-" + String(d.period_end || "").slice(0, 7), source_table: "depreciation", source_id: d.id });
            }
            faPosted++;
          });
          FA2.depDrafts = FA2.depDrafts.filter(function (d) { return faIds.indexOf(Number(d.id)) === -1; });
          return json({ posted: true, posted_count: faPosted });
        }
        if (/\/depreciation\/recalculate$/.test(pathname) && method === "POST") {
          return json({ ok: true, recalculated: FA2.assets.length });
        }
        if (/\/depreciation$/.test(pathname) && method === "GET") {
          var faDepSt = (query.get("status") || "").trim().toLowerCase();
          var faDepRows = FA2.depDrafts.concat(FA2.depPosted);
          if (faDepSt && faDepSt !== "all") faDepRows = faDepRows.filter(function (d) { return String(d.status).toLowerCase() === faDepSt; });
          var faPe = (query.get("period_end") || "").trim();
          if (faPe) faDepRows = faDepRows.filter(function (d) { return String(d.period_end) === faPe; });
          return json({ data: faDepRows, items: faDepRows, total: faDepRows.length });
        }

        /* ---- asset reports (register / depreciation / movements / disposals) ---- */
        if (/\/asset-reports\/register$/.test(pathname) && method === "GET") {
          var faRegItems = FA2.assets.map(function (a) {
            return { asset_code: a.asset_code, asset_name: a.asset_name, asset_class: a.asset_class, cost: a.cost, accumulated_depreciation: a.accumulated_depreciation, accumulated_impairment: 0, carrying_amount: a.carrying_amount, useful_life_months: a.useful_life_months, depreciation_method: a.depreciation_method, status: a.status, location: a.location };
          });
          return json({ items: faRegItems, total: faRegItems.length, limit: 200, offset: 0, summary: { as_of: query.get("as_of") || "2026-09-30", asset_count: faRegItems.length, total_cost: 185000.00, total_accumulated_depreciation: 46250.00, total_carrying_amount: 138750.00 } });
        }
        if (/\/asset-reports\/depreciation$/.test(pathname) && method === "GET") {
          var faDepItems = FA2.depPosted.concat(FA2.depDrafts).map(function (d) {
            var a = fa2AssetById(d.asset_id) || {};
            return { period_end: d.period_end, asset_code: d.asset_code, asset_name: d.asset_name, asset_class: d.asset_class, depreciation_amount: d.depreciation_amount, accumulated_depreciation: a.accumulated_depreciation || 0, carrying_amount: a.carrying_amount || 0, depreciation_method_basis: "straight_line", measurement_basis: a.measurement_basis || "cost", status: d.status };
          });
          var faDepSum = 0; faDepItems.forEach(function (r) { faDepSum += Number(r.depreciation_amount || 0); });
          return json({ items: faDepItems, total: faDepItems.length, limit: 200, offset: 0, summary: { periods_covered: 1, total_depreciation: fa2R2(faDepSum), method: "Straight line" } });
        }
        if (/\/asset-reports\/movements$/.test(pathname) && method === "GET") {
          var faMovItems = [];
          FA2.assets.forEach(function (a) {
            (FA2.activity[a.id] || []).forEach(function (ev) {
              faMovItems.push({ event_date: ev.event_date, event_type: ev.event_type, asset_code: a.asset_code, asset_name: a.asset_name, asset_class: a.asset_class, amount: ev.amount, reference: ev.reference, status: ev.status, source_table: ev.source_table, notes: "" });
            });
          });
          faMovItems.sort(function (x, y) { return String(x.event_date) < String(y.event_date) ? -1 : 1; });
          var faAddSum = 0, faDepSumM = 0;
          faMovItems.forEach(function (r) { if (r.event_type === "acquisition" || r.event_type === "add_cost") faAddSum += Number(r.amount || 0); if (r.event_type === "depreciation") faDepSumM += Number(r.amount || 0); });
          return json({ items: faMovItems, total: faMovItems.length, limit: 300, offset: 0, summary: { total_movements: faMovItems.length, additions_and_add_costs: faAddSum, depreciation_posted: fa2R2(faDepSumM) } });
        }
        if (/\/asset-reports\/disposals$/.test(pathname) && method === "GET") {
          return json({ items: [], total: 0, limit: 200, offset: 0, summary: { disposal_count: 0, total_proceeds: 0.00, total_gain_loss: 0.00 } });
        }

        /* ---- subsequent measurements ---- */
        if (/\/subsequent-measurements\/preview$/.test(pathname) && method === "POST") {
          var faSmBody = {}; try { faSmBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var faSmAsset = fa2AssetById(faSmBody.asset_id) || {};
          var faEntered = Number(faSmBody.amount || 0);
          var faVatTr = faSmBody.vat_treatment || "no_vat";
          var faVatRate = faVatTr === "no_vat" ? 0 : 15;
          var faNet = faVatRate ? fa2R2(faEntered / (1 + faVatRate / 100)) : faEntered;
          var faVat = fa2R2(faEntered - faNet);
          var faRec = (faVatTr === "standard_claimed" || faVatTr === "input_claimed") ? faVat : 0;
          var faCap = faVatTr === "capitalise_vat" ? faEntered : faNet;
          var faDelta = faSmBody.event_type === "impairment_loss" ? -faEntered : (faSmBody.event_type === "impairment_reversal" ? faEntered : faCap);
          var faCarryBefore = Number(faSmAsset.carrying_amount || 0);
          return json({
            impact: {
              vat_treatment: faVatTr, vat_rate_percent: faVatRate, entered_amount: faEntered,
              net_excluding_vat: faNet, total_vat: faVat, recoverable_vat: faRec, non_recoverable_vat: fa2R2(faVat - faRec),
              gross_settlement_amount: faEntered, capitalized_amount: faCap,
              gross_cost_before: Number(faSmAsset.cost || 0),
              gross_cost_after: faSmBody.event_type === "add_cost" ? fa2R2(Number(faSmAsset.cost || 0) + faCap) : Number(faSmAsset.cost || 0),
              delta: faDelta, carrying_amount_before: faCarryBefore,
              carrying_amount_after: fa2R2(faCarryBefore + faDelta)
            },
            lines: [
              { account_code: faSmBody.event_type === "impairment_loss" ? "PL_EX_6750" : "BS_CA_1400", account_name: faSmBody.event_type === "impairment_loss" ? "Impairment Loss (PPE)" : "Equipment at Cost", debit: faSmBody.event_type === "impairment_loss" ? 0 : faCap, credit: faSmBody.event_type === "impairment_loss" ? faCap : 0, description: faSmBody.event_type === "add_cost" ? "Capitalise subsequent cost" : "Subsequent measurement event" },
              { account_code: "BS_CA_1000", account_name: "Business Bank Account", debit: faSmBody.event_type === "impairment_loss" ? faCap : 0, credit: faSmBody.event_type === "impairment_loss" ? 0 : faEntered, description: "Settlement" }
            ]
          });
        }
        if (/\/subsequent-measurements$/.test(pathname) && method === "GET") {
          return json({ data: FA2.smEvents, items: FA2.smEvents });
        }
        if (/\/subsequent-measurements$/.test(pathname) && method === "POST") {
          var faSmNew = {}; try { faSmNew = JSON.parse(opts.body || "{}"); } catch (e) {}
          faSmNew.id = FA2.nextSmId++;
          faSmNew.status = "draft";
          FA2.smEvents.push(faSmNew);
          return json({ id: faSmNew.id, item: faSmNew, data: faSmNew });
        }
        var faSmIdM = pathname.match(/\/subsequent-measurements\/(\d+)\/post$/);
        if (faSmIdM && method === "POST") {
          var faSmPost = FA2.smEvents.filter(function (s) { return Number(s.id) === Number(faSmIdM[1]); })[0];
          if (faSmPost) {
            faSmPost.status = "posted";
            var faSmTarget = fa2AssetById(faSmPost.asset_id);
            if (faSmTarget) {
              if (faSmPost.event_type === "add_cost") {
                faSmTarget.cost = fa2R2(Number(faSmTarget.cost || 0) + Number(faSmPost.amount || 0));
                faSmTarget.carrying_amount = fa2R2(Number(faSmTarget.carrying_amount || 0) + Number(faSmPost.amount || 0));
              } else if (faSmPost.event_type === "impairment_loss") {
                faSmTarget.carrying_amount = fa2R2(Number(faSmTarget.carrying_amount || 0) - Number(faSmPost.amount || 0));
              } else if (faSmPost.event_type === "impairment_reversal") {
                faSmTarget.carrying_amount = fa2R2(Number(faSmTarget.carrying_amount || 0) + Number(faSmPost.amount || 0));
              } else if (faSmPost.event_type === "change_estimate") {
                if (faSmPost.useful_life_months) faSmTarget.useful_life_months = faSmPost.useful_life_months;
                if (faSmPost.residual_value !== undefined && faSmPost.residual_value !== null) faSmTarget.residual_value = faSmPost.residual_value;
              }
              FA2.activity[faSmTarget.id] = FA2.activity[faSmTarget.id] || [];
              FA2.activity[faSmTarget.id].push({ event_date: faSmPost.event_date, event_type: faSmPost.event_type, status: "posted", amount: faSmPost.amount || 0, reference: "SM-" + faSmPost.id, source_table: "subsequent_measurements", source_id: faSmPost.id });
            }
          }
          return json({ ok: true, data: faSmPost || null });
        }
        var faSmUpdM = pathname.match(/\/subsequent-measurements\/(\d+)$/);
        if (faSmUpdM && method === "PUT") {
          var faSmUpdBody = {}; try { faSmUpdBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var faSmUpd = FA2.smEvents.filter(function (s) { return Number(s.id) === Number(faSmUpdM[1]); })[0];
          if (faSmUpd && faSmUpdBody && typeof faSmUpdBody === "object") Object.keys(faSmUpdBody).forEach(function (k) { faSmUpd[k] = faSmUpdBody[k]; });
          return json({ ok: true, data: faSmUpd, item: faSmUpd });
        }
        if (faSmUpdM && method === "DELETE") {
          FA2.smEvents = FA2.smEvents.filter(function (s) { return Number(s.id) !== Number(faSmUpdM[1]); });
          return json({ ok: true });
        }

        /* ---- ops endpoints (transfer / revalue / dispose / impair / usage) ---- */
        if (/\/asset-usage$/.test(pathname) && method === "POST") { return json({ ok: true }); }
        if (/\/transfers$/.test(pathname) && method === "POST") {
          var faTrBody = {}; try { faTrBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var faTrAsset = fa2AssetById(faTrBody.asset_id);
          if (faTrAsset && faTrBody.to_location) faTrAsset.location = faTrBody.to_location;
          return json({ ok: true });
        }
        if (/\/disposals$/.test(pathname) && method === "POST") {
          var faDiBody = {}; try { faDiBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var faDiAsset = fa2AssetById(faDiBody.asset_id);
          if (faDiAsset) {
            faDiAsset.status = "disposed";
            faDiAsset.carrying_amount = 0;
            faDiAsset.accumulated_depreciation = 0;
            FA2.activity[faDiAsset.id] = FA2.activity[faDiAsset.id] || [];
            FA2.activity[faDiAsset.id].push({ event_date: faDiBody.disposal_date || "2026-10-16", event_type: "disposal", status: "posted", amount: Number(faDiBody.proceeds || 0), reference: faDiBody.reference || "DISP", source_table: "disposals", source_id: faDiAsset.id });
          }
          return json({ ok: true });
        }
        if (/\/impairments$/.test(pathname) && method === "POST") {
          var faImBody = {}; try { faImBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var faImAsset = fa2AssetById(faImBody.asset_id);
          if (faImAsset) faImAsset.carrying_amount = fa2R2(Number(faImAsset.carrying_amount || 0) - Number(faImBody.impairment_amount || 0));
          return json({ ok: true });
        }
        if (/\/impairments\/preview$/.test(pathname) && method === "POST") {
          var faImPvBody = {}; try { faImPvBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var faImAmt = Number(faImPvBody.impairment_amount || 0);
          var faImCarry = Number(faImPvBody.carrying_amount_before || 0);
          return json({
            allocations: FA2.assets.map(function (a) {
              var w = faImCarry ? Number(a.carrying_amount || 0) / faImCarry : 0;
              return { asset_id: a.id, allocation_weight: fa2R2(w), allocated_impairment_amount: fa2R2(faImAmt * w), allocated_reversal_amount: 0 };
            }),
            carrying_amount_before: faImCarry, impairment_amount: faImAmt, reversal_amount: 0, event_type: "impairment_loss"
          });
        }
        if (/\/revaluations$/.test(pathname) && method === "POST") {
          var faReBody = {}; try { faReBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var faReAsset = fa2AssetById(faReBody.asset_id);
          var faReId = FA2.nextJournalId++;
          if (faReAsset && faReBody.fair_value !== undefined) {
            faReAsset.measurement_basis = "revaluation";
            faReAsset.carrying_amount = Number(faReBody.fair_value || faReAsset.carrying_amount);
          }
          return json({ ok: true, id: faReId, revaluation_id: faReId });
        }
        if (/\/asset-cgus$/.test(pathname) && method === "GET") { return json({ data: FA2.cgus, items: FA2.cgus }); }
        if (/\/asset-valuers$/.test(pathname) && method === "GET") { return json({ data: FA2.valuers, items: FA2.valuers }); }

        return json({ ok: true, rows: [], items: [], data: [], total: 0 });
      }

      /* ══════════════════════════════════════════════════════════════════
         fi2 — IFRS 9 FINANCIAL INSTRUMENTS mock block (Task 15)
         Inserted BEFORE the generic fallback so /ifrs9/* routes win.

         DATA TIE-OUTS (all disclosed here, nothing pre-existing changes):
         · Instruments are LIVE-computed from existing demo state:
             trade receivables  = Σ CUSTOMERS.balance            = 84,320.00 (BS AR)
             bank deposits      = BANKS[0].balance 486,240 + petty cash 2,500 = 488,740.00 (BS Bank & Cash)
             trade payables     = Σ VENDORS.balance              = 52,410.00 (BS AP)
             loan payables      = window.__LN1 outstanding principals (loans screen)
         · ECL provision-matrix story uses the EXACT AR aging buckets from
           SNAPSHOT.aging.ar (0-30: 51,320 / 31-60: 18,400 / 61-90: 9,600 /
           91-120: 3,500 / 121+: 1,500 = 84,320) allocated to the 3 open
           customers, at matrix rates 3% / 8% / 15% / 30% / 50%:
             Springs 21,320×3% + 7,430×8%                        = 1,234.00
             Cape Union 30,000×3% + 10,970×8% + 5,030×15%        = 2,532.10
             Woodmead 4,570×15% + 3,500×30% + 1,500×50%          = 2,485.50
             TOTAL ECL                                           = 6,251.60
         · Runs: Aug posted 5,528.00 (younger bands) → Sep posted 6,251.60
           (+723.60 movement). Σ gross per run = 84,320.00; Σ line ECL =
           run total exactly (Aug 862.50 + 2,180.00 + 2,485.50; Sep
           1,234.00 + 2,532.10 + 2,485.50).
         · General approach (deposit assets): PD 4bps × LGD 50% =
           2bps × 488,740 = 97.75 (FNB 97.25 + petty cash 0.50), first
           run posted, movement +97.75.
         · Journal codes (new, follow ln1 convention): PL_EX_6800 "Expected
           Credit Loss Expense" / BS_CA_1210 "Allowance for Expected Credit
           Losses" (contra-AR).
         · Durban Marine write-off 3,200 on 2026-05-31 explains its zero
           balance in CUSTOMERS.
         State persists on window.__FI2 for the session.
         ══════════════════════════════════════════════════════════════════ */
      if (cidMatch && pathname.indexOf("/ifrs9") !== -1) {
        var fi2LnOutstanding = function () {
          var ln = window.__LN1 || { loans: {} };
          var out = {};
          Object.keys(ln.loans || {}).forEach(function (k) {
            var rec = ln.loans[k];
            var l = rec && rec.loan ? rec.loan : rec;
            if (!l || String(l.status || "").toLowerCase() === "draft") return;
            var sched = (rec && rec.schedule) || [];
            var paid = 0;
            sched.forEach(function (r) { if (String(r.payment_status) === "paid") paid += Number(r.scheduled_principal || 0); });
            out[String(l.id)] = {
              name: l.loan_name, lender: l.lender_name,
              outstanding: Number(l.principal_amount || 0) - paid,
              rate: Number(l.annual_interest_rate || 0), start: l.start_date
            };
          });
          return out;
        };
        if (!window.__FI2) {
          window.__FI2 = {
            instruments: [
              { id: 4401, instrument_name: "Trade Receivables — Customer Ledger", counterparty_name: "3 active customer accounts", instrument_type: "trade_receivable", recognition_date: "2024-04-01", original_amount: 84320.00, carrying_amount: 84320.00, business_model: "hold_to_collect", sppi_result: "passes", measurement_category: "amortised_cost", effective_interest_rate: 0, contractual_interest_rate: 0, classification_status: "classified", status: "active" },
              { id: 4402, instrument_name: "FNB Business Cheque Account", counterparty_name: "First National Bank (FNB)", instrument_type: "deposit_asset", recognition_date: "2024-04-01", original_amount: 486240.00, carrying_amount: 486240.00, business_model: "hold_to_collect", sppi_result: "passes", measurement_category: "amortised_cost", effective_interest_rate: 0, contractual_interest_rate: 0, classification_status: "classified", status: "active" },
              { id: 4403, instrument_name: "Petty Cash Float", counterparty_name: "Mokoko Trading (Pty) Ltd", instrument_type: "deposit_asset", recognition_date: "2024-04-01", original_amount: 2500.00, carrying_amount: 2500.00, business_model: "hold_to_collect", sppi_result: "passes", measurement_category: "amortised_cost", effective_interest_rate: 0, contractual_interest_rate: 0, classification_status: "classified", status: "active" },
              { id: 4404, instrument_name: "Trade Payables — Vendor Ledger", counterparty_name: "8 vendor accounts", instrument_type: "trade_payable", recognition_date: "2024-04-01", original_amount: 52410.00, carrying_amount: 52410.00, business_model: "hold_to_collect", sppi_result: "passes", measurement_category: "amortised_cost", effective_interest_rate: 0, contractual_interest_rate: 0, classification_status: "classified", status: "active" }
            ],
            nextInstrumentId: 4405,
            models: [
              { id: 4510, model_name: "Simplified Provision Matrix — Trade Receivables", model_type: "simplified", applies_to: "trade_receivable", basis: "provision_matrix", model_owner: "Financial Controller", effective_from: "2025-10-01", effective_to: null, review_date: "2027-09-30", is_active: true, approval_status: "approved", version_no: 2 }
            ],
            bands: [
              { band_label: "Current", days_from: 0, days_to: 0, loss_rate: 0.01 },
              { band_label: "1-30", days_from: 1, days_to: 30, loss_rate: 0.03 },
              { band_label: "31-60", days_from: 31, days_to: 60, loss_rate: 0.08 },
              { band_label: "61-90", days_from: 61, days_to: 90, loss_rate: 0.15 },
              { band_label: "91-120", days_from: 91, days_to: 120, loss_rate: 0.30 },
              { band_label: "Over 120", days_from: 121, days_to: null, loss_rate: 0.50 }
            ],
            nextModelId: 4511,
            runs: [
              { id: 4601, reporting_date: "2026-08-31", model_id: 4510, model_name: "Simplified Provision Matrix — Trade Receivables", run_type: "period_end", total_exposure: 84320.00, total_ecl: 5528.00, status: "posted", journal_id: 5151, reversal_journal_id: null, meta_json: { previous_ecl: 0, movement_ecl: 5528.00 } },
              { id: 4602, reporting_date: "2026-09-30", model_id: 4510, model_name: "Simplified Provision Matrix — Trade Receivables", run_type: "period_end", total_exposure: 84320.00, total_ecl: 6251.60, status: "posted", journal_id: 5162, reversal_journal_id: null, meta_json: { previous_ecl: 5528.00, movement_ecl: 723.60 } }
            ],
            nextRunId: 4604,
            nextJournalId: 5901,
            /* per-run ECL lines: customer allocations across aging bands */
            runLines: {
              4601: [
                { customer_id: 1, customer_name: "Springs Retail (Pty) Ltd", invoice_reference: "INV-1021", days_past_due: 25, ageing_band: "1-30", gross_exposure: 21320.00, loss_rate: 0.03, expected_credit_loss: 639.60 },
                { customer_id: 1, customer_name: "Springs Retail (Pty) Ltd", invoice_reference: "INV-1036", days_past_due: 18, ageing_band: "1-30", gross_exposure: 7430.00, loss_rate: 0.03, expected_credit_loss: 222.90 },
                { customer_id: 2, customer_name: "Cape Union Distributors", invoice_reference: "INV-1026", days_past_due: 12, ageing_band: "1-30", gross_exposure: 30000.00, loss_rate: 0.03, expected_credit_loss: 900.00 },
                { customer_id: 2, customer_name: "Cape Union Distributors", invoice_reference: "INV-1035", days_past_due: 66, ageing_band: "31-60", gross_exposure: 10970.00, loss_rate: 0.08, expected_credit_loss: 877.60 },
                { customer_id: 2, customer_name: "Cape Union Distributors", invoice_reference: "INV-1041", days_past_due: 48, ageing_band: "31-60", gross_exposure: 5030.00, loss_rate: 0.08, expected_credit_loss: 402.40 },
                { customer_id: 3, customer_name: "Woodmead Traders cc", invoice_reference: "INV-1033", days_past_due: 83, ageing_band: "61-90", gross_exposure: 4570.00, loss_rate: 0.15, expected_credit_loss: 685.50 },
                { customer_id: 3, customer_name: "Woodmead Traders cc", invoice_reference: "INV-1029", days_past_due: 108, ageing_band: "91-120", gross_exposure: 3500.00, loss_rate: 0.30, expected_credit_loss: 1050.00 },
                { customer_id: 3, customer_name: "Woodmead Traders cc", invoice_reference: "INV-1017", days_past_due: 139, ageing_band: "Over 120", gross_exposure: 1500.00, loss_rate: 0.50, expected_credit_loss: 750.00 }
              ],
              4602: [
                { customer_id: 1, customer_name: "Springs Retail (Pty) Ltd", invoice_reference: "INV-1021", days_past_due: 25, ageing_band: "1-30", gross_exposure: 21320.00, loss_rate: 0.03, expected_credit_loss: 639.60 },
                { customer_id: 1, customer_name: "Springs Retail (Pty) Ltd", invoice_reference: "INV-1036", days_past_due: 52, ageing_band: "31-60", gross_exposure: 7430.00, loss_rate: 0.08, expected_credit_loss: 594.40 },
                { customer_id: 2, customer_name: "Cape Union Distributors", invoice_reference: "INV-1026", days_past_due: 12, ageing_band: "1-30", gross_exposure: 30000.00, loss_rate: 0.03, expected_credit_loss: 900.00 },
                { customer_id: 2, customer_name: "Cape Union Distributors", invoice_reference: "INV-1035", days_past_due: 66, ageing_band: "31-60", gross_exposure: 10970.00, loss_rate: 0.08, expected_credit_loss: 877.60 },
                { customer_id: 2, customer_name: "Cape Union Distributors", invoice_reference: "INV-1041", days_past_due: 78, ageing_band: "61-90", gross_exposure: 5030.00, loss_rate: 0.15, expected_credit_loss: 754.50 },
                { customer_id: 3, customer_name: "Woodmead Traders cc", invoice_reference: "INV-1033", days_past_due: 83, ageing_band: "61-90", gross_exposure: 4570.00, loss_rate: 0.15, expected_credit_loss: 685.50 },
                { customer_id: 3, customer_name: "Woodmead Traders cc", invoice_reference: "INV-1029", days_past_due: 108, ageing_band: "91-120", gross_exposure: 3500.00, loss_rate: 0.30, expected_credit_loss: 1050.00 },
                { customer_id: 3, customer_name: "Woodmead Traders cc", invoice_reference: "INV-1017", days_past_due: 139, ageing_band: "Over 120", gross_exposure: 1500.00, loss_rate: 0.50, expected_credit_loss: 750.00 }
              ]
            },
            writeoffs: [
              { id: 5501, writeoff_date: "2026-05-31", customer_name: "Durban Marine Supplies", invoice_number: "INV-1031", writeoff_amount: 3200.00, allowance_used: 2600.00, additional_loss: 600.00, recovered_amount: 0.00, status: "posted" }
            ],
            mappings: [
              { mapping_key: "ecl_allowance", label: "ECL Allowance (contra-AR)", description: "Contra-asset allowance for expected credit losses on trade receivables", phase: "ecl", ok: true, account_code: "BS_CA_1210" },
              { mapping_key: "ecl_expense", label: "ECL Expense / Impairment Loss", description: "P&L line for ECL charges and reversals", phase: "ecl", ok: true, account_code: "PL_EX_6800" },
              { mapping_key: "interest_income_amortised", label: "Interest Income — Amortised Cost", description: "Interest income recognised on amortised cost assets", phase: "amortised_cost", ok: true, account_code: "PL_IN_4100" },
              { mapping_key: "fvtpl_gains", label: "FVTPL Fair Value Gains / Losses", description: "Fair value movements on FVTPL instruments", phase: "fair_value", ok: false, account_code: null },
              { mapping_key: "fvoci_reserve", label: "FVOCI Reserve", description: "Equity reserve for FVOCI debt instruments", phase: "fair_value", ok: false, account_code: null },
              { mapping_key: "derecognition_gain", label: "Derecognition Gains / Losses", description: "Gains and losses on derecognition of financial instruments", phase: "derecognition", ok: true, account_code: "PL_IN_4100" }
            ],
            generalModels: [
              { id: 4700, model_name: "General Approach — Corporate Exposures", model_code: "GECL-01", applies_to: "deposit_asset", sicr_method: "rating_grade_migration", scenario_count: 3, pd_curve_count: 4, lgd_count: 3, is_active: true, approval_status: "approved" }
            ],
            generalScenarios: [
              { scenario_code: "BASE", scenario_name: "Base case", scenario_type: "base", probability_weight: 0.60, pd_multiplier: 1.00, lgd_multiplier: 1.00, ead_multiplier: 1.00 },
              { scenario_code: "UP", scenario_name: "Upside", scenario_type: "upside", probability_weight: 0.15, pd_multiplier: 0.60, lgd_multiplier: 0.85, ead_multiplier: 1.00 },
              { scenario_code: "DOWN", scenario_name: "Downside", scenario_type: "downside", probability_weight: 0.25, pd_multiplier: 1.80, lgd_multiplier: 1.20, ead_multiplier: 1.00 }
            ],
            generalPdCurves: [
              { rating_grade: "A-1", period_month: 12, marginal_pd: 0.0004, cumulative_pd: 0.0004 },
              { rating_grade: "A-1", period_month: 24, marginal_pd: 0.0005, cumulative_pd: 0.0009 },
              { rating_grade: "BBB", period_month: 12, marginal_pd: 0.0022, cumulative_pd: 0.0022 },
              { rating_grade: "BBB", period_month: 24, marginal_pd: 0.0028, cumulative_pd: 0.0050 }
            ],
            generalLgd: [
              { lgd_code: "LGD-SEC", lgd_name: "Secured — ceded deposit", collateral_type: "cash_collateral", base_lgd: 0.10, recovery_rate: 0.90, recovery_delay_months: 3 },
              { lgd_code: "LGD-UNSEC", lgd_name: "Unsecured bank exposure", collateral_type: "none", base_lgd: 0.50, recovery_rate: 0.45, recovery_delay_months: 18 },
              { lgd_code: "LGD-SOV", lgd_name: "Sovereign-guaranteed", collateral_type: "government_guarantee", base_lgd: 0.05, recovery_rate: 0.95, recovery_delay_months: 6 }
            ],
            generalRuns: [
              { id: 4801, reporting_date: "2026-09-30", model_id: 4700, model_name: "General Approach — Corporate Exposures", run_type: "period_end", total_gross_exposure: 488740.00, total_ead: 488740.00, stage_1_exposure: 488740.00, stage_1_ecl: 97.75, stage_2_exposure: 0, stage_2_ecl: 0, stage_3_exposure: 0, stage_3_ecl: 0, total_ecl: 97.75, movement_ecl: 97.75, status: "posted", journal_id: 5171, reversal_journal_id: null }
            ],
            nextGeneralRunId: 4802
          };
        }
        var FI2 = window.__FI2;
        var fi2R2 = function (n) { return Math.round(Number(n) * 100) / 100; };
        var fi2ModelById = function (id) { return FI2.models.filter(function (m) { return Number(m.id) === Number(id); })[0] || null; };
        var fi2RunById = function (id) { return FI2.runs.filter(function (r) { return Number(r.id) === Number(id); })[0] || null; };
        var fi2EclJournals = function (charge, ref) {
          return [
            { account_code: "PL_EX_6800", account_name: "Expected Credit Loss Expense", debit: fi2R2(Math.abs(charge)), credit: 0, description: "ECL movement — " + ref },
            { account_code: "BS_CA_1210", account_name: "Allowance for Expected Credit Losses", debit: 0, credit: fi2R2(Math.abs(charge)), description: "Allowance uplift — " + ref }
          ];
        };

        /* ---- GET /ifrs9/instruments ---- */
        if (/\/ifrs9\/instruments$/.test(pathname) && method === "GET") {
          var fi2Items = FI2.instruments.slice();
          /* live loan-payable instruments from the Loans & Financing ledger (window.__LN1) */
          var fi2Ln = fi2LnOutstanding();
          Object.keys(fi2Ln).forEach(function (k) {
            var l = fi2Ln[k];
            var exists = FI2.instruments.filter(function (i) { return i.instrument_type === "loan_payable" && Number(i.loan_id) === Number(k); })[0];
            if (exists) {
              exists.carrying_amount = fi2R2(l.outstanding);
              exists.original_amount = fi2R2(l.outstanding);
              return;
            }
            FI2.instruments.push({
              id: FI2.nextInstrumentId++, loan_id: Number(k),
              instrument_name: l.name || ("Loan " + k), counterparty_name: l.lender || "Lender",
              instrument_type: "loan_payable", recognition_date: l.start || "2024-04-01",
              original_amount: fi2R2(l.outstanding), carrying_amount: fi2R2(l.outstanding),
              business_model: "hold_to_collect", sppi_result: "passes", measurement_category: "amortised_cost",
              effective_interest_rate: Number(l.rate || 0), contractual_interest_rate: Number(l.rate || 0),
              classification_status: "classified", status: "active"
            });
          });
          /* live ties: AR / AP / bank / loans from the demo state */
          var fi2Ar = 0; CUSTOMERS.forEach(function (c) { fi2Ar += Number(c.balance || 0); });
          var fi2Ap = 0; VENDORS.forEach(function (v) { fi2Ap += Number(v.balance || 0); });
          fi2Items = FI2.instruments.slice();
          fi2Items.forEach(function (i) {
            if (i.instrument_type === "trade_receivable") { i.carrying_amount = fi2R2(fi2Ar); i.original_amount = fi2R2(fi2Ar); }
            if (i.instrument_type === "trade_payable") { i.carrying_amount = fi2R2(fi2Ap); i.original_amount = fi2R2(fi2Ap); }
          });
          return json({ items: fi2Items, total: fi2Items.length });
        }
        var fi2InsM = pathname.match(/\/ifrs9\/instruments\/(\d+)$/);
        if (fi2InsM && method === "GET") {
          var fi2Ins = FI2.instruments.filter(function (i) { return Number(i.id) === Number(fi2InsM[1]); })[0] || null;
          return json({ item: fi2Ins, effective_interest_terms: [] });
        }
        var fi2ClsM = pathname.match(/\/ifrs9\/instruments\/(\d+)\/classify$/);
        if (fi2ClsM && method === "POST") {
          var fi2ClsBody = {}; try { fi2ClsBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var fi2ClsIns = FI2.instruments.filter(function (i) { return Number(i.id) === Number(fi2ClsM[1]); })[0];
          if (fi2ClsIns) {
            ["business_model", "sppi_result", "measurement_category"].forEach(function (k) { if (fi2ClsBody[k]) fi2ClsIns[k] = fi2ClsBody[k]; });
            fi2ClsIns.classification_status = "classified";
          }
          return json({ ok: true, item: fi2ClsIns || null });
        }

        /* ---- POST /ifrs9/discover ---- */
        if (/\/ifrs9\/discover$/.test(pathname) && method === "POST") {
          var fi2LoanCount = 0; var fi2Ln = fi2LnOutstanding();
          Object.keys(fi2Ln).forEach(function (k) { if (!FI2.instruments.filter(function (i) { return i.instrument_type === "loan_payable" && i.loan_id === Number(k); })[0]) fi2LoanCount++; });
          return json({ ok: true, loan_payables_created: fi2LoanCount, trade_receivables_created: 1, trade_payables_created: 1, bank_accounts_created: 2 });
        }

        /* ---- ECL models ---- */
        if (/\/ifrs9\/ecl\/models$/.test(pathname) && method === "GET") {
          return json({ items: FI2.models, total: FI2.models.length });
        }
        if (/\/ifrs9\/ecl\/models$/.test(pathname) && method === "POST") {
          var fi2NmBody = {}; try { fi2NmBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var fi2Nm = { id: FI2.nextModelId++, model_name: fi2NmBody.model_name || "New ECL Model", model_type: fi2NmBody.model_type || "simplified", applies_to: fi2NmBody.applies_to || "trade_receivable", basis: fi2NmBody.basis || "provision_matrix", model_owner: fi2NmBody.model_owner || "", effective_from: fi2NmBody.effective_from || "2026-10-01", effective_to: null, review_date: fi2NmBody.review_date || null, is_active: false, approval_status: "draft", version_no: 1 };
          FI2.models.push(fi2Nm);
          return json({ item: { id: fi2Nm.id }, data: fi2Nm });
        }
        var fi2BandsM = pathname.match(/\/ifrs9\/ecl\/models\/(\d+)\/bands$/);
        if (fi2BandsM && method === "GET") {
          var fi2Bm = fi2ModelById(fi2BandsM[1]);
          return json({ model: fi2Bm, bands: FI2.bands });
        }
        if (fi2BandsM && method === "PUT") {
          var fi2BdBody = {}; try { fi2BdBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          if (Array.isArray(fi2BdBody.bands)) FI2.bands = fi2BdBody.bands;
          return json({ ok: true, bands: FI2.bands });
        }
        var fi2ActM = pathname.match(/\/ifrs9\/ecl\/models\/(\d+)\/(activate|deactivate)$/);
        if (fi2ActM && method === "POST") {
          var fi2ActModel = fi2ModelById(fi2ActM[1]);
          if (fi2ActModel) {
            fi2ActModel.is_active = fi2ActM[2] === "activate";
            if (fi2ActModel.is_active) fi2ActModel.approval_status = "approved";
          }
          return json({ ok: true, item: fi2ActModel });
        }
        var fi2ModelOneM = pathname.match(/\/ifrs9\/ecl\/models\/(\d+)$/);
        if (fi2ModelOneM && method === "GET") {
          return json({ model: fi2ModelById(fi2ModelOneM[1]), bands: FI2.bands });
        }

        /* ---- ECL runs ---- */
        if (/\/ifrs9\/ecl\/runs$/.test(pathname) && method === "GET") {
          return json({ items: FI2.runs, total: FI2.runs.length });
        }
        if (/\/ifrs9\/ecl\/runs$/.test(pathname) && method === "POST") {
          var fi2CrBody = {}; try { fi2CrBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var fi2RunModel = fi2ModelById(fi2CrBody.model_id);
          var fi2NewRun = { id: FI2.nextRunId++, reporting_date: fi2CrBody.reporting_date || "2026-10-31", model_id: Number(fi2CrBody.model_id) || null, model_name: fi2RunModel ? fi2RunModel.model_name : "", run_type: fi2CrBody.run_type || "period_end", total_exposure: 84320.00, total_ecl: 6251.60, status: "draft", journal_id: null, reversal_journal_id: null, meta_json: { previous_ecl: 6251.60, movement_ecl: 0 } };
          FI2.runs.push(fi2NewRun);
          return json({ id: fi2NewRun.id, item: fi2NewRun, data: fi2NewRun });
        }
        var fi2RunRevM = pathname.match(/\/ifrs9\/ecl\/runs\/(\d+)\/reverse$/);
        if (fi2RunRevM && method === "POST") {
          var fi2RevRun = fi2RunById(fi2RunRevM[1]);
          var fi2RevJid = FI2.nextJournalId++;
          if (fi2RevRun) fi2RevRun.reversal_journal_id = fi2RevJid;
          return json({ ok: true, reversal_journal_id: fi2RevJid });
        }
        var fi2RunPvM = pathname.match(/\/ifrs9\/ecl\/runs\/(\d+)\/preview-journal$/);
        if (fi2RunPvM && (method === "POST" || method === "GET")) {
          var fi2PvRun = fi2RunById(fi2RunPvM[1]) || {};
          var fi2PvLines = fi2EclJournals(Number(fi2PvRun.meta_json ? fi2PvRun.meta_json.movement_ecl : 0), "run " + (fi2PvRun.id || ""));
          return json({ preview: { date: fi2PvRun.reporting_date || "2026-09-30", ref: "ECL-" + (fi2PvRun.id || 0), description: "Expected credit loss movement — " + (fi2PvRun.model_name || "Simplified approach"), lines: fi2PvLines, dr_total: fi2R2(Math.abs(Number(fi2PvRun.meta_json ? fi2PvRun.meta_json.movement_ecl : 0))), cr_total: fi2R2(Math.abs(Number(fi2PvRun.meta_json ? fi2PvRun.meta_json.movement_ecl : 0))) } });
        }
        var fi2RunPostM = pathname.match(/\/ifrs9\/ecl\/runs\/(\d+)\/post$/);
        if (fi2RunPostM && method === "POST") {
          var fi2PoRun = fi2RunById(fi2RunPostM[1]);
          if (fi2PoRun) { fi2PoRun.status = "posted"; fi2PoRun.journal_id = FI2.nextJournalId++; }
          return json({ ok: true, journal_id: fi2PoRun ? fi2PoRun.journal_id : null });
        }
        var fi2RunOneM = pathname.match(/\/ifrs9\/ecl\/runs\/(\d+)$/);
        if (fi2RunOneM && method === "GET") {
          var fi2OneRun = fi2RunById(fi2RunOneM[1]);
          return json({ run: fi2OneRun, lines: (FI2.runLines[Number(fi2RunOneM[1])] || []).slice() });
        }

        /* ---- AR exposure / write-offs / reconciliation ---- */
        if (/\/ifrs9\/ecl\/ar-exposure$/.test(pathname) && method === "GET") {
          return json({
            items: [
              { customer_name: "Springs Retail (Pty) Ltd", open_balance: 28750.00, open_invoices_count: 2, oldest_due_date: "2026-08-25", days_past_due: 52 },
              { customer_name: "Cape Union Distributors", open_balance: 46000.00, open_invoices_count: 3, oldest_due_date: "2026-07-24", days_past_due: 84 },
              { customer_name: "Woodmead Traders cc", open_balance: 9570.00, open_invoices_count: 3, oldest_due_date: "2026-05-30", days_past_due: 139 }
            ], total: 3
          });
        }
        if (/\/ifrs9\/ecl\/writeoffs$/.test(pathname) && method === "GET") {
          return json({ items: FI2.writeoffs, total: FI2.writeoffs.length });
        }
        if (/\/ifrs9\/ecl\/reconciliation$/.test(pathname) && method === "GET") {
          return json({
            balanced: true,
            summary: {
              opening_allowance: 5528.00, ecl_charges: 723.60, ecl_reversals: 0, allowance_used_on_writeoffs: 0,
              calculated_closing_allowance: 6251.60, ledger_closing_allowance: 6251.60, reconciliation_difference: 0,
              gross_writeoffs: 0, additional_writeoff_loss: 0, recoveries: 0
            },
            runs: [
              { reporting_date: "2026-08-31", model_name: "Simplified Provision Matrix — Trade Receivables", total_exposure: 84320.00, charge: 5528.00, reversal: 0, closing_ecl: 5528.00, journal_id: 5151 },
              { reporting_date: "2026-09-30", model_name: "Simplified Provision Matrix — Trade Receivables", total_exposure: 84320.00, charge: 723.60, reversal: 0, closing_ecl: 6251.60, journal_id: 5162 }
            ]
          });
        }

        /* ---- ECL calculate (simplified) ---- */
        if (/\/ifrs9\/ecl\/calculate$/.test(pathname) && method === "POST") {
          var fi2CalcBody = {}; try { fi2CalcBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var fi2CalcDate = fi2CalcBody.reporting_date || "2026-10-16";
          var fi2Prev = Number(String(fi2CalcDate).replace(/-/g, "")) >= 20261001 ? 6251.60 : 5528.00;
          var fi2Lines = (FI2.runLines[4602] || []).map(function (l) {
            return { customer_id: l.customer_id, customer_name: l.customer_name, invoice_reference: l.invoice_reference, invoice_id: null, due_date: null, days_past_due: l.days_past_due, ageing_band: l.ageing_band, gross_exposure: l.gross_exposure, loss_rate: l.loss_rate, expected_credit_loss: l.expected_credit_loss };
          });
          return json({ total_exposure: 84320.00, previous_ecl: fi2Prev, total_ecl: 6251.60, movement_ecl: fi2R2(6251.60 - fi2Prev), lines: fi2Lines });
        }

        /* ---- COA readiness / mappings ---- */
        if (/\/ifrs9\/coa\/readiness$/.test(pathname) && method === "GET") {
          var fi2Missing = FI2.mappings.filter(function (m) { return !m.ok; }).map(function (m) { return m.mapping_key; });
          return json({ ready: fi2Missing.length === 0, ecl_ready: FI2.mappings.filter(function (m) { return m.phase === "ecl"; }).every(function (m) { return m.ok; }), missing: fi2Missing, items: FI2.mappings });
        }
        if (/\/ifrs9\/coa\/mappings$/.test(pathname) && method === "POST") {
          var fi2MapBody = {}; try { fi2MapBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var fi2MapRow = FI2.mappings.filter(function (m) { return m.mapping_key === fi2MapBody.mapping_key; })[0];
          if (fi2MapRow) { fi2MapRow.ok = true; fi2MapRow.account_code = fi2MapBody.account_code || fi2MapRow.account_code; }
          var fi2Miss2 = FI2.mappings.filter(function (m) { return !m.ok; }).map(function (m) { return m.mapping_key; });
          return json({ ok: true, readiness: { ready: fi2Miss2.length === 0, ecl_ready: FI2.mappings.filter(function (m) { return m.phase === "ecl"; }).every(function (m) { return m.ok; }), missing: fi2Miss2, items: FI2.mappings } });
        }

        /* ---- General approach models / runs ---- */
        if (/\/ifrs9\/ecl\/general\/models$/.test(pathname) && method === "GET") {
          return json({ items: FI2.generalModels, total: FI2.generalModels.length });
        }
        var fi2GmM = pathname.match(/\/ifrs9\/ecl\/general\/models\/(\d+)$/);
        if (fi2GmM && method === "GET") {
          return json({ model: FI2.generalModels.filter(function (m) { return Number(m.id) === Number(fi2GmM[1]); })[0] || null, scenarios: FI2.generalScenarios, pd_curves: FI2.generalPdCurves, lgd_assumptions: FI2.generalLgd });
        }
        if (/\/ifrs9\/ecl\/general\/calculate$/.test(pathname) && method === "POST") {
          return json({
            total_gross_exposure: 488740.00, total_ead: 488740.00, total_ecl: 97.75, movement_ecl: 0,
            stage_1_exposure: 488740.00, stage_1_ecl: 97.75, stage_2_exposure: 0, stage_2_ecl: 0, stage_3_exposure: 0, stage_3_ecl: 0, previous_ecl: 97.75,
            lines: [
              { instrument_name: "FNB Business Cheque Account", assessed_stage: "Stage 1", rating_grade: "A-1", gross_exposure: 486240.00, total_ead: 486240.00, collateral_value: 0, guarantee_value: 0, net_ead: 486240.00, base_pd: 0.0004, base_lgd: 0.50, expected_credit_loss: 97.25 },
              { instrument_name: "Petty Cash Float", assessed_stage: "Stage 1", rating_grade: "A-1", gross_exposure: 2500.00, total_ead: 2500.00, collateral_value: 0, guarantee_value: 0, net_ead: 2500.00, base_pd: 0.0004, base_lgd: 0.50, expected_credit_loss: 0.50 }
            ]
          });
        }
        if (/\/ifrs9\/ecl\/general\/runs$/.test(pathname) && method === "GET") {
          return json({ items: FI2.generalRuns, total: FI2.generalRuns.length });
        }
        if (/\/ifrs9\/ecl\/general\/runs$/.test(pathname) && method === "POST") {
          var fi2GrBody = {}; try { fi2GrBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var fi2Gr = { id: FI2.nextGeneralRunId++, reporting_date: fi2GrBody.reporting_date || "2026-10-31", model_id: Number(fi2GrBody.model_id) || 4700, model_name: "General Approach — Corporate Exposures", run_type: fi2GrBody.run_type || "period_end", total_gross_exposure: 488740.00, total_ead: 488740.00, stage_1_exposure: 488740.00, stage_1_ecl: 97.75, stage_2_exposure: 0, stage_2_ecl: 0, stage_3_exposure: 0, stage_3_ecl: 0, total_ecl: 97.75, movement_ecl: 0, status: "draft", journal_id: null, reversal_journal_id: null };
          FI2.generalRuns.push(fi2Gr);
          return json({ id: fi2Gr.id, item: fi2Gr, data: fi2Gr });
        }
        var fi2GrPvM = pathname.match(/\/ifrs9\/ecl\/general\/runs\/(\d+)\/preview-journal$/);
        if (fi2GrPvM && (method === "GET" || method === "POST")) {
          var fi2GrRun = FI2.generalRuns.filter(function (r) { return Number(r.id) === Number(fi2GrPvM[1]); })[0] || {};
          return json({ preview: { date: fi2GrRun.reporting_date || "2026-09-30", ref: "GECL-" + (fi2GrRun.id || 0), description: "General approach ECL — deposit assets", lines: fi2EclJournals(Number(fi2GrRun.movement_ecl || 0), "run " + (fi2GrRun.id || "")), dr_total: fi2R2(Math.abs(Number(fi2GrRun.movement_ecl || 0))), cr_total: fi2R2(Math.abs(Number(fi2GrRun.movement_ecl || 0))) } });
        }
        var fi2GrRevM = pathname.match(/\/ifrs9\/ecl\/general\/runs\/(\d+)\/reverse$/);
        if (fi2GrRevM && method === "POST") {
          var fi2GrRev = FI2.generalRuns.filter(function (r) { return Number(r.id) === Number(fi2GrRevM[1]); })[0];
          var fi2GrJid = FI2.nextJournalId++;
          if (fi2GrRev) fi2GrRev.reversal_journal_id = fi2GrJid;
          return json({ ok: true, reversal_journal_id: fi2GrJid });
        }
        var fi2GrOneM = pathname.match(/\/ifrs9\/ecl\/general\/runs\/(\d+)$/);
        if (fi2GrOneM && method === "GET") {
          var fi2GrOne = FI2.generalRuns.filter(function (r) { return Number(r.id) === Number(fi2GrOneM[1]); })[0] || null;
          var fi2GrLines = fi2GrOne ? [
            { instrument_name: "FNB Business Cheque Account", assessed_stage: "Stage 1", rating_grade: "A-1", gross_exposure: 486240.00, total_ead: 486240.00, collateral_value: 0, guarantee_value: 0, net_ead: 486240.00, base_pd: 0.0004, base_lgd: 0.50, expected_credit_loss: 97.25 },
            { instrument_name: "Petty Cash Float", assessed_stage: "Stage 1", rating_grade: "A-1", gross_exposure: 2500.00, total_ead: 2500.00, collateral_value: 0, guarantee_value: 0, net_ead: 2500.00, base_pd: 0.0004, base_lgd: 0.50, expected_credit_loss: 0.50 }
          ] : [];
          return json({ run: fi2GrOne, lines: fi2GrLines });
        }

        return json({ ok: true, rows: [], items: [], data: [], total: 0 });
      }

      /* ══════════════════════════════════════════════════════════════════
         dt3 — DEFERRED TAX mock block (Task 15)
         Inserted BEFORE the generic fallback so /deferred-tax/* routes win.

         DATA TIE-OUTS (all disclosed here, nothing pre-existing changes):
         · Tax rate 27% and authority RSL — mirrors the tr2 tax-recon seed.
         · Run DT-2026-09-30 (draft): per-asset PPE lines from the fa2
           register carrying amounts and tr2 tax WDVs:
             FA-EQ-001 carrying 72,375.00 vs tax base 86,850.00 → deductible 14,475.00 → DTA 3,908.25
             FA-EQ-002 carrying 39,225.00 vs tax base 41,840.00 → deductible  2,615.00 → DTA   706.05
             FA-EQ-003 carrying 27,150.00 vs tax base        0.00 → taxable   27,150.00 → DTL 7,330.50
             NET: 7,330.50 − 4,614.30                             = taxable 10,060.00 → 2,716.20
           → ties EXACTLY to the tax-recon screen (temp diff 10,060,
             deferred @27% = 2,716.20) and BS Equipment (net) 138,750.
           Zero-difference lines (AR 84,320 / Bank 488,740 / Inventory
           79,750 / AP 52,410) show the scan working — all tie to BS_ROWS.
         · Run DT-2026-06-30 (posted, journal 6041): same derivation 3
           months earlier — carrying 143,375.01 (book dep 3×1,541.67
           unwound), tax base 133,717.50 (allowances 3×1,675.83 unwound),
           net taxable diff 9,657.51 → DTL 2,607.52; movement +108.68.
         · Capital allowances run FY2026 (RSL): FA-EQ-001 opening 96,500 →
           allowance 9,650 → closing 86,850; FA-EQ-002 opening 52,300 →
           allowance 10,460 → closing 41,840. Totals 148,800 / 20,110 /
           128,690 — byte-exact to the tr2 run 8801 (allowance 20,110,
           closing tax WDV 128,690). Tax-adjustment lines also reconcile:
           net per-asset temp differences sum to the same +10,060.
         · Authorities / allowance rules / asset-tax profiles are mirrored
           1:1 from the tr2 seed so both screens tell one story.
         · Journal codes (new, follow ln1 convention): PL_EX_6900 "Income
           Tax Expense — Deferred" / BS_CL_2500 "Deferred Tax Liability".
         State persists on window.__DT3 for the session.
         ══════════════════════════════════════════════════════════════════ */
      if (cidMatch && pathname.indexOf("/deferred-tax") !== -1) {
        if (!window.__DT3) {
          var dt3Authorities = [
            { id: 1, code: "RSL", name: "Revenue Services Lesotho", is_active: true },
            { id: 2, code: "SARS", name: "South African Revenue Service", is_active: true },
            { id: 3, code: "BURS", name: "Botswana Unified Revenue Service", is_active: true }
          ];
          window.__DT3 = {
            settings: {
              tax_authority_id: 1, tax_authority_code: "RSL", tax_authority_name: "Revenue Services Lesotho",
              income_tax_rate: 27, deferred_tax_enabled: true,
              deferred_tax_settings: { default_recovery_method: "use", reconciliation_tolerance: 0.05, auto_scan_assets: true, auto_scan_accrual_deferrals: true, require_dta_recoverability_review: true }
            },
            authorities: dt3Authorities,
            nextRunId: 3003, nextJournalId: 6042, nextLineId: 30030,
            runs: [
              {
                id: 3002, reporting_date: "2026-09-30", status: "draft", tax_rate: 27,
                tax_authority_id: 1, tax_authority_code: "RSL", tax_authority_name: "Revenue Services Lesotho",
                gross_dta: 4614.30, gross_dtl: 7330.50, recognized_dta: 4614.30, recognized_dtl: 7330.50, unrecognized_dta: 0,
                net_deferred_tax: 2716.20, journal_id: null, lines: null /* built below */
              },
              {
                id: 3001, reporting_date: "2026-06-30", status: "posted", tax_rate: 27,
                tax_authority_id: 1, tax_authority_code: "RSL", tax_authority_name: "Revenue Services Lesotho",
                gross_dta: 4967.33, gross_dtl: 7574.85, recognized_dta: 4967.33, recognized_dtl: 7574.85, unrecognized_dta: 0,
                net_deferred_tax: 2607.52, journal_id: 6041, lines: null /* built below */
              }
            ],
            assetTaxRuns: [
              {
                id: 3101, tax_year: 2026, tax_year_start: "2026-03-01", tax_year_end: "2027-02-28",
                tax_authority_id: 1, tax_authority_code: "RSL", tax_authority_name: "Revenue Services Lesotho",
                status: "calculated", calculated_at: "2026-10-10T09:20:00", approved_at: null, locked_at: null,
                gross_dta: 4614.30, gross_dtl: 7330.50, recognized_dta: 4614.30, recognized_dtl: 7330.50, unrecognized_dta: 0, net_deferred_tax: 2716.20,
                lines: [
                  { asset_code: "FA-EQ-001", asset_name: "CNC Machining Centre", rule_code: "WT_PLANT_10", rule_source: "standard", calculation_method: "Straight line", rate_percent: 10, opening_tax_wdv: 96500.00, additions: 0, initial_allowance: 0, annual_allowance: 9650.00, total_capital_allowance: 9650.00, closing_tax_wdv: 86850.00, book_depreciation: 9650.00, tax_adjustment: 0.00, temporary_difference: -14475.00, notes: "Wear & tear 10% straight line — full-year allowance (tr2 profile 7101)." },
                  { asset_code: "FA-EQ-002", asset_name: "Workshop Tools & Equipment", rule_code: "WT_TOOLS_20", rule_source: "standard", calculation_method: "Straight line", rate_percent: 20, opening_tax_wdv: 52300.00, additions: 0, initial_allowance: 0, annual_allowance: 10460.00, total_capital_allowance: 10460.00, closing_tax_wdv: 41840.00, book_depreciation: 5230.00, tax_adjustment: 5230.00, temporary_difference: -2615.00, notes: "Accelerated 20% write-off — tax depreciation exceeds book (tr2 profile 7102)." }
                ],
                summary: { gross_dta: 4614.30, gross_dtl: 7330.50, recognized_dta: 4614.30, recognized_dtl: 7330.50, unrecognized_dta: 0, net_deferred_tax: 2716.20 }
              }
            ],
            nextAssetTaxRunId: 3102,
            allowanceRules: [
              { id: 11, tax_authority_id: 1, rule_code: "WT_PLANT_10", rule_name: "Wear & Tear — Plant & Machinery", method: "Straight line", rate_percent: 10, useful_life_years: 10, notes: "Schedules allowance on the straight-line cost basis for manufacturing plant.", is_active: true },
              { id: 12, tax_authority_id: 1, rule_code: "WT_TOOLS_20", rule_name: "Wear & Tear — Tools & Equipment", method: "Straight line", rate_percent: 20, useful_life_years: 5, notes: "Accelerated write-off for light tools and workshop equipment.", is_active: true },
              { id: 13, tax_authority_id: 1, rule_code: "WT_FITTINGS_1667", rule_name: "Wear & Tear — Furniture & Fittings", method: "Straight line", rate_percent: 16.67, useful_life_years: 6, notes: "Office furniture and shop fit-out at 16.67% per annum.", is_active: true },
              { id: 14, tax_authority_id: 2, rule_code: "SARS_S14_e_1", rule_name: "s11(e) — Cost of manufacture / plant", method: "Straight line", rate_percent: 10, useful_life_years: 10, notes: "SARS s11(e) wear-and-tear on machinery and plant.", is_active: true },
              { id: 15, tax_authority_id: 3, rule_code: "BURS_PLANT_10", rule_name: "Capital allowances — Plant", method: "Straight line", rate_percent: 10, useful_life_years: 10, notes: "BURS capital allowance schedule for plant and machinery.", is_active: true }
            ],
            companyRules: [],
            nextCompanyRuleId: 71,
            profiles: [
              { profile_id: 7101, asset_name: "CNC Machining Centre", asset_code: "FA-EQ-001", asset_class: "Plant & Machinery", asset_class_group: "Manufacturing", tax_authority_id: 1, tax_authority_code: "RSL", allowance_rule_id: 11, rule_name: "Wear & Tear — Plant & Machinery", method: "Straight line", rate_percent: 10, tax_cost: 96500, tax_start_date: "2025-03-01", qualifying_percent: 100, private_use_percent: 0, is_tax_depreciable: true, is_active: true, config_status: "configured", notes: "Installed capacity upgrade. Tax cost equals book cost." },
              { profile_id: 7102, asset_name: "Workshop Tools & Equipment", asset_code: "FA-EQ-002", asset_class: "Tools & Equipment", asset_class_group: "Manufacturing", tax_authority_id: 1, tax_authority_code: "RSL", allowance_rule_id: 12, rule_name: "Wear & Tear — Tools & Equipment", method: "Straight line", rate_percent: 20, tax_cost: 52300, tax_start_date: "2025-06-14", qualifying_percent: 100, private_use_percent: 0, is_tax_depreciable: true, is_active: true, config_status: "configured", notes: "Bundled workshop tooling acquired June 2025." },
              { profile_id: 7103, asset_name: "Office Fit-out", asset_code: "FA-EQ-003", asset_class: "Furniture & Fittings", asset_class_group: "General", tax_authority_id: 1, tax_authority_code: "RSL", allowance_rule_id: null, rule_name: null, method: null, rate_percent: null, tax_cost: null, tax_start_date: null, qualifying_percent: null, private_use_percent: null, is_tax_depreciable: false, is_active: true, config_status: "not_configured", notes: "Awaiting tax classification before the next allowance run." }
            ],
            leaseTreatments: {}
          };
        }
        var DT3 = window.__DT3;
        var dt3R2 = function (n) { return Math.round(Number(n) * 100) / 100; };
        var dt3RunById = function (id) { return DT3.runs.filter(function (r) { return Number(r.id) === Number(id); })[0] || null; };
        var dt3FaCarry = function (code) {
          var fa = (window.__FA2 && window.__FA2.assets || []).filter(function (a) { return a.asset_code === code; })[0];
          return fa ? Number(fa.carrying_amount || 0) : 0;
        };
        /* tax base per asset from the tr2 capital-allowance run (closing WDVs) */
        var dt3TaxBase = { "FA-EQ-001": 86850.00, "FA-EQ-002": 41840.00, "FA-EQ-003": 0.00 };
        /* reporting-date-specific overrides: the Jun-30 run predates 3 months of
           book depreciation (3 × 1,541.67) and allowances (3 × 1,675.83), so its
           carrying amounts and tax bases are 3 months higher than the Sep-30 books */
        var dt3JuneCarry = { "601": 74787.51, "602": 40532.49, "603": 28055.01 };
        var dt3JuneBase = { "FA-EQ-001": 89262.50, "FA-EQ-002": 44455.00, "FA-EQ-003": 0.00 };
        var dt3BuildLines = function (run, carryOverride, baseOverride) {
          var rate = Number(run.tax_rate || 27) / 100;
          var lines = [];
          [["FA-EQ-001", "CNC Machining Centre"], ["FA-EQ-002", "Workshop Tools & Equipment"], ["FA-EQ-003", "Office Fit-out"]].forEach(function (p, idx) {
            var carry = (carryOverride && carryOverride[String(601 + idx)]) || dt3FaCarry(p[0]) || [72375.00, 39225.00, 27150.00][idx];
            var base = Number((baseOverride && baseOverride[p[0]]) || dt3TaxBase[p[0]] || 0);
            var diff = dt3R2(carry - base);
            var rec = dt3R2(Math.abs(diff) * rate);
            lines.push({
              id: DT3.nextLineId++, description: p[0] + " — " + p[1], source_module: "assets", source_type: "ppe", source_id: String(601 + idx),
              balance_type: diff >= 0 ? "liability" : "asset", carrying_amount: dt3R2(carry), tax_base: dt3R2(base),
              temporary_difference: diff, difference_type: diff > 0 ? "taxable" : (diff < 0 ? "deductible" : "none"),
              recognized_amount: rec, scan_status: "resolved", is_manual: false,
              resolution_message: diff === 0 ? "No tax base recorded — asset awaiting capital-allowance configuration." : (diff > 0 ? "Carrying amount exceeds tax base — accelerated capital allowances." : "Tax base exceeds carrying amount — allowance timing difference."),
              calculation_json: { tax_rate_percent: Number(run.tax_rate || 27) }, tax_treatment_code: null
            });
          });
          [
            ["Trade and other receivables", 84320.00], ["Bank and cash deposits", 488740.00],
            ["Inventory on hand", 79750.00], ["Accounts payable", 52410.00]
          ].forEach(function (z) {
            lines.push({
              id: DT3.nextLineId++, description: z[0], source_module: "manual", source_type: "manual", source_id: null,
              balance_type: "asset", carrying_amount: z[1], tax_base: z[1], temporary_difference: 0, difference_type: "none",
              recognized_amount: 0, scan_status: "resolved", is_manual: false,
              resolution_message: "Carrying amount equals tax base — no temporary difference.",
              calculation_json: null, tax_treatment_code: null
            });
          });
          return lines;
        };
        DT3.runs.forEach(function (r) {
          if (!r.lines) {
            var isJune = String(r.reporting_date) < "2026-09-01";
            r.lines = dt3BuildLines(r, isJune ? dt3JuneCarry : null, isJune ? dt3JuneBase : null);
          }
        });
        var dt3RecalcTotals = function (run) {
          var rate = Number(run.tax_rate || 27) / 100;
          var dta = 0, dtl = 0;
          (run.lines || []).forEach(function (l) {
            if (Number(l.temporary_difference) < 0) dta += Math.abs(Number(l.temporary_difference)) * rate;
            else dtl += Number(l.temporary_difference) * rate;
          });
          run.gross_dta = dt3R2(dta); run.gross_dtl = dt3R2(dtl);
          run.recognized_dta = dt3R2(dta); run.recognized_dtl = dt3R2(dtl);
          run.unrecognized_dta = 0;
          run.net_deferred_tax = dt3R2(dt3R2(dtl) - dt3R2(dta));
        };
        DT3.runs.forEach(dt3RecalcTotals);

        /* ---- settings / authorities ---- */
        if (/\/deferred-tax\/settings$/.test(pathname) && method === "GET") {
          return json({ data: DT3.settings });
        }
        if (/\/deferred-tax\/settings$/.test(pathname) && method === "PUT") {
          var dt3SetBody = {}; try { dt3SetBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          if (dt3SetBody && typeof dt3SetBody === "object") {
            ["tax_authority_id", "income_tax_rate", "deferred_tax_enabled"].forEach(function (k) { if (dt3SetBody[k] !== undefined) DT3.settings[k] = dt3SetBody[k]; });
            if (dt3SetBody.deferred_tax_settings) DT3.settings.deferred_tax_settings = dt3SetBody.deferred_tax_settings;
            var dt3Auth = DT3.authorities.filter(function (a) { return Number(a.id) === Number(DT3.settings.tax_authority_id); })[0];
            if (dt3Auth) { DT3.settings.tax_authority_code = dt3Auth.code; DT3.settings.tax_authority_name = dt3Auth.name; }
          }
          return json({ data: DT3.settings });
        }
        if (/\/deferred-tax\/authorities$/.test(pathname) && method === "GET") {
          return json({ data: DT3.authorities });
        }

        /* ---- runs collection ---- */
        if (/\/deferred-tax\/runs$/.test(pathname) && method === "GET") {
          return json({ data: DT3.runs });
        }
        if (/\/deferred-tax\/runs$/.test(pathname) && method === "POST") {
          var dt3NrBody = {}; try { dt3NrBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var dt3Auth2 = DT3.authorities.filter(function (a) { return Number(a.id) === Number(dt3NrBody.tax_authority_id || DT3.settings.tax_authority_id); })[0];
          var dt3NewRun = {
            id: DT3.nextRunId++, reporting_date: dt3NrBody.reporting_date || "2026-09-30", status: "draft",
            tax_rate: Number(dt3NrBody.tax_rate || DT3.settings.income_tax_rate || 27),
            tax_authority_id: dt3Auth2 ? dt3Auth2.id : 1, tax_authority_code: dt3Auth2 ? dt3Auth2.code : "RSL", tax_authority_name: dt3Auth2 ? dt3Auth2.name : "Revenue Services Lesotho",
            gross_dta: 0, gross_dtl: 0, recognized_dta: 0, recognized_dtl: 0, unrecognized_dta: 0, net_deferred_tax: 0, journal_id: null, lines: []
          };
          DT3.runs.unshift(dt3NewRun);
          return json({ data: dt3NewRun });
        }
        var dt3ScanM = pathname.match(/\/deferred-tax\/runs\/(\d+)\/scan$/);
        if (dt3ScanM && method === "POST") {
          var dt3ScanRun = dt3RunById(dt3ScanM[1]);
          if (dt3ScanRun) { dt3ScanRun.lines = dt3BuildLines(dt3ScanRun); dt3RecalcTotals(dt3ScanRun); }
          return json({ ok: true, data: dt3ScanRun });
        }
        var dt3RcM = pathname.match(/\/deferred-tax\/runs\/(\d+)\/recalculate$/);
        if (dt3RcM && method === "POST") {
          var dt3RcRun = dt3RunById(dt3RcM[1]);
          if (dt3RcRun) dt3RecalcTotals(dt3RcRun);
          return json({ ok: true, data: dt3RcRun });
        }
        var dt3RvM = pathname.match(/\/deferred-tax\/runs\/(\d+)\/return-to-draft$/);
        if (dt3RvM && method === "POST") {
          var dt3RvRun = dt3RunById(dt3RvM[1]);
          if (dt3RvRun) { dt3RvRun.status = "draft"; dt3RvRun.journal_id = null; }
          return json({ ok: true, data: dt3RvRun });
        }
        var dt3LsM = pathname.match(/\/deferred-tax\/runs\/(\d+)\/lines$/);
        if (dt3LsM && method === "POST") {
          var dt3AlBody = {}; try { dt3AlBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var dt3AlRun = dt3RunById(dt3LsM[1]);
          if (dt3AlRun) {
            var dt3Diff = dt3R2(Number(dt3AlBody.carrying_amount || 0) - Number(dt3AlBody.tax_base || 0));
            var dt3RatePc = Number(dt3AlBody.tax_rate || dt3AlRun.tax_rate || 27);
            var dt3RecPct = Number(dt3AlBody.recognition_percent === undefined ? 100 : dt3AlBody.recognition_percent);
            dt3AlRun.lines.push({
              id: DT3.nextLineId++, description: dt3AlBody.description || "Manual line", source_module: dt3AlBody.source_module || "manual", source_type: "manual", source_id: null,
              balance_type: dt3AlBody.balance_type || (dt3Diff >= 0 ? "liability" : "asset"), carrying_amount: dt3R2(dt3AlBody.carrying_amount || 0), tax_base: dt3R2(dt3AlBody.tax_base || 0),
              temporary_difference: dt3Diff, difference_type: dt3Diff > 0 ? "taxable" : (dt3Diff < 0 ? "deductible" : "none"),
              recognized_amount: dt3R2(Math.abs(dt3Diff) * (dt3RatePc / 100) * (dt3RecPct / 100)),
              scan_status: "resolved", is_manual: true, resolution_message: "Manual adjustment line.",
              calculation_json: null, tax_treatment_code: null
            });
            dt3RecalcTotals(dt3AlRun);
          }
          return json({ ok: true, data: dt3AlRun });
        }
        var dt3LineM = pathname.match(/\/deferred-tax\/runs\/(\d+)\/lines\/(\d+)$/);
        if (dt3LineM && method === "DELETE") {
          var dt3DelRun = dt3RunById(dt3LineM[1]);
          if (dt3DelRun) {
            dt3DelRun.lines = (dt3DelRun.lines || []).filter(function (l) { return Number(l.id) !== Number(dt3LineM[2]); });
            dt3RecalcTotals(dt3DelRun);
          }
          return json({ ok: true });
        }
        var dt3PpM = pathname.match(/\/deferred-tax\/runs\/(\d+)\/preview-post$/);
        if (dt3PpM && method === "POST") {
          var dt3PpRun = dt3RunById(dt3PpM[1]) || {};
          var dt3Net = Number(dt3PpRun.net_deferred_tax || 0);
          var dt3IsAsset = dt3Net < 0;
          var dt3Amt = dt3R2(Math.abs(dt3Net));
          return json({
            data: {
              preview_journal: { posting_date: "2026-10-16", reference: "DT-" + (dt3PpRun.id || 0), description: "Deferred tax adjustment as at " + (dt3PpRun.reporting_date || "2026-09-30") },
              preview_journal_lines: dt3IsAsset ? [
                { account_name: "Deferred Tax Asset", account_code: "BS_CA_1420", description: "Net deferred tax asset", debit: dt3Amt, credit: 0 },
                { account_name: "Income Tax Expense — Deferred", account_code: "PL_EX_6900", description: "Deferred tax movement", debit: 0, credit: dt3Amt }
              ] : [
                { account_name: "Income Tax Expense — Deferred", account_code: "PL_EX_6900", description: "Deferred tax movement", debit: dt3Amt, credit: 0 },
                { account_name: "Deferred Tax Liability", account_code: "BS_CL_2500", description: "Net deferred tax liability", debit: 0, credit: dt3Amt }
              ],
              totals: { total_debit: dt3Amt, total_credit: dt3Amt }
            }
          });
        }
        var dt3PostM = pathname.match(/\/deferred-tax\/runs\/(\d+)\/post$/);
        if (dt3PostM && method === "POST") {
          var dt3PostRun = dt3RunById(dt3PostM[1]);
          if (dt3PostRun) { dt3PostRun.status = "posted"; dt3PostRun.journal_id = DT3.nextJournalId++; }
          return json({ ok: true, journal_id: dt3PostRun ? dt3PostRun.journal_id : null });
        }
        var dt3ActM = pathname.match(/\/deferred-tax\/runs\/(\d+)\/(review|approve|void)$/);
        if (dt3ActM && method === "POST") {
          var dt3ActRun = dt3RunById(dt3ActM[1]);
          if (dt3ActRun && dt3ActRun.status !== "posted") {
            dt3ActRun.status = dt3ActM[2] === "review" ? "reviewed" : dt3ActM[2] === "approve" ? "approved" : "void";
          }
          return json({ ok: true, data: dt3ActRun });
        }
        var dt3OneM = pathname.match(/\/deferred-tax\/runs\/(\d+)$/);
        if (dt3OneM && method === "GET") {
          return json({ data: dt3RunById(dt3OneM[1]) });
        }

        /* ---- capital allowances (asset-tax runs) ---- */
        if (/\/deferred-tax\/asset-tax-runs$/.test(pathname) && method === "GET") {
          return json({ data: DT3.assetTaxRuns });
        }
        if (/\/deferred-tax\/asset-tax-runs$/.test(pathname) && method === "POST") {
          var dt3AnBody = {}; try { dt3AnBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var dt3AnAuth = DT3.authorities.filter(function (a) { return Number(a.id) === Number(dt3AnBody.tax_authority_id || 1); })[0];
          var dt3AnRun = {
            id: DT3.nextAssetTaxRunId++, tax_year: Number(dt3AnBody.tax_year || 2027),
            tax_year_start: dt3AnBody.tax_year_start || "2027-03-01", tax_year_end: dt3AnBody.tax_year_end || "2028-02-29",
            tax_authority_id: dt3AnAuth ? dt3AnAuth.id : 1, tax_authority_code: dt3AnAuth ? dt3AnAuth.code : "RSL", tax_authority_name: dt3AnAuth ? dt3AnAuth.name : "Revenue Services Lesotho",
            status: "draft", calculated_at: null, approved_at: null, locked_at: null,
            gross_dta: 0, gross_dtl: 0, recognized_dta: 0, recognized_dtl: 0, unrecognized_dta: 0, net_deferred_tax: 0,
            lines: [], summary: { gross_dta: 0, gross_dtl: 0, recognized_dta: 0, recognized_dtl: 0, unrecognized_dta: 0, net_deferred_tax: 0 }
          };
          DT3.assetTaxRuns.unshift(dt3AnRun);
          return json({ data: { run: dt3AnRun } });
        }
        var dt3AtCalcM = pathname.match(/\/deferred-tax\/asset-tax-runs\/(\d+)\/calculate$/);
        if (dt3AtCalcM && method === "POST") {
          var dt3AtRun = DT3.assetTaxRuns.filter(function (r) { return Number(r.id) === Number(dt3AtCalcM[1]); })[0];
          if (dt3AtRun) {
            /* recompute from the mirrored profiles (rules 11 & 12; FA-EQ-003 unconfigured) */
            dt3AtRun.lines = DT3.profiles.filter(function (p) { return p.config_status === "configured"; }).map(function (p) {
              var rate = Number(p.rate_percent || 0);
              var cost = Number(p.tax_cost || 0);
              var opening = dt3AtRun.status === "draft" && !dt3AtRun.calculated_at ? cost : cost; /* FY2026 = first allowance year (tr2 convention) */
              var allow = dt3R2(cost * rate / 100);
              return {
                asset_code: p.asset_code, asset_name: p.asset_name, rule_code: (DT3.allowanceRules.filter(function (r) { return Number(r.id) === Number(p.allowance_rule_id); })[0] || {}).rule_code || null,
                rule_source: "standard", calculation_method: p.method || "Straight line", rate_percent: rate,
                opening_tax_wdv: dt3R2(opening), additions: 0, initial_allowance: 0, annual_allowance: allow, total_capital_allowance: allow,
                closing_tax_wdv: dt3R2(opening - allow), book_depreciation: dt3R2(cost / 10), tax_adjustment: dt3R2(allow - cost / 10),
                temporary_difference: dt3R2(dt3FaCarry(p.asset_code) - (opening - allow)), notes: p.notes || ""
              };
            });
            dt3AtRun.status = "calculated";
            dt3AtRun.calculated_at = new Date().toISOString().slice(0, 19);
            var dt3Gdta = 0, dt3Gdtl = 0;
            dt3AtRun.lines.forEach(function (l) {
              if (Number(l.temporary_difference) < 0) dt3Gdta += Math.abs(Number(l.temporary_difference)) * 0.27;
              else dt3Gdtl += Number(l.temporary_difference) * 0.27;
            });
            dt3AtRun.gross_dta = dt3R2(dt3Gdta); dt3AtRun.gross_dtl = dt3R2(dt3Gdtl);
            dt3AtRun.recognized_dta = dt3R2(dt3Gdta); dt3AtRun.recognized_dtl = dt3R2(dt3Gdtl);
            dt3AtRun.unrecognized_dta = 0; dt3AtRun.net_deferred_tax = dt3R2(dt3Gdtl - dt3Gdta);
            dt3AtRun.summary = { gross_dta: dt3AtRun.gross_dta, gross_dtl: dt3AtRun.gross_dtl, recognized_dta: dt3AtRun.recognized_dta, recognized_dtl: dt3AtRun.recognized_dtl, unrecognized_dta: 0, net_deferred_tax: dt3AtRun.net_deferred_tax };
          }
          return json({ ok: true, line_count: dt3AtRun ? dt3AtRun.lines.length : 0, review_count: 0, data: dt3AtRun });
        }
        var dt3AtAppM = pathname.match(/\/deferred-tax\/asset-tax-runs\/(\d+)\/approve$/);
        if (dt3AtAppM && method === "POST") {
          var dt3AtApp = DT3.assetTaxRuns.filter(function (r) { return Number(r.id) === Number(dt3AtAppM[1]); })[0];
          if (dt3AtApp && dt3AtApp.status === "calculated") { dt3AtApp.status = "approved"; dt3AtApp.approved_at = new Date().toISOString().slice(0, 19); }
          return json({ ok: true, data: dt3AtApp });
        }
        var dt3AtLockM = pathname.match(/\/deferred-tax\/asset-tax-runs\/(\d+)\/lock$/);
        if (dt3AtLockM && method === "POST") {
          var dt3AtLock = DT3.assetTaxRuns.filter(function (r) { return Number(r.id) === Number(dt3AtLockM[1]); })[0];
          if (dt3AtLock && dt3AtLock.status === "approved") { dt3AtLock.status = "locked"; dt3AtLock.locked_at = new Date().toISOString().slice(0, 19); }
          return json({ ok: true, data: dt3AtLock });
        }
        var dt3AtRtM = pathname.match(/\/deferred-tax\/asset-tax-runs\/(\d+)\/return-to-draft$/);
        if (dt3AtRtM && method === "POST") {
          var dt3AtRt = DT3.assetTaxRuns.filter(function (r) { return Number(r.id) === Number(dt3AtRtM[1]); })[0];
          if (dt3AtRt && dt3AtRt.status !== "locked") { dt3AtRt.status = "draft"; dt3AtRt.calculated_at = null; dt3AtRt.approved_at = null; }
          return json({ ok: true, data: dt3AtRt });
        }
        var dt3AtVoidM = pathname.match(/\/deferred-tax\/asset-tax-runs\/(\d+)\/void$/);
        if (dt3AtVoidM && method === "POST") {
          var dt3AtVoid = DT3.assetTaxRuns.filter(function (r) { return Number(r.id) === Number(dt3AtVoidM[1]); })[0];
          if (dt3AtVoid && dt3AtVoid.status !== "locked") dt3AtVoid.status = "void";
          return json({ ok: true, data: dt3AtVoid });
        }
        var dt3AtOneM = pathname.match(/\/deferred-tax\/asset-tax-runs\/(\d+)$/);
        if (dt3AtOneM && method === "GET") {
          return json({ data: DT3.assetTaxRuns.filter(function (r) { return Number(r.id) === Number(dt3AtOneM[1]); })[0] || null });
        }

        /* ---- allowance rules / company rules / profiles ---- */
        if (/\/deferred-tax\/allowance-rules$/.test(pathname) && method === "GET") {
          var dt3ArAuth = query.get("tax_authority_id");
          var dt3ArRows = DT3.allowanceRules;
          if (dt3ArAuth) dt3ArRows = dt3ArRows.filter(function (r) { return Number(r.tax_authority_id) === Number(dt3ArAuth); });
          return json({ data: dt3ArRows });
        }
        if (/\/deferred-tax\/allowance-rules$/.test(pathname) && method === "POST") { return json({ ok: true }); }
        var dt3ArOvM = pathname.match(/\/deferred-tax\/allowance-rules\/(\d+)\/override$/);
        if (dt3ArOvM && method === "POST") { return json({ ok: true }); }
        var dt3ArDsM = pathname.match(/\/deferred-tax\/allowance-rules\/(\d+)\/disable$/);
        if (dt3ArDsM && method === "POST") {
          var dt3ArDs = DT3.allowanceRules.filter(function (r) { return Number(r.id) === Number(dt3ArDsM[1]); })[0];
          if (dt3ArDs) dt3ArDs.is_active = false;
          return json({ ok: true, data: dt3ArDs });
        }
        if (/\/deferred-tax\/company-allowance-rules$/.test(pathname) && method === "GET") { return json({ data: DT3.companyRules }); }
        if (/\/deferred-tax\/company-allowance-rules$/.test(pathname) && method === "POST") {
          var dt3CrBody = {}; try { dt3CrBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          dt3CrBody.id = DT3.nextCompanyRuleId++;
          DT3.companyRules.push(dt3CrBody);
          return json({ data: dt3CrBody });
        }
        var dt3CrIdM = pathname.match(/\/deferred-tax\/company-allowance-rules\/(\d+)$/);
        if (dt3CrIdM && method === "PUT") {
          var dt3CrUpdBody = {}; try { dt3CrUpdBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var dt3CrUpd = DT3.companyRules.filter(function (r) { return Number(r.id) === Number(dt3CrIdM[1]); })[0];
          if (dt3CrUpd && dt3CrUpdBody && typeof dt3CrUpdBody === "object") Object.keys(dt3CrUpdBody).forEach(function (k) { dt3CrUpd[k] = dt3CrUpdBody[k]; });
          return json({ data: dt3CrUpd });
        }
        if (dt3CrIdM && method === "DELETE") {
          DT3.companyRules = DT3.companyRules.filter(function (r) { return Number(r.id) !== Number(dt3CrIdM[1]); });
          return json({ ok: true });
        }
        if (/\/deferred-tax\/asset-tax-profiles$/.test(pathname) && method === "GET") { return json({ data: DT3.profiles, items: DT3.profiles }); }
        var dt3PrIdM = pathname.match(/\/deferred-tax\/asset-tax-profiles\/(\d+)$/);
        if (dt3PrIdM && method === "PUT") {
          var dt3PrBody = {}; try { dt3PrBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          var dt3Pr = DT3.profiles.filter(function (p) { return Number(p.profile_id) === Number(dt3PrIdM[1]); })[0];
          if (dt3Pr && dt3PrBody && typeof dt3PrBody === "object") {
            Object.keys(dt3PrBody).forEach(function (k) { dt3Pr[k] = dt3PrBody[k]; });
            dt3Pr.config_status = dt3Pr.allowance_rule_id && dt3Pr.tax_cost ? "configured" : "not_configured";
          }
          return json({ data: dt3Pr });
        }

        /* ---- lease tax treatment overrides ---- */
        var dt3LsTxM = pathname.match(/\/deferred-tax\/leases\/(\d+)\/tax-treatment$/);
        if (dt3LsTxM && method === "GET") {
          var dt3Lt = DT3.leaseTreatments[String(dt3LsTxM[1])] || { lease_id: Number(dt3LsTxM[1]), rou_tax_base_override: null, liability_tax_base_override: null, tax_treatment_notes: null };
          return json({ data: dt3Lt });
        }
        if (dt3LsTxM && method === "PUT") {
          var dt3LtBody = {}; try { dt3LtBody = JSON.parse(opts.body || "{}"); } catch (e) {}
          dt3LtBody.lease_id = Number(dt3LsTxM[1]);
          DT3.leaseTreatments[String(dt3LsTxM[1])] = dt3LtBody;
          return json({ data: dt3LtBody });
        }

        return json({ ok: true, rows: [], items: [], data: [], total: 0 });
      }
/* === fifadt-mock-end (Task 15) === */
/* ════════════════════════════════════════════════════════════════════
   cs — COMPANY & SETUP routes (Task 16)
   Data for the Company & Setup screens: My Company, Update Company,
   VAT Settings, Income Tax Settings, Corporate Structure, Reporting
   Periods, Management Packs + Year-End Close. Values tie to the
   existing demo dataset (TB 947,200 · NP 41,865 · group entities).
   ════════════════════════════════════════════════════════════════════ */

/* ---- profile enrichment: NEW fields only (existing values untouched) ---- */
(function () {
  var C = COMPANY;
  if (!C.__csEnriched) {
    C.company_email = C.company_email || "info@mokokotrading.co.za";
    C.company_phone = C.company_phone || "+27 11 811 4522";
    C.company_reg_no = C.company_reg_no || C.reg_no || "2016/248914/07";
    C.tin = C.tin || C.tax_number || "9876543210";
    C.vat = C.vat || C.vat_number || "4730265189";
    C.vat_number = C.vat_number || C.vat;
    C.country = C.country || "South Africa";
    C.country_code = C.country_code || "ZA";
    C.postal_address = C.postal_address || "P.O. Box 2214, Springs, Gauteng, 1560";
    C.logo_url = C.logo_url || "";
    C.system_code = C.system_code || C.system_company_code || "MTL";
    C.fin_year_start = C.fin_year_start || "1 April";
    C.first_reporting_period_start = C.first_reporting_period_start || "2024-01-01";
    C.financial_year_end_month = C.financial_year_end_month || 3;
    C.financial_year_end_day = C.financial_year_end_day || 31;
    C.reporting_period_locked = C.reporting_period_locked === true;
    C.income_tax_settings = C.income_tax_settings || {
      tax_id: "9876543210",
      residency: "ZA",
      year_start: "2026-03-01",
      year_end: "2027-02-28",
      filing_type: "provisional_quarterly",
      due_days: 90,
      reminder_days: 14,
      payment_method: "eft"
    };
    C.__csEnriched = true;
  }
})();

/* ---- in-memory Company & Setup state ---- */
var CS = {
  branches: [
    { id: 1, name: "Johannesburg Branch", branch_code: "JHB-01", city: "Johannesburg", manager: "L. Dlamini", active: true },
    { id: 2, name: "Cape Town Branch", branch_code: "CPT-01", city: "Cape Town", manager: "P. Naidoo", active: true }
  ],
  segments: [
    { id: 1, name: "Retail Trade", segment_code: "SEG-RET", ifrs_segment: "Reportable", note: "General retail — core trading" },
    { id: 2, name: "Logistics Services", segment_code: "SEG-LOG", ifrs_segment: "Reportable", note: "Mokoko Logistics contract fleet" }
  ],
  nextRelationshipId: 100,
  yearEndClose: null,
  packsAutofixed: false
};

function csRelationships() {
  return (typeof G !== "undefined" && G.entities ? G.entities : [
    { id: 1, code: "MTL", name: "Mokoko Trading (Pty) Ltd", type: "parent", ownership_pct: 100, currency: "ZAR", method: "full" },
    { id: 2, code: "MLOG", name: "Mokoko Logistics (Pty) Ltd", type: "subsidiary", ownership_pct: 100, currency: "ZAR", method: "full" },
    { id: 3, code: "CDH", name: "Cape Distribution (Pty) Ltd", type: "subsidiary", ownership_pct: 80, currency: "ZAR", method: "full" },
    { id: 4, code: "WHT", name: "Windhoek Trading (Pty) Ltd", type: "subsidiary", ownership_pct: 100, currency: "NAD", method: "full" },
    { id: 5, code: "KAJ", name: "Karoo Agri JV", type: "joint_venture", ownership_pct: 50, currency: "ZAR", method: "equity" },
    { id: 6, code: "NKR", name: "Namakwa Retail (Pty) Ltd", type: "associate", ownership_pct: 25, currency: "ZAR", method: "equity" }
  ]).map(function (e) {
    return {
      id: e.id,
      relationship_type: e.type === "parent" ? "parent" : e.type,
      child_company_id: e.company_id,
      child_company_name: e.name,
      system_company_code: e.code,
      country: e.code === "WHT" ? "Namibia" : "South Africa",
      currency: e.currency,
      entity_kind: "company",
      ownership_percent: e.ownership_pct,
      voting_percent: e.ownership_pct,
      control_basis: e.type === "associate" ? "Significant influence" : (e.type === "joint_venture" ? "Joint control" : "Voting rights"),
      consolidation_method: e.method === "equity" ? "equity" : "full",
      acquisition_date: e.acquisition_date || null
    };
  });
}

/* SARS VAT period rules — both channels so the filing-channel switch works */
var CS_VAT_RULES = [
  { category_code: "A", name: "Turnover \u2264 R1.5m \u2014 may register bi-monthly", filing_channel: "efiling", frequency: "bi_monthly", due_rule: "last_business_day_next_month", anchor_month: 2 },
  { category_code: "A", name: "Turnover \u2264 R1.5m \u2014 may register bi-monthly", filing_channel: "manual", frequency: "bi_monthly", due_rule: "last_business_day_next_month", anchor_month: 2 },
  { category_code: "B", name: "Turnover > R1.5m \u2014 bi-monthly", filing_channel: "efiling", frequency: "bi_monthly", due_rule: "last_business_day_next_month", anchor_month: 2 },
  { category_code: "B", name: "Turnover > R1.5m \u2014 bi-monthly", filing_channel: "manual", frequency: "bi_monthly", due_rule: "last_business_day_next_month", anchor_month: 2 },
  { category_code: "C", name: "Turnover > R30m \u2014 monthly", filing_channel: "efiling", frequency: "monthly", due_rule: "last_business_day_next_month", anchor_month: 0 },
  { category_code: "D", name: "Farming \u2014 6-monthly", filing_channel: "efiling", frequency: "semi_annual", due_rule: "last_business_day_next_month", anchor_month: 7 },
  { category_code: "E", name: "Fishing & utilities \u2014 4-monthly", filing_channel: "efiling", frequency: "semi_annual", due_rule: "days_after_period_end_25", anchor_month: 0 }
];

function csMgmtPacks() {
  var ready = CS.packsAutofixed;
  return {
    score: { ready: ready ? 6 : 4, total: 6 },
    actions: ready ? [] : [{ type: "autofix", label: "Auto-configure" }],
    critical_blockers: [],
    packs: [
      { title: "Management Pack", status: "READY", summary: "P&L, Balance Sheet and Cash Flow current to October 2026 and tied to the ledger.", open_screen: "reports" },
      { title: "Board Pack", status: "READY", summary: "KPIs, commentary sections and the group snapshot are linked to Command Center data.", open_screen: "dashboard" },
      { title: "Tax Pack", status: "READY", summary: "VAT (Category B \u00b7 bi-monthly) and PAYE reconcile to the VAT & Tax control account.", open_screen: "vat" },
      { title: "Statutory Pack", status: "READY", summary: "Company register, CIPC annual return and beneficial ownership are up to date.", open_screen: "company-my" },
      { title: "Audit Pack", status: ready ? "READY" : "NEEDS_SETUP", summary: ready ? "Depreciation schedule finalised; disposal review signed off." : "1 pre-year-end item outstanding.", missing: ready ? [] : [{ label: "Depreciation schedule not finalised for FY2026 \u2014 2 assets pending disposal review", fix_screen: "fixedassets" }], fix_screen: ready ? null : "fixedassets" },
      { title: "IFRS Disclosure Pack", status: ready ? "READY" : "NEEDS_SETUP", summary: ready ? "IAS 12 note linked to the deferred tax computation." : "Notes editor 85% mapped.", missing: ready ? [] : [{ label: "IAS 12 deferred tax note not linked to the computation", fix_screen: "deferred-tax" }], fix_screen: ready ? null : "deferred-tax" }
    ]
  };
}

/* ---- Company & Setup route handlers (inserted BEFORE generic fallback) ---- */
if (cidMatch) {
  var csP = pathname.replace(/\/$/, "");

  /* VAT settings (old loader + form save) */
  if (/\/vat_settings$/.test(csP) && method === "GET") {
    return json({
      frequency: "bi_monthly",
      anchor_month: 2,
      filing_lag_days: 25,
      reminder_days_before: 7,
      prices_include_vat: false,
      vat_registration_number: "4730265189",
      customs_code: "S0426A",
      filing_channel: "efiling",
      period_category: "B",
      authority_code: "SARS"
    });
  }
  if (/\/vat_settings$/.test(csP) && (method === "POST" || method === "PUT")) {
    var csVatBody = {}; try { csVatBody = JSON.parse(opts.body || "{}"); } catch (e) {}
    COMPANY.vat_settings = Object.assign({}, COMPANY.vat_settings || {}, csVatBody || {});
    return json({ ok: true, settings: {
      vat_registration_number: csVatBody.vat_registration_number || "4730265189",
      customs_code: csVatBody.customs_code || "S0426A",
      reminder_days: Number(csVatBody.reminder_days || 7),
      filing_channel: csVatBody.filing_channel || "efiling",
      period_category: csVatBody.period_category || "B"
    } });
  }

  /* VAT setup options (drives authority / category / channel selects) */
  if (/\/vat\/setup-options$/.test(csP) && method === "GET") {
    return json({
      context: {
        authority_code: "SARS",
        authority: { name: "South African Revenue Service" },
        vat_registration_number: "4730265189",
        period_rule: { category_code: "B", filing_channel: "efiling", frequency: "bi_monthly", due_rule: "last_business_day_next_month" },
        settings: {
          vat_registration_number: "4730265189",
          customs_code: "S0426A",
          reminder_days: 7,
          filing_channel: "efiling",
          period_category: "B"
        }
      },
      period_rules: CS_VAT_RULES
    });
  }

  /* Management packs */
  if (/\/management_packs$/.test(csP) && method === "GET") return json(csMgmtPacks());
  if (/\/management_packs\/autofix$/.test(csP) && method === "POST") {
    CS.packsAutofixed = true;
    return json({ ok: true, message: "Setup items completed" });
  }

  /* Corporate structure: group profile */
  if (/\/corporate-structure\/profile$/.test(csP) && method === "GET") {
    return json({
      profile_name: "SmartAfro Group",
      group_name: "SmartAfro Group",
      reporting_currency: "ZAR",
      financial_year_end_month: 3,
      financial_year_end_day: 31,
      default_consolidation_method: "full",
      enable_intercompany: true,
      enable_fx_translation: true,
      enable_nci: true,
      enable_equity_method: true,
      enable_segment_reporting: false
    });
  }
  if (/\/corporate-structure\/profile$/.test(csP) && (method === "PUT" || method === "POST")) {
    return json({ ok: true, message: "Group profile saved" });
  }

  /* Corporate structure: relationships / branches / segments */
  if (/\/group-structure$/.test(csP) && method === "GET") {
    return json({ relationships: csRelationships(), branches: CS.branches, segments: CS.segments });
  }
  if (/\/related-companies$/.test(csP) && method === "GET") return json({ rows: csRelationships() });
  if (/\/branches$/.test(csP) && method === "GET") return json({ rows: CS.branches });
  if (/\/segments$/.test(csP) && method === "GET") return json({ rows: CS.segments });
  if (/\/corporate-structure\/relationships$/.test(csP) && method === "POST") {
    var csRelBody = {}; try { csRelBody = JSON.parse(opts.body || "{}"); } catch (e) {}
    var csRel = {
      id: ++CS.nextRelationshipId,
      relationship_type: csRelBody.relationship_type || csRelBody.entity_type || "subsidiary",
      child_company_id: csRelBody.child_company_id || csRelBody.company_id || null,
      child_company_name: csRelBody.child_company_name || csRelBody.name || "New group entity",
      system_company_code: csRelBody.system_company_code || csRelBody.code || "NEW",
      country: csRelBody.country || "South Africa",
      currency: csRelBody.currency || "ZAR",
      entity_kind: "company",
      ownership_percent: Number(csRelBody.ownership_percent || csRelBody.ownership_pct || 100),
      voting_percent: Number(csRelBody.voting_percent || csRelBody.ownership_pct || 100),
      control_basis: "Voting rights",
      consolidation_method: csRelBody.consolidation_method || "full"
    };
    if (typeof G !== "undefined") {
      G.entities.push({ id: csRel.id, company_id: 900 + csRel.id, code: csRel.system_company_code, name: csRel.child_company_name, type: csRel.relationship_type, ownership_pct: csRel.ownership_percent, currency: csRel.currency, method: csRel.consolidation_method, acquisition_date: csRelBody.acquisition_date || null });
    }
    return json({ ok: true, relationship: csRel });
  }
  if (/\/branches$/.test(csP) && method === "POST") {
    var csBrBody = {}; try { csBrBody = JSON.parse(opts.body || "{}"); } catch (e) {}
    var csBr = { id: CS.branches.length + 1, name: csBrBody.name || "New branch", branch_code: csBrBody.branch_code || ("BR-" + (CS.branches.length + 1)), city: csBrBody.city || "", manager: csBrBody.manager || "", active: true };
    CS.branches.push(csBr);
    return json({ ok: true, branch: csBr });
  }
  if (/\/segments$/.test(csP) && method === "POST") {
    var csSegBody = {}; try { csSegBody = JSON.parse(opts.body || "{}"); } catch (e) {}
    var csSeg = { id: CS.segments.length + 1, name: csSegBody.name || "New segment", segment_code: csSegBody.segment_code || ("SEG-" + (CS.segments.length + 1)), ifrs_segment: "Reportable", note: csSegBody.note || "" };
    CS.segments.push(csSeg);
    return json({ ok: true, segment: csSeg });
  }

  /* Year-end close: preview + post + reopen — ties to TB (rev 142,300 · exp 100,435 · NP 41,865) */
  if (/\/year-end-close\/reopen$/.test(csP) && method === "POST") {
    CS.yearEndClose = null;
    return json({ ok: true, reopened: true, message: "Year-end close reversed; period open for adjustments." });
  }
  if (/\/year-end-close$/.test(csP) && method === "POST") {
    var csYecBody = {}; try { csYecBody = JSON.parse(opts.body || "{}"); } catch (e) {}
    var csFrom = csYecBody.period_from || "2025-04-01";
    var csTo = csYecBody.period_to || "2026-03-31";
    if (csYecBody.preview) {
      return json({
        can_close: !CS.yearEndClose,
        period_from: csFrom,
        period_to: csTo,
        ref: "YEC-FY2026-01",
        total_revenue: 142300.00,
        total_expenses: 100435.00,
        net_result: 41865.00,
        retained_earnings_before: 464590.00,
        retained_earnings_after: CS.yearEndClose ? 506455.00 : 506455.00,
        already_closed: !!CS.yearEndClose
      });
    }
    CS.yearEndClose = { period_from: csFrom, period_to: csTo, ref: "YEC-FY2026-01" };
    return json({
      ok: true,
      period_from: csFrom,
      period_to: csTo,
      ref: "YEC-FY2026-01",
      total_revenue: 142300.00,
      total_expenses: 100435.00,
      net_profit: 41865.00,
      net_result: 41865.00,
      can_close: false,
      journal_id: 2077
    });
  }
}

/* ---- generic fallback: 200 + empty collections ---- */
    return json({ ok: true, rows: [], items: [], data: [], total: 0 });
  }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var opts = init || {};

    if (url.indexOf("/api/") !== -1) {
      var abs = url.indexOf("http") === 0 ? url : (location.origin + (url.charAt(0) === "/" ? url : "/" + url));
      var parsed;
      try { parsed = new URL(abs); } catch (e) { parsed = null; }

      if (parsed && parsed.pathname.indexOf("/api/") !== -1) {
        return new Promise(function (resolve) {
          setTimeout(function () {
            try {
              resolve(handleApi(parsed.pathname, parsed.searchParams, opts));
            } catch (err) {
              console.error("[DEMO MOCK] handler error:", err);
              resolve(json({ ok: true, rows: [], items: [], data: [], total: 0 }));
            }
          }, 120); // small latency so loading states are visible
        });
      }
    }

    if (realFetch) return realFetch(input, init);
    return Promise.resolve(json({ ok: true }));
  };

  console.log("%cFinSage DEMO MODE — mock API active (all data is fictional)", "background:#00284F;color:#00C8C8;padding:2px 8px;border-radius:4px;font-weight:bold");

  /* ── 5) Demo helper bubble ──────────────────────────────────── */
  function mountDemoBubble() {
    if (document.getElementById("fsDemoBubble")) return;

    var css = document.createElement("style");
    css.textContent = [
      "#fsDemoBubble{position:fixed;right:16px;bottom:16px;z-index:99999;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
      "#fsDemoBubble .fsdb-pill{display:flex;align-items:center;gap:8px;background:#0b1f33;color:#fff;border:1px solid rgba(0,200,200,.35);box-shadow:0 10px 30px rgba(2,12,27,.35);border-radius:999px;padding:8px 12px;font-size:12px;font-weight:600}",
      "#fsDemoBubble .fsdb-dot{width:8px;height:8px;border-radius:50%;background:#f59e0b;box-shadow:0 0 0 0 rgba(245,158,11,.7);animation:fsdbPulse 1.8s infinite}",
      "@keyframes fsdbPulse{70%{box-shadow:0 0 0 8px rgba(245,158,11,0)}100%{box-shadow:0 0 0 0 rgba(245,158,11,0)}}",
      "#fsDemoBubble .fsdb-btn{cursor:pointer;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:600;transition:background .15s}",
      "#fsDemoBubble .fsdb-btn:hover{background:rgba(0,200,200,.25);border-color:rgba(0,200,200,.5)}",
      "#fsDemoBubble .fsdb-card{display:none;position:absolute;right:0;bottom:46px;width:300px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 18px 50px rgba(2,12,27,.22);padding:14px 16px;color:#0f172a}",
      "#fsDemoBubble .fsdb-card.open{display:block}",
      "#fsDemoBubble .fsdb-card h4{margin:0 0 8px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#64748b}",
      "#fsDemoBubble .fsdb-card ul{margin:0;padding:0;list-style:none;font-size:12px;line-height:1.55}",
      "#fsDemoBubble .fsdb-card li{display:flex;gap:8px;padding:5px 0;border-bottom:1px dashed #eef2f6}",
      "#fsDemoBubble .fsdb-card li:last-child{border-bottom:0}",
      "#fsDemoBubble .fsdb-card b{color:#00284F}",
      "#fsDemoBubble .fsdb-close{position:absolute;top:8px;right:10px;cursor:pointer;color:#94a3b8;font-size:14px;line-height:1}"
    ].join("\n");
    document.head.appendChild(css);

    var wrap = document.createElement("div");
    wrap.id = "fsDemoBubble";
    wrap.innerHTML =
      '<div class="fsdb-card">' +
      '  <span class="fsdb-close" data-fsdb="close">✕</span>' +
      "  <h4>Demo guide — mock data</h4>" +
      "  <ul>" +
      "    <li><span>☰</span><span><b>Header ☰ button</b> collapses/expands the sidebar on desktop; on small screens it slides the nav in over an overlay.</span></li>" +
      "    <li><span>▸</span><span><b>Parent items</b> (Workflows, Reports, Control Room…) expand nested sub-menus — exactly like production.</span></li>" +
      "    <li><span>🧭</span><span><b>Active item</b> is highlighted and the screen + header title update. All screens render with dummy data.</span></li>" +
      "    <li><span>📔</span><span><b>Journal Desk</b> is fully usable: post a batch or reverse a journal and it appears in Recent Journals instantly (in-memory only).</span></li>" +
"    <li><span>🧾</span><span><b>Accounts Receivable</b>: switch between <b>Invoices</b> and <b>Quotes</b> with the segmented control; open Customers or Draft lists, pick a customer to see their documents, and Accept & Convert a quote into an invoice (in-memory only).</span></li>" +
"    <li><span>📈</span><span><b>Revenue</b>: start on the landing page — pick a contract card to open the workspace, then work the tabs: Obligations, Billings &amp; Cash, Progress and Recognition Runs (all in-memory).</span></li>" +
"    <li><span>🧮</span><span><b>Accruals &amp; Deferrals</b>: open a register item to see its recognition schedule, run a Recognition Run (Preview → Post) and watch the KPIs update, or create a new prepaid / deferred item — all in-memory.</span></li>" +
"    <li><span>📎</span><span data-ap-guide-v1><b>Accounts Payable</b>: open <b>Vendors</b> to pick a supplier, work their unpaid bills, open a bill to allocate a payment (Create &amp; Allocate → Approve → Release), capture GRNI, and run Vendor Statements / AP Aging from the Control Room — all in-memory.</span></li>" +
"    <li><span>💼</span><span><b>Payroll</b>: 4 employees, calendars and runs are seeded. Open <b>Statutory Returns</b> → pick <b>SARS</b> → choose Tax Year 2026/27 + a filing month → <b>Preview Returns</b> → <b>✓ Validate</b> → <b>Export CSV / Excel / XML</b> (files download). Aug + Sep EMP201 (3,890 + 3,000) reconcile with the 6,890 PAYE Payable on the Balance Sheet.</span></li>" +
"    <li><span>🏗️</span><span><b>Projects</b>: 6 seeded projects (PRJ-2601…2606) tied to the revenue contracts — open a project for tasks, team, costs and the revenue mirror, then check <b>Project Profitability</b>: its strip totals (205,000 recognised / 215,000 billed) tie out with the Revenue desk.</span></li>" +
      "    <li><span>🔄</span><span><b>Reset</b> restores the original dummy dataset.</span></li>" +
      "  </ul>" +
      "</div>" +
      '<div class="fsdb-pill">' +
      '  <span class="fsdb-dot"></span>' +
      "  <span>DEMO · mock data</span>" +
      '  <span class="fsdb-btn" data-fsdb="guide">Guide</span>' +
      '  <span class="fsdb-btn" data-fsdb="reset">Reset</span>' +
      "</div>";

    document.body.appendChild(wrap);

    wrap.addEventListener("click", function (e) {
      var act = e.target.getAttribute && e.target.getAttribute("data-fsdb");
      if (!act) return;
      if (act === "guide") wrap.querySelector(".fsdb-card").classList.toggle("open");
      if (act === "close") wrap.querySelector(".fsdb-card").classList.remove("open");
      if (act === "reset") {
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch (err) { }
        location.reload();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountDemoBubble, { once: true });
  } else {
    mountDemoBubble();
  }

  /* ── 6) Boot nudge: fill the Accounting Work Queue card ──────
     The real app only renders this card when the period filter
     changes. We dispatch one synthetic change right after boot so
     the card is populated for the demo — using the app's own code
     path (renderAccountingWorkQueue), no app code modified.      */
  setTimeout(function () {
    try {
      var host = document.getElementById("cc-workqueue");
      var sel = document.getElementById("fsPeriodFilter");
      if (host && sel && /Loading/i.test(host.textContent || "")) {
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } catch (e) { /* non-fatal */ }
  }, 4500);
})();