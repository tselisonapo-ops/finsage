import {useEffect,useMemo,useState} from "react";
import {
  AlertTriangle,ArrowLeft,Award,BadgeCheck,
  Check,CheckCircle2,Clock3,FileCheck2,
  Send,ShieldCheck,Trophy,X
} from "lucide-react";
import {useNavigate,useParams} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

const money=(value,currency="")=>
  `${currency||""} ${Number(value||0).toLocaleString(undefined,{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  })}`.trim();

export default function AwardPage(){
  const companyId=getCompanyId();
  const {caseId}=useParams();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [comparison,setComparison]=useState(null);
  const [awardData,setAwardData]=useState(null);

  const [deviationReason,setDeviationReason]=useState("");
  const [awardReason,setAwardReason]=useState("");

  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [creatingPo,setCreatingPo]=useState(false);

  async function load(){
    const [ctx,procurement]=await Promise.all([
      opsApi.session(companyId),
      opsApi.procurementCase(
        companyId,
        caseId
      )
    ]);

    setSession(ctx);

    const eventId=
      procurement.sourcing_event?.id;

    if(!eventId)
      throw new Error(
        "No sourcing event found."
      );

    const data=
      await opsApi.quoteComparison(
        companyId,
        eventId
      );

    setComparison(data);

    if(data.event?.award_id){
      const existing=
        await opsApi.award(
          companyId,
          data.event.award_id
        );

      setAwardData(existing);

      setDeviationReason(
        existing.award?.deviation_reason||
        ""
      );

      setAwardReason(
        existing.award?.award_reason||
        existing.award?.recommendation_reason||
        ""
      );
    }else{
      setAwardReason(
        data.event?.recommendation_reason||
        ""
      );
    }
  }

  useEffect(()=>{
    load().catch(err=>
      setError(err.message)
    );
  },[caseId]);

  const event=
    comparison?.event||null;

  const results=
    comparison?.results||[];

  const quotes=
    comparison?.quotes||[];

  const quoteById=useMemo(()=>{
    const map={};

    quotes.forEach(row=>{
      map[Number(row.id)]=row;
    });

    return map;
  },[quotes]);

  const recommendedResult=
    results.find(row=>
      Number(row.quote_id)
      ===Number(
        event?.recommended_quote_id
      )
    )||null;

  const recommendedQuote=
    recommendedResult
      ?quoteById[
        Number(
          recommendedResult.quote_id
        )
      ]
      :null;

  const rankOne=
    Number(
      recommendedResult?.rank_no
      ||0
    )===1;

  async function createAward(){
    if(!event) return;

    if(
      !rankOne
      &&!deviationReason.trim()
    ){
      setError(
        "A deviation reason is required because the recommended vendor is not ranked first."
      );
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try{
      const award=
        await opsApi.createAward(
          companyId,
          event.id,
          {
            deviation_reason:
              deviationReason.trim()||
              null
          }
        );

      const detail=
        await opsApi.award(
          companyId,
          award.id
        );

      setAwardData(detail);

      setAwardReason(
        detail.award?.recommendation_reason||
        ""
      );

      setSuccess(
        "Award request created."
      );

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  async function submitAward(){
    const award=awardData?.award;

    if(!award) return;

    if(!awardReason.trim()){
      setError(
        "Award reason is required."
      );
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try{
      await opsApi.submitAward(
        companyId,
        award.id,
        {
          award_reason:
            awardReason.trim()
        }
      );

      await load();

      setSuccess(
        "Award submitted for approval."
      );

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  if(!session||!comparison)
    return (
      <div className="loading-screen">
        Loading award governance…
      </div>
    );

  const award=
    awardData?.award||null;

  const tasks=
    awardData?.tasks||[];

  async function createPurchaseOrder(){
    if(!award?.id) return;

    setCreatingPo(true);
    setError("");
    setSuccess("");

    try{
      const po=
        await opsApi.createPurchaseOrder(
          companyId,
          award.id
        );

      nav(
        `/procurement/${caseId}/purchase-order/${po.id}`
      );

    }catch(err){
      setError(err.message);
    }finally{
      setCreatingPo(false);
    }
  }

  return (
    <Shell
      session={session}
      active="procurement"
    >
      <div className="page-header">
        <div>
          <button
            type="button"
            className="page-back-link"
            onClick={()=>
              nav(
                `/procurement/${caseId}/evaluation`
              )
            }
          >
            <ArrowLeft size={15}/>
            Evaluation
          </button>

          <span className="eyebrow dark">
            AWARD GOVERNANCE
          </span>

          <h1>
            {award?.award_no||
             "Vendor award"}
          </h1>

          <p>
            Convert the completed evaluation recommendation into an authorised procurement award.
          </p>
        </div>

        {award&&(
          <span
            className={`status-pill ${award.status}`}
          >
            {award.status.replaceAll("_"," ")}
          </span>
        )}
      </div>

      {error&&(
        <div className="alert error">
          {error}
        </div>
      )}

      {success&&(
        <div className="alert success">
          {success}
        </div>
      )}

      <div className="award-workspace">
        <main className="award-main">
          <section className="award-section">
            <div className="award-section-heading">
              <Trophy size={19}/>

              <div>
                <span className="eyebrow dark">
                  EVALUATION RESULT
                </span>

                <h2>
                  Recommended vendor
                </h2>
              </div>
            </div>

            <div className="award-vendor-card">
              <div className="award-vendor-avatar">
                {recommendedQuote?.vendor_name?.[0]?.toUpperCase()||"V"}
              </div>

              <div className="award-vendor-copy">
                <strong>
                  {recommendedQuote?.vendor_name}
                </strong>

                <span>
                  {event.rfq_no||
                   event.sourcing_no}
                </span>
              </div>

              <div className="award-result-stat">
                <span>Rank</span>

                <strong>
                  #{recommendedResult?.rank_no}
                </strong>
              </div>

              <div className="award-result-stat">
                <span>Score</span>

                <strong>
                  {Number(
                    recommendedResult?.total_score||
                    0
                  ).toFixed(2)}
                </strong>
              </div>

              <div className="award-result-stat">
                <span>Quotation</span>

                <strong>
                  {money(
                    recommendedQuote?.total_amount,
                    recommendedQuote?.currency_code||
                    event.currency_code
                  )}
                </strong>
              </div>
            </div>
          </section>

          <section className="award-section">
            <div className="award-section-heading">
              {rankOne
                ?<CheckCircle2 size={19}/>
                :<AlertTriangle size={19}/>}

              <div>
                <span className="eyebrow dark">
                  GOVERNANCE CHECK
                </span>

                <h2>
                  Recommendation position
                </h2>
              </div>
            </div>

            {rankOne?(
              <div className="award-rank-check passed">
                <CheckCircle2 size={22}/>

                <div>
                  <strong>
                    Highest-ranked quotation selected
                  </strong>

                  <p>
                    The recommended vendor is ranked first in the completed evaluation.
                  </p>
                </div>
              </div>
            ):(
              <div className="award-deviation-box">
                <AlertTriangle size={22}/>

                <div>
                  <strong>
                    Non-leading vendor selected
                  </strong>

                  <p>
                    The recommended quotation is ranked #{recommendedResult?.rank_no}. A documented deviation is required and structured/controlled governance will apply additional approval.
                  </p>
                </div>

                <label>
                  Deviation reason
                </label>

                <textarea
                  rows="6"
                  disabled={Boolean(award)}
                  value={deviationReason}
                  onChange={e=>
                    setDeviationReason(
                      e.target.value
                    )
                  }
                  placeholder="Explain why the highest-ranked quotation is not being selected..."
                />
              </div>
            )}
          </section>

          <section className="award-section">
            <div className="award-section-heading">
              <Award size={19}/>

              <div>
                <span className="eyebrow dark">
                  AWARD BASIS
                </span>

                <h2>
                  Decision rationale
                </h2>
              </div>
            </div>

            <label>
              Evaluation recommendation
            </label>

            <div className="award-readonly-reason">
              {event.recommendation_reason||
               "No recommendation reason recorded."}
            </div>

            <label>
              Award reason
            </label>

            <textarea
              rows="7"
              disabled={
                award&&
                award.status!=="draft"
              }
              value={awardReason}
              onChange={e=>
                setAwardReason(
                  e.target.value
                )
              }
              placeholder="State the final procurement basis for the proposed award..."
            />
          </section>

          {tasks.length>0&&(
            <section className="award-section">
              <div className="award-section-heading">
                <ShieldCheck size={19}/>

                <div>
                  <span className="eyebrow dark">
                    APPROVAL FLOW
                  </span>

                  <h2>
                    Award governance
                  </h2>
                </div>
              </div>

              <div className="award-task-list">
                {tasks.map(task=>(
                  <article
                    className="award-task-row"
                    key={task.id}
                  >
                    <div className={`award-task-icon ${task.status}`}>
                      {task.status==="approved"
                        ?<Check size={15}/>
                        :task.status==="rejected"
                          ?<X size={15}/>
                          :<Clock3 size={15}/>}
                    </div>

                    <div>
                      <strong>
                        {task.step_name}
                      </strong>

                      <span>
                        {task.approver_name||
                         task.approver_role_code||
                         "Approver"}
                      </span>
                    </div>

                    <span
                      className={`status-pill ${task.status}`}
                    >
                      {task.status}
                    </span>
                  </article>
                ))}
              </div>
            </section>
          )}
        </main>

        <aside className="award-side">
          <div className="award-side-sticky">
            <span className="eyebrow dark">
              AWARD CONTROL
            </span>

            <h2>
              {award
                ?"Award request"
                :"Prepare award"}
            </h2>

            <div className="award-control-list">
              <div>
                <span>Governance</span>

                <strong>
                  {award?.governance_mode||
                   "From company settings"}
                </strong>
              </div>

              <div>
                <span>Rank #1</span>

                <strong>
                  {rankOne
                    ?"Yes"
                    :"No"}
                </strong>
              </div>

              <div>
                <span>Deviation</span>

                <strong>
                  {rankOne
                    ?"Not required"
                    :"Required"}
                </strong>
              </div>

              <div>
                <span>Approval</span>

                <strong>
                  {award?.status==="approved"
                    ?"Completed"
                    :"Required"}
                </strong>
              </div>
            </div>

            {!award&&(
              <button
                type="button"
                className="primary-btn award-action-btn"
                disabled={busy}
                onClick={createAward}
              >
                <Award size={16}/>

                {busy
                  ?"Creating..."
                  :"Create award request"}
              </button>
            )}

            {award?.status==="draft"&&(
              <button
                type="button"
                className="primary-btn award-action-btn"
                disabled={busy}
                onClick={submitAward}
              >
                <Send size={16}/>

                {busy
                  ?"Submitting..."
                  :"Submit for approval"}
              </button>
            )}

            {award?.status==="pending_approval"&&(
              <div className="award-pending-card">
                <Clock3 size={19}/>

                <div>
                  <strong>
                    Awaiting approval
                  </strong>

                  <span>
                    The award cannot proceed to purchase order until governance approval is complete.
                  </span>
                </div>
              </div>
            )}

            {award?.status==="approved"&&(
              <>
                <div className="award-approved-card">
                  <BadgeCheck size={22}/>

                  <div>
                    <strong>
                      Award approved
                    </strong>

                    <span>
                      {recommendedQuote?.vendor_name}
                    </span>

                    <p>
                      The approved award is locked and ready for purchase-order creation.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="primary-btn award-action-btn"
                  disabled={creatingPo}
                  onClick={createPurchaseOrder}
                >
                  <FileCheck2 size={16}/>

                  {creatingPo
                    ?"Creating PO..."
                    :"Create purchase order"}
                </button>
              </>
            )}

            {award?.status==="rejected"&&(
              <div className="award-rejected-card">
                <X size={21}/>

                <div>
                  <strong>
                    Award rejected
                  </strong>

                  <p>
                    {award.rejection_reason||
                     "The award was returned for review."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </Shell>
  );
}