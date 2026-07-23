import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  fetchCompanyCoa,
  type CoaAccount,
} from "../api/coa";

import { apiFetch } from "../api/apiFetch";

import {
  createLessorLease,
  generateLessorAccountingSchedule,
  previewLessorClassification,
  previewLessorTerms,
} from "../api/lessorLeases";
import type {
  FinanceLeaseTermsPreview,
  OperatingLeaseTermsPreview,
  LessorClassification,
  LessorClassificationResult,
  LessorLeasePayload,
  LessorTermsPreview,
} from "../api/lessorLeases";

type CustomerRow = {
  id: number;
  name?: string;
  customer_name?: string;
  trading_name?: string;
};

type AssetOption = {
  id: number;

  asset_no?: string;
  asset_name?: string;
  asset_class?: string;

  asset_account_code?: string | null;

  cost_total?: number;
  carrying_amount?: number;
  economic_life_months?: number;

  acquisition_date?: string | null;
  available_for_use_date?: string | null;
};

type AssetOptionsResponse = {
  ok?: boolean;
  data?: AssetOption[];
  items?: AssetOption[];
  rows?: AssetOption[];
  as_at?: string;
};

type WizardStep = 1 | 2 | 3;

type CompanyIndustryProfile = {
  manufacturer_dealer_lessor_capable?: boolean;
};

type CompanyProfile = {
  id: number;
  name?: string;
  industry?: string;
  industry_slug?: string;
  sub_industry?: string;
  sub_industry_slug?: string;
  industry_profile?: CompanyIndustryProfile;
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

function assetName(asset: AssetOption) {
  return (
    asset.asset_name ||
    `Asset ${asset.id}`
  );
}

function assetOptionLabel(
  asset: AssetOption
) {
  const number = asset.asset_no
    ? ` (${asset.asset_no})`
    : "";

  return `${assetName(asset)}${number}`;
}

function money(value?: number | null) {
  return Number(value || 0).toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
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

  const [step, setStep] =
    useState<WizardStep>(1);
    
  const [coaAccounts, setCoaAccounts] =
  useState<CoaAccount[]>([]);

  const [coaLoading, setCoaLoading] =
  useState(false);

  const [coaError, setCoaError] =
  useState("");

  const [companyProfile, setCompanyProfile] =
    useState<CompanyProfile | null>(null);

  const [loadingCompanyProfile, setLoadingCompanyProfile] =
    useState(false);

  const [
    manufacturerDealerSuggested,
    setManufacturerDealerSuggested,
  ] = useState(false);

  const [
    manufacturerDealerConfirmed,
    setManufacturerDealerConfirmed,
  ] = useState(false);

  const [customers, setCustomers] = useState<
    CustomerRow[]
  >([]);

  const [loadingCustomers, setLoadingCustomers] =
    useState(false);

  const [assets, setAssets] =
    useState<AssetOption[]>([]);

  const [loadingAssets, setLoadingAssets] =
    useState(false);

  const [assetsError, setAssetsError] =
    useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const [
    classificationPreview,
    setClassificationPreview,
  ] = useState<
    LessorClassificationResult | null
  >(null);

  const [
    termsPreview,
    setTermsPreview,
  ] = useState<
    LessorTermsPreview | null
  >(null);

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
      underlying_asset_description: "",
      underlying_asset_account_code: null,

      underlying_asset_carrying_amount: 0,
      underlying_asset_fair_value: 0,
      economic_life_months: 0,
      lease_term_months: 0,
      guaranteed_residual_value: 0,
      unguaranteed_residual_value: 0,
      initial_direct_costs: 0,

      interest_rate_implicit: 0,

      ownership_transfers: false,
      purchase_option_reasonably_certain: false,
      specialised_asset: false,

      classification_override: false,
      classification_override_reason: "",

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

      manufacturer_dealer_lessor: false,

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
  let cancelled = false;

  async function loadCoa() {
      setCoaLoading(true);
      setCoaError("");

      try {
      const rows =
          await fetchCompanyCoa(companyId);

      if (!cancelled) {
          setCoaAccounts(rows);
      }
      } catch (error) {
      console.error(
          "[LESSOR] Failed to load COA",
          error
      );

      if (!cancelled) {
          setCoaError(
          "Could not load GL account names."
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

  useEffect(() => {
    let active = true;

    async function loadCompanyProfile() {
      if (!companyId) return;

      try {
        setLoadingCompanyProfile(true);

        const response = await apiFetch(
          `/api/companies/${companyId}`,
          {
            method: "GET",
          }
        ) as CompanyProfile | {
          item?: CompanyProfile;
          data?: CompanyProfile;
        };

        if (!active) return;

        const company =
          "item" in response && response.item
            ? response.item
            : "data" in response && response.data
              ? response.data
              : response as CompanyProfile;

        setCompanyProfile(company);

        const industry = String(
          company.industry || ""
        )
          .trim()
          .toLowerCase();

        const industrySlug = String(
          company.industry_slug || ""
        )
          .trim()
          .toLowerCase();

        const profileFlag = Boolean(
          company.industry_profile
            ?.manufacturer_dealer_lessor_capable
        );

        const fallbackDetected =
          industry === "car dealership" ||
          industry === "manufacturing" ||
          industrySlug === "car_dealership" ||
          industrySlug === "manufacturing";

        const suggested =
          profileFlag || fallbackDetected;

        setManufacturerDealerSuggested(
          suggested
        );

        setManufacturerDealerConfirmed(
          suggested
        );

        setForm((current) => ({
          ...current,
          manufacturer_dealer_lessor:
            suggested,
        }));

        console.log(
          "[LESSOR] company industry detection",
          {
            industry: company.industry,
            industrySlug:
              company.industry_slug,
            profileFlag,
            suggested,
          }
        );
      } catch (err) {
        console.error(
          "[LESSOR] Failed to load company profile",
          err
        );

        if (!active) return;

        setManufacturerDealerSuggested(
          false
        );

        setManufacturerDealerConfirmed(
          false
        );
      } finally {
        if (active) {
          setLoadingCompanyProfile(false);
        }
      }
    }

    loadCompanyProfile();

    return () => {
      active = false;
    };
  }, [companyId]);

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

  useEffect(() => {
    let active = true;

    async function loadAssets() {
      if (!companyId) return;

      try {
        setLoadingAssets(true);
        setAssetsError("");

        const response =
          await apiFetch(
            `/api/companies/${companyId}` +
              `/assets/lease-options` +
              `?status=active&limit=500`,
            {
              method: "GET",
            }
          ) as AssetOptionsResponse;

        if (!active) return;

        const rows =
          response.data ||
          response.items ||
          response.rows ||
          [];

        setAssets(
          rows
            .map((asset) => ({
              ...asset,
              id: Number(asset.id),
              carrying_amount: Number(
                asset.carrying_amount || 0
              ),
              cost_total: Number(
                asset.cost_total || 0
              ),
              economic_life_months: Number(
                asset.economic_life_months || 0
              ),
            }))
            .filter(
              (asset) =>
                Number.isFinite(asset.id) &&
                asset.id > 0
            )
        );
      } catch (err) {
        console.error(
          "[LESSOR] Failed to load assets",
          err
        );

        if (!active) return;

        setAssetsError(
          err instanceof Error
            ? err.message
            : "Failed to load company assets"
        );
      } finally {
        if (active) {
          setLoadingAssets(false);
        }
      }
    }

    loadAssets();

    return () => {
      active = false;
    };
  }, [companyId]);

  const coaByCode = useMemo(() => {
    return new Map(
      coaAccounts.map((account) => [
        String(account.code || "")
          .trim()
          .toUpperCase(),
        account,
      ])
    );
  }, [coaAccounts]);

  function getAccount(
    code?: string | null
  ): CoaAccount | undefined {
    return coaByCode.get(
      String(code || "")
        .trim()
        .toUpperCase()
    );
  }

  function getAccountName(
    code?: string | null
  ): string {
    return (
      getAccount(code)?.name ||
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

  const relevantAccounts = useCallback(
    (
      keywords: string[],
      fallbackSections: string[]
    ) => {
      const exactMatches = coaAccounts.filter(
        (account) => {
          const text = accountText(account);

          return keywords.some((keyword) =>
            text.includes(keyword)
          );
        }
      );

      if (exactMatches.length) {
        return exactMatches;
      }

      return coaAccounts.filter((account) => {
        const text = sectionText(account);

        return fallbackSections.some(
          (section) => text.includes(section)
        );
      });
    },
    [coaAccounts]
  );

  const currentLeaseReceivableAccounts =
    useMemo(
      () =>
        relevantAccounts(
          [
            "lessor_net_investment_current",
            "lease receivable current",
            "current lease receivable",
            "net investment current",
          ],
          ["current asset"]
        ),
      [relevantAccounts]
    );

  const nonCurrentLeaseReceivableAccounts =
    useMemo(
      () =>
        relevantAccounts(
          [
            "lessor_net_investment_noncurrent",
            "lease receivable non-current",
            "lease receivable noncurrent",
            "non-current lease receivable",
            "net investment non-current",
            "net investment noncurrent",
          ],
          ["non-current asset", "noncurrent asset"]
        ),
      [relevantAccounts]
    );

  const leaseIncomeAccounts = useMemo(
    () =>
      relevantAccounts(
        [
          "lessor_lease_income",
          "lease income",
          "rental income",
          "lease revenue",
        ],
        ["income", "revenue"]
      ),
    [relevantAccounts]
  );

  const financeIncomeAccounts = useMemo(
    () =>
      relevantAccounts(
        [
          "lessor_finance_income",
          "finance income",
          "interest income",
        ],
        ["income", "revenue"]
      ),
    [relevantAccounts]
  );

  const accountsReceivableAccounts =
    useMemo(
      () =>
        relevantAccounts(
          [
            "trade receivable",
            "accounts receivable",
            "customer receivable",
            "debtors",
          ],
          ["current asset"]
        ),
      [relevantAccounts]
    );

  const vatOutputAccounts = useMemo(
    () =>
      relevantAccounts(
        [
          "vat output",
          "output vat",
          "vat payable",
          "sales tax payable",
        ],
        ["current liability", "liability"]
      ),
    [relevantAccounts]
  );

  const securityDepositAccounts =
    useMemo(
      () =>
        relevantAccounts(
          [
            "security deposit",
            "deposit liability",
            "customer deposit",
            "refundable deposit",
          ],
          ["current liability", "liability"]
        ),
      [relevantAccounts]
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

  const selectedAsset = useMemo(
    () =>
      assets.find(
        (asset) =>
          asset.id === Number(form.asset_id)
      ) || null,
    [assets, form.asset_id]
  );

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

  function updateCheckbox(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const { name, checked } = event.target;

    setForm((current) => ({
      ...current,
      [name]: checked,
    }));
  }

  function selectAsset(
    event: React.ChangeEvent<HTMLSelectElement>
  ) {
    const assetId = Number(
      event.target.value || 0
    );

    const asset =
      assets.find(
        (row) => row.id === assetId
      ) || null;

    if (!asset) {
      setForm((current) => ({
        ...current,
        asset_id: null,
        underlying_asset_description: "",
        underlying_asset_account_code: null,
        underlying_asset_carrying_amount: 0,
        economic_life_months: 0,
      }));

      return;
    }

    setForm((current) => ({
      ...current,

      asset_id: asset.id,

      underlying_asset_description:
        assetName(asset),

      underlying_asset_account_code:
        asset.asset_account_code || null,

      underlying_asset_carrying_amount:
        Number(
          asset.carrying_amount || 0
        ),

      economic_life_months:
        Number(
          asset.economic_life_months || 0
        ),
    }));
  }

  function validateStep1() {
    if (!form.asset_id) {
      return "Select the underlying asset.";
    }

    if (
      Number(
        form.underlying_asset_carrying_amount || 0
      ) < 0
    ) {
      return "Asset carrying amount cannot be negative.";
    }

    if (
      Number(
        form.underlying_asset_fair_value || 0
      ) <= 0
    ) {
      return "Underlying asset fair value must be greater than zero.";
    }

    if (
      Number(form.lease_term_months || 0) <= 0
    ) {
      return "Lease term must be greater than zero.";
    }

    if (
      Number(form.economic_life_months || 0) <= 0
    ) {
      return "Economic life must be greater than zero.";
    }

    if (
      Number(form.interest_rate_implicit || 0) < 0
    ) {
      return "Implicit interest rate cannot be negative.";
    }

    if (
      form.classification_override &&
      !String(
        form.classification_override_reason || ""
      ).trim()
    ) {
      return "Enter a reason for the classification override.";
    }

    return null;
  }

  function validateStep2() {
    if (!form.contract_name.trim()) {
      return "Contract name is required.";
    }

    if (!form.customer_id) {
      return "Select the customer or lessee.";
    }

    if (!form.start_date) {
      return "Start date is required.";
    }

    if (!form.end_date) {
      return "End date is required.";
    }

    if (form.end_date < form.start_date) {
      return "End date cannot be before start date.";
    }

    if (termMonths <= 0) {
      return "Lease term must be greater than zero.";
    }

    if (
      Number(form.lease_term_months || 0) &&
      termMonths !==
        Number(form.lease_term_months)
    ) {
      return (
        "The agreement dates produce a " +
        `${termMonths}-month term, but Step 1 ` +
        `was classified using ` +
        `${form.lease_term_months} months. ` +
        "Return to Step 1 and update the expected lease term."
      );
    }

    if (
      form.lease_classification ===
        "operating" &&
      Number(form.billing_amount || 0) <= 0
    ) {
      return "Contractual rental must be greater than zero for an operating lease.";
    }

    return null;
  }

  async function handleClassification() {
    const validationError = validateStep1();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setClassificationPreview(null);
      setTermsPreview(null);

      const response =
        await previewLessorClassification(
          companyId,
          {
            asset_id: form.asset_id,

            underlying_asset_description:
              form.underlying_asset_description,

            underlying_asset_account_code:
              form.underlying_asset_account_code,

            underlying_asset_carrying_amount:
              Number(
                form
                  .underlying_asset_carrying_amount ||
                0
              ),

            underlying_asset_fair_value:
              Number(
                form
                  .underlying_asset_fair_value ||
                0
              ),

            economic_life_months:
              Number(
                form.economic_life_months || 0
              ),

            lease_term_months:
              Number(
                form.lease_term_months || 0
              ),

            guaranteed_residual_value:
              Number(
                form.guaranteed_residual_value ||
                0
              ),

            unguaranteed_residual_value:
              Number(
                form.unguaranteed_residual_value ||
                0
              ),

            initial_direct_costs:
              Number(
                form.initial_direct_costs || 0
              ),

            interest_rate_implicit:
              Number(
                form.interest_rate_implicit || 0
              ),

            ownership_transfers:
              Boolean(
                form.ownership_transfers
              ),

            purchase_option_reasonably_certain:
              Boolean(
                form
                  .purchase_option_reasonably_certain
              ),

            specialised_asset:
              Boolean(form.specialised_asset),

            classification_override:
              Boolean(
                form.classification_override
              ),

            classification_override_reason:
              form.classification_override_reason,

            manufacturer_dealer_lessor:
              manufacturerDealerConfirmed,

            lease_classification:
              form.lease_classification,
          }
        );

      setClassificationPreview(
        response.data
      );

      setForm((current) => ({
        ...current,

        lease_classification:
          response.data.classification,

        manufacturer_dealer_lessor:
          manufacturerDealerConfirmed,
      }));

      setStep(2);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Lease classification failed"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAccountingPreview() {
    const validationError =
      validateStep2();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setTermsPreview(null);

      const payload: LessorLeasePayload = {
        ...form,

        lease_term_months: termMonths,

        manufacturer_dealer_lessor:
          manufacturerDealerConfirmed,
      };

      const response =
        await previewLessorTerms(
          companyId,
          payload
        );

      setClassificationPreview(
        response.classification
      );

      setTermsPreview(
        response.terms
      );

      setForm((current) => ({
        ...current,

        lease_classification:
          response.classification
            .classification,

        billing_amount:
          response.terms.classification ===
          "finance"
            ? response.terms.periodic_payment
            : current.billing_amount,
      }));

      setStep(3);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Accounting preview failed"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    const validationError =
      validateStep2();

    if (validationError) {
      setError(validationError);
      return;
    }

    if (!termsPreview) {
      setError(
        "Calculate and review the accounting preview before creating the lease."
      );
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload: LessorLeasePayload = {
        ...form,
        lease_term_months: termMonths,
        manufacturer_dealer_lessor:
          manufacturerDealerConfirmed,
      };

      console.log(
        "[LESSOR] create payload",
        payload
      );

      const response = await createLessorLease(
        companyId,
        payload
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
    setClassificationPreview(null);
    setTermsPreview(null);
    setCreatedLeaseId(null);
    setScheduleResult(null);
    setError(null);
    setStep(1);

    setManufacturerDealerConfirmed(
      manufacturerDealerSuggested
    );

    setForm((current) => ({
      ...current,

      contract_no: "",
      contract_name: "",
      customer_id: null,

      asset_id: null,
      underlying_asset_description: "",
      underlying_asset_account_code: null,
      underlying_asset_carrying_amount: 0,
      underlying_asset_fair_value: 0,

      economic_life_months: 0,
      lease_term_months: 0,

      guaranteed_residual_value: 0,
      unguaranteed_residual_value: 0,
      initial_direct_costs: 0,
      interest_rate_implicit: 0,

      ownership_transfers: false,
      purchase_option_reasonably_certain:
        false,
      specialised_asset: false,

      classification_override: false,
      classification_override_reason: "",

      manufacturer_dealer_lessor:
        manufacturerDealerSuggested,

      start_date: "",
      end_date: "",
      billing_amount: 0,
      security_deposit_amount: 0,
      notes: "",
    }));
  }

  const renderStep1 = () => (
    <div className="lease-step lease-step-1">
      <div className="lessor-step-heading">
        <span className="lessor-step-number">
          Step 1 of 3
        </span>

        <h2>
          Underlying asset and classification
        </h2>

        <p>
          Capture the underlying asset and the IFRS 16
          classification indicators before entering the
          customer agreement.
        </p>
      </div>

      {selectedAccountCode && (
        <div className="lessor-trigger-account">
          <span>Triggering GL account</span>

          <strong>
            {coaLoading
              ? "Loading account…"
              : getAccountName(
                  selectedAccountCode
                )}
          </strong>
        </div>
      )}

      <div className="lessor-step1-layout">
        <aside className="lessor-checklist">
          <div className="lessor-checklist-title">
            Classification indicators
          </div>

          <label
            className={
              "lessor-choice-card " +
              (
                manufacturerDealerConfirmed
                  ? "is-selected"
                  : ""
              )
            }
          >
            <input
              type="checkbox"
              checked={manufacturerDealerConfirmed}
              disabled={loadingCompanyProfile}
              onChange={(event) => {
                const confirmed =
                  event.target.checked;

                setManufacturerDealerConfirmed(
                  confirmed
                );

                setForm((current) => ({
                  ...current,
                  manufacturer_dealer_lessor:
                    confirmed,
                }));
              }}
            />

            <span className="lessor-choice-content">
              <strong>
                Manufacturer or dealer lessor
              </strong>

              <small>
                The leased asset is inventory normally
                manufactured or sold by the company.
              </small>

              {loadingCompanyProfile ? (
                <em>
                  Checking company industry…
                </em>
              ) : manufacturerDealerSuggested ? (
                <em>
                  Suggested because the company industry is{" "}
                  {companyProfile?.industry ||
                    "Car Dealership or Manufacturing"}.
                </em>
              ) : null}
            </span>
          </label>

          <label
            className={
              "lessor-choice-card " +
              (
                form.ownership_transfers
                  ? "is-selected"
                  : ""
              )
            }
          >
            <input
              type="checkbox"
              name="ownership_transfers"
              checked={Boolean(
                form.ownership_transfers
              )}
              onChange={updateCheckbox}
            />

            <span className="lessor-choice-content">
              <strong>
                Ownership transfer
              </strong>

              <small>
                Ownership transfers to the lessee
                by the end of the lease.
              </small>
            </span>
          </label>

          <label
            className={
              "lessor-choice-card " +
              (
                form
                  .purchase_option_reasonably_certain
                  ? "is-selected"
                  : ""
              )
            }
          >
            <input
              type="checkbox"
              name="purchase_option_reasonably_certain"
              checked={Boolean(
                form
                  .purchase_option_reasonably_certain
              )}
              onChange={updateCheckbox}
            />

            <span className="lessor-choice-content">
              <strong>
                Purchase option
              </strong>

              <small>
                The lessee is reasonably certain
                to exercise the purchase option.
              </small>
            </span>
          </label>

          <label
            className={
              "lessor-choice-card " +
              (
                form.specialised_asset
                  ? "is-selected"
                  : ""
              )
            }
          >
            <input
              type="checkbox"
              name="specialised_asset"
              checked={Boolean(
                form.specialised_asset
              )}
              onChange={updateCheckbox}
            />

            <span className="lessor-choice-content">
              <strong>
                Specialised asset
              </strong>

              <small>
                The asset has no readily available
                alternative use without major changes.
              </small>
            </span>
          </label>

          <label
            className={
              "lessor-choice-card " +
              (
                form.classification_override
                  ? "is-selected"
                  : ""
              )
            }
          >
            <input
              type="checkbox"
              name="classification_override"
              checked={Boolean(
                form.classification_override
              )}
              onChange={updateCheckbox}
            />

            <span className="lessor-choice-content">
              <strong>
                Override calculated classification
              </strong>

              <small>
                Use only when documented facts support
                a different classification.
              </small>
            </span>
          </label>
        </aside>

        <div className="lessor-step1-fields">
          <div className="lease-grid-3">
            <div className="field-row field-span-3">
              <label>Underlying asset *</label>

              <select
                value={String(form.asset_id || "")}
                onChange={selectAsset}
                disabled={loadingAssets}
              >
                <option value="">
                  {loadingAssets
                    ? "Loading company assets..."
                    : "Select an asset..."}
                </option>

                {assets.map((asset) => (
                  <option
                    key={asset.id}
                    value={asset.id}
                  >
                    {assetOptionLabel(asset)}
                  </option>
                ))}
              </select>

              {assetsError && (
                <small className="field-error">
                  {assetsError}
                </small>
              )}
            </div>

            {selectedAsset && (
              <div className="lessor-asset-summary field-span-3">
                <div>
                  <span>Asset</span>

                  <strong>
                    {assetName(selectedAsset)}
                  </strong>

                  <small>
                    {selectedAsset.asset_no ||
                      `Asset ${selectedAsset.id}`}
                  </small>
                </div>

                <div>
                  <span>Carrying amount</span>

                  <strong>
                    {Number(
                      selectedAsset.carrying_amount || 0
                    ).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                </div>

                <div>
                  <span>Recorded cost</span>

                  <strong>
                    {Number(
                      selectedAsset.cost_total || 0
                    ).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                </div>

                <div>
                  <span>Economic life</span>

                  <strong>
                    {Number(
                      selectedAsset
                        .economic_life_months || 0
                    ) || "Not set"}
                    {Number(
                      selectedAsset
                        .economic_life_months || 0
                    )
                      ? " months"
                      : ""}
                  </strong>
                </div>

                <div>
                  <span>Asset class</span>

                  <strong>
                    {selectedAsset.asset_class ||
                      "Not specified"}
                  </strong>
                </div>
              </div>
            )}

            <div className="field-row">
              <label>
                Asset carrying amount *
              </label>

              <input
                type="number"
                name="underlying_asset_carrying_amount"
                value={
                  form
                    .underlying_asset_carrying_amount ||
                  0
                }
                readOnly
                step="0.01"
              />
            </div>

            <div className="field-row">
              <label>
                Asset fair value *
              </label>

              <input
                type="number"
                name="underlying_asset_fair_value"
                value={
                  form
                    .underlying_asset_fair_value ||
                  0
                }
                onChange={updateNumber}
                step="0.01"
              />
            </div>

            <div className="field-row">
              <label>
                Expected lease term (months) *
              </label>

              <input
                type="number"
                name="lease_term_months"
                value={
                  form.lease_term_months || 0
                }
                onChange={updateNumber}
                min="1"
              />
            </div>

            <div className="field-row">
              <label>
                Economic life (months) *
              </label>

              <input
                type="number"
                name="economic_life_months"
                value={
                  form.economic_life_months || 0
                }
                onChange={updateNumber}
                min="1"
              />
            </div>

            <div className="field-row">
              <label>
                Guaranteed residual value
              </label>

              <input
                type="number"
                name="guaranteed_residual_value"
                value={
                  form.guaranteed_residual_value ||
                  0
                }
                onChange={updateNumber}
                step="0.01"
              />
            </div>

            <div className="field-row">
              <label>
                Unguaranteed residual value
              </label>

              <input
                type="number"
                name="unguaranteed_residual_value"
                value={
                  form.unguaranteed_residual_value ||
                  0
                }
                onChange={updateNumber}
                step="0.01"
              />
            </div>

            <div className="field-row">
              <label>
                Initial direct costs
              </label>

              <input
                type="number"
                name="initial_direct_costs"
                value={
                  form.initial_direct_costs || 0
                }
                onChange={updateNumber}
                step="0.01"
              />
            </div>

            <div className="field-row">
              <label>
                Interest rate implicit
              </label>

              <input
                type="number"
                name="interest_rate_implicit"
                value={
                  form.interest_rate_implicit || 0
                }
                onChange={updateNumber}
                step="0.0001"
                placeholder="e.g. 0.10"
              />
            </div>

            <div className="field-row">
              <label>
                Payment frequency *
              </label>

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
              <label>
                Payment timing *
              </label>

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

            {form.classification_override && (
              <>
                <div className="field-row">
                  <label>
                    Override classification
                  </label>

                  <select
                    name="lease_classification"
                    value={
                      form.lease_classification
                    }
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

                <div className="field-row field-span-2">
                  <label>
                    Override reason *
                  </label>

                  <textarea
                    name="classification_override_reason"
                    value={
                      form
                        .classification_override_reason ||
                      ""
                    }
                    onChange={updateText}
                    rows={2}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="error">
          {error}
        </div>
      )}

      <div className="wizard-buttons">
        <button
          type="button"
          onClick={handleClassification}
          disabled={loading}
        >
          {loading
            ? "Classifying..."
            : "Calculate classification"}
        </button>
      </div>
    </div>
  );

  if (createdLeaseId) {
    
  return (
      <div
          className="lease-wizard"
          data-role="lessor"
      >
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

  const renderStep3 = () => {
    const operatingPreview =
      termsPreview?.classification === "operating"
        ? termsPreview as OperatingLeaseTermsPreview
        : null;
    const financePreview =
      termsPreview?.classification === "finance"
        ? termsPreview as FinanceLeaseTermsPreview
        : null;

    const initialNetInvestment =
      Number(
        financePreview
          ?.initial_net_investment || 0
      );

    const currentPortion =
      Number(
        financePreview
          ?.current_net_investment || 0
      );

    const nonCurrentPortion =
      Number(
        financePreview
          ?.noncurrent_net_investment || 0
      );

    const pvLeasePayments = Number(
      financePreview?.pv_lease_payments || 0
    );

    const pvGuaranteedResidual = Number(
      financePreview?.pv_guaranteed_residual || 0
    );

    const pvUnguaranteedResidual = Number(
      financePreview?.pv_unguaranteed_residual || 0
    );

    const capitalisedDirectCosts = Number(
      financePreview
        ?.capitalised_initial_direct_costs || 0
    );

    const annualInterestRate = Number(
      financePreview?.annual_interest_rate || 0
    );
    return (
      <div className="lease-step lease-step-2">
        <div className="lessor-step-heading">
          <span className="lessor-step-number">
            Step 3 of 3
          </span>

          <h2>
            Agreement and billing terms
          </h2>

          <p>
            Review the calculated periodic payment
            and lessor accounting schedule before
            entering the customer agreement.
          </p>
        </div>

        {financePreview ? (
          <div className="lessor-finance-preview">
            <div className="lessor-top-grid">
              {classificationPreview && (
                <section className="lessor-top-panel">
                  <div className="lessor-top-panel-head">
                    <h3>IFRS 16 classification</h3>

                    <p>
                      Evidence supporting the lessor
                      classification.
                    </p>
                  </div>

                  <div className="lessor-definition-grid">
                    <div>
                      <span>Classification</span>

                      <strong>
                        {classificationPreview
                          .classification
                          .toUpperCase()}
                      </strong>
                    </div>

                    <div>
                      <span>Lease term ratio</span>

                      <strong>
                        {Number(
                          classificationPreview
                            .lease_term_ratio || 0
                        ).toLocaleString(undefined, {
                          style: "percent",
                          maximumFractionDigits: 2,
                        })}
                      </strong>
                    </div>

                    <div>
                      <span>PV / fair value ratio</span>

                      <strong>
                        {Number(
                          classificationPreview
                            .pv_fair_value_ratio || 0
                        ).toLocaleString(undefined, {
                          style: "percent",
                          maximumFractionDigits: 2,
                        })}
                      </strong>
                    </div>

                    <div>
                      <span>Lessor type</span>

                      <strong>
                        {financePreview
                          .manufacturer_dealer_lessor
                          ? "Manufacturer / dealer"
                          : "Ordinary lessor"}
                      </strong>
                    </div>
                  </div>
                </section>
              )}

              <section className="lessor-top-panel">
                <div className="lessor-top-panel-head">
                  <h3>Lease measurement</h3>

                  <p>
                    Finance lease measurement assumptions.
                  </p>
                </div>

                <div className="lessor-definition-grid">
                  <div>
                    <span>Interest rate</span>

                    <strong>
                      {annualInterestRate.toLocaleString(
                        undefined,
                        {
                          style: "percent",
                          maximumFractionDigits: 4,
                        }
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Lease term</span>

                    <strong>
                      {form.lease_term_months} months
                    </strong>
                  </div>

                  <div>
                    <span>Payment frequency</span>

                    <strong>
                      {String(
                        form.billing_frequency || ""
                      ).replace(/\b\w/g, (letter) =>
                        letter.toUpperCase()
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Payment timing</span>

                    <strong>
                      {form.billing_timing === "advance"
                        ? "In advance"
                        : "In arrears"}
                    </strong>
                  </div>
                </div>
              </section>
            </div>

            <div className="lessor-finance-kpi-grid">
              <div className="lessor-metric-card">
                <span>Periodic payment</span>

                <strong>
                  {money(
                    financePreview.periodic_payment
                  )}
                </strong>

                <small>
                  {form.billing_frequency} ·{" "}
                  {form.billing_timing}
                </small>
              </div>

              <div className="lessor-metric-card">
                <span>Initial net investment</span>

                <strong>
                  {money(
                    financePreview
                      .initial_net_investment
                  )}
                </strong>

                <small>Opening lease receivable</small>
              </div>

              <div className="lessor-metric-card">
                <span>Gross investment</span>

                <strong>
                  {money(
                    financePreview.gross_investment
                  )}
                </strong>

                <small>
                  Undiscounted payments and residuals
                </small>
              </div>

              <div className="lessor-metric-card">
                <span>Unearned finance income</span>

                <strong>
                  {money(
                    financePreview
                      .unearned_finance_income
                  )}
                </strong>

                <small>
                  Recognised over the lease term
                </small>
              </div>
            </div>

            <div className="lessor-preview-grid">
              <section className="lessor-preview-card">
                <div className="lessor-preview-card-head">
                  <div>
                    <h3>
                      Initial net investment calculation
                    </h3>

                    <p>
                      Day-one measurement of the finance
                      lease receivable.
                    </p>
                  </div>
                </div>

                <table className="lessor-mini-table">
                  <tbody>
                    <tr>
                      <td>
                        Present value of lease payments
                      </td>

                      <td>
                        {money(pvLeasePayments)}
                      </td>
                    </tr>

                    <tr>
                      <td>
                        Present value of guaranteed
                        residual
                      </td>

                      <td>
                        {money(pvGuaranteedResidual)}
                      </td>
                    </tr>

                    <tr>
                      <td>
                        Present value of unguaranteed
                        residual
                      </td>

                      <td>
                        {money(pvUnguaranteedResidual)}
                      </td>
                    </tr>

                    <tr>
                      <td>
                        Capitalised initial direct costs
                      </td>

                      <td>
                        {money(capitalisedDirectCosts)}
                      </td>
                    </tr>

                    <tr className="lessor-total-row">
                      <td>Initial net investment</td>

                      <td>
                        {money(
                          financePreview
                            .initial_net_investment
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className="lessor-preview-card">
                <div className="lessor-preview-card-head">
                  <div>
                    <h3>
                      Gross investment reconciliation
                    </h3>

                    <p>
                      Reconciliation of gross investment
                      to the opening net investment.
                    </p>
                  </div>
                </div>

                <table className="lessor-mini-table">
                  <tbody>
                    <tr>
                      <td>Gross investment</td>

                      <td>
                        {money(
                          financePreview.gross_investment
                        )}
                      </td>
                    </tr>

                    <tr>
                      <td>
                        Less: unearned finance income
                      </td>

                      <td>
                        (
                        {money(
                          financePreview
                            .unearned_finance_income
                        )}
                        )
                      </td>
                    </tr>

                    <tr className="lessor-total-row">
                      <td>Initial net investment</td>

                      <td>
                        {money(
                          financePreview
                            .initial_net_investment
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>
            </div>

            <div className="lessor-preview-grid">
              <section className="lessor-preview-card">
                <div className="lessor-preview-card-head">
                  <div>
                    <h3>Opening lease receivable</h3>

                    <p>
                      Current and non-current presentation
                      at commencement.
                    </p>
                  </div>
                </div>

                <table className="lessor-mini-table">
                  <tbody>
                    <tr>
                      <td>Current lease receivable</td>

                      <td>{money(currentPortion)}</td>
                    </tr>

                    <tr>
                      <td>
                        Non-current lease receivable
                      </td>

                      <td>{money(nonCurrentPortion)}</td>
                    </tr>

                    <tr className="lessor-total-row">
                      <td>Total net investment</td>

                      <td>
                        {money(initialNetInvestment)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className="lessor-preview-card">
                <div className="lessor-preview-card-head">
                  <div>
                    <h3>Residual value summary</h3>

                    <p>
                      Contractual residual values included
                      in the finance lease.
                    </p>
                  </div>
                </div>

                <table className="lessor-mini-table">
                  <tbody>
                    <tr>
                      <td>Guaranteed residual value</td>

                      <td>
                        {money(
                          financePreview
                            .guaranteed_residual_value
                        )}
                      </td>
                    </tr>

                    <tr>
                      <td>
                        Unguaranteed residual value
                      </td>

                      <td>
                        {money(
                          financePreview
                            .unguaranteed_residual_value
                        )}
                      </td>
                    </tr>

                    <tr className="lessor-total-row">
                      <td>Total residual value</td>

                      <td>
                        {money(
                          Number(
                            financePreview
                              .guaranteed_residual_value ||
                            0
                          ) +
                          Number(
                            financePreview
                              .unguaranteed_residual_value ||
                            0
                          )
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>
            </div>

            <section className="lessor-preview-card lessor-schedule-card">
              <div className="lessor-preview-card-head">
                <div>
                  <h3>
                    Finance lease net investment
                    amortisation schedule
                  </h3>

                  <p>
                    Effective-interest allocation of each
                    payment between finance income and
                    principal recovery.
                  </p>
                </div>

                <div className="lessor-preview-badge">
                  {financePreview.period_count} periods
                </div>
              </div>

              <div className="table-scroll lessor-schedule-table-wrap">
                <table className="lessor-schedule-table">
                  <colgroup>
                    <col className="lessor-period-col" />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                  </colgroup>

                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Opening balance</th>
                      <th>Payment</th>
                      <th>Finance income</th>
                      <th>Principal</th>
                      <th>Closing balance</th>
                    </tr>
                  </thead>

                  <tbody>
                    {financePreview.schedule.map(
                      (row) => (
                        <tr key={row.period_no}>
                          <td>{row.period_no}</td>

                          <td>
                            {money(
                              row.opening_net_investment
                            )}
                          </td>

                          <td>
                            {money(row.lease_payment)}
                          </td>

                          <td>
                            {money(row.finance_income)}
                          </td>

                          <td>
                            {money(
                              row.principal_reduction
                            )}
                          </td>

                          <td>
                            {money(
                              row.closing_net_investment
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>

                  <tfoot>
                    <tr>
                      <td colSpan={2}>Totals</td>

                      <td>
                        {money(
                          financePreview.schedule.reduce(
                            (total, row) =>
                              total +
                              Number(
                                row.lease_payment || 0
                              ),
                            0
                          )
                        )}
                      </td>

                      <td>
                        {money(
                          financePreview
                            .total_finance_income
                        )}
                      </td>

                      <td>
                        {money(
                          financePreview.schedule.reduce(
                            (total, row) =>
                              total +
                              Number(
                                row
                                  .principal_reduction ||
                                0
                              ),
                            0
                          )
                        )}
                      </td>

                      <td>
                        {money(
                          financePreview.schedule.at(-1)
                            ?.closing_net_investment
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          </div>
        ) : operatingPreview ? (
          <div className="lessor-operating-preview">
            <div className="lessor-top-grid">
              {classificationPreview && (
                <section className="lessor-top-panel">
                  <div className="lessor-top-panel-head">
                    <h3>IFRS 16 classification</h3>
                    <p>
                      Evidence supporting the lessor classification.
                    </p>
                  </div>

                  <div className="lessor-classification-grid">
                    <div className="lessor-classification-card">
                      <span>Classification</span>
                      <strong>OPERATING</strong>
                      <small>
                        Underlying asset remains recognised
                      </small>
                    </div>

                    <div className="lessor-classification-card">
                      <span>Lease term ratio</span>
                      <strong>
                        {Number(
                          classificationPreview.lease_term_ratio || 0
                        ).toLocaleString(undefined, {
                          style: "percent",
                          maximumFractionDigits: 2,
                        })}
                      </strong>
                      <small>
                        Lease term compared with economic life
                      </small>
                    </div>

                    <div className="lessor-classification-card">
                      <span>PV / fair value ratio</span>
                      <strong>
                        {Number(
                          classificationPreview.pv_fair_value_ratio || 0
                        ).toLocaleString(undefined, {
                          style: "percent",
                          maximumFractionDigits: 2,
                        })}
                      </strong>
                      <small>
                        Present value compared with fair value
                      </small>
                    </div>
                  </div>
                </section>
              )}

              <section className="lessor-top-panel">
                <div className="lessor-top-panel-head">
                  <h3>Operating lease measurement</h3>
                  <p>
                    Contractual rent and income recognition.
                  </p>
                </div>

                <div className="lessor-accounting-summary">
                  <div className="lessor-metric-card">
                    <span>Periodic rental</span>
                    <strong>
                      {money(operatingPreview.periodic_rental)}
                    </strong>
                    <small>
                      {operatingPreview.billing_frequency}
                      {" · "}
                      {operatingPreview.billing_timing}
                    </small>
                  </div>

                  <div className="lessor-metric-card">
                    <span>Contractual income</span>
                    <strong>
                      {money(operatingPreview.contractual_income)}
                    </strong>
                    <small>
                      Undiscounted contractual rent
                    </small>
                  </div>

                  <div className="lessor-metric-card">
                    <span>Straight-line income</span>
                    <strong>
                      {money(operatingPreview.straight_line_income)}
                    </strong>
                    <small>
                      Recognised over the lease term
                    </small>
                  </div>

                  <div className="lessor-metric-card">
                    <span>Direct cost expense</span>
                    <strong>
                      {money(
                        operatingPreview.initial_direct_cost_expense
                      )}
                    </strong>
                    <small>
                      Expensed over the lease term
                    </small>
                  </div>
                </div>
              </section>
            </div>

            <div className="lessor-operating-kpi-grid">
              <div className="lessor-metric-card">
                <span>Accrued rental asset</span>
                <strong>
                  {money(operatingPreview.closing_accrued_rent)}
                </strong>
                <small>
                  Closing accrued rental balance
                </small>
              </div>

              <div className="lessor-metric-card">
                <span>Deferred rental liability</span>
                <strong>
                  {money(operatingPreview.closing_deferred_rent)}
                </strong>
                <small>
                  Closing deferred rental balance
                </small>
              </div>

              <div className="lessor-metric-card">
                <span>Net rental balance</span>
                <strong>
                  {money(
                    Number(
                      operatingPreview.closing_accrued_rent || 0
                    ) -
                    Number(
                      operatingPreview.closing_deferred_rent || 0
                    )
                  )}
                </strong>
                <small>
                  Accrued asset less deferred liability
                </small>
              </div>

              <div className="lessor-metric-card">
                <span>Income difference</span>
                <strong>
                  {money(
                    Number(
                      operatingPreview.straight_line_income || 0
                    ) -
                    Number(
                      operatingPreview.contractual_income || 0
                    )
                  )}
                </strong>
                <small>
                  Recognised less contractual income
                </small>
              </div>
            </div>

            <div className="lessor-preview-grid">
              <section className="lessor-preview-card">
                <div className="lessor-preview-card-head">
                  <div>
                    <h3>Rental balances</h3>
                    <p>
                      Closing accrued and deferred balances.
                    </p>
                  </div>
                </div>

                <table className="lessor-mini-table">
                  <tbody>
                    <tr>
                      <td>Closing accrued rental asset</td>
                      <td>
                        {money(
                          operatingPreview.closing_accrued_rent
                        )}
                      </td>
                    </tr>

                    <tr>
                      <td>Closing deferred rental liability</td>
                      <td>
                        {money(
                          operatingPreview.closing_deferred_rent
                        )}
                      </td>
                    </tr>

                    <tr className="lessor-total-row">
                      <td>Net rental balance</td>
                      <td>
                        {money(
                          Number(
                            operatingPreview.closing_accrued_rent ||
                            0
                          ) -
                          Number(
                            operatingPreview.closing_deferred_rent ||
                            0
                          )
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className="lessor-preview-card">
                <div className="lessor-preview-card-head">
                  <div>
                    <h3>Income reconciliation</h3>
                    <p>
                      Contractual rent compared with recognised
                      income.
                    </p>
                  </div>
                </div>

                <table className="lessor-mini-table">
                  <tbody>
                    <tr>
                      <td>Total contractual income</td>
                      <td>
                        {money(
                          operatingPreview.contractual_income
                        )}
                      </td>
                    </tr>

                    <tr>
                      <td>Straight-line lease income</td>
                      <td>
                        {money(
                          operatingPreview.straight_line_income
                        )}
                      </td>
                    </tr>

                    <tr className="lessor-total-row">
                      <td>Income difference</td>
                      <td>
                        {money(
                          Number(
                            operatingPreview.straight_line_income ||
                            0
                          ) -
                          Number(
                            operatingPreview.contractual_income ||
                            0
                          )
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>
            </div>

            <section className="lessor-preview-card lessor-schedule-card">
              <div className="lessor-preview-card-head">
                <div>
                  <h3>Operating lease income schedule</h3>
                  <p>
                    Review contractual rental and straight-line
                    income recognition.
                  </p>
                </div>

                <div className="lessor-preview-badge">
                  {operatingPreview.period_count} periods
                </div>
              </div>

              <div className="table-scroll lessor-schedule-table-wrap">
                <table className="lessor-schedule-table operating">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Contractual rent</th>
                      <th>Straight-line income</th>
                      <th>Direct cost expense</th>
                      <th>Accrued movement</th>
                      <th>Deferred movement</th>
                      <th>Accrued balance</th>
                      <th>Deferred balance</th>
                    </tr>
                  </thead>

                  <tbody>
                    {operatingPreview.schedule.map((row) => (
                      <tr key={row.period_no}>
                        <td>{row.period_no}</td>

                        <td>
                          {money(row.contractual_income)}
                        </td>

                        <td>
                          {money(row.straight_line_income)}
                        </td>

                        <td>
                          {money(
                            row.initial_direct_cost_expense
                          )}
                        </td>

                        <td>
                          {money(row.accrued_rent_movement)}
                        </td>

                        <td>
                          {money(row.deferred_rent_movement)}
                        </td>

                        <td>
                          {money(row.accrued_rent_balance)}
                        </td>

                        <td>
                          {money(row.deferred_rent_balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  <tfoot>
                    <tr>
                      <td>Totals</td>

                      <td>
                        {money(
                          operatingPreview.schedule.reduce(
                            (total, row) =>
                              total +
                              Number(
                                row.contractual_income || 0
                              ),
                            0
                          )
                        )}
                      </td>

                      <td>
                        {money(
                          operatingPreview.straight_line_income
                        )}
                      </td>

                      <td>
                        {money(
                          operatingPreview
                            .initial_direct_cost_expense
                        )}
                      </td>

                      <td colSpan={2} />

                      <td>
                        {money(
                          operatingPreview.closing_accrued_rent
                        )}
                      </td>

                      <td>
                        {money(
                          operatingPreview.closing_deferred_rent
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <div className="lessor-preview-panel">
              <div className="lessor-preview-header">
                Operating lease
              </div>

              <p>{operatingPreview.message}</p>
            </div>
          </div>
          ) : (
            <div className="lessor-preview-panel">
              <div className="lessor-preview-header">
                Preview unavailable
              </div>

              <p>
                No operating or finance calculation is available.
              </p>
            </div>
          )}

          {classificationPreview?.reasons?.length ? (
          <div className="lessor-preview-panel">
            <div className="lessor-preview-header">
              Classification reasons
            </div>

            <ul>
              {classificationPreview.reasons.map(
                (reason, index) => (
                  <li key={index}>
                    {reason}
                  </li>
                )
              )}
            </ul>
          </div>
        ) : null}

        {error && (
          <div className="error">
            {error}
          </div>
        )}

        <div className="wizard-buttons">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep(2);
            }}
            disabled={loading}
          >
            Back to agreement
          </button>

          <button
            type="button"
            onClick={handleCreate}
            disabled={loading}
          >
            {loading
              ? "Creating lease..."
              : "Create lessor lease"}
          </button>
        </div>
      </div>
    );
  };

  const renderStep2 = () => (
    <div className="lease-step lease-step-2">
      <div className="lessor-step-heading">
        <span className="lessor-step-number">
           Step 2 of 3
        </span>

        <h2>
          Agreement and billing terms
        </h2>

        <p>
          Enter the agreement between your company and
          the customer. Creating the lease does not
          create an invoice.
        </p>
      </div>

      {classificationPreview && (
        <div className="lessor-classification-grid">
          <div className="lessor-classification-card">
            <span>Classification</span>
            <strong>
              {classificationPreview.classification.toUpperCase()}
            </strong>
            <small>IFRS 16 lessor classification</small>
          </div>

          <div className="lessor-classification-card">
            <span>Lease term ratio</span>
            <strong>
              {Number(
                classificationPreview.lease_term_ratio || 0
              ).toLocaleString(undefined, {
                style: "percent",
                maximumFractionDigits: 2,
              })}
            </strong>
            <small>Lease term compared with economic life</small>
          </div>

          <div className="lessor-classification-card">
            <span>PV / fair value ratio</span>
            <strong>
              {Number(
                classificationPreview.pv_fair_value_ratio || 0
              ).toLocaleString(undefined, {
                style: "percent",
                maximumFractionDigits: 2,
              })}
            </strong>
            <small>Present value compared with fair value</small>
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

          <input
            value={String(
              form.lease_classification || ""
            )
              .replaceAll("_", " ")
              .replace(/\b\w/g, (letter) =>
                letter.toUpperCase()
              )}
            readOnly
          />
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
          <label>End date *</label>

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
            {form.lease_classification ===
            "operating"
              ? "Contractual rental per period *"
              : "Calculated payment per period"}
          </label>

          <input
            type="number"
            name="billing_amount"
            value={form.billing_amount}
            onChange={updateNumber}
            readOnly={
              form.lease_classification ===
              "finance"
            }
            min="0"
            step="0.01"
            placeholder={
              form.lease_classification ===
              "operating"
                ? "Enter contractual rental"
                : "Calculated in the next step"
            }
          />

          <small className="field-help">
            {form.lease_classification === "operating"
              ? "Enter the rental agreed with the customer. FinSage will use it to confirm the final classification and prepare the operating lease income schedule."
              : "FinSage will calculate the finance lease payment from the net investment, interest rate, term and residual values."}
          </small>

          <small className="field-help">
            This classification is provisional. FinSage will
            confirm it after considering the contractual
            payments in the accounting preview.
          </small>
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
              disabled
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
              disabled
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
            min="0"
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
          FinSage has selected relevant company
          accounts for lessor accounting. You can
          override them below.
        </div>

        {coaError && (
          <div className="error">
            {coaError}
          </div>
        )}

        <div className="lease-grid-3 advanced-gl-grid">
          <div className="field-row">
            <label>
              Lease receivable – current
            </label>

            <select
              name="net_investment_current_account_code"
              value={
                form
                  .net_investment_current_account_code ||
                ""
              }
              onChange={updateText}
              disabled={coaLoading}
            >
              <option value="">
                {coaLoading
                  ? "Loading accounts..."
                  : "Select current lease receivable..."}
              </option>

              {renderAccountOptions(
                currentLeaseReceivableAccounts
              )}
            </select>
          </div>

          <div className="field-row">
            <label>
              Lease receivable – non-current
            </label>

            <select
              name="net_investment_noncurrent_account_code"
              value={
                form
                  .net_investment_noncurrent_account_code ||
                ""
              }
              onChange={updateText}
              disabled={coaLoading}
            >
              <option value="">
                {coaLoading
                  ? "Loading accounts..."
                  : "Select non-current lease receivable..."}
              </option>

              {renderAccountOptions(
                nonCurrentLeaseReceivableAccounts
              )}
            </select>
          </div>

          <div className="field-row">
            <label>Lease income</label>

            <select
              name="revenue_account_code"
              value={
                form.revenue_account_code || ""
              }
              onChange={updateText}
              disabled={coaLoading}
            >
              <option value="">
                {coaLoading
                  ? "Loading accounts..."
                  : "Select lease income account..."}
              </option>

              {renderAccountOptions(
                leaseIncomeAccounts
              )}
            </select>
          </div>

          <div className="field-row">
            <label>Finance income</label>

            <select
              name="finance_income_account_code"
              value={
                form
                  .finance_income_account_code ||
                ""
              }
              onChange={updateText}
              disabled={coaLoading}
            >
              <option value="">
                {coaLoading
                  ? "Loading accounts..."
                  : "Select finance income account..."}
              </option>

              {renderAccountOptions(
                financeIncomeAccounts
              )}
            </select>
          </div>

          <div className="field-row">
            <label>Accounts receivable</label>

            <select
              name="ar_account_code"
              value={
                form.ar_account_code || ""
              }
              onChange={updateText}
              disabled={coaLoading}
            >
              <option value="">
                {coaLoading
                  ? "Loading accounts..."
                  : "Select accounts receivable..."}
              </option>

              {renderAccountOptions(
                accountsReceivableAccounts
              )}
            </select>
          </div>

          <div className="field-row">
            <label>VAT output</label>

            <select
              name="vat_output_account_code"
              value={
                form
                  .vat_output_account_code ||
                ""
              }
              onChange={updateText}
              disabled={coaLoading}
            >
              <option value="">
                {coaLoading
                  ? "Loading accounts..."
                  : "Select VAT output account..."}
              </option>

              {renderAccountOptions(
                vatOutputAccounts
              )}
            </select>
          </div>

          <div className="field-row">
            <label>
              Security deposit account
            </label>

            <select
              name="security_deposit_account_code"
              value={
                form
                  .security_deposit_account_code ||
                ""
              }
              onChange={updateText}
              disabled={coaLoading}
            >
              <option value="">
                {coaLoading
                  ? "Loading accounts..."
                  : "Select deposit liability account..."}
              </option>

              {renderAccountOptions(
                securityDepositAccounts
              )}
            </select>
          </div>
        </div>
      </details>

      {classificationPreview && (
        <div className="lessor-preview-panel">
          <div className="lessor-preview-header">
            Classification assessment
          </div>

          {classificationPreview.reasons?.length ? (
            <div className="lessor-preview-section">
              <strong>Reasons</strong>

              <ul>
                {classificationPreview.reasons.map(
                  (reason: string, index: number) => (
                    <li key={index}>
                      {reason}
                    </li>
                  )
                )}
              </ul>
            </div>
          ) : null}

          {classificationPreview.warnings?.length ? (
            <div className="lessor-preview-section warning">
              <strong>Items to review</strong>

              <ul>
                {classificationPreview.warnings.map(
                  (warning: string, index: number) => (
                    <li key={index}>
                      {warning}
                    </li>
                  )
                )}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {error && (
        <div className="error">
          {error}
        </div>
      )}

      <div className="wizard-buttons">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setStep(1);
          }}
          disabled={loading}
        >
          Back
        </button>

        <button
          type="button"
          onClick={handleAccountingPreview}
          disabled={loading}
        >
          {loading
            ? "Calculating..."
            : "Calculate accounting preview"}
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="lease-wizard"
      data-role="lessor"
      data-step={step}
    >
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
    </div>
  );
};

export default LessorLeaseWizard;