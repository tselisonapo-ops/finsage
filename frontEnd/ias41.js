(function ias41Module() {
  "use strict";

  const TAB_KEY = "fs_ias41_active_tab";

  const state = {
    bound: false,
    loading: false,
    activeTab: "dashboard",
    companyId: null,
    company: null,

    dashboard: {},
    settings: {},
    coa: [],
    mappings: [],
    locations: [],
    seasons: [],
    assetClasses: [],
    products: [],
    inventoryItems: [],
    batches: [],
    biologicalAssets: [],

    acquisitions: [],
    activeAcquisition: null,
    acquisitionPreview: null,
    growthEvents: [],
    healthEvents: [],
    activeEvent: null,
    eventPreview: null,
    valuations: [],
    activeValuation: null,
    valuationPreview: null,
    harvests: [],
    activeHarvest: null,
    harvestPreview: null,
    grants: [],
    activeGrant: null,
    grantPreview: null,
    reportRuns:[],
    reportData:null,
    activeReport:"biological_asset_register",
    reportFilters:{
      date_from:"",
      date_to:"",
      as_of:"",
      asset_class_id:"",
      location_id:"",
    },
  };

  const tabs = [
    ["dashboard", "📊", "Dashboard"],
    ["biological-assets", "🐄", "Biological Assets"],
    ["asset-classes", "🗂️", "Asset Classes"],
    ["products", "🌽", "Products"],
    ["locations", "📍", "Locations"],
    ["batches", "🏷️", "Batches"],
    ["acquisition", "➕", "Acquisition"],
    ["growth", "🌱", "Growth"],
    ["health", "🩺", "Health"],
    ["valuations", "⚖️", "Valuations"],
    ["harvest", "🧺", "Harvest"],
    ["government-grants", "🏛️", "Government Grants"],
    ["reports", "📑", "Reports"],
    ["settings", "⚙️", "Settings"],
  ];

  const mappingRoles = [
    ["ias41_biological_asset_current", "Current biological assets"],
    ["ias41_biological_asset_noncurrent", "Non-current biological assets"],
    ["ias41_agricultural_produce_inventory", "Agricultural produce inventory"],
    ["ias41_fair_value_gain", "Fair-value gain"],
    ["ias41_fair_value_loss", "Fair-value loss"],
    ["ias41_costs_to_sell", "Costs to sell"],
    ["ias41_mortality_loss", "Mortality loss"],
    ["ias41_government_grant_receivable", "Government grant receivable"],
    ["ias41_government_grant_income", "Government grant income"],
    ["ias41_agricultural_sales", "Agricultural sales"],
    ["cash_bank", "Cash and bank"],
    ["ap", "Accounts payable"],
    ["ar", "Accounts receivable"],
  ];

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const esc = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const n = (value) =>
    Number(value || 0);

  const money = (value) =>
    n(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  function companyId() {
    return Number(
      window.getActiveCompanyId?.() ||
      window.CURRENT_COMPANY_ID ||
      window.CURRENT_COMPANY?.id ||
      0
    ) || null;
  }

  function companyName() {
    const c = window.CURRENT_COMPANY || state.company || {};

    return (
      c.legal_name ||
      c.company_name ||
      c.name ||
      (state.companyId
        ? `Company ${state.companyId}`
        : "No company selected")
    );
  }

  function endpoint(name, id = null) {
    const api = window.ENDPOINTS?.ias41;

    if (!api?.[name]) {
      throw new Error(`Missing IAS 41 endpoint: ${name}`);
    }

    return id == null
      ? api[name](state.companyId)
      : api[name](state.companyId, id);
  }

  function eventActionUrl(eventId, action) {
    return window.ENDPOINTS.ias41.eventAction(
      state.companyId,
      eventId,
      action
    );
  }

  function valuationActionUrl(id, action) {
    return window.ENDPOINTS.ias41.valuationAction(
      state.companyId,
      id,
      action
    );
  }

  function harvestActionUrl(id, action) {
    return window.ENDPOINTS.ias41.harvestAction(
      state.companyId,
      id,
      action
    );
  }

  function reportUrl(reportKey,params={}) {
    return window.ENDPOINTS.ias41.report(
      state.companyId,
      reportKey,
      params
    );
  }

  function grantActionUrl(id,action) {
    return window.ENDPOINTS.ias41.grantAction(state.companyId,id,action);
  }

  function grantReceiptActionUrl(id,action) {
    return window.ENDPOINTS.ias41.grantReceiptAction(state.companyId,id,action);
  }

  async function api(url, options = {}) {
    return window.apiFetch(url, options);
  }

  function toast(message, type = "success") {
    if (typeof window.showToast === "function") {
      window.showToast(message, type);
      return;
    }

    alert(message);
  }

  function setStatus(message) {
    const el = $("#ias41SetupBadge");
    if (el) el.textContent = message;
  }

  function activeMapping(role) {
    return state.mappings.find(
      (row) =>
        row.mapping_scope === "company" &&
        row.role_code === role &&
        row.is_active !== false
    );
  }

  function accountOptions(selected = "") {
    return [
      `<option value="">Select account</option>`,
      ...state.coa.map((row) => `
        <option
          value="${esc(row.code)}"
          ${String(row.code) === String(selected) ? "selected" : ""}
        >
          ${esc(row.name)}
        </option>
      `),
    ].join("");
  }

  function selectOptions(
    rows,
    valueKey,
    labelFn,
    selected = "",
    placeholder = "Select",
  ) {
    return [
      `<option value="">${esc(placeholder)}</option>`,
      ...rows.map((row) => `
        <option
          value="${esc(row[valueKey])}"
          ${String(row[valueKey]) === String(selected) ? "selected" : ""}
        >
          ${esc(labelFn(row))}
        </option>
      `),
    ].join("");
  }

  function field(name, label, value = "", options = {}) {
    const {
      type = "text",
      required = false,
      step = "",
      choices = null,
      placeholder = "",
      disabled = false,
      col = "",
    } = options;

    const attrs = [
      `name="${esc(name)}"`,
      `id="ias41Field_${esc(name)}"`,
      required ? "required" : "",
      step ? `step="${esc(step)}"` : "",
      placeholder ? `placeholder="${esc(placeholder)}"` : "",
      disabled ? "disabled" : "",
    ].filter(Boolean).join(" ");

    let control;

    if (choices) {
      control = `
        <select class="input w-full mt-1" ${attrs}>
          ${choices}
        </select>
      `;
    } else if (type === "textarea") {
      control = `
        <textarea
          class="input w-full mt-1 min-h-[90px]"
          ${attrs}
        >${esc(value)}</textarea>
      `;
    } else if (type === "checkbox") {
      control = `
        <label class="flex items-center gap-2 mt-2">
          <input
            type="checkbox"
            name="${esc(name)}"
            ${value ? "checked" : ""}
          >
          <span>Enabled</span>
        </label>
      `;
    } else {
      control = `
        <input
          class="input w-full mt-1"
          type="${esc(type)}"
          value="${esc(value)}"
          ${attrs}
        >
      `;
    }

    return `
      <label class="block ${col}">
        <span class="text-sm font-medium">
          ${esc(label)}
          ${required ? '<span class="text-red-500">*</span>' : ""}
        </span>
        ${control}
      </label>
    `;
  }

  function formData(form) {
    const out = {};

    form.querySelectorAll("[name]").forEach((el) => {
      if (el.type === "checkbox") {
        out[el.name] = el.checked;
      } else {
        out[el.name] = el.value === ""
          ? null
          : el.value;
      }
    });

    return out;
  }

  function openModal(title, body, onSubmit) {
    const host = $("#ias41ModalHost");
    if (!host) return;

    host.classList.remove("hidden");
    host.setAttribute("aria-hidden", "false");

    host.innerHTML = `
      <div class="absolute inset-0 bg-black/40" data-ias41-close-modal></div>

      <div class="absolute inset-0 overflow-y-auto p-4">
        <div class="card max-w-4xl mx-auto p-5 relative">
          <div class="flex items-start justify-between gap-3">
            <h3 class="text-lg font-bold">${esc(title)}</h3>

            <button
              type="button"
              class="btn"
              data-ias41-close-modal
            >
              Close
            </button>
          </div>

          <form id="ias41ModalForm" class="mt-4">
            ${body}

            <div class="flex justify-end gap-2 mt-5">
              <button
                type="button"
                class="btn"
                data-ias41-close-modal
              >
                Cancel
              </button>

              <button
                type="submit"
                class="btn btn-primary"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    host.querySelectorAll("[data-ias41-close-modal]")
      .forEach((button) => {
        button.addEventListener("click", closeModal);
      });

    $("#ias41ModalForm", host)?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const submit = event.currentTarget
          .querySelector('button[type="submit"]');

        submit.disabled = true;

        try {
          await onSubmit(formData(event.currentTarget));
          closeModal();
        } catch (error) {
          console.error("[IAS41] save failed", error);
          toast(error.message || "Save failed", "error");
        } finally {
          submit.disabled = false;
        }
      }
    );
  }

  function closeModal() {
    const host = $("#ias41ModalHost");
    if (!host) return;

    host.classList.add("hidden");
    host.setAttribute("aria-hidden", "true");
    host.innerHTML = "";
  }

  function renderTabs() {
    const host = $("#ias41Tabs");
    if (!host) return;

    host.innerHTML = tabs.map(([id, icon, label]) => `
      <button
        type="button"
        class="btn ${state.activeTab === id ? "active" : ""}"
        data-ias41-tab="${esc(id)}"
      >
        <span>${icon}</span>
        <span>${esc(label)}</span>
      </button>
    `).join("");
  }

  function table(headers, rows, empty = "No records found.") {
    return `
      <div class="overflow-x-auto border rounded-lg">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b text-left">
              ${headers.map((h) => `
                <th class="p-3">${esc(h)}</th>
              `).join("")}
            </tr>
          </thead>

          <tbody>
            ${rows.length
              ? rows.join("")
              : `
                <tr>
                  <td
                    class="p-8 text-center text-slate-500"
                    colspan="${headers.length}"
                  >
                    ${esc(empty)}
                  </td>
                </tr>
              `
            }
          </tbody>
        </table>
      </div>
    `;
  }

  function pageHeader(title, description, buttons = "") {
    return `
      <div class="card p-4 mb-4">
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 class="text-lg font-bold">${esc(title)}</h3>
            <p class="text-sm text-slate-500 mt-1">
              ${esc(description)}
            </p>
          </div>

          <div class="flex gap-2 flex-wrap">
            ${buttons}
          </div>
        </div>
      </div>
    `;
  }

  function actionButtons(type, id) {
    return `
      <div class="flex gap-2 justify-end">
        <button
          class="btn"
          type="button"
          data-ias41-edit="${esc(type)}"
          data-id="${esc(id)}"
        >
          Edit
        </button>

        <button
          class="btn"
          type="button"
          data-ias41-delete="${esc(type)}"
          data-id="${esc(id)}"
        >
          Deactivate
        </button>
      </div>
    `;
  }

  function renderDashboard() {
    const counts = state.dashboard.counts || {};
    const validation =
      state.dashboard.mapping_validation || {};

    return `
      ${pageHeader(
        "IAS 41 Dashboard",
        "Master-data readiness and biological-asset summary.",
        `
          <button class="btn" data-ias41-open-tab="settings">
            Review settings
          </button>
        `,
      )}

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        ${[
          ["Biological assets", counts.biological_asset_count || 0],
          ["Batches", counts.batch_count || 0],
          ["Asset classes", counts.asset_class_count || 0],
          ["Carrying amount", money(counts.carrying_amount)],
        ].map(([label, value]) => `
          <div class="card p-4">
            <div class="text-sm text-slate-500">${esc(label)}</div>
            <div class="text-2xl font-bold mt-1">${esc(value)}</div>
          </div>
        `).join("")}
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <div class="card p-4">
          <h4 class="font-bold">Master data</h4>

          <div class="space-y-2 mt-3 text-sm">
            <div class="flex justify-between">
              <span>Locations</span>
              <strong>${n(counts.location_count)}</strong>
            </div>
            <div class="flex justify-between">
              <span>Products</span>
              <strong>${n(counts.product_count)}</strong>
            </div>
            <div class="flex justify-between">
              <span>Account mappings</span>
              <strong>${n(counts.mapping_count)}</strong>
            </div>
          </div>
        </div>

        <div class="card p-4">
          <h4 class="font-bold">Accounting readiness</h4>

          <div class="mt-3">
            <span class="pill">
              ${validation.ready
                ? "Ready"
                : `${(validation.missing_roles || []).length} missing mappings`
              }
            </span>
          </div>

          ${(validation.missing_roles || []).length
            ? `
              <div class="text-sm mt-3 text-slate-600">
                ${validation.missing_roles.map((role) => `
                  <div>${esc(role)}</div>
                `).join("")}
              </div>
            `
            : ""
          }
        </div>
      </div>
    `;
  }

  function renderLocations() {
    const rows = state.locations.map((row) => `
      <tr class="border-b">
        <td class="p-3">${esc(row.location_code)}</td>
        <td class="p-3">${esc(row.location_name)}</td>
        <td class="p-3">${esc(row.location_type)}</td>
        <td class="p-3">${esc(row.parent_location_name || "—")}</td>
        <td class="p-3">${row.is_active ? "Active" : "Inactive"}</td>
        <td class="p-3">${actionButtons("location", row.id)}</td>
      </tr>
    `);

    return `
      ${pageHeader(
        "Agricultural Locations",
        "Farms, fields, camps, orchards, barns, ponds and other operating locations.",
        `<button class="btn" data-ias41-new="location">New location</button>`,
      )}

      ${table(
        ["Code", "Location", "Type", "Parent", "Status", ""],
        rows,
      )}
    `;
  }

  function renderAssetClasses() {
    const rows = state.assetClasses.map((row) => `
      <tr class="border-b">
        <td class="p-3">${esc(row.class_code)}</td>
        <td class="p-3">${esc(row.class_name)}</td>
        <td class="p-3">${esc(row.asset_nature)}</td>
        <td class="p-3">${esc(row.asset_purpose)}</td>
        <td class="p-3">${esc(row.current_noncurrent)}</td>
        <td class="p-3">${actionButtons("asset-class", row.id)}</td>
      </tr>
    `);

    return `
      ${pageHeader(
        "Biological Asset Classes",
        "Define measurement, tracking and default accounting for biological-asset groups.",
        `<button class="btn" data-ias41-new="asset-class">New asset class</button>`,
      )}

      ${table(
        ["Code", "Class", "Nature", "Purpose", "Classification", ""],
        rows,
      )}
    `;
  }

  function renderProducts() {
    const rows = state.products.map((row) => `
      <tr class="border-b">
        <td class="p-3">${esc(row.product_code)}</td>
        <td class="p-3">${esc(row.product_name)}</td>
        <td class="p-3">${esc(row.class_name || "—")}</td>
        <td class="p-3">${esc(row.quantity_unit || "—")}</td>
        <td class="p-3">${esc(row.inventory_item_name || "Not linked")}</td>
        <td class="p-3">${actionButtons("product", row.id)}</td>
      </tr>
    `);

    return `
      ${pageHeader(
        "Agricultural Products",
        "Map harvested produce to IAS 2 inventory and sales accounts.",
        `<button class="btn" data-ias41-new="product">New product</button>`,
      )}

      ${table(
        ["Code", "Product", "Asset class", "Unit", "Inventory item", ""],
        rows,
      )}
    `;
  }

  function renderBatches() {
    const rows = state.batches.map((row) => `
      <tr class="border-b">
        <td class="p-3">${esc(row.batch_code)}</td>
        <td class="p-3">${esc(row.batch_name || "—")}</td>
        <td class="p-3">${esc(row.class_name)}</td>
        <td class="p-3">${esc(row.location_name || "—")}</td>
        <td class="p-3">${money(row.current_quantity)}</td>
        <td class="p-3">${esc(row.status)}</td>
        <td class="p-3">${actionButtons("batch", row.id)}</td>
      </tr>
    `);

    return `
      ${pageHeader(
        "Biological Asset Batches",
        "Manage herds, flocks, crop blocks, orchards and other grouped populations.",
        `<button class="btn" data-ias41-new="batch">New batch</button>`,
      )}

      ${table(
        ["Code", "Batch", "Asset class", "Location", "Quantity", "Status", ""],
        rows,
      )}
    `;
  }

  function renderBiologicalAssets() {
    const rows = state.biologicalAssets.map((row) => `
      <tr class="border-b">
        <td class="p-3">${esc(row.asset_number)}</td>
        <td class="p-3">${esc(row.asset_name || "—")}</td>
        <td class="p-3">${esc(row.class_name)}</td>
        <td class="p-3">${esc(row.batch_code || "Individual")}</td>
        <td class="p-3">${esc(row.location_name || "—")}</td>
        <td class="p-3">${money(row.quantity)}</td>
        <td class="p-3">${esc(row.status)}</td>
        <td class="p-3">${actionButtons("asset", row.id)}</td>
      </tr>
    `);

    return `
      ${pageHeader(
        "Biological Assets",
        "Register individually tracked animals, plants and other biological assets.",
        `<button class="btn" data-ias41-new="asset">New biological asset</button>`,
      )}

      ${table(
        ["Number", "Asset", "Class", "Batch", "Location", "Quantity", "Status", ""],
        rows,
      )}
    `;
  }

  function renderSettings() {
    const s = state.settings || {};

    return `
      ${pageHeader(
        "IAS 41 Settings",
        "Measurement controls, seasons and company-level account mappings.",
      )}

      <div class="card p-4">
        <form id="ias41SettingsForm">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            ${field(
              "default_currency_code",
              "Currency",
              s.default_currency_code || "",
            )}

            ${field(
              "default_quantity_unit",
              "Quantity unit",
              s.default_quantity_unit || "",
            )}

            ${field(
              "default_weight_unit",
              "Weight unit",
              s.default_weight_unit || "",
            )}

            ${field(
              "default_area_unit",
              "Area unit",
              s.default_area_unit || "",
            )}

            ${field(
              "quantity_precision",
              "Quantity precision",
              s.quantity_precision ?? 2,
              { type: "number", step: "1" },
            )}

            ${field(
              "monetary_precision",
              "Monetary precision",
              s.monetary_precision ?? 2,
              { type: "number", step: "1" },
            )}
          </div>

          <div class="flex justify-end mt-4">
            <button class="btn" type="submit">
              Save settings
            </button>
          </div>
        </form>
      </div>

      <div class="card p-4 mt-4">
        <div class="flex justify-between gap-3 flex-wrap">
          <h4 class="font-bold">Company account mappings</h4>

          <button class="btn" id="ias41ValidateMappingsBtn">
            Validate mappings
          </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
          ${mappingRoles.map(([role, label]) => {
            const mapping = activeMapping(role);

            return `
              <label class="block">
                <span class="text-sm font-medium">${esc(label)}</span>

                <select
                  class="input w-full mt-1"
                  data-ias41-mapping-role="${esc(role)}"
                >
                  ${accountOptions(mapping?.account_code || "")}
                </select>
              </label>
            `;
          }).join("")}
        </div>
      </div>

      <div class="card p-4 mt-4">
        <div class="flex justify-between gap-3 flex-wrap">
          <h4 class="font-bold">Agricultural seasons</h4>

          <button class="btn" data-ias41-new="season">
            New season
          </button>
        </div>

        <div class="mt-4">
          ${table(
            ["Code", "Season", "Start", "End", "Status", ""],
            state.seasons.map((row) => `
              <tr class="border-b">
                <td class="p-3">${esc(row.season_code)}</td>
                <td class="p-3">${esc(row.season_name)}</td>
                <td class="p-3">${esc(row.start_date)}</td>
                <td class="p-3">${esc(row.end_date)}</td>
                <td class="p-3">${esc(row.status)}</td>
                <td class="p-3">${actionButtons("season", row.id)}</td>
              </tr>
            `),
          )}
        </div>
      </div>
    `;
  }

  function renderFuturePhase(tabId) {
    const tab = tabs.find(([id]) => id === tabId);

    return `
      ${pageHeader(
        tab?.[2] || "IAS 41",
        "This workspace will be activated in its scheduled IAS 41 phase.",
      )}

      <div class="card p-8 text-center text-slate-500">
        Phase 1 master data is active. This transaction workspace is not active yet.
      </div>
    `;
  }

  function renderWorkspace() {
    const host = $("#ias41Workspace");
    if (!host) return;

    const renderers = {
      dashboard: renderDashboard,
      "biological-assets": renderBiologicalAssets,
      "asset-classes": renderAssetClasses,
      products: renderProducts,
      locations: renderLocations,
      batches: renderBatches,
      acquisition: renderAcquisitions,
      growth: () => renderEvents("growth"),
      health: () => renderEvents("health"),
      valuations: renderValuations,
      harvest: renderHarvests,
      "government-grants": renderGovernmentGrants,
      reports:renderReports,
      settings: renderSettings,
    };

    host.innerHTML = (
      renderers[state.activeTab]
        ? renderers[state.activeTab]()
        : renderFuturePhase(state.activeTab)
    );

    bindWorkspaceEvents();
  }

  function locationModal(row = {}) {
    openModal(
      row.id ? "Edit location" : "New location",
      `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${field("location_code", "Code", row.location_code, { required: true })}
          ${field("location_name", "Name", row.location_name, { required: true })}

          ${field(
            "location_type",
            "Type",
            row.location_type || "farm",
            {
              choices: [
                "farm", "field", "crop_block", "orchard", "plantation",
                "camp", "paddock", "barn", "stable", "poultry_house",
                "greenhouse", "nursery", "pond", "tank", "hatchery",
                "apiary", "warehouse", "other",
              ].map((v) => `
                <option value="${v}" ${row.location_type === v ? "selected" : ""}>
                  ${esc(v.replaceAll("_", " "))}
                </option>
              `).join(""),
            },
          )}

          ${field(
            "parent_location_id",
            "Parent location",
            row.parent_location_id,
            {
              choices: selectOptions(
                state.locations.filter((x) => x.id !== row.id),
                "id",
                (x) => `${x.location_code} — ${x.location_name}`,
                row.parent_location_id,
                "No parent",
              ),
            },
          )}

          ${field("area_value", "Area", row.area_value, { type: "number", step: "0.000001" })}
          ${field("area_unit", "Area unit", row.area_unit)}
          ${field("city", "City / town", row.city)}
          ${field("district", "District", row.district)}
          ${field("description", "Description", row.description, { type: "textarea", col: "md:col-span-2" })}
        </div>
      `,
      async (payload) => {
        await api(
          row.id
            ? endpoint("location", row.id)
            : endpoint("locations"),
          {
            method: row.id ? "PATCH" : "POST",
            body: JSON.stringify(payload),
          },
        );

        await refresh();
        toast("Location saved.");
      },
    );
  }

  function seasonModal(row = {}) {
    openModal(
      row.id ? "Edit season" : "New season",
      `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${field("season_code", "Code", row.season_code, { required: true })}
          ${field("season_name", "Name", row.season_name, { required: true })}
          ${field("start_date", "Start date", row.start_date, { type: "date", required: true })}
          ${field("end_date", "End date", row.end_date, { type: "date", required: true })}
          ${field(
            "season_type",
            "Type",
            row.season_type || "general",
            {
              choices: [
                "general", "planting", "growing", "breeding",
                "production", "harvesting", "financial",
              ].map((v) => `
                <option value="${v}" ${row.season_type === v ? "selected" : ""}>
                  ${esc(v)}
                </option>
              `).join(""),
            },
          )}
          ${field(
            "status",
            "Status",
            row.status || "planned",
            {
              choices: ["planned", "open", "closed", "cancelled"]
                .map((v) => `
                  <option value="${v}" ${row.status === v ? "selected" : ""}>
                    ${esc(v)}
                  </option>
                `).join(""),
            },
          )}
          ${field("description", "Description", row.description, { type: "textarea", col: "md:col-span-2" })}
        </div>
      `,
      async (payload) => {
        await api(
          row.id
            ? endpoint("season", row.id)
            : endpoint("seasons"),
          {
            method: row.id ? "PATCH" : "POST",
            body: JSON.stringify(payload),
          },
        );

        await refresh();
        toast("Season saved.");
      },
    );
  }

  function assetClassModal(row = {}) {
    openModal(
      row.id ? "Edit asset class" : "New asset class",
      `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${field("class_code", "Code", row.class_code, { required: true })}
          ${field("class_name", "Name", row.class_name, { required: true })}

          ${field(
            "asset_nature",
            "Nature",
            row.asset_nature || "animal",
            {
              choices: ["animal", "plant", "aquatic", "insect", "wildlife", "other"]
                .map((v) => `
                  <option value="${v}" ${row.asset_nature === v ? "selected" : ""}>
                    ${esc(v)}
                  </option>
                `).join(""),
            },
          )}

          ${field(
            "asset_purpose",
            "Purpose",
            row.asset_purpose || "consumable",
            {
              choices: ["consumable", "bearer_animal", "bearer_plant", "dual_purpose", "produce"]
                .map((v) => `
                  <option value="${v}" ${row.asset_purpose === v ? "selected" : ""}>
                    ${esc(v.replaceAll("_", " "))}
                  </option>
                `).join(""),
            },
          )}

          ${field(
            "current_noncurrent",
            "Classification",
            row.current_noncurrent || "current",
            {
              choices: ["current", "noncurrent"]
                .map((v) => `
                  <option value="${v}" ${row.current_noncurrent === v ? "selected" : ""}>
                    ${esc(v)}
                  </option>
                `).join(""),
            },
          )}

          ${field("agricultural_activity", "Agricultural activity", row.agricultural_activity)}
          ${field("default_quantity_unit", "Quantity unit", row.default_quantity_unit)}
          ${field("default_weight_unit", "Weight unit", row.default_weight_unit)}

          ${field(
            "biological_asset_account_code",
            "Biological asset account",
            row.biological_asset_account_code,
            { choices: accountOptions(row.biological_asset_account_code) },
          )}

          ${field(
            "produce_inventory_account_code",
            "Produce inventory account",
            row.produce_inventory_account_code,
            { choices: accountOptions(row.produce_inventory_account_code) },
          )}

          ${field(
            "fair_value_gain_account_code",
            "Fair-value gain account",
            row.fair_value_gain_account_code,
            { choices: accountOptions(row.fair_value_gain_account_code) },
          )}

          ${field(
            "fair_value_loss_account_code",
            "Fair-value loss account",
            row.fair_value_loss_account_code,
            { choices: accountOptions(row.fair_value_loss_account_code) },
          )}

          ${field(
            "costs_to_sell_account_code",
            "Costs-to-sell account",
            row.costs_to_sell_account_code,
            { choices: accountOptions(row.costs_to_sell_account_code) },
          )}

          ${field(
            "mortality_loss_account_code",
            "Mortality-loss account",
            row.mortality_loss_account_code,
            { choices: accountOptions(row.mortality_loss_account_code) },
          )}

          ${field("description", "Description", row.description, { type: "textarea", col: "md:col-span-2" })}
        </div>
      `,
      async (payload) => {
        payload.track_individually = !!row.track_individually;
        payload.allow_batch_tracking = row.allow_batch_tracking !== false;
        payload.produce_within_ias41 = row.produce_within_ias41 !== false;
        payload.is_bearer_plant = !!row.is_bearer_plant;

        await api(
          row.id
            ? endpoint("assetClass", row.id)
            : endpoint("assetClasses"),
          {
            method: row.id ? "PATCH" : "POST",
            body: JSON.stringify(payload),
          },
        );

        await refresh();
        toast("Asset class saved.");
      },
    );
  }

  function productModal(row = {}) {
    openModal(
      row.id ? "Edit agricultural product" : "New agricultural product",
      `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${field("product_code", "Code", row.product_code, { required: true })}
          ${field("product_name", "Name", row.product_name, { required: true })}

          ${field(
            "asset_class_id",
            "Source asset class",
            row.asset_class_id,
            {
              choices: selectOptions(
                state.assetClasses,
                "id",
                (x) => `${x.class_code} — ${x.class_name}`,
                row.asset_class_id,
                "Select class",
              ),
            },
          )}

          ${field(
            "inventory_item_id",
            "Inventory item",
            row.inventory_item_id,
            {
              choices: selectOptions(
                state.inventoryItems,
                "id",
                (x) => `${x.sku || ""} ${x.name}`.trim(),
                row.inventory_item_id,
                "Not linked",
              ),
            },
          )}

          ${field("quantity_unit", "Quantity unit", row.quantity_unit)}
          ${field("weight_unit", "Weight unit", row.weight_unit)}

          ${field(
            "inventory_account_code",
            "Inventory account",
            row.inventory_account_code,
            { choices: accountOptions(row.inventory_account_code) },
          )}

          ${field(
            "sales_account_code",
            "Sales account",
            row.sales_account_code,
            { choices: accountOptions(row.sales_account_code) },
          )}

          ${field(
            "cost_of_sales_account_code",
            "Cost-of-sales account",
            row.cost_of_sales_account_code,
            { choices: accountOptions(row.cost_of_sales_account_code) },
          )}

          ${field("description", "Description", row.description, { type: "textarea", col: "md:col-span-2" })}
        </div>
      `,
      async (payload) => {
        payload.product_type = row.product_type || "agricultural_produce";
        payload.harvest_measurement_basis =
          row.harvest_measurement_basis ||
          "fair_value_less_costs_to_sell";

        await api(
          row.id
            ? endpoint("product", row.id)
            : endpoint("products"),
          {
            method: row.id ? "PATCH" : "POST",
            body: JSON.stringify(payload),
          },
        );

        await refresh();
        toast("Product saved.");
      },
    );
  }

  function batchModal(row = {}) {
    openModal(
      row.id ? "Edit biological batch" : "New biological batch",
      `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${field("batch_code", "Code", row.batch_code, { required: true })}
          ${field("batch_name", "Name", row.batch_name)}

          ${field(
            "asset_class_id",
            "Asset class",
            row.asset_class_id,
            {
              required: true,
              choices: selectOptions(
                state.assetClasses,
                "id",
                (x) => `${x.class_code} — ${x.class_name}`,
                row.asset_class_id,
                "Select class",
              ),
            },
          )}

          ${field(
            "location_id",
            "Location",
            row.location_id,
            {
              choices: selectOptions(
                state.locations,
                "id",
                (x) => `${x.location_code} — ${x.location_name}`,
                row.location_id,
                "Select location",
              ),
            },
          )}

          ${field(
            "season_id",
            "Season",
            row.season_id,
            {
              choices: selectOptions(
                state.seasons,
                "id",
                (x) => `${x.season_code} — ${x.season_name}`,
                row.season_id,
                "Select season",
              ),
            },
          )}

          ${field(
            "batch_type",
            "Batch type",
            row.batch_type || "population",
            {
              choices: [
                "herd", "flock", "crop_block", "plantation", "orchard",
                "aquaculture_stock", "colony", "wildlife_population",
                "population", "other",
              ].map((v) => `
                <option value="${v}" ${row.batch_type === v ? "selected" : ""}>
                  ${esc(v.replaceAll("_", " "))}
                </option>
              `).join(""),
            },
          )}

          ${field("start_date", "Start date", row.start_date, { type: "date" })}
          ${field("expected_harvest_date", "Expected harvest", row.expected_harvest_date, { type: "date" })}
          ${field("opening_quantity", "Opening quantity", row.opening_quantity ?? 0, { type: "number", step: "0.000001" })}
          ${field("current_quantity", "Current quantity", row.current_quantity ?? row.opening_quantity ?? 0, { type: "number", step: "0.000001" })}
          ${field("quantity_unit", "Quantity unit", row.quantity_unit)}
          ${field("opening_fair_value", "Opening fair value", row.opening_fair_value ?? 0, { type: "number", step: "0.01" })}
          ${field("opening_costs_to_sell", "Opening costs to sell", row.opening_costs_to_sell ?? 0, { type: "number", step: "0.01" })}

          ${field(
            "status",
            "Status",
            row.status || "active",
            {
              choices: [
                "planned", "active", "immature", "mature",
                "harvested", "sold", "transferred",
                "closed", "cancelled",
              ].map((v) => `
                <option value="${v}" ${row.status === v ? "selected" : ""}>
                  ${esc(v)}
                </option>
              `).join(""),
            },
          )}

          ${field("description", "Description", row.description, { type: "textarea", col: "md:col-span-2" })}
        </div>
      `,
      async (payload) => {
        await api(
          row.id
            ? endpoint("batch", row.id)
            : endpoint("batches"),
          {
            method: row.id ? "PATCH" : "POST",
            body: JSON.stringify(payload),
          },
        );

        await refresh();
        toast("Batch saved.");
      },
    );
  }

  function assetModal(row = {}) {
    openModal(
      row.id ? "Edit biological asset" : "New biological asset",
      `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${field("asset_number", "Asset number", row.asset_number, { required: true })}
          ${field("asset_name", "Asset name", row.asset_name)}

          ${field(
            "asset_class_id",
            "Asset class",
            row.asset_class_id,
            {
              required: true,
              choices: selectOptions(
                state.assetClasses,
                "id",
                (x) => `${x.class_code} — ${x.class_name}`,
                row.asset_class_id,
                "Select class",
              ),
            },
          )}

          ${field(
            "batch_id",
            "Batch",
            row.batch_id,
            {
              choices: selectOptions(
                state.batches,
                "id",
                (x) => `${x.batch_code} — ${x.batch_name || x.class_name}`,
                row.batch_id,
                "Individual asset",
              ),
            },
          )}

          ${field(
            "location_id",
            "Location",
            row.location_id,
            {
              choices: selectOptions(
                state.locations,
                "id",
                (x) => `${x.location_code} — ${x.location_name}`,
                row.location_id,
                "Select location",
              ),
            },
          )}

          ${field("identification_value", "Tag / identification", row.identification_value)}
          ${field("birth_or_planting_date", "Birth / planting date", row.birth_or_planting_date, { type: "date" })}
          ${field("acquisition_date", "Acquisition date", row.acquisition_date, { type: "date" })}
          ${field("quantity", "Quantity", row.quantity ?? 1, { type: "number", step: "0.000001" })}
          ${field("quantity_unit", "Quantity unit", row.quantity_unit)}
          ${field("current_weight", "Current weight", row.current_weight, { type: "number", step: "0.000001" })}
          ${field("weight_unit", "Weight unit", row.weight_unit)}
          ${field("initial_fair_value", "Initial fair value", row.initial_fair_value ?? 0, { type: "number", step: "0.01" })}
          ${field("initial_costs_to_sell", "Initial costs to sell", row.initial_costs_to_sell ?? 0, { type: "number", step: "0.01" })}

          ${field(
            "status",
            "Status",
            row.status || "active",
            {
              choices: [
                "planned", "active", "immature", "mature",
                "harvested", "sold", "transferred",
                "deceased", "disposed", "closed", "cancelled",
              ].map((v) => `
                <option value="${v}" ${row.status === v ? "selected" : ""}>
                  ${esc(v)}
                </option>
              `).join(""),
            },
          )}

          ${field("description", "Description", row.description, { type: "textarea", col: "md:col-span-2" })}
        </div>
      `,
      async (payload) => {
        payload.identification_type =
          row.identification_type ||
          "tag";

        payload.ownership_status =
          row.ownership_status ||
          "owned";

        await api(
          row.id
            ? endpoint("biologicalAsset", row.id)
            : endpoint("biologicalAssets"),
          {
            method: row.id ? "PATCH" : "POST",
            body: JSON.stringify(payload),
          },
        );

        await refresh();
        toast("Biological asset saved.");
      },
    );
  }

  async function saveCompanyMapping(role, accountCode) {
    const existing = activeMapping(role);

    if (!accountCode) {
      if (existing) {
        await api(
          endpoint("mapping", existing.id),
          { method: "DELETE" },
        );
      }

      await refresh();
      return;
    }

    const payload = {
      role_code: role,
      account_code: accountCode,
      mapping_scope: "company",
      is_active: true,
    };

    await api(
      existing
        ? endpoint("mapping", existing.id)
        : endpoint("mappings"),
      {
        method: existing ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );

    await refresh();
  }

  async function deactivate(type, id) {
    const endpointMap = {
      location: "location",
      season: "season",
      "asset-class": "assetClass",
      product: "product",
      batch: "batch",
      asset: "biologicalAsset",
    };

    if (!confirm("Deactivate this record?")) return;

    await api(
      endpoint(endpointMap[type], id),
      { method: "DELETE" },
    );

    await refresh();
    toast("Record deactivated.");
  }

  function findRecord(type, id) {
    const sourceMap = {
      location: state.locations,
      season: state.seasons,
      "asset-class": state.assetClasses,
      product: state.products,
      batch: state.batches,
      asset: state.biologicalAssets,
    };

    return (sourceMap[type] || [])
      .find((row) => Number(row.id) === Number(id));
  }

  function openRecord(type, row = {}) {
    const map = {
      location: locationModal,
      season: seasonModal,
      "asset-class": assetClassModal,
      product: productModal,
      batch: batchModal,
      asset: assetModal,
    };

    map[type]?.(row);
  }

  function bindWorkspaceEvents() {
    const host = $("#ias41Workspace");
    if (!host) return;

    host.querySelectorAll("[data-ias41-new]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          openRecord(button.dataset.ias41New, {});
        });
      });

    host.querySelectorAll("[data-ias41-edit]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const type = button.dataset.ias41Edit;
          openRecord(
            type,
            findRecord(type, button.dataset.id) || {},
          );
        });
      });

    host.querySelectorAll("[data-ias41-delete]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          try {
            await deactivate(
              button.dataset.ias41Delete,
              button.dataset.id,
            );
          } catch (error) {
            toast(error.message || "Deactivate failed", "error");
          }
        });
      });

    host.querySelectorAll("[data-ias41-open-tab]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          openTab(button.dataset.ias41OpenTab);
        });
      });

    $("#ias41SettingsForm", host)?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const payload = formData(event.currentTarget);

        try {
          await api(endpoint("settings"), {
            method: "PATCH",
            body: JSON.stringify(payload),
          });

          await refresh();
          toast("IAS 41 settings saved.");
        } catch (error) {
          toast(error.message || "Settings save failed", "error");
        }
      }
    );

    host.querySelectorAll("[data-ias41-mapping-role]")
      .forEach((select) => {
        select.addEventListener("change", async () => {
          select.disabled = true;

          try {
            await saveCompanyMapping(
              select.dataset.ias41MappingRole,
              select.value,
            );
          } catch (error) {
            toast(error.message || "Mapping save failed", "error");
          } finally {
            select.disabled = false;
          }
        });
      });

    $("#ias41ValidateMappingsBtn", host)?.addEventListener(
      "click",
      async () => {
        try {
          const response = await api(
            endpoint("validateMappings")
          );

          const result = response.data || {};

          toast(
            result.ready
              ? "IAS 41 mappings are ready."
              : `${(result.missing_roles || []).length} required mappings are missing.`,
            result.ready ? "success" : "warning",
          );
        } catch (error) {
          toast(error.message || "Validation failed", "error");
        }
      }
    );
  
    $("#ias41NewAcquisitionBtn", host)
      ?.addEventListener(
        "click",
        () => acquisitionModal({})
      );

    host
      .querySelectorAll(
        "[data-ias41-acquisition-open]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          async () => {
            try {
              const acquisition =
                await loadAcquisition(
                  button.dataset
                    .ias41AcquisitionOpen
                );

              if (
                acquisition.status
                === "draft"
              ) {
                acquisitionModal(
                  acquisition
                );
              } else {
                await previewAcquisition(
                  acquisition.id
                );
              }
            } catch (error) {
              toast(
                error.message
                  || "Transaction load failed",
                "error",
              );
            }
          },
        );
      });

    host
      .querySelectorAll(
        "[data-ias41-acquisition-preview]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          async () => {
            try {
              await previewAcquisition(
                button.dataset
                  .ias41AcquisitionPreview
              );
            } catch (error) {
              toast(
                error.message
                  || "Preview failed",
                "error",
              );
            }
          },
        );
      });

    host
      .querySelectorAll(
        "[data-ias41-acquisition-approve]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          async () => {
            try {
              await approveAcquisition(
                button.dataset
                  .ias41AcquisitionApprove
              );
            } catch (error) {
              toast(
                error.message
                  || "Approval failed",
                "error",
              );
            }
          },
        );
      });

    host
      .querySelectorAll(
        "[data-ias41-acquisition-draft]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          async () => {
            try {
              await returnAcquisitionToDraft(
                button.dataset
                  .ias41AcquisitionDraft
              );
            } catch (error) {
              toast(
                error.message
                  || "Return to draft failed",
                "error",
              );
            }
          },
        );
      });

    host
      .querySelectorAll(
        "[data-ias41-acquisition-post]"
      )
      .forEach(function (button) {
        button.addEventListener(
          "click",
          async function () {
            button.disabled = true;

            try {
              await postAcquisition(
                button.getAttribute(
                  "data-ias41-acquisition-post"
                )
              );
            } catch (error) {
              console.error(
                "[IAS41] acquisition posting failed",
                error
              );

              toast(
                error.message ||
                "IAS 41 posting failed.",
                "error"
              );
            } finally {
              button.disabled = false;
            }
          }
        );
      });

    host.querySelectorAll("[data-ias41-new-event]").forEach(button => {
      button.addEventListener("click", () => {
        eventModal(button.dataset.ias41NewEvent, {});
      });
    });

    host.querySelectorAll("[data-ias41-event-open]").forEach(button => {
      button.addEventListener("click", async () => {
        try {
          const row = await loadEvent(button.dataset.ias41EventOpen);
          if (row.status === "draft") {
            const group = EVENT_GROUPS.health.includes(row.event_type)
              ? "health"
              : "growth";
            eventModal(group, row);
          } else {
            await previewEvent(row.id);
          }
        } catch (error) {
          toast(error.message || "Event load failed", "error");
        }
      });
    });

    host.querySelectorAll("[data-ias41-event-preview]").forEach(button => {
      button.addEventListener("click", async () => {
        try {
          await previewEvent(button.dataset.ias41EventPreview);
        } catch (error) {
          toast(error.message || "Event preview failed", "error");
        }
      });
    });

    host.querySelectorAll("[data-ias41-event-approve]").forEach(button => {
      button.addEventListener("click", async () => {
        try {
          await approveEvent(button.dataset.ias41EventApprove);
        } catch (error) {
          toast(error.message || "Event approval failed", "error");
        }
      });
    });

    host.querySelectorAll("[data-ias41-event-post]").forEach(button => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await postEvent(button.dataset.ias41EventPost);
        } catch (error) {
          toast(error.message || "Event posting failed", "error");
        } finally {
          button.disabled = false;
        }
      });
    });

    $("#ias41NewValuationBtn", host)?.addEventListener(
      "click",
      () => valuationModal({})
    );

    host.querySelectorAll("[data-ias41-valuation-open]").forEach(button => {
      button.addEventListener("click", async () => {
        try {
          const row = await loadValuation(button.dataset.ias41ValuationOpen);

          if (["draft", "calculated"].includes(row.status)) {
            valuationModal(row);
          } else {
            await previewValuation(row.id);
          }
        } catch (error) {
          toast(error.message || "Valuation load failed", "error");
        }
      });
    });

    host.querySelectorAll("[data-ias41-valuation-preview]").forEach(button => {
      button.addEventListener("click", async () => {
        try {
          await previewValuation(button.dataset.ias41ValuationPreview);
        } catch (error) {
          toast(error.message || "Valuation preview failed", "error");
        }
      });
    });

    host.querySelectorAll("[data-ias41-valuation-approve]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!confirm("Approve this valuation?")) return;

        try {
          await valuationAction(button.dataset.ias41ValuationApprove, "approve");
          toast("IAS 41 valuation approved.");
        } catch (error) {
          toast(error.message || "Valuation approval failed", "error");
        }
      });
    });

    host.querySelectorAll("[data-ias41-valuation-post]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!confirm("Post this valuation and update carrying amounts?")) return;

        button.disabled = true;
        try {
          const data = await valuationAction(
            button.dataset.ias41ValuationPost,
            "post"
          );
          toast(`Valuation posted. Journal ${data.journal_id} created.`);
        } catch (error) {
          toast(error.message || "Valuation posting failed", "error");
        } finally {
          button.disabled = false;
        }
      });
    });

    $("#ias41NewHarvestBtn",host)?.addEventListener(
      "click",
      ()=>harvestModal({})
    );

    host.querySelectorAll(
      "[data-ias41-harvest-open]"
    ).forEach(button=>{
      button.addEventListener("click",async()=>{
        try {
          const row=await loadHarvest(
            button.dataset.ias41HarvestOpen
          );

          if(["draft","calculated"].includes(row.status)) {
            harvestModal(row);
          } else {
            await previewHarvest(row.id);
          }
        } catch(error) {
          toast(
            error.message||"Harvest load failed",
            "error"
          );
        }
      });
    });

    host.querySelectorAll(
      "[data-ias41-harvest-preview]"
    ).forEach(button=>{
      button.addEventListener("click",async()=>{
        try {
          await previewHarvest(
            button.dataset.ias41HarvestPreview
          );
        } catch(error) {
          toast(
            error.message||"Harvest preview failed",
            "error"
          );
        }
      });
    });

    host.querySelectorAll(
      "[data-ias41-harvest-approve]"
    ).forEach(button=>{
      button.addEventListener("click",async()=>{
        if(!confirm("Approve this harvest?")) return;

        try {
          await harvestAction(
            button.dataset.ias41HarvestApprove,
            "approve"
          );

          toast("IAS 41 harvest approved.");
        } catch(error) {
          toast(
            error.message||"Harvest approval failed",
            "error"
          );
        }
      });
    });

    host.querySelectorAll(
      "[data-ias41-harvest-post]"
    ).forEach(button=>{
      button.addEventListener("click",async()=>{
        if(!confirm(
          "Post this harvest and transfer the produce to IAS 2 inventory?"
        )) return;

        button.disabled=true;

        try {
          const data=await harvestAction(
            button.dataset.ias41HarvestPost,
            "post"
          );

          const suffix=data.inventory_movement_id
            ?` Inventory movement ${data.inventory_movement_id} created.`
            :" Inventory GL transfer completed.";

          toast(
            `Harvest posted. Journal ${data.journal_id} created.${suffix}`
          );
        } catch(error) {
          toast(
            error.message||"Harvest posting failed",
            "error"
          );
        } finally {
          button.disabled=false;
        }
      });
    });

    $("#ias41NewGrantBtn",host)?.addEventListener(
      "click",
      ()=>grantModal({})
    );

    $("#ias41RunReportBtn",host)?.addEventListener(
      "click",
      async()=>{
        try {
          await runIas41Report(false);
        } catch(error) {
          toast(error.message||"IAS 41 report failed","error");
        }
      }
    );

    $("#ias41SaveReportSnapshotBtn",host)?.addEventListener(
      "click",
      async()=>{
        try {
          await runIas41Report(true);
        } catch(error) {
          toast(error.message||"Report snapshot failed","error");
        }
      }
    );

    host.querySelectorAll("[data-ias41-grant-open]").forEach(button=>{
      button.addEventListener("click",async()=>{
        try {
          const row=await loadGrant(button.dataset.ias41GrantOpen);

          if(row.status==="draft") grantModal(row);
          else if(row.status==="approved") await previewGrant(row.id);
          else grantReceiptModal(row);
        } catch(error) {
          toast(error.message||"Government grant load failed","error");
        }
      });
    });

    host.querySelectorAll("[data-ias41-grant-approve]").forEach(button=>{
      button.addEventListener("click",async()=>{
        if(!confirm("Approve this government grant?")) return;

        try {
          await grantAction(button.dataset.ias41GrantApprove,"approve");
          toast("Government grant approved.");
        } catch(error) {
          toast(error.message||"Grant approval failed","error");
        }
      });
    });

    host.querySelectorAll("[data-ias41-grant-preview]").forEach(button=>{
      button.addEventListener("click",async()=>{
        try {
          await previewGrant(button.dataset.ias41GrantPreview);
        } catch(error) {
          toast(error.message||"Grant preview failed","error");
        }
      });
    });

    host.querySelectorAll("[data-ias41-grant-recognise]").forEach(button=>{
      button.addEventListener("click",async()=>{
        if(!confirm("Recognise this government grant?")) return;

        button.disabled=true;

        try {
          const data=await grantAction(
            button.dataset.ias41GrantRecognise,
            "recognise"
          );

          toast(`Government grant recognised. Journal ${data.journal_id} created.`);
        } catch(error) {
          toast(error.message||"Grant recognition failed","error");
        } finally {
          button.disabled=false;
        }
      });
    });

    host.querySelectorAll("[data-ias41-grant-receipt]").forEach(button=>{
      button.addEventListener("click",async()=>{
        try {
          const grant=await loadGrant(button.dataset.ias41GrantReceipt);
          grantReceiptModal(grant);
        } catch(error) {
          toast(error.message||"Grant receipt setup failed","error");
        }
      });
    });
  }

  function openTab(tabId) {
    if (!tabs.some(([id]) => id === tabId)) {
      tabId = "dashboard";
    }

    state.activeTab = tabId;

    try {
      localStorage.setItem(TAB_KEY, tabId);
    } catch {}

    renderTabs();
    renderWorkspace();
  }

  function bindRootEvents() {
    const app = $("#ias41App");
    if (!app || app.dataset.bound === "1") return;

    app.dataset.bound = "1";

    app.addEventListener("click", async (event) => {
      const tab = event.target.closest("[data-ias41-tab]");

      if (tab) {
        openTab(tab.dataset.ias41Tab);
        return;
      }

      if (event.target.closest("#ias41RefreshBtn")) {
        await refresh();
      }
    });
  }

  async function loadEvents(name, group) {
    const response = await api(
      window.ENDPOINTS.ias41.events(state.companyId, { eventGroup: group })
    );
    state[name] = response.items || [];
  }

  async function loadList(name, endpointName) {
    const response = await api(endpoint(endpointName));
    state[name] = response.items || response.data || [];
  }

  async function refresh() {
    if (state.loading) return;

    state.loading = true;
    setStatus("Loading IAS 41…");

    try {
      state.companyId = companyId();
      state.company = window.CURRENT_COMPANY || null;

      if (!state.companyId) {
        throw new Error("No company selected.");
      }

      const companyBadge = $("#ias41CompanyBadge");
      if (companyBadge) {
        companyBadge.textContent = companyName();
      }

      const setup = await api(endpoint("setup"));
      const data = setup.data || {};

      state.dashboard = data.dashboard || {};
      state.settings = data.settings || {};
      state.mappings = data.mappings || [];
      state.coa = data.coa || [];
      state.assetClasses = data.asset_classes || [];
      state.products = data.products || [];
      state.locations = data.locations || [];
      state.seasons = data.seasons || [];

      await Promise.all([
        loadList("inventoryItems", "inventoryItems"),
        loadList("batches", "batches"),
        loadList("biologicalAssets", "biologicalAssets"),
        loadList("acquisitions", "acquisitions"),
        loadEvents("growthEvents", "growth"),
        loadEvents("healthEvents", "health"),
        loadList("valuations", "valuations"),
        loadList("harvests","harvests"),
        loadList("grants","grants"),
        loadList("reportRuns","reports"),
      ]);

      const validation =
        state.dashboard.mapping_validation || {};

      setStatus(
        validation.ready
          ? "IAS 41 ready"
          : "IAS 41 setup incomplete"
      );

      renderTabs();
      renderWorkspace();
    } catch (error) {
      console.error("[IAS41] refresh failed", error);
      setStatus("IAS 41 load failed");
      toast(error.message || "IAS 41 load failed", "error");
    } finally {
      state.loading = false;
    }
  }

  function acquisitionTypeLabel(value) {
    return String(value || "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) =>
        char.toUpperCase()
      );
  }

  function statusPill(status) {
    const text = String(status || "draft");

    return `
      <span class="pill">
        ${esc(acquisitionTypeLabel(text))}
      </span>
    `;
  }

  function emptyAcquisitionLine() {
    return {
      asset_class_id: "",
      product_id: "",
      location_id: "",
      season_id: "",
      tracking_method: "batch",

      proposed_batch_code: "",
      proposed_batch_name: "",

      proposed_asset_number: "",
      proposed_asset_name: "",

      identification_type: "",
      identification_value: "",
      biological_sex: "",

      birth_or_planting_date: "",
      expected_harvest_date: "",
      maturity_date: "",

      quantity: 1,
      quantity_unit: "",

      weight: "",
      weight_unit: "",

      fair_value_per_unit: 0,
      gross_fair_value: 0,

      costs_to_sell_per_unit: 0,
      costs_to_sell_amount: 0,

      carrying_amount: 0,
      purchase_price: 0,
      direct_cost_amount: 0,

      biological_asset_account_code: "",
      fair_value_gain_account_code: "",
      fair_value_loss_account_code: "",
      payable_account_code: "",
      cash_account_code: "",

      description: "",
    };
  }

  function acquisitionLineCalculate(line) {
    const quantity = Number(
      line.quantity || 0
    );

    const fairValuePerUnit = Number(
      line.fair_value_per_unit || 0
    );

    const costsPerUnit = Number(
      line.costs_to_sell_per_unit || 0
    );

    line.gross_fair_value = Number(
      (
        quantity
        * fairValuePerUnit
      ).toFixed(2)
    );

    line.costs_to_sell_amount = Number(
      (
        quantity
        * costsPerUnit
      ).toFixed(2)
    );

    line.carrying_amount = Number(
      (
        line.gross_fair_value
        - line.costs_to_sell_amount
      ).toFixed(2)
    );

    return line;
  }

  const EVENT_GROUPS = {
    growth: [
      "growth_measurement", "quantity_adjustment",
      "location_transfer", "maturity_change", "general_note"
    ],
    health: [
      "health_inspection", "treatment",
      "vaccination", "disease", "mortality"
    ]
  };

  function eventLabel(value) {
    return acquisitionTypeLabel(value);
  }

  function eventTargetLabel(row) {
    return row.batch_code
      ? `${row.batch_code} — ${row.batch_name || row.class_name}`
      : `${row.asset_number} — ${row.asset_name || row.class_name}`;
  }

  function renderEvents(group) {
    const items = group === "health" ? state.healthEvents : state.growthEvents;
    const title = group === "health" ? "Health and Mortality" : "Growth and Transformation";
    const description = group === "health"
      ? "Record inspections, treatments, disease incidents, vaccinations and mortality."
      : "Record growth, quantity, weight, maturity and location changes.";

    const rows = items.map(row => `
      <tr class="border-b">
        <td class="p-3">${esc(row.event_number)}</td>
        <td class="p-3">${esc(eventLabel(row.event_type))}</td>
        <td class="p-3">${esc(row.event_date)}</td>
        <td class="p-3">${esc(eventTargetLabel(row))}</td>
        <td class="p-3 text-right">${money(row.quantity_change)}</td>
        <td class="p-3">${statusPill(row.status)}</td>
        <td class="p-3">
          <div class="flex gap-2 justify-end flex-wrap">
            <button class="btn" data-ias41-event-open="${row.id}">Open</button>
            ${row.status === "draft" ? `
              <button class="btn" data-ias41-event-approve="${row.id}">Approve</button>
            ` : ""}
            ${row.status === "approved" ? `
              <button class="btn" data-ias41-event-preview="${row.id}">Preview</button>
              <button class="btn" data-ias41-event-post="${row.id}">Post</button>
            ` : ""}
          </div>
        </td>
      </tr>
    `);

    return `
      ${pageHeader(
        title,
        description,
        `<button class="btn" data-ias41-new-event="${group}">New event</button>`
      )}
      ${table(
        ["Event", "Type", "Date", "Target", "Quantity change", "Status", ""],
        rows,
        "No biological events found."
      )}
    `;
  }

  function eventModal(group, event) {
    event = event || {};
    const types = EVENT_GROUPS[group] || EVENT_GROUPS.growth;
    const targetType = event.batch_id ? "batch" : (
      event.biological_asset_id ? "asset" : "batch"
    );

    function targetOptions(type, selected) {
      const rows = type === "batch" ? state.batches : state.biologicalAssets;
      return selectOptions(
        rows,
        "id",
        row => type === "batch"
          ? `${row.batch_code} — ${row.batch_name || row.class_name}`
          : `${row.asset_number} — ${row.asset_name || row.class_name}`,
        selected,
        `Select ${type}`
      );
    }

    openModal(
      event.id ? "Edit biological event" : "New biological event",
      `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          ${field("event_number", "Event number", event.event_number || "", {
            placeholder: "Generated automatically"
          })}

          ${field("event_type", "Event type", event.event_type || types[0], {
            required: true,
            choices: types.map(value => `
              <option value="${value}" ${event.event_type === value ? "selected" : ""}>
                ${esc(eventLabel(value))}
              </option>
            `).join("")
          })}

          ${field("event_date", "Event date", event.event_date || new Date().toISOString().slice(0, 10), {
            type: "date", required: true
          })}

          ${field("target_type", "Target type", targetType, {
            choices: `
              <option value="batch" ${targetType === "batch" ? "selected" : ""}>Batch</option>
              <option value="asset" ${targetType === "asset" ? "selected" : ""}>Individual asset</option>
            `
          })}

          <label class="block md:col-span-2">
            <span class="text-sm font-medium">Target</span>
            <select class="input w-full mt-1" name="target_id" id="ias41EventTarget">
              ${targetOptions(
                targetType,
                targetType === "batch" ? event.batch_id : event.biological_asset_id
              )}
            </select>
          </label>

          ${field("quantity_change", "Quantity change", event.quantity_change || 0, {
            type: "number", step: "0.000001"
          })}

          ${field("weight_change", "Weight change", event.weight_change || 0, {
            type: "number", step: "0.000001"
          })}

          ${field("weight_unit", "Weight unit", event.weight_unit || "")}

          ${field("mortality_quantity", "Mortality quantity", event.mortality_quantity || 0, {
            type: "number", step: "0.000001"
          })}

          ${field(
            "carrying_amount_released",
            "Carrying amount released",
            event.carrying_amount_released || 0,
            { type: "number", step: "0.01" }
          )}

          ${field("destination_location_id", "Destination location", event.destination_location_id || "", {
            choices: selectOptions(
              state.locations,
              "id",
              row => `${row.location_code} — ${row.location_name}`,
              event.destination_location_id,
              "Select destination"
            )
          })}

          ${field("maturity_status_after", "New maturity status", event.maturity_status_after || "", {
            choices: `
              <option value="">No change</option>
              ${["active", "immature", "mature", "harvested", "closed"].map(value => `
                <option value="${value}" ${event.maturity_status_after === value ? "selected" : ""}>
                  ${esc(eventLabel(value))}
                </option>
              `).join("")}
            `
          })}

          ${field("health_status_after", "Health status", event.health_status_after || "", {
            choices: `
              <option value="">Not specified</option>
              ${["healthy", "under_observation", "sick", "recovering", "critical"].map(value => `
                <option value="${value}" ${event.health_status_after === value ? "selected" : ""}>
                  ${esc(eventLabel(value))}
                </option>
              `).join("")}
            `
          })}

          ${field("diagnosis", "Diagnosis", event.diagnosis || "")}
          ${field("treatment", "Treatment", event.treatment || "")}
          ${field("medicine", "Medicine", event.medicine || "")}
          ${field("dosage", "Dosage", event.dosage || "")}
          ${field("veterinarian", "Veterinarian", event.veterinarian || "")}
          ${field("next_review_date", "Next review", event.next_review_date || "", {
            type: "date"
          })}

          ${field("reference", "Reference", event.reference || "")}
          ${field("description", "Description", event.description || "", {
            type: "textarea", col: "md:col-span-3"
          })}
        </div>
      `,
      async payload => {
        const targetTypeValue = payload.target_type || "batch";
        payload.batch_id = targetTypeValue === "batch" ? payload.target_id : null;
        payload.biological_asset_id = targetTypeValue === "asset" ? payload.target_id : null;
        delete payload.target_type;
        delete payload.target_id;

        await api(
          event.id ? endpoint("event", event.id) : endpoint("events"),
          {
            method: event.id ? "PATCH" : "POST",
            body: JSON.stringify(payload)
          }
        );

        await refresh();
        toast("Biological event saved.");
      }
    );

    const typeSelect = $("#ias41Field_target_type");
    const targetSelect = $("#ias41EventTarget");

    if (typeSelect && targetSelect) {
      typeSelect.addEventListener("change", () => {
        targetSelect.innerHTML = targetOptions(typeSelect.value, "");
      });
    }
  }

  async function loadEvent(eventId) {
    const response = await api(endpoint("event", eventId));
    return response.data || {};
  }

  async function eventAction(eventId, action) {
    const response = await api(eventActionUrl(eventId, action), {
      method: "POST",
      body: JSON.stringify({})
    });
    await refresh();
    return response.data || {};
  }

  async function previewEvent(eventId) {
    const data = await eventAction(eventId, "preview");
    acquisitionPreviewModal({
      transaction_number: data.event_number,
      total_debit: data.total_debit,
      total_credit: data.total_credit,
      ready_to_post: data.ready_to_post,
      journal_lines: data.journal_lines || [],
      missing_mappings: data.missing_mappings || []
    });
  }

  async function approveEvent(eventId) {
    if (!confirm("Approve this biological event?")) return;
    await eventAction(eventId, "approve");
    toast("Biological event approved.");
  }

  async function postEvent(eventId) {
    if (!confirm("Post this biological event and update the biological register?")) return;
    const data = await eventAction(eventId, "post");
    toast(data.journal_id
      ? `Event posted. Journal ${data.journal_id} created.`
      : "Non-financial biological event posted."
    );
  }

function renderValuations() {
  const rows = state.valuations.map(row => `
    <tr class="border-b">
      <td class="p-3">${esc(row.run_number)}</td>
      <td class="p-3">${esc(row.valuation_date)}</td>
      <td class="p-3">${esc(eventLabel(row.valuation_method))}</td>
      <td class="p-3">${n(row.line_count)}</td>
      <td class="p-3 text-right">${money(row.total_previous_carrying_amount)}</td>
      <td class="p-3 text-right">${money(row.total_new_carrying_amount)}</td>
      <td class="p-3 text-right">${money(row.total_gain)}</td>
      <td class="p-3 text-right">${money(row.total_loss)}</td>
      <td class="p-3">${statusPill(row.status)}</td>
      <td class="p-3">
        <div class="flex gap-2 justify-end flex-wrap">
          <button class="btn" data-ias41-valuation-open="${row.id}">Open</button>
          ${row.status === "calculated" ? `
            <button class="btn" data-ias41-valuation-preview="${row.id}">Preview</button>
            <button class="btn" data-ias41-valuation-approve="${row.id}">Approve</button>
          ` : ""}
          ${row.status === "approved" ? `
            <button class="btn" data-ias41-valuation-preview="${row.id}">Preview</button>
            <button class="btn" data-ias41-valuation-post="${row.id}">Post</button>
          ` : ""}
        </div>
      </td>
    </tr>
  `);

  return `
    ${pageHeader(
      "Fair-value Valuations",
      "Measure biological assets at fair value less costs to sell.",
      `<button class="btn" id="ias41NewValuationBtn">New valuation</button>`
    )}
    ${table(
      [
        "Run","Date","Method","Lines","Previous value",
        "New value","Gain","Loss","Status",""
      ],
      rows,
      "No IAS 41 valuations found."
    )}
  `;
}

function emptyValuationLine() {
  return {
    target_type: "batch",
    target_id: "",
    fair_value_per_unit: 0,
    costs_to_sell_per_unit: 0,
    market_source: "",
    market_reference: "",
    observable_input: true,
    notes: ""
  };
}

function valuationModal(run) {
  run = run || {};
  let lines = (run.lines && run.lines.length ? run.lines : [
    emptyValuationLine()
  ]).map(line => ({
    ...emptyValuationLine(),
    ...line,
    target_type: line.batch_id ? "batch" : (
      line.biological_asset_id ? "asset" : "batch"
    ),
    target_id: line.batch_id || line.biological_asset_id || ""
  }));

  function targetOptions(line) {
    const rows = line.target_type === "asset"
      ? state.biologicalAssets
      : state.batches;

    return selectOptions(
      rows,
      "id",
      row => line.target_type === "asset"
        ? `${row.asset_number} — ${row.asset_name || row.class_name}`
        : `${row.batch_code} — ${row.batch_name || row.class_name}`,
      line.target_id,
      "Select target"
    );
  }

  function lineHtml(line, index) {
    return `
      <div class="card p-4" data-valuation-line="${index}">
        <div class="flex justify-between">
          <strong>Line ${index + 1}</strong>
          <button type="button" class="btn"
            data-remove-valuation-line="${index}">Remove</button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          ${field(`val_${index}_target_type`, "Target type", line.target_type, {
            choices: `
              <option value="batch" ${line.target_type === "batch" ? "selected" : ""}>Batch</option>
              <option value="asset" ${line.target_type === "asset" ? "selected" : ""}>Individual asset</option>
            `
          })}

          ${field(`val_${index}_target_id`, "Target", line.target_id, {
            required: true,
            choices: targetOptions(line)
          })}

          ${field(
            `val_${index}_fair_value_per_unit`,
            "Fair value per unit",
            line.fair_value_per_unit || 0,
            { type: "number", step: "0.000001", required: true }
          )}

          ${field(
            `val_${index}_costs_to_sell_per_unit`,
            "Costs to sell per unit",
            line.costs_to_sell_per_unit || 0,
            { type: "number", step: "0.000001" }
          )}

          ${field(`val_${index}_market_source`, "Market source", line.market_source || "")}
          ${field(`val_${index}_market_reference`, "Market reference", line.market_reference || "")}
          ${field(`val_${index}_notes`, "Notes", line.notes || "", {
            type: "textarea", col: "md:col-span-3"
          })}
        </div>
      </div>
    `;
  }

  function body() {
    return `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        ${field("run_number", "Run number", run.run_number || "", {
          placeholder: "Generated automatically"
        })}
        ${field("valuation_date", "Valuation date",
          run.valuation_date || new Date().toISOString().slice(0, 10),
          { type: "date", required: true }
        )}
        ${field("reporting_date", "Reporting date",
          run.reporting_date || run.valuation_date ||
          new Date().toISOString().slice(0, 10),
          { type: "date", required: true }
        )}
        ${field("valuation_method", "Method",
          run.valuation_method || "market_price", {
            choices: [
              "market_price","recent_transaction","sector_benchmark",
              "discounted_cash_flow","cost_approach","manual"
            ].map(value => `
              <option value="${value}" ${run.valuation_method === value ? "selected" : ""}>
                ${esc(eventLabel(value))}
              </option>
            `).join("")
          }
        )}
        ${field("currency_code", "Currency",
          run.currency_code || state.settings.default_currency_code || "USD"
        )}
        ${field("reference", "Reference", run.reference || "")}
        ${field("description", "Description", run.description || "", {
          type: "textarea", col: "md:col-span-3"
        })}
      </div>

      <div class="flex justify-between mt-5">
        <strong>Valuation lines</strong>
        <button type="button" class="btn" id="ias41AddValuationLine">
          Add line
        </button>
      </div>

      <div id="ias41ValuationLines" class="space-y-4 mt-3">
        ${lines.map(lineHtml).join("")}
      </div>
    `;
  }

  openModal(
    run.id ? "Edit valuation" : "New valuation",
    body(),
    async payload => {
      const form = $("#ias41ModalForm");

      payload.lines = lines.map((line, index) => {
        const read = name => form.elements[`val_${index}_${name}`]?.value || null;
        const targetType = read("target_type") || "batch";

        return {
          batch_id: targetType === "batch" ? read("target_id") : null,
          biological_asset_id: targetType === "asset" ? read("target_id") : null,
          fair_value_per_unit: read("fair_value_per_unit"),
          costs_to_sell_per_unit: read("costs_to_sell_per_unit"),
          market_source: read("market_source"),
          market_reference: read("market_reference"),
          notes: read("notes"),
          observable_input: true
        };
      });

      await api(
        run.id ? endpoint("valuation", run.id) : endpoint("valuations"),
        {
          method: run.id ? "PATCH" : "POST",
          body: JSON.stringify(payload)
        }
      );

      await refresh();
      toast("IAS 41 valuation saved.");
    }
  );

  function rebuild() {
    const host = $("#ias41ValuationLines");
    if (!host) return;
    host.innerHTML = lines.map(lineHtml).join("");
    bindLines();
  }

  function bindLines() {
    document.querySelectorAll("[data-remove-valuation-line]").forEach(button => {
      button.addEventListener("click", () => {
        if (lines.length === 1) {
          toast("At least one valuation line is required.", "warning");
          return;
        }
        lines.splice(Number(button.dataset.removeValuationLine), 1);
        rebuild();
      });
    });
  }

  $("#ias41AddValuationLine")?.addEventListener("click", () => {
    lines.push(emptyValuationLine());
    rebuild();
  });

  bindLines();
}

  async function loadValuation(id) {
    const response = await api(endpoint("valuation", id));
    return response.data || {};
  }

  async function valuationAction(id, action) {
    const response = await api(valuationActionUrl(id, action), {
      method: "POST",
      body: JSON.stringify({})
    });
    await refresh();
    return response.data || {};
  }

  async function previewValuation(id) {
    const data = await valuationAction(id, "preview");

    acquisitionPreviewModal({
      transaction_number: data.run_number,
      total_debit: data.total_debit,
      total_credit: data.total_credit,
      ready_to_post: data.ready_to_post,
      journal_lines: data.journal_lines || [],
      missing_mappings: data.missing_mappings || []
    });
  }

  function harvestTargetLabel(row) {
    return row.batch_code
      ? `${row.batch_code} — ${row.batch_name || row.class_name}`
      : `${row.asset_number} — ${row.asset_name || row.class_name}`;
  }

  function renderHarvests() {
    const rows=state.harvests.map(row=>`
      <tr class="border-b">
        <td class="p-3">${esc(row.harvest_number)}</td>
        <td class="p-3">${esc(row.harvest_date)}</td>
        <td class="p-3">${esc(harvestTargetLabel(row))}</td>
        <td class="p-3">${esc(row.product_name)}</td>
        <td class="p-3 text-right">${money(row.harvested_quantity)}</td>
        <td class="p-3 text-right">${money(row.inventory_value)}</td>
        <td class="p-3 text-right">${money(row.harvest_gain)}</td>
        <td class="p-3 text-right">${money(row.harvest_loss)}</td>
        <td class="p-3">${statusPill(row.status)}</td>
        <td class="p-3">
          <div class="flex gap-2 justify-end flex-wrap">
            <button class="btn"
              data-ias41-harvest-open="${row.id}">
              Open
            </button>

            ${row.status==="calculated"?`
              <button class="btn"
                data-ias41-harvest-preview="${row.id}">
                Preview
              </button>

              <button class="btn"
                data-ias41-harvest-approve="${row.id}">
                Approve
              </button>
            `:""}

            ${row.status==="approved"?`
              <button class="btn"
                data-ias41-harvest-preview="${row.id}">
                Preview
              </button>

              <button class="btn"
                data-ias41-harvest-post="${row.id}">
                Post
              </button>
            `:""}
          </div>
        </td>
      </tr>
    `);

    return `
      ${pageHeader(
        "Harvest",
        "Measure agricultural produce at fair value less costs to sell and transfer it to IAS 2 inventory.",
        `<button class="btn" id="ias41NewHarvestBtn">New harvest</button>`
      )}

      ${table(
        [
          "Harvest","Date","Biological source","Product",
          "Quantity","Inventory value","Gain","Loss","Status",""
        ],
        rows,
        "No IAS 41 harvests found."
      )}
    `;
  }

  function harvestModal(harvest) {
    harvest=harvest||{};

    const targetType=harvest.batch_id
      ?"batch"
      :(harvest.biological_asset_id?"asset":"batch");

    function targetOptions(type,selected) {
      const rows=type==="asset"
        ?state.biologicalAssets
        :state.batches;

      return selectOptions(
        rows,
        "id",
        row=>type==="asset"
          ?`${row.asset_number} — ${row.asset_name||row.class_name}`
          :`${row.batch_code} — ${row.batch_name||row.class_name}`,
        selected,
        "Select biological source"
      );
    }

    openModal(
      harvest.id?"Edit harvest":"New harvest",
      `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          ${field(
            "harvest_number",
            "Harvest number",
            harvest.harvest_number||"",
            {placeholder:"Generated automatically"}
          )}

          ${field(
            "harvest_date",
            "Harvest date",
            harvest.harvest_date||new Date().toISOString().slice(0,10),
            {type:"date",required:true}
          )}

          ${field(
            "recognition_date",
            "Recognition date",
            harvest.recognition_date
              ||harvest.harvest_date
              ||new Date().toISOString().slice(0,10),
            {type:"date",required:true}
          )}

          ${field(
            "target_type",
            "Biological source type",
            targetType,
            {
              choices:`
                <option value="batch"
                  ${targetType==="batch"?"selected":""}>
                  Batch
                </option>
                <option value="asset"
                  ${targetType==="asset"?"selected":""}>
                  Individual asset
                </option>
              `
            }
          )}

          <label class="block">
            <span class="text-sm font-medium">
              Biological source
            </span>

            <select
              class="input w-full mt-1"
              name="target_id"
              id="ias41HarvestTarget"
              required
            >
              ${targetOptions(
                targetType,
                harvest.batch_id||harvest.biological_asset_id||""
              )}
            </select>
          </label>

          ${field(
            "product_id",
            "Agricultural product",
            harvest.product_id||"",
            {
              required:true,
              choices:selectOptions(
                state.products,
                "id",
                row=>`${row.product_code} — ${row.product_name}`,
                harvest.product_id,
                "Select product"
              )
            }
          )}

          ${field(
            "harvested_quantity",
            "Harvested quantity",
            harvest.harvested_quantity||0,
            {type:"number",step:"0.000001",required:true}
          )}

          ${field(
            "quantity_unit",
            "Quantity unit",
            harvest.quantity_unit||""
          )}

          ${field(
            "harvested_weight",
            "Harvested weight",
            harvest.harvested_weight||"",
            {type:"number",step:"0.000001"}
          )}

          ${field(
            "weight_unit",
            "Weight unit",
            harvest.weight_unit||""
          )}

          ${field(
            "fair_value_per_unit",
            "Fair value per unit",
            harvest.fair_value_per_unit||0,
            {type:"number",step:"0.000001",required:true}
          )}

          ${field(
            "costs_to_sell_per_unit",
            "Costs to sell per unit",
            harvest.costs_to_sell_per_unit||0,
            {type:"number",step:"0.000001"}
          )}

          ${field(
            "biological_value_released",
            "Biological value released",
            harvest.biological_value_released||"",
            {
              type:"number",
              step:"0.01",
              placeholder:"Calculated automatically"
            }
          )}

          ${field(
            "location_id",
            "Harvest location",
            harvest.location_id||"",
            {
              choices:selectOptions(
                state.locations,
                "id",
                row=>`${row.location_code} — ${row.location_name}`,
                harvest.location_id,
                "Use biological source location"
              )
            }
          )}

          ${field(
            "season_id",
            "Season",
            harvest.season_id||"",
            {
              choices:selectOptions(
                state.seasons,
                "id",
                row=>`${row.season_code} — ${row.season_name}`,
                harvest.season_id,
                "Select season"
              )
            }
          )}

          ${field(
            "reference",
            "Reference",
            harvest.reference||""
          )}

          ${field(
            "description",
            "Description",
            harvest.description||"",
            {type:"textarea",col:"md:col-span-3"}
          )}
        </div>
      `,
      async payload=>{
        const type=payload.target_type||"batch";

        payload.batch_id=type==="batch"
          ?payload.target_id
          :null;

        payload.biological_asset_id=type==="asset"
          ?payload.target_id
          :null;

        delete payload.target_type;
        delete payload.target_id;

        await api(
          harvest.id
            ?endpoint("harvest",harvest.id)
            :endpoint("harvests"),
          {
            method:harvest.id?"PATCH":"POST",
            body:JSON.stringify(payload)
          }
        );

        await refresh();
        toast("IAS 41 harvest saved.");
      }
    );

    const typeSelect=$("#ias41Field_target_type");
    const targetSelect=$("#ias41HarvestTarget");

    if(typeSelect&&targetSelect) {
      typeSelect.addEventListener("change",()=>{
        targetSelect.innerHTML=targetOptions(typeSelect.value,"");
      });
    }
  }

  async function loadHarvest(id) {
    const response=await api(endpoint("harvest",id));
    return response.data||{};
  }

  async function harvestAction(id,action) {
    const response=await api(
      harvestActionUrl(id,action),
      {
        method:"POST",
        body:JSON.stringify({})
      }
    );

    await refresh();
    return response.data||{};
  }

  async function previewHarvest(id) {
    const data=await harvestAction(id,"preview");

    acquisitionPreviewModal({
      transaction_number:data.harvest_number,
      total_debit:data.total_debit,
      total_credit:data.total_credit,
      ready_to_post:data.ready_to_post,
      journal_lines:data.journal_lines||[],
      missing_mappings:data.missing_mappings||[]
    });
  }

  function grantTargetLabel(row) {
    if(row.batch_code) return `${row.batch_code} — ${row.batch_name||row.class_name}`;
    if(row.asset_number) return `${row.asset_number} — ${row.asset_name||row.class_name}`;
    if(row.class_name) return row.class_name;
    return "General agricultural activity";
  }

  function renderGovernmentGrants() {
    const rows=state.grants.map(row=>`
      <tr class="border-b">
        <td class="p-3">${esc(row.grant_number)}</td>
        <td class="p-3">${esc(row.grant_name)}</td>
        <td class="p-3">${esc(eventLabel(row.grant_type))}</td>
        <td class="p-3">${esc(grantTargetLabel(row))}</td>
        <td class="p-3 text-right">${money(row.approved_amount)}</td>
        <td class="p-3 text-right">${money(row.recognised_amount)}</td>
        <td class="p-3 text-right">${money(row.received_amount)}</td>
        <td class="p-3 text-right">${money(row.outstanding_amount)}</td>
        <td class="p-3">${statusPill(row.status)}</td>
        <td class="p-3">
          <div class="flex gap-2 justify-end flex-wrap">
            <button class="btn" data-ias41-grant-open="${row.id}">Open</button>

            ${row.status==="draft"?`
              <button class="btn" data-ias41-grant-approve="${row.id}">
                Approve
              </button>
            `:""}

            ${row.status==="approved"?`
              <button class="btn" data-ias41-grant-preview="${row.id}">
                Preview
              </button>
              <button class="btn" data-ias41-grant-recognise="${row.id}">
                Recognise
              </button>
            `:""}

            ${["recognised","partially_received"].includes(row.status)?`
              <button class="btn" data-ias41-grant-receipt="${row.id}">
                Record receipt
              </button>
            `:""}
          </div>
        </td>
      </tr>
    `);

    return `
      ${pageHeader(
        "Government Grants",
        "Recognise conditional and unconditional agricultural grants and record receipts.",
        `<button class="btn" id="ias41NewGrantBtn">New grant</button>`
      )}

      ${table(
        [
          "Grant","Name","Type","Related activity",
          "Approved","Recognised","Received","Outstanding","Status",""
        ],
        rows,
        "No IAS 41 government grants found."
      )}
    `;
  }

  function grantModal(grant) {
    grant=grant||{};

    openModal(
      grant.id?"Edit government grant":"New government grant",
      `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          ${field("grant_number","Grant number",grant.grant_number||"",{
            placeholder:"Generated automatically"
          })}

          ${field("grant_name","Grant name",grant.grant_name||"",{
            required:true
          })}

          ${field("grant_type","Grant type",grant.grant_type||"conditional",{
            required:true,
            choices:[
              "unconditional","conditional","asset_related",
              "income_related","compensation"
            ].map(value=>`
              <option value="${value}" ${grant.grant_type===value?"selected":""}>
                ${esc(eventLabel(value))}
              </option>
            `).join("")
          })}

          ${field("grantor_name","Grantor",grant.grantor_name||"")}
          ${field("grantor_reference","Grantor reference",grant.grantor_reference||"")}

          ${field("approved_amount","Approved amount",grant.approved_amount||0,{
            type:"number",step:"0.01",required:true
          })}

          ${field(
            "approval_date",
            "Approval date",
            grant.approval_date||new Date().toISOString().slice(0,10),
            {type:"date"}
          )}

          ${field("recognition_date","Recognition date",grant.recognition_date||"",{
            type:"date"
          })}

          ${field("expected_receipt_date","Expected receipt",grant.expected_receipt_date||"",{
            type:"date"
          })}

          ${field("expiry_date","Expiry date",grant.expiry_date||"",{
            type:"date"
          })}

          ${field("currency_code","Currency",
            grant.currency_code||state.settings.default_currency_code||"USD"
          )}

          ${field("exchange_rate","Exchange rate",grant.exchange_rate||1,{
            type:"number",step:"0.00000001"
          })}

          ${field("asset_class_id","Asset class",grant.asset_class_id||"",{
            choices:selectOptions(
              state.assetClasses,
              "id",
              row=>`${row.class_code} — ${row.class_name}`,
              grant.asset_class_id,
              "General grant"
            )
          })}

          ${field("batch_id","Batch",grant.batch_id||"",{
            choices:selectOptions(
              state.batches,
              "id",
              row=>`${row.batch_code} — ${row.batch_name||row.class_name}`,
              grant.batch_id,
              "No batch"
            )
          })}

          ${field("biological_asset_id","Biological asset",grant.biological_asset_id||"",{
            choices:selectOptions(
              state.biologicalAssets,
              "id",
              row=>`${row.asset_number} — ${row.asset_name||row.class_name}`,
              grant.biological_asset_id,
              "No individual asset"
            )
          })}

          ${field("location_id","Location",grant.location_id||"",{
            choices:selectOptions(
              state.locations,
              "id",
              row=>`${row.location_code} — ${row.location_name}`,
              grant.location_id,
              "No location"
            )
          })}

          ${field("season_id","Season",grant.season_id||"",{
            choices:selectOptions(
              state.seasons,
              "id",
              row=>`${row.season_code} — ${row.season_name}`,
              grant.season_id,
              "No season"
            )
          })}

          <label class="flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              name="conditions_met"
              ${grant.conditions_met?"checked":""}
            >
            <span class="text-sm font-medium">Conditions met</span>
          </label>

          ${field("conditions_met_date","Conditions met date",grant.conditions_met_date||"",{
            type:"date"
          })}

          ${field("conditions_description","Conditions",grant.conditions_description||"",{
            type:"textarea",col:"md:col-span-3"
          })}

          ${field("grant_receivable_account_code","Grant receivable account",
            grant.grant_receivable_account_code||"",{
              choices:accountOptions(grant.grant_receivable_account_code)
            }
          )}

          ${field("grant_income_account_code","Grant income account",
            grant.grant_income_account_code||"",{
              choices:accountOptions(grant.grant_income_account_code)
            }
          )}

          ${field("cash_account_code","Cash account",grant.cash_account_code||"",{
            choices:accountOptions(grant.cash_account_code)
          })}

          ${field("reference","Reference",grant.reference||"")}

          ${field("description","Description",grant.description||"",{
            type:"textarea",col:"md:col-span-3"
          })}
        </div>
      `,
      async payload=>{
        payload.conditions_met=!!payload.conditions_met;

        await api(
          grant.id?endpoint("grant",grant.id):endpoint("grants"),
          {
            method:grant.id?"PATCH":"POST",
            body:JSON.stringify(payload)
          }
        );

        await refresh();
        toast("IAS 41 government grant saved.");
      }
    );
  }

  function grantReceiptModal(grant) {
    openModal(
      `Grant Receipt — ${grant.grant_number}`,
      `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          ${field("receipt_number","Receipt number","",{
            placeholder:"Generated automatically"
          })}

          ${field(
            "receipt_date",
            "Receipt date",
            new Date().toISOString().slice(0,10),
            {type:"date",required:true}
          )}

          ${field("amount","Amount",grant.outstanding_amount||0,{
            type:"number",step:"0.01",required:true
          })}

          ${field("currency_code","Currency",
            grant.currency_code||state.settings.default_currency_code||"USD"
          )}

          ${field("cash_account_code","Cash account",grant.cash_account_code||"",{
            choices:accountOptions(grant.cash_account_code)
          })}

          ${field(
            "grant_receivable_account_code",
            "Grant receivable account",
            grant.grant_receivable_account_code||"",
            {choices:accountOptions(grant.grant_receivable_account_code)}
          )}

          ${field("reference","Reference","")}

          ${field("description","Description",`Receipt of ${grant.grant_name}`,{
            type:"textarea",col:"md:col-span-3"
          })}
        </div>
      `,
      async payload=>{
        const response=await api(
          window.ENDPOINTS.ias41.grantReceipts(state.companyId,grant.id),
          {
            method:"POST",
            body:JSON.stringify(payload)
          }
        );

        const receipt=response.data||{};
        const preview=await api(
          grantReceiptActionUrl(receipt.id,"preview"),
          {
            method:"POST",
            body:JSON.stringify({})
          }
        );

        acquisitionPreviewModal({
          transaction_number:preview.data.receipt_number,
          total_debit:preview.data.total_debit,
          total_credit:preview.data.total_credit,
          ready_to_post:preview.data.ready_to_post,
          journal_lines:preview.data.journal_lines||[],
          missing_mappings:preview.data.missing_mappings||[]
        });

        await refresh();
        toast("Grant receipt saved. Preview generated.");
      }
    );
  }

  function grantReceiptModal(grant) {
    openModal(
      `Grant Receipt — ${grant.grant_number}`,
      `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          ${field("receipt_number","Receipt number","",{
            placeholder:"Generated automatically"
          })}

          ${field(
            "receipt_date",
            "Receipt date",
            new Date().toISOString().slice(0,10),
            {type:"date",required:true}
          )}

          ${field("amount","Amount",grant.outstanding_amount||0,{
            type:"number",step:"0.01",required:true
          })}

          ${field("currency_code","Currency",
            grant.currency_code||state.settings.default_currency_code||"USD"
          )}

          ${field("cash_account_code","Cash account",grant.cash_account_code||"",{
            choices:accountOptions(grant.cash_account_code)
          })}

          ${field(
            "grant_receivable_account_code",
            "Grant receivable account",
            grant.grant_receivable_account_code||"",
            {choices:accountOptions(grant.grant_receivable_account_code)}
          )}

          ${field("reference","Reference","")}

          ${field("description","Description",`Receipt of ${grant.grant_name}`,{
            type:"textarea",col:"md:col-span-3"
          })}
        </div>
      `,
      async payload=>{
        const response=await api(
          window.ENDPOINTS.ias41.grantReceipts(state.companyId,grant.id),
          {
            method:"POST",
            body:JSON.stringify(payload)
          }
        );

        const receipt=response.data||{};
        const preview=await api(
          grantReceiptActionUrl(receipt.id,"preview"),
          {
            method:"POST",
            body:JSON.stringify({})
          }
        );

        acquisitionPreviewModal({
          transaction_number:preview.data.receipt_number,
          total_debit:preview.data.total_debit,
          total_credit:preview.data.total_credit,
          ready_to_post:preview.data.ready_to_post,
          journal_lines:preview.data.journal_lines||[],
          missing_mappings:preview.data.missing_mappings||[]
        });

        await refresh();
        toast("Grant receipt saved. Preview generated.");
      }
    );
  }

  const IAS41_REPORTS=[
    ["biological_asset_register","Biological Asset Register"],
    ["movement_reconciliation","Movement Reconciliation"],
    ["fair_value_gain_loss","Fair-Value Gain/Loss"],
    ["valuation_history","Valuation History"],
    ["harvest_report","Harvest and IAS 2 Transfer"],
    ["government_grants","Government Grants"],
    ["event_history","Growth and Health Events"],
    ["ias41_disclosure","IAS 41 Disclosure Note"]
  ];

  function reportOptions(selected) {
    return IAS41_REPORTS.map(([value,label])=>`
      <option value="${value}" ${selected===value?"selected":""}>
        ${esc(label)}
      </option>
    `).join("");
  }

  function renderReportSummary(data) {
    const totals=data&&data.totals?data.totals:{};
    const movement=data&&data.movement?data.movement:{};
    const values=Object.keys(totals).length?totals:movement;

    return `
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        ${Object.entries(values).map(([key,value])=>`
          <div class="card p-3">
            <div class="text-xs text-slate-500">
              ${esc(eventLabel(key))}
            </div>
            <div class="font-bold mt-1">
              ${typeof value==="number"?money(value):esc(value)}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderReportRows(data) {
    const items=data&&Array.isArray(data.items)?data.items:[];

    if(!items.length) {
      return `
        <div class="card p-8 text-center text-slate-500 mt-4">
          Run the report to view its detailed results.
        </div>
      `;
    }

    const columns=Object.keys(items[0]).filter(key=>
      !["metadata","company_id"].includes(key)
    ).slice(0,10);

    return table(
      columns.map(eventLabel),
      items.map(row=>`
        <tr class="border-b">
          ${columns.map(key=>`
            <td class="p-3">
              ${
                typeof row[key]==="number"
                  ?money(row[key])
                  :esc(row[key]??"—")
              }
            </td>
          `).join("")}
        </tr>
      `),
      "No report rows found."
    );
  }

  function renderDisclosure(data) {
    if(!data||data.report_key!=="ias41_disclosure") {
      return "";
    }

    const reconciliation=data.carrying_amount_reconciliation||{};
    const classes=data.biological_asset_classes||[];

    return `
      <div class="card p-4 mt-4">
        <h3 class="font-bold text-lg">IAS 41 Agriculture</h3>

        <p class="text-sm text-slate-500 mt-1">
          Biological assets are measured at fair value less costs to sell.
          Agricultural produce is transferred to IAS 2 at harvest.
        </p>

        <h4 class="font-bold mt-5">Biological asset classes</h4>

        ${table(
          ["Class","Nature","Classification","Quantity","Carrying amount"],
          classes.map(row=>`
            <tr class="border-b">
              <td class="p-3">${esc(row.class_name)}</td>
              <td class="p-3">${esc(eventLabel(row.asset_nature))}</td>
              <td class="p-3">${esc(eventLabel(row.current_noncurrent))}</td>
              <td class="p-3 text-right">${n(row.quantity)}</td>
              <td class="p-3 text-right">${money(row.carrying_amount)}</td>
            </tr>
          `),
          "No biological asset classes found."
        )}

        <h4 class="font-bold mt-5">Carrying amount reconciliation</h4>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          ${Object.entries(reconciliation).map(([key,value])=>`
            <div class="card p-3">
              <div class="text-xs text-slate-500">${esc(eventLabel(key))}</div>
              <div class="font-bold mt-1">${money(value)}</div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderReports() {
    const data=state.reportData||{};

    return `
      ${pageHeader(
        "IAS 41 Reports",
        "Registers, reconciliations, fair-value movements, harvest reporting and disclosure notes.",
        `<button class="btn" id="ias41SaveReportSnapshotBtn">
          Save snapshot
        </button>`
      )}

      <div class="card p-4">
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
          ${field(
            "ias41_report_key",
            "Report",
            state.activeReport,
            {choices:reportOptions(state.activeReport)}
          )}

          ${field(
            "ias41_report_date_from",
            "From",
            state.reportFilters.date_from,
            {type:"date"}
          )}

          ${field(
            "ias41_report_date_to",
            "To",
            state.reportFilters.date_to,
            {type:"date"}
          )}

          ${field(
            "ias41_report_as_of",
            "As of",
            state.reportFilters.as_of,
            {type:"date"}
          )}

          <div class="flex items-end">
            <button class="btn w-full" id="ias41RunReportBtn">
              Run report
            </button>
          </div>
        </div>
      </div>

      <div class="mt-4">
        ${data.report_name?`
          <div class="card p-4 mb-4">
            <h3 class="font-bold text-lg">${esc(data.report_name)}</h3>
            <div class="text-sm text-slate-500 mt-1">
              ${esc(data.date_from||data.as_of||"")}
              ${data.date_to?` to ${esc(data.date_to)}`:""}
            </div>
          </div>
        `:""}

        ${renderReportSummary(data)}
        ${renderDisclosure(data)}
        ${data.report_key==="ias41_disclosure"?"":renderReportRows(data)}
      </div>
    `;
  }

  function collectReportFilters() {
    const reportKey=$("#ias41Field_ias41_report_key")?.value
      ||state.activeReport;

    const filters={
      date_from:$("#ias41Field_ias41_report_date_from")?.value||"",
      date_to:$("#ias41Field_ias41_report_date_to")?.value||"",
      as_of:$("#ias41Field_ias41_report_as_of")?.value||"",
    };

    state.activeReport=reportKey;
    state.reportFilters={...state.reportFilters,...filters};

    return {reportKey,filters};
  }

  async function runIas41Report(saveSnapshot=false) {
    const {reportKey,filters}=collectReportFilters();

    const response=await api(
      saveSnapshot
        ?reportUrl(reportKey)
        :reportUrl(reportKey,filters),
      saveSnapshot?{
        method:"POST",
        body:JSON.stringify({
          ...filters,
          save_snapshot:true
        })
      }:{}
    );

    state.reportData=response.data||{};
    renderWorkspace();

    toast(
      saveSnapshot
        ?"IAS 41 report snapshot saved."
        :"IAS 41 report generated."
    );
  }

  function renderAcquisitions() {
    const rows = state.acquisitions.map(
      (row) => `
        <tr class="border-b">
          <td class="p-3">
            ${esc(row.transaction_number)}
          </td>

          <td class="p-3">
            ${esc(
              acquisitionTypeLabel(
                row.transaction_type
              )
            )}
          </td>

          <td class="p-3">
            ${esc(row.transaction_date)}
          </td>

          <td class="p-3">
            ${n(row.line_count)}
          </td>

          <td class="p-3 text-right">
            ${money(
              row.line_carrying_amount
              ?? row.carrying_amount
            )}
          </td>

          <td class="p-3">
            ${statusPill(row.status)}
          </td>

          <td class="p-3">
            <div class="flex gap-2 justify-end flex-wrap">
              <button
                type="button"
                class="btn"
                data-ias41-acquisition-open="${esc(row.id)}"
              >
                Open
              </button>

              ${
                row.status === "draft"
                  ? `
                    <button
                      type="button"
                      class="btn"
                      data-ias41-acquisition-preview="${esc(row.id)}"
                    >
                      Preview
                    </button>

                    <button
                      type="button"
                      class="btn"
                      data-ias41-acquisition-approve="${esc(row.id)}"
                    >
                      Approve
                    </button>
                  `
                  : ""
              }

              ${
                row.status === "approved"
                  ? `
                    <button
                      type="button"
                      class="btn"
                      data-ias41-acquisition-preview="${esc(row.id)}"
                    >
                      Preview
                    </button>

                    <button
                      type="button"
                      class="btn"
                      data-ias41-acquisition-draft="${esc(row.id)}"
                    >
                      Return to draft
                    </button>

                    <button
                      type="button"
                      class="btn"
                      data-ias41-acquisition-post="${esc(row.id)}"
                    >
                      Post
                    </button>
                  `
                  : ""
              }
            </div>
          </td>
        </tr>
      `
    );

    return `
      ${pageHeader(
        "Acquisitions, Births and Planting",
        "Capture biological-asset purchases, births, planting, donations, transfers and opening balances.",
        `
          <button
            type="button"
            class="btn"
            id="ias41NewAcquisitionBtn"
          >
            New transaction
          </button>
        `,
      )}

      ${table(
        [
          "Transaction",
          "Type",
          "Date",
          "Lines",
          "Carrying amount",
          "Status",
          "",
        ],
        rows,
        "No IAS 41 acquisition transactions found.",
      )}
    `;
  }

  function acquisitionLineHtml(
    line,
    index,
  ) {
    return `
      <div
        class="card p-4"
        data-ias41-acquisition-line
        data-line-index="${index}"
      >
        <div class="flex justify-between gap-3">
          <h4 class="font-bold">
            Line ${index + 1}
          </h4>

          <button
            type="button"
            class="btn"
            data-ias41-remove-acquisition-line="${index}"
          >
            Remove
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          ${field(
            `line_${index}_asset_class_id`,
            "Asset class",
            line.asset_class_id,
            {
              required: true,
              choices: selectOptions(
                state.assetClasses,
                "id",
                (row) =>
                  `${row.class_code} — ${row.class_name}`,
                line.asset_class_id,
                "Select class",
              ),
            },
          )}

          ${field(
            `line_${index}_product_id`,
            "Product",
            line.product_id,
            {
              choices: selectOptions(
                state.products,
                "id",
                (row) =>
                  `${row.product_code} — ${row.product_name}`,
                line.product_id,
                "No product",
              ),
            },
          )}

          ${field(
            `line_${index}_tracking_method`,
            "Tracking method",
            line.tracking_method || "batch",
            {
              choices: [
                "batch",
                "individual",
                "both",
              ].map((value) => `
                <option
                  value="${value}"
                  ${
                    line.tracking_method === value
                      ? "selected"
                      : ""
                  }
                >
                  ${esc(
                    acquisitionTypeLabel(value)
                  )}
                </option>
              `).join(""),
            },
          )}

          ${field(
            `line_${index}_location_id`,
            "Location",
            line.location_id,
            {
              choices: selectOptions(
                state.locations,
                "id",
                (row) =>
                  `${row.location_code} — ${row.location_name}`,
                line.location_id,
                "Use header location",
              ),
            },
          )}

          ${field(
            `line_${index}_season_id`,
            "Season",
            line.season_id,
            {
              choices: selectOptions(
                state.seasons,
                "id",
                (row) =>
                  `${row.season_code} — ${row.season_name}`,
                line.season_id,
                "Use header season",
              ),
            },
          )}

          ${field(
            `line_${index}_quantity`,
            "Quantity",
            line.quantity ?? 1,
            {
              type: "number",
              step: "0.000001",
              required: true,
            },
          )}

          ${field(
            `line_${index}_quantity_unit`,
            "Quantity unit",
            line.quantity_unit,
          )}

          ${field(
            `line_${index}_fair_value_per_unit`,
            "Fair value per unit",
            line.fair_value_per_unit ?? 0,
            {
              type: "number",
              step: "0.000001",
            },
          )}

          ${field(
            `line_${index}_costs_to_sell_per_unit`,
            "Costs to sell per unit",
            line.costs_to_sell_per_unit ?? 0,
            {
              type: "number",
              step: "0.000001",
            },
          )}

          ${field(
            `line_${index}_gross_fair_value`,
            "Gross fair value",
            line.gross_fair_value ?? 0,
            {
              type: "number",
              step: "0.01",
            },
          )}

          ${field(
            `line_${index}_costs_to_sell_amount`,
            "Costs to sell",
            line.costs_to_sell_amount ?? 0,
            {
              type: "number",
              step: "0.01",
            },
          )}

          ${field(
            `line_${index}_carrying_amount`,
            "Carrying amount",
            line.carrying_amount ?? 0,
            {
              type: "number",
              step: "0.01",
            },
          )}

          ${field(
            `line_${index}_purchase_price`,
            "Purchase price",
            line.purchase_price ?? 0,
            {
              type: "number",
              step: "0.01",
            },
          )}

          ${field(
            `line_${index}_direct_cost_amount`,
            "Direct costs",
            line.direct_cost_amount ?? 0,
            {
              type: "number",
              step: "0.01",
            },
          )}

          ${field(
            `line_${index}_proposed_batch_code`,
            "New batch code",
            line.proposed_batch_code,
          )}

          ${field(
            `line_${index}_proposed_batch_name`,
            "New batch name",
            line.proposed_batch_name,
          )}

          ${field(
            `line_${index}_proposed_asset_number`,
            "New asset number",
            line.proposed_asset_number,
          )}

          ${field(
            `line_${index}_proposed_asset_name`,
            "New asset name",
            line.proposed_asset_name,
          )}

          ${field(
            `line_${index}_birth_or_planting_date`,
            "Birth / planting date",
            line.birth_or_planting_date,
            {
              type: "date",
            },
          )}

          ${field(
            `line_${index}_expected_harvest_date`,
            "Expected harvest",
            line.expected_harvest_date,
            {
              type: "date",
            },
          )}

          ${field(
            `line_${index}_biological_asset_account_code`,
            "Biological asset account",
            line.biological_asset_account_code,
            {
              choices: accountOptions(
                line.biological_asset_account_code
              ),
            },
          )}

          ${field(
            `line_${index}_fair_value_gain_account_code`,
            "Fair-value gain account",
            line.fair_value_gain_account_code,
            {
              choices: accountOptions(
                line.fair_value_gain_account_code
              ),
            },
          )}

          ${field(
            `line_${index}_fair_value_loss_account_code`,
            "Fair-value loss account",
            line.fair_value_loss_account_code,
            {
              choices: accountOptions(
                line.fair_value_loss_account_code
              ),
            },
          )}

          ${field(
            `line_${index}_payable_account_code`,
            "Payable account",
            line.payable_account_code,
            {
              choices: accountOptions(
                line.payable_account_code
              ),
            },
          )}

          ${field(
            `line_${index}_cash_account_code`,
            "Cash account",
            line.cash_account_code,
            {
              choices: accountOptions(
                line.cash_account_code
              ),
            },
          )}

          ${field(
            `line_${index}_description`,
            "Line description",
            line.description,
            {
              type: "textarea",
              col: "md:col-span-3",
            },
          )}
        </div>
      </div>
    `;
  }

  function readAcquisitionLines(
    form,
    lineCount,
  ) {
    const lines = [];

    for (
      let index = 0;
      index < lineCount;
      index += 1
    ) {
      const prefix = `line_${index}_`;

      const read = (name) => {
        const element = form.elements[
          `${prefix}${name}`
        ];

        return element
          ? element.value
          : null;
      };

      const line = {
        asset_class_id:
          read("asset_class_id"),

        product_id:
          read("product_id"),

        tracking_method:
          read("tracking_method")
          || "batch",

        location_id:
          read("location_id"),

        season_id:
          read("season_id"),

        quantity:
          read("quantity"),

        quantity_unit:
          read("quantity_unit"),

        fair_value_per_unit:
          read("fair_value_per_unit"),

        costs_to_sell_per_unit:
          read("costs_to_sell_per_unit"),

        gross_fair_value:
          read("gross_fair_value"),

        costs_to_sell_amount:
          read("costs_to_sell_amount"),

        carrying_amount:
          read("carrying_amount"),

        purchase_price:
          read("purchase_price"),

        direct_cost_amount:
          read("direct_cost_amount"),

        proposed_batch_code:
          read("proposed_batch_code"),

        proposed_batch_name:
          read("proposed_batch_name"),

        proposed_asset_number:
          read("proposed_asset_number"),

        proposed_asset_name:
          read("proposed_asset_name"),

        birth_or_planting_date:
          read("birth_or_planting_date"),

        expected_harvest_date:
          read("expected_harvest_date"),

        biological_asset_account_code:
          read(
            "biological_asset_account_code"
          ),

        fair_value_gain_account_code:
          read(
            "fair_value_gain_account_code"
          ),

        fair_value_loss_account_code:
          read(
            "fair_value_loss_account_code"
          ),

        payable_account_code:
          read("payable_account_code"),

        cash_account_code:
          read("cash_account_code"),

        description:
          read("description"),
      };

      lines.push(line);
    }

    return lines;
  }

  function acquisitionModal(acquisition) {
    acquisition = acquisition || {};

    var sourceLines =
      acquisition.lines &&
      acquisition.lines.length
        ? acquisition.lines
        : [emptyAcquisitionLine()];

    var modalLines = sourceLines.map(function (line) {
      return Object.assign(
        {},
        emptyAcquisitionLine(),
        line || {}
      );
    });

    function renderBody() {
      var today = new Date()
        .toISOString()
        .slice(0, 10);

      var transactionDate =
        acquisition.transaction_date ||
        today;

      var recognitionDate =
        acquisition.recognition_date ||
        transactionDate;

      var currency =
        acquisition.currency_code ||
        (
          state.settings &&
          state.settings.default_currency_code
        ) ||
        (
          typeof window.resolveCurrency ===
          "function"
            ? window.resolveCurrency()
            : ""
        ) ||
        "USD";

      var transactionTypes = [
        "purchase",
        "birth",
        "planting",
        "donation",
        "transfer_in",
        "opening_balance",
        "other"
      ];

      var typeOptions = transactionTypes
        .map(function (value) {
          var selected =
            (
              acquisition.transaction_type ||
              "purchase"
            ) === value
              ? "selected"
              : "";

          return (
            '<option value="' +
            esc(value) +
            '" ' +
            selected +
            ">" +
            esc(
              acquisitionTypeLabel(value)
            ) +
            "</option>"
          );
        })
        .join("");

      return `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          ${field(
            "transaction_number",
            "Transaction number",
            acquisition.transaction_number || "",
            {
              placeholder: "Generated automatically"
            }
          )}

          ${field(
            "transaction_type",
            "Transaction type",
            acquisition.transaction_type || "purchase",
            {
              required: true,
              choices: typeOptions
            }
          )}

          ${field(
            "transaction_date",
            "Transaction date",
            transactionDate,
            {
              type: "date",
              required: true
            }
          )}

          ${field(
            "recognition_date",
            "Recognition date",
            recognitionDate,
            {
              type: "date",
              required: true
            }
          )}

          ${field(
            "destination_location_id",
            "Destination location",
            acquisition.destination_location_id || "",
            {
              choices: selectOptions(
                state.locations,
                "id",
                function (row) {
                  return (
                    row.location_code +
                    " — " +
                    row.location_name
                  );
                },
                acquisition.destination_location_id || "",
                "Select location"
              )
            }
          )}

          ${field(
            "season_id",
            "Season",
            acquisition.season_id || "",
            {
              choices: selectOptions(
                state.seasons,
                "id",
                function (row) {
                  return (
                    row.season_code +
                    " — " +
                    row.season_name
                  );
                },
                acquisition.season_id || "",
                "Select season"
              )
            }
          )}

          ${field(
            "currency_code",
            "Currency",
            currency
          )}

          ${field(
            "exchange_rate",
            "Exchange rate",
            acquisition.exchange_rate != null
              ? acquisition.exchange_rate
              : 1,
            {
              type: "number",
              step: "0.00000001"
            }
          )}

          ${field(
            "reference",
            "Reference",
            acquisition.reference || ""
          )}

          ${field(
            "description",
            "Description",
            acquisition.description || "",
            {
              type: "textarea",
              col: "md:col-span-3"
            }
          )}
        </div>

        <div class="flex justify-between gap-3 mt-5">
          <h4 class="font-bold">
            Transaction lines
          </h4>

          <button
            type="button"
            class="btn"
            id="ias41AddAcquisitionLineBtn"
          >
            Add line
          </button>
        </div>

        <div
          id="ias41AcquisitionLines"
          class="space-y-4 mt-3"
        >
          ${modalLines
            .map(function (line, index) {
              return acquisitionLineHtml(
                line,
                index
              );
            })
            .join("")}
        </div>
      `;
    }

    openModal(
      acquisition.id
        ? "Edit IAS 41 transaction"
        : "New IAS 41 transaction",

      renderBody(),

      async function (headerPayload) {
        var form = $(
          "#ias41ModalForm"
        );

        if (!form) {
          throw new Error(
            "IAS 41 acquisition form was not found."
          );
        }

        headerPayload.lines =
          readAcquisitionLines(
            form,
            modalLines.length
          );

        var url = acquisition.id
          ? endpoint(
              "acquisition",
              acquisition.id
            )
          : endpoint("acquisitions");

        var method = acquisition.id
          ? "PATCH"
          : "POST";

        await api(url, {
          method: method,
          body: JSON.stringify(
            headerPayload
          )
        });

        await refresh();

        toast(
          "IAS 41 transaction saved."
        );
      }
    );

    function rebuildLines() {
      var host = $(
        "#ias41AcquisitionLines"
      );

      if (!host) {
        return;
      }

      host.innerHTML = modalLines
        .map(function (line, index) {
          return acquisitionLineHtml(
            line,
            index
          );
        })
        .join("");

      bindLineButtons();
    }

    function bindLineButtons() {
      var buttons =
        document.querySelectorAll(
          "[data-ias41-remove-acquisition-line]"
        );

      buttons.forEach(function (button) {
        button.addEventListener(
          "click",
          function () {
            if (
              modalLines.length === 1
            ) {
              toast(
                "At least one line is required.",
                "warning"
              );
              return;
            }

            var index = Number(
              button.getAttribute(
                "data-ias41-remove-acquisition-line"
              )
            );

            if (
              !Number.isInteger(index) ||
              index < 0 ||
              index >= modalLines.length
            ) {
              return;
            }

            modalLines.splice(
              index,
              1
            );

            rebuildLines();
          }
        );
      });
    }

    var addLineButton = $(
      "#ias41AddAcquisitionLineBtn"
    );

    if (addLineButton) {
      addLineButton.addEventListener(
        "click",
        function () {
          modalLines.push(
            emptyAcquisitionLine()
          );

          rebuildLines();
        }
      );
    }

    bindLineButtons();
  }


  function acquisitionPreviewModal(
    preview,
  ) {
    const lines = (
      preview.journal_lines || []
    );

    openModal(
      "IAS 41 Journal Preview",
      `
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div class="card p-3">
            <div class="text-xs text-slate-500">
              Transaction
            </div>
            <div class="font-bold">
              ${esc(
                preview.transaction_number
              )}
            </div>
          </div>

          <div class="card p-3">
            <div class="text-xs text-slate-500">
              Total debit
            </div>
            <div class="font-bold">
              ${money(
                preview.total_debit
              )}
            </div>
          </div>

          <div class="card p-3">
            <div class="text-xs text-slate-500">
              Total credit
            </div>
            <div class="font-bold">
              ${money(
                preview.total_credit
              )}
            </div>
          </div>

          <div class="card p-3">
            <div class="text-xs text-slate-500">
              Status
            </div>
            <div class="font-bold">
              ${
                preview.ready_to_post
                  ? "Ready"
                  : "Incomplete"
              }
            </div>
          </div>
        </div>

        <div class="mt-4">
          ${table(
            [
              "Account",
              "Description",
              "Debit",
              "Credit",
              "Resolved from",
            ],
            lines.map((line) => `
              <tr class="border-b">
                <td class="p-3">
                  ${esc(
                    line.account_name
                    || line.account_code
                  )}
                </td>

                <td class="p-3">
                  ${esc(
                    line.description
                  )}
                </td>

                <td class="p-3 text-right">
                  ${money(line.debit)}
                </td>

                <td class="p-3 text-right">
                  ${money(line.credit)}
                </td>

                <td class="p-3">
                  ${esc(
                    line.resolution_source
                    || "—"
                  )}
                </td>
              </tr>
            `),
            "No journal lines generated.",
          )}
        </div>

        ${
          (
            preview.missing_mappings
            || []
          ).length
            ? `
              <div class="card p-4 mt-4">
                <h4 class="font-bold">
                  Missing mappings
                </h4>

                <div class="mt-2 text-sm">
                  ${
                    preview.missing_mappings
                      .map((row) => `
                        <div>
                          ${esc(
                            row.role_code
                          )}
                        </div>
                      `)
                      .join("")
                  }
                </div>
              </div>
            `
            : ""
        }
      `,
      async () => {
        closeModal();
      },
    );

    const form = $(
      "#ias41ModalForm"
    );

    if (form) {
      const saveButton = form.querySelector(
        'button[type="submit"]'
      );

      if (saveButton) {
        saveButton.textContent = "Close";
      }
    }
  }

  async function loadAcquisition(
    acquisitionId,
  ) {
    const response = await api(
      endpoint(
        "acquisition",
        acquisitionId
      )
    );

    return response.data || {};
  }

  async function previewAcquisition(
    acquisitionId,
  ) {
    const response = await api(
      endpoint(
        "acquisitionPreview",
        acquisitionId
      ),
      {
        method: "POST",
      },
    );

    state.acquisitionPreview = (
      response.data || {}
    );

    acquisitionPreviewModal(
      state.acquisitionPreview
    );
  }

  async function approveAcquisition(
    acquisitionId,
  ) {
    if (
      !confirm(
        "Approve this IAS 41 transaction?"
      )
    ) {
      return;
    }

    await api(
      endpoint(
        "acquisitionApprove",
        acquisitionId
      ),
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );

    await refresh();
    toast(
      "IAS 41 transaction approved."
    );
  }

  async function returnAcquisitionToDraft(
    acquisitionId,
  ) {
    if (
      !confirm(
        "Return this transaction to draft?"
      )
    ) {
      return;
    }

    await api(
      endpoint(
        "acquisitionReturnToDraft",
        acquisitionId
      ),
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );

    await refresh();
    toast(
      "Transaction returned to draft."
    );
  }


  async function postAcquisition(
    acquisitionId
  ) {
    var confirmed = confirm(
      "Post this IAS 41 transaction and create the biological assets?"
    );

    if (!confirmed) {
      return;
    }

    var response = await api(
      endpoint(
        "acquisitionPost",
        acquisitionId
      ),
      {
        method: "POST",
        body: JSON.stringify({})
      }
    );

    var data = response.data || {};

    await refresh();

    toast(
      "IAS 41 transaction posted. Journal " +
      String(
        data.journal_id || ""
      ) +
      " created."
    );
  }

  async function bindIAS41Screen() {
    state.companyId = companyId();

    try {
      state.activeTab =
        localStorage.getItem(TAB_KEY) ||
        "dashboard";
    } catch {
      state.activeTab = "dashboard";
    }

    bindRootEvents();
    renderTabs();
    await refresh();

    state.bound = true;
  }

  window.bindIAS41Screen = bindIAS41Screen;
  window.openIAS41Tab = openTab;
  window.refreshIAS41Screen = refresh;
  window.IAS41_STATE = state;
})();