import "./drawer/hostMount";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./app";
import { apiFetch } from "./api/apiFetch";
import { setToken } from "./api/authHeader";

declare global {
  interface Window {
    apiFetch?: (url: string, opts?: RequestInit) => Promise<unknown>;
  }
}

if (import.meta.env.DEV) {
  window.apiFetch = apiFetch;
}

export type LeaseWizardContext = {
  mode?: "inception" | "existing";
  leaseRole?: "lessee" | "lessor";
  accountCode?: string;
  accountName?: string;
};

type WizardHydrationMessage = {
  token?: string;
  companyId?: number | string;
  role?: string;
  type?: string;
  ctx?: LeaseWizardContext;
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

  // ✅ Security hardening: store the access token in memory only
  // (via authHeader.ts setToken). Do NOT write to localStorage or
  // sessionStorage. The refresh token is managed by the parent
  // dashboard's token_manager.js via an HTTP-only cookie.
  if (token) {
    setToken(token);
  }

  // company_id is not sensitive — it is safe to keep in sessionStorage
  // for the wizard's lifetime. We use sessionStorage (not localStorage)
  // so it is cleared when the wizard tab closes.
  if (companyId != null) {
    sessionStorage.setItem("company_id", String(companyId));
    sessionStorage.setItem("active_company_id", String(companyId));
  }

  // role is not sensitive metadata
  if (role) {
    sessionStorage.setItem("userRole", role);
  }

  if (data.ctx) {
    sessionStorage.setItem(
      "lease_wizard_context",
      JSON.stringify(data.ctx)
    );

    window.dispatchEvent(
      new CustomEvent("lease-wizard-context", {
        detail: {
          ...data.ctx,
          companyId:
            companyId != null
              ? Number(companyId)
              : undefined,
        },
      })
    );
  }
});

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("React mount failed: missing <div id='root'></div>");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
