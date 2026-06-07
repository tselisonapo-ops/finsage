import { posApi } from "./posApi.js";

export const inventoryApi = {
  searchItems(q = "", limit = 20) {
    return posApi.searchItems(q, limit);
  },

  getItemByBarcode(barcode) {
    return posApi.getItemByBarcode(barcode);
  },

  generateBarcode(itemId) {
    return posApi.generateBarcode(itemId);
  },

  queueBarcodeLabel(payload) {
    return posApi.queueBarcodeLabel(payload);
  },
};