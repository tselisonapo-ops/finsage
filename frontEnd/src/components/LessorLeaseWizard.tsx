import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import { apiFetch } from "../api/apiFetch";

import {
  createLessorLease,
  generateLessorAccountingSchedule,
  previewLessorClassification,
} from "../api/lessorLeases";

import type {
  LessorClassification,
  LessorLeasePayload,
} from "../api/lessorLeases";

type CustomerRow = {
  id: number;
  name?: string;
  customer_name?: string;
  trading_name?: string;
};

type Props = {
  companyId: number;
  selectedAccountCode?: string;

  defaultCurrentReceivableAccount: string;
  defaultNonCurrentReceivableAccount: string;
  defaultLeaseIncomeAccount: string;
  defaultArAccount: string;
  defaultVatOutputAccount: string;
  defaultFinanceIncomeAccount: string;
};

    type CustomerResponse =
    | CustomerRow[]
    | {
        rows?: CustomerRow[];
        items?: CustomerRow[];
        customers?: CustomerRow[];
        };

    function normaliseRows(
    data: CustomerResponse
    ): CustomerRow[] {

  if (Array.isArray(data)) return data;

  return (
    data?.rows ||
    data?.items ||
    data?.customers ||
    []
  );
}

function customerName(row: CustomerRow) {
  return (
    row.name ||
    row.customer_name ||
    row.trading_name ||
    `Customer ${row.id}`
  );
}

const LessorLeaseWizard: React.FC<Props> = ({
  companyId,
  selectedAccountCode = "",
  defaultCurrentReceivableAccount,
  defaultNonCurrentReceivableAccount,
  defaultLeaseIncomeAccount,
  defaultArAccount,
  defaultVatOutputAccount,
  defaultFinanceIncomeAccount,
}) => {
  const selectedCode = selectedAccountCode
    .trim()
    .toUpperCase();

  const initialClassification:
    LessorClassification =
      selectedCode === "BS_CA_1710" ||
      selectedCode === "BS_NCA_1720"
        ? "finance"
        : "operating";

  const [customers, setCustomers] = useState<
    CustomerRow[]
  >([]);

  const [loadingCustomers, setLoadingCustomers] =
    useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const [preview, setPreview] =
    useState<Record<string, unknown> | null>(null);

  const [createdLeaseId, setCreatedLeaseId] =
    useState<number | null>(null);

    type ScheduleResult = {
    created_or_updated?: number;
    items?: unknown[];
    };

    const [scheduleResult, setScheduleResult] =
    useState<ScheduleResult | null>(null);

  const [form, setForm] =
    useState<LessorLeasePayload>({
      contract_no: "",
      contract_name: "",
      customer_id: null,
      asset_id: null,

      start_date: "",
      end_date: "",

      billing_amount: 0,
      billing_basis: "gross",
      vat_rate: 0,

      billing_frequency: "monthly",
      billing_timing: "arrears",
      bill_day_of_month: null,

      lease_classification:
        initialClassification,

      payment_terms_days: 0,
      currency: "",

      security_deposit_amount: 0,
      security_deposit_account_code: null,

      revenue_account_code:
        defaultLeaseIncomeAccount,

      vat_output_account_code:
        defaultVatOutputAccount,

      ar_account_code: defaultArAccount,

      finance_income_account_code:
        defaultFinanceIncomeAccount,

      net_investment_current_account_code:
        defaultCurrentReceivableAccount,

      net_investment_noncurrent_account_code:
        defaultNonCurrentReceivableAccount,

      notes: "",
    });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      lease_classification:
        selectedCode === "BS_CA_1710" ||
        selectedCode === "BS_NCA_1720"
          ? "finance"
          : current.lease_classification,
    }));
  }, [selectedCode]);

  useEffect(() => {
    let active = true;

    async function loadCustomers() {
      if (!companyId) return;

      try {
        setLoadingCustomers(true);

        const response = await apiFetch(
          `/api/companies/${companyId}/customers` +
            `?active=1&limit=500&offset=0`,
          {
            method: "GET",
          }
        );

        if (!active) return;

        setCustomers(
          normaliseRows(response)
            .map((row: CustomerRow) => ({
              ...row,
              id: Number(row.id),
            }))
            .filter(
              (row: CustomerRow) =>
                Number.isFinite(row.id) &&
                row.id > 0
            )
        );
      } catch (err) {
        if (!active) return;

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load customers"
        );
      } finally {
        if (active) {
          setLoadingCustomers(false);
        }
      }
    }

    loadCustomers();

    return () => {
      active = false;
    };
  }, [companyId]);

  const termMonths = useMemo(() => {
    if (!form.start_date || !form.end_date) {
      return 0;
    }

    const start = new Date(form.start_date);
    const end = new Date(form.end_date);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < start
    ) {
      return 0;
    }

    let months =
      (end.getFullYear() -
        start.getFullYear()) *
        12 +
      end.getMonth() -
      start.getMonth();

    if (end.getDate() > start.getDate()) {
      months += 1;
    }

    return months;
  }, [form.start_date, form.end_date]);

  function updateText(
    event: React.ChangeEvent<
      HTMLInputElement |
      HTMLSelectElement |
      HTMLTextAreaElement
    >
  ) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function updateNumber(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: Number(value || 0),
    }));
  }

  function validate() {
    if (!form.contract_name.trim()) {
      return "Contract name is required.";
    }

    if (!form.customer_id) {
      return "Select the customer or lessee.";
    }

    if (!form.start_date) {
      return "Start date is required.";
    }

    if (!form.billing_amount) {
      return "Billing amount must be greater than zero.";
    }

    if (
      form.end_date &&
      form.end_date < form.start_date
    ) {
      return "End date cannot be before start date.";
    }

    return null;
  }

  async function handlePreview() {
    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setPreview(null);

      const response =
        await previewLessorClassification(
          companyId,
          form
        );

      setPreview(response.data || {});
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Classification preview failed"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await createLessorLease(
        companyId,
        form
      );

      const leaseId = Number(
        response?.item?.id || 0
      );

      if (!leaseId) {
        throw new Error(
          "Lease was created but no lease ID was returned."
        );
      }

      setCreatedLeaseId(leaseId);

      const schedule =
        await generateLessorAccountingSchedule(
          companyId,
          leaseId
        );

      setScheduleResult(schedule);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create lessor lease"
      );
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setPreview(null);
    setCreatedLeaseId(null);
    setScheduleResult(null);
    setError(null);

    setForm((current) => ({
      ...current,
      contract_no: "",
      contract_name: "",
      customer_id: null,
      asset_id: null,
      start_date: "",
      end_date: "",
      billing_amount: 0,
      security_deposit_amount: 0,
      notes: "",
    }));
  }

  if (createdLeaseId) {
    return (
      <div className="lease-wizard">
        <div className="lease-step lease-step-3">
          <h2>Lessor lease created</h2>

          <p>
            The lessor lease was created successfully.
          </p>

          <div className="summary-cards">
            <div className="card">
              <div className="label">
                Lease ID
              </div>

              <div className="value">
                {createdLeaseId}
              </div>
            </div>

            <div className="card">
              <div className="label">
                Classification
              </div>

              <div className="value">
                {form.lease_classification}
              </div>
            </div>

            <div className="card">
              <div className="label">
                Schedule periods
              </div>

              <div className="value">
                {Number(
                  scheduleResult
                    ?.created_or_updated ||
                  scheduleResult?.items?.length ||
                  0
                )}
              </div>
            </div>
          </div>

          <p>
            The lease remains ready for review and
            commencement. No customer invoice has been
            created.
          </p>

          <div className="wizard-buttons">
            <button onClick={resetForm}>
              Create another lessor lease
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="lease-wizard"
      data-role="lessor"
    >
      <div className="lease-step lease-step-1">
        <h2>New lessor lease</h2>

        <p
          style={{
            fontSize: "0.8rem",
            textAlign: "center",
            marginTop: 4,
          }}
        >
          Enter the agreement between your company and
          the customer. Creating the lease does not
          create an invoice.
        </p>

        {selectedAccountCode && (
        <div className="lease-trigger-account">
            <div className="lease-trigger-account-label">
            Triggering GL account
            </div>

            <div className="lease-trigger-account-value">
            {selectedAccountCode}
            </div>
        </div>
        )}

        <div className="lease-grid-3">
          <div className="field-row">
            <label>Contract number</label>

            <input
              name="contract_no"
              value={form.contract_no || ""}
              onChange={updateText}
            />
          </div>

          <div className="field-row field-span-2">
            <label>Contract name *</label>

            <input
              name="contract_name"
              value={form.contract_name}
              onChange={updateText}
            />
          </div>

          <div className="field-row">
            <label>Customer / lessee *</label>

            <select
              value={String(
                form.customer_id || ""
              )}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  customer_id:
                    event.target.value
                      ? Number(event.target.value)
                      : null,
                }));
              }}
              disabled={loadingCustomers}
            >
              <option value="">
                {loadingCustomers
                  ? "Loading customers..."
                  : "Select customer..."}
              </option>

              {customers.map((customer) => (
                <option
                  key={customer.id}
                  value={customer.id}
                >
                  {customerName(customer)}
                </option>
              ))}
            </select>
          </div>

          <div className="field-row">
            <label>Classification</label>

            <select
              name="lease_classification"
              value={form.lease_classification}
              onChange={updateText}
            >
              <option value="finance">
                Finance lease
              </option>

              <option value="operating">
                Operating lease
              </option>
            </select>
          </div>

          <div className="field-row">
            <label>Currency</label>

            <input
              name="currency"
              value={form.currency || ""}
              onChange={updateText}
              placeholder="e.g. ZAR, LSL"
            />
          </div>

          <div className="field-row">
            <label>Start date *</label>

            <input
              type="date"
              name="start_date"
              value={form.start_date}
              onChange={updateText}
            />
          </div>

          <div className="field-row">
            <label>End date</label>

            <input
              type="date"
              name="end_date"
              value={form.end_date || ""}
              onChange={updateText}
            />
          </div>

          <div className="field-row">
            <label>Lease term (months)</label>

            <input
              value={termMonths || ""}
              readOnly
            />
          </div>

          <div className="field-row">
            <label>
              Billing amount per period
            </label>

            <input
              type="number"
              name="billing_amount"
              value={form.billing_amount}
              onChange={updateNumber}
              step="0.01"
            />
          </div>

          <div className="field-row">
            <label>Billing amount basis</label>

            <select
              name="billing_basis"
              value={form.billing_basis}
              onChange={updateText}
            >
              <option value="gross">
                Amount includes VAT
              </option>

              <option value="net">
                Amount excludes VAT
              </option>
            </select>
          </div>

          <div className="field-row">
            <label>VAT rate</label>

            <input
              type="number"
              name="vat_rate"
              value={form.vat_rate}
              onChange={updateNumber}
              step="0.0001"
            />
          </div>

          <div className="field-row">
            <label>Billing frequency</label>

            <select
              name="billing_frequency"
              value={form.billing_frequency}
              onChange={updateText}
            >
              <option value="weekly">
                Weekly
              </option>

              <option value="monthly">
                Monthly
              </option>

              <option value="quarterly">
                Quarterly
              </option>

              <option value="annually">
                Annually
              </option>
            </select>
          </div>

          <div className="field-row">
            <label>Billing timing</label>

            <select
              name="billing_timing"
              value={form.billing_timing}
              onChange={updateText}
            >
              <option value="arrears">
                In arrears
              </option>

              <option value="advance">
                In advance
              </option>
            </select>
          </div>

          <div className="field-row">
            <label>Bill day of month</label>

            <input
              type="number"
              name="bill_day_of_month"
              value={
                form.bill_day_of_month || ""
              }
              onChange={updateNumber}
              min="1"
              max="31"
            />
          </div>

          <div className="field-row">
            <label>Payment terms (days)</label>

            <input
              type="number"
              name="payment_terms_days"
              value={form.payment_terms_days}
              onChange={updateNumber}
            />
          </div>

          <div className="field-row">
            <label>Security deposit</label>

            <input
              type="number"
              name="security_deposit_amount"
              value={
                form.security_deposit_amount
              }
              onChange={updateNumber}
              step="0.01"
            />
          </div>

          <div className="field-row field-span-2">
            <label>Notes</label>

            <textarea
              name="notes"
              value={form.notes || ""}
              onChange={updateText}
              rows={3}
            />
          </div>
        </div>

        <details className="advanced-gl">
          <summary>Advanced GL mapping</summary>

          <div className="advanced-gl-note">
            These accounts are used by the lessor
            accounting engine. Lease receivables are
            used for finance leases, while lease income
            is used for operating leases.
          </div>

          <div className="lease-grid-3 advanced-gl-grid">
            <div className="field-row">
              <label>
                Lease receivable – current
              </label>

              <input
                name="net_investment_current_account_code"
                value={
                  form
                    .net_investment_current_account_code ||
                  ""
                }
                onChange={updateText}
              />
            </div>

            <div className="field-row">
              <label>
                Lease receivable – non-current
              </label>

              <input
                name="net_investment_noncurrent_account_code"
                value={
                  form
                    .net_investment_noncurrent_account_code ||
                  ""
                }
                onChange={updateText}
              />
            </div>

            <div className="field-row">
              <label>Lease income</label>

              <input
                name="revenue_account_code"
                value={
                  form.revenue_account_code || ""
                }
                onChange={updateText}
              />
            </div>

            <div className="field-row">
              <label>Finance income</label>

              <input
                name="finance_income_account_code"
                value={
                  form
                    .finance_income_account_code ||
                  ""
                }
                onChange={updateText}
              />
            </div>

            <div className="field-row">
              <label>Accounts receivable</label>

              <input
                name="ar_account_code"
                value={
                  form.ar_account_code || ""
                }
                onChange={updateText}
              />
            </div>

            <div className="field-row">
              <label>VAT output</label>

              <input
                name="vat_output_account_code"
                value={
                  form
                    .vat_output_account_code || ""
                }
                onChange={updateText}
              />
            </div>

            <div className="field-row">
              <label>
                Security deposit account
              </label>

              <input
                name="security_deposit_account_code"
                value={
                  form
                    .security_deposit_account_code ||
                  ""
                }
                onChange={updateText}
              />
            </div>
          </div>
        </details>

        {preview && (
        <div className="lessor-preview-panel">
            <div className="lessor-preview-header">
            Classification preview
            </div>

            <pre>
            {JSON.stringify(preview, null, 2)}
            </pre>
        </div>
        )}

        {error && (
          <div className="error">
            {error}
          </div>
        )}

        <div className="wizard-buttons">
          <button
            onClick={handlePreview}
            disabled={loading}
          >
            {loading
              ? "Checking..."
              : "Preview classification"}
          </button>

          <button
            onClick={handleCreate}
            disabled={loading}
          >
            {loading
              ? "Creating..."
              : "Create lessor lease"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LessorLeaseWizard;