import { apiFetch } from "./apiFetch";

export type CoaAccount = {
  id?: number | string;
  code: string;
  name: string;

  account_number?: string;
  accountNumber?: string;

  role?: string;
  account_role?: string;

  section?: string;
  category?: string;
  type?: string;

  posting?: boolean;
  is_posting?: boolean;
};

type CoaResponse = {
  ok?: boolean;
  rows?: CoaAccount[];
  items?: CoaAccount[];
};

export async function fetchCompanyCoa(
  companyId: number
): Promise<CoaAccount[]> {
  const response = await apiFetch(
    `/api/companies/${companyId}/coa`,
    { method: "GET" }
  ) as CoaResponse;

  const rows = Array.isArray(response)
    ? response
    : response?.rows || response?.items || [];

  return rows
    .map((account) => ({
      ...account,
      code: String(account.code || "")
        .trim()
        .toUpperCase(),
      name: String(account.name || "").trim(),
    }))
    .filter(
      (account) =>
        Boolean(account.code) &&
        Boolean(account.name) &&
        account.posting !== false &&
        account.is_posting !== false
    );
}