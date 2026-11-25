import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
// ✅ Security hardening: load posTokenManager before the app.
// This provides window.getFsToken / setFsToken / getPosToken /
// setPosToken / bootstrapPosSession / refreshFsToken.
import "./posTokenManager.js";
import { App } from "./App.jsx";

// Try to bootstrap the session on first load (recover fsToken
// from the HTTP-only refresh cookie).
if (typeof window.bootstrapPosSession === "function") {
  window.bootstrapPosSession().catch(() => {});
}

createRoot(document.getElementById("app")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);