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