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

  const [hostContextChecked, setHostContextChecked] = useState(
    Boolean(getFsToken())
  );

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || "#/manager");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    function receivePosContext(event) {
      const allowedOrigins = [
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        window.location.origin,
        "https://finspheresolutions.com",
      ];

      if (!allowedOrigins.includes(event.origin)) return;

      const data = event.data || {};

      if (data.type !== "fs_pos_context") return;
      if (!data.token || !data.companyId) return;

      sessionStorage.setItem("fs_user_token", data.token);
      localStorage.setItem("fs_user_token", data.token);
      localStorage.setItem("authToken", data.token);

      localStorage.setItem(
        "active_company",
        JSON.stringify(data.company || {})
      );

      localStorage.setItem(
        "pos_company",
        JSON.stringify(data.company || {})
      );

      localStorage.setItem(
        "active_company_id",
        String(data.companyId)
      );

      localStorage.setItem(
        "pos_company_id",
        String(data.companyId)
      );

      localStorage.setItem(
        "company_id",
        String(data.companyId)
      );

      if (data.user && typeof data.user === "object") {
        localStorage.setItem("fs_user", JSON.stringify(data.user));
      }

      setHostContextChecked(true);
      setRoute("#/manager");

      if (window.location.hash !== "#/manager") {
        window.location.hash = "#/manager";
      }
    }

    window.addEventListener("message", receivePosContext);

    if (window.opener) {
      window.opener.postMessage(
        { type: "fs_pos_ready" },
        "*"
      );
    }

    const timeout = setTimeout(() => {
      setHostContextChecked(true);
    }, 1500);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener("message", receivePosContext);
    };
  }, []);

  const fsToken = getFsToken();
  const posEmployee = JSON.parse(localStorage.getItem("pos_employee") || "null");
  const posToken = localStorage.getItem("pos_token") || "";

  console.log("[POS AUTH]", {
    host: window.location.origin,
    hash: window.location.hash,
    fsToken,
    sessionToken: sessionStorage.getItem("fs_user_token"),
    localToken: localStorage.getItem("fs_user_token"),
    authToken: localStorage.getItem("authToken"),
    posToken,
    posEmployee,
  });

  if (route.startsWith("#/signin")) return <PosSigninPage />;

  const hasFsAccess = !!fsToken;
  const hasPosAccess = !!posEmployee && !!posToken;

  if (!hostContextChecked && !hasFsAccess && !hasPosAccess) {
    return null;
  }

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