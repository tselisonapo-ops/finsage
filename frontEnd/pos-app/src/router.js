import { renderCashierScreen } from "./cashier/CashierScreen.js";
import { renderManagerDashboard } from "./manager/ManagerDashboard.js";
import { renderOrderScreen } from "./cashier/OrderScreen.js";
import { renderQuoteScreen } from "./cashier/QuoteScreen.js";
import { renderReturnScreen } from "./cashier/ReturnScreen.js";
import { renderCustomerScreen } from "./cashier/CustomerScreen.js";
import { renderPriceCheckScreen } from "./cashier/PriceCheckScreen.js";

export function renderRouter() {
  const app = document.querySelector("#app");
  const route = window.location.hash || "#/cashier";

  if (!app) return;

  if (route.startsWith("#/orders")) {
    app.innerHTML = renderOrderScreen();
    return;
  }

  if (route.startsWith("#/quotes")) {
    app.innerHTML = renderQuoteScreen();
    return;
  }

  if (route.startsWith("#/returns")) {
    app.innerHTML = renderReturnScreen();
    return;
  }

  if (route.startsWith("#/customers")) {
    app.innerHTML = renderCustomerScreen();
    return;
  }

  if (route.startsWith("#/price-check")) {
    app.innerHTML = renderPriceCheckScreen();
    return;
  }

  if (route.startsWith("#/manager")) {
    app.innerHTML = renderManagerDashboard();
    return;
  }

  app.innerHTML = renderCashierScreen();
}