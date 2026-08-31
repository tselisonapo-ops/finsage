/**
 * FinSage Nexus - Operations API Client
 * 
 * Organized API layer for FinFlow operations module.
 * All endpoints use the /api/companies/{companyId}/ops base path.
 */

export const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

export const TOKEN_KEY = "finsphere_token";
export const COMPANY_KEY = "finsphere_company_id";

// ============================================================
// SESSION HELPERS
// ============================================================

export const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
export const getCompanyId = () => Number(localStorage.getItem(COMPANY_KEY) || 0) || null;

export function setSession(token, companyId) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (companyId) localStorage.setItem(COMPANY_KEY, String(companyId));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(COMPANY_KEY);
}

// ============================================================
// CORE HTTP CLIENT
// ============================================================

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();

  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = {};
  try { data = await res.json(); } catch { }

  if (!res.ok) {
    const err = new Error(data.error || data.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

async function download(url, fileName) {
  const token = getToken();

  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = data.error || data.message || message;
    } catch { }
    throw new Error(message);
  }

  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName || "document";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

// ============================================================
// COMPANY API
// ============================================================

export const companyApi = {
  get: (companyId) => request(`/api/companies/${encodeURIComponent(companyId)}`),
  branding: (companyId) => request(`/api/companies/${encodeURIComponent(companyId)}/branding`),
};

// ============================================================
// AUTHENTICATION API
// ============================================================

export const authApi = {
  signin: (email, password) =>
    request("/api/auth/signin", {
      method: "POST",
      auth: false,
      body: { email, password, product: "FinSage Nexus" },
    }),

  acceptInvite: (payload) =>
    request("/api/auth/accept-invite", {
      method: "POST",
      auth: false,
      body: payload,
    }),
};

// ============================================================
// OPERATIONS API BASE
// ============================================================

const base = (companyId) => `/api/companies/${encodeURIComponent(companyId)}/ops`;

export const opsApi = {

  // ============================================================
  // SESSION & SETUP
  // ============================================================

  session: (companyId) => request(`${base(companyId)}/session`),

  setup: (companyId) => request(`${base(companyId)}/setup`),

  // ============================================================
  // SETTINGS
  // ============================================================

  settings: (companyId, payload) =>
    request(`${base(companyId)}/settings`, { method: "PATCH", body: payload }),

  // ============================================================
  // GOVERNANCE
  // ============================================================

  governance: (companyId) => request(`${base(companyId)}/governance`),

  saveGovernance: (companyId, payload) =>
    request(`${base(companyId)}/governance`, { method: "PUT", body: payload }),

  // ============================================================
  // ORGANISATION: DEPARTMENTS
  // ============================================================

  createDepartment: (companyId, payload) =>
    request(`${base(companyId)}/departments`, { method: "POST", body: payload }),

  updateDepartment: (companyId, id, payload) =>
    request(`${base(companyId)}/departments/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: payload,
    }),

  // ============================================================
  // ORGANISATION: POSITIONS
  // ============================================================

  createPosition: (companyId, payload) =>
    request(`${base(companyId)}/positions`, { method: "POST", body: payload }),

  updatePosition: (companyId, positionId, payload) =>
    request(`${base(companyId)}/positions/${encodeURIComponent(positionId)}`, {
      method: "PATCH",
      body: payload,
    }),

  // ============================================================
  // USERS & ACCESS
  // ============================================================

  updateUserAccess: (companyId, userId, payload) =>
    request(`${base(companyId)}/users/${encodeURIComponent(userId)}/access`, {
      method: "PATCH",
      body: payload,
    }),

  inviteUser: (payload) =>
    request("/api/invites", { method: "POST", body: payload }),

  // ============================================================
  // REQUEST TYPES
  // ============================================================

  requestTypes: (companyId) =>
    request(`${base(companyId)}/request-types`),

  // ============================================================
  // REQUESTS
  // ============================================================

  requests: (companyId, { status } = {}) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    return request(`${base(companyId)}/requests${qs.toString() ? `?${qs}` : ""}`);
  },

  request: (companyId, requestId) =>
    request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}`),

  createRequest: (companyId, payload) =>
    request(`${base(companyId)}/requests`, { method: "POST", body: payload }),

  updateRequest: (companyId, requestId, payload) =>
    request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      body: payload,
    }),

  submitRequest: (companyId, requestId) =>
    request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}/submit`, {
      method: "POST",
      body: {},
    }),

  // ============================================================
  // REQUEST DOCUMENTS
  // ============================================================

  requestDocument: (companyId, requestId) =>
    request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}/document`),

  snapshotRequestDocument: (companyId, requestId) =>
    request(
      `${base(companyId)}/requests/${encodeURIComponent(requestId)}/document/snapshot`,
      { method: "POST", body: {} }
    ),

  requestDocumentList: (companyId, requestId) =>
    request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}/documents`),

  exportRequestDocument: (companyId, requestId, format) =>
    request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}/documents/export`, {
      method: "POST",
      body: { format },
    }),

  downloadRequestDocument: (companyId, documentId, fileName) =>
    download(
      `${base(companyId)}/documents/${encodeURIComponent(documentId)}/download`,
      fileName
    ),

  requestAudit: (companyId, requestId) =>
    request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}/audit`),

  requestDocuments: (companyId) =>
    request(`${base(companyId)}/requests`),

  // ============================================================
  // APPROVALS
  // ============================================================

  approvals: (companyId, status = "pending") =>
    request(`${base(companyId)}/approvals?status=${encodeURIComponent(status)}`),

  decideApproval: (companyId, taskId, decision, comment = "") =>
    request(`${base(companyId)}/approvals/${encodeURIComponent(taskId)}/decision`, {
      method: "POST",
      body: { decision, comment },
    }),

  // ============================================================
  // BUDGET CONTROL
  // ============================================================

  budgetCheck: (companyId, requestId) =>
    request(
      `${base(companyId)}/requests/${encodeURIComponent(requestId)}/budget-check`,
      { method: "POST", body: {} }
    ),

  latestBudgetCheck: (companyId, requestId) =>
    request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}/budget-check`),

  budgetRules: (companyId) =>
    request(`${base(companyId)}/budget-rules`),

  createBudgetRule: (companyId, payload) =>
    request(`${base(companyId)}/budget-rules`, { method: "POST", body: payload }),

  // ============================================================
  // FINANCE: ACCOUNTS & METADATA
  // ============================================================

  financeAccounts: (companyId) =>
    request(`${base(companyId)}/finance/accounts`),

  financeMetadata: (companyId) =>
    request(`${base(companyId)}/finance/metadata`),

  financeContext: (companyId) =>
    request(`${base(companyId)}/finance/context`),

  financeOverview: (companyId) =>
    request(`${base(companyId)}/finance/overview`),

  financeMyWork: (companyId) =>
    request(`${base(companyId)}/finance/my-work`),

  // ============================================================
  // FINANCE REVIEW
  // ============================================================

  financeReview: (companyId, requestId, taskId) =>
    request(
      `${base(companyId)}/requests/${encodeURIComponent(requestId)}/finance-review?approval_task_id=${encodeURIComponent(taskId)}`
    ),

  saveFinanceReview: (companyId, requestId, payload) =>
    request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}/finance-review`, {
      method: "PATCH",
      body: payload,
    }),

  // ============================================================
  // COST CENTRES
  // ============================================================

  costCentres: (companyId) =>
    request(`${base(companyId)}/cost-centres`),

  createCostCentre: (companyId, payload) =>
    request(`${base(companyId)}/cost-centres`, { method: "POST", body: payload }),

  // ============================================================
  // PROCUREMENT: DASHBOARD & CASES
  // ============================================================

  procurement: (companyId, { status = "" } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const qs = params.toString();
    return request(`${base(companyId)}/procurement${qs ? `?${qs}` : ""}`);
  },

  procurementCase: (companyId, caseId) =>
    request(`${base(companyId)}/procurement/${encodeURIComponent(caseId)}`),

  // ============================================================
  // PROCUREMENT: SETTINGS
  // ============================================================

  procurementSettings: (companyId) =>
    request(`${base(companyId)}/procurement/settings`),

  updateProcurementSettings: (companyId, payload) =>
    request(`${base(companyId)}/procurement/settings`, {
      method: "PATCH",
      body: payload,
    }),

  testProcurementEmail: (companyId, recipient_email) =>
    request(`${base(companyId)}/procurement/settings/test-email`, {
      method: "POST",
      body: { recipient_email },
    }),

  // ============================================================
  // PROCUREMENT: POLICIES
  // ============================================================

  procurementPolicies: (companyId) =>
    request(`${base(companyId)}/procurement/policies`),

  createProcurementPolicy: (companyId, payload) =>
    request(`${base(companyId)}/procurement/policies`, {
      method: "POST",
      body: payload,
    }),

  createProcurementPolicyRule: (companyId, policyId, payload) =>
    request(
      `${base(companyId)}/procurement/policies/${encodeURIComponent(policyId)}/rules`,
      { method: "POST", body: payload }
    ),

  // ============================================================
  // PROCUREMENT: VENDORS
  // ============================================================

  procurementVendors: (companyId, filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== "" && value !== null && value !== undefined)
        params.set(key, value);
    });
    const qs = params.toString();
    return request(`${base(companyId)}/procurement/vendors${qs ? `?${qs}` : ""}`);
  },

  procurementVendor: (companyId, vendorId) =>
    request(`${base(companyId)}/procurement/vendors/${encodeURIComponent(vendorId)}`),

  updateProcurementVendor: (companyId, vendorId, payload) =>
    request(`${base(companyId)}/procurement/vendors/${encodeURIComponent(vendorId)}`, {
      method: "PATCH",
      body: payload,
    }),

  createProcurementVendorContact: (companyId, vendorId, payload) =>
    request(
      `${base(companyId)}/procurement/vendors/${encodeURIComponent(vendorId)}/contacts`,
      { method: "POST", body: payload }
    ),

  updateProcurementVendorContact: (companyId, vendorId, contactId, payload) =>
    request(
      `${base(companyId)}/procurement/vendors/${encodeURIComponent(vendorId)}/contacts/${encodeURIComponent(contactId)}`,
      { method: "PATCH", body: payload }
    ),

  // ============================================================
  // SOURCING EVENTS (RFQ)
  // ============================================================

  createSourcingEvent: (companyId, caseId, payload) =>
    request(`${base(companyId)}/procurement/${encodeURIComponent(caseId)}/sourcing`, {
      method: "POST",
      body: payload,
    }),

  sourcingEvent: (companyId, eventId) =>
    request(`${base(companyId)}/sourcing/${encodeURIComponent(eventId)}`),

  updateSourcingEvent: (companyId, eventId, payload) =>
    request(`${base(companyId)}/sourcing/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      body: payload,
    }),

  updateSourcingItem: (companyId, eventId, itemId, payload) =>
    request(
      `${base(companyId)}/sourcing/${encodeURIComponent(eventId)}/items/${encodeURIComponent(itemId)}`,
      { method: "PATCH", body: payload }
    ),

  eligibleSourcingVendors: (companyId, eventId) =>
    request(`${base(companyId)}/sourcing/${encodeURIComponent(eventId)}/eligible-vendors`),

  addSourcingVendor: (companyId, eventId, vendorId) =>
    request(
      `${base(companyId)}/sourcing/${encodeURIComponent(eventId)}/vendors/${encodeURIComponent(vendorId)}`,
      { method: "POST", body: {} }
    ),

  removeSourcingVendor: (companyId, eventId, vendorId) =>
    request(
      `${base(companyId)}/sourcing/${encodeURIComponent(eventId)}/vendors/${encodeURIComponent(vendorId)}`,
      { method: "DELETE" }
    ),

  issueSourcingRfq: (companyId, eventId) =>
    request(`${base(companyId)}/sourcing/${encodeURIComponent(eventId)}/issue`, {
      method: "POST",
      body: {},
    }),

  // ============================================================
  // QUOTE EVALUATION
  // ============================================================

  quoteComparison: (companyId, eventId) =>
    request(`/api/companies/${companyId}/sourcing-events/${eventId}/comparison`),

  startEvaluation: (companyId, eventId) =>
    request(`/api/companies/${companyId}/sourcing-events/${eventId}/evaluation/start`, {
      method: "POST",
      body: {},
    }),

  calculateEvaluation: (companyId, eventId) =>
    request(`/api/companies/${companyId}/sourcing-events/${eventId}/evaluation/calculate`, {
      method: "POST",
      body: {},
    }),

  saveEvaluationScore: (companyId, eventId, payload) =>
    request(`/api/companies/${companyId}/sourcing-events/${eventId}/evaluation/scores`, {
      method: "PUT",
      body: payload,
    }),

  declareEvaluationConflict: (companyId, eventId, payload) =>
    request(`/api/companies/${companyId}/sourcing-events/${eventId}/evaluation/declaration`, {
      method: "POST",
      body: payload,
    }),

  recommendVendor: (companyId, eventId, payload) =>
    request(`/api/companies/${companyId}/sourcing-events/${eventId}/recommend`, {
      method: "POST",
      body: payload,
    }),

  // ============================================================
  // AWARDS
  // ============================================================

  createAward: (companyId, eventId, payload = {}) =>
    request(`${base(companyId)}/sourcing-events/${encodeURIComponent(eventId)}/award`, {
      method: "POST",
      body: payload,
    }),

  award: (companyId, awardId) =>
    request(`${base(companyId)}/awards/${encodeURIComponent(awardId)}`),

  submitAward: (companyId, awardId, payload = {}) =>
    request(`${base(companyId)}/awards/${encodeURIComponent(awardId)}/submit`, {
      method: "POST",
      body: payload,
    }),

  awardApprovals: (companyId) =>
    request(`${base(companyId)}/award-approvals`),

  decideAward: (companyId, taskId, decision, comment = "") =>
    request(`${base(companyId)}/award-approvals/${encodeURIComponent(taskId)}/decision`, {
      method: "POST",
      body: { decision, comment },
    }),

  // ============================================================
  // PURCHASE ORDERS
  // ============================================================

  createPurchaseOrder: (companyId, awardId) =>
    request(`${base(companyId)}/awards/${encodeURIComponent(awardId)}/purchase-order`, {
      method: "POST",
      body: {},
    }),

  purchaseOrder: (companyId, poId) =>
    request(`${base(companyId)}/purchase-orders/${encodeURIComponent(poId)}`),

  updatePurchaseOrder: (companyId, poId, payload) =>
    request(`${base(companyId)}/purchase-orders/${encodeURIComponent(poId)}`, {
      method: "PATCH",
      body: payload,
    }),

  issuePurchaseOrder: (companyId, poId) =>
    request(`${base(companyId)}/purchase-orders/${encodeURIComponent(poId)}/issue`, {
      method: "POST",
      body: {},
    }),

  sendPurchaseOrder: (companyId, poId) =>
    request(`${base(companyId)}/purchase-orders/${encodeURIComponent(poId)}/send`, {
      method: "POST",
      body: {},
    }),

  cancelPurchaseOrder: (companyId, poId, reason) =>
    request(`${base(companyId)}/purchase-orders/${encodeURIComponent(poId)}/cancel`, {
      method: "POST",
      body: { reason },
    }),

  // ============================================================
  // RECEIPTS / GOODS RECEIVED
  // ============================================================

  createReceipt: (companyId, poId) =>
    request(`${base(companyId)}/purchase-orders/${encodeURIComponent(poId)}/receipts`, {
      method: "POST",
      body: {},
    }),

  receipt: (companyId, receiptId) =>
    request(`${base(companyId)}/receipts/${encodeURIComponent(receiptId)}`),

  updateReceipt: (companyId, receiptId, payload) =>
    request(`${base(companyId)}/receipts/${encodeURIComponent(receiptId)}`, {
      method: "PATCH",
      body: payload,
    }),

  saveServiceConfirmation: (companyId, receiptId, payload) =>
    request(`${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/service-confirmation`, {
      method: "PUT",
      body: payload,
    }),

  saveAssetReceipt: (companyId, receiptId, poLineId, payload) =>
    request(
      `${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/asset-lines/${encodeURIComponent(poLineId)}`,
      { method: "PUT", body: payload }
    ),

  saveLeaseReceipt: (companyId, receiptId, payload) =>
    request(`${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/lease`, {
      method: "PUT",
      body: payload,
    }),

  submitReceipt: (companyId, receiptId) =>
    request(`${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/submit`, {
      method: "POST",
      body: {},
    }),

  verifyReceipt: (companyId, receiptId, comment = "") =>
    request(`${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/verify`, {
      method: "POST",
      body: { comment },
    }),

  rejectReceipt: (companyId, receiptId, reason) =>
    request(`${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/reject`, {
      method: "POST",
      body: { reason },
    }),

  // ============================================================
  // RECEIPTS: RETURNS PROCESSING (Phase 5 Completion)
  // ============================================================

  createReturn: (companyId, receiptId, payload) =>
    request(`${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/returns`, {
      method: "POST",
      body: payload,
    }),

  returns: (companyId, receiptId) =>
    request(`${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/returns`),

  returnDetail: (companyId, receiptId, returnId) =>
    request(
      `${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/returns/${encodeURIComponent(returnId)}`
    ),

  submitReturn: (companyId, receiptId, returnId, payload) =>
    request(
      `${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/returns/${encodeURIComponent(returnId)}/submit`,
      { method: "POST", body: payload }
    ),

  approveReturn: (companyId, receiptId, returnId, payload = {}) =>
    request(
      `${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/returns/${encodeURIComponent(returnId)}/approve`,
      { method: "POST", body: payload }
    ),

  processReturn: (companyId, receiptId, returnId, payload) =>
    request(
      `${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/returns/${encodeURIComponent(returnId)}/process`,
      { method: "POST", body: payload }
    ),

  // ============================================================
  // RECEIPTS: PARTIAL RECEIPT SUPPORT (Phase 5 Completion)
  // ============================================================

  receiptLines: (companyId, receiptId) =>
    request(`${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/lines`),

  updateReceiptLine: (companyId, receiptId, lineId, payload) =>
    request(
      `${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/lines/${encodeURIComponent(lineId)}`,
      { method: "PATCH", body: payload }
    ),

  addReceiptLine: (companyId, receiptId, payload) =>
    request(`${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/lines`, {
      method: "POST",
      body: payload,
    }),

  removeReceiptLine: (companyId, receiptId, lineId, reason) =>
    request(
      `${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/lines/${encodeURIComponent(lineId)}`,
      { method: "DELETE", body: { reason } }
    ),

  completePartialReceipt: (companyId, receiptId) =>
    request(`${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/complete-partial`, {
      method: "POST",
      body: {},
    }),

  // ============================================================
  // PROCUREMENT: CONTRACTS LINKAGE (Phase 5 Completion)
  // ============================================================

  procurementContracts: (companyId, { status = "" } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const qs = params.toString();
    return request(`${base(companyId)}/procurement/contracts${qs ? `?${qs}` : ""}`);
  },

  procurementContract: (companyId, contractId) =>
    request(`${base(companyId)}/procurement/contracts/${encodeURIComponent(contractId)}`),

  createProcurementContract: (companyId, payload) =>
    request(`${base(companyId)}/procurement/contracts`, {
      method: "POST",
      body: payload,
    }),

  updateProcurementContract: (companyId, contractId, payload) =>
    request(`${base(companyId)}/procurement/contracts/${encodeURIComponent(contractId)}`, {
      method: "PATCH",
      body: payload,
    }),

  linkContractToAward: (companyId, awardId, contractId) =>
    request(`${base(companyId)}/awards/${encodeURIComponent(awardId)}/contract`, {
      method: "POST",
      body: { contract_id: contractId },
    }),

  unlinkContractFromAward: (companyId, awardId) =>
    request(`${base(companyId)}/awards/${encodeURIComponent(awardId)}/contract`, {
      method: "DELETE",
    }),

  activateContract: (companyId, contractId, payload = {}) =>
    request(`${base(companyId)}/procurement/contracts/${encodeURIComponent(contractId)}/activate`, {
      method: "POST",
      body: payload,
    }),

  renewContract: (companyId, contractId, payload) =>
    request(`${base(companyId)}/procurement/contracts/${encodeURIComponent(contractId)}/renew`, {
      method: "POST",
      body: payload,
    }),

  terminateContract: (companyId, contractId, payload) =>
    request(`${base(companyId)}/procurement/contracts/${encodeURIComponent(contractId)}/terminate`, {
      method: "POST",
      body: payload,
    }),

  contractAmendments: (companyId, contractId) =>
    request(`${base(companyId)}/procurement/contracts/${encodeURIComponent(contractId)}/amendments`),

  createContractAmendment: (companyId, contractId, payload) =>
    request(
      `${base(companyId)}/procurement/contracts/${encodeURIComponent(contractId)}/amendments`,
      { method: "POST", body: payload }
    ),

  // ============================================================
  // PROCUREMENT: ANALYTICS & REPORTING (Phase 5 Completion)
  // ============================================================

  procurementDashboard: (companyId, { period = "current", type = "" } = {}) => {
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    if (type) params.set("type", type);
    const qs = params.toString();
    return request(`${base(companyId)}/procurement/dashboard${qs ? `?${qs}` : ""}`);
  },

  procurementSpendByVendor: (companyId, { from_date, to_date, category } = {}) => {
    const params = new URLSearchParams();
    if (from_date) params.set("from_date", from_date);
    if (to_date) params.set("to_date", to_date);
    if (category) params.set("category", category);
    const qs = params.toString();
    return request(`${base(companyId)}/procurement/analytics/spend-by-vendor${qs ? `?${qs}` : ""}`);
  },

  procurementSpendByCategory: (companyId, { from_date, to_date } = {}) => {
    const params = new URLSearchParams();
    if (from_date) params.set("from_date", from_date);
    if (to_date) params.set("to_date", to_date);
    const qs = params.toString();
    return request(`${base(companyId)}/procurement/analytics/spend-by-category${qs ? `?${qs}` : ""}`);
  },

  vendorPerformance: (companyId, vendorId, { period = "12m" } = {}) =>
    request(
      `${base(companyId)}/procurement/vendors/${encodeURIComponent(vendorId)}/performance?period=${encodeURIComponent(period)}`
    ),

  vendorScorecard: (companyId, vendorId) =>
    request(`${base(companyId)}/procurement/vendors/${encodeURIComponent(vendorId)}/scorecard`),

  updateVendorScorecard: (companyId, vendorId, payload) =>
    request(`${base(companyId)}/procurement/vendors/${encodeURIComponent(vendorId)}/scorecard`, {
      method: "PATCH",
      body: payload,
    }),

  procurementCycleTime: (companyId, { from_date, to_date } = {}) => {
    const params = new URLSearchParams();
    if (from_date) params.set("from_date", from_date);
    if (to_date) params.set("to_date", to_date);
    const qs = params.toString();
    return request(`${base(companyId)}/procurement/analytics/cycle-time${qs ? `?${qs}` : ""}`);
  },

  savingsAnalysis: (companyId, { from_date, to_date } = {}) => {
    const params = new URLSearchParams();
    if (from_date) params.set("from_date", from_date);
    if (to_date) params.set("to_date", to_date);
    const qs = params.toString();
    return request(`${base(companyId)}/procurement/analytics/savings${qs ? `?${qs}` : ""}`);
  },

  complianceReport: (companyId, { from_date, to_date, status } = {}) => {
    const params = new URLSearchParams();
    if (from_date) params.set("from_date", from_date);
    if (to_date) params.set("to_date", to_date);
    if (status) params.set("status", status);
    const qs = params.toString();
    return request(`${base(companyId)}/procurement/reports/compliance${qs ? `?${qs}` : ""}`);
  },

  exportProcurementReport: (companyId, reportType, { format = "pdf", ...filters } = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== "" && value !== null && value !== undefined)
        params.set(key, value);
    });
    params.set("format", format);
    const qs = params.toString();
    return download(
      `${API_BASE}${base(companyId)}/procurement/reports/${reportType}/export?${qs}`,
      `procurement-${reportType}-${Date.now()}.${format}`
    );
  },

  // ============================================================
  // ACCOUNTS PAYABLE: VENDOR INVOICES
  // ============================================================

  apInvoices: (companyId, status = "") =>
    request(
      `${base(companyId)}/accounts-payable/invoices${status ? `?status=${encodeURIComponent(status)}` : ""}`
    ),

  createVendorInvoice: (companyId, poId, payload) =>
    request(`${base(companyId)}/purchase-orders/${encodeURIComponent(poId)}/invoices`, {
      method: "POST",
      body: payload,
    }),

  vendorInvoice: (companyId, invoiceId) =>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}`),

  submitVendorInvoice: (companyId, invoiceId) =>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/submit`, {
      method: "POST",
      body: {},
    }),

  matchVendorInvoice: (companyId, invoiceId) =>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/match`, {
      method: "POST",
      body: {},
    }),

  reviewVendorInvoice: (companyId, invoiceId, payload) =>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/review`, {
      method: "PATCH",
      body: payload,
    }),

  resolveInvoiceException: (companyId, exceptionId, comment, waive = false) =>
    request(`${base(companyId)}/invoice-exceptions/${encodeURIComponent(exceptionId)}/resolve`, {
      method: "POST",
      body: { comment, waive },
    }),

  acceptVendorInvoice: (companyId, invoiceId) =>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/accept`, {
      method: "POST",
      body: {},
    }),

  rejectVendorInvoice: (companyId, invoiceId, reason) =>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/reject`, {
      method: "POST",
      body: { reason },
    }),

  // ============================================================
  // ACCOUNTS PAYABLE: INVOICE CODING & HANDOFF
  // ============================================================

  saveInvoiceCoding: (companyId, invoiceId, lines) =>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/coding`, {
      method: "PUT",
      body: { lines },
    }),

  accountingHandoffPreview: (companyId, invoiceId) =>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/accounting-handoff`),

  handoffInvoiceToAccounting: (companyId, invoiceId) =>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/accounting-handoff`, {
      method: "POST",
    }),

  invoiceAccountingStatus: (companyId, invoiceId) =>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/accounting-status`),

  paymentEligibility: (companyId, invoiceId) =>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/payment-eligibility`),

  // ============================================================
  // ACCOUNTS PAYABLE: PAYMENT VOUCHERS
  // ============================================================

  createPaymentVoucher: (companyId, invoiceId, payload) =>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/payment-vouchers`, {
      method: "POST",
      body: payload,
    }),

  paymentVouchers: (companyId, { status = "", q = "" } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    const qs = params.toString();
    return request(
      `${base(companyId)}/finance/payables/payment-vouchers${qs ? `?${qs}` : ""}`
    );
  },

  paymentVoucher: (companyId, voucherId) =>
    request(`${base(companyId)}/payment-vouchers/${encodeURIComponent(voucherId)}`),

  // ============================================================
  // FINANCE DASHBOARDS & QUEUES
  // ============================================================

  payablesSummary: (companyId) =>
    request(`${base(companyId)}/finance/payables/summary`),

  payablesQueue: (companyId, queue) =>
    request(`${base(companyId)}/finance/payables/${encodeURIComponent(queue)}`),

  inventoryDashboard: (companyId, warehouseId) => {
    const params = warehouseId ? `?warehouse_id=${warehouseId}` : '';
    return request(`${base(companyId)}/inventory/dashboard${params}`);
  },

  inventorySummary: (companyId) =>
    request(`${base(companyId)}/inventory/summary`),

  // ============================================================
  // WAREHOUSE MANAGEMENT
  // ============================================================

  warehouses: (companyId, includeInactive = false) =>
    request(`${base(companyId)}/warehouses${includeInactive ? '?include_inactive=true' : ''}`),

  warehouse: (companyId, warehouseId) =>
    request(`${base(companyId)}/warehouses/${encodeURIComponent(warehouseId)}`),

  createWarehouse: (companyId, payload) =>
    request(`${base(companyId)}/warehouses`, {
      method: 'POST',
      body: payload,
    }),

  updateWarehouse: (companyId, warehouseId, payload) =>
    request(`${base(companyId)}/warehouses/${encodeURIComponent(warehouseId)}`, {
      method: 'PATCH',
      body: payload,
    }),

  // ============================================================
  // ZONES
  // ============================================================

  zones: (companyId, warehouseId) =>
    request(`${base(companyId)}/warehouses/${encodeURIComponent(warehouseId)}/zones`),

  createZone: (companyId, warehouseId, payload) =>
    request(`${base(companyId)}/warehouses/${encodeURIComponent(warehouseId)}/zones`, {
      method: 'POST',
      body: payload,
    }),

  updateZone: (companyId, zoneId, payload) =>
    request(`${base(companyId)}/zones/${encodeURIComponent(zoneId)}`, {
      method: 'PATCH',
      body: payload,
    }),

  // ============================================================
  // LOCATIONS / BINS
  // ============================================================

  locations: (companyId, filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined)
        params.set(key, value);
    });
    const qs = params.toString();
    return request(`${base(companyId)}/locations${qs ? `?${qs}` : ''}`);
  },

  location: (companyId, locationId) =>
    request(`${base(companyId)}/locations/${encodeURIComponent(locationId)}`),

  locationByBarcode: (companyId, barcode) =>
    request(`${base(companyId)}/locations/by-barcode/${encodeURIComponent(barcode)}`),

  createLocation: (companyId, payload) =>
    request(`${base(companyId)}/locations`, {
      method: 'POST',
      body: payload,
    }),

  updateLocation: (companyId, locationId, payload) =>
    request(`${base(companyId)}/locations/${encodeURIComponent(locationId)}`, {
      method: 'PATCH',
      body: payload,
    }),

  bulkCreateLocations: (companyId, payload) =>
    request(`${base(companyId)}/locations/bulk-create`, {
      method: 'POST',
      body: payload,
    }),

  // ============================================================
  // INVENTORY ITEMS MASTER
  // ============================================================

  inventoryItems: (companyId, filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined)
        params.set(key, value);
    });
    const qs = params.toString();
    return request(`${base(companyId)}/inventory/items${qs ? `?${qs}` : ''}`);
  },

  inventoryItem: (companyId, itemId) =>
    request(`${base(companyId)}/inventory/items/${encodeURIComponent(itemId)}`),

  createInventoryItem: (companyId, payload) =>
    request(`${base(companyId)}/inventory/items`, {
      method: 'POST',
      body: payload,
    }),

  updateInventoryItem: (companyId, itemId, payload) =>
    request(`${base(companyId)}/inventory/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      body: payload,
    }),

  // ============================================================
  // INVENTORY BALANCES & VALUATION
  // ============================================================

  inventoryBalances: (companyId, filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined)
        params.set(key, value);
    });
    const qs = params.toString();
    return request(`${base(companyId)}/inventory/balances${qs ? `?${qs}` : ''}`);
  },

  inventoryValueReport: (companyId, { warehouseId, category } = {}) => {
    const params = new URLSearchParams();
    if (warehouseId) params.set('warehouse_id', warehouseId);
    if (category) params.set('category', category);
    const qs = params.toString();
    return request(`${base(companyId)}/inventory/value-report${qs ? `?${qs}` : ''}`);
  },

  // ============================================================
  // INVENTORY TRANSACTIONS (MOVEMENT JOURNAL)
  // ============================================================

  inventoryTransactions: (companyId, filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined)
        params.set(key, value);
    });
    const qs = params.toString();
    return request(`${base(companyId)}/inventory/transactions${qs ? `?${qs}` : ''}`);
  },

  inventoryTransaction: (companyId, txnId) =>
    request(`${base(companyId)}/inventory/transactions/${encodeURIComponent(txnId)}`),

  createAdjustment: (companyId, payload) =>
    request(`${base(companyId)}/inventory/transactions`, {
      method: 'POST',
      body: payload,
    }),

  postTransaction: (companyId, txnId) =>
    request(`${base(companyId)}/inventory/transactions/${encodeURIComponent(txnId)}/post`, {
      method: 'POST',
      body: {},
    }),

  reverseTransaction: (companyId, txnId, reason = '') =>
    request(`${base(companyId)}/inventory/transactions/${encodeURIComponent(txnId)}/reverse`, {
      method: 'POST',
      body: { reason },
    }),

  // ============================================================
  // RECEIPT TO INVENTORY HANDOFF
  // ============================================================

  postReceiptToInventory: (companyId, receiptId, payload = {}) =>
    request(
      `${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/post-to-inventory`,
      { method: 'POST', body: payload }
    ),

  receiptPostingQueue: (companyId, status) => {
    const params = status ? `?status=${status}` : '';
    return request(`${base(companyId)}/receipts/posting-queue${params}`);
  },

  receiptPostingStatus: (companyId, receiptId) =>
    request(`${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/posting-status`),

  // ============================================================
  // STOCKTAKE / CYCLE COUNTING
  // ============================================================

  stocktakeSessions: (companyId, filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined)
        params.set(key, value);
    });
    const qs = params.toString();
    return request(`${base(companyId)}/stocktake/sessions${qs ? `?${qs}` : ''}`);
  },

  createStocktakeSession: (companyId, payload) =>
    request(`${base(companyId)}/stocktake/sessions`, {
      method: 'POST',
      body: payload,
    }),

  stocktakeSession: (companyId, sessionId) =>
    request(`${base(companyId)}/stocktake/sessions/${encodeURIComponent(sessionId)}`),

  startStocktake: (companyId, sessionId) =>
    request(`${base(companyId)}/stocktake/sessions/${encodeURIComponent(sessionId)}/start`, {
      method: 'POST',
      body: {},
    }),

  saveStockCount: (companyId, sessionId, lineId, countedQty) =>
    request(`${base(companyId)}/stocktake/sessions/${encodeURIComponent(sessionId)}/counts`, {
      method: 'POST',
      body: { line_id: lineId, counted_qty: countedQty },
    }),

  completeStocktake: (companyId, sessionId) =>
    request(`${base(companyId)}/stocktake/sessions/${encodeURIComponent(sessionId)}/complete`, {
      method: 'POST',
      body: {},
    }),

  postStocktakeAdjustments: (companyId, sessionId) =>
    request(`${base(companyId)}/stocktake/sessions/${encodeURIComponent(sessionId)}/post`, {
      method: 'POST',
      body: {},
    }),

  varianceReasons: (companyId) =>
    request(`${base(companyId)}/stocktake/variance-reasons`),

  stocktakeVariances: (companyId, sessionId) =>
    request(
      `${base(companyId)}/stocktakes/${encodeURIComponent(sessionId)}/variances`
    ),
  // ============================================================
  // TRANSFER REQUESTS
  // ============================================================

  transferRequests: (companyId, filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined)
        params.set(key, value);
    });
    const qs = params.toString();
    return request(`${base(companyId)}/transfers${qs ? `?${qs}` : ''}`);
  },

  createTransferRequest: (companyId, payload) =>
    request(`${base(companyId)}/transfers`, {
      method: 'POST',
      body: payload,
    }),

  // ============================================================
  // REORDER ALERTS
  // ============================================================

  inventoryAlerts: (companyId, includeAcknowledged = false) =>
    request(
      `${base(companyId)}/inventory/alerts${includeAcknowledged ? '?include_acknowledged=true' : ''}`
    ),

  generateAlerts: (companyId, warehouseId) => {
    const params = warehouseId ? `?warehouse_id=${warehouseId}` : '';
    return request(`${base(companyId)}/inventory/alerts/generate${params}`, {
      method: 'POST',
      body: {},
    });
  },

  acknowledgeAlert: (companyId, alertId) =>
    request(`${base(companyId)}/inventory/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
      method: 'POST',
      body: {},
    }),

  // ============================================================
  // SETTINGS & REFERENCE DATA
  // ============================================================

  inventorySettings: (companyId) =>
    request(`${base(companyId)}/inventory/settings`),

  updateInventorySettings: (companyId, payload) =>
    request(`${base(companyId)}/inventory/settings`, {
      method: 'PATCH',
      body: payload,
    }),

  uomList: (companyId) =>
    request(`${base(companyId)}/inventory/uom`),

  inventoryCategories: (companyId) =>
    request(`${base(companyId)}/inventory/categories`),

};
