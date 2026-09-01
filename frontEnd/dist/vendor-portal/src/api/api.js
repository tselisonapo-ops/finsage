const API="/api";

const TOKEN_KEY="finflow_vendor_token";
const COMPANY_KEY="finflow_vendor_company";

export function getToken(){
  return localStorage.getItem(TOKEN_KEY);
}

export function getCompanyId(){
  return localStorage.getItem(COMPANY_KEY);
}

export function savePortalSession(companyId,token){
  localStorage.setItem(
    COMPANY_KEY,
    String(companyId)
  );

  localStorage.setItem(
    TOKEN_KEY,
    token
  );
}

export function clearPortalSession(){
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(COMPANY_KEY);
}

async function request(url,options={}){
  const token=getToken();

  const headers={
    ...(options.body instanceof FormData
      ?{}
      :{"Content-Type":"application/json"}),

    ...(token
      ?{Authorization:`Bearer ${token}`}
      :{}),

    ...(options.headers||{})
  };

  const res=await fetch(url,{
    ...options,
    headers,
    body:
      options.body instanceof FormData
        ?options.body
        :options.body!==undefined
          ?JSON.stringify(options.body)
          :undefined
  });

  let data={};

  try{
    data=await res.json();
  }catch{}

  if(!res.ok){
    throw new Error(
      data.error||
      data.message||
      `Request failed (${res.status})`
    );
  }

  return data;
}

const base=companyId=>
  `${API}/companies/${encodeURIComponent(companyId)}/ops/vendor-portal`;

export const portalApi={
  invite:(companyId,token)=>
    request(
      `${base(companyId)}/invite/${encodeURIComponent(token)}`
    ),

  acceptInvite:(companyId,token,payload)=>
    request(
      `${base(companyId)}/invite/${encodeURIComponent(token)}/accept`,
      {
        method:"POST",
        body:payload
      }
    ),

  signin:(companyId,payload)=>
    request(
      `${base(companyId)}/signin`,
      {
        method:"POST",
        body:payload
      }
    ),

  session:companyId=>
    request(
      `${base(companyId)}/session`
    ),

  rfqs:companyId=>
    request(
      `${base(companyId)}/rfqs`
    ),

  rfq:(companyId,eventId)=>
    request(
      `${base(companyId)}/rfqs/${encodeURIComponent(eventId)}`
    ),

  saveQuote:(companyId,quoteId,payload)=>
    request(
      `${base(companyId)}/quotes/${encodeURIComponent(quoteId)}`,
      {
        method:"PATCH",
        body:payload
      }
    ),

  submitQuote:(companyId,quoteId)=>
    request(
      `${base(companyId)}/quotes/${encodeURIComponent(quoteId)}/submit`,
      {
        method:"POST",
        body:{}
      }
    ),

  uploadQuoteDocument:(companyId,quoteId,file,documentType="quotation")=>{
    const form=new FormData();

    form.append("file",file);
    form.append(
      "document_type",
      documentType
    );

    return request(
      `${base(companyId)}/quotes/${encodeURIComponent(quoteId)}/documents`,
      {
        method:"POST",
        body:form
      }
    );
  },

    updateProfile:(companyId,payload)=>
    request(
        `${base(companyId)}/profile`,
        {
        method:"PATCH",
        body:payload
        }
    ),

    purchaseOrders:companyId=>
    request(
        `${base(companyId)}/purchase-orders`
    ),

    purchaseOrder:(companyId,poId)=>
    request(
        `${base(companyId)}/purchase-orders/${encodeURIComponent(poId)}`
    ),

    acknowledgePurchaseOrder:(companyId,poId,decision,comment="")=>
    request(
        `${base(companyId)}/purchase-orders/${encodeURIComponent(poId)}/acknowledge`,
        {
        method:"POST",
        body:{
            decision,
            comment
        }
        }
    ),

    invoices:companyId=>
    request(`${base(companyId)}/invoices`),

    invoice:(companyId,invoiceId)=>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}`),

    createInvoice:(companyId,poId,payload)=>
    request(`${base(companyId)}/purchase-orders/${encodeURIComponent(poId)}/invoices`,{
        method:"POST",body:payload
    }),

    submitInvoice:(companyId,invoiceId)=>
    request(`${base(companyId)}/invoices/${encodeURIComponent(invoiceId)}/submit`,{
        method:"POST",body:{}
    }),
};