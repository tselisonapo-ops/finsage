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

  createRequest:(companyId,payload)=>
    request(`${base(companyId)}/requests`,{
      method:"POST",
      body:payload
    }),

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
};
