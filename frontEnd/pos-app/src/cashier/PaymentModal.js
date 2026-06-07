import { cartState, getCartTotals } from "./Cart.js";
import { posApi } from "../services/posApi.js";

export async function completeCashPayment({ amountReceived, paymentMethod = "cash" }) {
  if (!cartState.saleId) {
    throw new Error("No active sale has been created.");
  }

  const totals = getCartTotals();
  const received = Number(amountReceived || totals.gross);
  const change = Math.max(0, received - totals.gross);

  await posApi.recordPayment(cartState.saleId, {
    shift_id: cartState.shiftId,
    payment_method: paymentMethod,
    amount: totals.gross,
    received_amount: received,
    change_amount: change,
  });

  const result = await posApi.completeSale(cartState.saleId);

  return {
    ...result,
    change,
  };
}