import { getAuthToken } from "./config.js";

export async function apiFetch(path, options = {}) {
  const token = getAuthToken();

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

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

export function getJson(path) {
  return apiFetch(path);
}

export function postJson(path, body = {}) {
  return apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchJson(path, body = {}) {
  return apiFetch(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}