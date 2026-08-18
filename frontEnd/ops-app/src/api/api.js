export const API_BASE=(import.meta.env.VITE_API_BASE||"").replace(/\/$/,"");

export const TOKEN_KEY="finsphere_token";
export const COMPANY_KEY="finsphere_company_id";

export const getToken=()=>localStorage.getItem(TOKEN_KEY)||"";
export const getCompanyId=()=>Number(localStorage.getItem(COMPANY_KEY)||0)||null;
export const companyApi={
  get:companyId=>request(`/api/companies/${encodeURIComponent(companyId)}`),
  branding:companyId=>request(`/api/companies/${encodeURIComponent(companyId)}/branding`)
};
export function setSession(token,companyId){
  if(token) localStorage.setItem(TOKEN_KEY,token);
  if(companyId) localStorage.setItem(COMPANY_KEY,String(companyId));
}

export function clearSession(){
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(COMPANY_KEY);
}

async function request(path,{method="GET",body,auth=true}={}){
  const headers={"Content-Type":"application/json"};
  const token=getToken();

  if(auth&&token) headers.Authorization=`Bearer ${token}`;

  const res=await fetch(`${API_BASE}${path}`,{
    method,
    headers,
    body:body===undefined?undefined:JSON.stringify(body)
  });

  let data={};
  try{data=await res.json();}catch{}

  if(!res.ok){
    const err=new Error(data.error||data.message||`Request failed (${res.status})`);
    err.status=res.status;
    err.data=data;
    throw err;
  }

  return data;
}

async function download(url,fileName){
  const token=getToken();

  const res=await fetch(url,{
    method:"GET",
    headers:{
      ...(token?{Authorization:`Bearer ${token}`}:{})
    }
  });

  if(!res.ok){
    let message=`Request failed (${res.status})`;

    try{
      const data=await res.json();
      message=data.error||data.message||message;
    }catch{}

    throw new Error(message);
  }

  const blob=await res.blob();
  const href=URL.createObjectURL(blob);
  const a=document.createElement("a");

  a.href=href;
  a.download=fileName||"document";
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(href);
}

export const authApi={
  signin:(email,password)=>request("/api/auth/signin",{
    method:"POST",
    auth:false,
    body:{
      email,
      password,
      product:"FinSage Nexus"
    }
  }),
  acceptInvite:payload=>request("/api/auth/accept-invite",{
    method:"POST",
    auth:false,
    body:payload
  })
};

const base=companyId=>`/api/companies/${encodeURIComponent(companyId)}/ops`;

export const opsApi={
  session:companyId=>request(`${base(companyId)}/session`),
  setup:companyId=>request(`${base(companyId)}/setup`),

  settings:(companyId,payload)=>request(`${base(companyId)}/settings`,{
    method:"PATCH",body:payload
  }),

  governance:companyId=>request(`${base(companyId)}/governance`),

  saveGovernance:(companyId,payload)=>request(`${base(companyId)}/governance`,{
    method:"PUT",body:payload
  }),

  createDepartment:(companyId,payload)=>request(`${base(companyId)}/departments`,{
    method:"POST",body:payload
  }),

  updateDepartment:(companyId,id,payload)=>request(
    `${base(companyId)}/departments/${encodeURIComponent(id)}`,
    {method:"PATCH",body:payload}
  ),

  createPosition:(companyId,payload)=>request(`${base(companyId)}/positions`,{
    method:"POST",body:payload
  }),

  updatePosition:(companyId,positionId,payload)=>
    request(
      `${base(companyId)}/positions/${encodeURIComponent(positionId)}`,
      {method:"PATCH",body:payload}
    ),

  updateUserAccess:(companyId,userId,payload)=>request(
    `${base(companyId)}/users/${encodeURIComponent(userId)}/access`,
    {method:"PATCH",body:payload}
  ),

  inviteUser:payload=>request("/api/invites",{
    method:"POST",
    body:payload
  }),

  requestTypes:companyId=>
    request(`${base(companyId)}/request-types`),

  requests:(companyId,{status}={})=>{
    const qs=new URLSearchParams();

    if(status) qs.set("status",status);

    return request(
      `${base(companyId)}/requests${qs.toString()?`?${qs}`:""}`
    );
  },

  request:(companyId,requestId)=>
    request(
      `${base(companyId)}/requests/${encodeURIComponent(requestId)}`
    ),

  createRequest:(companyId,payload)=>request(`${base(companyId)}/requests`,{
    method:"POST",body:payload
  }),

  updateRequest:(companyId,requestId,payload)=>request(
    `${base(companyId)}/requests/${encodeURIComponent(requestId)}`,
    {method:"PATCH",body:payload}
  ),

  submitRequest:(companyId,requestId)=>
    request(
      `${base(companyId)}/requests/${encodeURIComponent(requestId)}/submit`,
      {method:"POST",body:{}}
    ),

  approvals:(companyId,status="pending")=>
    request(
      `${base(companyId)}/approvals?status=${encodeURIComponent(status)}`
    ),

  decideApproval:(companyId,taskId,decision,comment="")=>
    request(
      `${base(companyId)}/approvals/${encodeURIComponent(taskId)}/decision`,
      {
        method:"POST",
        body:{decision,comment}
      }
    ),

  budgetCheck:(companyId,requestId)=>
    request(
      `${base(companyId)}/requests/${encodeURIComponent(requestId)}/budget-check`,
      {
        method:"POST",
        body:{}
      }
    ),

  latestBudgetCheck:(companyId,requestId)=>
    request(
      `${base(companyId)}/requests/${encodeURIComponent(requestId)}/budget-check`
    ),

  budgetRules:companyId=>
    request(`${base(companyId)}/budget-rules`),

  createBudgetRule:(companyId,payload)=>
    request(`${base(companyId)}/budget-rules`,{
      method:"POST",
      body:payload
    }),

  budgetCheck:(companyId,requestId)=>request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}/budget-check`,{method:"POST",body:{}}),

  latestBudgetCheck:(companyId,requestId)=>request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}/budget-check`),

  budgetRules:companyId=>request(`${base(companyId)}/budget-rules`),

  createBudgetRule:(companyId,payload)=>request(`${base(companyId)}/budget-rules`,{method:"POST",body:payload}),

  requestDocument:(companyId,requestId)=>request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}/document`),

  snapshotRequestDocument:(companyId,requestId)=>request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}/document/snapshot`,{method:"POST",body:{}}),

  financeAccounts:companyId=>request(`${base(companyId)}/finance/accounts`),

  request:(companyId,requestId)=>request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}`),

  requestTypes:companyId=>request(`${base(companyId)}/request-types`),

  financeAccounts:companyId=>request(`${base(companyId)}/finance/accounts`),

  createRequest:(companyId,payload)=>request(`${base(companyId)}/requests`,{
    method:"POST",body:payload
  }),

  submitRequest:(companyId,requestId)=>request(
    `${base(companyId)}/requests/${encodeURIComponent(requestId)}/submit`,
    {method:"POST",body:{}}
  ),

  budgetCheck:(companyId,requestId)=>request(
    `${base(companyId)}/requests/${encodeURIComponent(requestId)}/budget-check`,
    {method:"POST",body:{}}
  ),

  latestBudgetCheck:(companyId,requestId)=>request(
    `${base(companyId)}/requests/${encodeURIComponent(requestId)}/budget-check`
  ),

  requestDocument:(companyId,requestId)=>request(
    `${base(companyId)}/requests/${encodeURIComponent(requestId)}/document`
  ),

  financeMetadata:companyId=>request(`${base(companyId)}/finance/metadata`),

  financeReview:(companyId,requestId,taskId)=>
    request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}/finance-review?approval_task_id=${encodeURIComponent(taskId)}`),

  saveFinanceReview:(companyId,requestId,payload)=>
    request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}/finance-review`,{
      method:"PATCH",body:payload
    }),

  costCentres:companyId=>request(`${base(companyId)}/cost-centres`),

  createCostCentre:(companyId,payload)=>request(`${base(companyId)}/cost-centres`,{
    method:"POST",body:payload
  }),

  requestDocuments:companyId=>request(`${base(companyId)}/requests`),

  requestDocumentList:(companyId,requestId)=>
    request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}/documents`),

  exportRequestDocument:(companyId,requestId,format)=>
    request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}/documents/export`,{
      method:"POST",
      body:{format}
    }),

  downloadRequestDocument:(companyId,documentId,fileName)=>
    download(
      `${base(companyId)}/documents/${encodeURIComponent(documentId)}/download`,
      fileName
    ),

  requestAudit:(companyId,requestId)=>
    request(`${base(companyId)}/requests/${encodeURIComponent(requestId)}/audit`),

  procurement:(companyId,{status=""}={})=>{
    const params=new URLSearchParams();
    if(status) params.set("status",status);
    const qs=params.toString();

    return request(
      `${base(companyId)}/procurement${qs?`?${qs}`:""}`
    );
  },

  procurementSettings:companyId=>
    request(`${base(companyId)}/procurement/settings`),

  updateProcurementSettings:(companyId,payload)=>
    request(`${base(companyId)}/procurement/settings`,{
      method:"PATCH",
      body:JSON.stringify(payload)
    }),

  procurementPolicies:companyId=>
    request(`${base(companyId)}/procurement/policies`),

  createProcurementPolicy:(companyId,payload)=>
    request(`${base(companyId)}/procurement/policies`,{
      method:"POST",
      body:JSON.stringify(payload)
    }),

  createProcurementPolicyRule:(companyId,policyId,payload)=>
    request(
      `${base(companyId)}/procurement/policies/${encodeURIComponent(policyId)}/rules`,
      {
        method:"POST",
        body:JSON.stringify(payload)
      }
    ),

  procurementVendors:companyId=>
    request(`${base(companyId)}/procurement/vendors`),

  updateProcurementVendor:(companyId,vendorId,payload)=>
    request(
      `${base(companyId)}/procurement/vendors/${encodeURIComponent(vendorId)}`,
      {
        method:"PATCH",
        body:JSON.stringify(payload)
      }
    ),

  procurementVendors:(companyId,filters={})=>{
    const params=new URLSearchParams();

    Object.entries(filters).forEach(([key,value])=>{
      if(value!==""&&value!==null&&value!==undefined)
        params.set(key,value);
    });

    const qs=params.toString();

    return request(
      `${base(companyId)}/procurement/vendors${qs?`?${qs}`:""}`
    );
  },

  procurementVendor:(companyId,vendorId)=>
    request(
      `${base(companyId)}/procurement/vendors/${encodeURIComponent(vendorId)}`
    ),

  updateProcurementVendor:(companyId,vendorId,payload)=>
    request(
      `${base(companyId)}/procurement/vendors/${encodeURIComponent(vendorId)}`,
      {
        method:"PATCH",
        body:payload
      }
    ),

  createProcurementVendorContact:(companyId,vendorId,payload)=>
    request(
      `${base(companyId)}/procurement/vendors/${encodeURIComponent(vendorId)}/contacts`,
      {
        method:"POST",
        body:payload
      }
    ),

  updateProcurementVendorContact:(companyId,vendorId,contactId,payload)=>
    request(
      `${base(companyId)}/procurement/vendors/${encodeURIComponent(vendorId)}/contacts/${encodeURIComponent(contactId)}`,
      {
        method:"PATCH",
        body:payload
      }
    ),

  procurementSettings:companyId=>
    request(
      `${base(companyId)}/procurement/settings`
    ),

  updateProcurementSettings:(companyId,payload)=>
    request(
      `${base(companyId)}/procurement/settings`,
      {
        method:"PATCH",
        body:payload
      }
    ),

  testProcurementEmail:(companyId,recipient_email)=>
    request(
      `${base(companyId)}/procurement/settings/test-email`,
      {
        method:"POST",
        body:{recipient_email}
      }
    ),

  createSourcingEvent:(companyId,caseId,payload)=>
    request(
      `${base(companyId)}/procurement/${encodeURIComponent(caseId)}/sourcing`,
      {
        method:"POST",
        body:payload
      }
    ),

  sourcingEvent:(companyId,eventId)=>
    request(
      `${base(companyId)}/sourcing/${encodeURIComponent(eventId)}`
    ),

  updateSourcingEvent:(companyId,eventId,payload)=>
    request(
      `${base(companyId)}/sourcing/${encodeURIComponent(eventId)}`,
      {
        method:"PATCH",
        body:payload
      }
    ),

  updateSourcingItem:(companyId,eventId,itemId,payload)=>
    request(
      `${base(companyId)}/sourcing/${encodeURIComponent(eventId)}/items/${encodeURIComponent(itemId)}`,
      {
        method:"PATCH",
        body:payload
      }
    ),

  eligibleSourcingVendors:(companyId,eventId)=>
    request(
      `${base(companyId)}/sourcing/${encodeURIComponent(eventId)}/eligible-vendors`
    ),

  addSourcingVendor:(companyId,eventId,vendorId)=>
    request(
      `${base(companyId)}/sourcing/${encodeURIComponent(eventId)}/vendors/${encodeURIComponent(vendorId)}`,
      {
        method:"POST",
        body:{}
      }
    ),

  removeSourcingVendor:(companyId,eventId,vendorId)=>
    request(
      `${base(companyId)}/sourcing/${encodeURIComponent(eventId)}/vendors/${encodeURIComponent(vendorId)}`,
      {
        method:"DELETE"
      }
    ),

  issueSourcingRfq:(companyId,eventId)=>
    request(
      `${base(companyId)}/sourcing/${encodeURIComponent(eventId)}/issue`,
      {
        method:"POST",
        body:{}
      }
    ),

  procurementCase:(companyId,caseId)=>
    request(
      `${base(companyId)}/procurement/${encodeURIComponent(caseId)}`
    ),

  quoteComparison:(companyId,eventId)=>
    apiFetch(
      `/api/companies/${companyId}/sourcing-events/${eventId}/comparison`
    ),

  startEvaluation:(companyId,eventId)=>
    apiFetch(
      `/api/companies/${companyId}/sourcing-events/${eventId}/evaluation/start`,
      {
        method:"POST",
        body:{}
      }
    ),

  calculateEvaluation:(companyId,eventId)=>
    apiFetch(
      `/api/companies/${companyId}/sourcing-events/${eventId}/evaluation/calculate`,
      {
        method:"POST",
        body:{}
      }
    ),

  saveEvaluationScore:(companyId,eventId,payload)=>
    apiFetch(
      `/api/companies/${companyId}/sourcing-events/${eventId}/evaluation/scores`,
      {
        method:"PUT",
        body:payload
      }
    ),

  declareEvaluationConflict:(companyId,eventId,payload)=>
    apiFetch(
      `/api/companies/${companyId}/sourcing-events/${eventId}/evaluation/declaration`,
      {
        method:"POST",
        body:payload
      }
    ),

  recommendVendor:(companyId,eventId,payload)=>
    apiFetch(
      `/api/companies/${companyId}/sourcing-events/${eventId}/recommend`,
      {
        method:"POST",
        body:payload
      }
    ),

  createAward:(companyId,eventId,payload={})=>
    request(
      `${base(companyId)}/sourcing-events/${encodeURIComponent(eventId)}/award`,
      {
        method:"POST",
        body:payload
      }
    ),

  award:(companyId,awardId)=>
    request(
      `${base(companyId)}/awards/${encodeURIComponent(awardId)}`
    ),

  submitAward:(companyId,awardId,payload={})=>
    request(
      `${base(companyId)}/awards/${encodeURIComponent(awardId)}/submit`,
      {
        method:"POST",
        body:payload
      }
    ),

  awardApprovals:companyId=>
    request(
      `${base(companyId)}/award-approvals`
    ),

  decideAward:(companyId,taskId,decision,comment="")=>
    request(
      `${base(companyId)}/award-approvals/${encodeURIComponent(taskId)}/decision`,
      {
        method:"POST",
        body:{
          decision,
          comment
        }
      }
    ),

  createPurchaseOrder:(companyId,awardId)=>
    request(
      `${base(companyId)}/awards/${encodeURIComponent(awardId)}/purchase-order`,
      {
        method:"POST",
        body:{}
      }
    ),

  purchaseOrder:(companyId,poId)=>
    request(
      `${base(companyId)}/purchase-orders/${encodeURIComponent(poId)}`
    ),

  updatePurchaseOrder:(companyId,poId,payload)=>
    request(
      `${base(companyId)}/purchase-orders/${encodeURIComponent(poId)}`,
      {
        method:"PATCH",
        body:payload
      }
    ),

  issuePurchaseOrder:(companyId,poId)=>
    request(
      `${base(companyId)}/purchase-orders/${encodeURIComponent(poId)}/issue`,
      {
        method:"POST",
        body:{}
      }
    ),

  sendPurchaseOrder:(companyId,poId)=>
    request(
      `${base(companyId)}/purchase-orders/${encodeURIComponent(poId)}/send`,
      {
        method:"POST",
        body:{}
      }
    ),

  cancelPurchaseOrder:(companyId,poId,reason)=>
    request(
      `${base(companyId)}/purchase-orders/${encodeURIComponent(poId)}/cancel`,
      {
        method:"POST",
        body:{reason}
      }
    ),

  createReceipt:(companyId,poId)=>
    request(
      `${base(companyId)}/purchase-orders/${encodeURIComponent(poId)}/receipts`,
      {
        method:"POST",
        body:{}
      }
    ),

  receipt:(companyId,receiptId)=>
    request(
      `${base(companyId)}/receipts/${encodeURIComponent(receiptId)}`
    ),

  updateReceipt:(companyId,receiptId,payload)=>
    request(
      `${base(companyId)}/receipts/${encodeURIComponent(receiptId)}`,
      {
        method:"PATCH",
        body:payload
      }
    ),

  saveServiceConfirmation:(companyId,receiptId,payload)=>
    request(
      `${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/service-confirmation`,
      {
        method:"PUT",
        body:payload
      }
    ),

  saveAssetReceipt:(companyId,receiptId,poLineId,payload)=>
    request(
      `${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/asset-lines/${encodeURIComponent(poLineId)}`,
      {
        method:"PUT",
        body:payload
      }
    ),

  saveLeaseReceipt:(companyId,receiptId,payload)=>
    request(
      `${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/lease`,
      {
        method:"PUT",
        body:payload
      }
    ),

  submitReceipt:(companyId,receiptId)=>
    request(
      `${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/submit`,
      {
        method:"POST",
        body:{}
      }
    ),

  verifyReceipt:(companyId,receiptId,comment="")=>
    request(
      `${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/verify`,
      {
        method:"POST",
        body:{comment}
      }
    ),

  rejectReceipt:(companyId,receiptId,reason)=>
    request(
      `${base(companyId)}/receipts/${encodeURIComponent(receiptId)}/reject`,
      {
        method:"POST",
        body:{reason}
      }
    ),

  apInvoices:(companyId,status="")=>
    request(`${base(companyId)}/accounts-payable/invoices${status?`?status=${encodeURIComponent(status)}`:""}`),

  createVendorInvoice:(companyId,poId,payload)=>
    request(`${base(companyId)}/purchase-orders/${encodeURIComponent(poId)}/invoices`,{
      method:"POST",body:payload
    }),

  vendorInvoice:(companyId,invoiceId)=>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}`),

  submitVendorInvoice:(companyId,invoiceId)=>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/submit`,{
      method:"POST",body:{}
    }),

  matchVendorInvoice:(companyId,invoiceId)=>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/match`,{
      method:"POST",body:{}
    }),

  reviewVendorInvoice:(companyId,invoiceId,payload)=>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/review`,{
      method:"PATCH",body:payload
    }),

  resolveInvoiceException:(companyId,exceptionId,comment,waive=false)=>
    request(`${base(companyId)}/invoice-exceptions/${encodeURIComponent(exceptionId)}/resolve`,{
      method:"POST",body:{comment,waive}
    }),

  acceptVendorInvoice:(companyId,invoiceId)=>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/accept`,{
      method:"POST",body:{}
    }),

  rejectVendorInvoice:(companyId,invoiceId,reason)=>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/reject`,{
      method:"POST",body:{reason}
    }),

  financeContext:companyId=>
    request(`${base(companyId)}/finance/context`),

  financeOverview:companyId=>
    request(`${base(companyId)}/finance/overview`),

  financeMyWork:companyId=>
    request(`${base(companyId)}/finance/my-work`),

  payablesSummary:companyId=>
    request(`${base(companyId)}/finance/payables/summary`),

  payablesQueue:(companyId,queue)=>
    request(`${base(companyId)}/finance/payables/${encodeURIComponent(queue)}`),

  saveInvoiceCoding:(companyId,invoiceId,lines)=>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/coding`,{
      method:"PUT",body:{lines}
    }),

  accountingHandoffPreview:(companyId,invoiceId)=>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/accounting-handoff`),

  handoffInvoiceToAccounting:(companyId,invoiceId)=>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/accounting-handoff`,{
      method:"POST"
    }),

  invoiceAccountingStatus:(companyId,invoiceId)=>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/accounting-status`),

  paymentEligibility:(companyId,invoiceId)=>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/payment-eligibility`),

  createPaymentVoucher:(companyId,invoiceId,payload)=>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/payment-vouchers`,{
      method:"POST",
      body:payload
    }),

  paymentVouchers:(companyId,{status="",q=""}={})=>{
    const params=new URLSearchParams();

    if(status) params.set("status",status);
    if(q) params.set("q",q);

    const qs=params.toString();

    return request(
      `${base(companyId)}/finance/payables/payment-vouchers${qs?`?${qs}`:""}`
    );
  },

  paymentVoucher:(companyId,voucherId)=>
    request(`${base(companyId)}/payment-vouchers/${encodeURIComponent(voucherId)}`),
};
