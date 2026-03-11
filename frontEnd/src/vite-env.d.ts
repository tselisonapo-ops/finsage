import { apiFetch } from "./api/apiFetch";

declare global {
  interface Window {
    apiFetch?: typeof apiFetch;
  }
}

if (import.meta.env.DEV) {
  window.apiFetch = apiFetch;
}

