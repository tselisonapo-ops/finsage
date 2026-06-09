import { getAuthToken } from "./config.js";

function getPosToken() {
  return localStorage.getItem("pos_token") || "";
}

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

  console.log("[POS API AUTH]", {
    hasPosToken: !!posToken,
    hasFsToken: !!normalToken,
    authHeader: headers.Authorization || null,
  });

  return headers;
}

export async function apiFetch(path, options = {}) {
  const headers = buildHeaders(options);

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.ok === false) {
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