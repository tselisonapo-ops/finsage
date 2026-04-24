import { useEffect, useMemo, useState } from "react";
import DrawerShell from "./DrawerShell";

export type FixedAssetsDrawerMode = "acquire" | "dispose";

/** -----------------------------
 *  Typed globals
 *  ----------------------------- */
type ApiFetch = (url: string, opts?: RequestInit) => Promise<unknown>;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function readPostingDateFromArgs(args: FixedAssetsDrawerOpenArgs | null): string {
  const d = args?.defaults || {};
  const ctx = (window as unknown as {
    __FS_POSTING_CONTEXT__?: {
      posting_date?: string;
      postingDate?: string;
      date?: string;
    };
  }).__FS_POSTING_CONTEXT__;

  return String(
    d.posting_date ||
    d.postingDate ||
    d.date ||
    d.acquisitionDate ||
    ctx?.posting_date ||
    ctx?.postingDate ||
    ctx?.date ||
    ""
  ).trim();
}

function readJournalRefFromArgs(args: FixedAssetsDrawerOpenArgs | null): string {
  const d = args?.defaults || {};
  return String(
    d.reference ||
    (window as unknown as { __FS_POSTING_CONTEXT__?: { journal_ref?: string } })
      .__FS_POSTING_CONTEXT__?.journal_ref ||
    ""
  ).trim();
}

function getApiFetch(): ApiFetch | undefined {
  return (window as unknown as { apiFetch?: ApiFetch }).apiFetch;
}

type Endpoints = {
  coa?: { list?: (cid: number | string) => string };
  assets?: { create?: (cid: number | string) => string };
  vendors?: { list?: (cid: number | string, q?: { limit?: number; offset?: number; q?: string }) => string };
  banks?: { list?: (cid: number | string, q?: { limit?: number; offset?: number }) => string };
};

const ENDPOINTS = (window as unknown as { ENDPOINTS?: Endpoints }).ENDPOINTS;

/** -----------------------------
 *  Public args/result
 *  ----------------------------- */
export type FixedAssetsDrawerOpenArgs = {
  companyId: number | string;
  mode: FixedAssetsDrawerMode;
  companyName?: string;
  accountCode?: string;
  accountName?: string;
  assetId?: number | string;
  defaults?: Record<string, unknown>;
};

export type FixedAssetsDrawerResult =
  | { action: "close" }
  | { action: "select_asset"; assetId: number | string }
  | { action: "create_asset"; assetId: number | string };

type Props = {
  open: boolean;
  args: FixedAssetsDrawerOpenArgs | null;
  onClose: () => void;
  onResolve: (res: FixedAssetsDrawerResult) => void;
};

/** -----------------------------
 *  Types
 *  ----------------------------- */
type Vendor = { id: number | string; name?: string; vendor_name?: string };
type BankAccount = {
  id: number | string;
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  ledger_account_code?: string | null; // ✅ used for posting
};

type FundingSource = "cash" | "bank" | "grni" | "vendor_credit" | "other";
type SourceDocType = "invoice" | "grn";
type JournalLine = { account_code: string; account_name?: string; debit: number; credit: number; memo?: string };
type UopUsageMode = "DELTA" | "READING";

type AssetEntryMode = "acquisition" | "opening_balance";


type CoaRow = {
  code: string;
  name?: string;
  account_name?: string;

  category?: string;
  section?: string;
  cf_bucket?: string;
  cf_section?: string;

  description?: string;
  posting?: boolean;
  posting_rules?: string;
  standard?: string;

  type?: string;
  group?: string;
  statement?: string;
};

type DepreciationMethod = "SL" | "RB" | "UOP";

type CreateAssetPayload = {
  entry_mode?: AssetEntryMode;
  posting_date?: string | null;
  reference?: string | null;

  asset_code: string;
  asset_name: string;
  asset_class: string;
  category?: string | null;

  location?: string | null;
  serial_no?: string | null;
  notes?: string | null;

  acquisition_date: string;
  available_for_use_date?: string | null;

  cost: number;
  residual_value: number;

  opening_as_at?: string | null;
  opening_cost?: number | null;
  opening_accum_dep?: number | null;
  opening_impairment?: number | null;

  depreciation_method: DepreciationMethod;
  useful_life_months: number;

  rb_rate_percent?: number | null;
  uop_usage_mode?: UopUsageMode | null;
  uop_opening_reading?: number | null;
  uop_total_units?: number | null;
  uop_unit_name?: string | null;

  asset_account_code?: string | null;
  accum_dep_account_code?: string | null;
  dep_expense_account_code?: string | null;
  disposal_gain_account_code?: string | null;
  disposal_loss_account_code?: string | null;

  bank_account_id?: number | string | null;
  funding_source?: FundingSource;
  supplier_id?: number | string | null;
  vendor_invoice_no?: string | null;
  grn_no?: string | null;
  other_credit_account_code?: string | null;
};

/** -----------------------------
 *  URL builders (pure)
 *  ----------------------------- */
function assetsCreateUrl(companyId: number | string): string {
  if (ENDPOINTS?.assets?.create) return ENDPOINTS.assets.create(companyId);
  return `/api/companies/${encodeURIComponent(String(companyId))}/assets`;
}

function coaListUrl(companyId: number | string): string {
  if (ENDPOINTS?.coa?.list) return ENDPOINTS.coa.list(companyId);
  return `/api/companies/${encodeURIComponent(String(companyId))}/coa`;
}

function vendorsUrl(companyId: number | string): string {
  if (ENDPOINTS?.vendors?.list) return ENDPOINTS.vendors.list(companyId, { limit: 500, offset: 0, q: "" });
  return `/api/companies/${encodeURIComponent(String(companyId))}/vendors?limit=500&offset=0`;
}

function banksUrl(companyId: number | string): string {
  if (ENDPOINTS?.banks?.list) return ENDPOINTS.banks.list(companyId, { limit: 500, offset: 0 });
  return `/api/companies/${encodeURIComponent(String(companyId))}/bank_accounts?limit=500&offset=0`;
}

function assetAcqCreateUrl(companyId: number | string, assetId: number | string): string {
  return `/api/companies/${encodeURIComponent(String(companyId))}/assets/${encodeURIComponent(String(assetId))}/acquisitions`;
}

function assetAcqPostUrl(companyId: number | string, acqId: number | string): string {
  return `/api/companies/${encodeURIComponent(String(companyId))}/asset-acquisitions/${encodeURIComponent(String(acqId))}/post`;
}

function assetAcqPreviewUrl(companyId: number | string, acqId: number | string): string {
  return `/api/companies/${encodeURIComponent(String(companyId))}/asset-acquisitions/${encodeURIComponent(String(acqId))}/journal-preview`;
}

async function handoffToApBillFromAcquisition(
  companyId: number | string,
  assetId: number | string,
  acquisitionId: number | string
) {
  sessionStorage.setItem(
    "fs_ap_asset_bill_prefill",
    JSON.stringify({
      company_id: Number(companyId),
      asset_id: Number(assetId),
      acquisition_id: Number(acquisitionId),
      ts: Date.now(),
    })
  );

  const w = window as unknown as {
    navigateTo?: (name: string) => void;
    switchScreen?: (name: string) => Promise<void> | void;
  };

  if (typeof w.navigateTo === "function") {
    w.navigateTo("ap");
    return;
  }

  if (typeof w.switchScreen === "function") {
    await w.switchScreen("ap");
    return;
  }

  console.warn("AP screen navigation function not found");
}

/** -----------------------------
 *  Helpers
 *  ----------------------------- */
function toNum(v: string): number {
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function isContraAccount(a: CoaRow): boolean {
  const name = String(a.name || a.account_name || "").toLowerCase();
  const category = String(a.category || "").toLowerCase();
  const code = String(a.code || "").toUpperCase();

  return (
    name.includes("accumulated depreciation") ||
    name.includes("accumulated amortization") ||
    name.includes("allowance") ||
    category.includes("accumulated depreciation") ||
    code.includes("_ACCUM_")
  );
}

function isNcaCostAccount(a: CoaRow): boolean {
  const code = String(a.code || "").toUpperCase();
  const section = String(a.section || "").toLowerCase();
  const cfBucket = String(a.cf_bucket || "").toLowerCase();

  if (section && !section.includes("asset")) return false;

  const isNca = code.startsWith("BS_NCA_") || ["ppe", "rou_asset", "investment_property", "intangible"].includes(cfBucket);
  if (!isNca) return false;
  if (isContraAccount(a)) return false;

  return true;
}

function pickContraForAsset(assetAcctCode: string, allAccounts: CoaRow[]): string {
  const asset = allAccounts.find((a) => a.code === assetAcctCode);
  const assetName = String(asset?.name || asset?.account_name || "").toLowerCase();

  const contraCandidates = allAccounts.filter(isContraAccount);

  const findBy = (kw: string) =>
    contraCandidates.find((c) => String(c.name || c.account_name || "").toLowerCase().includes(kw))?.code || "";

  if (assetName.includes("intangible")) return findBy("amortization") || findBy("intangibles") || "";
  if (assetName.includes("building")) return findBy("buildings") || findBy("building") || "";
  if (assetName.includes("right-of-use") || assetName.includes("right of use") || assetName.includes("rou"))
    return findBy("right-of-use") || findBy("rou") || "";
  if (assetName.includes("vehicle") || assetName.includes("motor")) return findBy("vehicle") || findBy("equipment") || "";

  return findBy("equipment") || "";
}

function getAccountName(code: string, all: CoaRow[]): string {
  const acc = all.find((a) => a.code === code);
  return acc ? (acc.name || acc.account_name || code) : code;
}

/** For safe parsing of API shapes (no any) */
type CoaListResponse = { rows?: CoaRow[]; data?: CoaRow[]; accounts?: CoaRow[] };
type VendorsResponse = { vendors?: Vendor[]; rows?: Vendor[]; data?: Vendor[] };
type BanksResponse = { banks?: BankAccount[]; rows?: BankAccount[]; data?: BankAccount[] };

export default function FixedAssetsDrawer({ open, args, onClose, onResolve }: Props) {
  const title = useMemo(() => {
    if (!args) return "Fixed Assets";
    return args.mode === "acquire" ? "Fixed Assets • Acquire / Add" : "Fixed Assets • Dispose / Impair";
  }, [args]);

  const [err, setErr] = useState<string>("");

  // COA
  const [coaNca, setCoaNca] = useState<CoaRow[]>([]);
  const [coaAll, setCoaAll] = useState<CoaRow[]>([]);
  const [coaLoading, setCoaLoading] = useState(false);

  // Conditional lists
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [banksLoading, setBanksLoading] = useState(false);

  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [selectedBankId, setSelectedBankId] = useState<string>("");

  const [fundingSource, setFundingSource] = useState<FundingSource>("bank");
  const [sourceDocType, setSourceDocType] = useState<SourceDocType>("invoice");
  const [sourceDocRef, setSourceDocRef] = useState<string>("");
  const [showSourceDocNote, setShowSourceDocNote] = useState(false);

  const [otherCreditAccountCode, setOtherCreditAccountCode] = useState("");

  // Entry mode
  const [entryMode, setEntryMode] = useState<AssetEntryMode>("acquisition");
  const isOpeningBalance = entryMode === "opening_balance";

  // 2-step flow
  const [step, setStep] = useState<1 | 2>(1);
  const [createdAssetId, setCreatedAssetId] = useState<string>("");
  const [createdAcqId, setCreatedAcqId] = useState<string>("");

  // Preview
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewLines, setPreviewLines] = useState<JournalLine[]>([]);
  const [previewMeta, setPreviewMeta] = useState<{ ref?: string; description?: string; total_debit?: number; total_credit?: number } | null>(null);

  // Buttons
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  const [form, setForm] = useState<CreateAssetPayload>(() => ({
    entry_mode: "acquisition",

    asset_code: "",
    asset_name: "",
    asset_class: "",
    category: "",

    location: "",
    serial_no: "",
    notes: "",

    acquisition_date: new Date().toISOString().slice(0, 10),
    available_for_use_date: "",

    cost: 0,
    residual_value: 0,

    opening_as_at: "",
    opening_cost: null,
    opening_accum_dep: null,
    opening_impairment: null,

    depreciation_method: "SL",
    useful_life_months: 60,

    rb_rate_percent: null,
    uop_usage_mode: "DELTA",
    uop_opening_reading: null,
    uop_total_units: null,
    uop_unit_name: "",

    asset_account_code: "",
    accum_dep_account_code: "",
    dep_expense_account_code: "",
    disposal_gain_account_code: "",
    disposal_loss_account_code: "",
  }));

  const carryingAmount = useMemo(() => {
    const cost = Number(form.cost || 0);
    const accum = Number(form.opening_accum_dep || 0);
    const impairment = Number(form.opening_impairment || 0);
    return Math.max(0, cost - accum - impairment);
  }, [form.cost, form.opening_accum_dep, form.opening_impairment]);

  /** -----------------------------
   *  Build acquisition payload
   *  ----------------------------- */
  function buildAcqPayload(assetId: number | string) {
    const amount = Number(form.cost || 0);
    const postingDate = String(
      form.posting_date || readPostingDateFromArgs(args) || form.acquisition_date || ""
    ).trim();
    const journalRef = readJournalRefFromArgs(args);

    if (!postingDate) throw new Error("Posting date is required.");

    const funding =
      fundingSource === "bank" || fundingSource === "cash"
        ? "bank_cash"
        : fundingSource === "vendor_credit"
          ? "vendor_credit"
          : fundingSource === "grni"
            ? "grni"
            : "other";

    const payload: Record<string, unknown> = {
      acquisition_date: form.acquisition_date,
      posting_date: postingDate,
      amount,
      funding_source: funding,
      reference: sourceDocRef?.trim() || journalRef || `ASSET-${String(assetId)}`,
      notes: form.notes?.trim() || null,
      status: "draft",
    };

    if (funding === "bank_cash") {
      if (!selectedBankId) throw new Error("Select a bank account.");
      payload.bank_account_id = selectedBankId;

      const bank = banks.find((b) => String(b.id) === String(selectedBankId));
      const bankCode = String(bank?.ledger_account_code || "").trim();
      if (bankCode) payload.bank_account_code = bankCode;
    }

    if (funding === "vendor_credit") {
      payload.supplier_id = selectedVendorId;
      payload.vendor_invoice_no = sourceDocRef.trim();
    }

    if (funding === "grni") {
      payload.supplier_id = selectedVendorId;
      payload.grn_no = sourceDocRef.trim();
    }

    if (funding === "other") {
      const c = otherCreditAccountCode.trim();
      if (!c) throw new Error("Credit account code is required for Other.");
      payload.credit_account_code = c;
    }

    return payload;
  }

  /** -----------------------------
   *  Load COA (and reset workflow when opening)
   *  ----------------------------- */
  useEffect(() => {
    if (!open || !args) return;

    // reset step flow on each open
    setStep(1);
    setCreatedAssetId("");
    setCreatedAcqId("");
    setPreviewLines([]);
    setPreviewMeta(null);
    setPosting(false);
    setSaving(false);
    setErr("");

    const apiFetchFn = getApiFetch();
    if (!apiFetchFn) {
      setErr("window.apiFetch is not available in this React app.");
      return;
    }

    (async () => {
      try {
        setCoaLoading(true);
        const res = await apiFetchFn(coaListUrl(args.companyId), { method: "GET" });

        const list: CoaRow[] = Array.isArray(res)
          ? (res as CoaRow[])
          : ((res as CoaListResponse)?.rows ?? (res as CoaListResponse)?.data ?? (res as CoaListResponse)?.accounts ?? []);

        setCoaAll(list);
        setCoaNca(list.filter(isNcaCostAccount));
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Failed to load COA");
      } finally {
        setCoaLoading(false);
      }
    })();
  }, [open, args]);

  useEffect(() => {
    if (!open || !args) return;

    const postingDate = readPostingDateFromArgs(args);
    const defaults = args.defaults || {};

    setEntryMode("acquisition");
    setSelectedVendorId("");
    setSelectedBankId("");
    setFundingSource("bank");
    setSourceDocType("invoice");
    setSourceDocRef("");
    setOtherCreditAccountCode("");
    setShowSourceDocNote(false);

    setForm({
      entry_mode: "acquisition",
      posting_date: String(defaults.posting_date || defaults.postingDate || postingDate || ""),

      asset_code: String(defaults.assetCode || ""),
      asset_name: String(defaults.assetName || ""),
      asset_class: String(defaults.assetClass || ""),
      category: String(defaults.category || ""),
      location: String(defaults.location || ""),
      serial_no: String(defaults.serialNo || ""),
      notes: String(defaults.notes || ""),
      acquisition_date: String(defaults.acquisitionDate || postingDate || todayIso()),
      available_for_use_date: String(defaults.availableForUseDate || ""),
      cost: Number(defaults.cost || 0),
      residual_value: Number(defaults.residualValue || 0),

      opening_as_at: String(defaults.openingAsAt || postingDate || ""),
      opening_cost: defaults.openingCost == null ? null : Number(defaults.openingCost),
      opening_accum_dep: defaults.openingAccumDep == null ? null : Number(defaults.openingAccumDep),
      opening_impairment: defaults.openingImpairment == null ? null : Number(defaults.openingImpairment),

      depreciation_method: (String(defaults.depreciationMethod || "SL") as DepreciationMethod),
      useful_life_months: Number(defaults.usefulLifeMonths || 60),
      rb_rate_percent: defaults.rbRatePercent == null ? null : Number(defaults.rbRatePercent),
      uop_usage_mode: ((defaults.uopUsageMode as UopUsageMode) || "DELTA"),
      uop_opening_reading: defaults.uopOpeningReading == null ? null : Number(defaults.uopOpeningReading),
      uop_total_units: defaults.uopTotalUnits == null ? null : Number(defaults.uopTotalUnits),
      uop_unit_name: String(defaults.uopUnitName || ""),

      asset_account_code: String(args.accountCode || defaults.asset_account_code || ""),
      accum_dep_account_code: String(defaults.accum_dep_account_code || ""),
      dep_expense_account_code: String(defaults.dep_expense_account_code || ""),
      disposal_gain_account_code: String(defaults.disposal_gain_account_code || ""),
      disposal_loss_account_code: String(defaults.disposal_loss_account_code || ""),
    });
  }, [open, args]);
  /** -----------------------------
   *  Lazy-load vendors / banks
   *  ----------------------------- */
  useEffect(() => {
    if (!open || !args) return;

    const apiFetchFn = getApiFetch();
    if (!apiFetchFn) return;

    const companyId = args.companyId;

    if ((fundingSource === "vendor_credit" || fundingSource === "grni") && vendors.length === 0 && !vendorsLoading) {
      (async () => {
        try {
          setVendorsLoading(true);
          const res = await apiFetchFn(vendorsUrl(companyId), { method: "GET" });

          const wrapped = res as Partial<VendorsResponse>;
          const list: Vendor[] = Array.isArray(res) ? (res as Vendor[]) : (wrapped.vendors ?? wrapped.rows ?? wrapped.data ?? []);

          setVendors(list);
        } catch (e: unknown) {
          setErr(e instanceof Error ? e.message : "Failed to load vendors");
        } finally {
          setVendorsLoading(false);
        }
      })();
    }

    if ((fundingSource === "bank" || fundingSource === "cash") && banks.length === 0 && !banksLoading) {
      (async () => {
        try {
          setBanksLoading(true);
          const res = await apiFetchFn(banksUrl(companyId), { method: "GET" });

          const wrapped = res as Partial<BanksResponse>;
          const list: BankAccount[] = Array.isArray(res) ? (res as BankAccount[]) : (wrapped.banks ?? wrapped.rows ?? wrapped.data ?? []);

          setBanks(list);
        } catch (e: unknown) {
          setErr(e instanceof Error ? e.message : "Failed to load bank accounts");
        } finally {
          setBanksLoading(false);
        }
      })();
    }
  }, [open, args, fundingSource, vendors.length, banks.length, vendorsLoading, banksLoading]);

  async function loadJournalPreview(companyId: string, acqId: string) {
    const apiFetchFn = getApiFetch();
    if (!apiFetchFn) return;

    setPreviewLoading(true);
    try {
      const res = await apiFetchFn(assetAcqPreviewUrl(companyId, acqId), { method: "GET" });

      const out = res as {
        ok?: boolean;
        ref?: string;
        description?: string;
        total_debit?: number;
        total_credit?: number;
        lines?: JournalLine[];
        data?: { lines?: JournalLine[]; ref?: string; description?: string; total_debit?: number; total_credit?: number };
      };

      const lines = out.lines ?? out.data?.lines ?? [];
      setPreviewLines(Array.isArray(lines) ? lines : []);
      setPreviewMeta({
        ref: out.ref ?? out.data?.ref,
        description: out.description ?? out.data?.description,
        total_debit: out.total_debit ?? out.data?.total_debit,
        total_credit: out.total_credit ?? out.data?.total_credit,
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load journal preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function submitCreateDraft() {
    const apiFetchFn = getApiFetch();
    if (!apiFetchFn) return setErr("window.apiFetch is not available.");
    if (!args) return setErr("Drawer args missing.");

    setErr("");

    if (createdAssetId || createdAcqId) {
      return setErr(
        "This draft was already created. To change amount, depreciation, or asset details safely, add an update-draft endpoint or discard this draft and create a new one."
      );
    }
    if (!form.asset_code.trim()) return setErr("Asset code is required.");
    if (!form.asset_name.trim()) return setErr("Asset name is required.");
    if (!form.asset_class.trim()) return setErr("Asset class is required.");
    if (!form.acquisition_date) return setErr("Acquisition date is required.");

    const resolvedPostingDate =
      String(form.posting_date || readPostingDateFromArgs(args) || form.acquisition_date || "").trim();

    if (!resolvedPostingDate) {
      return setErr("Posting date is required before creating acquisition draft.");
    }

    if (Number(form.cost) <= 0) {
      return setErr(isOpeningBalance ? "Historical cost must be greater than 0." : "Cost must be greater than 0.");
    }

    if (isOpeningBalance) {
      if (!String(form.opening_as_at || "").trim()) return setErr("Opening as at is required.");
      if (Number(form.opening_accum_dep || 0) < 0) return setErr("Accumulated depreciation cannot be negative.");
      if (Number(form.opening_impairment || 0) < 0) return setErr("Opening impairment cannot be negative.");
      if (Number(form.opening_accum_dep || 0) > Number(form.cost || 0)) {
        return setErr("Accumulated depreciation cannot exceed historical cost.");
      }
    } else {
      if ((fundingSource === "vendor_credit" || fundingSource === "grni") && !selectedVendorId) {
        return setErr("Select a vendor.");
      }

      if ((fundingSource === "vendor_credit" || fundingSource === "grni") && !sourceDocRef.trim()) {
        return setErr(fundingSource === "vendor_credit" ? "Invoice number is required." : "GRN / receipt reference is required.");
      }

      if ((fundingSource === "bank" || fundingSource === "cash") && !selectedBankId) {
        return setErr("Select a bank account.");
      }

      if (fundingSource === "other" && !otherCreditAccountCode.trim()) {
        return setErr("Credit account code is required for Other.");
      }
    }

    setSaving(true);

    try {
      const companyId = args.companyId;
      const journalRef = readJournalRefFromArgs(args);

      const payload: CreateAssetPayload = {
        ...form,
        entry_mode: entryMode,
        posting_date: resolvedPostingDate,
        reference: journalRef || null,
        category: form.category?.trim() ? form.category.trim() : null,
        location: form.location?.trim() ? form.location.trim() : null,
        serial_no: form.serial_no?.trim() ? form.serial_no.trim() : null,
        notes: form.notes?.trim() ? form.notes.trim() : null,
        available_for_use_date: form.available_for_use_date?.trim() ? form.available_for_use_date.trim() : null,

        opening_as_at: isOpeningBalance ? (form.opening_as_at?.trim() || null) : null,
        opening_cost: isOpeningBalance ? Number(form.opening_cost ?? form.cost ?? 0) : null,
        opening_accum_dep: isOpeningBalance ? Number(form.opening_accum_dep ?? 0) : null,
        opening_impairment: isOpeningBalance ? Number(form.opening_impairment ?? 0) : null,

        funding_source: !isOpeningBalance ? fundingSource : undefined,
        supplier_id: !isOpeningBalance && (fundingSource === "vendor_credit" || fundingSource === "grni") ? (selectedVendorId || null) : null,
        vendor_invoice_no: !isOpeningBalance && fundingSource === "vendor_credit" ? sourceDocRef.trim() : null,
        grn_no: !isOpeningBalance && fundingSource === "grni" ? sourceDocRef.trim() : null,
        bank_account_id: !isOpeningBalance && (fundingSource === "bank" || fundingSource === "cash") ? (selectedBankId || null) : null,
        other_credit_account_code: !isOpeningBalance && fundingSource === "other" ? otherCreditAccountCode.trim() : null,
      };

      const res = await apiFetchFn(assetsCreateUrl(companyId), {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const created = res as {
        id?: number | string;
        asset_id?: number | string;
        opening_journal_id?: number | string;
        data?: { id?: number | string; asset_id?: number | string; opening_journal_id?: number | string };
      };

      const assetId = created.id ?? created.asset_id ?? created.data?.id ?? created.data?.asset_id;
      if (assetId == null) throw new Error("Asset created but response did not include id.");

      if (isOpeningBalance) {
        onResolve({ action: "create_asset", assetId });
        onClose();
        return;
      }

      const acqPayload = buildAcqPayload(assetId);
      const acqRes = await apiFetchFn(assetAcqCreateUrl(companyId, assetId), {
        method: "POST",
        body: JSON.stringify(acqPayload),
      });

      const acq = acqRes as { id?: number | string; data?: { id?: number | string } };
      const acqId = acq.id ?? acq.data?.id;
      if (acqId == null) throw new Error("Acquisition created but response did not include id.");

      setCreatedAssetId(String(assetId));
      setCreatedAcqId(String(acqId));
      setStep(2);

      await loadJournalPreview(String(companyId), String(acqId));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create asset");
    } finally {
      setSaving(false);
    }
  }

  async function submitPostDraft() {
    const apiFetchFn = getApiFetch();
    if (!apiFetchFn) return setErr("window.apiFetch is not available.");
    if (!args) return setErr("Drawer args missing.");
    if (!createdAcqId) return setErr("Draft acquisition not created yet.");

    setErr("");
    setPosting(true);

    try {
      const companyId = args.companyId;

      const postRes = await apiFetchFn(assetAcqPostUrl(companyId, createdAcqId), { method: "POST" });
      const posted = postRes as { ok?: boolean; posted_journal_id?: number | string };

      if (!posted.posted_journal_id) throw new Error("Posting did not return posted_journal_id.");

      onResolve({ action: "create_asset", assetId: createdAssetId });
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to post acquisition");
    } finally {
      setPosting(false);
    }
  }

  const computedTotals = useMemo(() => {
    const td = previewLines.reduce((s, x) => s + (Number(x.debit) || 0), 0);
    const tc = previewLines.reduce((s, x) => s + (Number(x.credit) || 0), 0);
    return { td, tc };
  }, [previewLines]);

  return (
    <DrawerShell
      open={open}
      title={title}
      onClose={() => {
        onResolve({ action: "close" });
        onClose();
      }}
      width={980}
    >
      {/* Context */}
      {args && (
        <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10 }}>
          <div>
            <b>Company:</b> {args.companyName?.trim() ? args.companyName : `Company ${String(args.companyId)}`}
          </div>

          {args.accountName ? (
            <div>
              <b>Account:</b> {args.accountName}
            </div>
          ) : null}

          <div>
            <b>Mode:</b> {args.mode}
          </div>

          {/* ✅ ADD THIS */}
          <div>
            <b>Posting date:</b> {readPostingDateFromArgs(args) || "—"}
          </div>
          <div>
            <b>Reference:</b> {readJournalRefFromArgs(args) || "—"}
          </div>
        </div>
      )}

      {/* CREATE ASSET */}
      <div
        style={{
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
          padding: 12,
          background: "rgba(0,0,0,0.02)",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Entry type</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="entry_mode"
              checked={entryMode === "acquisition"}
              onChange={() => {
                setEntryMode("acquisition");
                setForm((p) => ({
                  ...p,
                  entry_mode: "acquisition",
                  opening_as_at: "",
                  opening_cost: null,
                  opening_accum_dep: null,
                  opening_impairment: null,
                }));
              }}
            />
            <span>New Asset / Acquisition</span>
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="entry_mode"
              checked={entryMode === "opening_balance"}
              onChange={() => {
                const postingDate = readPostingDateFromArgs(args);

                setEntryMode("opening_balance");
                setForm((p) => ({
                  ...p,
                  entry_mode: "opening_balance",
                  opening_cost: Number(p.cost || 0),
                  opening_as_at: p.opening_as_at || postingDate || p.acquisition_date || "",
                  opening_accum_dep: p.opening_accum_dep ?? 0,
                  opening_impairment: p.opening_impairment ?? 0,
                }));
              }}
            />
            <span>Existing Asset / Opening Balance</span>
          </label>
        </div>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
          {isOpeningBalance
            ? "Capture an asset already owned before system adoption. Enter historical cost and accumulated depreciation."
            : "Capture a newly acquired asset and continue to acquisition draft + posting."}
        </div>
      </div>
      <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Create Asset</div>

        {err ? <div style={{ color: "#b91c1c", fontSize: 12, marginBottom: 8 }}>{err}</div> : null}

        {/* Step badge / mode note */}
        {!isOpeningBalance ? (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 900,
                padding: "6px 10px",
                borderRadius: 999,
                background: step === 1 ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.03)",
              }}
            >
              1) Draft
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 900,
                padding: "6px 10px",
                borderRadius: 999,
                background: step === 2 ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.03)",
              }}
            >
              2) Review + Post
            </div>
          </div>
        ) : (
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 10,
              padding: "8px 10px",
              borderRadius: 10,
              background: "rgba(0,0,0,0.04)",
            }}
          >
            Opening balance mode: asset will be created and opening journal posted immediately.
          </div>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          {/* Asset code / class */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>Asset code *</div>
              <input
                value={form.asset_code}
                onChange={(e) => setForm((p) => ({ ...p, asset_code: e.target.value }))}
                placeholder="e.g. VEH-0001"
                style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>Asset class *</div>
              <input
                value={form.asset_class}
                onChange={(e) => setForm((p) => ({ ...p, asset_class: e.target.value }))}
                placeholder="Vehicles / IT / Furniture..."
                style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
              />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Asset name *</div>
            <input
              value={form.asset_name}
              onChange={(e) => setForm((p) => ({ ...p, asset_name: e.target.value }))}
              placeholder="e.g. Motor Vehicle - Toyota"
              style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>Serial number / VIN</div>
              <input
                value={form.serial_no || ""}
                onChange={(e) => setForm((p) => ({ ...p, serial_no: e.target.value }))}
                placeholder="e.g. VIN / Serial / IMEI"
                style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>Location</div>
              <input
                value={form.location || ""}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                placeholder="e.g. Head Office"
                style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
              />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Notes</div>
            <textarea
              value={form.notes || ""}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
              placeholder="Optional notes..."
              style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>Acquisition date *</div>
              <input
                type="date"
                value={form.acquisition_date}
                onChange={(e) => setForm((p) => ({ ...p, acquisition_date: e.target.value }))}
                style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>Available for use date</div>
              <input
                type="date"
                value={form.available_for_use_date || ""}
                onChange={(e) => setForm((p) => ({ ...p, available_for_use_date: e.target.value }))}
                style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                {isOpeningBalance ? "Historical cost *" : "Cost *"}
              </div>
              <input
                value={String(form.cost)}
                onChange={(e) => setForm((p) => ({ ...p, cost: toNum(e.target.value) }))}
                placeholder="0.00"
                style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>Residual value</div>
              <input
                value={String(form.residual_value)}
                onChange={(e) => setForm((p) => ({ ...p, residual_value: toNum(e.target.value) }))}
                placeholder="0.00"
                style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
              />
            </div>
          </div>
          {isOpeningBalance ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Opening as at *</div>
                  <input
                    type="date"
                    value={form.opening_as_at || ""}
                    onChange={(e) => setForm((p) => ({ ...p, opening_as_at: e.target.value }))}
                    style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Opening cost</div>
                  <input
                    value={String(form.opening_cost ?? form.cost ?? 0)}
                    onChange={(e) => setForm((p) => ({ ...p, opening_cost: toNum(e.target.value) }))}
                    placeholder="0.00"
                    style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Accumulated depreciation *</div>
                  <input
                    value={String(form.opening_accum_dep ?? 0)}
                    onChange={(e) => setForm((p) => ({ ...p, opening_accum_dep: toNum(e.target.value) }))}
                    placeholder="0.00"
                    style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Opening impairment</div>
                  <input
                    value={String(form.opening_impairment ?? 0)}
                    onChange={(e) => setForm((p) => ({ ...p, opening_impairment: toNum(e.target.value) }))}
                    placeholder="0.00"
                    style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Carrying amount</div>
                  <input
                    value={String(carryingAmount)}
                    readOnly
                    style={{
                      width: "100%",
                      border: "1px solid rgba(0,0,0,0.15)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      background: "rgba(0,0,0,0.04)",
                      fontWeight: 700,
                    }}
                  />
                </div>
              </div>
            </>
          ) : null}
          {/* Depreciation inputs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>Depreciation method</div>
              <select
                value={form.depreciation_method}
                  onChange={(e) => {
                    const m = e.target.value as DepreciationMethod;
                    setForm((p) => ({
                      ...p,
                      depreciation_method: m,
                      useful_life_months: m === "SL" ? (p.useful_life_months || 60) : 0,
                      rb_rate_percent: m === "RB" ? (p.rb_rate_percent ?? 20) : null,
                      uop_total_units: m === "UOP" ? (p.uop_total_units ?? 0) : null,

                      // ✅ defaults for UOP
                      uop_usage_mode: m === "UOP" ? (p.uop_usage_mode ?? "DELTA") : null,
                      uop_opening_reading: m === "UOP" ? (p.uop_opening_reading ?? null) : null,
                    }));
                  }}
                style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
              >
                <option value="SL">Straight-line (SL)</option>
                <option value="RB">Reducing balance (RB)</option>
                <option value="UOP">Units of Production (UOP)</option>
              </select>
            </div>

            {form.depreciation_method === "SL" ? (
              <div>
                <div style={{ fontSize: 12, marginBottom: 4 }}>Useful life (months) *</div>
                <input
                  value={String(form.useful_life_months)}
                  onChange={(e) => setForm((p) => ({ ...p, useful_life_months: Math.max(0, Math.floor(toNum(e.target.value))) }))}
                  placeholder="e.g. 60"
                  style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
                />
              </div>
            ) : form.depreciation_method === "RB" ? (
              <div>
                <div style={{ fontSize: 12, marginBottom: 4 }}>Depreciation rate (% p.a.) *</div>
                <input
                  value={String(form.rb_rate_percent ?? "")}
                  onChange={(e) => setForm((p) => ({ ...p, rb_rate_percent: toNum(e.target.value) }))}
                  placeholder="e.g. 20"
                  style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
                />
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Total units (lifetime) *</div>
                  <input
                    value={String(form.uop_total_units ?? "")}
                    onChange={(e) => setForm((p) => ({ ...p, uop_total_units: toNum(e.target.value) }))}
                    placeholder="e.g. 200000"
                    style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
                  />
                </div>
                  <div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>Usage capture mode</div>
                    <select
                      value={(form.uop_usage_mode || "DELTA") as "DELTA" | "READING"}
                      onChange={(e) => {
                        const m = e.target.value as "DELTA" | "READING";
                        setForm((p) => ({
                          ...p,
                          uop_usage_mode: m,
                          uop_opening_reading: m === "READING" ? (p.uop_opening_reading ?? null) : null,
                        }));
                      }}
                      style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
                    >
                      <option value="DELTA">Period usage (km driven / hours used)</option>
                      <option value="READING">Meter reading (odometer / hour meter)</option>
                    </select>

                    <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
                      Choose <b>Meter reading</b> if you enter cumulative readings. Choose <b>Period usage</b> if you enter usage per period.
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>
                      Opening reading (odometer) at “Available for use” date
                    </div>
                      {(form.uop_usage_mode || "DELTA") === "READING" ? (
                        <div>
                          <div style={{ fontSize: 12, marginBottom: 4 }}>
                            Opening reading (baseline at “Available for use”)
                          </div>
                          <input
                            value={form.uop_opening_reading == null ? "" : String(form.uop_opening_reading)}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              setForm((p) => ({ ...p, uop_opening_reading: raw ? toNum(raw) : null }));
                            }}
                            placeholder="e.g. 25"
                            style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
                          />
                          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
                            The reading the asset arrived with (delivery/handover). Depreciation uses differences between readings.
                          </div>
                        </div>
                      ) : null}
                    <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
                      This is the odometer reading when the vehicle becomes available for use (baseline).
                    </div>
                  </div>         
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Unit name</div>
                  <input
                    value={String(form.uop_unit_name ?? "")}
                    onChange={(e) => setForm((p) => ({ ...p, uop_unit_name: e.target.value }))}
                    placeholder="e.g. km, hours, units"
                    style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Accounts */}
          <div style={{ fontWeight: 800, marginTop: 6 }}>Accounts (GL mapping)</div>

          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Asset cost account (Non-current assets only) *</div>
            <select
              disabled={coaLoading}
              value={form.asset_account_code || ""}
              onChange={(e) => {
                const code = e.target.value;

                const contraCode = code ? pickContraForAsset(code, coaAll) : "";

                setForm((p) => ({
                  ...p,
                  asset_account_code: code,
                  accum_dep_account_code: contraCode,   // still store CODE
                  dep_expense_account_code: "",   // force blank
                }));

                // 👇 Write NAME into visible input
                const contraInput = document.getElementById("accumDepDisplay") as HTMLInputElement;
                if (contraInput) {
                  contraInput.value = getAccountName(contraCode, coaAll);
                }
              }}
              style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
            >
              <option value="">{coaLoading ? "Loading..." : "Select PPE / Non-current asset..."}</option>
              {coaNca
                .slice()
                .sort((x, y) =>
                  String(x.name || x.account_name || "").toLowerCase().localeCompare(String(y.name || y.account_name || "").toLowerCase())
                )
                .map((a) => (
                  <option key={a.code} value={a.code}>
                    {(a.name || a.account_name || "").trim() || `Account ${a.code}`}
                  </option>
                ))}
            </select>
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>This dropdown is filtered to Non-current assets / PPE only.</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>Accumulated depreciation</div>
              <input
                id="accumDepDisplay"
                defaultValue=""
                readOnly
                placeholder="Auto-selected contra account"
                style={{
                  width: "100%",
                  border: "1px solid rgba(0,0,0,0.15)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "#f8fafc"
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>Depreciation expense</div>
              <input
                value={form.dep_expense_account_code || ""}
                onChange={(e) => setForm((p) => ({ ...p, dep_expense_account_code: e.target.value }))}
                placeholder="e.g. PL_OPEX_7100"
                style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
              />
            </div>
          </div>

          {/* Funding source */}
          <div style={{ fontWeight: 800, marginTop: 6 }}>Funding source</div>

          <select
            value={fundingSource}
            onChange={(e) => {
              const v = e.target.value as FundingSource;
              setFundingSource(v);
              setShowSourceDocNote(false);

              if (v === "vendor_credit") {
                setSourceDocType("invoice");
                setSourceDocRef("");
              } else if (v === "grni") {
                setSourceDocType("grn");
                setSourceDocRef("");
              } else {
                setSourceDocRef("");
              }

              if (v !== "other") setOtherCreditAccountCode("");

              if (v !== "vendor_credit" && v !== "grni") setSelectedVendorId("");
              if (v !== "bank" && v !== "cash") setSelectedBankId("");
            }}
            style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
          >
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="vendor_credit">Vendor / Credit (AP)</option>
            <option value="grni">GRNI (Goods received not invoiced)</option>
            <option value="other">Other (manual / suspense)</option>
          </select>

          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
            This controls which account gets credited when you post the acquisition.
          </div>

          {!isOpeningBalance ? (
            <>
              {(fundingSource === "vendor_credit" || fundingSource === "grni") ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>Vendor *</div>
                    <select
                      disabled={vendorsLoading}
                      value={selectedVendorId}
                      onChange={(e) => setSelectedVendorId(e.target.value)}
                      style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
                    >
                      <option value="">{vendorsLoading ? "Loading..." : "Select vendor..."}</option>
                      {vendors.map((v) => (
                        <option key={String(v.id)} value={String(v.id)}>
                          {v.name || v.vendor_name || `Vendor ${v.id}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 12 }}>Source document</div>

                      <button
                        type="button"
                        onClick={() => setShowSourceDocNote((s) => !s)}
                        title="Help"
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 999,
                          border: "1px solid rgba(0,0,0,0.25)",
                          background: "white",
                          fontSize: 12,
                          fontWeight: 900,
                          lineHeight: "16px",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        ?
                      </button>
                    </div>

                    {showSourceDocNote ? (
                      <div
                        style={{
                          marginTop: 8,
                          padding: 10,
                          borderRadius: 10,
                          background: "rgba(255, 243, 199, 0.9)",
                          border: "1px solid rgba(0,0,0,0.12)",
                          fontSize: 12,
                        }}
                      >
                        {fundingSource === "vendor_credit" ? (
                          <>
                            <b>Vendor / Credit (AP)</b> is locked to <b>Invoice</b>.
                          </>
                        ) : (
                          <>
                            <b>GRNI</b> uses a <b>GRN / Goods Receipt</b> reference.
                          </>
                        )}
                      </div>
                    ) : null}

                    <select
                      value={sourceDocType}
                      onChange={(e) => setSourceDocType(e.target.value as SourceDocType)}
                      disabled={fundingSource === "vendor_credit"}
                      style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
                    >
                      <option value="invoice">Invoice</option>
                      <option value="grn">GRN / Goods Receipt</option>
                    </select>

                    <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
                      {fundingSource === "vendor_credit"
                        ? "Reference supplier invoice."
                        : "Reference GRN."}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>
                      {sourceDocType === "invoice" ? "Invoice number *" : "GRN / Receipt reference *"}
                    </div>
                    <input
                      value={sourceDocRef}
                      onChange={(e) => setSourceDocRef(e.target.value)}
                      placeholder={sourceDocType === "invoice" ? "e.g. INV-12345" : "e.g. GRN-009812"}
                      style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
                    />
                  </div>
                </div>
              ) : null}

              {(fundingSource === "bank" || fundingSource === "cash") ? (
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Bank account *</div>
                  <select
                    disabled={banksLoading}
                    value={selectedBankId}
                    onChange={(e) => setSelectedBankId(e.target.value)}
                    style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
                  >
                    <option value="">{banksLoading ? "Loading..." : "Select bank account..."}</option>
                    {banks.map((b) => {
                      const label = [b.bank_name, b.account_name, b.account_number].filter(Boolean).join(" • ");
                      const code = (b.ledger_account_code || "").trim();
                      const missing = !code;

                      return (
                        <option key={String(b.id)} value={String(b.id)} disabled={missing}>
                          {label || `Bank ${b.id}`}{missing ? " (Missing ledger code)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : null}

              {fundingSource === "other" ? (
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Credit account code *</div>
                  <input
                    value={otherCreditAccountCode}
                    onChange={(e) => setOtherCreditAccountCode(e.target.value)}
                    placeholder="e.g. BS_CL_2000"
                    style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}
                  />
                </div>
              ) : null}
            </>
          ) : null}

          {/* ✅ Journal Preview appears ONLY after draft (step 2) */}
          {step === 2 ? (
            <div style={{ marginTop: 12, border: "1px solid rgba(0,0,0,0.10)", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 900 }}>Journal Preview</div>

                <button
                  type="button"
                  onClick={() => args && createdAcqId && loadJournalPreview(String(args.companyId), String(createdAcqId))}
                  disabled={previewLoading}
                  style={{
                    border: "1px solid rgba(0,0,0,0.18)",
                    borderRadius: 10,
                    padding: "6px 10px",
                    background: "white",
                    cursor: previewLoading ? "not-allowed" : "pointer",
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  {previewLoading ? "Loading..." : "Refresh"}
                </button>
              </div>

              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
                <div><b>Draft acquisition:</b> {createdAcqId}</div>
                <div><b>Draft asset:</b> {createdAssetId}</div>
                {previewMeta?.ref ? <div><b>Ref:</b> {previewMeta.ref}</div> : null}
                {previewMeta?.description ? <div><b>Description:</b> {previewMeta.description}</div> : null}
              </div>

              <div style={{ marginTop: 10, overflowX: "auto" }}>
                {previewLines.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {previewLoading ? "Loading preview..." : "No preview lines returned yet."}
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(0,0,0,0.12)" }}>
                        <th style={{ padding: "8px 6px" }}>Account (Name)</th>
                        <th style={{ padding: "8px 6px", width: 140, textAlign: "right" }}>Debit</th>
                        <th style={{ padding: "8px 6px", width: 140, textAlign: "right" }}>Credit</th>
                        <th style={{ padding: "8px 6px" }}>Memo</th>
                      </tr>
                    </thead>
                      <tbody>
                        {previewLines.map((ln, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                            <td style={{ padding: "8px 6px", fontWeight: 700 }}>
                              {ln.account_name || ""}
                            </td>
                            <td style={{ padding: "8px 6px", textAlign: "right" }}>{(Number(ln.debit) || 0).toFixed(2)}</td>
                            <td style={{ padding: "8px 6px", textAlign: "right" }}>{(Number(ln.credit) || 0).toFixed(2)}</td>
                            <td style={{ padding: "8px 6px", opacity: 0.85 }}>{ln.memo || ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    <tfoot>
                      <tr>
                        <td style={{ padding: "8px 6px", fontWeight: 900 }}>Totals</td>
                        <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 900 }}>
                          {(previewMeta?.total_debit ?? computedTotals.td).toFixed(2)}
                        </td>
                        <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 900 }}>
                          {(previewMeta?.total_credit ?? computedTotals.tc).toFixed(2)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          ) : null}

          {/* ✅ Buttons */}
          {isOpeningBalance ? (
            <button
              type="button"
              onClick={submitCreateDraft}
              disabled={saving}
              style={{
                border: 0,
                borderRadius: 12,
                padding: "12px 14px",
                background: "black",
                color: "white",
                cursor: saving ? "not-allowed" : "pointer",
                fontWeight: 900,
                marginTop: 6,
              }}
            >
              {saving ? "Saving..." : "Create Opening Balance"}
            </button>
          ) : step === 1 ? (
            <button
              type="button"
              onClick={submitCreateDraft}
              disabled={saving}
              style={{
                border: 0,
                borderRadius: 12,
                padding: "12px 14px",
                background: "black",
                color: "white",
                cursor: saving ? "not-allowed" : "pointer",
                fontWeight: 900,
                marginTop: 6,
              }}
            >
              {saving ? "Saving..." : "Create Draft"}
            </button>
            ) : (
              <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setPreviewLines([]);
                    setPreviewMeta(null);
                    setErr("");
                  }}
                  disabled={posting || saving}
                  style={{
                    border: "1px solid rgba(0,0,0,0.18)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    background: "white",
                    color: "black",
                    cursor: posting || saving ? "not-allowed" : "pointer",
                    fontWeight: 900,
                  }}
                >
                  Back to Edit
                </button>
               
                <button
                  type="button"
                    onClick={async () => {
                      if (!args || !createdAssetId || !createdAcqId) return;
                      await handoffToApBillFromAcquisition(args.companyId, createdAssetId, createdAcqId);
                    }}
                  disabled={!createdAssetId || !createdAcqId}
                  style={{
                    border: "1px solid rgba(0,0,0,0.18)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    background: "white",
                    color: "black",
                    cursor: !createdAssetId || !createdAcqId ? "not-allowed" : "pointer",
                    fontWeight: 900,
                  }}
                >
                  Create Bill
                </button>

                <button
                  type="button"
                  onClick={submitPostDraft}
                  disabled={posting || previewLoading}
                  style={{
                    border: 0,
                    borderRadius: 12,
                    padding: "12px 14px",
                    background: "black",
                    color: "white",
                    cursor: posting ? "not-allowed" : "pointer",
                    fontWeight: 900,
                  }}
                >
                  {posting ? "Posting..." : "Post Acquisition"}
                </button>
              </div>
            )}
        </div>
      </div>
    </DrawerShell>
  );
}
