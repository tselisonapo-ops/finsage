import {useEffect,useState} from "react";
import {
  AlertTriangle,ArrowRight,Check,CheckCircle2,Clock3,
  FileCheck2,Landmark,RotateCcw,Save,ShieldCheck,
  UserRound,WalletCards,X
} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

const money=(value,currency="")=>
  `${currency||""} ${Number(value||0).toLocaleString(undefined,{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  })}`.trim();

const dateText=value=>{
  if(!value) return "—";
  try{return new Date(value).toLocaleDateString();}
  catch{return String(value);}
};

export default function ApprovalsPage(){
  const companyId=getCompanyId();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [rows,setRows]=useState([]);
  const [selected,setSelected]=useState(null);
  const [comment,setComment]=useState("");
  const [decisionMode,setDecisionMode]=useState("");
  const [financeReview,setFinanceReview]=useState(null);
  const [financeMeta,setFinanceMeta]=useState(null);
  const [financeBusy,setFinanceBusy]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function load(){
    const [ctx,data]=await Promise.all([
      opsApi.session(companyId),
      opsApi.approvals(companyId)
    ]);

    setSession(ctx);
    setRows(data.rows||[]);

    if(selected){
      const refreshed=(data.rows||[]).find(x=>x.id===selected.id);
      setSelected(refreshed||null);
    }
  }

  useEffect(()=>{
    load().catch(err=>setError(err.message));
  },[]);

  function chooseDecision(mode){
    setDecisionMode(mode);
    setComment("");
    setError("");
  }

  const isFinanceTask=row=>
    row?.step_type==="review"||
    ["FINANCE_REVIEWER","FINANCE_MANAGER","CFO","ACCOUNTANT"]
      .includes(String(row?.approver_role_code||"").toUpperCase());

  async function loadFinanceReview(row){
    if(!row||!isFinanceTask(row)){
      setFinanceReview(null);
      setFinanceMeta(null);
      return;
    }

    setFinanceBusy(true);
    setError("");

    try{
      const [reviewData,meta]=await Promise.all([
        opsApi.financeReview(companyId,row.request_id,row.id),
        opsApi.financeMetadata(companyId)
      ]);

      const saved=reviewData.review||{};

      setFinanceMeta(meta);

      setFinanceReview({
        classification:saved.classification||"",
        account_code:saved.account_code||"",
        cost_centre_id:saved.cost_centre_id||"",
        project_id:saved.project_id||"",
        tax_treatment:saved.tax_treatment||"",
        gl_verified:Boolean(saved.gl_verified),
        tax_verified:Boolean(saved.tax_verified),
        documents_verified:Boolean(saved.documents_verified),
        budget_verified:Boolean(saved.budget_verified),
        budget_result:saved.budget_result||"",
        budget:reviewData.budget||null
      });
    }catch(err){
      setError(err.message);
    }finally{
      setFinanceBusy(false);
    }
  }

  const setFinance=(key,value)=>
    setFinanceReview(x=>({...x,[key]:value}));

  async function saveFinance(){
    if(!selected||!financeReview) return false;

    setFinanceBusy(true);
    setError("");

    try{
      const result=await opsApi.saveFinanceReview(
        companyId,
        selected.request_id,
        {
          approval_task_id:selected.id,
          classification:financeReview.classification,
          account_code:financeReview.account_code,
          cost_centre_id:financeReview.cost_centre_id
            ?Number(financeReview.cost_centre_id)
            :null,
          project_id:financeReview.project_id
            ?Number(financeReview.project_id)
            :null,
          tax_treatment:financeReview.tax_treatment,
          gl_verified:financeReview.gl_verified,
          tax_verified:financeReview.tax_verified,
          documents_verified:financeReview.documents_verified
        }
      );

      const saved=result.review||{};

      setFinanceReview(x=>({
        ...x,
        ...saved,
        cost_centre_id:saved.cost_centre_id||"",
        project_id:saved.project_id||"",
        budget:result.budget||x.budget
      }));

      return true;
    }catch(err){
      setError(err.message);
      return false;
    }finally{
      setFinanceBusy(false);
    }
  }

  async function decide(){
    if(!selected||!decisionMode) return;

    if(["return","reject"].includes(decisionMode)&&!comment.trim()){
      setError(
        decisionMode==="return"
          ?"Tell the requester what must be corrected."
          :"A rejection reason is required."
      );
      return;
    }

    setBusy(true);
    setError("");

    try{
      if(decisionMode==="approve"&&isFinanceTask(selected)){
        const saved=await saveFinance();
        if(!saved){
          setBusy(false);
          return;
        }
      }

      await opsApi.decideApproval(
        companyId,
        selected.id,
        decisionMode,
        comment.trim()
      );

      setSelected(null);
      setComment("");
      setDecisionMode("");
      await load();
    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  if(!session)
    return <div className="loading-screen">Loading approvals…</div>;

  return (
    <Shell session={session} active="approvals">

      <div className="page-header">
        <div>
          <span className="eyebrow dark">MY WORK</span>
          <h1>Approvals</h1>
          <p>Review requests assigned to you under your organisation's approval policy.</p>
        </div>

        <div className="approval-count">
          <Clock3 size={18}/>
          <strong>{rows.length}</strong>
          <span>Waiting</span>
        </div>
      </div>

      {error&&<div className="alert error">{error}</div>}

      <div className="approval-workspace">

        <section className="surface-card approval-inbox">
          <div className="approval-inbox-head">
            <div>
              <h2>Approval inbox</h2>
              <p>Requests that currently require your decision.</p>
            </div>

            <span className="approval-inbox-total">{rows.length}</span>
          </div>

          {!rows.length&&(
            <div className="beautiful-empty">
              <FileCheck2/>
              <h3>Nothing waiting</h3>
              <p>You have no pending approvals.</p>
            </div>
          )}

          <div className="approval-list">
            {rows.map(row=>(
              <button
                type="button"
                className={`approval-list-row ${selected?.id===row.id?"selected":""}`}
                key={row.id}
                onClick={()=>{
                  setSelected(row);
                  setComment("");
                  setDecisionMode("");
                  loadFinanceReview(row);
                }}
              >
                <div className="approval-list-icon">
                  <FileCheck2 size={17}/>
                </div>

                <div className="approval-list-copy">
                  <div className="approval-list-topline">
                    <strong>{row.title}</strong>
                    <span className={`priority-dot ${row.priority}`}>{row.priority}</span>
                  </div>

                  <span>{row.request_no} · {row.request_type_name}</span>

                  <small>
                    {row.requester_name||"Unknown requester"}
                    {" · "}
                    {row.department_name||"No department"}
                  </small>
                </div>

                <div className="approval-list-stage">
                  <span>Stage {row.step_no}</span>
                  <strong>{row.step_name}</strong>
                </div>

                <div className="approval-list-amount">
                  <strong>{money(row.estimated_amount,row.currency_code)}</strong>
                  <small>{row.budget_result?"Budget "+row.budget_result:"Budget pending"}</small>
                </div>

                <ArrowRight size={16}/>
              </button>
            ))}
          </div>
        </section>

        <aside className="surface-card approval-review-panel">

          {!selected?(
            <div className="beautiful-empty approval-select-empty">
              <ShieldCheck/>
              <h3>Select a request</h3>
              <p>Review the business need, workflow stage and available controls before deciding.</p>
            </div>
          ):(
            <>
              <div className="approval-review-head">
                <div>
                  <span className="eyebrow dark">APPROVAL REVIEW</span>
                  <h2>{selected.title}</h2>
                  <p>{selected.request_no} · {selected.request_type_name}</p>
                </div>

                <span className={`status-pill ${selected.priority}`}>
                  {selected.priority}
                </span>
              </div>

              <div className="approval-stage-banner">
                <div className="approval-stage-icon">
                  <ShieldCheck size={18}/>
                </div>

                <div>
                  <span>YOUR APPROVAL STAGE</span>
                  <strong>{selected.step_name}</strong>
                </div>

                <div className="approval-stage-progress">
                  <strong>
                    {Number(selected.completed_approval_count||0)+1}
                    /
                    {selected.total_approval_count||"—"}
                  </strong>
                  <span>workflow stage</span>
                </div>
              </div>

              <div className="approval-detail-grid">
                <div>
                  <span>Requester</span>
                  <strong>{selected.requester_name||"—"}</strong>
                  <small>{selected.requester_position||"Team member"}</small>
                </div>

                <div>
                  <span>Department</span>
                  <strong>{selected.department_name||"—"}</strong>
                  <small>{selected.branch_name||"Head office"}</small>
                </div>

                <div>
                  <span>Amount</span>
                  <strong>{money(selected.estimated_amount,selected.currency_code)}</strong>
                  <small>{selected.priority} priority</small>
                </div>

                <div>
                  <span>Required by</span>
                  <strong>{dateText(selected.required_date)}</strong>
                  <small>Submitted {dateText(selected.submitted_at)}</small>
                </div>
              </div>

              <section className="approval-review-section">
                <h3>Business purpose</h3>
                <p>
                  {selected.business_purpose||
                   selected.description||
                   "No business purpose was provided."}
                </p>
              </section>

              <section className="approval-review-section">
                <div className="approval-section-heading">
                  <h3>Budget position</h3>

                  {selected.budget_result&&(
                    <span className={`budget-state ${selected.budget_result}`}>
                      {selected.budget_result==="pass"
                        ?<CheckCircle2 size={14}/>
                        :<AlertTriangle size={14}/>}
                      {selected.budget_result}
                    </span>
                  )}
                </div>

                {!selected.budget_result?(
                  <div className="approval-info-note">
                    Financial coding and budget validation have not been completed yet.
                  </div>
                ):(
                  <div className="approval-budget-summary">
                    <div>
                      <span>Budget status</span>
                      <strong>{selected.budget_result.toUpperCase()}</strong>
                    </div>

                    <div>
                      <span>Available after request</span>
                      <strong>
                        {money(
                          selected.budget_available_after,
                          selected.currency_code
                        )}
                      </strong>
                    </div>

                    {selected.budget_message&&(
                      <p>{selected.budget_message}</p>
                    )}
                  </div>
                )}
              </section>

              <button
                type="button"
                className="approval-open-request"
                onClick={()=>nav(`/requests/${selected.request_id}`)}
              >
                <FileCheck2 size={16}/>
                Open full requisition
                <ArrowRight size={16}/>
              </button>

              {isFinanceTask(selected)&&(
                <section className="finance-review-panel">
                  <div className="finance-review-heading">
                    <div className="finance-review-icon">
                      <Landmark size={18}/>
                    </div>

                    <div>
                      <span className="eyebrow dark">FINANCE CONTROL</span>
                      <h3>Financial classification</h3>
                      <p>
                        Complete the accounting classification before approving this stage.
                      </p>
                    </div>
                  </div>

                  {financeBusy&&!financeReview?(
                    <div className="approval-info-note">
                      Loading Finance review…
                    </div>
                  ):financeReview&&financeMeta&&(
                    <>
                      <label>Classification</label>
                      <select
                        value={financeReview.classification}
                        onChange={e=>setFinance("classification",e.target.value)}
                      >
                        <option value="">Select classification</option>
                        {financeMeta.classifications.map(item=>(
                          <option key={item.code} value={item.code}>
                            {item.name}
                          </option>
                        ))}
                      </select>

                      <label>GL account</label>
                      <select
                        value={financeReview.account_code}
                        onChange={e=>setFinance("account_code",e.target.value)}
                      >
                        <option value="">Select posting account</option>
                        {financeMeta.accounts.map(account=>(
                          <option key={account.id} value={account.code}>
                            {account.code} · {account.name}
                          </option>
                        ))}
                      </select>

                      <label>Cost centre</label>
                      <select
                        value={financeReview.cost_centre_id}
                        onChange={e=>setFinance("cost_centre_id",e.target.value)}
                      >
                        <option value="">No cost centre</option>
                        {financeMeta.cost_centres.map(cc=>(
                          <option key={cc.id} value={cc.id}>
                            {cc.code} · {cc.name}
                          </option>
                        ))}
                      </select>

                      <label>Tax treatment</label>
                      <select
                        value={financeReview.tax_treatment}
                        onChange={e=>setFinance("tax_treatment",e.target.value)}
                      >
                        <option value="">Select tax treatment</option>
                        {financeMeta.tax_treatments.map(item=>(
                          <option key={item.code} value={item.code}>
                            {item.name}
                          </option>
                        ))}
                      </select>

                      <div className="finance-verification-grid">
                        <label className="governance-rule">
                          <input
                            type="checkbox"
                            checked={financeReview.gl_verified}
                            onChange={e=>setFinance("gl_verified",e.target.checked)}
                          />
                          <div>
                            <strong>GL coding verified</strong>
                            <span>Account classification is appropriate.</span>
                          </div>
                        </label>

                        <label className="governance-rule">
                          <input
                            type="checkbox"
                            checked={financeReview.tax_verified}
                            onChange={e=>setFinance("tax_verified",e.target.checked)}
                          />
                          <div>
                            <strong>Tax treatment reviewed</strong>
                            <span>VAT/tax treatment has been considered.</span>
                          </div>
                        </label>

                        <label className="governance-rule">
                          <input
                            type="checkbox"
                            checked={financeReview.documents_verified}
                            onChange={e=>setFinance("documents_verified",e.target.checked)}
                          />
                          <div>
                            <strong>Supporting documents reviewed</strong>
                            <span>Available supporting evidence is sufficient.</span>
                          </div>
                        </label>
                      </div>

                      {financeReview.budget&&(
                        <div className={`finance-budget-card ${financeReview.budget.result}`}>
                          <div className="finance-budget-head">
                            <WalletCards size={17}/>
                            <div>
                              <strong>Budget position</strong>
                              <span>{financeReview.budget.budget_name||"Approved FinSage budget"}</span>
                            </div>

                            <span className={`budget-state ${financeReview.budget.result}`}>
                              {financeReview.budget.result}
                            </span>
                          </div>

                          <div className="finance-budget-grid">
                            <span>Approved budget</span>
                            <strong>{money(financeReview.budget.budget_amount,selected.currency_code)}</strong>

                            <span>Actual expenditure</span>
                            <strong>{money(financeReview.budget.actual_amount,selected.currency_code)}</strong>

                            <span>Commitments</span>
                            <strong>{money(financeReview.budget.committed_amount,selected.currency_code)}</strong>

                            <span>This requisition</span>
                            <strong>{money(financeReview.budget.requested_amount,selected.currency_code)}</strong>

                            <span className="remaining">Remaining</span>
                            <strong className="remaining">
                              {money(financeReview.budget.available_after,selected.currency_code)}
                            </strong>
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        className="ghost-btn finance-save-btn"
                        disabled={financeBusy}
                        onClick={saveFinance}
                      >
                        <Save size={15}/>
                        {financeBusy?"Saving...":"Save Finance review"}
                      </button>
                    </>
                  )}
                </section>
              )}

              <section className="approval-decision-section">
                <div className="approval-section-heading">
                  <div>
                    <h3>Your decision</h3>
                    <p>Every decision is recorded in the audit trail.</p>
                  </div>
                </div>

                <div className="approval-decision-options">
                  <button
                    type="button"
                    className={`decision-option approve ${decisionMode==="approve"?"selected":""}`}
                    onClick={()=>chooseDecision("approve")}
                  >
                    <Check size={17}/>
                    <div>
                      <strong>Approve</strong>
                      <span>Accept and move to the next stage.</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`decision-option return ${decisionMode==="return"?"selected":""}`}
                    onClick={()=>chooseDecision("return")}
                  >
                    <RotateCcw size={17}/>
                    <div>
                      <strong>Return</strong>
                      <span>Send back to the requester for correction.</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`decision-option reject ${decisionMode==="reject"?"selected":""}`}
                    onClick={()=>chooseDecision("reject")}
                  >
                    <X size={17}/>
                    <div>
                      <strong>Reject</strong>
                      <span>Decline and end this approval workflow.</span>
                    </div>
                  </button>
                </div>

                {decisionMode&&(
                  <div className={`approval-comment-box ${decisionMode}`}>
                    <label>
                      {decisionMode==="approve"
                        ?"Approval comment"
                        :decisionMode==="return"
                          ?"What should the requester correct?"
                          :"Reason for rejection"}
                    </label>

                    <textarea
                      rows="4"
                      value={comment}
                      onChange={e=>setComment(e.target.value)}
                      placeholder={
                        decisionMode==="approve"
                          ?"Optional approval note..."
                          :decisionMode==="return"
                            ?"Explain exactly what needs to be corrected..."
                            :"Explain why this request is being rejected..."
                      }
                    />

                    <div className="approval-comment-actions">
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={()=>{
                          setDecisionMode("");
                          setComment("");
                        }}
                        disabled={busy}
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        className={
                          decisionMode==="approve"
                            ?"primary-btn"
                            :decisionMode==="return"
                              ?"return-btn"
                              :"reject-btn"
                        }
                        onClick={decide}
                        disabled={busy}
                      >
                        {busy
                          ?"Saving..."
                          :decisionMode==="approve"
                            ?"Confirm approval"
                            :decisionMode==="return"
                              ?"Return request"
                              :"Confirm rejection"}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <div className="approval-governance-note">
                <UserRound size={15}/>
                <span>
                  This task was assigned through FinFlow governance.
                  Approval authority is determined by the configured workflow, not by this screen.
                </span>
              </div>
            </>
          )}

        </aside>
      </div>
    </Shell>
  );
}