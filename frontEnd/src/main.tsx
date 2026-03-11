import "./drawer/hostMount"; // ✅ Registers window.FS_MOUNT_FIXED_ASSETS_DRAWER at module load

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
};

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  console.log("📨 Message received in wizard:", event.data);

  const origin = event.origin || "";
  const isDevOrigin = origin.includes("localhost") || origin.includes("127.0.0.1");
  const isNullOriginDev = import.meta.env.DEV && origin === "null";

  // ✅ Allow only your dev hosts (and null origin for dev file:// or sandbox if needed)
  if (!isDevOrigin && !isNullOriginDev) return;

  // ✅ No `any`, keep it safe
  const data = (event.data && typeof event.data === "object")
    ? (event.data as WizardHydrationMessage)
    : ({} as WizardHydrationMessage);

  const { token, companyId, role } = data;

  if (token) {
    localStorage.setItem("fs_user_token", token);
    sessionStorage.setItem("fs_user_token", token);
  }
  if (companyId != null) {
    localStorage.setItem("company_id", String(companyId));
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

