import { getCurrency } from "../config.js";

export function money(value, currency = getCurrency()) {
  const n = Number(value || 0);

  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(n);
}

export function number2(value) {
  return Number(value || 0).toFixed(2);
}