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
      product:"finflow"
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
};
