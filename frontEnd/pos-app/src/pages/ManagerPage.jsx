
import { getCompanyContext, getPosMode } from "../config.js";
import { useEffect, useMemo, useState } from "react";
import { posApi } from "../services/posApi.js";
import { money } from "../utils/currency.js";
import { renderSlip, SLIP_TEMPLATE_OPTIONS } from "../utils/receiptTemplates.js";

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
  ["menu", "Menu"],
  ["customers", "Customers"],
  ["pricing", "Pricing"],
  ["promotions", "Promotions"],

  ["shifts", "Shifts & Cash-up"],
  ["terminals", "Terminals"],
  ["staff", "Staff & Access"],
  ["attendance", "Attendance"],

  ["settings", "Settings"],
];

const RETAIL_ROLE_OPTIONS = [
  { value: "cashier", label: "Cashier" },
  { value: "supervisor", label: "Supervisor" },
  { value: "manager", label: "Manager" },
  { value: "stock_controller", label: "Stock Controller" },
];

const RESTAURANT_ROLE_OPTIONS = [
  { value: "waiter", label: "Waiter" },
  { value: "cashier", label: "Cashier" },
  { value: "supervisor", label: "Supervisor" },
  { value: "manager", label: "Manager" },
  { value: "kitchen", label: "Kitchen Staff" },
  { value: "driver", label: "Driver" },
];

const RETAIL_SUPERVISOR_TABS = [
  ["overview", "Overview"],
  ["sales", "Sales"],
  ["reports", "Reports"],
  ["inventory", "Inventory"],
  ["stock_count", "Stock Count"],
  ["customers", "Customers"],
  ["shifts", "Shifts & Cash-up"],
  ["attendance", "Attendance"],
];

const RESTAURANT_SUPERVISOR_TABS = [
  ["overview", "Overview"],
  ["orders", "Orders"],
  ["tables", "Tables"],
  ["kitchen", "Kitchen"],
  ["sales", "Sales"],
  ["reports", "Reports"],
  ["inventory", "Inventory"],
  ["customers", "Customers"],
  ["shifts", "Shifts & Cash-up"],
  ["attendance", "Attendance"],
];

const POS_PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "hour", label: "This Hour" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "last_6_months", label: "Last 6 Months" },
  { value: "previous_year", label: "Previous Year" },
  { value: "range", label: "Custom Range" },
];

function defaultPosDateFilter() {
  const today = new Date().toISOString().slice(0, 10);

  return {
    period: "today",
    start_date: today,
    end_date: today,
  };
}

export function ManagerPage() {
  const company = getCompanyContext();

  const fsToken =
    sessionStorage.getItem("fs_user_token") ||
    localStorage.getItem("fs_user_token") ||
    "";

  const posToken = localStorage.getItem("pos_token") || "";
  const [managerEmployee, setManagerEmployee] = useState(null);

  const hasActiveCompany =
    !!company?.id ||
    !!localStorage.getItem("active_company_id") ||
    !!localStorage.getItem("company_id");

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
  const [staffMembers, setStaffMembers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [barcodeLabels, setBarcodeLabels] = useState([]);
  const [menuItems, setMenuItems] = useState([]);

  const [shiftTemplates, setShiftTemplates] = useState([]);
  const [shiftSchedule, setShiftSchedule] = useState([]);
  const [staffLeave, setStaffLeave] = useState([]);
  const [attendanceLog, setAttendanceLog] = useState([]);
  const [posDateFilter, setPosDateFilter] = useState(defaultPosDateFilter());
  
  const openShifts = useMemo(
    () => shifts.filter((x) => x.status === "open").length,
    [shifts]
  );

  useEffect(() => {
    loadTabData(tab);
  }, [tab]);

  useEffect(() => {
    restoreManagerPosSession();
  }, []);

  async function restoreManagerPosSession() {
    if (!posToken) return;

    try {
      const res = await posApi.posAuthMe();
      setManagerEmployee(res.employee || res.cashier || null);
    } catch {
      localStorage.removeItem("pos_token");
      setManagerEmployee(null);
    }
  }

  async function loadTabData(activeTab = tab) {
    setLoading(true);
    setMessage("");

    try {
      if (activeTab === "overview") {
        await Promise.allSettled([
          loadTerminals(),
          loadShifts(),
          loadShifts(),
          loadShiftTemplates(),
          loadShiftSchedule(),
          loadStaffLeave(),
          loadStaffMembers(),
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
      if (activeTab === "staff") await loadStaffMembers();
      if (activeTab === "orders") await loadOrders();
      if (activeTab === "labels") await loadBarcodeLabels();
      if (activeTab === "menu") await loadMenuItems();
      if (activeTab === "attendance") await loadAttendance();

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

  async function loadAttendance() {
    const res = await posApi.listAttendance();
    setAttendanceLog(res.attendance || []);
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

  async function loadMenuItems() {
    const res = await posApi.listMenuItems();
    setMenuItems(res.menu_items || res.items || []);
  }

  async function loadShiftTemplates() {
    const res = await posApi.listShiftTemplates(true);
    setShiftTemplates(res.templates || []);
  }

  async function loadShiftSchedule() {
    const res = await posApi.listShiftSchedule();
    setShiftSchedule(res.schedule || []);
  }

  async function loadStaffLeave() {
    const res = await posApi.listStaffLeave();
    setStaffLeave(res.leave || []);
  }

  async function deactivateStaffMember(staffId) {
    await posApi.deactivateStaffMember(staffId);

    setMessage("Staff member deactivated.");

    await loadTabData("staff");
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

  async function loadStaffMembers() {
    const res = await posApi.listStaffMembers();
    setStaffMembers(res.staff || res.users || []);
  }

  async function loadOrders() {
    const res = await posApi.listOrders();
    setOrders(res.orders || []);
  }

  async function loadBarcodeLabels() {
    const res = await posApi.listBarcodeLabels?.();
    setBarcodeLabels(res?.labels || []);
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

    if (modal.type === "menu_item") {
      await posApi.createMenuItem({
        name: values.name,
        category: values.category || "Meals",
        price: Number(values.price || 0),
        combo_description: values.combo_description || "",
        add_ons: String(values.add_ons || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        image_url: values.image_url || "",
        is_active: true,
        show_on_display: true,
      });

      setMessage("Menu item created.");
      await loadMenuItems();
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

    if (modal.type === "staff") {
      const res = await posApi.createStaffMember({
        full_name: values.full_name,
        email: values.email,
        phone: values.phone || "",
        role: values.role || "cashier",
        pin: values.pin || "",
        access_scope: "pos",
        is_active: true,
      });

      const staff = res.staff || {};

      const accessCode =
        staff.pos_access_code ||
        staff.access_code ||
        res.pos_access_code ||
        res.access_code ||
        "-";

      setMessage(`Staff member added. POS access code: ${accessCode}`);
      await loadTabData("staff");
    }

    if (modal.type === "edit_staff") {
      await posApi.updateStaffMember(modal.staffId, {
        full_name: values.full_name,
        phone: values.phone || "",
        role: values.role || "cashier",
        access_code: values.access_code || "",
        pin: values.pin || "",
      });

      setMessage("Staff member updated.");
      await loadStaffMembers();
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

    if (modal.type === "kitchen_station") {
      await saveReceiptSettings({
        ...(receiptSettings || {}),
        kitchen_station_name: values.station_name || "Kitchen",
        kitchen_printer: values.printer_name || "",
        kitchen_default_routing: values.default_routing || "Food items",
      });

      setMessage("Kitchen station saved.");
    }

    if (modal.type === "assign_waiter") {
      await saveReceiptSettings({
        ...(receiptSettings || {}),
        assigned_table_id: values.table_id || "",
        assigned_waiter_id: values.waiter_id || "",
      });

      setMessage("Waiter assigned.");
    }

    if (modal.type === "delivery_zone") {
      await saveReceiptSettings({
        ...(receiptSettings || {}),
        delivery_zone_name: values.zone_name || "",
        default_delivery_fee: Number(values.delivery_fee || 0),
        delivery_estimated_time: values.estimated_time || "",
      });

      setMessage("Delivery zone saved.");
    }

    if (modal.type === "table_settings") {
      await saveReceiptSettings({
        ...(receiptSettings || {}),
        table_reservations_enabled: values.table_reservations_enabled || "enabled",
        default_table_status: values.default_table_status || "available",
        table_assignment_rule: values.table_assignment_rule || "optional",
        table_open_balance_rule: values.table_open_balance_rule || "allow",
      });

      setMessage("Table settings saved.");
    }

    if (modal.type === "new_table") {
      await saveReceiptSettings({
        ...(receiptSettings || {}),
        last_table_section: values.section || "",
        last_table_name: values.table_name || "",
        last_table_capacity: Number(values.capacity || 0),
        last_table_status: values.status || "available",
      });

      setMessage("Table saved.");
    }

    if (modal.type === "new_table_section") {
      await saveReceiptSettings({
        ...(receiptSettings || {}),
        last_table_section_name: values.section_name || "",
      });

      setMessage("Table section saved.");
    }

    if (modal.type === "shift_template") {
      await posApi.createShiftTemplate({
        shift_name: values.shift_name,
        start_time: values.start_time,
        end_time: values.end_time,
        pattern_type: values.pattern_type || "standard",
        is_active: true,
      });

      setMessage("Shift pattern created.");
      await loadShiftTemplates();
    }

    if (modal.type === "shift_schedule") {
      await posApi.createShiftSchedule({
        employee_user_id: Number(values.employee_user_id || 0),
        shift_template_id: Number(values.shift_template_id || 0) || null,
        work_date: values.work_date,
        schedule_status: values.schedule_status || "scheduled",
        notes: values.notes || "",
      });

      setMessage("Staff assigned to shift.");
      await loadShiftSchedule();
    }

    if (modal.type === "staff_leave") {
      await posApi.createStaffLeave({
        employee_user_id: Number(values.employee_user_id || 0),
        leave_type: values.leave_type || "annual",
        start_date: values.start_date,
        end_date: values.end_date,
        status: values.status || "approved",
        notes: values.notes || "",
      });

      setMessage("Leave / off day saved.");
      await loadStaffLeave();
    }
    setModal(null);
  }

  function openStaffModal() {
    const roleOptions = isRestaurantLike
      ? RESTAURANT_ROLE_OPTIONS
      : RETAIL_ROLE_OPTIONS;

    setModal({
      type: "staff",
      title: "Add POS Staff Member",
      fields: [
        { key: "full_name", label: "Full Name", value: "" },
        { key: "email", label: "Email Address", value: "" },
        { key: "phone", label: "Phone Number", value: "" },
        {
          key: "role",
          label: "POS Role",
          value: isRestaurantLike ? "waiter" : "cashier",
          type: "select",
          options: roleOptions,
        },
        { key: "pin", label: "Employee PIN", value: "" },
      ],
    });
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

  function openMenuItemModal() {
    setModal({
      type: "menu_item",
      title: "New Menu Item",
      fields: [
        { key: "name", label: "Menu Item Name", value: "" },
        { key: "category", label: "Category", value: "Meals" },
        { key: "price", label: "Selling Price", value: "0" },
        { key: "combo_description", label: "Combo Description", value: "" },
        { key: "add_ons", label: "Add-ons e.g Extra Cheese, Extra Chips", value: "" },
        { key: "image_url", label: "Image URL", value: "" },
      ],
    });
  }

  function openEditStaffModal(staff) {
    setModal({
      type: "edit_staff",
      title: "Edit POS Staff Member",
      staffId: staff.id,
      fields: [
        { key: "full_name", label: "Full Name", value: staff.full_name || "" },
        { key: "phone", label: "Phone Number", value: staff.phone || "" },
        { key: "role", label: "POS Role", value: staff.role || "cashier", type: "select", options: isRestaurantLike ? RESTAURANT_ROLE_OPTIONS : RETAIL_ROLE_OPTIONS,},        
        { key: "access_code", label: "POS Access Code", value: staff.pos_access_code || "" },
        { key: "pin", label: "New PIN (leave blank to keep old PIN)", value: "" },
      ],
    });
  }

  function openShiftPatternModal() {
    setModal({
      type: "shift_template",
      title: "New Shift Pattern",
      fields: [
        {
          key: "shift_name",
          label: "Shift Name",
          value: "Morning Shift",
          type: "datalist",
          options: [
            { value: "Morning Shift", label: "Morning Shift" },
            { value: "Day Shift", label: "Day Shift" },
            { value: "Afternoon Shift", label: "Afternoon Shift" },
            { value: "Night Shift", label: "Night Shift" },
          ],
        },
        { key: "start_time", label: "Start Time", value: "08:00", type: "time" },
        { key: "end_time", label: "End Time", value: "17:00", type: "time" },
        {
          key: "pattern_type",
          label: "Pattern Type",
          value: "standard",
          type: "datalist",
          options: [
            { value: "standard", label: "Standard" },
            { value: "weekend", label: "Weekend" },
            { value: "rotational", label: "Rotational" },
            { value: "night", label: "Night" },
          ],
        },
      ],
    });
  }
  function openAssignStaffModal() {
    setModal({
      type: "shift_schedule",
      title: "Assign Staff to Shift",
      fields: [
        {
          key: "employee_user_id",
          label: "Employee",
          value: "",
          type: "select",
          options: [
            { value: "", label: "Select employee" },
            ...staffMembers.map((s) => ({
              value: String(s.id || s.user_id || s.company_user_id),
              label: s.full_name || s.name || s.email || `Employee #${s.id}`,
            })),
          ],
        },
        {
          key: "shift_template_id",
          label: "Shift Template",
          value: "",
          type: "select",
          options: [
            { value: "", label: "Select shift template" },
            ...shiftTemplates.map((s) => ({
              value: String(s.id),
              label: `${s.shift_name} (${s.start_time} - ${s.end_time})`,
            })),
          ],
        },
        { key: "work_date", label: "Work Date", value: new Date().toISOString().slice(0, 10), type: "date" },
        {
          key: "schedule_status",
          label: "Status",
          value: "scheduled",
          type: "datalist",
          options: [
            { value: "scheduled", label: "Scheduled" },
            { value: "off", label: "Off" },
            { value: "leave", label: "Leave" },
            { value: "sick", label: "Sick" },
            { value: "worked", label: "Worked" },
          ],
        },
        { key: "notes", label: "Notes", value: "" },
      ],
    });
  }
  function openLeaveModal() {
    setModal({
      type: "staff_leave",
      title: "Add Leave / Off Day",
      fields: [
        {
          key: "employee_user_id",
          label: "Employee",
          value: "",
          type: "select",
          options: [
            { value: "", label: "Select employee" },
            ...staffMembers.map((s) => ({
              value: String(s.id || s.user_id || s.company_user_id),
              label: s.full_name || s.name || s.email || `Employee #${s.id}`,
            })),
          ],
        },
        {
          key: "leave_type",
          label: "Leave Type",
          value: "annual",
          type: "datalist",
          options: [
            { value: "annual", label: "Annual Leave" },
            { value: "sick", label: "Sick Leave" },
            { value: "unpaid", label: "Unpaid Leave" },
            { value: "off_day", label: "Off Day" },
            { value: "family_responsibility", label: "Family Responsibility" },
          ],
        },
        { key: "start_date", label: "Start Date", value: new Date().toISOString().slice(0, 10), type: "date" },
        { key: "end_date", label: "End Date", value: new Date().toISOString().slice(0, 10), type: "date" },
        {
          key: "status",
          label: "Status",
          value: "approved",
          type: "datalist",
          options: [
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "declined", label: "Declined" },
            { value: "cancelled", label: "Cancelled" },
          ],
        },
        { key: "notes", label: "Notes", value: "" },
      ],
    });
  }

  const fsUser = JSON.parse(localStorage.getItem("fs_user") || "{}");

  const managerRole = String(
    managerEmployee?.pos_role ||
    managerEmployee?.role ||
    fsUser?.pos_role ||
    fsUser?.role ||
    fsUser?.system_role ||
    ""
  ).toLowerCase();

  const isSupervisor = managerRole === "supervisor";
  const isPosManager = managerRole === "manager";
  const isMainAppSuperUser = !!fsToken;

  const visibleTabs = isMainAppSuperUser || isPosManager
    ? isRestaurantLike
      ? RESTAURANT_TABS
      : RETAIL_TABS
    : isRestaurantLike
      ? isSupervisor
        ? RESTAURANT_SUPERVISOR_TABS
        : []
      : isSupervisor
        ? RETAIL_SUPERVISOR_TABS
        : [];

  const allowedTabIds = visibleTabs.map(([id]) => id);

  useEffect(() => {
    if (allowedTabIds.length && !allowedTabIds.includes(tab)) {
      setTab("overview");
    }
  }, [tab, allowedTabIds]);

  function goToMainSignin() {
    localStorage.setItem(
      "fs:intended_url",
      `${window.location.pathname}${window.location.hash || "#/manager"}`
    );

    window.location.href = "/signin.html";
  }

  function goToCashierSignin() {
    localStorage.setItem("pos_auth_required", "1");
    window.location.href = "#/cashier";
  }

  if ((!fsToken && !posToken) || !hasActiveCompany) {
    return (
      <main className="pos-page">
        <div className="pos-message">
          Please sign in to access POS Manager.

          <div style={{ marginTop: "12px" }}>
            <button
              className="scan-btn"
              onClick={goToCashierSignin}
            >
              POS Sign In
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!fsToken && posToken && !managerEmployee) {
    return (
      <main className="pos-page">
        <div className="pos-message">Loading POS manager access...</div>
      </main>
    );
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
              dateFilter={posDateFilter}
              setDateFilter={setPosDateFilter}
            />
          )}

          {tab === "sales" && (
            <SalesTab
              dateFilter={posDateFilter}
              setDateFilter={setPosDateFilter}
            />
          )}

          {tab === "reports" && (
            <ReportsTab
              reportView={reportView}
              setReportView={setReportView}
              dateFilter={posDateFilter}
              setDateFilter={setPosDateFilter}
            />
          )}

          {tab === "menu" && isRestaurantLike && (
            <MenuManagerTab
              menuItems={menuItems}
              onRefresh={loadMenuItems}
              onCreate={openMenuItemModal}
            />
          )}

          {tab === "shifts" && (
            <ShiftsTab
              shifts={shifts}
              shiftTemplates={shiftTemplates}
              shiftSchedule={shiftSchedule}
              staffLeave={staffLeave}
              staffMembers={staffMembers}
              onRefresh={() =>
                Promise.allSettled([
                  loadShifts(),
                  loadShiftTemplates(),
                  loadShiftSchedule(),
                  loadStaffLeave(),
                  loadStaffMembers(),
                ])
              }
              onCloseShift={openCloseShiftModal}
              onNewShiftPattern={openShiftPatternModal}
              onAssignStaff={openAssignStaffModal}
              onAddLeave={openLeaveModal}
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
            <RecipesTab
              recipes={recipes}
              onCreate={openRecipeModal}
              onRefresh={loadRecipes}
            />
          )}

          {tab === "costing" && (
            <CostingTab
              costPools={costPools}
              onCreate={openCostPoolModal}
              onRefresh={loadCostPools}
            />
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

          {tab === "inventory" && (
            <InventoryTab
              isRestaurantLike={isRestaurantLike}
              inventoryItems={inventoryItems}
              onRefresh={loadInventory}
            />
          )}

          {tab === "purchasing" && isRestaurantLike && (
            <PurchasingTab
              purchasingSummary={purchasingSummary}
              onRefresh={loadPurchasing}
            />
          )}

          {tab === "stock_count" && !isRestaurantLike && <StockCountTab />}

          {tab === "promotions" && (
            <PromotionsTab promotions={promotions} onCreate={openPromotionModal} />
          )}

          {tab === "labels" && <LabelsTab onGenerate={openBarcodeModal} />}

          {tab === "staff" && (
            <StaffTab
              staffMembers={staffMembers}
              isRestaurantLike={isRestaurantLike}
              onAddStaff={openStaffModal}
              onEditStaff={openEditStaffModal}
              onDeactivate={deactivateStaffMember}
              onRefresh={loadStaffMembers}
            />
          )}

          {tab === "attendance" && (
            <AttendanceTab
              attendanceLog={attendanceLog}
              onRefresh={loadAttendance}
            />
          )}

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

                <ManagerCard
                  icon="💳"
                  title="Payment Settings"
                  value="Configure"
                  text="Cash, speedpoint/card, mobile money, account sales and split payments."
                  onClick={() => setSettingsView("payments")}
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
                <ReceiptPreviewTab
                  settings={receiptSettings}
                  onSave={saveReceiptSettings}
                />
              )}

              {settingsView === "printers" && (
                <GenericPosSettingsTab
                  title="Printer Settings"
                  description="Configure receipt, kitchen and label printers."
                  saveLabel="Save Printer Settings"
                  settings={receiptSettings}
                  onSave={saveReceiptSettings}
                  cards={[
                    { icon: "🧾", title: "Receipt Printer", key: "receipt_printer", value: "Not Set", text: "Default customer receipt printer.", type: "text" },
                    { icon: "👨‍🍳", title: "Kitchen Printer", key: "kitchen_printer", value: "Not Set", text: "Used for restaurant kitchen orders.", type: "text" },
                    { icon: "🏷️", title: "Label Printer", key: "label_printer", value: "Not Set", text: "Used for barcode and shelf labels.", type: "text" },
                  ]}
                />
              )}

              {settingsView === "taxes" && (
                <GenericPosSettingsTab
                  title="POS Tax Settings"
                  description="Choose VAT behaviour and receipt display."
                  saveLabel="Save Tax Settings"
                  settings={receiptSettings}
                  onSave={saveReceiptSettings}
                  cards={[
                    {
                      icon: "🧮",
                      title: "Pricing Tax Mode",
                      key: "pricing_tax_mode",
                      value: "VAT Inclusive",
                      text: "Choose whether selling prices include VAT or VAT is added separately.",
                      type: "select",
                      options: [
                        { value: "inclusive", label: "VAT Inclusive" },
                        { value: "exclusive", label: "VAT Exclusive" },
                      ],
                    },
                    {
                      icon: "🧾",
                      title: "Receipt VAT Display",
                      key: "receipt_tax_display",
                      value: "Show VAT Line",
                      text: "Choose how VAT appears on customer receipts.",
                      type: "select",
                      options: [
                        { value: "total_only", label: "Total Only" },
                        { value: "vat_line", label: "Show VAT Line" },
                        { value: "cost_vat_total", label: "Cost + VAT + Total" },
                      ],
                    },
                    {
                      icon: "📄",
                      title: "Receipt Wording",
                      key: "tax_invoice_wording",
                      value: "Tax Invoice / Receipt",
                      text: "Choose the wording printed at the top of the receipt.",
                      type: "select",
                      options: [
                        { value: "Tax Invoice / Receipt", label: "Tax Invoice / Receipt" },
                        { value: "Tax Invoice", label: "Tax Invoice" },
                        { value: "Receipt", label: "Receipt" },
                        { value: "Pro-forma", label: "Pro-forma" },
                      ],
                    },
                  ]}
                />
              )}

              {settingsView === "terminals" && (
                <GenericPosSettingsTab
                  title="Terminal Settings"
                  description="Configure terminal defaults, cash drawer and opening float."
                  saveLabel="Save Terminal Settings"
                  settings={receiptSettings}
                  onSave={saveReceiptSettings}
                  cards={[
                    { icon: "🖥️", title: "Default Terminal", key: "default_terminal", value: "Main Till", text: "Default terminal used for POS sales.", type: "text" },
                    { icon: "💵", title: "Opening Float", key: "opening_float", value: "0.00", text: "Default opening cash float for shifts.", type: "number" },
                    {
                      icon: "🧰",
                      title: "Cash Drawer",
                      key: "cash_drawer_enabled",
                      value: "Disabled",
                      text: "Enable or disable automatic cash drawer behaviour.",
                      type: "select",
                      options: [
                        { value: "enabled", label: "Enabled" },
                        { value: "disabled", label: "Disabled" },
                      ],
                    },
                  ]}
                />
              )}

              {settingsView === "payments" && (
                <GenericPosSettingsTab
                  title="Payment Settings"
                  description="Choose which payment methods are available at checkout."
                  saveLabel="Save Payment Settings"
                  settings={receiptSettings}
                  onSave={saveReceiptSettings}
                  cards={[
                    { icon: "💵", title: "Cash", key: "pay_cash_enabled", value: "Enabled", text: "Allow cash payments.", type: "select", options: [{ value: "enabled", label: "Enabled" }, { value: "disabled", label: "Disabled" }] },
                    { icon: "💳", title: "Speedpoint / Card", key: "pay_card_enabled", value: "Enabled", text: "Allow card or speedpoint payments.", type: "select", options: [{ value: "enabled", label: "Enabled" }, { value: "disabled", label: "Disabled" }] },
                    { icon: "📱", title: "Mobile Money", key: "pay_mobile_enabled", value: "Enabled", text: "Allow mobile money payments.", type: "select", options: [{ value: "enabled", label: "Enabled" }, { value: "disabled", label: "Disabled" }] },
                    { icon: "👤", title: "Account Sale", key: "pay_account_enabled", value: "Disabled", text: "Allow customer account sales.", type: "select", options: [{ value: "enabled", label: "Enabled" }, { value: "disabled", label: "Disabled" }] },
                    { icon: "🔀", title: "Split Payment", key: "pay_split_enabled", value: "Enabled", text: "Allow multiple payment methods on one sale.", type: "select", options: [{ value: "enabled", label: "Enabled" }, { value: "disabled", label: "Disabled" }] },
                  ]}
                />
              )}

              {settingsView === "cash_controls" && (
                <GenericPosSettingsTab
                  title="Cash Control Settings"
                  description="Set approval rules for returns, variances and discount overrides."
                  saveLabel="Save Cash Controls"
                  settings={receiptSettings}
                  onSave={saveReceiptSettings}
                  cards={[
                    {
                      icon: "↩️",
                      title: "Returns Approval",
                      key: "returns_approval",
                      value: "Manager Approval",
                      text: "Choose who must approve POS returns.",
                      type: "select",
                      options: [
                        { value: "none", label: "No Approval Required" },
                        { value: "supervisor", label: "Supervisor Approval" },
                        { value: "manager", label: "Manager Approval" },
                      ],
                    },
                    {
                      icon: "⚖️",
                      title: "Cash Variance Rule",
                      key: "cash_variance_rule",
                      value: "Supervisor Review",
                      text: "Choose how cash-up differences are reviewed.",
                      type: "select",
                      options: [
                        { value: "none", label: "No Review" },
                        { value: "supervisor", label: "Supervisor Review" },
                        { value: "manager", label: "Manager Approval" },
                      ],
                    },
                    {
                      icon: "🏷️",
                      title: "Discount Override",
                      key: "discount_override_rule",
                      value: "Approval Required",
                      text: "Control manual discount permissions.",
                      type: "select",
                      options: [
                        { value: "allowed", label: "Allowed" },
                        { value: "approval_required", label: "Approval Required" },
                        { value: "disabled", label: "Disabled" },
                      ],
                    },
                  ]}
                />
              )}

              {settingsView === "barcode" && (
                <GenericPosSettingsTab
                  title="Barcode Settings"
                  description="Configure barcode format, lookup and automatic generation."
                  saveLabel="Save Barcode Settings"
                  settings={receiptSettings}
                  onSave={saveReceiptSettings}
                  cards={[
                    {
                      icon: "🏷️",
                      title: "Barcode Format",
                      key: "barcode_format",
                      value: "Code128",
                      text: "Default barcode format for item labels.",
                      type: "select",
                      options: [
                        { value: "code128", label: "Code128" },
                        { value: "ean13", label: "EAN-13" },
                        { value: "qr", label: "QR Code" },
                      ],
                    },
                    {
                      icon: "🔍",
                      title: "Lookup Method",
                      key: "barcode_lookup_method",
                      value: "Barcode",
                      text: "Choose how items are found at checkout.",
                      type: "select",
                      options: [
                        { value: "barcode", label: "Barcode" },
                        { value: "sku", label: "SKU" },
                        { value: "name", label: "Item Name" },
                        { value: "all", label: "Barcode, SKU or Name" },
                      ],
                    },
                    {
                      icon: "⚙️",
                      title: "Auto Generate Barcode",
                      key: "auto_generate_barcode",
                      value: "Enabled",
                      text: "Automatically generate barcode when item has none.",
                      type: "select",
                      options: [
                        { value: "enabled", label: "Enabled" },
                        { value: "disabled", label: "Disabled" },
                      ],
                    },
                  ]}
                />
              )}

              {settingsView === "scale" && (
                <GenericPosSettingsTab
                  title="Scale Integration"
                  description="Configure weighted items, scale prefix and barcode parsing."
                  saveLabel="Save Scale Settings"
                  settings={receiptSettings}
                  onSave={saveReceiptSettings}
                  cards={[
                    {
                      icon: "⚖️",
                      title: "Weighted Items",
                      key: "weighted_items_enabled",
                      value: "Disabled",
                      text: "Enable weighted products sold by mass.",
                      type: "select",
                      options: [
                        { value: "enabled", label: "Enabled" },
                        { value: "disabled", label: "Disabled" },
                      ],
                    },
                    { icon: "🔢", title: "Scale Prefix", key: "scale_barcode_prefix", value: "20", text: "Barcode prefix used by weighing scales.", type: "text" },
                    {
                      icon: "📏",
                      title: "Quantity Parsing",
                      key: "scale_quantity_parsing",
                      value: "Auto",
                      text: "Choose how weight or quantity is read from barcode.",
                      type: "select",
                      options: [
                        { value: "auto", label: "Auto" },
                        { value: "manual", label: "Manual" },
                      ],
                    },
                  ]}
                />
              )}

              {settingsView === "display" && (
                <GenericPosSettingsTab
                  title="Customer Display"
                  description="Configure customer-facing checkout display and promotional screen."
                  saveLabel="Save Display Settings"
                  settings={receiptSettings}
                  onSave={saveReceiptSettings}
                  cards={[
                    {
                      icon: "🖥️",
                      title: "Customer Display",
                      key: "customer_display_enabled",
                      value: "Disabled",
                      text: "Enable a customer-facing display screen.",
                      type: "select",
                      options: [
                        { value: "enabled", label: "Enabled" },
                        { value: "disabled", label: "Disabled" },
                      ],
                    },
                    {
                      icon: "📢",
                      title: "Promo Screen",
                      key: "promo_screen_enabled",
                      value: "Disabled",
                      text: "Show promotional content when POS is idle.",
                      type: "select",
                      options: [
                        { value: "enabled", label: "Enabled" },
                        { value: "disabled", label: "Disabled" },
                      ],
                    },
                    {
                      icon: "🧾",
                      title: "Show VAT",
                      key: "customer_display_show_vat",
                      value: "Enabled",
                      text: "Show VAT amount on the customer display.",
                      type: "select",
                      options: [
                        { value: "enabled", label: "Enabled" },
                        { value: "disabled", label: "Disabled" },
                      ],
                    },
                  ]}
                />
              )}

              {settingsView === "tables" && (
                <TableSettingsTab
                  sections={tableSections}
                  tables={tables}
                  staffMembers={staffMembers}
                  onRefresh={() => Promise.allSettled([loadTableSections(), loadTables(), loadStaffMembers()])}
                  onOpenModal={setModal}
                  onSaveSettings={saveReceiptSettings}
                  settings={receiptSettings}
                />
              )}

              {settingsView === "kitchen" && (
                <RestaurantSettingsModalTab
                  title="Kitchen Routing"
                  description="Configure preparation stations and how orders move through the kitchen."
                  saveLabel="Save Kitchen Settings"
                  buttonLabel="New Station"
                  modalType="kitchen_station"
                  settings={receiptSettings}
                  onSave={saveReceiptSettings}
                  onOpenModal={setModal}
                  cards={[
                    { icon: "👨‍🍳", title: "Kitchen Station", key: "default_kitchen_station", value: "Kitchen", text: "Default food preparation station.", type: "text" },
                    {
                      icon: "🍹",
                      title: "Bar Station",
                      key: "bar_station_enabled",
                      value: "Optional",
                      text: "Route drinks separately.",
                      type: "select",
                      options: [
                        { value: "enabled", label: "Enabled" },
                        { value: "optional", label: "Optional" },
                        { value: "disabled", label: "Disabled" },
                      ],
                    },
                    {
                      icon: "🍰",
                      title: "Dessert Station",
                      key: "dessert_station_enabled",
                      value: "Optional",
                      text: "Route desserts separately.",
                      type: "select",
                      options: [
                        { value: "enabled", label: "Enabled" },
                        { value: "optional", label: "Optional" },
                        { value: "disabled", label: "Disabled" },
                      ],
                    },
                    { icon: "🖨️", title: "Kitchen Printer", key: "kitchen_printer", value: "Not Set", text: "Printer for kitchen tickets.", type: "text" },
                  ]}
                />
              )}

              {settingsView === "waiters" && (
                <RestaurantSettingsModalTab
                  title="Waiter Rules"
                  description="Control waiter access, table assignment and payment permissions."
                  saveLabel="Save Waiter Settings"
                  buttonLabel="Assign Waiter"
                  modalType="assign_waiter"
                  settings={receiptSettings}
                  onSave={saveReceiptSettings}
                  onOpenModal={setModal}
                  cards={[
                    {
                      icon: "🧑‍🍽️",
                      title: "Waiter Access",
                      key: "waiter_access_enabled",
                      value: "Enabled",
                      text: "Allow waiters to create and manage orders.",
                      type: "select",
                      options: [
                        { value: "enabled", label: "Enabled" },
                        { value: "disabled", label: "Disabled" },
                      ],
                    },
                    {
                      icon: "🪑",
                      title: "Table Assignment",
                      key: "table_assignment_required",
                      value: "Optional",
                      text: "Assign tables to specific waiters.",
                      type: "select",
                      options: [
                        { value: "required", label: "Required" },
                        { value: "optional", label: "Optional" },
                      ],
                    },
                    {
                      icon: "🧾",
                      title: "Bill Printing",
                      key: "waiter_bill_printing",
                      value: "Allowed",
                      text: "Allow waiters to print bills.",
                      type: "select",
                      options: [
                        { value: "allowed", label: "Allowed" },
                        { value: "disabled", label: "Disabled" },
                      ],
                    },
                    {
                      icon: "💵",
                      title: "Payment Access",
                      key: "waiter_payment_access",
                      value: "Cashier Only",
                      text: "Choose who can take payment.",
                      type: "select",
                      options: [
                        { value: "cashier_only", label: "Cashier Only" },
                        { value: "waiter_allowed", label: "Waiter Allowed" },
                        { value: "manager_only", label: "Manager Only" },
                      ],
                    },
                  ]}
                />
              )}

              {settingsView === "delivery" && (
                <RestaurantSettingsModalTab
                  title="Delivery Rules"
                  description="Configure delivery workflow, zones, drivers and delivery fees."
                  saveLabel="Save Delivery Settings"
                  buttonLabel="New Delivery Zone"
                  modalType="delivery_zone"
                  settings={receiptSettings}
                  onSave={saveReceiptSettings}
                  onOpenModal={setModal}
                  cards={[
                    {
                      icon: "🚚",
                      title: "Delivery Orders",
                      key: "delivery_orders_enabled",
                      value: "Enabled",
                      text: "Allow delivery orders.",
                      type: "select",
                      options: [
                        { value: "enabled", label: "Enabled" },
                        { value: "disabled", label: "Disabled" },
                      ],
                    },
                    { icon: "💰", title: "Default Fee", key: "default_delivery_fee", value: "0.00", text: "Default delivery fee.", type: "number" },
                    { icon: "⏱️", title: "Estimated Time", key: "delivery_estimated_time", value: "30 min", text: "Default delivery estimate.", type: "text" },
                    {
                      icon: "🧍",
                      title: "Driver Required",
                      key: "delivery_driver_required",
                      value: "Optional",
                      text: "Require driver assignment.",
                      type: "select",
                      options: [
                        { value: "required", label: "Required" },
                        { value: "optional", label: "Optional" },
                      ],
                    },
                  ]}
                />
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

  function update(key, value) {
    setValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

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

              {field.type === "select" ? (
                <select
                  className="scan-input"
                  value={values[field.key] || ""}
                  onChange={(e) => update(field.key, e.target.value)}
                >
                  {(field.options || []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "datalist" ? (
                <>
                  <input
                    className="scan-input"
                    list={`${field.key}-options`}
                    value={values[field.key] || ""}
                    onChange={(e) => update(field.key, e.target.value)}
                  />

                  <datalist id={`${field.key}-options`}>
                    {(field.options || []).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </datalist>
                </>
              ) : (
                <input
                  className="scan-input"
                  type={field.type || "text"}
                  value={values[field.key] || ""}
                  onChange={(e) => update(field.key, e.target.value)}
                />
              )}
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

function PosDateFilter({ value, onChange, onApply }) {
  return (
    <div className="pos-filter-bar">
      <select
        className="scan-input"
        value={value.period}
        onChange={(e) =>
          onChange({
            ...value,
            period: e.target.value,
          })
        }
      >
        {POS_PERIOD_OPTIONS.map((x) => (
          <option key={x.value} value={x.value}>
            {x.label}
          </option>
        ))}
      </select>

      {value.period === "range" && (
        <>
          <input
            className="scan-input"
            type="date"
            value={value.start_date || ""}
            onChange={(e) =>
              onChange({ ...value, start_date: e.target.value })
            }
          />

          <input
            className="scan-input"
            type="date"
            value={value.end_date || ""}
            onChange={(e) =>
              onChange({ ...value, end_date: e.target.value })
            }
          />
        </>
      )}

      <button className="refresh-btn" onClick={onApply}>
        Apply
      </button>
    </div>
  );
}

function OverviewTab({ isRestaurantLike, openShifts, terminals, customers, dateFilter, setDateFilter }) {
  const [overview, setOverview] = useState({});
  const [loading, setLoading] = useState(false);

  async function loadOverview() {
    setLoading(true);

    try {
      const res = await posApi.getOverviewDashboard(dateFilter);
      setOverview(res.overview || res || {});
    } catch (err) {
      console.error("Failed to load POS overview", err);
      setOverview({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
  }, [dateFilter]);

  const salesToday = Number(overview.sales_today || 0);
  const costToday = Number(overview.cost_today || 0);
  const grossProfit = salesToday - costToday;

  const hourlySales = overview.hourly_sales || [];
  const paymentMix = overview.payment_mix || [];
  const topProducts = overview.top_products || [];
  const stockMovement = overview.stock_movement || [];
  const recentTransactions = overview.recent_transactions || [];

  const maxHourlySales = Math.max(...hourlySales.map((x) => Number(x.sales || 0)), 1);
  const maxPayment = Math.max(...paymentMix.map((x) => Number(x.amount || 0)), 1);
  const maxProductSales = Math.max(...topProducts.map((x) => Number(x.sales || 0)), 1);
  const maxStockSold = Math.max(...stockMovement.map((x) => Number(x.sold || 0)), 1);

  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Overview</h2>
          <p>Live POS dashboard for sales, payments, inventory movement and cashier activity.</p>
        </div>

        <PosDateFilter
          value={dateFilter}
          onChange={setDateFilter}
          onApply={loadOverview}
        />

        <div className="workspace-actions">
          <button className="refresh-btn" onClick={loadOverview}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {loading && <div className="pos-message">Loading overview...</div>}

      <section className="manager-grid">
        <ManagerCard icon="💰" title="Sales Today" value={money(salesToday)} text={isRestaurantLike ? "Restaurant sales captured today." : "Retail sales captured today."} />
        <ManagerCard icon="🧾" title="Transactions" value={overview.transactions || 0} text="Number of completed sales today." />
        <ManagerCard icon="👥" title="Customers Served" value={overview.customers_served || 0} text="Customers served or captured today." />
        <ManagerCard icon="📦" title="Top Selling Item" value={overview.top_selling_item || "-"} text="Best performing item today." />
        <ManagerCard icon="🟢" title="Open Shifts" value={overview.open_shifts ?? openShifts} text="Cashiers currently active." />
        <ManagerCard icon="📊" title="Gross Margin" value={`${Number(overview.gross_margin || 0).toFixed(2)}%`} text="Sales margin from POS activity." />
      </section>

      <section className="manager-grid" style={{ marginTop: 18 }}>
        <ManagerCard icon="💵" title="Cash Payments" value={money(overview.cash_payments || 0)} text="Cash received today." />
        <ManagerCard icon="💳" title="Card Payments" value={money(overview.card_payments || 0)} text="Card or speedpoint payments today." />
        <ManagerCard icon="👤" title="Account Sales" value={money(overview.account_sales || 0)} text="Sales posted to customer accounts." />
        <ManagerCard icon="↩️" title="Returns" value={money(overview.returns || 0)} text="Refunds or reversed sales today." />
        <ManagerCard icon="📦" title="Cost of Sales" value={money(costToday)} text="Inventory cost linked to today’s sales." />
        <ManagerCard icon="📈" title="Gross Profit" value={money(grossProfit)} text="Sales less cost of items sold." />
      </section>

      <section className="overview-dashboard-grid" style={{ marginTop: 18 }}>
        <div className="manager-panel wide-panel">
          <div className="workspace-head compact-head">
            <div>
              <h2>Sales Trend Today</h2>
              <p>Hourly completed POS sales.</p>
            </div>
          </div>

          <div className="bar-chart">
            {hourlySales.length ? (
              hourlySales.map((x, idx) => {
                const height = Math.max((Number(x.sales || 0) / maxHourlySales) * 100, 4);

                return (
                  <div className="bar-item" key={idx}>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ height: `${height}%` }} />
                    </div>
                    <span>{x.hour}</span>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">No hourly sales yet</div>
            )}
          </div>
        </div>

        <div className="manager-panel">
          <div className="workspace-head compact-head">
            <div>
              <h2>Payment Mix</h2>
              <p>Cash, card and account split.</p>
            </div>
          </div>

          <div className="payment-bars">
            {paymentMix.length ? (
              paymentMix.map((x, idx) => {
                const width = Math.max((Number(x.amount || 0) / maxPayment) * 100, 3);

                return (
                  <div className="progress-row" key={idx}>
                    <div className="progress-label">
                      <span>{x.method}</span>
                      <strong>{money(x.amount || 0)}</strong>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">No payment activity yet</div>
            )}
          </div>
        </div>
      </section>

      <section className="overview-dashboard-grid" style={{ marginTop: 18 }}>
        <div className="manager-panel">
          <div className="workspace-head compact-head">
            <div>
              <h2>Top Products</h2>
              <p>Best sellers by value today.</p>
            </div>
          </div>

          <div className="ranking-list">
            {topProducts.length ? (
              topProducts.map((x, idx) => {
                const width = Math.max((Number(x.sales || 0) / maxProductSales) * 100, 3);

                return (
                  <div className="rank-row" key={idx}>
                    <div className="rank-main">
                      <strong>{idx + 1}. {x.item}</strong>
                      <span>{Number(x.qty || 0)} sold • {money(x.sales || 0)}</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">No products sold yet</div>
            )}
          </div>
        </div>

        <div className="manager-panel">
          <div className="workspace-head compact-head">
            <div>
              <h2>Inventory Movement</h2>
              <p>Fast moving items from today’s sales.</p>
            </div>
          </div>

          <div className="ranking-list">
            {stockMovement.length ? (
              stockMovement.map((x, idx) => {
                const width = Math.max((Number(x.sold || 0) / maxStockSold) * 100, 3);

                return (
                  <div className="rank-row" key={idx}>
                    <div className="rank-main">
                      <strong>{x.item}</strong>
                      <span>Sold: {Number(x.sold || 0)} • Closing: {Number(x.closing || 0)}</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">No stock movement yet</div>
            )}
          </div>
        </div>
      </section>

      <section className="overview-dashboard-grid" style={{ marginTop: 18 }}>
        <div className="manager-panel">
          <div className="workspace-head compact-head">
            <div>
              <h2>Today’s Activity</h2>
              <p>Operational position.</p>
            </div>
          </div>

          <div className="mini-list">
            <div><span>Active terminals</span><strong>{terminals?.filter((x) => x.is_active).length || 0}</strong></div>
            <div><span>Open shifts</span><strong>{overview.open_shifts ?? openShifts}</strong></div>
            <div><span>Customers captured</span><strong>{customers?.length || 0}</strong></div>
            <div><span>Average sale</span><strong>{money(overview.average_ticket || 0)}</strong></div>
          </div>
        </div>

        <div className="manager-panel">
          <div className="workspace-head compact-head">
            <div>
              <h2>Attention Needed</h2>
              <p>Manager action points.</p>
            </div>
          </div>

          <div className="mini-list">
            <div><span>Returns pending</span><strong>{overview.pending_returns || 0}</strong></div>
            <div><span>Discount approvals</span><strong>{overview.pending_discounts || 0}</strong></div>
            <div><span>Low stock items</span><strong>{overview.low_stock_items || 0}</strong></div>
            <div><span>Cash variance</span><strong>{money(overview.cash_variance || 0)}</strong></div>
          </div>
        </div>
      </section>

      <section className="manager-workspace" style={{ marginTop: 18 }}>
        <div className="workspace-head">
          <div>
            <h2>Recent Transactions</h2>
            <p>Latest completed POS sales.</p>
          </div>
        </div>

        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Time</th>
                <th>Cashier</th>
                <th>Customer</th>
                <th>Amount</th>
              </tr>
            </thead>

            <tbody>
              {recentTransactions.length ? (
                recentTransactions.map((r, idx) => (
                  <tr key={idx}>
                    <td>{r.sale_no}</td>
                    <td>{r.time}</td>
                    <td>{r.cashier}</td>
                    <td>{r.customer}</td>
                    <td>{money(r.amount || 0)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td>No transactions yet</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>0.00</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
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

const SALES_REPORT_KEYS = {
  total_sales: "sold-items",
  transactions: "transactions",
  returns: "returns-report",
  cash_payments: "cash-payments",
  card_payments: "card-payments",
  account_sales: "account-sales",

  daily_sales: "daily-sales",
  sales_product: "sales-per-product",
  sales_category: "sales-per-category",
  cashier_performance: "cashier-performance",
  customer_accounts: "customer-accounts",
  discount_report: "discount-report",
  returns_report: "returns-report",
  stock_movement: "stock-movement",
};

function SalesTab({ dateFilter, setDateFilter }) {
  const [salesView, setSalesView] = useState(null);
  const [summary, setSummary] = useState({});
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const views = {
    total_sales: {
      title: "Total Sales - Sold Items",
      columns: ["Item", "SKU", "Qty Sold", "Unit Price", "Total Sales"],
      fallback: [["No sold items yet", "-", "0", "0.00", "0.00"]],
    },
    transactions: {
      title: "POS Transactions",
      columns: ["Receipt No", "Date", "Cashier", "Customer", "Amount", "Status"],
      fallback: [["No transactions yet", "-", "-", "-", "0.00", "-"]],
    },
    returns: {
      title: "Returns Report",
      columns: ["Return No", "Item", "Qty", "Reason", "Refund Amount", "Approval Status"],
      fallback: [["No returns yet", "-", "0", "-", "0.00", "-"]],
    },
    cash_payments: {
      title: "Cash Payments",
      columns: ["Receipt No", "Date", "Cashier", "Received", "Change", "Net Cash"],
      fallback: [["No cash payments yet", "-", "-", "0.00", "0.00", "0.00"]],
    },
    card_payments: {
      title: "Card Payments",
      columns: ["Receipt No", "Date", "Terminal", "Reference", "Amount", "Status"],
      fallback: [["No card payments yet", "-", "-", "-", "0.00", "-"]],
    },
    account_sales: {
      title: "Account Sales",
      columns: ["Customer", "Receipt No", "Date", "Sale Amount", "Balance", "Credit Limit"],
      fallback: [["No account sales yet", "-", "-", "0.00", "0.00", "0.00"]],
    },
  };

  const active = salesView ? views[salesView] : null;
  const displayRows = rows.length ? rows : active?.fallback || [];

  async function loadSummary() {
    try {
      const res = await posApi.getReport("sales-summary", dateFilter);
      setSummary(res.summary || {});
    } catch (err) {
      console.error("Failed to load POS sales summary", err);
      setSummary({});
    }
  }

  async function loadSalesView(viewKey = salesView) {
    if (!viewKey) return;

    setLoading(true);

    try {
      const reportKey = SALES_REPORT_KEYS[viewKey];

      const res = await posApi.getReport(reportKey, dateFilter);

      setRows(res.rows || []);
    } catch (err) {
      console.error("Failed to load POS sales view", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();

    if (salesView) {
      loadSalesView(salesView);
    }
  }, [dateFilter, salesView]);

  const exportRows = [
    ["Total Sales", money(summary.today_sales || 0), "Sales for selected period"],
    ["Transactions", String(summary.transactions || 0), "Completed POS transactions"],
    ["Returns", money(summary.returns || 0), "Returns/refunds for selected period"],
    ["Cash Payments", money(summary.cash_payments || 0), "Cash received"],
    ["Card Payments", money(summary.card_payments || 0), "Card/speedpoint received"],
    ["Account Sales", money(summary.account_sales || 0), "Customer account sales"],
  ];

  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Sales</h2>
          <p>Sales, transactions, payments, returns and cashier activity.</p>
        </div>

        <div className="workspace-actions">
          <PosDateFilter
            value={dateFilter}
            onChange={setDateFilter}
            onApply={() => {
              loadSummary();
              if (salesView) loadSalesView(salesView);
            }}
          />

          <button
            className="refresh-btn"
            onClick={() => {
              loadSummary();
              if (salesView) loadSalesView(salesView);
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {loading && <div className="pos-message">Loading sales...</div>}

      <section className="manager-grid">
        <ManagerCard icon="💰" title="Sales" value={money(summary.today_sales || summary.total_sales || 0)} text="Click to view sold items and quantities." onClick={() => setSalesView("total_sales")} />
        <ManagerCard icon="🧾" title="Transactions" value={String(summary.transactions || 0)} text="Click to view completed POS transactions." onClick={() => setSalesView("transactions")} />
        <ManagerCard icon="↩️" title="Returns" value={money(summary.returns || 0)} text="Click to view return requests and refunds." onClick={() => setSalesView("returns")} />
        <ManagerCard icon="💵" title="Cash Payments" value={money(summary.cash_payments || 0)} text="Click to view cash received." onClick={() => setSalesView("cash_payments")} />
        <ManagerCard icon="💳" title="Card Payments" value={money(summary.card_payments || 0)} text="Click to view card payments." onClick={() => setSalesView("card_payments")} />
        <ManagerCard icon="👤" title="Account Sales" value={money(summary.account_sales || 0)} text="Click to view customer account sales." onClick={() => setSalesView("account_sales")} />
      </section>

      {active && (
        <section className="manager-workspace" style={{ marginTop: 18 }}>
          <div className="workspace-head">
            <div>
              <h2>{active.title}</h2>
              <p>Filtered by selected period.</p>
            </div>

            <div className="workspace-actions">
              <button
                className="scan-btn"
                onClick={() => exportReportToExcel(active.title, active.columns, displayRows)}
              >
                Export Excel
              </button>

              <button
                className="scan-btn"
                onClick={() => printReport(active.title, active.columns, displayRows)}
              >
                Print
              </button>
            </div>
          </div>

          <div className="report-table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  {active.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {displayRows.map((row, idx) => (
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
      )}
    </section>
  );
}

function MenuManagerTab({
  menuItems = [],
  onRefresh,
  onCreate,
}) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Restaurant Menu</h2>
          <p>Create meals, combos, add-ons, prices and display-screen menu items.</p>
        </div>

        <div className="workspace-actions">
          <button className="soft" onClick={onRefresh}>↻ Refresh</button>
          <button className="scan-btn" onClick={onCreate}>+ New Menu Item</button>
        </div>
      </div>

      <div className="menu-admin-grid">
        {!menuItems.length ? (
          <div className="empty-state">
            <strong>No menu items yet</strong>
            <p>Add meals like Chicken & Chips, Bunny Chow, or combo meals.</p>
          </div>
        ) : (
          menuItems.map((item) => (
            <article className="menu-admin-card" key={item.id}>
              <div className="menu-admin-image">
                {item.image_url ? <img src={item.image_url} alt={item.name} /> : <span>🍽️</span>}
              </div>

              <div>
                <h3>{item.name}</h3>
                <p>{item.combo_description || item.category}</p>
                <strong>{money(item.price || 0)}</strong>
                <small>{item.is_active !== false ? "Active" : "Inactive"}</small>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function RestaurantSettingsModalTab({
  title,
  description,
  saveLabel,
  buttonLabel,
  modalType,
  settings = {},
  onSave,
  onOpenModal,
  cards = [],
}) {
  const [form, setForm] = useState(settings || {});
  const [activeCard, setActiveCard] = useState(null);

  useEffect(() => {
    setForm(settings || {});
  }, [settings]);

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const active = cards.find((x) => x.key === activeCard);

  return (
    <section className="manager-workspace" style={{ marginTop: 18 }}>
      <div className="workspace-head">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>

        <div className="workspace-actions">
          <button
            className="soft"
            onClick={() =>
              onOpenModal({
                type: modalType,
                title: buttonLabel,
                fields:
                  modalType === "assign_waiter"
                    ? [
                        { key: "table_id", label: "Table ID", value: "" },
                        { key: "waiter_id", label: "Waiter Staff ID", value: "" },
                      ]
                    : modalType === "delivery_zone"
                    ? [
                        { key: "zone_name", label: "Zone Name", value: "" },
                        { key: "delivery_fee", label: "Delivery Fee", value: "0" },
                        { key: "estimated_time", label: "Estimated Time", value: "30 min" },
                      ]
                    : [
                        { key: "station_name", label: "Station Name", value: "" },
                        { key: "printer_name", label: "Printer Name", value: "" },
                        { key: "default_routing", label: "Default Routing", value: "Food items" },
                      ],
              })
            }
          >
            {buttonLabel}
          </button>

          <button className="scan-btn" onClick={() => onSave(form)}>
            {saveLabel}
          </button>
        </div>
      </div>

      <section className="manager-grid">
        {cards.map((card) => (
          <ManagerCard
            key={card.key}
            icon={card.icon}
            title={card.title}
            value={form?.[card.key] || card.value}
            text={card.text}
            onClick={() => setActiveCard(card.key)}
          />
        ))}
      </section>

      {active && (
        <div className="scan-card" style={{ marginTop: 16 }}>
          <h3>{active.title}</h3>
          <p>{active.text}</p>

          {active.type === "select" && (
            <select
              className="scan-input"
              value={form?.[active.key] ?? active.defaultValue ?? ""}
              onChange={(e) => update(active.key, e.target.value)}
            >
              {(active.options || []).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          {active.type === "number" && (
            <input
              className="scan-input"
              type="number"
              value={form?.[active.key] ?? active.defaultValue ?? ""}
              onChange={(e) => update(active.key, e.target.value)}
            />
          )}

          {active.type === "text" && (
            <input
              className="scan-input"
              value={form?.[active.key] ?? active.defaultValue ?? ""}
              onChange={(e) => update(active.key, e.target.value)}
            />
          )}
        </div>
      )}
    </section>
  );
}

  function ShiftsTab({
    shifts = [],
    shiftTemplates = [],
    shiftSchedule = [],
    staffLeave = [],
    staffMembers = [],
    onRefresh,
    onCloseShift,
    onNewShiftPattern,
    onAssignStaff,
    onAddLeave,
  }) {
  const employeeName = (employeeUserId) => {
    const staff = staffMembers.find(
      (x) =>
        Number(x.id) === Number(employeeUserId) ||
        Number(x.user_id) === Number(employeeUserId) ||
        Number(x.company_user_id) === Number(employeeUserId)
    );

    return staff?.full_name || staff?.name || `Employee #${employeeUserId}`;
  };

  const openCashupShifts = shifts.filter((s) => s.status === "open").length;

  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Shifts & Cash-up</h2>
          <p>Set shift patterns, plan staff schedules, track off days, and close active cashier shifts.</p>
        </div>

        <div className="workspace-actions">
          <button className="soft" onClick={onRefresh}>↻ Refresh</button>
          <button className="scan-btn" onClick={onNewShiftPattern}>
            + New Shift Pattern
          </button>

          <button className="scan-btn" onClick={onAssignStaff}>
            + Assign Staff
          </button>
        </div>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="🕒" title="Shift Patterns" value={shiftTemplates.length} text="Templates such as morning, day, afternoon and night shifts." />
        <ManagerCard icon="📅" title="Scheduled Staff" value={shiftSchedule.length} text="Employees planned on the staff roster." />
        <ManagerCard icon="🌴" title="Off / Leave Days" value={staffLeave.length} text="Approved off days, annual leave and sick leave." />
        <ManagerCard icon="💵" title="Open Cash-up Shifts" value={openCashupShifts} text="Cashier shifts currently open." />
      </section>

      <div className="manager-workspace" style={{ marginTop: 18 }}>
        <div className="workspace-head">
          <div>
            <h2>Shift Patterns</h2>
            <p>Standard shift templates used when scheduling staff.</p>
          </div>
        </div>

        <div className="data-list">
          {shiftTemplates.length ? (
            shiftTemplates.map((s) => (
              <div className="data-row" key={s.id}>
                <div>
                  <strong>{s.shift_name || s.name || "Unnamed Shift"}</strong>
                  <small>{s.pattern_type || s.pattern || "standard"}</small>
                </div>

                <strong>
                  {s.start_time || "-"} - {s.end_time || "-"}
                </strong>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <strong>No shift patterns yet</strong>
              <p>Create templates such as Morning, Day, Afternoon or Night shift.</p>
            </div>
          )}
        </div>
      </div>

      <div className="manager-workspace" style={{ marginTop: 18 }}>
        <div className="workspace-head">
          <div>
            <h2>Staff Schedule</h2>
            <p>Plan who works, who is off, and who is on leave.</p>
          </div>
        </div>

        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Shift</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>

            <tbody>
              {shiftSchedule.length ? (
                shiftSchedule.map((row) => (
                  <tr key={row.id}>
                    <td>{employeeName(row.employee_user_id)}</td>
                    <td>{row.work_date || "-"}</td>
                    <td>{row.shift_name || "Off"}</td>
                    <td>{row.start_time || "-"}</td>
                    <td>{row.end_time || "-"}</td>
                    <td>{row.schedule_status || "-"}</td>
                    <td>{row.notes || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7">No staff schedule captured yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="manager-workspace" style={{ marginTop: 18 }}>
        <div className="workspace-head">
          <div>
            <h2>Leave / Off Days</h2>
            <p>Track annual leave, sick leave, unpaid leave and planned off days.</p>
          </div>

          <button className="scan-btn" onClick={onAddLeave}>
            + Add Leave / Off Day
          </button>
        </div>

        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {staffLeave.length ? (
                staffLeave.map((row) => (
                  <tr key={row.id}>
                    <td>{employeeName(row.employee_user_id)}</td>
                    <td>{row.leave_type || "-"}</td>
                    <td>{row.start_date || "-"}</td>
                    <td>{row.end_date || "-"}</td>
                    <td>{row.status || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5">No leave or off days captured yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="manager-workspace" style={{ marginTop: 18 }}>
        <div className="workspace-head">
          <div>
            <h2>Active Shifts & Cash-up</h2>
            <p>Review open shifts and close cashiers at end of day.</p>
          </div>
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
              <strong>No active shifts loaded</strong>
              <p>Click refresh or start a cashier shift.</p>
            </div>
          )}
        </div>
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

function ReportsTab({ reportView, setReportView, dateFilter, setDateFilter }) {
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);

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

  async function loadTradingSummary() {
    setLoading(true);

    try {
      const res = await posApi.getReport("trading-summary", dateFilter);
      setSummary(res.summary || {});
    } catch (err) {
      console.error("Failed to load POS trading summary", err);
      setSummary({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!reportView) {
      loadTradingSummary();
    }
  }, [reportView]);

  if (reportView) {
    return (
      <ReportGridScreen
        reportView={reportView}
        onBack={() => setReportView(null)}
      />
    );
  }

  const exportRows = [
    ["Sales", money(summary.sales || 0), "Gross POS sales for the selected period."],
    ["Returns", money(summary.returns || 0), "Refunds and reversed POS transactions."],
    ["Net Sales", money(summary.net_sales || 0), "Sales after returns and reversals."],
    ["Cost of Items Sold", money(summary.cost_of_items_sold || 0), "Inventory cost linked to POS sales."],
    ["Trading Result", money(summary.trading_result || 0), "Net sales less cost of items sold."],
  ];

  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>POS Reports</h2>
          <p>Sales, products, cashiers, customers, discounts and margin analysis.</p>
        </div>

        <ReportGridScreen
          reportView={reportView}
          dateFilter={dateFilter}
          onBack={() => setReportView(null)}
        />

        <div className="workspace-actions">
          <button
            className="refresh-btn"
            onClick={() =>
              exportReportToExcel(
                "POS Mini Trading Summary",
                ["Metric", "Amount", "Description"],
                exportRows
              )
            }
          >
            Export Excel
          </button>

          <button
            className="scan-btn"
            onClick={() =>
              printReport(
                "POS Mini Trading Summary",
                ["Metric", "Amount", "Description"],
                exportRows
              )
            }
          >
            Print
          </button>
        </div>
      </div>

      {loading && <div className="pos-message">Loading reports...</div>}

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
          <ManagerCard
            icon="💰"
            title="Sales"
            value={money(summary.sales || 0)}
            text="Gross POS sales for the selected period."
          />

          <ManagerCard
            icon="↩️"
            title="Returns"
            value={money(summary.returns || 0)}
            text="Refunds and reversed POS transactions."
          />

          <ManagerCard
            icon="🧾"
            title="Net Sales"
            value={money(summary.net_sales || 0)}
            text="Sales after returns and reversals."
          />

          <ManagerCard
            icon="📦"
            title="Cost of Items Sold"
            value={money(summary.cost_of_items_sold || 0)}
            text="Inventory cost linked to POS sales."
          />

          <ManagerCard
            icon="📊"
            title="Trading Result"
            value={money(summary.trading_result || 0)}
            text="Net sales less cost of items sold."
          />
        </section>
      </div>
    </section>
  );
}

function ReportGridScreen({ reportView, onBack }) {
  const [q, setQ] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);

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

  const fallbackRows = {
    daily_sales: [["-", "-", "-", "-", "0.00", "0.00"]],
    sales_product: [["No products sold yet", "-", "0", "0.00", "0.00", "0.00", "0.00%"]],
    sales_category: [["No categories yet", "0", "0.00", "0.00", "0.00", "0.00%"]],
    cashier_performance: [["No cashier activity yet", "0.00", "0.00", "0.00", "0.00"]],
    customer_accounts: [["No customer account sales yet", "-", "0.00", "0.00", "0.00"]],
    discount_report: [["No discounts used yet", "-", "0.00", "0", "0.00"]],
    returns_report: [["No returns yet", "-", "-", "-", "0.00"]],
    stock_movement: [["No stock movement yet", "-", "0", "0", "0", "0.00", "0.00"]],
  };

  const title = titles[reportView] || "POS Report";
  const reportColumns = columns[reportView] || [];
  const displayRows = rows.length ? rows : fallbackRows[reportView] || [];

  async function loadReport() {
    setLoading(true);

    try {
      const reportKey = SALES_REPORT_KEYS[reportView];

      const res = await posApi.getReport(reportKey, {
        q,
        start_date: startDate,
        end_date: endDate,
      });

      setRows(res.rows || []);
      setSummary(res.summary || {});
    } catch (err) {
      console.error("Failed to load POS report", err);
      setRows([]);
      setSummary({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReport();
  }, [reportView]);

  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>{title}</h2>
          <p>Detailed report grid for review, filtering and export.</p>
        </div>

        <button className="scan-btn" onClick={onBack}>
          Back to Reports
        </button>
      </div>

      <section className="report-toolbar">
        <input
          className="scan-input"
          placeholder="Search item, cashier, customer..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <input
          className="scan-input"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />

        <input
          className="scan-input"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />

        <button className="scan-btn" onClick={loadReport}>
          Apply
        </button>

        <button
          className="scan-btn"
          onClick={() => exportReportToExcel(title, reportColumns, displayRows)}
        >
          Export Excel
        </button>

        <button
          className="scan-btn"
          onClick={() => printReport(title, reportColumns, displayRows)}
        >
          Print
        </button>
      </section>

      {loading && <div className="pos-message">Loading report...</div>}

      <section className="manager-grid">
        <ManagerCard icon="💰" title="Total Sales" value={money(summary.total_sales || 0)} text="Revenue from selected POS sales." />
        <ManagerCard icon="📦" title="Total Cost" value={money(summary.total_cost || 0)} text="Cost of items sold for those sales." />
        <ManagerCard icon="📊" title="Gross Profit" value={money(summary.gross_profit || 0)} text="Sales less cost of items sold." />
        <ManagerCard icon="📈" title="Margin" value={`${Number(summary.margin || 0).toFixed(2)}%`} text="Gross profit as percentage of sales." />
      </section>

      <div className="report-table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              {reportColumns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {displayRows.map((row, idx) => (
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

function exportReportToExcel(title, columns = [], rows = []) {
  const tableRows = rows.map((row) => `
    <tr>
      ${row.map((cell) => `<td>${cell}</td>`).join("")}
    </tr>
  `).join("");

  const html = `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          table { border-collapse: collapse; width: 100%; table-layout: auto; }
          th { background: #064653; color: white; font-weight: bold; }
          th, td { border: 1px solid #d9e6e6; padding: 8px; white-space: nowrap; }
          h2 { font-family: Arial; color: #064653; }
        </style>
      </head>
      <body>
        <h2>${title}</h2>
        <table>
          <thead>
            <tr>${columns.map((c) => `<th>${c}</th>`).join("")}</tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = `${title.replace(/\s+/g, "_")}.xls`;
  a.click();

  URL.revokeObjectURL(url);
}

function printReport(title, columns = [], rows = []) {
  const tableRows = rows.map((row) => `
    <tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>
  `).join("");

  const win = window.open("", "_blank");

  win.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial; padding: 24px; }
          h2 { color: #064653; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #064653; color: white; }
          th, td { border: 1px solid #d9e6e6; padding: 8px; font-size: 12px; }
        </style>
      </head>
      <body>
        <h2>${title}</h2>
        <table>
          <thead>
            <tr>${columns.map((c) => `<th>${c}</th>`).join("")}</tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `);

  win.document.close();
  win.focus();
  win.print();
}

function StaffTab({
  staffMembers = [],
  isRestaurantLike = false,
  onAddStaff,
  onEditStaff,
  onDeactivate,
  onRefresh,
}) {
  const activeStaff = staffMembers.filter((s) => s.is_active !== false);

  const cashiers = activeStaff.filter((s) => String(s.role).toLowerCase() === "cashier").length;
  const managers = activeStaff.filter((s) => String(s.role).toLowerCase() === "manager").length;
  const waiters = activeStaff.filter((s) => String(s.role).toLowerCase() === "waiter").length;
  const kitchen = activeStaff.filter((s) => String(s.role).toLowerCase() === "kitchen").length;
  const drivers = activeStaff.filter((s) => String(s.role).toLowerCase() === "driver").length;

  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Staff & Access</h2>
          <p>Add POS employees, assign roles, control access and review staff readiness.</p>
        </div>

        <div className="workspace-actions">
          <button className="soft" onClick={onRefresh}>
            ↻ Refresh
          </button>

          <button className="scan-btn" onClick={onAddStaff}>
            + Add Staff
          </button>

          <button
            className="soft"
            onClick={() => onEditStaff(s)}
          >
            Edit
          </button>
        </div>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="💳" title="Cashiers" value={cashiers} text="Users who can process sales, returns and payments." />
        <ManagerCard icon="🧑‍💼" title="Managers" value={managers} text="Users who can manage shifts, pricing, reports and approvals." />
        <ManagerCard icon="🍽️" title="Waiters" value={waiters} text="Users who can take table, collection and delivery orders." />
        <ManagerCard icon="👨‍🍳" title="Kitchen Users" value={kitchen} text="Users who can view and update kitchen order status." />
        <ManagerCard icon="🚚" title="Drivers" value={drivers} text="Users who can manage deliveries and dispatch updates." />
      </section>

      <div className="report-table-wrap" style={{ marginTop: 16 }}>
        <table className="report-table">
          <thead>
            <tr>
              <th>Employee Code</th>
              <th>Access Code</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>POS Role</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {!staffMembers.length ? (
              <tr>
                <td colSpan="6" style={{ textAlign: "center" }}>
                  No staff members found
                </td>
              </tr>
            ) : (
              staffMembers.map((s) => (
                <tr key={s.id}>
                  <td>{s.employee_code || "-"}</td>
                  <td>
                    <strong>{s.pos_access_code || s.access_code || "-"}</strong>
                  </td>
                  <td>{s.full_name || s.pos_display_name || s.name || "-"}</td>
                  <td>{s.phone || "-"}</td>
                  <td>{s.email || "-"}</td>
                  <td>{s.role || s.pos_role || "-"}</td>
                  <td>{s.is_active !== false ? "Active" : "Inactive"}</td>
                  <td>
                    {s.is_active !== false && (
                      <button
                        className="soft danger"
                        onClick={() => onDeactivate(s.id)}
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AttendanceTab({ attendanceLog = [], onRefresh }) {
  const [attendanceView, setAttendanceView] = useState(null);

  const today = new Date().toISOString().slice(0, 10);

  function fmtDateTime(value) {
    if (!value) return "-";
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  }

  function fmtDate(value) {
    if (!value) return "-";
    return String(value).slice(0, 10);
  }

  function employeeName(row) {
    return (
      row.employee_name ||
      row.full_name ||
      row.staff_name ||
      row.cashier_name ||
      row.employee_user_id ||
      "-"
    );
  }

  function hoursWorked(row) {
    if (!row.clock_in_at) return "-";

    const start = new Date(row.clock_in_at);
    const end = row.clock_out_at ? new Date(row.clock_out_at) : new Date();

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "-";

    const hours = (end - start) / 1000 / 60 / 60;
    return `${Math.max(hours, 0).toFixed(2)} hrs`;
  }

  const clockedInRows = attendanceLog.filter((x) => !x.clock_out_at);
  const lateRows = attendanceLog.filter((x) => Number(x.late_minutes || 0) > 0);
  const openRows = attendanceLog.filter((x) => x.status === "clocked_in" || !x.clock_out_at);
  const todayRows = attendanceLog.filter((x) => fmtDate(x.clock_in_at) === today);

  const views = {
    clocked_in: {
      title: "Clocked In Staff",
      description: "Employees currently on duty.",
      columns: ["Employee", "Clock In", "Shift", "Status", "Hours"],
      rows: clockedInRows.map((x) => [
        employeeName(x),
        fmtDateTime(x.clock_in_at),
        x.shift_name || "-",
        x.status || "clocked_in",
        hoursWorked(x),
      ]),
    },

    late: {
      title: "Late Arrivals",
      description: "Employees who arrived after scheduled shift start.",
      columns: ["Employee", "Date", "Shift", "Clock In", "Minutes Late"],
      rows: lateRows.map((x) => [
        employeeName(x),
        fmtDate(x.clock_in_at),
        x.shift_name || "-",
        fmtDateTime(x.clock_in_at),
        Number(x.late_minutes || 0),
      ]),
    },

    open: {
      title: "Open Attendance",
      description: "Clock-ins that do not yet have a clock-out.",
      columns: ["Employee", "Clock In", "Shift", "Hours Worked", "Status"],
      rows: openRows.map((x) => [
        employeeName(x),
        fmtDateTime(x.clock_in_at),
        x.shift_name || "-",
        hoursWorked(x),
        x.status || "-",
      ]),
    },

    log: {
      title: "Attendance Log",
      description: "Full clock-in and clock-out history.",
      columns: ["Employee", "Date", "Clock In", "Clock Out", "Shift", "Hours", "Status"],
      rows: attendanceLog.map((x) => [
        employeeName(x),
        fmtDate(x.clock_in_at),
        fmtDateTime(x.clock_in_at),
        fmtDateTime(x.clock_out_at),
        x.shift_name || "-",
        hoursWorked(x),
        x.status || "-",
      ]),
    },

    today: {
      title: "Today Attendance",
      description: "All attendance records captured today.",
      columns: ["Employee", "Clock In", "Clock Out", "Shift", "Hours", "Status"],
      rows: todayRows.map((x) => [
        employeeName(x),
        fmtDateTime(x.clock_in_at),
        fmtDateTime(x.clock_out_at),
        x.shift_name || "-",
        hoursWorked(x),
        x.status || "-",
      ]),
    },
  };

  const active = attendanceView ? views[attendanceView] : null;

  if (active) {
    return (
      <section className="manager-workspace">
        <div className="workspace-head">
          <div>
            <h2>{active.title}</h2>
            <p>{active.description}</p>
          </div>

          <div className="workspace-actions">
            <button className="soft" onClick={() => setAttendanceView(null)}>
              ← Back
            </button>

            <button className="soft" onClick={onRefresh}>
              ↻ Refresh
            </button>
          </div>
        </div>

        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                {active.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {active.rows.length ? (
                active.rows.map((row, idx) => (
                  <tr key={idx}>
                    {row.map((cell, cidx) => (
                      <td key={cidx}>{cell}</td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={active.columns.length} style={{ textAlign: "center" }}>
                    No attendance records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Staff Attendance</h2>
          <p>Clock-in, clock-out, shift attendance and late arrivals.</p>
        </div>

        <button className="scan-btn" onClick={onRefresh}>
          ↻ Refresh
        </button>
      </div>

      <section className="manager-grid">
        <ManagerCard
          icon="🟢"
          title="Clocked In"
          value={clockedInRows.length}
          text="Currently on duty."
          onClick={() => setAttendanceView("clocked_in")}
        />

        <ManagerCard
          icon="⏰"
          title="Late Arrivals"
          value={lateRows.length}
          text="Arrived after shift start."
          onClick={() => setAttendanceView("late")}
        />

        <ManagerCard
          icon="🔄"
          title="Open Attendance"
          value={openRows.length}
          text="Clock-ins without clock-out."
          onClick={() => setAttendanceView("open")}
        />

        <ManagerCard
          icon="📋"
          title="Attendance Log"
          value={attendanceLog.length}
          text="Daily attendance history."
          onClick={() => setAttendanceView("log")}
        />

        <ManagerCard
          icon="📅"
          title="Today"
          value={todayRows.length}
          text="Attendance captured today."
          onClick={() => setAttendanceView("today")}
        />
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

    gratuity_percent: 0,

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

          <label>Restaurant Tip / Gratuity %</label>
          <input
            className="scan-input"
            type="number"
            value={form.gratuity_percent || ""}
            onChange={(e) => updateField("gratuity_percent", e.target.value)}
          />

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

function RecipesTab({
  recipes = [],
  onCreate,
  onRefresh,
}) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Recipes / Menu BOM</h2>
          <p>Link menu items to ingredient recipes for automatic food-cost tracking.</p>
        </div>

        <div className="workspace-actions">
          <button className="soft action-btn" onClick={onRefresh}>
            ↻ Refresh
          </button>

          <button className="scan-btn action-btn" onClick={onCreate}>
            + New Recipe
          </button>
        </div>
      </div>

      <div className="report-table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              <th>Recipe Code</th>
              <th>Recipe Name</th>
              <th>Yield Qty</th>
              <th>Unit</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {!recipes.length ? (
              <tr>
                <td colSpan="5" style={{ textAlign: "center" }}>
                  No recipes found
                </td>
              </tr>
            ) : (
              recipes.map((r) => (
                <tr key={r.id}>
                  <td>{r.recipe_code || "-"}</td>
                  <td>{r.recipe_name || r.name}</td>
                  <td>{r.yield_qty ?? 0}</td>
                  <td>{r.yield_uom || "-"}</td>
                  <td>
                    {r.is_active !== false
                      ? "Active"
                      : "Inactive"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CostingTab({
  costPools = [],
  onCreate,
  onRefresh,
}) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Meal Costing</h2>
          <p>Allocate rent, electricity, water, labour and other overheads to menu items.</p>
        </div>

        <div className="workspace-actions">
          <button className="soft" onClick={onRefresh}>
            ↻ Refresh
          </button>

          <button className="scan-btn">
            + New Cost Pool
          </button>
        </div>
      </div>

      <div className="report-table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              <th>Pool Code</th>
              <th>Cost Pool</th>
              <th>Type</th>
              <th>Allocation Basis</th>
              <th>Amount</th>
              <th>Period</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {!costPools.length ? (
              <tr>
                <td colSpan="7" style={{ textAlign: "center" }}>
                  No cost pools found
                </td>
              </tr>
            ) : (
              costPools.map((p) => (
                <tr key={p.id}>
                  <td>{p.pool_code || "-"}</td>
                  <td>{p.pool_name || "-"}</td>
                  <td>{p.pool_type || "-"}</td>
                  <td>{p.allocation_basis || "-"}</td>
                  <td>{money(p.amount || 0)}</td>
                  <td>
                    {(p.period_start || "-") + " to " + (p.period_end || "-")}
                  </td>
                  <td>{p.is_active !== false ? "Active" : "Inactive"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReceiptPreviewTab({ settings = {}, onSave }) {
  const [template, setTemplate] = useState(settings?.slip_template || "retail_classic");

  useEffect(() => {
    setTemplate(settings?.slip_template || "retail_classic");
  }, [settings]);

  const previewSettings = {
    ...(settings || {}),
    slip_template: template,
    show_logo: settings?.show_logo ?? true,
    show_motto: settings?.show_motto ?? true,
    show_cashier_name: settings?.show_cashier_name ?? true,
    show_customer_name: settings?.show_customer_name ?? true,
    footer_message: settings?.footer_message || "Thank you for your business.",
    returns_policy: settings?.returns_policy || "Returns accepted within 7 days with original receipt.",
  };

  const samplePayload = {
    company: {
      name: "Demo Company",
      vat: "VAT123456",
      company_phone: "012 345 6789",
      physical_address: "Main Branch",
    },
    branding: {},
    settings: previewSettings,
    sale: {
      sale_no: "DRAFT-001",
      sale_date: new Date().toLocaleString(),
      cashier_name: "Cashier",
      terminal_code: "TILL-01",
      customer_name: "Walk-in Customer",
      payment_method: "Cash/Card",
      subtotal: 37.39,
      discount_amount: 0,
      vat_amount: 5.61,
      gross_amount: 43,
      amount_paid: 50,
      change_amount: 7,
      lines: [
        { name: "Item 1", qty: 1, gross_amount: 25 },
        { name: "Item 2", qty: 1, gross_amount: 18 },
      ],
    },
    order: {
      order_no: "ORD-001",
      table_no: "T1",
      waiter_name: "Waiter",
      guests: 2,
      subtotal: 37.39,
      vat_amount: 5.61,
      gross_amount: 43,
      lines: [
        { name: "Meal 1", qty: 1, gross_amount: 25 },
        { name: "Drink 1", qty: 1, gross_amount: 18 },
      ],
    },
    ticket: {
      order_no: "ORD-001",
      table_no: "T1",
      waiter_name: "Waiter",
      station_name: "Kitchen",
      lines: [
        { name: "Meal 1", qty: 1, notes: "No onions" },
        { name: "Drink 1", qty: 1 },
      ],
    },
  };

  const html = renderSlip(samplePayload);

  return (
    <section className="manager-workspace" style={{ marginTop: 18 }}>
      <div className="workspace-head">
        <div>
          <h2>Receipt Preview</h2>
          <p>Select the slip template, preview it, then save it.</p>
        </div>

        <button
          className="scan-btn"
          onClick={() => onSave({ ...(settings || {}), slip_template: template })}
        >
          Save Slip Template
        </button>
      </div>

      <label>
        Slip Template
        <select
          className="scan-input"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        >
          {SLIP_TEMPLATE_OPTIONS.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </select>
      </label>

      <div className="receipt-preview-card" style={{ marginTop: 14 }}>
        <iframe
          title="Receipt Preview"
          srcDoc={html}
          style={{
            width: "100%",
            minHeight: 520,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fff",
          }}
        />
      </div>
    </section>
  );
}

function GenericPosSettingsTab({
  title,
  description,
  saveLabel,
  settings = {},
  onSave,
  cards = [],
}) {
  const [form, setForm] = useState(settings || {});
  const [activeCard, setActiveCard] = useState(null);

  useEffect(() => {
    setForm(settings || {});
  }, [settings]);

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const active = cards.find((x) => x.key === activeCard);

  return (
    <section className="manager-workspace" style={{ marginTop: 18 }}>
      <div className="workspace-head">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>

        <button className="scan-btn" onClick={() => onSave(form)}>
          {saveLabel}
        </button>
      </div>

      <section className="manager-grid">
        {cards.map((card) => (
          <ManagerCard
            key={card.key}
            icon={card.icon}
            title={card.title}
            value={card.displayValue || form?.[card.key] || card.value || "Not Set"}
            text={card.text}
            onClick={() => setActiveCard(card.key)}
          />
        ))}
      </section>

      {active && (
        <div className="scan-card" style={{ marginTop: 16 }}>
          <h3>{active.title}</h3>
          <p>{active.text}</p>

          {active.type === "select" && (
            <select
              className="scan-input"
              value={form?.[active.key] ?? active.defaultValue ?? ""}
              onChange={(e) => update(active.key, e.target.value)}
            >
              {(active.options || []).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          {active.type === "number" && (
            <input
              className="scan-input"
              type="number"
              value={form?.[active.key] ?? active.defaultValue ?? ""}
              onChange={(e) => update(active.key, e.target.value)}
            />
          )}

          {active.type === "text" && (
            <input
              className="scan-input"
              value={form?.[active.key] ?? active.defaultValue ?? ""}
              onChange={(e) => update(active.key, e.target.value)}
            />
          )}
        </div>
      )}
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

function TablesTab({
  tables = [],
  sections = [],
  onRefresh,
}) {
  const totalTables = tables.length;

  const available = tables.filter((t) =>
    String(t.status || "").toLowerCase() === "available"
  ).length;

  const occupied = tables.filter((t) =>
    String(t.status || "").toLowerCase() === "occupied"
  ).length;

  const billRequested = tables.filter((t) =>
    String(t.status || "").toLowerCase() === "bill_requested"
  ).length;

  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Table Management</h2>
          <p>Manage table status, waiter assignments, reservations and open balances.</p>
        </div>

        <div className="workspace-actions">
          <button className="soft" onClick={onRefresh}>
            ↻ Refresh
          </button>

          <button className="scan-btn">
            + New Table
          </button>
        </div>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="🪑" title="Total Tables" value={totalTables} text="Configured restaurant tables." />
        <ManagerCard icon="🟢" title="Available" value={available} text="Tables ready for customers." />
        <ManagerCard icon="🔴" title="Occupied" value={occupied} text="Tables with active orders." />
        <ManagerCard icon="🧾" title="Bill Requested" value={billRequested} text="Customers waiting for bill." />
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
            {!tables.length ? (
              <tr>
                <td colSpan="6" style={{ textAlign: "center" }}>
                  No tables configured yet
                </td>
              </tr>
            ) : (
              tables.map((t, idx) => (
                <tr key={t.id || idx}>
                  <td>{t.section_name || t.section || "Main Floor"}</td>
                  <td>{t.table_name || t.name || `Table ${idx + 1}`}</td>
                  <td>{t.capacity || "-"}</td>
                  <td>{t.status || "available"}</td>
                  <td>{t.waiter_name || t.assigned_waiter || "Unassigned"}</td>
                  <td>{money(t.open_balance || 0)}</td>
                </tr>
              ))
            )}
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

function InventoryTab({
  isRestaurantLike,
  inventoryItems = [],
  onRefresh,
}) {
  const lowStock = inventoryItems.filter((x) =>
    Number(x.qty_on_hand || x.quantity_on_hand || 0) <= Number(x.reorder_level || 0)
  ).length;

  const negativeStock = inventoryItems.filter((x) =>
    Number(x.qty_on_hand || x.quantity_on_hand || 0) < 0
  ).length;

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

        <button className="scan-btn" onClick={onRefresh}>
          Refresh Stock
        </button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="📦" title="Stock Items" value={inventoryItems.length} text="Inventory items available for POS." />
        <ManagerCard icon="⚠️" title="Low Stock" value={lowStock} text="Items below reorder level." />
        <ManagerCard icon="📉" title="Negative Stock" value={negativeStock} text="Items sold below available quantity." />
        <ManagerCard icon="🔄" title="Recent Movements" value="View" text="Stock movements from POS sales and adjustments." />
      </section>

      <div className="report-table-wrap" style={{ marginTop: 16 }}>
        <table className="report-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>SKU</th>
              <th>Barcode</th>
              <th>Category</th>
              <th>Qty On Hand</th>
              <th>Reorder Level</th>
              <th>Unit Price</th>
            </tr>
          </thead>

          <tbody>
            {!inventoryItems.length ? (
              <tr>
                <td colSpan="7" style={{ textAlign: "center" }}>
                  No inventory items found
                </td>
              </tr>
            ) : (
              inventoryItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.name || item.item_name || "-"}</td>
                  <td>{item.sku || "-"}</td>
                  <td>{item.barcode || "-"}</td>
                  <td>{item.category || "-"}</td>
                  <td>{item.qty_on_hand ?? item.quantity_on_hand ?? 0}</td>
                  <td>{item.reorder_level ?? 0}</td>
                  <td>{money(item.unit_price || item.selling_price || 0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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

function PurchasingTab({
  purchasingSummary = {},
  onRefresh,
}) {
  return (
    <section className="manager-workspace">
      <div className="workspace-head">
        <div>
          <h2>Purchasing</h2>
          <p>Manage suppliers, purchase orders, goods received and outstanding deliveries.</p>
        </div>

        <button className="scan-btn" onClick={onRefresh}>
          Refresh Purchasing
        </button>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="🏢" title="Suppliers" value={purchasingSummary.suppliers || 0} text="Suppliers linked to restaurant purchasing." />
        <ManagerCard icon="🧾" title="Purchase Orders" value={purchasingSummary.purchase_orders || 0} text="Open purchase orders for ingredients and supplies." />
        <ManagerCard icon="📥" title="Goods Received" value={purchasingSummary.goods_received || 0} text="Received supplier deliveries." />
        <ManagerCard icon="🚚" title="Outstanding Deliveries" value={purchasingSummary.outstanding_deliveries || 0} text="Orders not yet received." />
        <ManagerCard icon="💰" title="Purchase Value" value={money(purchasingSummary.purchase_value || 0)} text="Total purchases for selected period." />
        <ManagerCard icon="⚠️" title="Price Variances" value={purchasingSummary.price_variances || 0} text="Ingredient price changes needing review." />
      </section>

      <div className="empty-state" style={{ marginTop: 16 }}>
        <strong>Purchasing detail list</strong>
        <p>Add list routes later for suppliers, purchase orders and goods received.</p>
      </div>
    </section>
  );
}

function TableSettingsTab({
  tables = [],
  sections = [],
  staffMembers = [],
  onOpenModal,
  onRefresh,
}) {
  const totalTables = tables.length;

  const available = tables.filter(
    (t) => String(t.status).toLowerCase() === "available"
  ).length;

  const occupied = tables.filter(
    (t) => String(t.status).toLowerCase() === "occupied"
  ).length;

  const reserved = tables.filter(
    (t) => String(t.status).toLowerCase() === "reserved"
  ).length;

  const sectionNames =
    sections.length
      ? sections.map((s) => s.section_name || s.name || s.section || "Main Floor")
      : [...new Set(tables.map((t) => t.section || "Main Floor"))];

  const totalCapacity = tables.reduce(
    (s, t) => s + Number(t.capacity || 0),
    0
  );

  return (
    <section className="manager-workspace" style={{ marginTop: 18 }}>
      <div className="workspace-head">
        <div>
          <h2>Table Settings</h2>
          <p>Configure restaurant tables, sections, capacity and table workflow.</p>
        </div>

        <div className="workspace-actions">
          <button
            className="soft"
            onClick={() =>
              onOpenModal({
                type: "new_table_section",
                title: "New Table Section",
                fields: [
                  { key: "section_name", label: "Section Name", value: "Main Floor" },
                ],
              })
            }
          >
            New Section
          </button>

          <button
            className="scan-btn"
            onClick={() =>
              onOpenModal({
                type: "new_table",
                title: "New Table",
                fields: [
                  { key: "section", label: "Section", value: sectionNames[0] || "Main Floor" },
                  { key: "table_name", label: "Table Name", value: "" },
                  { key: "capacity", label: "Capacity", value: "4" },
                  { key: "status", label: "Status", value: "available" },
                ],
              })
            }
          >
            New Table
          </button>
        </div>
      </div>

      <section className="manager-grid">
        <ManagerCard icon="🪑" title="Total Tables" value={totalTables} text="Configured restaurant tables." />
        <ManagerCard icon="🟢" title="Available" value={available} text="Tables ready for customers." />
        <ManagerCard icon="🔴" title="Occupied" value={occupied} text="Tables currently in use." />
        <ManagerCard icon="📅" title="Reserved" value={reserved} text="Tables reserved for customers." />
        <ManagerCard icon="🏠" title="Sections" value={sectionNames.length} text={sectionNames.join(", ") || "No sections configured."} />
        <ManagerCard icon="👥" title="Total Capacity" value={totalCapacity} text="Total seating capacity." />
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
                  <td>{t.section || t.section_name || "Main Floor"}</td>
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

