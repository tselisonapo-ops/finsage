import { useEffect, useState } from "react";

import { CashierPage } from "./cashier/CashierScreen.jsx";
import { OrderScreen } from "./cashier/OrderScreen.jsx";
import { CustomersPage } from "./cashier/CustomerScreen.jsx";
import { PriceCheckPage } from "./cashier/PriceCheckScreen.jsx";
import { QuotesPage } from "./cashier/QuoteScreen.jsx";

import { ManagerPage } from "./pages/ManagerPage.jsx";
import { ReturnsPage } from "./pages/ReturnsPage.jsx";
import { PosSigninPage } from "./pages/PosSigninPage.jsx";

function getFsToken() {
  return (
    sessionStorage.getItem("fs_user_token") ||
    localStorage.getItem("fs_user_token") ||
    ""
  );
}

export function App() {
  const [route, setRoute] = useState(window.location.hash || "#/manager");

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || "#/manager");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const fsToken = getFsToken();
  const posEmployee = JSON.parse(localStorage.getItem("pos_employee") || "null");
  const posToken = localStorage.getItem("pos_token") || "";

  if (route.startsWith("#/signin")) return <PosSigninPage />;

  const hasFsAccess = !!fsToken;
  const hasPosAccess = !!posEmployee && !!posToken;

  if (!hasFsAccess && !hasPosAccess) {
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