import { useEffect, useMemo, useState } from "react";
import { posApi } from "../services/posApi.js";
import { money } from "../utils/currency.js";

const TABS = [
  ["overview", "Overview"],
  ["sales", "Sales"],
  ["reports", "Reports"],
  ["shifts", "Shifts & Cash-up"],
  ["terminals", "Terminals"],
  ["customers", "Customers"],
  ["pricing", "Pricing"],
  ["recipes", "Recipes"],
  ["costing", "Meal Costing"],
  ["promotions", "Promotions"],
  ["labels", "Barcode Labels"],
  ["staff", "Staff & Access"],
  ["attendance", "Attendance"],
  ["settings", "Settings"],
];

export function ManagerPage() {
  const [tab, setTab] = useState("overview");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [terminals, setTerminals] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [priceLevels, setPriceLevels] = useState([]);
  const [promotions, setPromotions] = useState([]);
    const [recipes, setRecipes] = useState([]);
    const [costPools, setCostPools] = useState([]);
    const [receiptSettings, setReceiptSettings] = useState(null);

  const openShifts = useMemo(
    () => shifts.filter((x) => x.status === "open").length,
    [shifts]
  );

  useEffect(() => {
    loadTabData(tab);
  }, [tab]);

  async function loadTabData(activeTab = tab) {
    setLoading(true);
    setMessage("");

    try {
      if (activeTab === "overview") {
        await Promise.allSettled([
          loadTerminals(),
          loadShifts(),
          loadCustomers(),
          loadPriceLevels(),
          loadPromotions(),
            loadRecipes(),
            loadCostPools(),
        ]);
      }

      if (activeTab === "terminals") await loadTerminals();
      if (activeTab === "shifts") await loadShifts();
      if (activeTab === "customers") await loadCustomers();
      if (activeTab === "pricing") await loadPriceLevels();
      if (activeTab === "promotions") await loadPromotions();
        if (activeTab === "recipes") await loadRecipes();
        if (activeTab === "costing") await loadCostPools();
        if (activeTab === "settings") await loadReceiptSettings();
    } catch (err) {
      setMessage(err.message || "Failed to load manager data.");
    } finally {
      setLoading(false);
    }
  }

  async function loadTerminals() {
    const res = await posApi.listTerminals();
    setTerminals(res.terminals || []);
  }

  async function loadShifts() {
    const res = await posApi.listShifts("");
    setShifts(res.shifts || []);
  }

  async function loadCustomers(q = "") {
    const res = await posApi.listCustomers(q);
    setCustomers(res.customers || []);
  }

  async function loadPriceLevels() {
    const res = await posApi.listPriceLevels();
    setPriceLevels(res.price_levels || []);
  }

  async function loadPromotions() {
    const res = await posApi.listPromotions();
    setPromotions(res.promotions || []);
  }

    async function loadReceiptSettings() {
    const res = await posApi.getReceiptSettings();
    setReceiptSettings(res.receipt_settings || res.settings || res.data || res || {});
    }

    async function saveReceiptSettings(payload) {
    const res = await posApi.saveReceiptSettings(payload);
    setReceiptSettings(res.receipt_settings || res.settings || res.data || res || payload);
    setMessage("Receipt settings saved.");
    }

    async function loadRecipes() {
    const res = await posApi.listRecipes();
    setRecipes(res.recipes || []);
    }

    async function loadCostPools() {
    const res = await posApi.listCostPools();
    setCostPools(res.cost_pools || []);
    }

    async function loadReceiptSettings() {
    const res = await posApi.getReceiptSettings();
    setReceiptSettings(res.receipt_settings || res.settings || res.data || res || {});
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
  }

  async function closeShift(shiftId) {
    const counted = prompt("Counted cash amount:", "0");
    if (counted === null) return;

    await posApi.closeShift(shiftId, {
      counted_cash: Number(counted || 0),
    });

    setMessage("Shift closed.");
    await loadShifts();
  }

  async function createCustomer() {
    const customer_name = prompt("Customer name:");
    if (!customer_name) return;

    const customer_type =
      prompt("Customer type: retail / wholesale / account", "retail") || "retail";
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
    }

    async function createCostPool() {
        const pool_name = prompt("Cost pool name:", "Monthly Rent");
        if (!pool_name) return;

        const pool_code = `POOL-${Date.now()}`;
        const pool_type =
            prompt("Pool type: labour / rent / utilities / water / electricity / gas / other", "rent") || "rent";
        const allocation_basis =
            prompt("Allocation basis: meals_sold / sales_value / food_cost / prep_minutes / manual_weight", "meals_sold") ||
            "meals_sold";
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
    }

    async function saveReceiptSettings(payload) {
        const res = await posApi.saveReceiptSettings(payload);
        setReceiptSettings(res.receipt_settings || res.settings || res.data || res || payload);
        setMessage("Receipt settings saved.");
    }

  async function generateLabel() {
    const itemId = Number(prompt("Inventory item ID:", "0") || 0);
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

  return (
    <main className="pos-page">
      <header className="pos-header">
        <div>
          <span className="eyebrow">Store Manager</span>
          <h1>POS Manager Workspace</h1>
          <p>Manage shifts, cash-up, terminals, customers, discounts and stock labels.</p>
        </div>

        <nav className="header-actions">
          <a href="#/cashier">Cashier</a>
          <a href="#/orders">Orders</a>
          <button onClick={() => (window.location.href = "/dashboard")}>
            Back to FinSage
          </button>
        </nav>
      </header>

      {message && <div className="pos-message">{message}</div>}

      {loading && <div className="pos-message">Loading...</div>}

      <section className="manager-shell">
        <aside className="manager-sidebar">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active-tab" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </aside>

        <section className="manager-content">
          {tab === "overview" && (
            <OverviewTab
              openShifts={openShifts}
              terminals={terminals}
              customers={customers}
              priceLevels={priceLevels}
              promotions={promotions}
            />
          )}

          {tab === "sales" && <SalesTab />}

          {tab === "reports" && <ReportsTab />}

          {tab === "shifts" && (
            <ShiftsTab
              shifts={shifts}
              onRefresh={loadShifts}
              onCloseShift={closeShift}
            />
          )}

          {tab === "terminals" && (
            <TerminalsTab terminals={terminals} onCreate={createTerminal} />
          )}

          {tab === "customers" && (
            <CustomersTab
              customers={customers}
              onCreate={createCustomer}
              onSearch={loadCustomers}
            />
          )}

          {tab === "pricing" && (
            <PricingTab priceLevels={priceLevels} onCreate={createPriceLevel} />
          )}

            {tab === "recipes" && (
            <RecipesTab recipes={recipes} onCreate={createRecipe} />
            )}

            {tab === "costing" && (
            <CostingTab costPools={costPools} onCreate={createCostPool} />
            )}

          {tab === "promotions" && (
            <PromotionsTab promotions={promotions} onCreate={createPromotion} />
          )}

          {tab === "labels" && <LabelsTab onGenerate={generateLabel} />}

          {tab === "staff" && <StaffTab setMessage={setMessage} />}

          {tab === "attendance" && <AttendanceTab />}

            {tab === "settings" && (
            <section className="manager-workspace">
                <div className="workspace-head">
                <div>
                    <h2>POS Settings</h2>
                    <p>Configure receipts, printers, taxes, terminals and POS behaviour.</p>
                </div>
                </div>

                <section className="manager-grid">
                <ManagerCard
                    title="Receipt Settings"
                    value="Configure"
                    text="Receipt title, footer message, refund policy, returns policy and VAT notes."
                />

                <ManagerCard
                    title="Receipt Preview"
                    value="Preview"
                    text="Preview how customer receipts will appear before printing."
                />

                <ManagerCard
                    title="Printers"
                    value="Configure"
                    text="Receipt printers, kitchen printers and label printers."
                />

                <ManagerCard
                    title="Taxes"
                    value="Configure"
                    text="VAT display, tax invoice wording and fiscal receipt options."
                />

                <ManagerCard
                    title="Terminals"
                    value="Configure"
                    text="Terminal defaults, cash drawers and opening float amounts."
                />

                <ManagerCard
                    title="Cash Controls"
                    value="Configure"
                    text="Cash-up tolerances, variance approvals and supervisor overrides."
                />
                </section>

                <div className="manager-workspace" style={{ marginTop: 20 }}>
                <div className="workspace-head">
                    <div>
                    <h2>Receipt Settings</h2>
                    <p>Configure wording printed at the bottom of customer receipts.</p>
                    </div>

                    <button
                    className="scan-btn"
                    onClick={() => {
                        if (receiptSettings) {
                        onSaveReceiptSettings?.(receiptSettings);
                        }
                    }}
                    >
                    Save Settings
                    </button>
                </div>

                <div className="scan-card">
                    <label>Receipt Title</label>
                    <input
                    className="scan-input"
                    value={receiptSettings?.receipt_title || ""}
                    onChange={(e) =>
                        setReceiptSettings((prev) => ({
                        ...(prev || {}),
                        receipt_title: e.target.value,
                        }))
                    }
                    />

                    <label>Footer Message</label>
                    <textarea
                    className="scan-input"
                    rows={3}
                    value={receiptSettings?.footer_message || ""}
                    onChange={(e) =>
                        setReceiptSettings((prev) => ({
                        ...(prev || {}),
                        footer_message: e.target.value,
                        }))
                    }
                    />

                    <label>Returns Policy</label>
                    <textarea
                    className="scan-input"
                    rows={4}
                    value={receiptSettings?.returns_policy || ""}
                    onChange={(e) =>
                        setReceiptSettings((prev) => ({
                        ...(prev || {}),
                        returns_policy: e.target.value,
                        }))
                    }
                    />

                    <label>Refund Policy</label>
                    <textarea
                    className="scan-input"
                    rows={4}
                    value={receiptSettings?.refund_policy || ""}
                    onChange={(e) =>
                        setReceiptSettings((prev) => ({
                        ...(prev || {}),
                        refund_policy: e.target.value,
                        }))
                    }
                    />

                    <label>VAT Note</label>
                    <textarea
                    className="scan-input"
                    rows={3}
                    value={receiptSettings?.vat_note || ""}
                    onChange={(e) =>
                        setReceiptSettings((prev) => ({
                        ...(prev || {}),
                        vat_note: e.target.value,
                        }))
                    }
                    />
                </div>
                </div>

                <div className="manager-workspace" style={{ marginTop: 20 }}>
                <div className="workspace-head">
                    <div>
                    <h2>Receipt Preview</h2>
                    <p>Live preview of the receipt footer.</p>
                    </div>
                </div>

                <div className="summary-card">
                    <div>
                    <strong>
                        {receiptSettings?.receipt_title || "Tax Invoice / Receipt"}
                    </strong>
                    </div>

                    <div>
                    <span>Milk</span>
                    <strong>{money(25)}</strong>
                    </div>

                    <div>
                    <span>Bread</span>
                    <strong>{money(18)}</strong>
                    </div>

                    <div className="grand-total">
                    <span>Total</span>
                    <strong>{money(43)}</strong>
                    </div>

                    <div style={{ marginTop: 12 }}>
                    <small>{receiptSettings?.footer_message}</small>
                    </div>

                    <div style={{ marginTop: 12 }}>
                    <small>{receiptSettings?.returns_policy}</small>
                    </div>

                    <div style={{ marginTop: 12 }}>
                    <small>{receiptSettings?.refund_policy}</small>
                    </div>

                    <div style={{ marginTop: 12 }}>
                    <small>{receiptSettings?.vat_note}</small>
                    </div>
                </div>
                </div>
            </section>
            )}
        </section>
      </section>
    </main>
  );
}

function OverviewTab({ openShifts, terminals, customers, priceLevels, promotions }) {
  return (
    <section className="manager-grid">
      <ManagerCard title="Open Shifts" value={openShifts} text="Cashiers currently active." />
      <ManagerCard title="Terminals" value={terminals.length} text="Configured POS terminals." />
      <ManagerCard title="Customers" value={customers.length} text="Retail, wholesale and account profiles." />
      <ManagerCard title="Price Levels" value={priceLevels.length} text="Retail, wholesale, VIP and staff pricing." />
      <ManagerCard title="Promotions" value={promotions.length} text="Active and scheduled promotions." />
      <ManagerCard title="Cash-up" value="Review" text="Close shifts and compare expected vs counted cash." />
    </section>
  );
}

function ManagerCard({ title, value, text }) {
  return (
    <article className="manager-card">
      <h3>{title}</h3>
      <strong>{value}</strong>
      <p>{text}</p>
    </article>
  );
}

function SalesTab() {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Sales</h2>
          <p>Daily sales, transactions, payments, returns and cashier activity.</p>
        </div>
      </div>

      <section className="manager-grid">
        <ManagerCard title="Today Sales" value="0.00" text="Total POS sales captured today." />
        <ManagerCard title="Transactions" value="0" text="Number of completed sales." />
        <ManagerCard title="Returns" value="0.00" text="Refunds and reversed sales." />
        <ManagerCard title="Cash Payments" value="0.00" text="Cash received through POS." />
        <ManagerCard title="Card Payments" value="0.00" text="Card payments processed." />
        <ManagerCard title="Account Sales" value="0.00" text="Sales posted to customer accounts." />
      </section>
    </section>
  );
}

function ShiftsTab({ shifts, onRefresh, onCloseShift }) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Shifts & Cash-up</h2>
          <p>Review open shifts and close cashiers at end of day.</p>
        </div>
        <button className="scan-btn" onClick={onRefresh}>Refresh</button>
      </div>

      <div className="data-list">
        {shifts.length ? (
          shifts.map((s) => (
            <div className="data-row" key={s.id}>
              <div>
                <strong>{s.terminal_name || "Terminal"} — Shift #{s.id}</strong>
                <small>Cashier: {s.cashier_user_id || "-"} • Status: {s.status}</small>
              </div>
              <div>
                <strong>{money(s.expected_cash || 0)}</strong>
                {s.status === "open" && (
                  <button onClick={() => onCloseShift(s.id)}>Close</button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <strong>No shifts loaded</strong>
            <p>Click refresh.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function TerminalsTab({ terminals, onCreate }) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Terminals</h2>
          <p>Create and manage POS terminals.</p>
        </div>
        <button className="scan-btn" onClick={onCreate}>New Terminal</button>
      </div>

      <div className="data-list">
        {terminals.length ? (
          terminals.map((t) => (
            <div className="data-row" key={t.id}>
              <div>
                <strong>{t.name}</strong>
                <small>{t.terminal_code} • {t.branch_name || "Main"} • {t.location || ""}</small>
              </div>
              <span className="badge">{t.is_active ? "Active" : "Inactive"}</span>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <strong>No terminals</strong>
            <p>Create the first POS terminal.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ReportsTab() {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>POS Reports</h2>
          <p>Sales, products, cashiers, customers, discounts and margin analysis.</p>
        </div>
      </div>

      <section className="manager-grid">
        <ManagerCard title="Daily Sales" value="View" text="Sales by day, shift, terminal and cashier." />
        <ManagerCard title="Sales Per Product" value="View" text="Top products, slow movers, quantity sold and revenue." />
        <ManagerCard title="Sales Per Category" value="View" text="Category totals for retail or restaurant menu groups." />
        <ManagerCard title="Cashier Performance" value="View" text="Sales, discounts, voids, returns and cash-up variance." />
        <ManagerCard title="Customer Accounts" value="View" text="Account sales, balances, credit limits and collections." />
        <ManagerCard title="Discount Report" value="View" text="Manual discounts, promotions, bulk pricing and approvals." />
        <ManagerCard title="Returns Report" value="View" text="Returned items, refund method, restocked and not restocked." />
        <ManagerCard title="Stock Movement" value="View" text="Items sold, stock reduced and negative stock warnings." />
      </section>

      <div className="manager-workspace" style={{ marginTop: 18 }}>
        <h2>Mini Trading Summary</h2>
        <div className="summary-card">
          <div><span>Sales</span><strong>0.00</strong></div>
          <div><span>Returns</span><strong>0.00</strong></div>
          <div><span>Net Sales</span><strong>0.00</strong></div>
          <div><span>Cost of Items Sold</span><strong>0.00</strong></div>
          <div className="grand-total"><span>Trading Result</span><strong>0.00</strong></div>
        </div>
      </div>
    </section>
  );
}

function StaffTab({ setMessage }) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Staff & Access</h2>
          <p>Add employees and assign POS roles for retail or restaurant.</p>
        </div>
        <button className="scan-btn" onClick={() => setMessage("Connect this to company_invites with access_scope='pos'.")}>
          Add Staff
        </button>
      </div>

      <section className="manager-grid">
        <ManagerCard title="Cashiers" value="Manage" text="Can process sales, returns and payments." />
        <ManagerCard title="Store Managers" value="Manage" text="Can manage shifts, reports, pricing and staff." />
        <ManagerCard title="Waiters / Waitresses" value="Manage" text="Can take table, collection and delivery orders." />
        <ManagerCard title="Kitchen Users" value="Manage" text="Can view and update kitchen order status." />
        <ManagerCard title="Drivers" value="Manage" text="Can view assigned deliveries and update delivery status." />
      </section>
    </section>
  );
}

function AttendanceTab() {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Staff Attendance</h2>
          <p>Clock-in, clock-out, shift attendance and late arrivals.</p>
        </div>
        <button className="scan-btn">Clock In / Out</button>
      </div>

      <section className="manager-grid">
        <ManagerCard title="Clocked In" value="0" text="Staff currently on duty." />
        <ManagerCard title="Late Arrivals" value="0" text="Staff who clocked in after scheduled time." />
        <ManagerCard title="Open Shifts" value="0" text="Attendance linked to active POS shifts." />
        <ManagerCard title="Attendance Log" value="View" text="Daily clock-in and clock-out history." />
      </section>
    </section>
  );
}

function CustomersTab({ customers, onCreate, onSearch }) {
  const [query, setQuery] = useState("");

  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>POS Customers</h2>
          <p>Manage retail, wholesale and account customers.</p>
        </div>
        <button className="scan-btn" onClick={onCreate}>New Customer</button>
      </div>

      <div className="scan-card">
        <div className="scan-row">
          <input
            className="scan-input"
            placeholder="Search customer..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="scan-btn" onClick={() => onSearch(query)}>
            Search
          </button>
        </div>
      </div>

      <div className="data-list">
        {customers.length ? (
          customers.map((c) => (
            <div className="data-row" key={c.id}>
              <div>
                <strong>{c.customer_name}</strong>
                <small>{c.customer_type || "retail"} • {c.price_level || "retail"} • {c.phone || c.email || ""}</small>
              </div>
              <strong>{money(c.credit_limit || 0)}</strong>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <strong>No customers loaded</strong>
            <p>Search or create one.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function PricingTab({ priceLevels, onCreate }) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Pricing</h2>
          <p>Set retail, wholesale, VIP or staff price levels.</p>
        </div>
        <button className="scan-btn" onClick={onCreate}>New Price Level</button>
      </div>

      <div className="data-list">
        {priceLevels.length ? (
          priceLevels.map((p) => (
            <div className="data-row" key={p.id}>
              <div>
                <strong>{p.price_level}</strong>
                <small>{p.description || ""}</small>
              </div>
              <span className="badge">{p.is_active ? "Active" : "Inactive"}</span>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <strong>No price levels</strong>
            <p>Create wholesale, VIP or staff pricing.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function PromotionsTab({ promotions, onCreate }) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Promotions</h2>
          <p>Create discounts and promotion rules.</p>
        </div>
        <button className="scan-btn" onClick={onCreate}>New Promotion</button>
      </div>

      <div className="data-list">
        {promotions.length ? (
          promotions.map((p) => (
            <div className="data-row" key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <small>{p.promo_code} • {p.promo_type}</small>
              </div>
              <div>
                <strong>{Number(p.discount_percent || 0)}%</strong>
                <span className="badge">{p.is_active ? "Active" : "Inactive"}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <strong>No promotions loaded</strong>
            <p>Create active POS promotions.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function LabelsTab({ onGenerate }) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Barcode Labels</h2>
          <p>Generate and queue barcode labels for printing.</p>
        </div>
        <button className="scan-btn" onClick={onGenerate}>Generate Label</button>
      </div>

      <div className="empty-state">
        <strong>Label workflow</strong>
        <p>Generate or queue barcode label printing by item ID.</p>
      </div>
    </section>
  );
}

function ReceiptSettingsTab({ settings, onSave }) {
  const DEFAULTS = {
    receipt_title: "Tax Invoice / Receipt",
    footer_message: "Thank you for your business.",
    returns_policy:
      "Returns accepted within 7 days with original receipt. Items must be unused and in original condition.",
    refund_policy:
      "Refunds are issued via the original payment method. Management reserves the right to refuse non-compliant returns.",
    vat_note: "This document is not a tax invoice unless VAT details are displayed.",
    show_vat_no: true,
    show_cashier_name: true,
    show_customer_name: true,
  };

  const [form, setForm] = useState({ ...DEFAULTS, ...(settings || {}) });

  useEffect(() => {
    setForm({ ...DEFAULTS, ...(settings || {}) });
  }, [settings]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    await onSave(form);
  }

  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Receipt Settings</h2>
          <p>Update receipt wording, refund terms, return policy and display options.</p>
        </div>
        <button className="scan-btn" onClick={submit}>
          Save Receipt Settings
        </button>
      </div>

      <section className="manager-grid">
        <div className="scan-card">
          <label>Receipt Title</label>
          <input
            className="scan-input"
            value={form.receipt_title || ""}
            onChange={(e) => updateField("receipt_title", e.target.value)}
          />

          <label>Footer Message</label>
          <textarea
            className="scan-input"
            rows="3"
            value={form.footer_message || ""}
            onChange={(e) => updateField("footer_message", e.target.value)}
          />

          <label>Returns Policy</label>
          <textarea
            className="scan-input"
            rows="4"
            value={form.returns_policy || ""}
            onChange={(e) => updateField("returns_policy", e.target.value)}
          />

          <label>Refund Policy</label>
          <textarea
            className="scan-input"
            rows="4"
            value={form.refund_policy || ""}
            onChange={(e) => updateField("refund_policy", e.target.value)}
          />

          <label>VAT Note</label>
          <textarea
            className="scan-input"
            rows="3"
            value={form.vat_note || ""}
            onChange={(e) => updateField("vat_note", e.target.value)}
          />

          <label>
            <input
              type="checkbox"
              checked={!!form.show_vat_no}
              onChange={(e) => updateField("show_vat_no", e.target.checked)}
            />
            Show VAT number on receipt
          </label>

          <label>
            <input
              type="checkbox"
              checked={!!form.show_cashier_name}
              onChange={(e) => updateField("show_cashier_name", e.target.checked)}
            />
            Show cashier name
          </label>

          <label>
            <input
              type="checkbox"
              checked={!!form.show_customer_name}
              onChange={(e) => updateField("show_customer_name", e.target.checked)}
            />
            Show customer name
          </label>
        </div>

        <div className="scan-card">
          <h3>Receipt Preview</h3>
          <div className="receipt-preview">
            <strong>{form.receipt_title}</strong>
            <p>Item 1 ............ {money(25)}</p>
            <p>Item 2 ............ {money(18)}</p>
            <hr />
            <strong>Total: {money(43)}</strong>
            <p>{form.footer_message}</p>
            <p>{form.returns_policy}</p>
            <p>{form.refund_policy}</p>
            <p>{form.vat_note}</p>
          </div>
        </div>
      </section>
    </section>
  );
}

function RecipesTab({ recipes, onCreate }) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Recipes / Menu BOM</h2>
          <p>Link menu items to ingredient recipes for automatic food-cost tracing.</p>
        </div>
        <button className="scan-btn" onClick={onCreate}>New Recipe</button>
      </div>

      <div className="data-list">
        {recipes.length ? (
          recipes.map((r) => (
            <div className="data-row" key={r.id}>
              <div>
                <strong>{r.recipe_name || r.menu_item_name || "Recipe"}</strong>
                <small>{r.menu_item_name || ""} • Yield: {r.yield_qty || 1} {r.yield_uom || ""}</small>
              </div>
              <div>
                <strong>{money(r.sales_price || 0)}</strong>
                <span className="badge">{r.is_active ? "Active" : "Inactive"}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <strong>No recipes</strong>
            <p>Create recipes for meals, drinks, combos or prepared food items.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function CostingTab({ costPools, onCreate }) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Meal Costing</h2>
          <p>Allocate rent, electricity, water, labour and other overheads to menu items.</p>
        </div>
        <button className="scan-btn" onClick={onCreate}>New Cost Pool</button>
      </div>

      <div className="data-list">
        {costPools.length ? (
          costPools.map((p) => (
            <div className="data-row" key={p.id}>
              <div>
                <strong>{p.pool_name}</strong>
                <small>{p.pool_type} • {p.allocation_basis} • {p.period_start || ""} to {p.period_end || ""}</small>
              </div>
              <div>
                <strong>{money(p.amount || 0)}</strong>
                <span className="badge">{p.is_active ? "Active" : "Inactive"}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <strong>No cost pools</strong>
            <p>Add monthly rent, utilities, kitchen labour or other overhead pools.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function SettingsTab({ receiptSettings, onSaveReceiptSettings }) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>POS Settings</h2>
          <p>Configure receipts, printers, taxes, terminals and POS behaviour.</p>
        </div>
      </div>

      <ReceiptSettingsPanel
        settings={receiptSettings}
        onSave={onSaveReceiptSettings}
      />
    </section>
  );
}