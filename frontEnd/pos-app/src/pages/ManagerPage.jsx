
import { getCompanyContext, getPosMode } from "../config.js";
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
    const company = getCompanyContext();
    const mode = getPosMode(company);

    const isRestaurantLike =
    mode === "restaurant" ||
    mode === "club";
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
    const [modal, setModal] = useState(null);

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

  function openTerminalModal() {
    setModal({
      type: "terminal",
      title: "New Terminal",
      fields: [
        { key: "terminal_code", label: "Terminal Code", value: `TILL-${Date.now()}` },
        { key: "name", label: "Terminal Name", value: "" },
        { key: "branch_name", label: "Branch Name", value: "Main" },
      ],
    });
  }

  function openCustomerModal() {
    setModal({
      type: "customer",
      title: "New Customer",
      fields: [
        { key: "customer_name", label: "Customer Name", value: "" },
        { key: "customer_type", label: "Customer Type", value: "retail" },
        { key: "phone", label: "Phone", value: "" },
        { key: "email", label: "Email", value: "" },
      ],
    });
  }

  function openPriceLevelModal() {
    setModal({
      type: "price_level",
      title: "New Price Level",
      fields: [
        { key: "price_level", label: "Price Level Name", value: "wholesale" },
        { key: "description", label: "Description", value: "" },
      ],
    });
  }

  function openPromotionModal() {
    setModal({
      type: "promotion",
      title: "New Promotion",
      fields: [
        { key: "promo_code", label: "Promotion Code", value: `PROMO-${Date.now()}` },
        { key: "name", label: "Promotion Name", value: "" },
        { key: "discount_percent", label: "Discount Percent", value: "0" },
      ],
    });
  }

  function openBarcodeModal() {
    setModal({
      type: "barcode",
      title: "Generate Barcode Label",
      fields: [
        { key: "item_id", label: "Inventory Item ID", value: "" },
      ],
    });
  }

  async function handleModalSubmit(values) {
    if (modal.type === "terminal") {
      await posApi.createTerminal({
        terminal_code: values.terminal_code,
        name: values.name || values.terminal_code,
        branch_name: values.branch_name || "Main",
        location: "",
        cash_drawer_enabled: false,
        is_active: true,
      });
      setMessage("Terminal created.");
      await loadTerminals();
    }

    if (modal.type === "customer") {
      await posApi.createCustomer({
        customer_name: values.customer_name,
        customer_type: values.customer_type || "retail",
        phone: values.phone || "",
        email: values.email || "",
        price_level: values.customer_type === "wholesale" ? "wholesale" : "retail",
      });
      setMessage("Customer created.");
      await loadCustomers();
    }

    if (modal.type === "price_level") {
      await posApi.createPriceLevel({
        price_level: values.price_level,
        description: values.description || "",
        is_active: true,
      });
      setMessage("Price level created.");
      await loadPriceLevels();
    }

    if (modal.type === "promotion") {
      await posApi.createPromotion({
        promo_code: values.promo_code,
        name: values.name || values.promo_code,
        promo_type: "percent",
        discount_percent: Number(values.discount_percent || 0),
        discount_amount: 0,
        rules_json: {},
        is_active: true,
      });
      setMessage("Promotion created.");
      await loadPromotions();
    }

    if (modal.type === "barcode") {
      const itemId = Number(values.item_id || 0);
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

    if (modal.type === "recipe") {
      const menuItemId = Number(values.menu_item_id || 0);
      const ingredientItemId = Number(values.ingredient_item_id || 0);

      if (!menuItemId || !ingredientItemId) {
        setMessage("Menu item ID and ingredient item ID are required.");
        return;
      }

      await posApi.createRecipe({
        menu_item_id: menuItemId,
        recipe_name: values.recipe_name || "New Recipe",
        yield_qty: Number(values.yield_qty || 1),
        yield_uom: values.yield_uom || "portion",
        is_active: true,
        lines: [
          {
            ingredient_item_id: ingredientItemId,
            qty_required: Number(values.qty_required || 1),
            uom: values.uom || "",
            wastage_percent: 0,
          },
        ],
      });

      setMessage("Recipe created.");
      await loadRecipes();
    }

    if (modal.type === "cost_pool") {
      await posApi.createCostPool({
        pool_code: `POOL-${Date.now()}`,
        pool_name: values.pool_name || "Monthly Rent",
        pool_type: values.pool_type || "rent",
        allocation_basis: values.allocation_basis || "meals_sold",
        amount: Number(values.amount || 0),
        period_start: values.period_start,
        period_end: values.period_end,
        is_active: true,
      });

      setMessage("Cost pool created.");
      await loadCostPools();
    }

    if (modal.type === "close_shift") {
      await posApi.closeShift(modal.shiftId, {
        counted_cash: Number(values.counted_cash || 0),
      });

      setMessage("Shift closed.");
      await loadShifts();
    }

    setModal(null);
  }

  function openRecipeModal() {
    setModal({
      type: "recipe",
      title: "New Recipe / Menu BOM",
      fields: [
        { key: "menu_item_id", label: "Menu Item ID", value: "" },
        { key: "recipe_name", label: "Recipe Name", value: "New Recipe" },
        { key: "yield_qty", label: "Yield Quantity", value: "1" },
        { key: "yield_uom", label: "Yield UOM", value: "portion" },
        { key: "ingredient_item_id", label: "First Ingredient Item ID", value: "" },
        { key: "qty_required", label: "Ingredient Quantity Required", value: "1" },
        { key: "uom", label: "Ingredient UOM", value: "" },
      ],
    });
  }

  function openCostPoolModal() {
    const today = new Date().toISOString().slice(0, 10);

    setModal({
      type: "cost_pool",
      title: "New Cost Pool",
      fields: [
        { key: "pool_name", label: "Cost Pool Name", value: "Monthly Rent" },
        { key: "pool_type", label: "Pool Type", value: "rent" },
        { key: "allocation_basis", label: "Allocation Basis", value: "meals_sold" },
        { key: "amount", label: "Amount", value: "0" },
        { key: "period_start", label: "Period Start", value: today },
        { key: "period_end", label: "Period End", value: today },
      ],
    });
  }

  function openCloseShiftModal(shiftId) {
    setModal({
      type: "close_shift",
      title: "Close Shift",
      shiftId,
      fields: [
        { key: "counted_cash", label: "Counted Cash Amount", value: "0" },
      ],
    });
  }
    
  const visibleTabs = TABS.filter(([id]) => {
    if (["recipes", "costing"].includes(id)) {
      return isRestaurantLike;
    }
    return true;
  });

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
          {isRestaurantLike && (
            <a href="#/orders">Orders</a>
            )}
          <button onClick={() => (window.location.href = "/dashboard")}>
            Back to FinSage
          </button>
        </nav>
      </header>

      {message && <div className="pos-message">{message}</div>}

      {loading && <div className="pos-message">Loading...</div>}

      <section className="manager-shell">
        <aside className="manager-sidebar">
          {visibleTabs.map(([id, label]) => (
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
              onCloseShift={openCloseShiftModal}
            />
          )}

          {tab === "terminals" && (
            <TerminalsTab terminals={terminals} onCreate={openTerminalModal} />
          )}

          {tab === "customers" && (
            <CustomersTab customers={customers} onCreate={openCustomerModal} onSearch={loadCustomers} />
          )}

          {tab === "pricing" && (
            <PricingTab priceLevels={priceLevels} onCreate={openPriceLevelModal} />
          )}

            {tab === "recipes" && (
            <RecipesTab recipes={recipes} onCreate={openRecipeModal} />
            )}

            {tab === "costing" && (
            <CostingTab costPools={costPools} onCreate={openCostPoolModal} />
            )}

          {tab === "promotions" && (
            <PromotionsTab promotions={promotions} onCreate={openPromotionModal} />
          )}

          {tab === "labels" && <LabelsTab onGenerate={openBarcodeModal} />}

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
                <ManagerCard icon="🧾" title="Receipt Settings" value="Configure" text="Receipt title, footer message, refund policy, returns policy and VAT notes." />
                <ManagerCard icon="👁️" title="Receipt Preview" value="Preview" text="Preview how customer receipts will appear before printing." />
                <ManagerCard icon="🖨️" title="Printers" value="Configure" text="Receipt printers, kitchen printers and label printers." />
                <ManagerCard icon="🧮" title="Taxes" value="Configure" text="VAT display, tax invoice wording and fiscal receipt options." />
                <ManagerCard icon="🖥️" title="Terminals" value="Configure" text="Terminal defaults, cash drawers and opening float amounts." />
                <ManagerCard icon="💵" title="Cash Controls" value="Configure" text="Cash-up tolerances, variance approvals and supervisor overrides." />
              </section>

              <section className="settings-layout">
                <div className="settings-panel">
                  <div className="workspace-head">
                    <div>
                      <h2>Receipt Settings</h2>
                      <p>Configure wording printed at the bottom of customer receipts.</p>
                    </div>

                    <button
                      className="scan-btn"
                      onClick={() => {
                        if (receiptSettings) saveReceiptSettings(receiptSettings);
                      }}
                    >
                      Save Settings
                    </button>
                  </div>

                  <div className="settings-form-grid">
                    <label>
                      Receipt Title
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
                    </label>

                    <label>
                      Footer Message
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
                    </label>

                    <label>
                      Returns Policy
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
                    </label>

                    <label>
                      Refund Policy
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
                    </label>

                    <label className="span-2">
                      VAT Note
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
                    </label>
                  </div>
                </div>

                <div className="receipt-preview-card">
                  <div className="receipt-paper">
                    <h3>{receiptSettings?.receipt_title || "Tax Invoice / Receipt"}</h3>
                    <div className="receipt-line"><span>Milk</span><strong>{money(25)}</strong></div>
                    <div className="receipt-line"><span>Bread</span><strong>{money(18)}</strong></div>
                    <div className="receipt-total"><span>Total</span><strong>{money(43)}</strong></div>
                    <small>{receiptSettings?.footer_message}</small>
                    <small>{receiptSettings?.returns_policy}</small>
                    <small>{receiptSettings?.refund_policy}</small>
                    <small>{receiptSettings?.vat_note}</small>
                  </div>
                </div>
              </section>
            </section>
          )}
        </section>
      </section>
      {modal && (
        <FormModal
          modal={modal}
          onClose={() => setModal(null)}
          onSubmit={handleModalSubmit}
        />
      )}
    </main>
  );
}

function FormModal({ modal, onClose, onSubmit }) {
  const [values, setValues] = useState(
    Object.fromEntries((modal.fields || []).map((f) => [f.key, f.value || ""]))
  );

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-head">
          <h2>{modal.title}</h2>
          <button onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {(modal.fields || []).map((field) => (
            <label key={field.key}>
              {field.label}
              <input
                className="scan-input"
                value={values[field.key] || ""}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.key]: e.target.value,
                  }))
                }
              />
            </label>
          ))}
        </div>

        <div className="modal-footer">
          <button className="soft" onClick={onClose}>
            Cancel
          </button>
          <button className="success" onClick={() => onSubmit(values)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ openShifts, terminals, customers, priceLevels, promotions }) {
  return (
    <section className="manager-grid">
      <ManagerCard icon="🟢" title="Open Shifts" value={openShifts} text="Cashiers currently active." />
      <ManagerCard icon="🖥️" title="Terminals" value={terminals.length} text="Configured POS terminals." />
      <ManagerCard icon="👥" title="Customers" value={customers.length} text="Retail, wholesale and account profiles." />
      <ManagerCard icon="🏷️" title="Price Levels" value={priceLevels.length} text="Retail, wholesale, VIP and staff pricing." />
      <ManagerCard icon="🎁" title="Promotions" value={promotions.length} text="Active and scheduled promotions." />
      <ManagerCard icon="💵" title="Cash-up" value="Review" text="Close shifts and compare expected vs counted cash." />
    </section>
  );
}

function ManagerCard({ icon = "📊", title, value, text }) {
  return (
    <article className="manager-card">
      <div className="manager-card-icon">{icon}</div>
      <div>
        <h3>{title}</h3>
        <strong>{value}</strong>
        <p>{text}</p>
      </div>
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
        <ManagerCard icon="💰" title="Today Sales" value="0.00" text="Total POS sales captured today." />
        <ManagerCard icon="🧾" title="Transactions" value="0" text="Number of completed sales." />
        <ManagerCard icon="↩️" title="Returns" value="0.00" text="Refunds and reversed sales." />
        <ManagerCard icon="💵" title="Cash Payments" value="0.00" text="Cash received through POS." />
        <ManagerCard icon="💳" title="Card Payments" value="0.00" text="Card payments processed." />
        <ManagerCard icon="👤" title="Account Sales" value="0.00" text="Sales posted to customer accounts." />
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

      <section className="manager-grid">
        {terminals.length ? terminals.map((t) => (
          <ManagerCard
            key={t.id}
            icon="🖥️"
            title={t.name || "Terminal"}
            value={t.terminal_code || "Code"}
            text={`${t.branch_name || "Main"} • ${t.is_active ? "Active" : "Inactive"}`}
          />
        )) : (
          <ManagerCard icon="🖥️" title="No Terminals" value="Create" text="Create the first POS terminal." />
        )}
      </section>
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
        <ManagerCard icon="📅" title="Daily Sales" value="View" text="Sales by day, shift, terminal and cashier." />
        <ManagerCard icon="📦" title="Sales Per Product" value="View" text="Top products, slow movers, quantity sold and revenue." />
        <ManagerCard icon="🗂️" title="Sales Per Category" value="View" text="Category totals for retail or restaurant menu groups." />
        <ManagerCard icon="👨‍💼" title="Cashier Performance" value="View" text="Sales, discounts, voids, returns and cash-up variance." />
        <ManagerCard icon="👥" title="Customer Accounts" value="View" text="Account sales, balances, credit limits and collections." />
        <ManagerCard icon="🏷️" title="Discount Report" value="View" text="Manual discounts, promotions, bulk pricing and approvals." />
        <ManagerCard icon="↩️" title="Returns Report" value="View" text="Returned items, refund method, restocked and not restocked." />
        <ManagerCard icon="📉" title="Stock Movement" value="View" text="Items sold, stock reduced and negative stock warnings." />
      </section>

      <div className="manager-workspace" style={{ marginTop: 18 }}>
        <div className="workspace-head">
          <div>
            <h2>Mini Trading Summary</h2>
            <p>Quick trading position from POS sales and item costs.</p>
          </div>
        </div>

        <section className="manager-grid">
          <ManagerCard icon="💰" title="Sales" value="0.00" text="Gross POS sales for the selected period." />
          <ManagerCard icon="↩️" title="Returns" value="0.00" text="Refunds and reversed POS transactions." />
          <ManagerCard icon="🧾" title="Net Sales" value="0.00" text="Sales after returns and reversals." />
          <ManagerCard icon="📦" title="Cost of Items Sold" value="0.00" text="Inventory cost linked to POS sales." />
          <ManagerCard icon="📊" title="Trading Result" value="0.00" text="Net sales less cost of items sold." />
        </section>
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
        <ManagerCard icon="💳" title="Cashiers" value="Manage" text="Sales, returns and payments." />
        <ManagerCard icon="🧑‍💼" title="Managers" value="Manage" text="Reporting and approvals." />
        <ManagerCard icon="🍽️" title="Waiters" value="Manage" text="Tables and orders." />
        <ManagerCard icon="👨‍🍳" title="Kitchen" value="Manage" text="Kitchen production." />
        <ManagerCard icon="🚚" title="Drivers" value="Manage" text="Deliveries and dispatch." />
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
        <ManagerCard icon="🟢" title="Clocked In" value="0" text="Currently on duty." />
        <ManagerCard icon="⏰" title="Late Arrivals" value="0" text="Arrived after shift start." />
        <ManagerCard icon="🔄" title="Open Shifts" value="0" text="Linked POS shifts." />
        <ManagerCard icon="📋" title="Attendance Log" value="View" text="Daily attendance history." />
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
          <button className="scan-btn" onClick={() => onSearch(query)}>Search</button>
        </div>
      </div>

      <section className="manager-grid">
        {customers.length ? customers.map((c) => (
          <ManagerCard
            key={c.id}
            icon="👥"
            title={c.customer_name || "Customer"}
            value={c.customer_type || "Retail"}
            text={`${c.price_level || "retail"} • ${c.phone || c.email || "No contact"}`}
          />
        )) : (
          <ManagerCard icon="👥" title="No Customers" value="Create" text="Search or create a customer profile." />
        )}
      </section>
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

      <section className="manager-grid">
        {priceLevels.length ? priceLevels.map((p) => (
          <ManagerCard
            key={p.id}
            icon="🏷️"
            title={p.price_level || "Price Level"}
            value={p.is_active ? "Active" : "Inactive"}
            text={p.description || "Custom POS pricing level."}
          />
        )) : (
          <ManagerCard icon="🏷️" title="No Price Levels" value="Create" text="Create wholesale, VIP or staff pricing." />
        )}
      </section>
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

      <section className="manager-grid">
        {promotions.length ? promotions.map((p) => (
          <ManagerCard
            key={p.id}
            icon="🎁"
            title={p.name || "Promotion"}
            value={`${Number(p.discount_percent || 0)}%`}
            text={`${p.promo_code || "Promo"} • ${p.is_active ? "Active" : "Inactive"}`}
          />
        )) : (
          <ManagerCard icon="🎁" title="No Promotions" value="Create" text="Create active POS promotions." />
        )}
      </section>
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

      <section className="manager-grid">
        {recipes.length ? recipes.map((r) => (
          <ManagerCard
            key={r.id}
            icon="🍽️"
            title={r.recipe_name || r.menu_item_name || "Recipe"}
            value={`${r.yield_qty || 1} ${r.yield_uom || "portion"}`}
            text={r.menu_item_name || "Menu recipe / bill of materials."}
          />
        )) : (
          <ManagerCard icon="🍽️" title="No Recipes" value="Create" text="Create recipes for meals, drinks or combos." />
        )}
      </section>
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

      <section className="manager-grid">
        {costPools.length ? costPools.map((p) => (
          <ManagerCard
            key={p.id}
            icon="🧮"
            title={p.pool_name || "Cost Pool"}
            value={money(p.amount || 0)}
            text={`${p.pool_type || "other"} • ${p.allocation_basis || "manual_weight"}`}
          />
        )) : (
          <ManagerCard icon="🧮" title="No Cost Pools" value="Create" text="Add rent, utilities, labour or other overhead pools." />
        )}
      </section>
    </section>
  );
}
