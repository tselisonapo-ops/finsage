(function ias41Module() {
  "use strict";

  const MODULE_KEY = "ias41";
  const TAB_STORAGE_KEY = "fs_ias41_active_tab";

  const state = {
    bound: false,
    loading: false,
    activeTab: "dashboard",
    companyId: null,
    company: null,
    coa: [],
    mappings: {},
  };

  const tabs = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: "📊",
      title: "IAS 41 Dashboard",
      description:
        "Summary of biological assets, valuations, harvests and outstanding accounting actions.",
    },
    {
      id: "biological-assets",
      label: "Biological Assets",
      icon: "🐄",
      title: "Biological Assets",
      description:
        "Register and manage individual biological assets and grouped populations.",
    },
    {
      id: "asset-classes",
      label: "Asset Classes",
      icon: "🗂️",
      title: "Biological Asset Classes",
      description:
        "Define livestock, crops, consumable assets, bearer-related produce and measurement rules.",
    },
    {
      id: "products",
      label: "Products",
      icon: "🌽",
      title: "Agricultural Products",
      description:
        "Configure agricultural produce created or harvested from biological assets.",
    },
    {
      id: "locations",
      label: "Locations",
      icon: "📍",
      title: "Agricultural Locations",
      description:
        "Maintain farms, fields, camps, barns, orchards, greenhouses and storage locations.",
    },
    {
      id: "batches",
      label: "Batches",
      icon: "🏷️",
      title: "Biological Asset Batches",
      description:
        "Manage herds, flocks, crop blocks and other grouped biological asset populations.",
    },
    {
      id: "acquisition",
      label: "Acquisition",
      icon: "➕",
      title: "Acquisitions, Births and Planting",
      description:
        "Capture purchases, births, planting, transfers, donations and opening balances.",
    },
    {
      id: "growth",
      label: "Growth",
      icon: "🌱",
      title: "Biological Transformation",
      description:
        "Track growth, production, weight, age, maturity, quantities and physical changes.",
    },
    {
      id: "health",
      label: "Health",
      icon: "🩺",
      title: "Health and Mortality",
      description:
        "Record health events, treatments, mortality, disease and asset condition.",
    },
    {
      id: "valuations",
      label: "Valuations",
      icon: "⚖️",
      title: "Fair-Value Measurement",
      description:
        "Maintain market prices and calculate fair value less costs to sell.",
    },
    {
      id: "harvest",
      label: "Harvest",
      icon: "🧺",
      title: "Harvest and IAS 2 Transfer",
      description:
        "Capture harvest events and transfer agricultural produce into inventory.",
    },
    {
      id: "government-grants",
      label: "Government Grants",
      icon: "🏛️",
      title: "Government Grants",
      description:
        "Manage agricultural grants, conditions, receipts and income recognition.",
    },
    {
      id: "reports",
      label: "Reports",
      icon: "📑",
      title: "IAS 41 Reports and Disclosures",
      description:
        "Prepare registers, movement schedules, valuation reports and disclosure notes.",
    },
    {
      id: "settings",
      label: "Settings",
      icon: "⚙️",
      title: "IAS 41 Settings",
      description:
        "Configure account mappings, units, valuation defaults and module controls.",
    },
  ];

  const $ = (selector, root = document) => root.querySelector(selector);

  function getCompanyId() {
    return Number(
      window.getActiveCompanyId?.() ||
      window.CURRENT_COMPANY_ID ||
      window.CURRENT_COMPANY?.id ||
      0
    ) || null;
  }

  function getCompany() {
    return window.CURRENT_COMPANY || null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getStoredTab() {
    try {
      return localStorage.getItem(TAB_STORAGE_KEY) || "dashboard";
    } catch {
      return "dashboard";
    }
  }

  function storeTab(tabId) {
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tabId);
    } catch {}
  }

  function validTab(tabId) {
    return tabs.some((tab) => tab.id === tabId);
  }

  function companyName() {
    return (
      state.company?.legal_name ||
      state.company?.company_name ||
      state.company?.name ||
      (state.companyId ? `Company ${state.companyId}` : "No company selected")
    );
  }

  function setStatus(message, tone = "") {
    const badge = $("#ias41SetupBadge");
    if (!badge) return;

    badge.textContent = message;
    badge.dataset.tone = tone;
  }

  function renderTabs() {
    const host = $("#ias41Tabs");
    if (!host) return;

    host.innerHTML = tabs
      .map(
        (tab) => `
          <button
            type="button"
            class="btn ias41-tab ${
              state.activeTab === tab.id ? "active" : ""
            }"
            data-ias41-tab="${escapeHtml(tab.id)}"
            role="tab"
            aria-selected="${state.activeTab === tab.id}"
          >
            <span>${tab.icon}</span>
            <span>${escapeHtml(tab.label)}</span>
          </button>
        `
      )
      .join("");
  }

  function stubActions(tabId) {
    const actions = {
      dashboard: [
        ["Review setup", "settings"],
        ["Open valuations", "valuations"],
      ],
      "biological-assets": [
        ["New biological asset", ""],
        ["Import register", ""],
      ],
      "asset-classes": [
        ["New asset class", ""],
      ],
      products: [
        ["New product", ""],
      ],
      locations: [
        ["New location", ""],
      ],
      batches: [
        ["New batch", ""],
      ],
      acquisition: [
        ["New acquisition", ""],
        ["Register birth", ""],
        ["Register planting", ""],
      ],
      growth: [
        ["Record growth", ""],
        ["Record production", ""],
      ],
      health: [
        ["Record health event", ""],
        ["Record mortality", ""],
      ],
      valuations: [
        ["New valuation run", ""],
        ["Market prices", ""],
      ],
      harvest: [
        ["New harvest", ""],
        ["IAS 2 transfer", ""],
      ],
      "government-grants": [
        ["New grant", ""],
      ],
      reports: [
        ["Biological asset register", ""],
        ["Disclosure note", ""],
      ],
      settings: [
        ["Check account mappings", ""],
      ],
    };

    return actions[tabId] || [];
  }

  function renderStubTable(tab) {
    const tableHeaders = {
      "biological-assets": ["Asset", "Class", "Location", "Quantity", "Status"],
      "asset-classes": ["Class", "Category", "Unit", "Measurement", "Status"],
      products: ["Product", "Source asset", "Unit", "Inventory item", "Status"],
      locations: ["Location", "Type", "Parent", "Manager", "Status"],
      batches: ["Batch", "Asset class", "Location", "Quantity", "Status"],
      acquisition: ["Date", "Transaction", "Asset / Batch", "Quantity", "Status"],
      growth: ["Date", "Asset / Batch", "Measure", "Change", "Status"],
      health: ["Date", "Asset / Batch", "Event", "Outcome", "Status"],
      valuations: ["Run", "Valuation date", "Population", "Fair value", "Status"],
      harvest: ["Harvest", "Date", "Produce", "Quantity", "Status"],
      "government-grants": ["Grant", "Authority", "Amount", "Conditions", "Status"],
      reports: ["Report", "Period", "Prepared by", "Updated", "Action"],
    };

    const headers = tableHeaders[tab.id];
    if (!headers) return "";

    return `
      <div class="overflow-x-auto border rounded-lg">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left border-b">
              ${headers
                .map((header) => `<th class="p-3">${escapeHtml(header)}</th>`)
                .join("")}
            </tr>
          </thead>

          <tbody>
            <tr>
              <td
                colspan="${headers.length}"
                class="p-8 text-center text-slate-500"
              >
                This workspace is ready for its phase implementation.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function renderDashboardStub() {
    return `
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        ${[
          ["Biological assets", "0", "Registered assets and populations"],
          ["Carrying amount", "0.00", "Fair value less costs to sell"],
          ["Current valuation runs", "0", "Draft or awaiting approval"],
          ["Harvests this period", "0", "Completed harvest transactions"],
        ]
          .map(
            ([label, value, note]) => `
              <div class="card p-4">
                <div class="text-sm text-slate-500">${label}</div>
                <div class="text-2xl font-bold mt-1">${value}</div>
                <div class="text-xs text-slate-500 mt-2">${note}</div>
              </div>
            `
          )
          .join("")}
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <div class="card p-4">
          <h4 class="font-bold">Accounting readiness</h4>

          <div class="mt-3 space-y-2 text-sm">
            <div class="flex justify-between gap-3">
              <span>Chart of Accounts</span>
              <span class="pill">${
                state.coa.length ? `${state.coa.length} accounts loaded` : "Not checked"
              }</span>
            </div>

            <div class="flex justify-between gap-3">
              <span>IAS 41 account mappings</span>
              <span class="pill">Not configured</span>
            </div>

            <div class="flex justify-between gap-3">
              <span>Journal preview engine</span>
              <span class="pill">Planned</span>
            </div>
          </div>
        </div>

        <div class="card p-4">
          <h4 class="font-bold">Next implementation work</h4>

          <ol class="mt-3 space-y-2 text-sm list-decimal pl-5">
            <li>Inspect available posting accounts.</li>
            <li>Configure IAS 41 account roles.</li>
            <li>Validate the mappings against the company COA.</li>
            <li>Build reusable journal preview and posting controls.</li>
          </ol>
        </div>
      </div>
    `;
  }

  function renderSettingsStub() {
    const roles = [
      ["biological_asset_current", "Current biological assets"],
      ["biological_asset_noncurrent", "Non-current biological assets"],
      ["agricultural_produce_inventory", "Agricultural produce inventory"],
      ["fair_value_gain", "Fair-value gains"],
      ["fair_value_loss", "Fair-value losses"],
      ["costs_to_sell", "Costs to sell"],
      ["agricultural_revenue", "Agricultural revenue"],
      ["mortality_loss", "Mortality and abnormal loss"],
      ["government_grant_income", "Government grant income"],
      ["government_grant_receivable", "Government grant receivable"],
      ["cash_or_bank", "Cash or bank"],
      ["accounts_payable", "Accounts payable"],
      ["accounts_receivable", "Accounts receivable"],
    ];

    return `
      <div class="card p-4">
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h4 class="font-bold">IAS 41 account mappings</h4>

            <p class="text-sm text-slate-500 mt-1">
              These selectors will be connected to the company Chart of
              Accounts during Phase 0.
            </p>
          </div>

          <button
            id="ias41ValidateMappingsBtn"
            type="button"
            class="btn"
          >
            Validate mappings
          </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
          ${roles
            .map(
              ([role, label]) => `
                <label class="block">
                  <span class="text-sm font-medium">${escapeHtml(label)}</span>

                  <select
                    class="input w-full mt-1"
                    data-ias41-account-role="${escapeHtml(role)}"
                    disabled
                  >
                    <option value="">Account mapping not connected yet</option>
                  </select>
                </label>
              `
            )
            .join("")}
        </div>
      </div>

      <div class="card p-4 mt-4">
        <h4 class="font-bold">Other settings</h4>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <label class="block">
            <span class="text-sm font-medium">Default measurement basis</span>
            <select class="input w-full mt-1" disabled>
              <option>Fair value less costs to sell</option>
            </select>
          </label>

          <label class="block">
            <span class="text-sm font-medium">Default quantity precision</span>
            <input class="input w-full mt-1" value="2" disabled>
          </label>

          <label class="block">
            <span class="text-sm font-medium">Valuation approval required</span>
            <select class="input w-full mt-1" disabled>
              <option>Yes</option>
            </select>
          </label>
        </div>
      </div>
    `;
  }

  function renderWorkspace() {
    const host = $("#ias41Workspace");
    if (!host) return;

    const tab =
      tabs.find((item) => item.id === state.activeTab) ||
      tabs[0];

    const actions = stubActions(tab.id);

    const body =
      tab.id === "dashboard"
        ? renderDashboardStub()
        : tab.id === "settings"
          ? renderSettingsStub()
          : renderStubTable(tab);

    host.innerHTML = `
      <section data-ias41-pane="${escapeHtml(tab.id)}">
        <div class="card p-4 mb-4">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xl">${tab.icon}</span>
                <h3 class="text-lg font-bold">${escapeHtml(tab.title)}</h3>
              </div>

              <p class="text-sm text-slate-500 mt-1">
                ${escapeHtml(tab.description)}
              </p>
            </div>

            <div class="flex items-center gap-2 flex-wrap">
              ${actions
                .map(
                  ([label, target]) => `
                    <button
                      type="button"
                      class="btn"
                      data-ias41-action="${escapeHtml(label)}"
                      ${
                        target
                          ? `data-ias41-open-tab="${escapeHtml(target)}"`
                          : ""
                      }
                    >
                      ${escapeHtml(label)}
                    </button>
                  `
                )
                .join("")}
            </div>
          </div>
        </div>

        ${body}
      </section>
    `;
  }

  function openTab(tabId) {
    const next = validTab(tabId) ? tabId : "dashboard";

    state.activeTab = next;
    storeTab(next);

    renderTabs();
    renderWorkspace();
  }

  function bindEvents() {
    const app = $("#ias41App");
    if (!app || app.dataset.bound === "1") return;

    app.dataset.bound = "1";

    app.addEventListener("click", async (event) => {
      const tabButton = event.target.closest("[data-ias41-tab]");

      if (tabButton) {
        openTab(tabButton.dataset.ias41Tab);
        return;
      }

      const tabLink = event.target.closest("[data-ias41-open-tab]");

      if (tabLink) {
        openTab(tabLink.dataset.ias41OpenTab);
        return;
      }

      if (event.target.closest("#ias41RefreshBtn")) {
        await refresh();
        return;
      }

      if (event.target.closest("#ias41ValidateMappingsBtn")) {
        alert(
          "Account mapping validation will be connected during Phase 0."
        );
        return;
      }

      const action = event.target.closest("[data-ias41-action]");

      if (action && !action.dataset.ias41OpenTab) {
        alert(
          `${action.dataset.ias41Action} will be implemented in its relevant phase.`
        );
      }
    });
  }

  function loadLocalCoa() {
    const candidates = [
      window.COA_CACHE,
      window.COMPANY_COA,
      window.CHART_OF_ACCOUNTS,
      window.COA,
    ];

    const accounts = candidates.find(Array.isArray) || [];

    state.coa = accounts.filter(
      (account) =>
        account &&
        account.posting !== false &&
        account.is_posting !== false &&
        account.active !== false &&
        account.is_active !== false
    );
  }

  async function refresh() {
    if (state.loading) return;

    state.loading = true;
    setStatus("Checking setup…", "loading");

    try {
      state.companyId = getCompanyId();
      state.company = getCompany();

      loadLocalCoa();

      const companyBadge = $("#ias41CompanyBadge");

      if (companyBadge) {
        companyBadge.textContent = companyName();
      }

      setStatus(
        state.coa.length
          ? `${state.coa.length} posting accounts available`
          : "COA mapping required",
        state.coa.length ? "ready" : "warning"
      );

      renderWorkspace();
    } catch (error) {
      console.error("[IAS41] refresh failed:", error);
      setStatus("Setup check failed", "error");
    } finally {
      state.loading = false;
    }
  }

  async function bindIAS41Screen() {
    state.companyId = getCompanyId();
    state.company = getCompany();

    const storedTab = getStoredTab();
    state.activeTab = validTab(storedTab)
      ? storedTab
      : "dashboard";

    bindEvents();
    renderTabs();
    renderWorkspace();
    await refresh();

    state.bound = true;
  }

  window.bindIAS41Screen = bindIAS41Screen;
  window.openIAS41Tab = openTab;
  window.refreshIAS41Screen = refresh;
  window.IAS41_STATE = state;
})();