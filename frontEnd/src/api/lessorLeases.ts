import { apiFetch } from "./apiFetch";

export type LessorClassification =
  | "operating"
  | "finance";

export type LessorLeasePayload = {
  contract_no?: string | null;
  contract_name: string;
  customer_id: number | null;
  asset_id?: number | null;

  start_date: string;
  end_date?: string | null;
  lease_term_months?: number;

  underlying_asset_description?: string | null;
  underlying_asset_account_code?: string | null;

  underlying_asset_carrying_amount?: number;
  underlying_asset_fair_value?: number;
  economic_life_months?: number;
  
  guaranteed_residual_value?: number;
  unguaranteed_residual_value?: number;
  initial_direct_costs?: number;

  interest_rate_implicit?: number;

  ownership_transfers?: boolean;
  purchase_option_reasonably_certain?: boolean;
  specialised_asset?: boolean;

  classification_override?: boolean;
  classification_override_reason?: string | null;

  manufacturer_dealer_lessor?: boolean;
  billing_amount: number;
  billing_basis: "gross" | "net";
  vat_rate: number;

  billing_frequency:
    | "weekly"
    | "monthly"
    | "quarterly"
    | "annually";

  billing_timing: "arrears" | "advance";
  bill_day_of_month?: number | null;

  lease_classification: LessorClassification;
  payment_terms_days: number;
  currency?: string | null;

  security_deposit_amount: number;
  security_deposit_account_code?: string | null;

  revenue_account_code?: string | null;
  vat_output_account_code?: string | null;
  ar_account_code?: string | null;
  bank_account_code?: string | null;
  bank_account_id?: number | null;

  finance_income_account_code?: string | null;
  net_investment_current_account_code?: string | null;
  net_investment_noncurrent_account_code?: string | null;

  notes?: string | null;
};

export type LessorLeaseCreateResponse = {
  ok: boolean;
  item: {
    id: number;
    contract_no?: string | null;
    contract_name?: string | null;
    lease_classification?: string | null;
    status?: string | null;
  };
};

export type LessorClassificationResponse = {
  ok: boolean;
  data: Record<string, unknown>;
};

export async function createLessorLease(
  companyId: number,
  payload: LessorLeasePayload
): Promise<LessorLeaseCreateResponse> {
  return apiFetch(
    `/api/companies/${companyId}/lessor-leases`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  ) as Promise<LessorLeaseCreateResponse>;
}

export async function previewLessorClassification(
  companyId: number,
  payload: LessorLeasePayload
): Promise<LessorClassificationResponse> {
  return apiFetch(
    `/api/companies/${companyId}/lessor-leases/classify`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  ) as Promise<LessorClassificationResponse>;
}

export async function generateLessorAccountingSchedule(
  companyId: number,
  leaseId: number
) {
  return apiFetch(
    `/api/companies/${companyId}/lessor-leases/` +
      `${leaseId}/accounting-schedule/generate`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}