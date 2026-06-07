import { posApi } from "../services/posApi.js";
import { addItemToCart } from "./Cart.js";

export function bindBarcodeScanner({ inputSelector, onCartChange, onError }) {
  const input = document.querySelector(inputSelector);
  if (!input) return;

  input.focus();

  input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;

    e.preventDefault();

    const value = input.value.trim();
    if (!value) return;

    try {
      const res = await posApi.getItemByBarcode(value);
      const item = res.item || res.data || res;

      addItemToCart(item, 1);

      input.value = "";
      onCartChange?.();
    } catch (err) {
      try {
        const res = await posApi.searchItems(value, 10);
        onError?.(`Barcode not found. Showing search results for "${value}".`);
        console.log("Search results:", res.items || []);
      } catch {
        onError?.(err.message || "Item not found");
      }
    }
  });
}