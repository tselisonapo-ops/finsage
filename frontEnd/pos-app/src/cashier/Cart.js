export const cartState = {
  saleId: null,
  shiftId: null,
  customer: null,
  lines: [],
  payments: [],
};

export function addItemToCart(item, qty = 1) {
  const itemId = Number(item.id || item.item_id);

  const existing = cartState.lines.find((x) => Number(x.item_id) === itemId);

  if (existing) {
    existing.qty += qty;
    recalcLine(existing);
    return;
  }

  const line = {
    item_type: "inventory",
    item_id: itemId,
    barcode: item.barcode || "",
    sku: item.sku || "",
    description: item.name || item.description || "Item",
    qty,
    unit_price: Number(item.sales_price || item.unit_price || 0),
    discount_percent: 0,
    discount_amount: 0,
    vat_code: item.vat_code || null,
    vat_amount: 0,
    gross_amount: 0,
    net_amount: 0,
    cost_amount: Number(item.purchase_cost || 0),
    price_source: "normal",
  };

  recalcLine(line);
  cartState.lines.push(line);
}

export function removeCartLine(index) {
  cartState.lines.splice(index, 1);
}

export function clearCart() {
  cartState.saleId = null;
  cartState.customer = null;
  cartState.lines = [];
  cartState.payments = [];
}

export function recalcLine(line) {
  const qty = Number(line.qty || 0);
  const price = Number(line.unit_price || 0);
  const discount = Number(line.discount_amount || 0);

  const subtotal = qty * price;
  const net = Math.max(0, subtotal - discount);

  line.net_amount = Number(net.toFixed(2));
  line.gross_amount = Number((net + Number(line.vat_amount || 0)).toFixed(2));
}

export function getCartTotals() {
  const subtotal = cartState.lines.reduce((s, x) => s + Number(x.qty || 0) * Number(x.unit_price || 0), 0);
  const discount = cartState.lines.reduce((s, x) => s + Number(x.discount_amount || 0), 0);
  const vat = cartState.lines.reduce((s, x) => s + Number(x.vat_amount || 0), 0);
  const gross = cartState.lines.reduce((s, x) => s + Number(x.gross_amount || 0), 0);

  return {
    subtotal,
    discount,
    vat,
    gross,
  };
}