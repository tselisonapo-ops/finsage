import { apiFetch } from "./apiFetch";

export type LessorClassification =
  | "operating"
  | "finance";

export type LessorBillingFrequency =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annually";

export type LessorBillingTiming =
  | "arrears"
  | "advance";

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

  billing_frequency: LessorBillingFrequency;
  billing_timing: LessorBillingTiming;
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

  net_investment_current_account_code?:
    string | null;

  net_investment_noncurrent_account_code?:
    string | null;

  notes?: string | null;
};

export type LessorClassificationPayload = Pick<
  LessorLeasePayload,
  | "asset_id"
  | "lease_term_months"
  | "underlying_asset_description"
  | "underlying_asset_account_code"
  | "underlying_asset_carrying_amount"
  | "underlying_asset_fair_value"
  | "economic_life_months"
  | "guaranteed_residual_value"
  | "unguaranteed_residual_value"
  | "initial_direct_costs"
  | "interest_rate_implicit"
  | "ownership_transfers"
  | "purchase_option_reasonably_certain"
  | "specialised_asset"
  | "classification_override"
  | "classification_override_reason"
  | "manufacturer_dealer_lessor"
  | "lease_classification"
>;

export type FinanceLeasePreviewRow = {
  period_no: number;

  opening_net_investment: number;
  lease_payment: number;
  finance_income: number;
  principal_reduction: number;
  closing_net_investment: number;

  current_portion: number;
  noncurrent_portion: number;
};

export type LessorClassificationResult = {
  classification: LessorClassification;

  proposed_classification:
    LessorClassification;

  overridden: boolean;
  override_reason?: string | null;

  lease_term_months: number;
  economic_life_months: number;

  lease_term_ratio: number;
  pv_fair_value_ratio: number;

  present_value_lease_payments: number;
  fair_value: number;

  indicators?: Record<string, boolean>;
  reasons?: string[];
  warnings?: string[];
};

export type FinanceLeaseTermsPreview = {
  classification: "finance";

  period_count: number;
  periodic_payment: number;

  target_net_investment: number;
  gross_investment: number;
  initial_net_investment: number;

  current_net_investment: number;
  noncurrent_net_investment: number;

  current_portion: number;
  noncurrent_portion: number;

  unearned_finance_income: number;
  total_finance_income: number;

  finance_income_next_12_months: number;
  principal_next_12_months: number;

  annual_interest_rate: number;
  periodic_interest_rate: number;

  guaranteed_residual_value: number;
  unguaranteed_residual_value: number;

  schedule: FinanceLeasePreviewRow[];
};

export type OperatingLeasePreviewRow = {
  period_no: number;

  contractual_income: number;
  straight_line_income: number;
  initial_direct_cost_expense: number;

  accrued_rent_movement: number;
  deferred_rent_movement: number;

  accrued_rent_balance: number;
  deferred_rent_balance: number;
};

export type OperatingLeaseTermsPreview = {
  classification: "operating";
  period_count: number;
  message: string;

  periodic_rental: number;
  contractual_income: number;
  straight_line_income: number;
  initial_direct_cost_expense: number;

  closing_accrued_rent: number;
  closing_deferred_rent: number;

  billing_frequency: LessorBillingFrequency;
  billing_timing: LessorBillingTiming;

  schedule: OperatingLeasePreviewRow[];
};

export type LessorTermsPreview =
  | FinanceLeaseTermsPreview
  | OperatingLeaseTermsPreview;

export type LessorTermsPreviewResponse = {
  ok: boolean;
  classification: LessorClassificationResult;
  terms: LessorTermsPreview;
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
  data: LessorClassificationResult;
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
  payload: LessorClassificationPayload
): Promise<LessorClassificationResponse> {
  return apiFetch(
    `/api/companies/${companyId}` +
      `/lessor-leases/classify`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  ) as Promise<LessorClassificationResponse>;
}

export async function previewLessorTerms(
  companyId: number,
  payload: LessorLeasePayload
): Promise<LessorTermsPreviewResponse> {
  return apiFetch(
    `/api/companies/${companyId}` +
      `/lessor-leases/terms/preview`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  ) as Promise<LessorTermsPreviewResponse>;
}

export async function generateLessorAccountingSchedule(
  companyId: number,
  leaseId: number
) {
  return apiFetch(
    `/api/companies/${companyId}` +
      `/lessor-leases/${leaseId}` +
      `/accounting-schedule/generate`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}