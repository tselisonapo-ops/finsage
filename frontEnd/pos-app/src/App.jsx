import { useEffect, useState } from "react";

import { CashierPage } from "./cashier/CashierScreen.jsx";
import { OrderScreen } from "./cashier/OrderScreen.jsx";
import { CustomersPage } from "./cashier/CustomerScreen.jsx";
import { PriceCheckPage } from "./cashier/PriceCheckScreen.jsx";
import { QuotesPage } from "./cashier/QuoteScreen.jsx";

import { ManagerPage } from "./pages/ManagerPage.jsx";
import { ReturnsPage } from "./pages/ReturnsPage.jsx";
import { PosSigninPage } from "./pages/PosSigninPage.jsx";

// ✅ Security hardening: tokens are now in memory via posTokenManager.js
// (loaded in index.html before this bundle). No localStorage reads.
function getFsToken() {
  if (typeof window !== "undefined" && typeof window.getFsToken === "function") {
    return window.getFsToken();
  }
  // Legacy fallback during migration
  return sessionStorage.getItem("fs_user_token") || "";
}

function getPosToken() {
  if (typeof window !== "undefined" && typeof window.getPosToken === "function") {
    return window.getPosToken();
  }
  return sessionStorage.getItem("pos_token") || "";
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

      // ✅ Security hardening: store the token in memory only via
      // posTokenManager.js. Do NOT write to localStorage or sessionStorage.
      if (typeof window.setFsToken === "function") {
        window.setFsToken(data.token);
      } else {
        // Legacy fallback during migration
        sessionStorage.setItem("fs_user_token", data.token);
      }

      // Company metadata is NOT sensitive — sessionStorage only
      sessionStorage.setItem("active_company", JSON.stringify(data.company || {}));
      sessionStorage.setItem("pos_company", JSON.stringify(data.company || {}));
      sessionStorage.setItem("active_company_id", String(data.companyId));
      sessionStorage.setItem("pos_company_id", String(data.companyId));
      sessionStorage.setItem("company_id", String(data.companyId));

      if (data.user && typeof data.user === "object") {
        sessionStorage.setItem("fs_user", JSON.stringify(data.user));
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

    // ✅ Try to bootstrap session via HTTP-only refresh cookie
    if (!getFsToken() && typeof window.bootstrapPosSession === "function") {
      window.bootstrapPosSession().then(function (ok) {
        if (ok) {
          setHostContextChecked(true);
        }
      });
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
  const posEmployee = JSON.parse(sessionStorage.getItem("pos_employee") || "null");
  const posToken = getPosToken();

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
