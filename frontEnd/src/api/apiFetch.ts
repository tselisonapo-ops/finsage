import { AUTH_HEADER } from "./authHeader";

const BASE_URL = "http://localhost:5000";

async function refreshToken(): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include", // send refresh cookie
  });
  if (!res.ok) throw new Error("Unable to refresh token");
  const data = await res.json();
  const newToken = data.accessToken;
  localStorage.setItem("fs_user_token", newToken);
  return newToken;
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const headers = new Headers(options.headers);

  if (typeof options.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // attach token using AUTH_HEADER
  const auth = AUTH_HEADER();
  Object.entries(auth).forEach(([k, v]) => headers.set(k, v));

  let res = await fetch(url, { ...options, headers });

  // if expired, try refresh
  if (res.status === 401) {
    try {
      const newToken = await refreshToken();
      headers.set("Authorization", `Bearer ${newToken}`);
      res = await fetch(url, { ...options, headers });
    } catch {
      throw new Error("Session expired. Please log in again.");
    }
  }

  const ct = res.headers.get("Content-Type") || "";
  const isJson = ct.includes("application/json");
  const data = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");

  if (!res.ok) {
    const msg =
      (typeof data === "object" && data && (data.error || data.message || data.detail)) ||
      (typeof data === "string" && data) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}
