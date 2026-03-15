import "./drawer/hostMount";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./app";
import { apiFetch } from "./api/apiFetch";

declare global {
  interface Window {
    apiFetch?: (url: string, opts?: RequestInit) => Promise<unknown>;
  }
}

if (import.meta.env.DEV) {
  window.apiFetch = apiFetch;
}

type WizardHydrationMessage = {
  token?: string;
  companyId?: number | string;
  role?: string;
  type?: string;
};

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  console.log("📨 Message received in wizard:", event.data);

  const origin = event.origin || "";
  const isDevOrigin =
    origin.includes("localhost") || origin.includes("127.0.0.1");
  const isNullOriginDev = import.meta.env.DEV && origin === "null";
  const isProdOrigin = origin === "https://finspheresolutions.com";

  if (!isDevOrigin && !isNullOriginDev && !isProdOrigin) return;

  const data =
    event.data && typeof event.data === "object"
      ? (event.data as WizardHydrationMessage)
      : ({} as WizardHydrationMessage);

  const { token, companyId, role, type } = data;

  if (type && type !== "lease_wizard_context") return;

  if (token) {
    localStorage.setItem("fs_user_token", token);
    sessionStorage.setItem("fs_user_token", token);
    localStorage.setItem("auth_token", token);
    sessionStorage.setItem("auth_token", token);
  }

  if (companyId != null) {
    localStorage.setItem("company_id", String(companyId));
    localStorage.setItem("active_company_id", String(companyId));
    sessionStorage.setItem("active_company_id", String(companyId));
  }

  if (role) {
    localStorage.setItem("userRole", role);
  }
});

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("React mount failed: missing <div id='root'></div>");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
