// frontEnd/src/api/authHeader.ts
//
// ✅ Security hardening: the access token is no longer stored in
// localStorage or sessionStorage. It lives in an in-memory module
// variable that is set when the parent window sends a token via
// postMessage, or when /api/auth/refresh returns a new one.
// The refresh token lives in an HTTP-only cookie that JavaScript
// cannot read.
//
// This module is the single source of truth for the access token
// inside the React wizard app. External code (dashboard.html's
// token_manager.js) can also call window.__setWizardToken(token)
// to inject a token.

export type AuthHeader = Record<string, string>;

// ── In-memory token storage (NEVER persisted to localStorage) ──
let _accessToken = "";

/**
 * Set the access token in memory. Called by:
 *  - the postMessage handler in main.tsx / app.tsx
 *  - the refresh-on-401 logic in apiFetch.ts
 *  - window.__setWizardToken (exposed for the parent dashboard)
 */
export function setToken(token: string): void {
  _accessToken = typeof token === "string" ? token : "";
}

/**
 * Clear the in-memory access token (e.g. on error / sign-out).
 */
export function clearToken(): void {
  _accessToken = "";
}

/**
 * Get the current access token from memory.
 * Falls back to checking window.getToken() if token_manager.js
 * (from the parent dashboard) has injected a global getter.
 */
export function getToken(): string {
  // 1. In-memory token (primary source)
  if (_accessToken) return _accessToken;

  // 2. If the parent page's token_manager.js has set a global
  //    getToken, use it (the wizard runs inside an iframe).
  if (typeof window !== "undefined" && typeof (window as any).getToken === "function") {
    const parentToken = (window as any).getToken();
    if (parentToken) return parentToken;
  }

  // 3. Legacy fallback — ONLY for the migration period.
  //    This will be removed once all parent apps stop writing
  //    to localStorage. It reads sessionStorage (not localStorage)
  //    to minimise exposure.
  const TOKEN_KEY = "fs_user_token";
  return (
    sessionStorage.getItem(TOKEN_KEY) ||
    ""
  );
}

export function AUTH_HEADER(): AuthHeader {
  const token = getToken();
  if (!token) {
    throw new Error(
      "No auth token available. The session may have expired — please reload the parent page."
    );
  }
  return { Authorization: `Bearer ${token}` };
}

// ── Expose a global setter so the parent dashboard's
//    token_manager.js can push a fresh token into the wizard
//    iframe without postMessage round-trips. ──────────────────
if (typeof window !== "undefined") {
  (window as any).__setWizardToken = setToken;
  (window as any).__clearWizardToken = clearToken;
}
