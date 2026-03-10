// frontEnd/src/api/leases.ts

export type PaymentFrequency = "monthly" | "quarterly" | "annually";
export type PaymentTiming = "arrears" | "advance";

export interface LeaseWizardPayload {
  lease_name: string;
  role: "lessee";
  wizard_mode?: "inception" | "existing";
  go_live_date?: string | null;

  start_date: string;
  end_date: string;
  payment_amount: number;
  payment_frequency: PaymentFrequency;
  annual_rate: number;
  initial_direct_costs: number;
  residual_value: number;
  vat_rate: number;
  lessor_id?: number | null;
  lease_liability_account: string;
  rou_asset_account: string;
  interest_expense_account?: string | null;
  depreciation_expense_account?: string | null;
  direct_costs_offset_account?: string | null;
  payment_timing?: PaymentTiming; // NEW
}

export interface PvRow {
  period_no: number;
  period_start: string;
  period_end: string;
  discount_factor: number;
  net_payment: number;
  pv_of_payment: number;
  cumulative_pv: number;
  opening_liability: number;
  interest: number;
  principal: number;
  closing_liability: number;
}

export interface ScheduleRow {
  period_no: number;
  period_start: string;
  period_end: string;
  opening_liability: number;
  interest: number;
  payment: number;
  principal: number;
  closing_liability: number;
  depreciation: number;
  vat_portion: number;
  net_payment: number;
}

export interface OpeningJournalLine {
  account_code: string;
  description: string;
  debit: number;
  credit: number;
}

export interface LeasePreviewResponse {
  lease_term_months: number;
  opening_lease_liability: number;
  opening_rou_asset: number;
  schedule: ScheduleRow[];
  pv_table: PvRow[];
  opening_journal: OpeningJournalLine[];
}

export interface LeaseCreateResponse extends LeasePreviewResponse {
  lease_id: number;
  journal_id: number;
  lease_input: {
    lease_name: string;
  };
}

import { apiFetch } from "./apiFetch";
import { getWizardCompanyId } from "../context/company";

export async function previewLease(payload: LeaseWizardPayload) {
  const companyId = getWizardCompanyId();
  return apiFetch(`/api/companies/${companyId}/leases/preview`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<LeasePreviewResponse>;
}

export async function createLease(payload: LeaseWizardPayload) {
  const companyId = getWizardCompanyId();
  return apiFetch(`/api/companies/${companyId}/leases`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<LeaseCreateResponse>;
}






