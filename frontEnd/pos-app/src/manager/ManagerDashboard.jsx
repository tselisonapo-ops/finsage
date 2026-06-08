import { posApi } from "../services/posApi.js";
import { money } from "../utils/currency.js";

let managerState = {
  tab: "overview",
  message: "",
  terminals: [],
  shifts: [],
  customers: [],
  priceLevels: [],
  promotions: [],
  recipes: [],
  costPools: [],
  allocations: [],
};

export function renderManagerDashboard() {
  setTimeout(bindManagerEvents, 0);

  return `
    <main class="pos-page">
      <header class="pos-header">
        <div>
          <span class="eyebrow">Store Manager</span>
          <h1>POS Manager Workspace</h1>
          <p>Manage shifts, cash-up, terminals, customers, discounts and stock labels.</p>
        </div>

        <nav class="header-actions">
          <a href="#/cashier">Cashier</a>
          <a href="#/orders">Orders</a>
          <button onclick="window.location.href='/dashboard'">Back to FinSage</button>
        </nav>
      </header>

      ${managerState.message ? `<div class="pos-message">${managerState.message}</div>` : ""}

      <section class="manager-tabs">
        ${tabButton("overview", "Overview")}
        ${tabButton("shifts", "Shifts & Cash-up")}
        ${tabButton("terminals", "Terminals")}
        ${tabButton("customers", "Customers")}
        ${tabButton("pricing", "Pricing")}
        ${tabButton("recipes", "Recipes")}
        ${tabButton("costing", "Meal Costing")}
        ${tabButton("promotions", "Promotions")}
        ${tabButton("labels", "Barcode Labels")}
        ${tabButton("staff", "POS Staff")}
        ${tabButton("receiptSettings", "Receipt Settings")}
      </section>

      ${renderActiveTab()}
    </main>
  `;
}

function tabButton(id, label) {
  return `
    <button
      class="${managerState.tab === id ? "active-tab" : ""}"
      data-manager-tab="${id}"
    >
      ${label}
    </button>
  `;
}

function renderActiveTab() {
  if (managerState.tab === "shifts") return renderShiftsTab();
  if (managerState.tab === "terminals") return renderTerminalsTab();
  if (managerState.tab === "customers") return renderCustomersTab();
  if (managerState.tab === "pricing") return renderPricingTab();
  if (managerState.tab === "recipes") return renderRecipesTab();
  if (managerState.tab === "costing") return renderCostingTab();
  if (managerState.tab === "promotions") return renderPromotionsTab();
  if (managerState.tab === "labels") return renderLabelsTab();
  if (managerState.tab === "staff") return renderStaffTab();
  return renderOverviewTab();
}

function renderOverviewTab() {
  return `
    <section class="manager-grid">
      <article class="manager-card">
        <h3>Open Shifts</h3>
        <strong>${managerState.shifts.filter(x => x.status === "open").length}</strong>
        <p>Cashiers currently active.</p>
      </article>

      <article class="manager-card">
        <h3>Terminals</h3>
        <strong>${managerState.terminals.length}</strong>
        <p>Configured POS terminals.</p>
      </article>

      <article class="manager-card">
        <h3>Customers</h3>
        <strong>${managerState.customers.length}</strong>
        <p>Retail, wholesale and account profiles.</p>
      </article>

      <article class="manager-card">
        <h3>Price Levels</h3>
        <strong>${managerState.priceLevels.length}</strong>
        <p>Retail, wholesale, VIP and staff pricing.</p>
      </article>

      <article class="manager-card">
        <h3>Promotions</h3>
        <strong>${managerState.promotions.length}</strong>
        <p>Active and scheduled promotions.</p>
      </article>

      <article class="manager-card">
        <h3>Cash-up</h3>
        <strong>Review</strong>
        <p>Close shifts and compare expected vs counted cash.</p>
      </article>
    </section>
  `;
}

function renderShiftsTab() {
  return `
    <section class="manager-workspace">
      <div class="workspace-head">
        <div>
          <h2>Shifts & Cash-up</h2>
          <p>Review open shifts and close cashiers at end of day.</p>
        </div>
        <button class="scan-btn" data-action="load-shifts">Refresh</button>
      </div>

      <div class="data-list">
        ${
          managerState.shifts.length
            ? managerState.shifts.map(s => `
              <div class="data-row">
                <div>
                  <strong>${s.terminal_name || "Terminal"} — Shift #${s.id}</strong>
                  <small>Cashier: ${s.cashier_user_id || "-"} • Status: ${s.status}</small>
                </div>
                <div>
                  <strong>${money(s.expected_cash || 0)}</strong>
                  ${s.status === "open" ? `<button data-close-shift="${s.id}">Close</button>` : ""}
                </div>
              </div>
            `).join("")
            : `<div class="empty-state"><strong>No shifts loaded</strong><p>Click refresh.</p></div>`
        }
      </div>
    </section>
  `;
}

function renderTerminalsTab() {
  return `
    <section class="manager-workspace">
      <div class="workspace-head">
        <div>
          <h2>Terminals</h2>
          <p>Create and manage POS terminals.</p>
        </div>
        <button class="scan-btn" data-action="new-terminal">New Terminal</button>
      </div>

      <div class="data-list">
        ${
          managerState.terminals.length
            ? managerState.terminals.map(t => `
              <div class="data-row">
                <div>
                  <strong>${t.name}</strong>
                  <small>${t.terminal_code} • ${t.branch_name || "Main"} • ${t.location || ""}</small>
                </div>
                <div>
                  <span class="badge">${t.is_active ? "Active" : "Inactive"}</span>
                </div>
              </div>
            `).join("")
            : `<div class="empty-state"><strong>No terminals</strong><p>Create the first POS terminal.</p></div>`
        }
      </div>
    </section>
  `;
}

function renderCustomersTab() {
  return `
    <section class="manager-workspace">
      <div class="workspace-head">
        <div>
          <h2>POS Customers</h2>
          <p>Manage retail, wholesale and account customers.</p>
        </div>
        <button class="scan-btn" data-action="new-customer">New Customer</button>
      </div>

      <div class="scan-card">
        <div class="scan-row">
          <input id="managerCustomerSearch" class="scan-input" placeholder="Search customer..." />
          <button class="scan-btn" data-action="search-customers">Search</button>
        </div>
      </div>

      <div class="data-list">
        ${
          managerState.customers.length
            ? managerState.customers.map(c => `
              <div class="data-row">
                <div>
                  <strong>${c.customer_name}</strong>
                  <small>${c.customer_type || "retail"} • ${c.price_level || "retail"} • ${c.phone || c.email || ""}</small>
                </div>
                <div>
                  <strong>${money(c.credit_limit || 0)}</strong>
                </div>
              </div>
            `).join("")
            : `<div class="empty-state"><strong>No customers loaded</strong><p>Search or create one.</p></div>`
        }
      </div>
    </section>
  `;
}

function renderPricingTab() {
  return `
    <section class="manager-workspace">
      <div class="workspace-head">
        <div>
          <h2>Pricing</h2>
          <p>Set retail, wholesale, VIP or staff price levels.</p>
        </div>
        <button class="scan-btn" data-action="new-price-level">New Price Level</button>
      </div>

      <div class="data-list">
        ${
          managerState.priceLevels.length
            ? managerState.priceLevels.map(p => `
              <div class="data-row">
                <div>
                  <strong>${p.price_level}</strong>
                  <small>${p.description || ""}</small>
                </div>
                <span class="badge">${p.is_active ? "Active" : "Inactive"}</span>
              </div>
            `).join("")
            : `<div class="empty-state"><strong>No price levels</strong><p>Create wholesale, VIP or staff pricing.</p></div>`
        }
      </div>
    </section>
  `;
}

function renderRecipesTab() {
  return `
    <section class="manager-workspace">
      <div class="workspace-head">
        <div>
          <h2>Recipes / Menu BOM</h2>
          <p>Link menu items to ingredient recipes for automatic food-cost tracing.</p>
        </div>
        <button class="scan-btn" data-action="new-recipe">New Recipe</button>
      </div>

      <div class="data-list">
        ${
          managerState.recipes.length
            ? managerState.recipes.map(r => `
              <div class="data-row">
                <div>
                  <strong>${r.recipe_name || r.menu_item_name || "Recipe"}</strong>
                  <small>${r.menu_item_name || ""} • Yield: ${r.yield_qty || 1} ${r.yield_uom || ""}</small>
                </div>
                <div>
                  <strong>${money(r.sales_price || 0)}</strong>
                  <span class="badge">${r.is_active ? "Active" : "Inactive"}</span>
                </div>
              </div>
            `).join("")
            : `<div class="empty-state"><strong>No recipes</strong><p>Create recipes for meals, drinks, combos or prepared food items.</p></div>`
        }
      </div>
    </section>
  `;
}

function renderCostingTab() {
  return `
    <section class="manager-workspace">
      <div class="workspace-head">
        <div>
          <h2>Meal Costing</h2>
          <p>Allocate rent, electricity, water, labour and other overheads to menu items.</p>
        </div>
        <button class="scan-btn" data-action="new-cost-pool">New Cost Pool</button>
      </div>

      <div class="data-list">
        ${
          managerState.costPools.length
            ? managerState.costPools.map(p => `
              <div class="data-row">
                <div>
                  <strong>${p.pool_name}</strong>
                  <small>${p.pool_type} • ${p.allocation_basis} • ${p.period_start || ""} to ${p.period_end || ""}</small>
                </div>
                <div>
                  <strong>${money(p.amount || 0)}</strong>
                  <span class="badge">${p.is_active ? "Active" : "Inactive"}</span>
                </div>
              </div>
            `).join("")
            : `<div class="empty-state"><strong>No cost pools</strong><p>Add monthly rent, utilities, kitchen labour or other overhead pools.</p></div>`
        }
      </div>
    </section>
  `;
}


function renderPromotionsTab() {
  return `
    <section class="manager-workspace">
      <div class="workspace-head">
        <div>
          <h2>Promotions</h2>
          <p>Create discounts and promotion rules.</p>
        </div>
        <button class="scan-btn" data-action="new-promotion">New Promotion</button>
      </div>

      <div class="data-list">
        ${
          managerState.promotions.length
            ? managerState.promotions.map(p => `
              <div class="data-row">
                <div>
                  <strong>${p.name}</strong>
                  <small>${p.promo_code} • ${p.promo_type}</small>
                </div>
                <div>
                  <strong>${Number(p.discount_percent || 0)}%</strong>
                  <span class="badge">${p.is_active ? "Active" : "Inactive"}</span>
                </div>
              </div>
            `).join("")
            : `<div class="empty-state"><strong>No promotions loaded</strong><p>Create active POS promotions.</p></div>`
        }
      </div>
    </section>
  `;
}

function renderLabelsTab() {
  return `
    <section class="manager-workspace">
      <div class="workspace-head">
        <div>
          <h2>Barcode Labels</h2>
          <p>Generate and queue barcode labels for printing.</p>
        </div>
      </div>

      <div class="scan-card">
        <label>Inventory item ID</label>
        <div class="scan-row">
          <input id="labelItemId" class="scan-input" placeholder="Item ID..." />
          <button class="scan-btn" data-action="generate-label">Generate</button>
        </div>
      </div>

      <div class="empty-state">
        <strong>Label workflow</strong>
        <p>Enter an item ID to generate or queue barcode label printing.</p>
      </div>
    </section>
  `;
}

function renderStaffTab() {
  return `
    <section class="manager-workspace">
      <div class="workspace-head">
        <div>
          <h2>POS Staff</h2>
          <p>Add cashier, waiter, waitress, kitchen user or driver access.</p>
        </div>
        <button class="scan-btn" data-action="new-pos-staff">Add POS Staff</button>
      </div>

      <div class="empty-state">
        <strong>POS staff invitations</strong>
        <p>This will use public.company_invites with access_scope='pos' and pos_role.</p>
      </div>
    </section>
  `;
}

async function loadRecipes() {
  const res = await posApi.listRecipes();
  managerState.recipes = res.recipes || [];
}

async function loadCostPools() {
  const res = await posApi.listCostPools();
  managerState.costPools = res.cost_pools || [];
}

async function createRecipe() {
  const menu_item_id = Number(prompt("Menu item ID:"));
  if (!menu_item_id) return;

  const recipe_name = prompt("Recipe name:", "New Recipe") || "New Recipe";
  const yield_qty = Number(prompt("Yield quantity:", "1") || 1);
  const yield_uom = prompt("Yield UOM:", "portion") || "portion";

  const ingredient_item_id = Number(prompt("First ingredient item ID:"));
  if (!ingredient_item_id) return;

  const qty_required = Number(prompt("Ingredient quantity required:", "1") || 1);
  const uom = prompt("Ingredient UOM:", "") || "";

  await posApi.createRecipe({
    menu_item_id,
    recipe_name,
    yield_qty,
    yield_uom,
    is_active: true,
    lines: [
      {
        ingredient_item_id,
        qty_required,
        uom,
        wastage_percent: 0,
      },
    ],
  });

  setMessage("Recipe created.");
  await loadRecipes();
  refresh();
}

async function createCostPool() {
  const pool_name = prompt("Cost pool name:", "Monthly Rent");
  if (!pool_name) return;

  const pool_code = `POOL-${Date.now()}`;
  const pool_type = prompt("Pool type: labour / rent / utilities / water / electricity / gas / other", "rent") || "rent";
  const allocation_basis = prompt("Allocation basis: meals_sold / sales_value / food_cost / prep_minutes / manual_weight", "meals_sold") || "meals_sold";
  const amount = Number(prompt("Amount:", "0") || 0);
  const period_start = prompt("Period start YYYY-MM-DD:", new Date().toISOString().slice(0, 10));
  const period_end = prompt("Period end YYYY-MM-DD:", new Date().toISOString().slice(0, 10));

  await posApi.createCostPool({
    pool_code,
    pool_name,
    pool_type,
    allocation_basis,
    amount,
    period_start,
    period_end,
    is_active: true,
  });

  setMessage("Cost pool created.");
  await loadCostPools();
  refresh();
}


function bindManagerEvents() {
  document.querySelectorAll("[data-manager-tab]").forEach(btn => {
    btn.addEventListener("click", async () => {
      managerState.tab = btn.dataset.managerTab;
      await loadTabData();
      refresh();
    });
  });

  document.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        const action = btn.dataset.action;

        if (action === "load-shifts") return await loadShiftsAndRefresh();
        if (action === "new-terminal") return await createTerminal();
        if (action === "new-customer") return await createCustomer();
        if (action === "search-customers") return await searchCustomers();
        if (action === "new-price-level") return await createPriceLevel();
        if (action === "new-recipe") return await createRecipe();
        if (action === "new-cost-pool") return await createCostPool();
        if (action === "new-promotion") return await createPromotion();
        if (action === "generate-label") return await generateLabel();
        if (action === "new-pos-staff") return addPosStaffMessage();

      } catch (err) {
        setMessage(err.message || "Manager action failed.");
      }
    });
  });

  document.querySelectorAll("[data-close-shift]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const counted = prompt("Counted cash amount:", "0");
      if (counted === null) return;

      await posApi.closeShift(Number(btn.dataset.closeShift), {
        counted_cash: Number(counted || 0),
      });

      setMessage("Shift closed.");
      await loadShiftsAndRefresh();
    });
  });

  loadTabData();
}

async function loadTabData() {
  if (managerState.tab === "overview") {
    await Promise.allSettled([
      loadTerminals(),
      loadShifts(),
      loadCustomers(),
      loadPriceLevels(),
      loadPromotions(),
      loadRecipes(),
      loadCostPools(),
    ]);
    return;
  }

  if (managerState.tab === "terminals") await loadTerminals();
  if (managerState.tab === "shifts") await loadShifts();
  if (managerState.tab === "customers") await loadCustomers();
  if (managerState.tab === "pricing") await loadPriceLevels();
  if (managerState.tab === "recipes") await loadRecipes();
  if (managerState.tab === "costing") await loadCostPools();
  if (managerState.tab === "promotions") await loadPromotions();
}

async function loadTerminals() {
  const res = await posApi.listTerminals();
  managerState.terminals = res.terminals || [];
}

async function loadShifts() {
  const res = await posApi.listShifts("");
  managerState.shifts = res.shifts || [];
}

async function loadCustomers(q = "") {
  const res = await posApi.listCustomers(q);
  managerState.customers = res.customers || [];
}

async function loadPriceLevels() {
  const res = await posApi.listPriceLevels();
  managerState.priceLevels = res.price_levels || [];
}

async function loadPromotions() {
  const res = await posApi.listPromotions();
  managerState.promotions = res.promotions || [];
}

async function loadShiftsAndRefresh() {
  await loadShifts();
  refresh();
}

async function createTerminal() {
  const terminal_code = prompt("Terminal code:", `TILL-${Date.now()}`);
  if (!terminal_code) return;

  const name = prompt("Terminal name:", terminal_code) || terminal_code;
  const branch_name = prompt("Branch name:", "Main") || "Main";

  await posApi.createTerminal({
    terminal_code,
    name,
    branch_name,
    location: "",
    cash_drawer_enabled: false,
    is_active: true,
  });

  setMessage("Terminal created.");
  await loadTerminals();
  refresh();
}

async function createCustomer() {
  const customer_name = prompt("Customer name:");
  if (!customer_name) return;

  const customer_type = prompt("Customer type: retail / wholesale / account", "retail") || "retail";
  const phone = prompt("Phone:", "") || "";
  const email = prompt("Email:", "") || "";

  await posApi.createCustomer({
    customer_name,
    customer_type,
    phone,
    email,
    price_level: customer_type === "wholesale" ? "wholesale" : "retail",
  });

  setMessage("Customer created.");
  await loadCustomers();
  refresh();
}

async function searchCustomers() {
  const q = document.querySelector("#managerCustomerSearch")?.value?.trim() || "";
  await loadCustomers(q);
  refresh();
}

async function createPriceLevel() {
  const price_level = prompt("Price level name:", "wholesale");
  if (!price_level) return;

  const description = prompt("Description:", "") || "";

  await posApi.createPriceLevel({
    price_level,
    description,
    is_active: true,
  });

  setMessage("Price level created.");
  await loadPriceLevels();
  refresh();
}

async function createPromotion() {
  const promo_code = prompt("Promotion code:", `PROMO-${Date.now()}`);
  if (!promo_code) return;

  const name = prompt("Promotion name:", promo_code) || promo_code;
  const discount_percent = Number(prompt("Discount percent:", "0") || 0);

  await posApi.createPromotion({
    promo_code,
    name,
    promo_type: "percent",
    discount_percent,
    discount_amount: 0,
    rules_json: {},
    is_active: true,
  });

  setMessage("Promotion created.");
  await loadPromotions();
  refresh();
}

async function generateLabel() {
  const itemId = Number(document.querySelector("#labelItemId")?.value || 0);
  if (!itemId) {
    setMessage("Enter item ID first.");
    return;
  }

  const res = await posApi.generateBarcode(itemId);
  const barcode = res.barcode || res.data?.barcode;

  await posApi.queueBarcodeLabel({
    item_id: itemId,
    barcode,
    copies: 1,
  });

  setMessage(`Barcode queued: ${barcode}`);
}

function addPosStaffMessage() {
  setMessage("POS staff invite route should be connected to company_invites with access_scope='pos'.");
}

function setMessage(message) {
  managerState.message = message;
  refresh();
}

function refresh() {
  document.querySelector("#app").innerHTML = renderManagerDashboard();
}