// frontEnd/src/components/LeaseWizard.tsx
import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import { previewLease, createLease } from "../api/leases";
import { apiFetch } from "../api/apiFetch";
import {
  fetchCompanyCoa,
  type CoaAccount,
} from "../api/coa";

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

type LessorRow = {
  id: number;
  name: string;
  vendor_id?: number | null;
};

type LeaseCreateResponseWithVendor = LeaseCreateResponse & {
  lessor_id?: number | null;
  vendor_id?: number | null;
  vendor_name?: string | null;
};

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
    .map((r) => ({
      id: Number(r.id),
      name: String(r.name || ""),
      vendor_id:
        r.vendor_id != null && Number(r.vendor_id) > 0
          ? Number(r.vendor_id)
          : null,
    }))
    .filter((r) => Number.isFinite(r.id) && r.id > 0);
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

  const [coaAccounts, setCoaAccounts] =
    useState<CoaAccount[]>([]);

  const [coaLoading, setCoaLoading] =
    useState(false);

  const [coaError, setCoaError] =
    useState("");

  const [lessors, setLessors] = useState<LessorRow[]>([]);
  const [auth, setAuth] = useState<{ token: string; companyId: number } | null>(
    null
  );

  const [preview, setPreview] = useState<LeasePreviewResponse | null>(null);
  const [result, setResult] = useState<LeaseCreateResponseWithVendor | null>(null);
  const [showDirectCostPrompt, setShowDirectCostPrompt] = useState(false);
  const [directCostAction, setDirectCostAction] = useState<"ap_bill" | "paid" | "skip" | null>(null);
  const isExisting = mode === "existing";

  const [bankAccounts, setBankAccounts] = useState<Array<{ id: number; bank_name?: string; account_name?: string; account_number_masked?: string; ledger_account_code?: string }>>([]);
  const [loadingBankAccounts, setLoadingBankAccounts] = useState(false);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>("");
  const [directCostPaidDate, setDirectCostPaidDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [showPaidCapture, setShowPaidCapture] = useState(false);

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

  useEffect(() => {
    setForm((f) => ({
      ...f,
      wizard_mode: mode,
      go_live_date:
        mode === "existing"
          ? (f.go_live_date || "")
          : null,
    }));
    setPreview(null);
    setResult(null);
    setStep(1);
  }, [mode]);

  useEffect(() => {
    let cancelled = false;

    async function loadCoa() {
      try {
        setCoaLoading(true);
        setCoaError("");

        const rows =
          await fetchCompanyCoa(companyId);

        if (!cancelled) {
          setCoaAccounts(rows);
        }
      } catch (err) {
        console.error(
          "[LESSEE] Failed to load COA",
          err
        );

        if (!cancelled) {
          setCoaError(
            "Could not load company GL accounts."
          );
        }
      } finally {
        if (!cancelled) {
          setCoaLoading(false);
        }
      }
    }

    loadCoa();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const coaByCode = useMemo(
    () =>
      new Map(
        coaAccounts.map((account) => [
          String(account.code || "")
            .trim()
            .toUpperCase(),
          account,
        ])
      ),
    [coaAccounts]
  );

  function accountName(
    code?: string | null
  ) {
    return (
      coaByCode.get(
        String(code || "")
          .trim()
          .toUpperCase()
      )?.name ||
      "Account not found"
    );
  }

  function accountText(account: CoaAccount) {
    return [
      account.name,
      account.role,
      account.account_role,
      account.section,
      account.category,
      account.type,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function sectionText(account: CoaAccount) {
    return [
      account.section,
      account.category,
      account.type,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function relevantAccounts(
    keywords: string[],
    fallbackSections: string[]
  ): CoaAccount[] {
    const matches = coaAccounts.filter(
      (account) => {
        const text = accountText(account);

        return keywords.some((keyword) =>
          text.includes(keyword)
        );
      }
    );

    if (matches.length) {
      return matches;
    }

    return coaAccounts.filter((account) => {
      const text = sectionText(account);

      return fallbackSections.some(
        (section) => text.includes(section)
      );
    });
  }

  const leaseLiabilityAccounts =
    relevantAccounts(
      [
        "lease liability",
        "ifrs16 lease liability",
        "lease_liability",
      ],
      [
        "current liability",
        "non-current liability",
        "noncurrent liability",
        "liability",
      ]
    );

  const rouAssetAccounts =
    relevantAccounts(
      [
        "right-of-use",
        "right of use",
        "rou asset",
        "rou_asset",
      ],
      [
        "non-current asset",
        "noncurrent asset",
      ]
    );

  const interestExpenseAccounts =
    relevantAccounts(
      [
        "lease interest expense",
        "interest expense",
        "finance cost",
      ],
      [
        "expense",
      ]
    );

  const depreciationExpenseAccounts =
    relevantAccounts(
      [
        "lease depreciation",
        "rou depreciation",
        "right-of-use depreciation",
        "right of use depreciation",
        "depreciation expense",
        "amortisation expense",
        "amortization expense",
      ],
      [
        "expense",
      ]
    );

  const directCostOffsetAccounts =
    relevantAccounts(
      [
        "direct cost offset",
        "accounts payable",
        "trade payable",
        "supplier payable",
        "bank",
        "cash",
      ],
      [
        "current liability",
        "liability",
        "current asset",
        "asset",
      ]
    );

  function renderAccountOptions(
    accounts: CoaAccount[]
  ) {
    return accounts.map((account) => (
      <option
        key={account.code}
        value={account.code}
      >
        {account.name}
      </option>
    ));
  }

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

      const contextPostingDate =
        defaults.postingDate ||
        defaults.goLiveDate ||
        null;

      if (contextPostingDate) {
        setDirectCostPaidDate(String(contextPostingDate).slice(0, 10));
      }
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

    if (isExisting && !form.go_live_date) {
      setError("Go-live date is required for an existing lease.");
      return;
    }

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

    if (isExisting && !form.go_live_date) {
      setError("Go-live date is required for an existing lease.");
      return;
    }

    if (!form.lessor_id) {
      setError("Select a lessor before saving.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const data = await createLease(form as LeaseWizardPayload);
      const directCost = Number(form.initial_direct_costs || 0);

      setResult(data);
      setStep(3);

      setTimeout(() => {
        if (directCost > 0) {
          setShowDirectCostPrompt(true);
        }
      }, 50);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message || "Save failed" : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  async function loadCompanyBankAccounts() {
    try {
      setLoadingBankAccounts(true);
      const data = await apiFetch(`/api/companies/${companyId}/bank_accounts`, {
        method: "GET",
      });

      const rows = Array.isArray(data) ? data : (data?.rows || data?.items || []);
      setBankAccounts(rows);
    } catch (err) {
      console.error("Failed to load bank accounts", err);
      setError(err instanceof Error ? err.message : "Failed to load bank accounts");
    } finally {
      setLoadingBankAccounts(false);
    }
  }

  function closeDirectCostPrompt() {
    setShowDirectCostPrompt(false);
    setShowPaidCapture(false);
    setSelectedBankAccountId("");
    setDirectCostAction(null);
  }

  function handleDirectCostCreateApBill() {
    console.log("[LEASE] Create AP Bill clicked");

    const action = "ap_bill";

    setDirectCostAction(action);
    setShowDirectCostPrompt(false);

    const selectedLessor = lessors.find(
      (l) => Number(l.id) === Number(form.lessor_id)
    );

    const payload = {
      source: "lease",
      action,
      lease_id: result?.lease_id || null,
      lease_name: form.lease_name || "",
      lessor_id: form.lessor_id || null,
      vendor_id: selectedLessor?.vendor_id || null,
      vendor_name: selectedLessor?.name || "",
      amount: Number(form.initial_direct_costs || 0),
      vat_rate: Number(form.vat_rate || 0),
      asset_account: form.rou_asset_account || "BS_NCA_1610",
      description: `Initial direct cost - ${form.lease_name || "Lease"}`,
      reference: form.reference || "",
      company_id: companyId,
    };

    window.parent?.postMessage(
      {
        type: "lease_create_ap_bill",
        payload,
      },
      "*"
    );
  }

  async function handleDirectCostPaidNow() {
    setDirectCostAction("paid");
    setShowPaidCapture(true);

    if (!bankAccounts.length) {
      await loadCompanyBankAccounts();
    }
  }

  function handleDirectCostSkip() {
    setDirectCostAction("skip");
    setShowDirectCostPrompt(false);
    setShowPaidCapture(false);

    alert("Initial direct cost marked as pending capture.");
  }

  async function submitDirectCostPaidNow() {
    try {
      if (!result?.lease_id) {
        throw new Error("Lease must be saved before posting direct cost payment.");
      }

      if (!selectedBankAccountId) {
        throw new Error("Select a bank account.");
      }

      const payload = {
        lease_id: result.lease_id,
        payment_date: directCostPaidDate,
        bank_account_id: Number(selectedBankAccountId),
        amount: Number(form.initial_direct_costs || 0),
        vat_rate: Number(form.vat_rate || 0),
        rou_asset_account: form.rou_asset_account || "BS_NCA_1610",
        reference: form.reference || null,
        description: `Initial direct cost - ${form.lease_name || "Lease"}`,
      };

      const resp = await apiFetch(
        `/api/companies/${companyId}/leases/${result.lease_id}/direct-costs/paid`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      console.log("Direct cost paid posting result", resp);

      setShowDirectCostPrompt(false);
      setShowPaidCapture(false);
      setSelectedBankAccountId("");
      setDirectCostAction(null);
      alert("Initial direct cost posted as paid.");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to post direct cost payment.");
    }
  }

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

        {isExisting && (
          <div className="field-row">
            <label>Go-live date</label>
            <input
              type="date"
              name="go_live_date"
              value={form.go_live_date || ""}
              onChange={handleChange}
            />
          </div>
        )}

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
          <label className="fs-tip-label">
            Initial direct costs

            <span className="fs-tip">
              <span className="fs-tip-icon" tabIndex={0}>i</span>

              <span className="fs-tip-box">
                Initial direct costs are costs paid to third-party suppliers to obtain
                the lease, such as broker, legal, installation, or setup fees.
                <br /><br />
                These costs are not automatically paid to the lessor. After saving the
                lease, FinSage can help you capture an AP bill where you select or
                create the correct vendor.
              </span>
            </span>
          </label>

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

      <details className="advanced-gl">
        <summary>Advanced GL mapping</summary>

        <div className="advanced-gl-note">
          FinSage has selected the relevant IFRS 16
          accounts from your company chart of accounts.
        </div>

        {coaError && (
          <div className="error">
            {coaError}
          </div>
        )}

        <div className="lease-grid-3 advanced-gl-grid">
          <div className="field-row">
            <label>Lease liability account</label>

            <select
              name="lease_liability_account"
              value={
                form.lease_liability_account
              }
              onChange={handleChange}
              disabled={coaLoading}
            >
              <option value="">
                {coaLoading
                  ? "Loading accounts..."
                  : "Select lease liability account..."}
              </option>

              {renderAccountOptions(
                leaseLiabilityAccounts
              )}
            </select>
          </div>

          <div className="field-row">
            <label>ROU asset account</label>

            <select
              name="rou_asset_account"
              value={form.rou_asset_account}
              onChange={handleChange}
              disabled={coaLoading}
            >
              <option value="">
                {coaLoading
                  ? "Loading accounts..."
                  : "Select right-of-use asset account..."}
              </option>

              {renderAccountOptions(
                rouAssetAccounts
              )}
            </select>
          </div>

          <div className="field-row">
            <label>Interest expense account</label>

            <select
              name="interest_expense_account"
              value={
                form.interest_expense_account || ""
              }
              onChange={handleChange}
              disabled={coaLoading}
            >
              <option value="">
                {coaLoading
                  ? "Loading accounts..."
                  : "Select interest expense account..."}
              </option>

              {renderAccountOptions(
                interestExpenseAccounts
              )}
            </select>
          </div>

          <div className="field-row">
            <label>
              Depreciation expense account
            </label>

            <select
              name="depreciation_expense_account"
              value={
                form
                  .depreciation_expense_account ||
                ""
              }
              onChange={handleChange}
              disabled={coaLoading}
            >
              <option value="">
                {coaLoading
                  ? "Loading accounts..."
                  : "Select depreciation expense account..."}
              </option>

              {renderAccountOptions(
                depreciationExpenseAccounts
              )}
            </select>
          </div>

          <div className="field-row">
            <label>
              Direct costs offset account
            </label>

            <select
              name="direct_costs_offset_account"
              value={
                form
                  .direct_costs_offset_account ||
                ""
              }
              onChange={handleChange}
              disabled={coaLoading}
            >
              <option value="">
                {coaLoading
                  ? "Loading accounts..."
                  : "Select direct cost offset account..."}
              </option>

              {renderAccountOptions(
                directCostOffsetAccounts
              )}
            </select>
          </div>

          <div className="field-row field-empty" />
        </div>
      </details>

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
                  {accountName(line.account_code)}
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

        {directCostAction && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="label">Initial direct cost action</div>
            <div className="value" style={{ fontSize: "0.95rem" }}>
              {directCostAction === "ap_bill" && "Create AP Bill selected"}
              {directCostAction === "paid" && "Record as Paid selected"}
              {directCostAction === "skip" && "Skip for now selected"}
            </div>
          </div>
        )}

        <button
          onClick={() => {
            setPreview(null);
            setResult(null);
            setDirectCostAction(null);
            setShowDirectCostPrompt(false);
            setShowPaidCapture(false);
            setSelectedBankAccountId("");
            setError(null);
            setStep(1);
          }}
        >
          Create another lease
        </button>
      </div>
    );
  };

  const renderDirectCostPrompt = () => {
    if (!showDirectCostPrompt) return null;

    return (
      <div className="lease-direct-cost-modal-backdrop">
        <div className="lease-direct-cost-modal">
          <div className="dc-header">
            <h3>Initial Direct Costs</h3>
            <span className="dc-badge">IFRS 16</span>
          </div>

          <p className="dc-text">
            This lease includes initial direct costs of
          </p>

          <div className="dc-amount">
            {Number(form.initial_direct_costs || 0).toFixed(2)}
          </div>

          {!showPaidCapture ? (
            <>
              <p className="dc-subtext">How would you like to capture them?</p>

              {directCostAction && (
                <p className="dc-selection">
                  Current selection: {directCostAction}
                </p>
              )}

              <div className="dc-actions">
                <button className="btn-primary" onClick={handleDirectCostCreateApBill}>
                  📄 Create AP Bill
                </button>

                <button className="btn-secondary" onClick={handleDirectCostPaidNow}>
                  💳 Record as Paid
                </button>

                <button className="btn-ghost" onClick={handleDirectCostSkip}>
                  Skip for now
                </button>
              </div>

              <button className="dc-close" onClick={closeDirectCostPrompt}>
                ✕ Close
              </button>
            </>
          ) : (
            <>
              <p className="dc-subtext">
                Select the bank account that funded this cost and confirm the payment.
              </p>

              {directCostAction && (
                <p className="dc-selection">
                  Current selection: {directCostAction}
                </p>
              )}

              <div className="dc-form">
                <div>
                  <label>Bank account</label>
                  <select
                    value={selectedBankAccountId}
                    onChange={(e) => setSelectedBankAccountId(e.target.value)}
                  >
                    <option value="">Select bank account...</option>
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={String(b.id)}>
                        {b.bank_name || "Bank"} - {b.account_name || "Account"}
                        {b.account_number_masked ? ` (${b.account_number_masked})` : ""}
                        {b.ledger_account_code ? ` - ${b.ledger_account_code}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>Payment date</label>
                  <input
                    type="date"
                    value={directCostPaidDate}
                    onChange={(e) => setDirectCostPaidDate(e.target.value)}
                  />
                </div>

                {loadingBankAccounts && (
                  <p className="dc-loading">Loading bank accounts...</p>
                )}
              </div>

              <div className="dc-actions">
                <button
                  className="btn-primary"
                  onClick={submitDirectCostPaidNow}
                  disabled={loadingBankAccounts || !selectedBankAccountId}
                >
                  ✔ Post payment
                </button>

                <button
                  className="btn-ghost"
                  onClick={() => {
                    setShowPaidCapture(false);
                    setSelectedBankAccountId("");
                    setDirectCostAction(null);
                  }}
                >
                  Back
                </button>
              </div>

              <button className="dc-close" onClick={closeDirectCostPrompt}>
                ✕ Close
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="lease-wizard" data-mode={mode}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>

      {renderDirectCostPrompt()}
    </>
  );
};

export default LeaseWizard;
