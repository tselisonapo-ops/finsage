// frontEnd/src/components/LeaseWizard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { previewLease, createLease } from "../api/leases";
import { apiFetch } from "../api/apiFetch";

import type {
  LeaseWizardPayload,
  LeasePreviewResponse,
  LeaseCreateResponse,
  PaymentFrequency,
  PaymentTiming,
  PvRow,
  ScheduleRow,
  OpeningJournalLine,
} from "../api/leases";

type Step = 1 | 2 | 3;

interface LeaseWizardProps {
  companyId: number;
  mode?: "inception" | "existing";

  defaultLeaseLiabilityAccount: string;
  defaultRouAssetAccount: string;
  defaultInterestExpenseAccount?: string;
  defaultDepreciationExpenseAccount?: string;
  defaultDirectCostOffsetAccount?: string;
}

type LessorRow = { id: number; name: string };

type LessorsApiResponse =
  | LessorRow[]
  | { rows?: LessorRow[]; items?: LessorRow[]; lessors?: LessorRow[] };

function normalizeLessorsResponse(data: LessorsApiResponse): LessorRow[] {
  if (Array.isArray(data)) return data;
  return data.rows || data.items || data.lessors || [];
}

async function fetchLessors(companyId: number): Promise<LessorRow[]> {
  const params = new URLSearchParams({ active: "1", limit: "500", offset: "0" });

  const data = (await apiFetch(
    `/api/companies/${companyId}/lessors?${params.toString()}`,
    { method: "GET" }
  )) as LessorsApiResponse;

  const rows = normalizeLessorsResponse(data);

  return rows
    .map((r) => ({ id: Number(r.id), name: String(r.name || "") }))
    .filter((r) => Number.isFinite(r.id) && r.id > 0);
}

// Simple label mapping (UI-only). Backend still receives codes.
const ACCOUNT_LABELS: Record<string, string> = {
  BS_NCA_1610: "Right-of-Use Asset",
  BS_CL_2610: "Lease Liability - Current",
  BS_NCL_2620: "Lease Liability - Non-Current",
  PL_OPEX_7110: "Interest Expense",
  PL_OPEX_6017: "Lease Amortization",
  BS_CL_2200: "Direct costs offset",
  PL_OPEX_6019: "Interest Expense (alt)", // keep if you use 6019 in UI
};

function labelForAccount(code?: string | null) {
  const c = (code || "").trim();
  if (!c) return "";
  return ACCOUNT_LABELS[c] || "";
}

function formatAccount(code?: string | null) {
  const c = (code || "").trim();
  if (!c) return "";
  const lbl = labelForAccount(c);
  return lbl ? `${lbl} (${c})` : c;
}

const LeaseWizard: React.FC<LeaseWizardProps> = ({
  companyId,
  mode = "inception",
  defaultLeaseLiabilityAccount,
  defaultRouAssetAccount,
  defaultInterestExpenseAccount,
  defaultDepreciationExpenseAccount,
  defaultDirectCostOffsetAccount,
}) => {
  type LeaseWizardPayloadWithLessor = LeaseWizardPayload & {
    lessor_id: number | null;
    reference?: string | null; // ✅ ADD THIS
  };

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lessors, setLessors] = useState<LessorRow[]>([]);
  const [auth, setAuth] = useState<{ token: string; companyId: number } | null>(
    null
  );

  const [preview, setPreview] = useState<LeasePreviewResponse | null>(null);
  const [result, setResult] = useState<LeaseCreateResponse | null>(null);

  const isExisting = mode === "existing";

  const [form, setForm] = useState<LeaseWizardPayloadWithLessor>({
    lease_name: "",
    lessor_id: null,
    role: "lessee",
    wizard_mode: mode,
    go_live_date: mode === "existing" ? "" : null,

    start_date: "",
    end_date: "",

    payment_amount: 0,
    payment_frequency: "monthly" as PaymentFrequency,
    payment_timing: "arrears" as PaymentTiming,

    annual_rate: 0.12,
    initial_direct_costs: 0,
    residual_value: 0,
    vat_rate: 0.0,

    lease_liability_account: defaultLeaseLiabilityAccount,
    rou_asset_account: defaultRouAssetAccount,
    interest_expense_account: defaultInterestExpenseAccount ?? null,
    depreciation_expense_account: defaultDepreciationExpenseAccount ?? null,
    direct_costs_offset_account: defaultDirectCostOffsetAccount ?? null,
  });

  // 1) Receive token + companyId from parent (postMessage)
  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const data = ev.data || {};

      if (!data?.token || !data?.companyId) return;

      localStorage.setItem("auth_token", String(data.token));

      setAuth({
        token: String(data.token),
        companyId: Number(data.companyId),
      });

      // ✅ NEW: extract ctx safely
      const ctx = data.ctx as {
        mode?: "inception" | "existing";
        defaults?: {
          goLiveDate?: string | null;
          openingAsAt?: string | null;
          postingDate?: string | null;
          reference?: string | null;
        };
      } | undefined;

      if (!ctx) return;

      const defaults = ctx.defaults || {};

      setForm((f) => ({
        ...f,
        wizard_mode: ctx.mode || f.wizard_mode,
        go_live_date:
          ctx.mode === "existing"
            ? defaults.goLiveDate || f.go_live_date
            : f.go_live_date,
        reference: defaults.reference || f.reference || "",
      }));
    }

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // 2) Load lessors once token exists
  useEffect(() => {
    const cid = auth?.companyId || companyId;
    if (!cid) return;

    // If token isn't present yet, don't call API
    if (!auth?.token) return;

    let alive = true;

    async function run() {
      try {
        setError(null);
        const rows = await fetchLessors(cid);
        if (alive) setLessors(rows);
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load lessors");
      }
    }

    run();

    return () => {
      alive = false;
    };
  }, [auth?.companyId, auth?.token, companyId]);

  // Optional refresh on focus (no unused vars, no empty catch)
  useEffect(() => {
    async function onFocus() {
      const cid = auth?.companyId || companyId;
      if (!cid || !auth?.token) return;

      try {
        const rows = await fetchLessors(cid);
        setLessors(rows);
      } catch (err) {
        console.error("Failed to refresh lessors", err);
      }
    }

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [auth?.companyId, auth?.token, companyId]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (
      [
        "payment_amount",
        "annual_rate",
        "initial_direct_costs",
        "residual_value",
        "vat_rate",
      ].includes(name)
    ) {
      setForm((f) => ({
        ...f,
        [name]: parseFloat(value) || 0,
      }));
    } else {
      setForm((f) => ({
        ...f,
        [name]: value,
      }));
    }
  };

  const leaseTermMonths = useMemo(() => {
    if (!form.start_date || !form.end_date) return 0;

    const s = new Date(form.start_date);
    const e = new Date(form.end_date);

    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
    if (e < s) return 0;

    const years = e.getFullYear() - s.getFullYear();
    const months = e.getMonth() - s.getMonth();
    let total = years * 12 + months;

    if (e.getDate() > s.getDate()) total += 1;
    return total;
  }, [form.start_date, form.end_date]);

  const onPreview = async () => {
    setError(null);

    if (!form.lessor_id) {
      setError("Select a lessor before previewing.");
      return;
    }

    setLoading(true);
    try {
      const data = await previewLease(form as LeaseWizardPayload);
      setPreview(data);
      setStep(2);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message || "Preview failed" : "Preview failed"
      );
    } finally {
      setLoading(false);
    }
  };

  const onSave = async () => {
    if (!preview) return;

    if (!form.lessor_id) {
      setError("Select a lessor before saving.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const data = await createLease(form as LeaseWizardPayload);
      setResult(data);
      setStep(3);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message || "Save failed" : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <div className="lease-step lease-step-1">
      <h2>
        {isExisting ? "Existing lease - IFRS 16 setup" : "New lease - IFRS 16 details"}
      </h2>

      {isExisting ? (
        <p style={{ fontSize: "0.8rem", textAlign: "center", marginTop: 4 }}>
          Enter the original lease terms. In the next phase FinSage will calculate the IFRS
          16 opening balances at your go-live date.
        </p>
      ) : (
        <p style={{ fontSize: "0.8rem", textAlign: "center", marginTop: 4 }}>
          Enter the lease terms at inception. You&apos;ll see the full amortisation schedule
          and Day-1 IFRS 16 journal before posting.
        </p>
      )}

      <div className="lease-grid-3">
        <div className="field-row field-span-2">
          <label>Lease name</label>
          <input type="text" name="lease_name" value={form.lease_name} onChange={handleChange} />
        </div>

        <div className="field-row">
          <label>Lessor *</label>
          <select
            name="lessor_id"
            value={String(form.lessor_id ?? "")}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              setForm((f) => ({ ...f, lessor_id: v }));
            }}
          >
            <option value="">Select lessor...</option>
            {lessors.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <label>Start date</label>
          <input type="date" name="start_date" value={form.start_date} onChange={handleChange} />
        </div>

        <div className="field-row">
          <label>End date</label>
          <input type="date" name="end_date" value={form.end_date} onChange={handleChange} />
        </div>

        <div className="field-row">
          <label>Lease term (months)</label>
          <input type="number" value={leaseTermMonths || ""} readOnly />
        </div>

        <div className="field-row">
          <label>Payment amount (per period, incl. VAT)</label>
          <input
            type="number"
            name="payment_amount"
            value={form.payment_amount}
            onChange={handleChange}
            step="0.01"
          />
        </div>

        <div className="field-row">
          <label>Payment frequency</label>
          <select
            name="payment_frequency"
            value={form.payment_frequency}
            onChange={handleChange}
          >
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annually">Annually</option>
          </select>
        </div>

        <div className="field-row">
          <label>Payment timing</label>
          <select
            name="payment_timing"
            value={(form.payment_timing || "arrears") as string}
            onChange={handleChange}
          >
            <option value="arrears">In arrears (end of period)</option>
            <option value="advance">In advance (start of period)</option>
          </select>
        </div>

        <div className="field-row">
          <label>Annual discount rate (e.g. 0.12)</label>
          <input
            type="number"
            name="annual_rate"
            value={form.annual_rate}
            onChange={handleChange}
            step="0.0001"
          />
        </div>

        <div className="field-row">
          <label>Initial direct costs</label>
          <input
            type="number"
            name="initial_direct_costs"
            value={form.initial_direct_costs}
            onChange={handleChange}
            step="0.01"
          />
        </div>

        <div className="field-row">
          <label>Residual value (guaranteed)</label>
          <input
            type="number"
            name="residual_value"
            value={form.residual_value}
            onChange={handleChange}
            step="0.01"
          />
        </div>

        <div className="field-row">
          <label>VAT rate (e.g. 0.15)</label>
          <input type="number" name="vat_rate" value={form.vat_rate} onChange={handleChange} step="0.0001" />
        </div>

        <div className="field-row field-empty" />
        <div className="field-row field-empty" />
      </div>

      <h3>GL Accounts</h3>

      <div className="lease-grid-3">
        <div className="field-row">
          <label>Lease liability account</label>
          <input
            type="text"
            name="lease_liability_account"
            value={form.lease_liability_account}
            onChange={handleChange}
          />
          <div className="text-xs" style={{ opacity: 0.7, marginTop: 4 }}>
            {formatAccount(form.lease_liability_account)}
          </div>
        </div>

        <div className="field-row">
          <label>ROU asset account</label>
          <input
            type="text"
            name="rou_asset_account"
            value={form.rou_asset_account}
            onChange={handleChange}
          />
          <div className="text-xs" style={{ opacity: 0.7, marginTop: 4 }}>
            {formatAccount(form.rou_asset_account)}
          </div>
        </div>

        <div className="field-row">
          <label>Interest expense account</label>
          <input
            type="text"
            name="interest_expense_account"
            value={form.interest_expense_account || ""}
            onChange={handleChange}
          />
          <div className="text-xs" style={{ opacity: 0.7, marginTop: 4 }}>
            {formatAccount(form.interest_expense_account)}
          </div>
        </div>

        <div className="field-row">
          <label>Depreciation expense account</label>
          <input
            type="text"
            name="depreciation_expense_account"
            value={form.depreciation_expense_account || ""}
            onChange={handleChange}
          />
          <div className="text-xs" style={{ opacity: 0.7, marginTop: 4 }}>
            {formatAccount(form.depreciation_expense_account)}
          </div>
        </div>

        <div className="field-row">
          <label>Direct costs offset account</label>
          <input
            type="text"
            name="direct_costs_offset_account"
            value={form.direct_costs_offset_account || ""}
            onChange={handleChange}
          />
          <div className="text-xs" style={{ opacity: 0.7, marginTop: 4 }}>
            {formatAccount(form.direct_costs_offset_account)}
          </div>
        </div>

        <div className="field-row field-empty" />
      </div>

      {error && <div className="error">{error}</div>}

      <div className="wizard-buttons">
        <button onClick={onPreview} disabled={loading}>
          {loading ? "Calculating..." : "Preview lease"}
        </button>
      </div>
    </div>
  );

  const renderPVTable = () => {
    if (!preview) return null;
    return (
      <div className="pv-table-wrapper">
        <h3>Lease Liability PV Table</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Start</th>
                <th>End</th>
                <th>Disc. factor</th>
                <th>Net payment</th>
                <th>PV of payment</th>
                <th>Cumulative PV</th>
                <th>Opening liability</th>
                <th>Interest</th>
                <th>Principal</th>
                <th>Closing liability</th>
              </tr>
            </thead>
            <tbody>
              {preview.pv_table.map((row: PvRow) => (
                <tr key={row.period_no}>
                  <td>{row.period_no}</td>
                  <td>{row.period_start}</td>
                  <td>{row.period_end}</td>
                  <td>{row.discount_factor.toFixed(6)}</td>
                  <td>{row.net_payment.toFixed(2)}</td>
                  <td>{row.pv_of_payment.toFixed(2)}</td>
                  <td>{row.cumulative_pv.toFixed(2)}</td>
                  <td>{row.opening_liability.toFixed(2)}</td>
                  <td>{row.interest.toFixed(2)}</td>
                  <td>{row.principal.toFixed(2)}</td>
                  <td>{row.closing_liability.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderScheduleTable = () => {
    if (!preview) return null;
    return (
      <div className="schedule-table-wrapper">
        <h3>Lease Amortisation Schedule</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Start</th>
                <th>End</th>
                <th>Opening</th>
                <th>Interest</th>
                <th>Payment (gross)</th>
                <th>Principal</th>
                <th>Closing</th>
                <th>Depreciation</th>
                <th>VAT portion</th>
                <th>Net payment</th>
              </tr>
            </thead>
            <tbody>
              {preview.schedule.map((p: ScheduleRow) => (
                <tr key={p.period_no}>
                  <td>{p.period_no}</td>
                  <td>{p.period_start}</td>
                  <td>{p.period_end}</td>
                  <td>{p.opening_liability.toFixed(2)}</td>
                  <td>{p.interest.toFixed(2)}</td>
                  <td>{p.payment.toFixed(2)}</td>
                  <td>{p.principal.toFixed(2)}</td>
                  <td>{p.closing_liability.toFixed(2)}</td>
                  <td>{p.depreciation.toFixed(2)}</td>
                  <td>{p.vat_portion.toFixed(2)}</td>
                  <td>{p.net_payment.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderOpeningJournal = () => {
    if (!preview) return null;
    return (
      <div className="opening-journal-wrapper">
        <h3>Opening IFRS 16 Journal (Day 1)</h3>
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Description</th>
              <th>Debit</th>
              <th>Credit</th>
            </tr>
          </thead>
          <tbody>
            {preview.opening_journal.map((line: OpeningJournalLine, idx: number) => (
              <tr key={idx}>
                <td>
                  <div>{formatAccount(line.account_code)}</div>
                  <div style={{ fontSize: 12, opacity: 0.65 }}>{line.account_code}</div>
                </td>
                <td>{line.description}</td>
                <td>{line.debit.toFixed(2)}</td>
                <td>{line.credit.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderStep2 = () => {
    if (!preview) return null;

    return (
      <div className="lease-step lease-step-2">
        <h2>Lease preview</h2>

        <div className="summary-cards">
          <div className="card">
            <div className="label">Lease term (months)</div>
            <div className="value">{preview.lease_term_months}</div>
          </div>
          <div className="card">
            <div className="label">Opening lease liability</div>
            <div className="value">{preview.opening_lease_liability.toFixed(2)}</div>
          </div>
          <div className="card">
            <div className="label">Opening ROU asset</div>
            <div className="value">{preview.opening_rou_asset.toFixed(2)}</div>
          </div>
        </div>

        {renderPVTable()}
        {renderScheduleTable()}
        {renderOpeningJournal()}

        {error && <div className="error">{error}</div>}

        <div className="wizard-buttons">
          <button onClick={() => setStep(1)} disabled={loading}>
            Back
          </button>
          <button onClick={onSave} disabled={loading}>
            {loading ? "Posting..." : "Save & post lease"}
          </button>
        </div>
      </div>
    );
  };

  const renderStep3 = () => {
    if (!result) return null;
    return (
      <div className="lease-step lease-step-3">
        <h2>Lease created</h2>
        <p>
          Lease <strong>{form.lease_name}</strong> has been created and posted.
        </p>

        {result.lease_id && (
          <p>
            Lease ID: <strong>{result.lease_id}</strong>
          </p>
        )}

        {result.journal_id && (
          <p>
            Opening journal ID: <strong>{result.journal_id}</strong>
          </p>
        )}

        <h3>Key balances</h3>
        <ul>
          <li>Opening lease liability: {result.opening_lease_liability.toFixed(2)}</li>
          <li>Opening ROU asset: {result.opening_rou_asset.toFixed(2)}</li>
        </ul>

        <button
          onClick={() => {
            setPreview(null);
            setResult(null);
            setStep(1);
          }}
        >
          Create another lease
        </button>
      </div>
    );
  };

  return (
    <div className="lease-wizard" data-mode={mode}>
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
    </div>
  );
};

export default LeaseWizard;
