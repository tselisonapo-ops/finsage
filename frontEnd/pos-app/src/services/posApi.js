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
};