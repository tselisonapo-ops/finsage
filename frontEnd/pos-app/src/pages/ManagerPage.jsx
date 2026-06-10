
import { getCompanyContext, getPosMode } from "../config.js";
import { useEffect, useMemo, useState } from "react";
import { posApi } from "../services/posApi.js";
import { money } from "../utils/currency.js";

const RETAIL_TABS = [
  ["overview", "Overview"],
  ["sales", "Sales"],
  ["reports", "Reports"],

  ["inventory", "Inventory"],
  ["stock_count", "Stock Count"],
  ["labels", "Barcode Labels"],
  ["pricing", "Pricing"],
  ["promotions", "Promotions"],

  ["customers", "Customers"],

  ["shifts", "Shifts & Cash-up"],
  ["terminals", "Terminals"],
  ["staff", "Staff & Access"],
  ["attendance", "Attendance"],

  ["settings", "Settings"],
];

const RESTAURANT_TABS = [
  ["overview", "Overview"],

  ["orders", "Orders"],
  ["tables", "Tables"],
  ["kitchen", "Kitchen"],

  ["sales", "Sales"],
  ["reports", "Reports"],

  ["recipes", "Recipes"],
  ["costing", "Meal Costing"],
  ["inventory", "Inventory"],
  ["purchasing", "Purchasing"],

  ["customers", "Customers"],
  ["pricing", "Pricing"],
  ["promotions", "Promotions"],

  ["shifts", "Shifts & Cash-up"],
  ["terminals", "Terminals"],
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
  const [reportView, setReportView] = useState(null);
  const [settingsView, setSettingsView] = useState(null);

  const [ordersSummary, setOrdersSummary] = useState({});
  const [tableSections, setTableSections] = useState([]);
  const [tables, setTables] = useState([]);
  const [kitchenTickets, setKitchenTickets] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [stockCounts, setStockCounts] = useState([]);
  const [purchasingSummary, setPurchasingSummary] = useState({});

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
      if (activeTab === "inventory") await loadInventory();
      if (activeTab === "stock_count") await loadStockCounts();
      if (activeTab === "orders") await loadOrdersSummary();
      if (activeTab === "tables") await loadTables();
      if (activeTab === "kitchen") await loadKitchenQueue();
      if (activeTab === "purchasing") await loadPurchasing();

      if (activeTab === "tables") {
        await Promise.allSettled([
          loadTableSections(),
          loadTables(),
        ]);
      }

      if (activeTab === "settings") {
        await Promise.allSettled([
          loadReceiptSettings(),
          loadTableSections(),
          loadTables(),
        ]);
      }
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

  async function loadTableSections() {
    const res = await posApi.listTableSections(true);
    setTableSections(res.sections || []);
  }

  async function loadTables() {
    const res = await posApi.listTables(true);
    setTables(res.tables || []);
  }

  async function loadOrdersSummary() {
    try {
      const res = await posApi.getOrdersSummary?.();
      setOrdersSummary(res?.summary || res || {});
    } catch {
      setOrdersSummary({
        open_tables: 0,
        collections: 0,
        deliveries: 0,
        completed_today: 0,
        cancelled: 0,
        bill_requested: 0,
      });
    }
  }

  async function loadKitchenQueue() {
    try {
      const res = await posApi.listKitchenQueue?.();
      setKitchenTickets(res?.tickets || res?.orders || []);
    } catch {
      setKitchenTickets([]);
    }
  }

  async function loadInventory() {
    try {
      const res = await posApi.listInventoryItems?.();
      setInventoryItems(res?.items || res?.inventory || []);
    } catch {
      setInventoryItems([]);
    }
  }

  async function loadStockCounts() {
    try {
      const res = await posApi.listStockCounts?.();
      setStockCounts(res?.counts || []);
    } catch {
      setStockCounts([]);
    }
  }

  async function loadPurchasing() {
    try {
      const res = await posApi.getPurchasingSummary?.();
      setPurchasingSummary(res?.summary || res || {});
    } catch {
      setPurchasingSummary({
        suppliers: 0,
        purchase_orders: 0,
        goods_received: 0,
        outstanding_deliveries: 0,
        purchase_value: 0,
        price_variances: 0,
      });
    }
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
    
  const visibleTabs = isRestaurantLike ? RESTAURANT_TABS : RETAIL_TABS;

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
              isRestaurantLike={isRestaurantLike}
              openShifts={openShifts}
              terminals={terminals}
              customers={customers}
              priceLevels={priceLevels}
              promotions={promotions}
            />
          )}

          {tab === "sales" && <SalesTab />}

          {tab === "reports" && (
            <ReportsTab
              reportView={reportView}
              setReportView={setReportView}
            />
          )}

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

          {tab === "orders" && isRestaurantLike && <OrdersManagerTab />}

          {tab === "tables" && isRestaurantLike && (
            <TablesTab
              tables={tables}
              sections={tableSections}
              onRefresh={() => Promise.allSettled([loadTableSections(), loadTables()])}
            />
          )}

          {tab === "kitchen" && isRestaurantLike && <KitchenTab />}

          {tab === "inventory" && <InventoryTab isRestaurantLike={isRestaurantLike} />}

          {tab === "stock_count" && !isRestaurantLike && <StockCountTab />}

          {tab === "purchasing" && isRestaurantLike && <PurchasingTab />}

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

                <ManagerCard
                  icon="🧾"
                  title="Receipt Settings"
                  value="Configure"
                  text="Receipt title, footer message, refund policy, returns policy and VAT notes."
                  onClick={() => setSettingsView("receipt")}
                />

                <ManagerCard
                  icon="👁️"
                  title="Receipt Preview"
                  value="Preview"
                  text="Preview how customer receipts will appear before printing."
                  onClick={() => setSettingsView("preview")}
                />

                <ManagerCard
                  icon="🖨️"
                  title="Printers"
                  value="Configure"
                  text="Receipt printers, kitchen printers and barcode label printers."
                  onClick={() => setSettingsView("printers")}
                />

                <ManagerCard
                  icon="🧮"
                  title="Taxes"
                  value="Configure"
                  text="VAT inclusive/exclusive pricing, tax invoice wording and fiscal receipt options."
                  onClick={() => setSettingsView("taxes")}
                />

                <ManagerCard
                  icon="🖥️"
                  title="Terminals"
                  value="Configure"
                  text="Terminal defaults, opening float, cash drawers and shift rules."
                  onClick={() => setSettingsView("terminals")}
                />

                <ManagerCard
                  icon="💵"
                  title="Cash Controls"
                  value="Configure"
                  text="Cash-up tolerances, variance approvals and supervisor overrides."
                  onClick={() => setSettingsView("cash_controls")}
                />

                {isRestaurantLike && (
                  <>
                    <ManagerCard
                      icon="🪑"
                      title="Table Settings"
                      value="Configure"
                      text="Dining sections, tables, seating capacity and reservation rules."
                      onClick={() => setSettingsView("tables")}
                    />

                    <ManagerCard
                      icon="👨‍🍳"
                      title="Kitchen Routing"
                      value="Configure"
                      text="Send food, drinks and desserts to different preparation stations."
                      onClick={() => setSettingsView("kitchen")}
                    />

                    <ManagerCard
                      icon="🧑‍🍽️"
                      title="Waiter Rules"
                      value="Configure"
                      text="Table assignments, waiter permissions and service workflow."
                      onClick={() => setSettingsView("waiters")}
                    />

                    <ManagerCard
                      icon="🚚"
                      title="Delivery Rules"
                      value="Configure"
                      text="Delivery zones, dispatch rules, drivers and delivery fees."
                      onClick={() => setSettingsView("delivery")}
                    />
                  </>
                )}

                {!isRestaurantLike && (
                  <>
                    <ManagerCard
                      icon="🏷️"
                      title="Barcode Settings"
                      value="Configure"
                      text="Barcode formats, shelf labels and item lookup rules."
                      onClick={() => setSettingsView("barcode")}
                    />

                    <ManagerCard
                      icon="⚖️"
                      title="Scale Integration"
                      value="Configure"
                      text="Weighted items, produce scales and barcode weight parsing."
                      onClick={() => setSettingsView("scale")}
                    />

                    <ManagerCard
                      icon="🖥️"
                      title="Customer Display"
                      value="Configure"
                      text="Customer-facing display, promotional screens and checkout display."
                      onClick={() => setSettingsView("display")}
                    />
                  </>
                )}

              </section>

              {settingsView === "receipt" && (
                <ReceiptSettingsTab
                  settings={receiptSettings}
                  onSave={saveReceiptSettings}
                />
              )}

              {settingsView === "preview" && (
                <ReceiptPreviewTab />
              )}

              {settingsView === "printers" && (
                <PrinterSettingsTab />
              )}

              {settingsView === "taxes" && (
                <PosTaxSettingsTab />
              )}

              {settingsView === "terminals" && (
                <PosTerminalSettingsTab />
              )}

              {settingsView === "cash_controls" && (
                <CashControlSettingsTab />
              )}

              {settingsView === "tables" && (
                <TableSettingsTab
                  sections={tableSections}
                  tables={tables}
                  onRefresh={() => Promise.allSettled([loadTableSections(), loadTables()])}
                />
              )}

              {settingsView === "kitchen" && (
                <KitchenRoutingSettingsTab />
              )}

              {settingsView === "waiters" && (
                <WaiterSettingsTab />
              )}

              {settingsView === "delivery" && (
                <DeliverySettingsTab />
              )}

              {settingsView === "barcode" && (
                <BarcodeSettingsTab />
              )}

              {settingsView === "scale" && (
                <ScaleSettingsTab />
              )}

              {settingsView === "display" && (
                <CustomerDisplaySettingsTab />
              )}
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

function OverviewTab({ isRestaurantLike, openShifts, terminals, customers, priceLevels, promotions }) {
  if (isRestaurantLike) {
    return (
      <section className="manager-grid">
        <ManagerCard icon="💰" title="Sales Today" value="0.00" text="Restaurant sales captured today." />
        <ManagerCard icon="🍽️" title="Open Orders" value="0" text="Active table, collection and delivery orders." />
        <ManagerCard icon="🪑" title="Occupied Tables" value="0" text="Tables currently in use." />
        <ManagerCard icon="👨‍🍳" title="Kitchen Queue" value="0" text="Orders waiting or preparing in kitchen." />
        <ManagerCard icon="🧑‍🍽️" title="Active Waiters" value="0" text="Waiters currently on duty." />
        <ManagerCard icon="🧾" title="Average Ticket" value="0.00" text="Average spend per restaurant order." />
      </section>
    );
  }

  return (
    <section className="manager-grid">
      <ManagerCard icon="💰" title="Sales Today" value="0.00" text="Retail sales captured today." />
      <ManagerCard icon="🧾" title="Transactions" value="0" text="Number of completed sales today." />
      <ManagerCard icon="👥" title="Customers Served" value={customers.length} text="Customers served or captured." />
      <ManagerCard icon="📦" title="Top Selling Item" value="-" text="Best performing item today." />
      <ManagerCard icon="🟢" title="Open Shifts" value={openShifts} text="Cashiers currently active." />
      <ManagerCard icon="📊" title="Gross Margin" value="0.00%" text="Sales margin from POS activity." />
    </section>
  );
}

function ManagerCard({ icon = "📊", title, value, text, onClick }) {
  return (
    <article
      className={`manager-card ${onClick ? "clickable-card" : ""}`}
      onClick={onClick}
    >
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

function ReportsTab({ reportView, setReportView }) {
  const reports = [
    ["daily_sales", "📅", "Daily Sales", "Sales by day, shift, terminal and cashier."],
    ["sales_product", "📦", "Sales Per Product", "Top products, slow movers, quantity sold and revenue."],
    ["sales_category", "🗂️", "Sales Per Category", "Category totals for retail or restaurant menu groups."],
    ["cashier_performance", "👨‍💼", "Cashier Performance", "Sales, discounts, voids, returns and cash-up variance."],
    ["customer_accounts", "👥", "Customer Accounts", "Account sales, balances, credit limits and collections."],
    ["discount_report", "🏷️", "Discount Report", "Manual discounts, promotions, bulk pricing and approvals."],
    ["returns_report", "↩️", "Returns Report", "Returned items, refund method, restocked and not restocked."],
    ["stock_movement", "📉", "Stock Movement", "Items sold, stock reduced and negative stock warnings."],
  ];

  if (reportView) {
    return (
      <ReportGridScreen
        reportView={reportView}
        onBack={() => setReportView(null)}
      />
    );
  }

  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>POS Reports</h2>
          <p>Sales, products, cashiers, customers, discounts and margin analysis.</p>
        </div>
      </div>

      <section className="manager-grid">
        {reports.map(([id, icon, title, text]) => (
          <ManagerCard
            key={id}
            icon={icon}
            title={title}
            value="View"
            text={text}
            onClick={() => setReportView(id)}
          />
        ))}
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

function ReportGridScreen({ reportView, onBack }) {
  const titles = {
    daily_sales: "Daily Sales Report",
    sales_product: "Sales Per Product",
    sales_category: "Sales Per Category",
    cashier_performance: "Cashier Performance",
    customer_accounts: "Customer Accounts",
    discount_report: "Discount Report",
    returns_report: "Returns Report",
    stock_movement: "Stock Movement",
  };

  const columns = {
    daily_sales: ["Date", "Shift", "Terminal", "Cashier", "Sales", "Payments"],
    sales_product: ["Product", "SKU", "Qty Sold", "Sales", "Cost", "Gross Profit", "Margin"],
    sales_category: ["Category", "Qty Sold", "Sales", "Cost", "Gross Profit", "Margin"],
    cashier_performance: ["Cashier", "Sales", "Discounts", "Returns", "Cash Variance"],
    customer_accounts: ["Customer", "Type", "Account Sales", "Balance", "Credit Limit"],
    discount_report: ["Promotion", "Type", "Discount", "Transactions", "Value"],
    returns_report: ["Date", "Receipt", "Item", "Reason", "Refund"],
    stock_movement: ["Item", "SKU", "Opening", "Sold", "Closing", "Sales", "Cost"],
  };

  const sampleRows = {
    daily_sales: [["-", "-", "-", "-", "0.00", "0.00"]],
    sales_product: [["No products sold yet", "-", "0", "0.00", "0.00", "0.00", "0.00%"]],
    sales_category: [["No categories yet", "0", "0.00", "0.00", "0.00", "0.00%"]],
    cashier_performance: [["No cashier activity yet", "0.00", "0.00", "0.00", "0.00"]],
    customer_accounts: [["No customer account sales yet", "-", "0.00", "0.00", "0.00"]],
    discount_report: [["No discounts used yet", "-", "0.00", "0", "0.00"]],
    returns_report: [["No returns yet", "-", "-", "-", "0.00"]],
    stock_movement: [["No stock movement yet", "-", "0", "0", "0", "0.00", "0.00"]],
  };

  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>{titles[reportView] || "POS Report"}</h2>
          <p>Detailed report grid for review, filtering and export.</p>
        </div>
        <button className="scan-btn" onClick={onBack}>
          Back to Reports
        </button>
      </div>

      <section className="report-toolbar">
        <input className="scan-input" placeholder="Search item, cashier, customer..." />
        <input className="scan-input" type="date" />
        <input className="scan-input" type="date" />
        <button className="scan-btn">Apply</button>
        <button className="scan-btn">Export CSV</button>
        <button className="scan-btn">Print</button>
      </section>

      <section className="manager-grid">
        <ManagerCard icon="💰" title="Total Sales" value="0.00" text="Revenue from selected POS sales." />
        <ManagerCard icon="📦" title="Total Cost" value="0.00" text="Cost of items sold for those sales." />
        <ManagerCard icon="📊" title="Gross Profit" value="0.00" text="Sales less cost of items sold." />
        <ManagerCard icon="📈" title="Margin" value="0.00%" text="Gross profit as percentage of sales." />
      </section>

      <div className="report-table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              {(columns[reportView] || []).map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {(sampleRows[reportView] || []).map((row, idx) => (
              <tr key={idx}>
                {row.map((cell, cidx) => (
                  <td key={cidx}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
          <p>Add POS employees, assign roles, control access and review staff readiness.</p>
        </div>
        <button className="scan-btn" onClick={() => setMessage("Connect this to company_invites with access_scope='pos'.")}>
          Add Staff
        </button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="💳" title="Cashiers" value="0" text="Users who can process sales, returns and payments." />
        <ManagerCard icon="🧑‍💼" title="Managers" value="0" text="Users who can manage shifts, pricing, reports and approvals." />
        <ManagerCard icon="🍽️" title="Waiters" value="0" text="Users who can take table, collection and delivery orders." />
        <ManagerCard icon="👨‍🍳" title="Kitchen Users" value="0" text="Users who can view and update kitchen order status." />
        <ManagerCard icon="🚚" title="Drivers" value="0" text="Users who can manage deliveries and dispatch updates." />
      </section>

      <section className="settings-layout" style={{ marginTop: 18 }}>
        <div className="settings-panel">
          <div className="workspace-head">
            <div>
              <h2>Access Roles</h2>
              <p>Suggested POS roles and what each role can do.</p>
            </div>
          </div>

          <section className="manager-grid">
            <ManagerCard icon="🛒" title="Sales Access" value="Cashier" text="Create sales, returns, quotes and customer payments." />
            <ManagerCard icon="🍽️" title="Order Access" value="Waiter" text="Create table, collection and delivery orders." />
            <ManagerCard icon="🧾" title="Shift Access" value="Supervisor" text="Open shifts, close cashiers and approve cash-up differences." />
            <ManagerCard icon="📊" title="Report Access" value="Manager" text="View sales reports, margin reports and staff performance." />
          </section>
        </div>

        <div className="receipt-preview-card">
          <div className="receipt-paper">
            <h3>Staff Setup Checklist</h3>
            <div className="receipt-line"><span>Cashiers created</span><strong>0</strong></div>
            <div className="receipt-line"><span>Terminals assigned</span><strong>0</strong></div>
            <div className="receipt-line"><span>PINs configured</span><strong>0</strong></div>
            <div className="receipt-line"><span>Active staff</span><strong>0</strong></div>
            <div className="receipt-total"><span>Status</span><strong>Pending</strong></div>
            <small>Add staff, assign POS roles and configure employee PINs before going live.</small>
          </div>
        </div>
      </section>

      <section className="manager-workspace" style={{ marginTop: 18 }}>
        <div className="workspace-head">
          <div>
            <h2>Waiter Table Assignments</h2>
            <p>Assign restaurant tables or sections to waiters and waitresses.</p>
          </div>
          <button
            className="scan-btn"
            onClick={() => setMessage("Next: connect this to POS tables and waiter assignments.")}
          >
            Assign Table
          </button>
        </div>

        <section className="manager-grid">
          <ManagerCard icon="🍽️" title="Tables Assigned" value="0" text="Tables currently allocated to waiters." />
          <ManagerCard icon="🧑‍🍽️" title="Active Waiters" value="0" text="Waiters available for table service." />
          <ManagerCard icon="🪑" title="Unassigned Tables" value="0" text="Tables not yet allocated to staff." />
          <ManagerCard icon="📍" title="Sections" value="0" text="Dining areas such as floor, patio, bar or VIP." />
        </section>

        <div className="report-table-wrap" style={{ marginTop: 16 }}>
          <table className="report-table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Table</th>
                <th>Assigned Waiter</th>
                <th>Status</th>
                <th>Open Orders</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Main Floor</td>
                <td>Table 1</td>
                <td>Unassigned</td>
                <td>Available</td>
                <td>0</td>
              </tr>
            </tbody>
          </table>
        </div>
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

    vat_note:
      "This document is not a tax invoice unless VAT details are displayed.",

    show_vat_no: true,
    show_cashier_name: true,
    show_customer_name: true,

    // NEW

    slip_template: "retail_classic",

    order_template: "restaurant_order",

    kitchen_ticket_template: "kitchen_ticket",

    show_logo: true,

    show_motto: true,

    show_socials: false,

    logo_position: "top_center",
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
          <label>Slip Template</label>
          <select
            className="scan-input"
            value={form.slip_template || "retail_classic"}
            onChange={(e) => updateField("slip_template", e.target.value)}
          >
            <option value="retail_classic">Retail Classic</option>
            <option value="retail_compact">Retail Compact</option>
            <option value="retail_modern">Retail Modern</option>

            <option value="restaurant_bill">Restaurant Bill</option>
            <option value="kitchen_ticket">Kitchen Ticket</option>
            <option value="delivery_slip">Delivery Slip</option>
          </select>

          <label>Order Template</label>
          <select
            className="scan-input"
            value={form.order_template || "restaurant_order"}
            onChange={(e) => updateField("order_template", e.target.value)}
          >
            <option value="restaurant_order">Restaurant Order</option>
            <option value="table_bill">Table Bill</option>
            <option value="delivery_slip">Delivery Slip</option>
          </select>

          <label>Kitchen Ticket Template</label>
          <select
            className="scan-input"
            value={form.kitchen_ticket_template || "kitchen_ticket"}
            onChange={(e) => updateField("kitchen_ticket_template", e.target.value)}
          >
            <option value="kitchen_ticket">Kitchen Ticket</option>
            <option value="compact_kitchen">Compact Kitchen</option>
            <option value="detailed_kitchen">Detailed Kitchen</option>
          </select>

          <label>
            <input
              type="checkbox"
              checked={!!form.show_logo}
              onChange={(e) => updateField("show_logo", e.target.checked)}
            />
            Show Company Logo
          </label>

          <label>
            <input
              type="checkbox"
              checked={!!form.show_motto}
              onChange={(e) => updateField("show_motto", e.target.checked)}
            />
            Show Company Motto
          </label>

          <label>
            <input
              type="checkbox"
              checked={!!form.show_socials}
              onChange={(e) => updateField("show_socials", e.target.checked)}
            />
            Show Contact Details
          </label>

          <label>Logo Position</label>
          <select
            className="scan-input"
            value={form.logo_position || "top_center"}
            onChange={(e) => updateField("logo_position", e.target.value)}
          >
            <option value="top_center">Top Centre</option>
            <option value="top_left">Top Left</option>
            <option value="hidden">Hide Logo</option>
          </select>

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

function ReceiptPreviewTab() {
  return (
    <section className="manager-workspace" style={{ marginTop: 18 }}>
      <div className="workspace-head">
        <div>
          <h2>Receipt Preview</h2>
          <p>Preview how the receipt will look before printing.</p>
        </div>
      </div>

      <div className="receipt-preview-card">
        <div className="receipt-paper">
          <h3>Tax Invoice / Receipt</h3>
          <div className="receipt-line"><span>Item 1</span><strong>{money(25)}</strong></div>
          <div className="receipt-line"><span>Item 2</span><strong>{money(18)}</strong></div>
          <div className="receipt-line"><span>VAT</span><strong>{money(5.61)}</strong></div>
          <div className="receipt-total"><span>Total</span><strong>{money(43)}</strong></div>
          <small>Thank you for your business.</small>
        </div>
      </div>
    </section>
  );
}

function PrinterSettingsTab() {
  return (
    <section className="manager-workspace" style={{ marginTop: 18 }}>
      <div className="workspace-head">
        <div>
          <h2>Printer Settings</h2>
          <p>Configure receipt, kitchen and label printers.</p>
        </div>
        <button className="scan-btn">Save Printer Settings</button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="🧾" title="Receipt Printer" value="Not Set" text="Default customer receipt printer." />
        <ManagerCard icon="👨‍🍳" title="Kitchen Printer" value="Not Set" text="Used for restaurant kitchen orders." />
        <ManagerCard icon="🏷️" title="Label Printer" value="Not Set" text="Used for barcode and shelf labels." />
      </section>
    </section>
  );
}

function PosTaxSettingsTab() {
  return (
    <section className="manager-workspace" style={{ marginTop: 18 }}>
      <div className="workspace-head">
        <div>
          <h2>POS Tax Settings</h2>
          <p>Choose whether item prices include VAT or VAT is added on top.</p>
        </div>
        <button className="scan-btn">Save Tax Settings</button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="✅" title="VAT Inclusive" value="Retail" text="Selling price already includes VAT." />
        <ManagerCard icon="➕" title="VAT Exclusive" value="Wholesale" text="VAT is added above the item price." />
        <ManagerCard icon="🧾" title="Receipt Display" value="Cost + VAT + Total" text="Show tax breakdown on receipt." />
      </section>
    </section>
  );
}

function PosTerminalSettingsTab() {
  return (
    <section className="manager-workspace" style={{ marginTop: 18 }}>
      <div className="workspace-head">
        <div>
          <h2>Terminal Settings</h2>
          <p>Configure terminal defaults, cash drawers and opening floats.</p>
        </div>
        <button className="scan-btn">Save Terminal Settings</button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="🖥️" title="Default Terminal" value="Not Set" text="Terminal used when POS opens." />
        <ManagerCard icon="💵" title="Opening Float" value="0.00" text="Default cash float per shift." />
        <ManagerCard icon="🔐" title="Cash Drawer" value="Disabled" text="Require drawer control for cash sales." />
      </section>
    </section>
  );
}

function CashControlSettingsTab() {
  return (
    <section className="manager-workspace" style={{ marginTop: 18 }}>
      <div className="workspace-head">
        <div>
          <h2>Cash Control Settings</h2>
          <p>Set approval rules for cash-up differences, returns and overrides.</p>
        </div>
        <button className="scan-btn">Save Cash Controls</button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="↩️" title="Returns" value="Manager Approval" text="Cashier returns require approval." />
        <ManagerCard icon="⚠️" title="Cash Variance" value="Supervisor Review" text="Cash-up differences require review." />
        <ManagerCard icon="🏷️" title="Discount Overrides" value="Approval Required" text="Manual discounts need authorisation." />
      </section>
    </section>
  );
}

function OrdersManagerTab() {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Orders Dashboard</h2>
          <p>Monitor open tables, collections, deliveries and completed restaurant orders.</p>
        </div>
        <button className="scan-btn" onClick={() => (window.location.hash = "#/orders")}>
          Open Orders
        </button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="🍽️" title="Open Table Orders" value="0" text="Active dine-in orders not yet closed." />
        <ManagerCard icon="🥡" title="Collection Orders" value="0" text="Orders waiting for customer collection." />
        <ManagerCard icon="🚚" title="Delivery Orders" value="0" text="Orders assigned or waiting for dispatch." />
        <ManagerCard icon="✅" title="Completed Today" value="0" text="Restaurant orders completed today." />
        <ManagerCard icon="❌" title="Cancelled Orders" value="0" text="Voided or cancelled restaurant orders." />
        <ManagerCard icon="🧾" title="Bill Requested" value="0" text="Tables waiting for bill printing or payment." />
      </section>
    </section>
  );
}

function TablesTab() {
  const tables = [
    ["Main Floor", "Table 1", "Available", "Unassigned", "0.00"],
    ["Main Floor", "Table 2", "Occupied", "Waiter 1", "0.00"],
    ["Patio", "Table 3", "Reserved", "Unassigned", "0.00"],
  ];

  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Table Management</h2>
          <p>Manage table status, waiter assignments, reservations and open balances.</p>
        </div>
        <button className="scan-btn">New Table</button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="🪑" title="Total Tables" value={tables.length} text="Configured restaurant tables." />
        <ManagerCard icon="🟢" title="Available" value="1" text="Tables ready for customers." />
        <ManagerCard icon="🔴" title="Occupied" value="1" text="Tables with active orders." />
        <ManagerCard icon="🧾" title="Bill Requested" value="0" text="Customers waiting for bill." />
      </section>

      <div className="report-table-wrap" style={{ marginTop: 16 }}>
        <table className="report-table">
          <thead>
            <tr>
              <th>Section</th>
              <th>Table</th>
              <th>Status</th>
              <th>Waiter</th>
              <th>Open Balance</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((row, idx) => (
              <tr key={idx}>
                {row.map((cell, cidx) => (
                  <td key={cidx}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function KitchenTab() {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Kitchen Queue</h2>
          <p>Track orders waiting, preparing, ready, served or voided.</p>
        </div>
        <button className="scan-btn">Refresh Kitchen</button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="⏳" title="Waiting" value="0" text="Orders not yet started." />
        <ManagerCard icon="👨‍🍳" title="Preparing" value="0" text="Orders currently in preparation." />
        <ManagerCard icon="✅" title="Ready" value="0" text="Orders ready to serve or collect." />
        <ManagerCard icon="🍽️" title="Served" value="0" text="Orders served today." />
        <ManagerCard icon="❌" title="Voided" value="0" text="Cancelled kitchen tickets." />
      </section>

      <div className="empty-state" style={{ marginTop: 16 }}>
        <strong>No kitchen tickets</strong>
        <p>Kitchen orders will appear here when waiters send orders to the kitchen.</p>
      </div>
    </section>
  );
}

function InventoryTab({ isRestaurantLike }) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>{isRestaurantLike ? "Restaurant Inventory" : "Retail Inventory"}</h2>
          <p>
            {isRestaurantLike
              ? "Monitor ingredients, menu stock, low stock and waste."
              : "Monitor stock on hand, low stock, negative stock and recent movements."}
          </p>
        </div>
        <button className="scan-btn">Refresh Stock</button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="📦" title="Stock Items" value="0" text="Inventory items available for POS." />
        <ManagerCard icon="⚠️" title="Low Stock" value="0" text="Items below reorder level." />
        <ManagerCard icon="📉" title="Negative Stock" value="0" text="Items sold below available quantity." />
        <ManagerCard icon="🔄" title="Recent Movements" value="0" text="Stock movements from POS sales and adjustments." />

        {isRestaurantLike && (
          <>
            <ManagerCard icon="🥬" title="Ingredients" value="0" text="Ingredient items linked to recipes." />
            <ManagerCard icon="🗑️" title="Waste Recorded" value="0.00" text="Spoilage, breakages and kitchen waste." />
          </>
        )}
      </section>
    </section>
  );
}

function StockCountTab() {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Stock Count</h2>
          <p>Run stock count sessions, review variances and approve adjustments.</p>
        </div>
        <button className="scan-btn">New Count Session</button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="📋" title="Open Count Sessions" value="0" text="Stock counts currently in progress." />
        <ManagerCard icon="📦" title="Items Counted" value="0" text="Items counted in the current session." />
        <ManagerCard icon="⚠️" title="Variance Items" value="0" text="Items with stock differences." />
        <ManagerCard icon="✅" title="Approved Adjustments" value="0" text="Stock adjustments approved after count." />
      </section>
    </section>
  );
}

function PurchasingTab() {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Purchasing</h2>
          <p>Manage suppliers, purchase orders, goods received and outstanding deliveries.</p>
        </div>
        <button className="scan-btn">New Purchase Order</button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="🏢" title="Suppliers" value="0" text="Suppliers linked to restaurant purchasing." />
        <ManagerCard icon="🧾" title="Purchase Orders" value="0" text="Open purchase orders for ingredients and supplies." />
        <ManagerCard icon="📥" title="Goods Received" value="0" text="Received supplier deliveries." />
        <ManagerCard icon="🚚" title="Outstanding Deliveries" value="0" text="Orders not yet received." />
        <ManagerCard icon="💰" title="Purchase Value" value="0.00" text="Total purchases for selected period." />
        <ManagerCard icon="⚠️" title="Price Variances" value="0" text="Ingredient price changes needing review." />
      </section>
    </section>
  );
}

function TableSettingsTab({ tables = [], setMessage }) {
  const totalTables = tables.length;
  const available = tables.filter((t) => String(t.status).toLowerCase() === "available").length;
  const occupied = tables.filter((t) => String(t.status).toLowerCase() === "occupied").length;
  const reserved = tables.filter((t) => String(t.status).toLowerCase() === "reserved").length;

  const sections = [...new Set(tables.map((t) => t.section || "Main Floor"))];

  return (
    <section className="manager-workspace" style={{ marginTop: 18 }}>
      <div className="workspace-head">
        <div>
          <h2>Table Settings</h2>
          <p>Configure restaurant tables, sections, capacity and table workflow.</p>
        </div>

        <button
          className="scan-btn"
          onClick={() => setMessage("Next: connect New Table to posApi.createTable().")}
        >
          New Table
        </button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="🪑" title="Total Tables" value={totalTables} text="Configured restaurant tables." />
        <ManagerCard icon="🟢" title="Available" value={available} text="Tables ready for customers." />
        <ManagerCard icon="🔴" title="Occupied" value={occupied} text="Tables currently in use." />
        <ManagerCard icon="📅" title="Reserved" value={reserved} text="Tables reserved for customers." />
        <ManagerCard icon="🏠" title="Sections" value={sections.length} text={sections.join(", ") || "No sections configured."} />
        <ManagerCard icon="👥" title="Total Capacity" value={tables.reduce((s, t) => s + Number(t.capacity || 0), 0)} text="Total seating capacity." />
      </section>

      <div className="report-table-wrap" style={{ marginTop: 16 }}>
        <table className="report-table">
          <thead>
            <tr>
              <th>Section</th>
              <th>Table</th>
              <th>Capacity</th>
              <th>Status</th>
              <th>Waiter</th>
              <th>Open Balance</th>
            </tr>
          </thead>

          <tbody>
            {tables.length ? (
              tables.map((t, idx) => (
                <tr key={t.id || idx}>
                  <td>{t.section || "Main Floor"}</td>
                  <td>{t.table_name || t.name || `Table ${idx + 1}`}</td>
                  <td>{t.capacity || "-"}</td>
                  <td>{t.status || "available"}</td>
                  <td>{t.waiter_name || "Unassigned"}</td>
                  <td>{money(t.open_balance || 0)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6">No tables configured yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function KitchenRoutingSettingsTab() {
  return (
    <section className="manager-workspace" style={{ marginTop: 18 }}>
      <div className="workspace-head">
        <div>
          <h2>Kitchen Routing</h2>
          <p>Configure preparation stations and how restaurant orders move through the kitchen.</p>
        </div>
        <button className="scan-btn">New Station</button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="👨‍🍳" title="Kitchen Station" value="Kitchen" text="Default food preparation station." />
        <ManagerCard icon="🍹" title="Bar Station" value="Optional" text="Route drinks and bar orders separately." />
        <ManagerCard icon="🍰" title="Dessert Station" value="Optional" text="Route desserts to a separate preparation point." />
        <ManagerCard icon="🖨️" title="Kitchen Printer" value="Not Set" text="Printer used for kitchen order tickets." />
      </section>

      <div className="report-table-wrap" style={{ marginTop: 16 }}>
        <table className="report-table">
          <thead>
            <tr>
              <th>Station</th>
              <th>Printer</th>
              <th>Status</th>
              <th>Default Routing</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Kitchen</td>
              <td>Not Set</td>
              <td>Active</td>
              <td>Food items</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WaiterSettingsTab() {
  return (
    <section className="manager-workspace" style={{ marginTop: 18 }}>
      <div className="workspace-head">
        <div>
          <h2>Waiter Rules</h2>
          <p>Control waiter access, table assignments and restaurant service workflow.</p>
        </div>
        <button className="scan-btn">Assign Waiter</button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="🧑‍🍽️" title="Waiter Access" value="Enabled" text="Waiters may create and manage restaurant orders." />
        <ManagerCard icon="🪑" title="Table Assignment" value="Optional" text="Allow tables to be assigned to specific waiters." />
        <ManagerCard icon="🧾" title="Bill Printing" value="Allowed" text="Waiters may print bills before payment." />
        <ManagerCard icon="💵" title="Payment Access" value="Cashier Only" text="Payments remain controlled by cashier or manager." />
      </section>

      <div className="report-table-wrap" style={{ marginTop: 16 }}>
        <table className="report-table">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Setting</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Create Orders</td>
              <td>Allowed</td>
              <td>Waiters can create table, collection and delivery orders.</td>
            </tr>
            <tr>
              <td>Close Orders</td>
              <td>Manager/Cashier</td>
              <td>Only cashier or manager should close paid orders.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DeliverySettingsTab() {
  return (
    <section className="manager-workspace" style={{ marginTop: 18 }}>
      <div className="workspace-head">
        <div>
          <h2>Delivery Rules</h2>
          <p>Configure delivery workflow, zones, drivers and delivery fees.</p>
        </div>
        <button className="scan-btn">New Delivery Zone</button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="🚚" title="Delivery Orders" value="Enabled" text="Allow orders to be marked for delivery." />
        <ManagerCard icon="📍" title="Delivery Zones" value="0" text="Configured zones for delivery fees and routing." />
        <ManagerCard icon="🧑‍✈️" title="Drivers" value="0" text="Drivers available for order dispatch." />
        <ManagerCard icon="💰" title="Default Fee" value="0.00" text="Default delivery fee if no zone rule applies." />
      </section>

      <div className="report-table-wrap" style={{ marginTop: 16 }}>
        <table className="report-table">
          <thead>
            <tr>
              <th>Zone</th>
              <th>Fee</th>
              <th>Estimated Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>No zones configured</td>
              <td>0.00</td>
              <td>-</td>
              <td>Pending setup</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BarcodeSettingsTab() {
  return (
    <section className="manager-workspace" style={{ marginTop: 18 }}>
      <div className="workspace-head">
        <div>
          <h2>Barcode Settings</h2>
          <p>Configure barcode format, item lookup and shelf label behaviour.</p>
        </div>
        <button className="scan-btn">Save Barcode Settings</button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="🏷️" title="Default Format" value="Code128" text="Default barcode format for generated labels." />
        <ManagerCard icon="🔎" title="Lookup Method" value="Barcode / SKU" text="Allow scanning by barcode, SKU or item name." />
        <ManagerCard icon="🖨️" title="Label Printer" value="Not Set" text="Printer used for barcode shelf labels." />
        <ManagerCard icon="📦" title="Auto Generate" value="Allowed" text="Generate barcode when item has none." />
      </section>
    </section>
  );
}

function ScaleSettingsTab() {
  return (
    <section className="manager-workspace" style={{ marginTop: 18 }}>
      <div className="workspace-head">
        <div>
          <h2>Scale Integration</h2>
          <p>Configure weighted items, produce labels and scale barcode parsing.</p>
        </div>
        <button className="scan-btn">Save Scale Settings</button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="⚖️" title="Weighted Items" value="Disabled" text="Enable for produce, meat or weighable retail goods." />
        <ManagerCard icon="🏷️" title="Scale Barcode Prefix" value="Not Set" text="Prefix used to identify scale-generated barcodes." />
        <ManagerCard icon="📏" title="Quantity Parsing" value="Manual" text="Parse weight or quantity from the barcode." />
        <ManagerCard icon="💰" title="Price Embedded" value="Optional" text="Support barcodes containing calculated item price." />
      </section>
    </section>
  );
}

function CustomerDisplaySettingsTab() {
  return (
    <section className="manager-workspace" style={{ marginTop: 18 }}>
      <div className="workspace-head">
        <div>
          <h2>Customer Display</h2>
          <p>Configure customer-facing checkout display and promotional screen behaviour.</p>
        </div>
        <button className="scan-btn">Save Display Settings</button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="🖥️" title="Customer Display" value="Disabled" text="Show cart totals on a second screen." />
        <ManagerCard icon="📢" title="Promo Screen" value="Optional" text="Display promotions when no sale is active." />
        <ManagerCard icon="🧾" title="Show VAT" value="Enabled" text="Display VAT breakdown to customers." />
        <ManagerCard icon="💳" title="Payment Prompt" value="Enabled" text="Show payment amount due at checkout." />
      </section>
    </section>
  );
}

