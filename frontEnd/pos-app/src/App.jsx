import { useEffect, useState } from "react";

import { CashierPage } from "./cashier/CashierScreen.jsx";
import { OrderScreen } from "./cashier/OrderScreen.jsx";
import { CustomersPage } from "./cashier/CustomerScreen.jsx";
import { PriceCheckPage } from "./cashier/PriceCheckScreen.jsx";
import { QuotesPage } from "./cashier/QuoteScreen.jsx";

import { ManagerPage } from "./pages/ManagerPage.jsx";
import { ReturnsPage } from "./pages/ReturnsPage.jsx";
import { PosSigninPage } from "./pages/PosSigninPage.jsx";

export function App() {
  const [route, setRoute] = useState(
    window.location.hash || "#/cashier"
  );

  useEffect(() => {
    const onHashChange = () =>
      setRoute(window.location.hash || "#/cashier");

    window.addEventListener("hashchange", onHashChange);

    return () =>
      window.removeEventListener("hashchange", onHashChange);
  }, []);

    const posEmployee = JSON.parse(
    localStorage.getItem("pos_employee") || "null"
    );

    const posToken = localStorage.getItem("pos_token");

  if (route.startsWith("#/signin")) {
    return <PosSigninPage />;
  }

    if (!posEmployee || !posToken) {
    localStorage.removeItem("pos_employee");
    localStorage.removeItem("pos_company");
    localStorage.removeItem("pos_token");

    window.location.hash = "#/signin";
    return null;
    }

  if (route.startsWith("#/manager")) return <ManagerPage />;
  if (route.startsWith("#/orders")) return <OrderScreen />;
  if (route.startsWith("#/quotes")) return <QuotesPage />;
  if (route.startsWith("#/returns")) return <ReturnsPage />;
  if (route.startsWith("#/customers")) return <CustomersPage />;
  if (route.startsWith("#/price-check")) return <PriceCheckPage />;

  return <CashierPage />;
}