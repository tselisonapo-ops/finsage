
// frontEnd/src/api/apiFetch.ts

import { AUTH_HEADER, setToken } from "./authHeader";

const IS_LOCAL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

const BASE_URL = IS_LOCAL
  ? "http://localhost:5000"
  : window.location.origin;

// ── Shared refresh request ────────────────────────────────────

let refreshPromise: Promise<string> | null = null;

async function performTokenRefresh(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new Error("Unable to refresh token");
  }

  const data: unknown = await res.json();

  if (
    typeof data !== "object" ||
    data === null ||
    !("token" in data) ||
    typeof data.token !== "string" ||
    !data.token
  ) {
    throw new Error("Refresh response did not contain a valid token");
  }

  setToken(data.token);

  return data.token;
}

async function refreshToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = performTokenRefresh().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

// ── Automatic token refresh ───────────────────────────────────

let autoRefreshStarted = false;

const AUTO_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

function startAutoRefresh(): void {
  if (autoRefreshStarted) return;

  autoRefreshStarted = true;

  window.setInterval(async () => {
    try {
      await refreshToken();
    } catch (error: unknown) {
      console.warn("[apiFetch] Automatic token refresh failed:", error);
    }
  }, AUTO_REFRESH_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshToken().catch(() => {
        // A failed background refresh is handled by the next API request.
      });
    }
  });
}

// ── Error message extraction ──────────────────────────────────

function getErrorMessage(data: unknown, status: number): string {
  if (typeof data === "string" && data) {
    return data;
  }

  if (typeof data === "object" && data !== null) {
    if ("error" in data && typeof data.error === "string") {
      return data.error;
    }

    if ("message" in data && typeof data.message === "string") {
      return data.message;
    }

    if ("detail" in data && typeof data.detail === "string") {
      return data.detail;
    }
  }

  return `HTTP ${status}`;
}

// ── Main API fetch ────────────────────────────────────────────

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  startAutoRefresh();

  const url = path.startsWith("http")
    ? path
    : `${BASE_URL}${path}`;

  const headers = new Headers(options.headers);

  if (
    typeof options.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const sendRequest = async (): Promise<Response> => {
    const requestHeaders = new Headers(headers);

    const auth = AUTH_HEADER();

    Object.entries(auth).forEach(([key, value]) => {
      requestHeaders.set(key, value);
    });

    return fetch(url, {
      ...options,
      headers: requestHeaders,
      credentials: "include",
    });
  };

  let res = await sendRequest();

  // ── 401: refresh and retry once ─────────────────────────────

  if (res.status === 401) {
    try {
      await refreshToken();
      res = await sendRequest();
    } catch {
      throw new Error(
        "Session expired. Your refresh cookie is invalid or missing. Please sign in again."
      );
    }
  }

  // ── Parse response ──────────────────────────────────────────

  const contentType = res.headers.get("Content-Type") || "";

  const data: unknown = contentType.includes("application/json")
    ? await res.json().catch((): unknown => ({}))
    : await res.text().catch(() => "");

  if (!res.ok) {
    const error = new Error(
      getErrorMessage(data, res.status)
    );

    Object.assign(error, {
      status: res.status,
      data,
    });

    throw error;
  }

  return data;
}
