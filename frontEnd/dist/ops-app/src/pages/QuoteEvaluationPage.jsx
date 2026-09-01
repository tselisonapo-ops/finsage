import {useEffect,useMemo,useState} from "react";
import {
  AlertTriangle,ArrowLeft,Award,BadgeCheck,
  Calculator,Check,CheckCircle2,CircleDollarSign,
  FileCheck2,RefreshCw,Save,ShieldCheck,
  Star,Trophy,X
} from "lucide-react";
import {useNavigate,useParams} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

const money=(value,currency="")=>
  `${currency||""} ${Number(value||0).toLocaleString(undefined,{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  })}`.trim();

const number=(value,decimals=2)=>
  Number(value||0).toLocaleString(undefined,{
    minimumFractionDigits:decimals,
    maximumFractionDigits:decimals
  });

export default function QuoteEvaluationPage(){
  const companyId=getCompanyId();
  const {caseId}=useParams();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [caseData,setCaseData]=useState(null);
  const [data,setData]=useState(null);

  const [scores,setScores]=useState({});
  const [comments,setComments]=useState({});

  const [declaration,setDeclaration]=useState({
    has_conflict:false,
    declaration_text:""
  });

  const [recommendedQuoteId,setRecommendedQuoteId]=useState(null);
  const [recommendationReason,setRecommendationReason]=useState("");

  const [busy,setBusy]=useState(false);
  const [calculating,setCalculating]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  async function load(){
    const [ctx,procurement]=await Promise.all([
      opsApi.session(companyId),
      opsApi.procurementCase(companyId,caseId)
    ]);

    setSession(ctx);
    setCaseData(procurement);

    const eventId=
      procurement.sourcing_event?.id;

    if(!eventId){
      setData(null);
      return;
    }

    const comparison=
      await opsApi.quoteComparison(
        companyId,
        eventId
      );

    setData(comparison);

    if(comparison.event?.recommended_quote_id){
      setRecommendedQuoteId(
        Number(
          comparison.event.recommended_quote_id
        )
      );

      setRecommendationReason(
        comparison.event.recommendation_reason||
        ""
      );
    }
  }

  useEffect(()=>{
    load().catch(err=>
      setError(err.message)
    );
  },[caseId]);

  const event=data?.event||null;
  const quotes=data?.quotes||[];
  const criteria=data?.criteria||[];
  const results=data?.results||[];

  const resultByQuote=useMemo(()=>{
    const map={};

    results.forEach(row=>{
      map[Number(row.quote_id)]=row;
    });

    return map;
  },[results]);

  const quoteById=useMemo(()=>{
    const map={};

    quotes.forEach(row=>{
      map[Number(row.id)]=row;
    });

    return map;
  },[quotes]);

  const lowestQuote=useMemo(()=>{
    const valid=quotes
      .filter(row=>
        Number(row.total_amount||0)>0
      )
      .sort(
        (a,b)=>
          Number(a.total_amount)
          -Number(b.total_amount)
      );

    return valid[0]||null;
  },[quotes]);

  const rankedResults=useMemo(()=>{
    return [...results]
      .filter(row=>
        row.rank_no!==null
        &&row.rank_no!==undefined
      )
      .sort(
        (a,b)=>
          Number(a.rank_no)
          -Number(b.rank_no)
      );
  },[results]);

  const leadingResult=
    rankedResults[0]||null;

  const recommendedResult=
    recommendedQuoteId
      ?resultByQuote[
        Number(recommendedQuoteId)
      ]
      :null;

  const recommendedQuote=
    recommendedQuoteId
      ?quoteById[
        Number(recommendedQuoteId)
      ]
      :null;

  const isNonLeadingRecommendation=
    Boolean(
      recommendedResult
      &&leadingResult
      &&Number(
        recommendedResult.quote_id
      )!==Number(
        leadingResult.quote_id
      )
    );

  function scoreKey(quoteId,criterionId){
    return `${quoteId}:${criterionId}`;
  }

  function setScore(
    quoteId,
    criterionId,
    value
  ){
    const key=scoreKey(
      quoteId,
      criterionId
    );

    setScores(x=>({
      ...x,
      [key]:value
    }));
  }

  function setComment(
    quoteId,
    criterionId,
    value
  ){
    const key=scoreKey(
      quoteId,
      criterionId
    );

    setComments(x=>({
      ...x,
      [key]:value
    }));
  }

  async function startEvaluation(){
    if(!event) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try{
      await opsApi.startEvaluation(
        companyId,
        event.id
      );

      await load();

      setSuccess(
        "Evaluation started."
      );

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  async function saveDeclaration(){
    if(!event) return;

    if(
      declaration.has_conflict
      &&!declaration.declaration_text.trim()
    ){
      setError(
        "Describe the potential conflict of interest."
      );
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try{
      await opsApi.declareEvaluationConflict(
        companyId,
        event.id,
        declaration
      );

      setSuccess(
        "Conflict-of-interest declaration saved."
      );

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  async function saveCriterionScore(
    quote,
    criterion
  ){
    if(!event) return;

    const key=scoreKey(
      quote.id,
      criterion.id
    );

    const value=scores[key];

    if(
      criterion.criterion_type==="scored"
      &&(
        value===""
        ||value===undefined
      )
    ){
      setError(
        `Enter a score for ${criterion.name}.`
      );
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try{
      const payload={
        quote_id:Number(quote.id),
        criterion_id:Number(
          criterion.id
        ),
        comment:
          comments[key]||null
      };

      if(
        criterion.criterion_type
        ==="pass_fail"
      ){
        payload.pass_result=
          value===true
          ||value==="pass";
      }else{
        payload.raw_score=
          Number(value||0);
      }

      await opsApi.saveEvaluationScore(
        companyId,
        event.id,
        payload
      );

      setSuccess(
        `${criterion.name} score saved for ${quote.vendor_name}.`
      );

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  async function calculate(){
    if(!event) return;

    setCalculating(true);
    setError("");
    setSuccess("");

    try{
      const result=
        await opsApi.calculateEvaluation(
          companyId,
          event.id
        );

      setData(result);

      setSuccess(
        "Evaluation ranking recalculated."
      );

    }catch(err){
      setError(err.message);
    }finally{
      setCalculating(false);
    }
  }

  async function recommend(){
    if(!event) return;

    if(!recommendedQuoteId){
      setError(
        "Select a vendor to recommend."
      );
      return;
    }

    if(!recommendationReason.trim()){
      setError(
        "Recommendation reason is required."
      );
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try{
      await opsApi.recommendVendor(
        companyId,
        event.id,
        {
          quote_id:Number(
            recommendedQuoteId
          ),
          reason:
            recommendationReason.trim()
        }
      );

      await load();

      setSuccess(
        "Vendor recommendation saved. The sourcing event is ready for award governance."
      );

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  if(!session||!caseData)
    return (
      <div className="loading-screen">
        Loading quote evaluation…
      </div>
    );

  if(!event)
    return (
      <Shell
        session={session}
        active="procurement"
      >
        <div className="beautiful-empty">
          <FileCheck2/>

          <h3>No sourcing event</h3>

          <p>
            Start sourcing before evaluating quotations.
          </p>

          <button
            type="button"
            className="primary-btn"
            onClick={()=>
              nav(
                `/procurement/${caseId}`
              )
            }
          >
            Back to procurement case
          </button>
        </div>
      </Shell>
    );

  return (
    <Shell
      session={session}
      active="procurement"
    >
      <div className="page-header evaluation-page-header">
        <div>
          <button
            type="button"
            className="page-back-link"
            onClick={()=>
              nav(
                `/procurement/${caseId}`
              )
            }
          >
            <ArrowLeft size={15}/>
            Procurement case
          </button>

          <span className="eyebrow dark">
            QUOTE EVALUATION
          </span>

          <h1>
            {event.rfq_no||
             event.sourcing_no}
          </h1>

          <p>
            {event.title}
          </p>
        </div>

        <div className="evaluation-header-actions">
          <span
            className={`status-pill ${
              event.evaluation_status
            }`}
          >
            {String(
              event.evaluation_status||
              "not_started"
            ).replaceAll("_"," ")}
          </span>

          {event.evaluation_status
            ==="not_started"&&(
            <button
              type="button"
              className="primary-btn"
              disabled={busy}
              onClick={startEvaluation}
            >
              <FileCheck2 size={16}/>
              Start evaluation
            </button>
          )}

          {event.evaluation_status
            !=="not_started"&&(
            <button
              type="button"
              className="ghost-btn"
              disabled={calculating}
              onClick={calculate}
            >
              <RefreshCw size={16}/>
              {calculating
                ?"Calculating..."
                :"Recalculate ranking"}
            </button>
          )}
        </div>
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

      <div className="evaluation-summary-grid">
        <article className="evaluation-summary-card">
          <CircleDollarSign size={18}/>

          <div>
            <span>Lowest quotation</span>

            <strong>
              {lowestQuote
                ?money(
                  lowestQuote.total_amount,
                  lowestQuote.currency_code||
                  event.currency_code
                )
                :"—"}
            </strong>

            <small>
              {lowestQuote?.vendor_name||
               "No submitted quote"}
            </small>
          </div>
        </article>

        <article className="evaluation-summary-card">
          <FileCheck2 size={18}/>

          <div>
            <span>Submitted quotations</span>

            <strong>
              {quotes.length}
            </strong>

            <small>
              Responses available for evaluation
            </small>
          </div>
        </article>

        <article className="evaluation-summary-card">
          <Trophy size={18}/>

          <div>
            <span>Leading vendor</span>

            <strong>
              {leadingResult
                ?quoteById[
                  Number(
                    leadingResult.quote_id
                  )
                ]?.vendor_name
                :"Not ranked"}
            </strong>

            <small>
              {leadingResult
                ?`${number(
                  leadingResult.total_score
                )} points`
                :"Calculate evaluation first"}
            </small>
          </div>
        </article>

        <article className="evaluation-summary-card">
          <Award size={18}/>

          <div>
            <span>Recommendation</span>

            <strong>
              {recommendedQuote?.vendor_name||
               "Not selected"}
            </strong>

            <small>
              {event.evaluation_status
                ==="completed"
                ?"Evaluation completed"
                :"Pending recommendation"}
            </small>
          </div>
        </article>
      </div>

      <section className="evaluation-declaration-card">
        <div className="evaluation-declaration-copy">
          <ShieldCheck size={19}/>

          <div>
            <strong>
              Conflict-of-interest declaration
            </strong>

            <span>
              Evaluators should disclose interests that may affect an impartial procurement decision.
            </span>
          </div>
        </div>

        <div className="evaluation-declaration-controls">
          <label>
            <input
              type="radio"
              name="conflict"
              checked={
                !declaration.has_conflict
              }
              onChange={()=>
                setDeclaration(x=>({
                  ...x,
                  has_conflict:false
                }))
              }
            />
            No conflict
          </label>

          <label>
            <input
              type="radio"
              name="conflict"
              checked={
                declaration.has_conflict
              }
              onChange={()=>
                setDeclaration(x=>({
                  ...x,
                  has_conflict:true
                }))
              }
            />
            Potential conflict
          </label>

          {declaration.has_conflict&&(
            <input
              value={
                declaration.declaration_text
              }
              onChange={e=>
                setDeclaration(x=>({
                  ...x,
                  declaration_text:
                    e.target.value
                }))
              }
              placeholder="Describe the potential conflict..."
            />
          )}

          <button
            type="button"
            className="ghost-btn"
            disabled={busy}
            onClick={saveDeclaration}
          >
            <Save size={15}/>
            Save declaration
          </button>
        </div>
      </section>

      <div className="evaluation-workspace">
        <main className="evaluation-comparison-main">
          <section className="evaluation-comparison-section">
            <div className="evaluation-section-heading">
              <div>
                <span className="eyebrow dark">
                  COMMERCIAL COMPARISON
                </span>

                <h2>
                  Quotations side by side
                </h2>

                <p>
                  Compare submitted commercial terms before applying weighted evaluation.
                </p>
              </div>

              <Calculator size={20}/>
            </div>

            {!quotes.length?(
              <div className="beautiful-empty">
                <FileCheck2/>

                <h3>
                  No submitted quotations
                </h3>

                <p>
                  Vendor responses will appear here after submission.
                </p>
              </div>
            ):(
              <div className="quote-comparison-table-wrap">
                <table className="quote-comparison-table">
                  <thead>
                    <tr>
                      <th>
                        Comparison
                      </th>

                      {quotes.map(quote=>(
                        <th key={quote.id}>
                          <div className="quote-column-vendor">
                            <div className="quote-column-avatar">
                              {quote.vendor_name?.[0]?.toUpperCase()||"V"}
                            </div>

                            <strong>
                              {quote.vendor_name}
                            </strong>

                            {Number(
                              quote.id
                            )===Number(
                              lowestQuote?.id
                            )&&(
                              <span className="lowest-badge">
                                Lowest
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    <tr className="comparison-total-row">
                      <th>
                        Total quotation
                      </th>

                      {quotes.map(quote=>(
                        <td key={quote.id}>
                          <strong>
                            {money(
                              quote.total_amount,
                              quote.currency_code||
                              event.currency_code
                            )}
                          </strong>
                        </td>
                      ))}
                    </tr>

                    <tr>
                      <th>
                        Difference from lowest
                      </th>

                      {quotes.map(quote=>{
                        const result=
                          resultByQuote[
                            Number(quote.id)
                          ];

                        return (
                          <td key={quote.id}>
                            {result?(
                              <>
                                <strong>
                                  {money(
                                    result.variance_from_lowest,
                                    quote.currency_code||
                                    event.currency_code
                                  )}
                                </strong>

                                <small>
                                  {number(
                                    result.variance_percent
                                  )}%
                                </small>
                              </>
                            ):(
                              "—"
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    <tr>
                      <th>
                        Lead time
                      </th>

                      {quotes.map(quote=>(
                        <td key={quote.id}>
                          {quote.lead_time_days
                            ?`${quote.lead_time_days} days`
                            :"—"}
                        </td>
                      ))}
                    </tr>

                    <tr>
                      <th>
                        Payment terms
                      </th>

                      {quotes.map(quote=>(
                        <td key={quote.id}>
                          {quote.payment_terms||
                           "—"}
                        </td>
                      ))}
                    </tr>

                    <tr>
                      <th>
                        Warranty
                      </th>

                      {quotes.map(quote=>(
                        <td key={quote.id}>
                          {quote.warranty_text||
                           "—"}
                        </td>
                      ))}
                    </tr>

                    <tr>
                      <th>
                        Documents
                      </th>

                      {quotes.map(quote=>(
                        <td key={quote.id}>
                          <span className="comparison-document-count">
                            <FileCheck2 size={14}/>
                            {quote.document_count}
                          </span>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="evaluation-comparison-section">
            <div className="evaluation-section-heading">
              <div>
                <span className="eyebrow dark">
                  EVALUATION MATRIX
                </span>

                <h2>
                  Mandatory & weighted criteria
                </h2>

                <p>
                  System criteria calculate automatically while evaluator criteria require your assessment.
                </p>
              </div>

              <BadgeCheck size={20}/>
            </div>

            <div className="evaluation-matrix">
              {criteria.map(criterion=>(
                <article
                  className="evaluation-criterion"
                  key={criterion.id}
                >
                  <header className="evaluation-criterion-header">
                    <div>
                      <strong>
                        {criterion.name}
                      </strong>

                      <span>
                        {criterion.description}
                      </span>
                    </div>

                    <div className="criterion-meta">
                      <span>
                        {criterion.criterion_type
                          ==="pass_fail"
                          ?"PASS / FAIL"
                          :`${number(
                            criterion.weight_percent
                          )}% WEIGHT`}
                      </span>

                      {criterion.is_mandatory&&(
                        <span className="mandatory-chip">
                          Mandatory
                        </span>
                      )}

                      {criterion.is_system_calculated&&(
                        <span className="system-chip">
                          Automatic
                        </span>
                      )}
                    </div>
                  </header>

                  <div className="criterion-vendor-grid">
                    {quotes.map(quote=>{
                      const key=scoreKey(
                        quote.id,
                        criterion.id
                      );

                      const result=
                        resultByQuote[
                          Number(quote.id)
                        ];

                      return (
                        <div
                          className="criterion-vendor-card"
                          key={quote.id}
                        >
                          <div className="criterion-vendor-heading">
                            <strong>
                              {quote.vendor_name}
                            </strong>

                            {result?.rank_no&&(
                              <span>
                                Rank #{result.rank_no}
                              </span>
                            )}
                          </div>

                          {criterion.is_system_calculated?(
                            <div className="automatic-score">
                              <Calculator size={17}/>

                              <div>
                                <span>
                                  System calculated
                                </span>

                                <strong>
                                  {criterion.criterion_code==="price"
                                    ?number(
                                      result?.commercial_score
                                    )
                                    :"Calculated on ranking"}
                                </strong>
                              </div>
                            </div>
                          ):criterion.criterion_type
                            ==="pass_fail"?(
                            <>
                              <div className="pass-fail-choice">
                                <button
                                  type="button"
                                  className={
                                    scores[key]==="pass"
                                    ||scores[key]===true
                                      ?"selected pass"
                                      :""
                                  }
                                  onClick={()=>
                                    setScore(
                                      quote.id,
                                      criterion.id,
                                      "pass"
                                    )
                                  }
                                >
                                  <Check size={14}/>
                                  Pass
                                </button>

                                <button
                                  type="button"
                                  className={
                                    scores[key]==="fail"
                                      ?"selected fail"
                                      :""
                                  }
                                  onClick={()=>
                                    setScore(
                                      quote.id,
                                      criterion.id,
                                      "fail"
                                    )
                                  }
                                >
                                  <X size={14}/>
                                  Fail
                                </button>
                              </div>

                              <textarea
                                rows="2"
                                value={
                                  comments[key]||""
                                }
                                onChange={e=>
                                  setComment(
                                    quote.id,
                                    criterion.id,
                                    e.target.value
                                  )
                                }
                                placeholder="Evaluation comment..."
                              />

                              <button
                                type="button"
                                className="ghost-btn compact"
                                disabled={busy}
                                onClick={()=>
                                  saveCriterionScore(
                                    quote,
                                    criterion
                                  )
                                }
                              >
                                <Save size={14}/>
                                Save
                              </button>
                            </>
                          ):(
                            <>
                              <label>
                                Score out of{" "}
                                {Number(
                                  criterion.maximum_score||
                                  5
                                )}
                              </label>

                              <input
                                type="number"
                                min="0"
                                max={
                                  criterion.maximum_score||
                                  5
                                }
                                step="0.1"
                                value={
                                  scores[key]??""
                                }
                                onChange={e=>
                                  setScore(
                                    quote.id,
                                    criterion.id,
                                    e.target.value
                                  )
                                }
                              />

                              <textarea
                                rows="2"
                                value={
                                  comments[key]||""
                                }
                                onChange={e=>
                                  setComment(
                                    quote.id,
                                    criterion.id,
                                    e.target.value
                                  )
                                }
                                placeholder="Why this score?"
                              />

                              <button
                                type="button"
                                className="ghost-btn compact"
                                disabled={busy}
                                onClick={()=>
                                  saveCriterionScore(
                                    quote,
                                    criterion
                                  )
                                }
                              >
                                <Save size={14}/>
                                Save score
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="evaluation-comparison-section">
            <div className="evaluation-section-heading">
              <div>
                <span className="eyebrow dark">
                  FINAL RANKING
                </span>

                <h2>
                  Evaluation results
                </h2>

                <p>
                  FinFlow ranks only quotations that pass mandatory requirements.
                </p>
              </div>

              <Trophy size={20}/>
            </div>

            {!results.length?(
              <div className="evaluation-results-empty">
                <Calculator size={20}/>

                <span>
                  Save evaluator scores and calculate the evaluation to generate ranking.
                </span>
              </div>
            ):(
              <div className="evaluation-result-list">
                {[...results]
                  .sort((a,b)=>{
                    const ar=
                      a.rank_no===null
                        ?9999
                        :Number(a.rank_no);

                    const br=
                      b.rank_no===null
                        ?9999
                        :Number(b.rank_no);

                    return ar-br;
                  })
                  .map(result=>{
                    const quote=
                      quoteById[
                        Number(
                          result.quote_id
                        )
                      ];

                    return (
                      <article
                        className={`evaluation-result-row ${
                          result.rank_no===1
                            ?"leading"
                            :""
                        } ${
                          !result.mandatory_pass
                            ?"failed"
                            :""
                        }`}
                        key={result.quote_id}
                      >
                        <div className="evaluation-rank">
                          {result.mandatory_pass
                            ?`#${result.rank_no}`
                            :"—"}
                        </div>

                        <div className="evaluation-result-vendor">
                          <strong>
                            {quote?.vendor_name}
                          </strong>

                          <span>
                            {result.mandatory_pass
                              ?"Mandatory requirements passed"
                              :"Failed mandatory requirement"}
                          </span>
                        </div>

                        <div>
                          <span>
                            Commercial
                          </span>

                          <strong>
                            {number(
                              result.commercial_score
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Technical
                          </span>

                          <strong>
                            {number(
                              result.technical_score
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Total score
                          </span>

                          <strong>
                            {number(
                              result.total_score
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Quotation
                          </span>

                          <strong>
                            {money(
                              result.quoted_amount,
                              quote?.currency_code||
                              event.currency_code
                            )}
                          </strong>
                        </div>

                        {result.rank_no===1&&(
                          <span className="evaluation-leading-chip">
                            <Star size={12}/>
                            Leading
                          </span>
                        )}
                      </article>
                    );
                  })}
              </div>
            )}
          </section>
        </main>

        <aside className="evaluation-recommendation-panel">
          <div className="evaluation-recommendation-sticky">
            <span className="eyebrow dark">
              RECOMMENDATION
            </span>

            <h2>
              Recommend vendor
            </h2>

            <p>
              Select the quotation procurement recommends for award approval.
            </p>

            {!results.length?(
              <div className="recommendation-not-ready">
                <Calculator size={18}/>

                <span>
                  Calculate the evaluation before making a recommendation.
                </span>
              </div>
            ):(
              <>
                <div className="recommendation-options">
                  {[...results]
                    .sort((a,b)=>{
                      const ar=
                        a.rank_no===null
                          ?9999
                          :Number(a.rank_no);

                      const br=
                        b.rank_no===null
                          ?9999
                          :Number(b.rank_no);

                      return ar-br;
                    })
                    .map(result=>{
                      const quote=
                        quoteById[
                          Number(
                            result.quote_id
                          )
                        ];

                      return (
                        <button
                          type="button"
                          key={result.quote_id}
                          disabled={
                            !result.mandatory_pass
                          }
                          className={`recommendation-option ${
                            Number(
                              recommendedQuoteId
                            )===Number(
                              result.quote_id
                            )
                              ?"selected"
                              :""
                          }`}
                          onClick={()=>
                            setRecommendedQuoteId(
                              Number(
                                result.quote_id
                              )
                            )
                          }
                        >
                          <div className="recommendation-radio">
                            {Number(
                              recommendedQuoteId
                            )===Number(
                              result.quote_id
                            )&&(
                              <Check size={12}/>
                            )}
                          </div>

                          <div>
                            <strong>
                              {quote?.vendor_name}
                            </strong>

                            <span>
                              {result.mandatory_pass
                                ?`Rank #${result.rank_no} · ${number(result.total_score)} points`
                                :"Failed mandatory requirement"}
                            </span>
                          </div>

                          <strong>
                            {money(
                              result.quoted_amount,
                              quote?.currency_code||
                              event.currency_code
                            )}
                          </strong>
                        </button>
                      );
                    })}
                </div>

                {isNonLeadingRecommendation&&(
                  <div className="non-leading-warning">
                    <AlertTriangle size={18}/>

                    <div>
                      <strong>
                        Non-leading vendor selected
                      </strong>

                      <p>
                        This quotation is ranked #{recommendedResult?.rank_no}. Phase 3E will require an exception reason and additional approval before award.
                      </p>
                    </div>
                  </div>
                )}

                {recommendedQuote&&(
                  <div className="recommendation-selection-summary">
                    {Number(
                      recommendedQuoteId
                    )===Number(
                      leadingResult?.quote_id
                    )
                      ?<CheckCircle2 size={18}/>
                      :<AlertTriangle size={18}/>}

                    <div>
                      <span>
                        Selected recommendation
                      </span>

                      <strong>
                        {recommendedQuote.vendor_name}
                      </strong>

                      <small>
                        {money(
                          recommendedQuote.total_amount,
                          recommendedQuote.currency_code||
                          event.currency_code
                        )}
                      </small>
                    </div>
                  </div>
                )}

                <label>
                  Recommendation reason
                </label>

                <textarea
                  rows="7"
                  value={
                    recommendationReason
                  }
                  onChange={e=>
                    setRecommendationReason(
                      e.target.value
                    )
                  }
                  placeholder="Explain why this quotation provides the best procurement outcome..."
                />

                <button
                  type="button"
                  className="primary-btn recommendation-save"
                  disabled={
                    busy||
                    !recommendedQuoteId
                  }
                  onClick={recommend}
                >
                  <Award size={16}/>

                  {busy
                    ?"Saving..."
                    :"Complete evaluation & recommend"}
                </button>
              </>
            )}

            {event.evaluation_status==="completed"&&(
            <div className="evaluation-complete-card">
                <BadgeCheck size={20}/>

                <div>
                <strong>
                    Evaluation completed
                </strong>

                <span>
                    {recommendedQuote?.vendor_name||
                    "Vendor recommended"}
                </span>

                <p>
                    The recommendation is ready for award governance.
                </p>

                <button
                    type="button"
                    className="primary-btn"
                    onClick={()=>
                    nav(
                        `/procurement/${caseId}/award`
                    )
                    }
                >
                    <Award size={15}/>
                    Continue to award
                </button>
                </div>
            </div>
            )}
          </div>
        </aside>
      </div>
    </Shell>
  );
}