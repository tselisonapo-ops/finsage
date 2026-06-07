import { formatDate, formatDateTime } from "./dates.js";
import { money } from "./currency.js";

export function formatCurrency(value) {
  return money(Number(value || 0));
}

export function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

export function formatQuantity(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

export function formatNumber(value, decimals = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatBarcode(barcode) {
  return barcode || "-";
}

export function formatPhone(phone) {
  return phone || "-";
}

export function formatEmail(email) {
  return email || "-";
}

export function formatCustomer(customer) {
  if (!customer) return "Walk-in Customer";

  return (
    customer.customer_name ||
    customer.name ||
    customer.full_name ||
    "Walk-in Customer"
  );
}

export function formatCustomerType(type) {
  const map = {
    retail: "Retail",
    wholesale: "Wholesale",
    account: "Account",
    vip: "VIP",
    staff: "Staff",
  };

  return map[type] || type || "-";
}

export function formatStatus(status) {
  if (!status) return "-";

  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function formatOrderType(type) {
  const map = {
    table: "Table Service",
    takeaway: "Takeaway",
    collection: "Collection",
    delivery: "Delivery",
  };

  return map[type] || type || "-";
}

export function formatPaymentMethod(method) {
  const map = {
    cash: "Cash",
    card: "Card",
    eft: "EFT",
    mobile_money: "Mobile Money",
    account: "Account",
    mixed: "Mixed",
  };

  return map[method] || method || "-";
}

export function formatInvoiceNo(invoiceNo) {
  return invoiceNo || "-";
}

export function formatSaleNo(saleNo) {
  return saleNo || "-";
}

export function formatDateOnly(value) {
  return formatDate(value);
}

export function formatDateAndTime(value) {
  return formatDateTime(value);
}

export function formatStock(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function yesNo(value) {
  return value ? "Yes" : "No";
}

export function activeInactive(value) {
  return value ? "Active" : "Inactive";
}