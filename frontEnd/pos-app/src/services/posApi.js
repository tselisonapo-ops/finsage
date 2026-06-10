import { getJson, postJson, patchJson } from "../api.js";
import { getCompanyId } from "../config.js";

function base(companyId = getCompanyId()) {
  if (!companyId) throw new Error("No active company selected.");
  return `/api/companies/${companyId}/pos`;
}

function posHeaders() {
  const token = localStorage.getItem("pos_token");

  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}

export const posApi = {
    searchItems(q = "", limit = 20) {
        return getJson(`${base()}/items/search?q=${encodeURIComponent(q)}&limit=${limit}`);
    },

    getItemByBarcode(barcode) {
        return getJson(`${base()}/items/barcode/${encodeURIComponent(barcode)}`);
    },

    listTerminals() {
        return getJson(`${base()}/terminals`);
    },

    createTerminal(payload) {
        return postJson(`${base()}/terminals`, payload);
    },

    updateTerminal(id, payload) {
        return patchJson(`${base()}/terminals/${id}`, payload);
    },

    openShift(payload) {
        return postJson(`${base()}/shifts/open`, payload);
    },

    listShifts(status = "") {
        return getJson(`${base()}/shifts?status=${encodeURIComponent(status)}`);
    },

    closeShift(shiftId, payload) {
        return postJson(`${base()}/shifts/${shiftId}/close`, payload);
    },

    createSale(payload) {
        return postJson(`${base()}/sales`, payload);
    },

    addSaleLine(saleId, payload) {
        return postJson(`${base()}/sales/${saleId}/lines`, payload);
    },

    recordPayment(saleId, payload) {
        return postJson(`${base()}/sales/${saleId}/payments`, payload);
    },

    completeSale(saleId, payload = {}) {
        return postJson(`${base()}/sales/${saleId}/complete`, payload);
    },

    createQuote(payload) {
        return postJson(`${base()}/quotes`, payload);
    },

    createReturn(payload) {
        return postJson(`${base()}/returns`, payload);
    },

    listCustomers(q = "") {
        return getJson(`${base()}/customers?q=${encodeURIComponent(q)}`);
    },

    createCustomer(payload) {
        return postJson(`${base()}/customers`, payload);
    },

    listPriceLevels() {
    return getJson(`${base()}/price-levels`);
    },

    generateBarcode(itemId) {
    return postJson(`${base()}/barcodes/generate`, { item_id: itemId });
    },

    queueBarcodeLabel(payload) {
    return postJson(`${base()}/barcodes/labels`, payload);
    },

    createPriceLevel(payload) {
    return postJson(`${base()}/price-levels`, payload);
    },

    createPromotion(payload) {
    return postJson(`${base()}/promotions`, payload);
    },

    listPromotions(activeOnly = true) {
    return getJson(`${base()}/promotions?active_only=${activeOnly ? "1" : "0"}`);
    },

    listRecipes() {
        return getJson(`${base()}/recipes`);
    },

    createRecipe(payload) {
        return postJson(`${base()}/recipes`, payload);
    },

    getRecipeByItem(itemId) {
        return getJson(`${base()}/recipes/item/${itemId}`);
    },

    listCostPools() {
        return getJson(`${base()}/cost-pools`);
    },

    createCostPool(payload) {
        return postJson(`${base()}/cost-pools`, payload);
    },

    listMenuCostAllocations(itemId = null) {
        const qs = itemId ? `?item_id=${encodeURIComponent(itemId)}` : "";
        return getJson(`${base()}/menu-cost-allocations${qs}`);
    },

    createMenuCostAllocation(payload) {
        return postJson(`${base()}/menu-cost-allocations`, payload);
    },

    cashierSignin(payload) {
    return postJson(`${base()}/auth/signin`, payload);
    },

    getReceiptSettings() {
    return getJson(`${base()}/receipt-settings`);
    },

    saveReceiptSettings(payload) {
    return postJson(`${base()}/receipt-settings`, payload);
    },

    updateReceiptSettings(payload) {
    return patchJson(`${base()}/receipt-settings`, payload);
    },

    listTableSections(activeOnly = true) {
    return getJson(`${base()}/table-sections?active_only=${activeOnly ? "1" : "0"}`);
    },

    createTableSection(payload) {
    return postJson(`${base()}/table-sections`, payload);
    },

    updateTableSection(sectionId, payload) {
    return patchJson(`${base()}/table-sections/${sectionId}`, payload);
    },

    listTables(activeOnly = true) {
    return getJson(`${base()}/tables?active_only=${activeOnly ? "1" : "0"}`);
    },

    createTable(payload) {
    return postJson(`${base()}/tables`, payload);
    },

    updateTable(tableId, payload) {
    return patchJson(`${base()}/tables/${tableId}`, payload);
    },

    deleteTable(tableId) {
    return postJson(`${base()}/tables/${tableId}/delete`, {});
    },

    // =========================
    // RECIPES / MENU BOM
    // =========================

    listRecipes() {
    return getJson(`${base()}/recipes`);
    },

    getRecipe(recipeId) {
    return getJson(`${base()}/recipes/${recipeId}`);
    },

    createRecipe(payload) {
    return postJson(`${base()}/recipes`, payload);
    },

    updateRecipe(recipeId, payload) {
    return patchJson(`${base()}/recipes/${recipeId}`, payload);
    },

    deactivateRecipe(recipeId) {
    return patchJson(`${base()}/recipes/${recipeId}`, {
        is_active: false,
    });
    },

    // =========================
    // MEAL COSTING
    // =========================

    listCostPools() {
    return getJson(`${base()}/cost-pools`);
    },

    getCostPool(poolId) {
    return getJson(`${base()}/cost-pools/${poolId}`);
    },

    createCostPool(payload) {
    return postJson(`${base()}/cost-pools`, payload);
    },

    updateCostPool(poolId, payload) {
    return patchJson(`${base()}/cost-pools/${poolId}`, payload);
    },

    deactivateCostPool(poolId) {
    return patchJson(`${base()}/cost-pools/${poolId}`, {
        is_active: false,
    });
    },

    // =========================
    // INVENTORY
    // =========================

    listInventoryItems(q = "") {
    return getJson(`${base()}/items/search?q=${encodeURIComponent(q)}&limit=100`);
    },

    getInventoryItemByBarcode(barcode) {
    return getJson(`${base()}/items/barcode/${encodeURIComponent(barcode)}`);
    },

    // =========================
    // PURCHASING SUMMARY
    // =========================

    getPurchasingSummary() {
    return getJson(`${base()}/purchasing/summary`);
    },

    // =========================
    // STAFF
    // =========================

    listStaffMembers() {
    return getJson(`${base()}/staff`);
    },

    createStaffMember(payload) {
    return postJson(`${base()}/staff`, payload);
    },

    updateStaffMember(staffId, payload) {
    return patchJson(`${base()}/staff/${staffId}`, payload);
    },

    deactivateStaffMember(staffId) {
    return patchJson(`${base()}/staff/${staffId}`, {
        is_active: false,
    });
    },

    // =========================
    // ORDERS
    // =========================

    listOrders(status = "", orderType = "") {
    return getJson(
        `${base()}/orders?status=${encodeURIComponent(status)}&order_type=${encodeURIComponent(orderType)}&limit=100`
    );
    },

    getOrder(orderId) {
    return getJson(`${base()}/orders/${orderId}`);
    },

    updateOrderStatus(orderId, payload) {
    return postJson(`${base()}/orders/${orderId}/status`, payload);
    },

    // =========================
    // BARCODE LABELS
    // =========================

    listBarcodeLabels() {
    return getJson(`${base()}/barcodes/labels`);
    },

    listMenuItems() {
    return getJson(`${base()}/menu-items`);
    },

    createMenuItem(payload) {
    return postJson(`${base()}/menu-items`, payload);
    },

    updateMenuItem(itemId, payload) {
    return patchJson(`${base()}/menu-items/${itemId}`, payload);
    },

    deactivateMenuItem(itemId) {
    return patchJson(`${base()}/menu-items/${itemId}`, {
        is_active: false,
    });
    },

    posMe() {
    return getJson(`${base()}/auth/me`);
    },
};