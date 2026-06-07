import { cartState, clearCart } from "./Cart.js";

const HOLD_KEY = "finsage_pos_held_sales";

export function listHeldSales() {
  try {
    return JSON.parse(localStorage.getItem(HOLD_KEY) || "[]");
  } catch {
    return [];
  }
}

export function holdCurrentSale(note = "") {
  if (!cartState.lines.length) {
    throw new Error("Cart is empty. Nothing to hold.");
  }

  const held = listHeldSales();

  const hold = {
    id: `HOLD-${Date.now()}`,
    note,
    customer: cartState.customer,
    shiftId: cartState.shiftId,
    saleId: cartState.saleId,
    lines: structuredClone(cartState.lines),
    payments: structuredClone(cartState.payments || []),
    createdAt: new Date().toISOString(),
  };

  held.unshift(hold);
  localStorage.setItem(HOLD_KEY, JSON.stringify(held));

  clearCart();

  return hold;
}

export function resumeHeldSale(holdId) {
  const held = listHeldSales();
  const hold = held.find((x) => x.id === holdId);

  if (!hold) {
    throw new Error("Held sale not found.");
  }

  cartState.customer = hold.customer || null;
  cartState.shiftId = hold.shiftId || null;
  cartState.saleId = hold.saleId || null;
  cartState.lines = structuredClone(hold.lines || []);
  cartState.payments = structuredClone(hold.payments || []);

  removeHeldSale(holdId);

  return hold;
}

export function removeHeldSale(holdId) {
  const held = listHeldSales().filter((x) => x.id !== holdId);
  localStorage.setItem(HOLD_KEY, JSON.stringify(held));
  return held;
}

export function clearHeldSales() {
  localStorage.removeItem(HOLD_KEY);
}