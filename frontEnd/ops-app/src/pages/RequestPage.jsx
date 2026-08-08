import {useEffect,useMemo,useState} from "react";
import {
  ArrowLeft,Building2,CalendarDays,CheckCircle2,FileText,
  Landmark,Plus,Save,Send,ShieldCheck,Trash2,WalletCards
} from "lucide-react";
import {useNavigate,useParams} from "react-router-dom";
import {API_BASE,companyApi,getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

const money=(value,currency="")=>
  `${currency||""} ${Number(value||0).toLocaleString(undefined,{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  })}`.trim();

const today=()=>new Date().toISOString().slice(0,10);

const assetUrl=url=>{
  if(!url) return "";
  if(/^https?:\/\//i.test(url)) return url;

  try{
    const backendOrigin=API_BASE
      ?new URL(API_BASE,window.location.origin).origin
      :window.location.origin;

    return new URL(url,`${backendOrigin}/`).href;
  }catch{
    return url;
  }
};

const emptyLine=()=>({
  description:"",
  quantity:1,
  unit_of_measure:"",
  estimated_unit_cost:""
});

const emptyForm=()=>({
  request_type_id:"",
  title:"",
  business_purpose:"",
  description:"",
  required_date:"",
  priority:"normal",
  estimated_amount:0,
  items:[emptyLine()]
});

const DOC_META={
  PURCHASE:{
    title:"Purchase Requisition",
    short:"PURCHASE REQUISITION",
    ref:"PR",
    tone:"purchase"
  },
  SERVICE:{
    title:"Service Requisition",
    short:"SERVICE REQUISITION",
    ref:"SR",
    tone:"service"
  },
  ASSET:{
    title:"Capital Expenditure Requisition",
    short:"CAPEX REQUISITION",
    ref:"CAPEX",
    tone:"capex"
  },
  LEASE:{
    title:"Lease Requisition",
    short:"LEASE REQUISITION",
    ref:"LR",
    tone:"lease"
  },
  PAYMENT:{
    title:"Payment Request",
    short:"PAYMENT REQUEST",
    ref:"PAY",
    tone:"payment"
  },
  TRAVEL:{
    title:"Travel Authorisation",
    short:"TRAVEL AUTHORISATION",
    ref:"TRV",
    tone:"travel"
  },
  GENERAL:{
    title:"General Requisition",
    short:"GENERAL REQUISITION",
    ref:"REQ",
    tone:"general"
  }
};

export default function RequestPage(){
  const companyId=getCompanyId();
  const nav=useNavigate();
  const {requestId}=useParams();
  const isNew=!requestId;

  const [session,setSession]=useState(null);
  const [setup,setSetup]=useState(null);
  const [types,setTypes]=useState([]);

  const [existing,setExisting]=useState(null);
  const [budget,setBudget]=useState(null);

  const [form,setForm]=useState(emptyForm());
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const set=(key,value)=>setForm(x=>({...x,[key]:value}));

  const selectedType=useMemo(
    ()=>types.find(x=>String(x.id)===String(form.request_type_id))||null,
    [types,form.request_type_id]
  );

  const typeCode=(selectedType?.code||existing?.request_type_code||"GENERAL").toUpperCase();
  const docMeta=DOC_META[typeCode]||DOC_META.GENERAL;

  const total=useMemo(
    ()=>form.items.reduce(
      (sum,line)=>sum+(Number(line.quantity||0)*Number(line.estimated_unit_cost||0)),
      0
    ),
    [form.items]
  );

  const currency=session?.currency||existing?.currency_code||"";

  async function load(){
    setError("");

    try{
      const [ctx,setupData,typeData,companyData,brandingData]=await Promise.all([
        opsApi.session(companyId),
        opsApi.setup(companyId),
        opsApi.requestTypes(companyId),
        companyApi.get(companyId),
        companyApi.branding(companyId).catch(()=>({}))
      ]);

      setSession({
        ...ctx,
        ...companyData,
        branding:brandingData||{}
      });

      setSetup(setupData);
      setTypes(typeData.rows||[]);

      if(!isNew){
        const row=await opsApi.request(companyId,requestId);
        setExisting(row);

        setForm({
          request_type_id:String(row.request_type_id||""),
          title:row.title||"",
          business_purpose:row.business_purpose||"",
          description:row.description||"",
          required_date:row.required_date?String(row.required_date).slice(0,10):"",
          priority:row.priority||"normal",
          estimated_amount:Number(row.estimated_amount||0),
          items:(row.items?.length?row.items:[emptyLine()]).map(line=>({
            id:line.id,
            description:line.description||"",
            quantity:Number(line.quantity||1),
            unit_of_measure:line.unit_of_measure||"",
            estimated_unit_cost:Number(line.estimated_unit_cost||0)
          }))
        });

        try{
          const budgetRow=await opsApi.latestBudgetCheck(companyId,requestId);
          setBudget(budgetRow?.id?budgetRow:null);
        }catch{}
      }
    }catch(err){
      setError(err.message||"Unable to load request.");
    }
  }

  useEffect(()=>{load();},[requestId]);

  useEffect(()=>{
    setForm(x=>({...x,estimated_amount:total}));
  },[total]);

  function updateLine(index,key,value){
    setForm(x=>({
      ...x,
      items:x.items.map((line,i)=>i===index?{...line,[key]:value}:line)
    }));
  }

  function addLine(){
    setForm(x=>({...x,items:[...x.items,emptyLine()]}));
  }

  function removeLine(index){
    setForm(x=>{
      const lines=x.items.filter((_,i)=>i!==index);
      return {...x,items:lines.length?lines:[emptyLine()]};
    });
  }

  function buildPayload(){
    return {
      request_type_id:Number(form.request_type_id),
      title:form.title.trim(),
      business_purpose:form.business_purpose.trim()||null,
      description:form.description.trim()||null,
      required_date:form.required_date||null,
      priority:form.priority,
      estimated_amount:Number(total||0),
      department_id:session?.department_id||null,
      branch_id:session?.branch_id||null,
      currency_code:currency,

      items:form.items
        .filter(line=>line.description.trim())
        .map((line,index)=>({
          line_no:index+1,
          description:line.description.trim(),
          quantity:Number(line.quantity||1),
          unit_of_measure:line.unit_of_measure||null,
          estimated_unit_cost:Number(line.estimated_unit_cost||0),
          estimated_total:Number(line.quantity||1)*Number(line.estimated_unit_cost||0)
        }))
    };
  }

  async function saveDraft(){
    if(!form.request_type_id){
      setError("Choose a request type.");
      return null;
    }

    if(!form.title.trim()){
      setError("Request title is required.");
      return null;
    }

    if(!form.items.some(line=>line.description.trim())&&selectedType?.requires_items){
      setError("Add at least one requisition line.");
      return null;
    }

    setBusy(true);
    setError("");

    try{
      if(!isNew){
        return existing;
      }

      const row=await opsApi.createRequest(companyId,buildPayload());
      setExisting(row);
      nav(`/requests/${row.id}`,{replace:true});
      return row;
    }catch(err){
      setError(err.message||"Unable to save requisition.");
      return null;
    }finally{
      setBusy(false);
    }
  }

  async function runBudgetCheck(){
    const row=existing||await saveDraft();
    if(!row?.id) return;

    setBusy(true);
    setError("");

    try{
      const result=await opsApi.budgetCheck(companyId,row.id);
      setBudget(result);
    }catch(err){
      setError(err.message||"Budget check failed.");
    }finally{
      setBusy(false);
    }
  }

  async function submit(){
    const row=existing||await saveDraft();
    if(!row?.id) return;

    setBusy(true);
    setError("");

    try{
      if(selectedType?.requires_budget||existing?.requires_budget)
        await opsApi.budgetCheck(companyId,row.id);

      const updated=await opsApi.submitRequest(companyId,row.id);
      setExisting(updated);

      try{
        const check=await opsApi.latestBudgetCheck(companyId,row.id);
        setBudget(check?.id?check:null);
      }catch{}
    }catch(err){
      setError(err.message||"Unable to submit requisition.");
    }finally{
      setBusy(false);
    }
  }

  if(!session||!setup)
    return <div className="loading-screen">Opening requisition…</div>;

  const requesterName=[session.first_name,session.last_name].filter(Boolean).join(" ");
  const requestNo=existing?.request_no||`${docMeta.ref}-DRAFT`;
  const requestStatus=existing?.status||"draft";

  const branding=session.branding||{};

  const documentStyle={
    "--doc-primary":
      branding.primary_color||
      branding.brand_primary||
      branding.primary||
      "#0b6b5e",

    "--doc-secondary":
      branding.secondary_color||
      branding.brand_secondary||
      branding.secondary||
      "#e9f5f2"
  };

  return (
    <Shell session={session} active="requests">
      <div className="requisition-screen" style={documentStyle}>
        <div className="requisition-page-header">
          <button type="button" className="ghost-btn" onClick={()=>nav("/requests")}>
            <ArrowLeft size={16}/> Requests
          </button>

          <div className="requisition-heading">
            <div>
              <span className="eyebrow dark">{isNew?"NEW REQUISITION":"REQUEST WORKSPACE"}</span>
              <h1>{isNew?"Prepare requisition":existing?.title}</h1>
              <p>{isNew
                ?"Complete the request while FinFlow builds the official document beside you."
                :`${existing?.request_no} · ${existing?.request_type_name}`}
              </p>
            </div>

            <div className="requisition-header-actions">
              {!isNew&&<span className={`status-pill ${requestStatus}`}>
                {requestStatus.replaceAll("_"," ")}
              </span>}

              <button type="button" className="ghost-btn" onClick={saveDraft} disabled={busy||!isNew}>
                <Save size={16}/> {busy?"Saving...":"Save draft"}
              </button>

              <button type="button" className="primary-btn" onClick={submit} disabled={busy||requestStatus!=="draft"}>
                <Send size={16}/> Submit
              </button>
            </div>
          </div>
        </div>

        {error&&<div className="alert error">{error}</div>}

        <div className="request-context-strip">
          <div className="request-context-card">
            <span>Requester</span>
            <strong>{requesterName||session.email}</strong>
            <small>{session.position_title||session.company_role||"Team member"}</small>
          </div>

          <div className="request-context-card">
            <span>Department</span>
            <strong>{session.department_name||"Unassigned"}</strong>
            <small>{session.branch_name||"Head office"}</small>
          </div>

          <div className="request-context-card">
            <span>Current request</span>
            <strong>{docMeta.title}</strong>
            <small>{requestNo}</small>
          </div>

          <div className="request-context-card accent">
            <span>Estimated total</span>
            <strong>{money(total,currency)}</strong>
            <small>{requestStatus.replaceAll("_"," ")}</small>
          </div>
        </div>

        <div className="requisition-workspace">

          <section className="requisition-input-panel">
            <div className="requisition-input-scroll">

              <div className="req-section">
                <div className="req-section-heading">
                  <div className="req-section-icon"><FileText size={17}/></div>
                  <div>
                    <h3>Request details</h3>
                    <p>Define what is required and why.</p>
                  </div>
                </div>

                <label>Request type</label>
                <select
                  value={form.request_type_id}
                  disabled={!isNew}
                  onChange={e=>set("request_type_id",e.target.value)}
                >
                  <option value="">Select request type</option>
                  {types.map(type=><option key={type.id} value={type.id}>{type.name}</option>)}
                </select>

                <label>Request title</label>
                <input
                  value={form.title}
                  disabled={!isNew}
                  onChange={e=>set("title",e.target.value)}
                  placeholder="e.g. Finance department laptop replacements"
                />

                <label>Business purpose</label>
                <textarea
                  rows="4"
                  value={form.business_purpose}
                  disabled={!isNew}
                  onChange={e=>set("business_purpose",e.target.value)}
                  placeholder="Explain why this expenditure is required and how it supports operations."
                />

                <div className="two-col">
                  <div>
                    <label>Required date</label>
                    <input
                      type="date"
                      value={form.required_date}
                      disabled={!isNew}
                      onChange={e=>set("required_date",e.target.value)}
                    />
                  </div>

                  <div>
                    <label>Priority</label>
                    <select
                      value={form.priority}
                      disabled={!isNew}
                      onChange={e=>set("priority",e.target.value)}
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="req-section">
                <div className="req-section-heading">
                  <div className="req-section-icon"><Building2 size={17}/></div>
                  <div>
                    <h3>Organisation</h3>
                    <p>Prefilled from your FinFlow profile.</p>
                  </div>
                </div>

                <div className="req-meta-grid">
                  <div className="req-readonly-field">
                    <span>Requester</span>
                    <strong>{requesterName||session.email}</strong>
                  </div>

                  <div className="req-readonly-field">
                    <span>Department</span>
                    <strong>{session.department_name||"Unassigned"}</strong>
                  </div>

                  <div className="req-readonly-field">
                    <span>Position</span>
                    <strong>{session.position_title||session.company_role}</strong>
                  </div>

                  <div className="req-readonly-field">
                    <span>Branch</span>
                    <strong>{session.branch_name||"Head office"}</strong>
                  </div>
                </div>
              </div>

              <div className="req-section">
                <div className="req-section-heading">
                  <div className="req-section-icon"><WalletCards size={17}/></div>
                  <div>
                    <h3>Requisition lines</h3>
                    <p>Each line may carry its own financial coding.</p>
                  </div>
                </div>

                <div className="req-lines">
                  {form.items.map((line,index)=>(
                    <div className="req-line-card" key={line.id||index}>
                      <div className="req-line-number">{index+1}</div>

                      <div className="req-line-main">
                        <label>Description</label>
                        <input
                          value={line.description}
                          disabled={!isNew}
                          onChange={e=>updateLine(index,"description",e.target.value)}
                          placeholder="Item or service description"
                        />

                        <div className="req-line-grid">
                          <div>
                            <label>Quantity</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.quantity}
                              disabled={!isNew}
                              onChange={e=>updateLine(index,"quantity",e.target.value)}
                            />
                          </div>

                          <div>
                            <label>Unit</label>
                            <input
                              value={line.unit_of_measure}
                              disabled={!isNew}
                              onChange={e=>updateLine(index,"unit_of_measure",e.target.value)}
                              placeholder="Each"
                            />
                          </div>

                          <div>
                            <label>Unit cost</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.estimated_unit_cost}
                              disabled={!isNew}
                              onChange={e=>updateLine(index,"estimated_unit_cost",e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="req-line-total">
                          <span>Line total</span>
                          <strong>{money(
                            Number(line.quantity||0)*Number(line.estimated_unit_cost||0),
                            currency
                          )}</strong>
                        </div>
                      </div>

                      {isNew&&form.items.length>1&&(
                        <button type="button" className="req-remove-line" onClick={()=>removeLine(index)}>
                          <Trash2 size={15}/>
                        </button>
                      )}
                    </div>
                  ))}

                  {isNew&&(
                    <button type="button" className="req-add-line" onClick={addLine}>
                      <Plus size={16}/> Add line
                    </button>
                  )}
                </div>
              </div>

              <div className="req-section">
                <div className="req-section-heading">
                  <div className="req-section-icon"><Landmark size={17}/></div>
                  <div>
                    <h3>Financial control</h3>
                    <p>Budget validation uses FinSage approved budgets and posted actuals.</p>
                  </div>
                </div>

                {!existing&&(
                  <div className="req-budget-empty">
                    Save the requisition first to run a live budget check.
                  </div>
                )}

                {existing&&!budget&&(
                  <button type="button" className="ghost-btn" onClick={runBudgetCheck} disabled={busy}>
                    <WalletCards size={16}/> Run budget check
                  </button>
                )}

                {budget&&(
                  <div className={`req-budget-result ${budget.result}`}>
                    <div className="req-budget-result-head">
                      {budget.result==="pass"
                        ?<CheckCircle2 size={20}/>
                        :<ShieldCheck size={20}/>}
                      <div>
                        <strong>{budget.result.replaceAll("_"," ").toUpperCase()}</strong>
                        <span>{budget.message}</span>
                      </div>
                    </div>

                    <div className="req-budget-values">
                      <div><span>Approved budget</span><strong>{money(budget.budget_amount,currency)}</strong></div>
                      <div><span>Actual expenditure</span><strong>{money(budget.actual_amount,currency)}</strong></div>
                      <div><span>Commitments</span><strong>{money(budget.committed_amount,currency)}</strong></div>
                      <div><span>This requisition</span><strong>{money(budget.requested_amount,currency)}</strong></div>
                      <div className="remaining"><span>Remaining</span><strong>{money(budget.available_after,currency)}</strong></div>
                    </div>

                    {budget.budget_name&&(
                      <small>Budget: {budget.budget_name}</small>
                    )}
                  </div>
                )}
              </div>

            </div>
          </section>

          <section className={`document-preview-shell ${docMeta.tone}`}>
            <div className="document-preview-toolbar">
              <div>
                <span>LIVE DOCUMENT</span>
                <strong>{docMeta.title}</strong>
              </div>
              <span className="status-pill draft">{requestStatus}</span>
            </div>

            <div className="document-paper">
              <DocumentTemplate
                typeCode={typeCode}
                meta={docMeta}
                session={session}
                requesterName={requesterName}
                requestNo={requestNo}
                form={form}
                total={total}
                currency={currency}
                budget={budget}
                existing={existing}
              />
            </div>
          </section>

        </div>
      </div>
    </Shell>
  );
}

function BrandHeader({session,title,requestNo}){
  const [logoFailed,setLogoFailed]=useState(false);

  const logo=assetUrl(session?.logo_url);

  return (
    <>
      <div className="doc-brand-stripe"/>

      <header className="doc-brand-header">
        <div className="doc-logo-box">
          {logo&&!logoFailed
            ?<img
                src={logo}
                alt={`${session.company_name||session.name||"Company"} logo`}
                onError={()=>setLogoFailed(true)}
              />
            :<div className="doc-logo-placeholder">
                {(session.company_name?.[0]||session.name?.[0]||"F").toUpperCase()}
              </div>}
        </div>

        <div className="doc-brand-title">
          <span>{title}</span>
          <strong>{requestNo}</strong>
        </div>

        <div className="doc-company-block">
          <strong>{session.company_name||session.name}</strong>
          {session.company_reg_no&&<span>Reg: {session.company_reg_no}</span>}
          {session.vat&&<span>VAT: {session.vat}</span>}
          {session.company_email&&<span>{session.company_email}</span>}
          {session.company_phone&&<span>{session.company_phone}</span>}
        </div>
      </header>
    </>
  );
}

function DocumentTemplate(props){
  switch(props.typeCode){
    case "PURCHASE":return <PurchaseTemplate {...props}/>;
    case "SERVICE":return <ServiceTemplate {...props}/>;
    case "ASSET":return <CapexTemplate {...props}/>;
    case "LEASE":return <LeaseTemplate {...props}/>;
    case "PAYMENT":return <PaymentTemplate {...props}/>;
    case "TRAVEL":return <TravelTemplate {...props}/>;
    default:return <GeneralTemplate {...props}/>;
  }
}

function DocumentInfo({session,requesterName,form,existing}){
  return (
    <div className="doc-info-grid">
      <div><span>Requester</span><strong>{requesterName||"-"}</strong></div>
      <div><span>Department</span><strong>{session.department_name||"-"}</strong></div>
      <div><span>Request Date</span><strong>{existing?.created_at?.slice?.(0,10)||today()}</strong></div>
      <div><span>Required Date</span><strong>{form.required_date||"-"}</strong></div>
      <div><span>Branch</span><strong>{session.branch_name||"Head office"}</strong></div>
      <div><span>Priority</span><strong>{form.priority}</strong></div>
    </div>
  );
}

function DocumentLines({form,currency}){
  return (
    <div className="doc-table">
      <div className="doc-table-row doc-table-head four">
        <span>Description</span>
        <span>Qty</span>
        <span>Unit Cost</span>
        <span>Amount</span>
      </div>

      {form.items.filter(x=>x.description||Number(x.estimated_unit_cost||0)).map((line,index)=>(
        <div className="doc-table-row four" key={index}>
          <span>{line.description||"-"}</span>
          <span>{Number(line.quantity||0).toLocaleString()}</span>
          <span>{money(line.estimated_unit_cost,currency)}</span>
          <strong>{money(Number(line.quantity||0)*Number(line.estimated_unit_cost||0),currency)}</strong>
        </div>
      ))}

      {!form.items.some(x=>x.description||Number(x.estimated_unit_cost||0))&&(
        <div className="doc-table-empty">
          Requisition lines will appear here as they are entered.
        </div>
      )}
    </div>
  );
}

function BudgetBlock({budget,currency}){
  return (
    <section className="doc-section doc-budget-section">
      <div className="doc-section-title">Budget Control</div>

      {!budget?(
        <div className="doc-muted">Budget validation pending.</div>
      ):(
        <div className="doc-budget-grid">
          <span>Approved Budget</span><strong>{money(budget.budget_amount,currency)}</strong>
          <span>Actual Expenditure</span><strong>{money(budget.actual_amount,currency)}</strong>
          <span>Commitments</span><strong>{money(budget.committed_amount,currency)}</strong>
          <span>This Requisition</span><strong>{money(budget.requested_amount,currency)}</strong>
          <span className="total">Remaining</span><strong className="total">{money(budget.available_after,currency)}</strong>
          <span>Status</span><strong className={`doc-budget-status ${budget.result}`}>{budget.result.toUpperCase()}</strong>
        </div>
      )}
    </section>
  );
}

function ApprovalBlock({existing}){
  const approvals=existing?.approvals||[];

  return (
    <section className="doc-section">
      <div className="doc-section-title">Approval Trail</div>

      {!approvals.length?(
        <div className="doc-muted">Approval workflow will appear after submission.</div>
      ):(
        <div className="doc-approval-list">
          {approvals.map((approval,index)=>(
            <div key={approval.id||index}>
              <span>{approval.step_name||`Approval ${index+1}`}</span>
              <strong>{approval.assignee_name||"-"}</strong>
              <em>{approval.status}</em>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DocTotal({total,currency,label="Requisition Total"}){
  return (
    <div className="doc-total">
      <span>{label}</span>
      <strong>{money(total,currency)}</strong>
    </div>
  );
}

function PurchaseTemplate(props){
  const {session,requesterName,requestNo,form,total,currency,budget,existing}=props;

  return (
    <article className="business-document purchase-document">
      <BrandHeader session={session} title="Purchase Requisition" requestNo={requestNo}/>
      <DocumentInfo {...{session,requesterName,form,existing}}/>

      <section className="doc-section">
        <div className="doc-section-title">Business Purpose</div>
        <p>{form.business_purpose||"Business purpose will appear here."}</p>
      </section>

      <section className="doc-section">
        <div className="doc-section-title">Goods / Services Required</div>
        <DocumentLines form={form} currency={currency}/>
        <DocTotal total={total} currency={currency}/>
      </section>

      <BudgetBlock budget={budget} currency={currency}/>
      <ApprovalBlock existing={existing}/>
      <DocumentFooter/>
    </article>
  );
}

function ServiceTemplate(props){
  const {session,requesterName,requestNo,form,total,currency,budget,existing}=props;

  return (
    <article className="business-document service-document">
      <BrandHeader session={session} title="Service Requisition" requestNo={requestNo}/>
      <DocumentInfo {...{session,requesterName,form,existing}}/>

      <section className="doc-highlight service">
        <span>Service Requirement</span>
        <strong>{form.title||"Service description"}</strong>
        <p>{form.business_purpose||"Describe the service requirement and expected outcome."}</p>
      </section>

      <section className="doc-section">
        <div className="doc-section-title">Scope & Estimated Costs</div>
        <DocumentLines form={form} currency={currency}/>
        <DocTotal total={total} currency={currency} label="Estimated Service Cost"/>
      </section>

      <BudgetBlock budget={budget} currency={currency}/>
      <ApprovalBlock existing={existing}/>
      <DocumentFooter/>
    </article>
  );
}

function CapexTemplate(props){
  const {session,requesterName,requestNo,form,total,currency,budget,existing}=props;

  return (
    <article className="business-document capex-document">
      <BrandHeader session={session} title="Capital Expenditure Requisition" requestNo={requestNo}/>

      <div className="doc-capex-banner">
        <Landmark size={20}/>
        <div>
          <span>CAPITAL INVESTMENT REQUEST</span>
          <strong>{form.title||"Proposed capital acquisition"}</strong>
        </div>
      </div>

      <DocumentInfo {...{session,requesterName,form,existing}}/>

      <section className="doc-section">
        <div className="doc-section-title">Investment Justification</div>
        <p>{form.business_purpose||"Capital investment justification will appear here."}</p>
      </section>

      <section className="doc-section">
        <div className="doc-section-title">Asset / Capital Items</div>
        <DocumentLines form={form} currency={currency}/>
        <DocTotal total={total} currency={currency} label="Total Capital Requirement"/>
      </section>

      <BudgetBlock budget={budget} currency={currency}/>
      <ApprovalBlock existing={existing}/>
      <DocumentFooter text="Approved CapEx will be eligible for handoff to FinSage PPE."/>
    </article>
  );
}

function LeaseTemplate(props){
  const {session,requesterName,requestNo,form,total,currency,budget,existing}=props;

  return (
    <article className="business-document lease-document">
      <BrandHeader session={session} title="Lease Requisition" requestNo={requestNo}/>
      <DocumentInfo {...{session,requesterName,form,existing}}/>

      <section className="doc-lease-focus">
        <span>PROPOSED LEASE</span>
        <strong>{form.title||"Lease requirement"}</strong>
        <p>{form.business_purpose||"Reason for entering into the proposed lease."}</p>
      </section>

      <section className="doc-section">
        <div className="doc-section-title">Estimated Lease Commitment</div>
        <DocumentLines form={form} currency={currency} showAccount={false}/>
        <DocTotal total={total} currency={currency} label="Estimated Commitment"/>
      </section>

      <BudgetBlock budget={budget} currency={currency}/>
      <ApprovalBlock existing={existing}/>
      <DocumentFooter text="Approved lease requests may be handed off to FinSage IFRS 16."/>
    </article>
  );
}

function PaymentTemplate(props){
  const {session,requesterName,requestNo,form,total,currency,budget,existing}=props;

  return (
    <article className="business-document payment-document">
      <BrandHeader session={session} title="Payment Request" requestNo={requestNo}/>

      <div className="payment-summary">
        <div>
          <span>PAYMENT REQUESTED</span>
          <strong>{money(total,currency)}</strong>
        </div>
        <div>
          <span>Prepared By</span>
          <strong>{requesterName||"-"}</strong>
        </div>
      </div>

      <DocumentInfo {...{session,requesterName,form,existing}}/>

      <section className="doc-section">
        <div className="doc-section-title">Payment Purpose</div>
        <p>{form.business_purpose||"Payment purpose will appear here."}</p>
      </section>

      <section className="doc-section">
        <div className="doc-section-title">Payment Lines</div>
        <DocumentLines form={form} currency={currency}/>
        <DocTotal total={total} currency={currency} label="Amount Requested"/>
      </section>

      <BudgetBlock budget={budget} currency={currency}/>
      <ApprovalBlock existing={existing}/>
      <DocumentFooter text="Payment processing remains subject to Finance verification and payment approval."/>
    </article>
  );
}

function TravelTemplate(props){
  const {session,requesterName,requestNo,form,total,currency,budget,existing}=props;

  return (
    <article className="business-document travel-document">
      <BrandHeader session={session} title="Travel Authorisation" requestNo={requestNo}/>

      <div className="travel-banner">
        <CalendarDays size={20}/>
        <div>
          <span>BUSINESS TRAVEL</span>
          <strong>{form.title||"Travel request"}</strong>
        </div>
      </div>

      <DocumentInfo {...{session,requesterName,form,existing}}/>

      <section className="doc-section">
        <div className="doc-section-title">Purpose of Travel</div>
        <p>{form.business_purpose||"Purpose of business travel will appear here."}</p>
      </section>

      <section className="doc-section">
        <div className="doc-section-title">Estimated Travel Costs</div>
        <DocumentLines form={form} currency={currency}/>
        <DocTotal total={total} currency={currency} label="Estimated Travel Cost"/>
      </section>

      <BudgetBlock budget={budget} currency={currency}/>
      <ApprovalBlock existing={existing}/>
      <DocumentFooter/>
    </article>
  );
}

function GeneralTemplate(props){
  const {session,requesterName,requestNo,form,total,currency,budget,existing}=props;

  return (
    <article className="business-document general-document">
      <BrandHeader session={session} title="General Requisition" requestNo={requestNo}/>
      <DocumentInfo {...{session,requesterName,form,existing}}/>

      <section className="doc-section">
        <div className="doc-section-title">Request</div>
        <h3>{form.title||"Request title"}</h3>
        <p>{form.business_purpose||form.description||"Request details will appear here."}</p>
      </section>

      <section className="doc-section">
        <DocumentLines form={form} currency={currency}/>
        <DocTotal total={total} currency={currency}/>
      </section>

      <BudgetBlock budget={budget} currency={currency}/>
      <ApprovalBlock existing={existing}/>
      <DocumentFooter/>
    </article>
  );
}

function DocumentFooter({text="This document was prepared and approved electronically through FinFlow."}){
  return (
    <footer className="doc-footer">
      <span>{text}</span>
      <strong>FinFlow · FinSphere</strong>
    </footer>
  );
}