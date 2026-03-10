// frontEnd/src/api/authHeader.ts

export type AuthHeader = Record<string, string>;

const TOKEN_KEY = "fs_user_token";

export function getToken(): string {
  return (
    sessionStorage.getItem(TOKEN_KEY) ||
    localStorage.getItem(TOKEN_KEY) ||
    ""
  );
}

export function AUTH_HEADER(): AuthHeader {
  const token = getToken();
  if (!token) throw new Error("No auth token found (fs_user_token missing). Please log in again.");
  return { Authorization: `Bearer ${token}` };
}

