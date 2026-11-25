import { getAuthToken, getPosToken } from "./config.js";

// ✅ Security hardening: tokens are read from in-memory storage
// (via config.js which delegates to posTokenManager.js).
// No localStorage or sessionStorage token reads here.

function buildHeaders(options = {}) {
  const normalToken = getAuthToken();
  const posToken = getPosToken();

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  // POS token must win inside /pos API calls
  if (posToken) {
    headers.Authorization = `Bearer ${posToken}`;
  } else if (normalToken) {
    headers.Authorization = `Bearer ${normalToken}`;
  }

  return headers;
}

// ── Refresh fsToken using HTTP-only cookie ───────────────────
async function refreshFsToken() {
  if (typeof window !== "undefined" && typeof window.refreshFsToken === "function") {
    return window.refreshFsToken();
  }
  throw new Error("No refresh mechanism available");
}

export async function apiFetch(path, options = {}) {
  const headers = buildHeaders(options);

  let res = await fetch(path, {
    ...options,
    headers,
    credentials: "include",
  });

  // ── 401 → refresh fsToken + retry ONCE ────────────────────
  if (res.status === 401 && !options.__retried) {
    try {
      const newToken = await refreshFsToken();
      // Rebuild headers with the new token
      const retryHeaders = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      };
      // POS token still wins if present
      const posToken = getPosToken();
      if (posToken) {
        retryHeaders.Authorization = `Bearer ${posToken}`;
      } else {
        retryHeaders.Authorization = `Bearer ${newToken}`;
      }
      res = await fetch(path, {
        ...options,
        headers: retryHeaders,
        credentials: "include",
        __retried: true,
      });
    } catch {
      throw new Error("Session expired. Please reload the page.");
    }
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.ok === false) {
    const msg = String(data.error || data.detail || "").toLowerCase();

    if (
      res.status === 403 &&
      msg.includes("no access to this company")
    ) {
      // Clear POS token from memory
      if (typeof window !== "undefined" && typeof window.clearPosToken === "function") {
        window.clearPosToken();
      }
      sessionStorage.setItem("pos_auth_required", "1");

      window.dispatchEvent(new Event("pos-auth-required"));
    }

    throw new Error(data.error || data.detail || `Request failed: ${res.status}`);
  }

  return data;
}

export function getJson(path, options = {}) {
  return apiFetch(path, options);
}

export function postJson(path, body = {}, options = {}) {
  return apiFetch(path, {
    ...options,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchJson(path, body = {}, options = {}) {
  return apiFetch(path, {
    ...options,
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
