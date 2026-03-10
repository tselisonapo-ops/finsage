import type { apiFetch as ApiFetch } from "./api/apiFetch";

declare global {
  interface Window {
    apiFetch?: typeof ApiFetch;
  }
}

export {};
