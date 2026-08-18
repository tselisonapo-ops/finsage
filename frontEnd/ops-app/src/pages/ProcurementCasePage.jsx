import {useEffect,useMemo,useState} from "react";
import {
  ArrowLeft,Building2,CalendarDays,CheckCircle2,
  FileCheck2,FileText,Mail,Plus,Save,Send,ShieldCheck,
  ShoppingCart,Store,Trash2,Users
} from "lucide-react";
import {useNavigate,useParams} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

const money=(value,currency="")=>
  `${currency||""} ${Number(value||0).toLocaleString(undefined,{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  })}`.trim();

export default function ProcurementCasePage(){
  const companyId=getCompanyId();
  const {caseId,eventId}=useParams();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [caseData,setCaseData]=useState(null);
  const [sourcing,setSourcing]=useState(null);
  const [eligible,setEligible]=useState([]);

  const [method,setMethod]=useState("rfq");
  const [exceptionReason,setExceptionReason]=useState("");

  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function load(){
    const ctx=await opsApi.session(
      companyId
    );

    setSession(ctx);

    if(eventId){
      const data=await opsApi.sourcingEvent(
        companyId,
        eventId
      );

      setSourcing(data);

      const vendors=
        await opsApi.eligibleSourcingVendors(
          companyId,
          eventId
        ).catch(()=>({rows:[]}));

      setEligible(vendors.rows||[]);
      return;
    }

    const data=await opsApi.procurementCase(
      companyId,
      caseId
    );

    setCaseData(data);

    if(data.sourcing_event){
      const detail=
        await opsApi.sourcingEvent(
          companyId,
          data.sourcing_event.id
        );

      setSourcing(detail);

      const vendors=
        await opsApi.eligibleSourcingVendors(
          companyId,
          data.sourcing_event.id
        ).catch(()=>({rows:[]}));

      setEligible(vendors.rows||[]);
    }else{
      setMethod(
        data.case?.sourcing_method||
        "rfq"
      );
    }
  }

  useEffect(()=>{
    load().catch(err=>
      setError(err.message)
    );
  },[caseId,eventId]);

  async function createSourcing(){
    if(!caseData?.case?.id) return;

    setBusy(true);
    setError("");

    try{
      const data=
        await opsApi.createSourcingEvent(
          companyId,
          caseData.case.id,
          {
            sourcing_method:method,
            exception_reason:
              exceptionReason||null
          }
        );

      setSourcing(data);

      const vendors=
        await opsApi.eligibleSourcingVendors(
          companyId,
          data.event.id
        );

      setEligible(vendors.rows||[]);

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  const event=sourcing?.event||null;
  const items=sourcing?.items||[];
  const selectedVendors=
    sourcing?.vendors||[];

  const setEvent=(key,value)=>
    setSourcing(x=>({
      ...x,
      event:{
        ...x.event,
        [key]:value
      }
    }));

  async function saveEvent(){
    if(!event) return;

    setBusy(true);
    setError("");

    try{
      await opsApi.updateSourcingEvent(
        companyId,
        event.id,
        {
          title:event.title,
          description:event.description,
          issue_date:event.issue_date,
          closing_date:event.closing_date,
          required_delivery_date:
            event.required_delivery_date,
          delivery_address:
            event.delivery_address,
          terms_text:event.terms_text,
          submission_instructions:
            event.submission_instructions,
          evaluation_notes:
            event.evaluation_notes
        }
      );

      await load();

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  async function addVendor(vendorId){
    setBusy(true);
    setError("");

    try{
      await opsApi.addSourcingVendor(
        companyId,
        event.id,
        vendorId
      );

      await load();

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  async function removeVendor(vendorId){
    setBusy(true);
    setError("");

    try{
      await opsApi.removeSourcingVendor(
        companyId,
        event.id,
        vendorId
      );

      await load();

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  async function issue(){
    if(!event) return;

    setBusy(true);
    setError("");

    try{
      await saveEvent();

      await opsApi.issueSourcingRfq(
        companyId,
        event.id
      );

      await load();

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  if(!session)
    return <div className="loading-screen">
      Loading sourcing workspace…
    </div>;

  const procurementCase=
    caseData?.case||null;

  if(!event)
    return (
      <Shell session={session} active="procurement">
        <div className="page-header">
          <div>
            <button
              type="button"
              className="page-back-link"
              onClick={()=>nav("/procurement")}
            >
              <ArrowLeft size={15}/>
              Procurement
            </button>

            <span className="eyebrow dark">
              PROCUREMENT CASE
            </span>

            <h1>
              {procurementCase?.case_no||
               "Procurement"}
            </h1>

            <p>
              {procurementCase?.title}
            </p>
          </div>
        </div>

        {error&&
          <div className="alert error">
            {error}
          </div>}

        <div className="sourcing-start-workspace">
          <section className="sourcing-start-request">
            <span className="eyebrow dark">
              APPROVED REQUISITION
            </span>

            <h2>
              {procurementCase?.request_no}
            </h2>

            <p>
              {procurementCase?.business_purpose||
               procurementCase?.description}
            </p>

            <div className="sourcing-start-grid">
              <div>
                <span>Department</span>
                <strong>
                  {procurementCase?.department_name||
                   "—"}
                </strong>
              </div>

              <div>
                <span>Requester</span>
                <strong>
                  {procurementCase?.requester_name||
                   "—"}
                </strong>
              </div>

              <div>
                <span>Amount</span>
                <strong>
                  {money(
                    procurementCase?.estimated_amount,
                    procurementCase?.currency_code
                  )}
                </strong>
              </div>

              <div>
                <span>Policy</span>
                <strong>
                  {procurementCase?.policy_rule_name||
                   procurementCase?.policy_name||
                   "Review required"}
                </strong>
              </div>

              <div>
                <span>Quotes required</span>
                <strong>
                  {procurementCase?.required_quote_count||0}
                </strong>
              </div>
            </div>
          </section>

          <aside className="sourcing-start-card">
            <ShoppingCart size={28}/>

            <h2>Start sourcing</h2>

            <p>
              Choose the procurement route for this approved requisition.
            </p>

            <label>Sourcing method</label>

            <select
              value={method}
              onChange={e=>
                setMethod(e.target.value)
              }
            >
              <option value="quotation">
                Quotations
              </option>

              <option value="rfq">
                Competitive RFQ
              </option>

              <option value="single_source">
                Single source
              </option>

              <option value="emergency">
                Emergency procurement
              </option>

              <option value="direct">
                Direct purchase
              </option>

              <option value="framework">
                Framework contract
              </option>
            </select>

            {["single_source","emergency"].includes(method)&&(
              <>
                <label>Justification</label>

                <textarea
                  rows="5"
                  value={exceptionReason}
                  onChange={e=>
                    setExceptionReason(
                      e.target.value
                    )
                  }
                  placeholder="Explain why normal competitive sourcing is being bypassed..."
                />
              </>
            )}

            <button
              type="button"
              className="primary-btn"
              disabled={busy}
              onClick={createSourcing}
            >
              <ShoppingCart size={16}/>
              {busy
                ?"Starting..."
                :"Start sourcing"}
            </button>
          </aside>
        </div>
      </Shell>
    );

  const selectedIds=new Set(
    selectedVendors.map(
      row=>Number(row.vendor_id)
    )
  );

  return (
    <Shell session={session} active="procurement">
      <div className="page-header">
        <div>
          <button
            type="button"
            className="page-back-link"
            onClick={()=>nav("/procurement")}
          >
            <ArrowLeft size={15}/>
            Procurement
          </button>

          <span className="eyebrow dark">
            {event.rfq_no
              ?"REQUEST FOR QUOTATION"
              :"SOURCING EVENT"}
          </span>

          <h1>
            {event.rfq_no||
             event.sourcing_no}
          </h1>

          <p>
            {event.title}
          </p>
        </div>

        <div className="sourcing-header-actions">
          <span
            className={`status-pill ${event.status}`}
          >
            {event.status.replaceAll("_"," ")}
          </span>

          {["draft","ready"].includes(event.status)&&(
            <>
              <button
                type="button"
                className="ghost-btn"
                disabled={busy}
                onClick={saveEvent}
              >
                <Save size={16}/>
                Save draft
              </button>

              <button
                type="button"
                className="primary-btn"
                disabled={busy}
                onClick={issue}
              >
                <Send size={16}/>
                Issue RFQ
              </button>
            </>
          )}

          {[
            "closed",
            "evaluation",
            "awarded"
          ].includes(event.status)&&(
            <button
              type="button"
              className="primary-btn"
              onClick={()=>
                nav(
                  `/procurement/${event.procurement_case_id}/evaluation`
                )
              }
            >
              <FileCheck2 size={16}/>
              Open evaluation
            </button>
          )}
        </div>
      </div>

      {error&&
        <div className="alert error">
          {error}
        </div>}

      <div className="rfq-builder-workspace">
        <main className="rfq-builder-inputs">
          <section className="rfq-builder-section">
            <div className="rfq-section-heading">
              <FileText size={18}/>

              <div>
                <strong>RFQ details</strong>
                <span>
                  Define the commercial request sent to vendors.
                </span>
              </div>
            </div>

            <label>Title</label>

            <input
              value={event.title||""}
              disabled={!["draft","ready"].includes(event.status)}
              onChange={e=>
                setEvent(
                  "title",
                  e.target.value
                )
              }
            />

            <label>Description</label>

            <textarea
              rows="4"
              value={event.description||""}
              disabled={!["draft","ready"].includes(event.status)}
              onChange={e=>
                setEvent(
                  "description",
                  e.target.value
                )
              }
            />

            <div className="rfq-date-grid">
              <div>
                <label>Issue date</label>
                <input
                  type="date"
                  value={
                    event.issue_date
                      ?String(event.issue_date).slice(0,10)
                      :""
                  }
                  disabled={!["draft","ready"].includes(event.status)}
                  onChange={e=>
                    setEvent(
                      "issue_date",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>Closing date</label>
                <input
                  type="date"
                  value={
                    event.closing_date
                      ?String(event.closing_date).slice(0,10)
                      :""
                  }
                  disabled={!["draft","ready"].includes(event.status)}
                  onChange={e=>
                    setEvent(
                      "closing_date",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>Required delivery</label>
                <input
                  type="date"
                  value={
                    event.required_delivery_date
                      ?String(event.required_delivery_date).slice(0,10)
                      :""
                  }
                  disabled={!["draft","ready"].includes(event.status)}
                  onChange={e=>
                    setEvent(
                      "required_delivery_date",
                      e.target.value
                    )
                  }
                />
              </div>
            </div>

            <label>Delivery address</label>

            <textarea
              rows="3"
              value={event.delivery_address||""}
              disabled={!["draft","ready"].includes(event.status)}
              onChange={e=>
                setEvent(
                  "delivery_address",
                  e.target.value
                )
              }
            />
          </section>

          <section className="rfq-builder-section">
            <div className="rfq-section-heading">
              <Building2 size={18}/>

              <div>
                <strong>Requirement</strong>
                <span>
                  Items copied from the approved requisition.
                </span>
              </div>
            </div>

            <div className="rfq-item-list">
              {items.map(item=>(
                <article
                  className="rfq-item"
                  key={item.id}
                >
                  <div className="rfq-item-line">
                    {item.line_no}
                  </div>

                  <div>
                    <strong>
                      {item.description}
                    </strong>

                    <span>
                      {Number(
                        item.quantity||0
                      ).toLocaleString()}
                      {" "}
                      {item.unit_of_measure||""}
                    </span>

                    {item.specification&&(
                      <p>
                        {item.specification}
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rfq-builder-section">
            <div className="rfq-section-heading">
              <Users size={18}/>

              <div>
                <strong>Vendors</strong>
                <span>
                  {selectedVendors.length} selected · {event.minimum_quotes} required
                </span>
              </div>
            </div>

            <div className="rfq-selected-vendors">
              {selectedVendors.map(vendor=>(
                <article
                  className="rfq-selected-vendor"
                  key={vendor.vendor_id}
                >
                  <div className="rfq-vendor-avatar">
                    {vendor.vendor_name?.[0]?.toUpperCase()||"V"}
                  </div>

                  <div>
                    <strong>
                      {vendor.vendor_name}
                    </strong>

                    <span>
                      {vendor.recipient_email||
                       "No recipient email"}
                    </span>
                  </div>

                  <span
                    className={`status-pill ${vendor.invitation_status}`}
                  >
                    {vendor.invitation_status}
                  </span>

                  {["draft","ready"].includes(event.status)&&(
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={()=>
                        removeVendor(
                          vendor.vendor_id
                        )
                      }
                    >
                      <Trash2 size={15}/>
                    </button>
                  )}
                </article>
              ))}
            </div>

            {["draft","ready"].includes(event.status)&&(
              <div className="rfq-vendor-directory">
                {eligible
                  .filter(row=>
                    !selectedIds.has(
                      Number(row.vendor_id)
                    )
                  )
                  .map(vendor=>(
                    <button
                      type="button"
                      className="rfq-vendor-option"
                      key={vendor.vendor_id}
                      disabled={!vendor.eligible||busy}
                      onClick={()=>
                        addVendor(
                          vendor.vendor_id
                        )
                      }
                    >
                      <div className="rfq-vendor-avatar">
                        {vendor.name?.[0]?.toUpperCase()||"V"}
                      </div>

                      <div>
                        <strong>
                          {vendor.name}
                        </strong>

                        <span>
                          {vendor.eligible
                            ?vendor.primary_contact_email||
                             vendor.email||
                             "Eligible vendor"
                            :vendor.eligibility_reasons.join(" ")}
                        </span>
                      </div>

                      {vendor.eligible
                        ?<Plus size={15}/>
                        :<ShieldCheck size={15}/>}
                    </button>
                  ))}
              </div>
            )}
          </section>

          <section className="rfq-builder-section">
            <div className="rfq-section-heading">
              <ShieldCheck size={18}/>

              <div>
                <strong>Commercial terms</strong>
                <span>
                  Instructions become part of the issued RFQ snapshot.
                </span>
              </div>
            </div>

            <label>Terms & conditions</label>

            <textarea
              rows="6"
              value={event.terms_text||""}
              disabled={!["draft","ready"].includes(event.status)}
              onChange={e=>
                setEvent(
                  "terms_text",
                  e.target.value
                )
              }
            />

            <label>Submission instructions</label>

            <textarea
              rows="5"
              value={event.submission_instructions||""}
              disabled={!["draft","ready"].includes(event.status)}
              onChange={e=>
                setEvent(
                  "submission_instructions",
                  e.target.value
                )
              }
            />
          </section>
        </main>

        <aside className="rfq-document-preview">
          <div className="rfq-preview-toolbar">
            <div>
              <span>
                {event.status==="issued"
                  ?"ISSUED RFQ"
                  :"LIVE RFQ"}
              </span>

              <strong>
                {event.rfq_no||
                 event.sourcing_no}
              </strong>
            </div>

            <span className={`status-pill ${event.status}`}>
              {event.status}
            </span>
          </div>

          <div className="rfq-document">
            <header className="rfq-doc-header">
              <div className="rfq-doc-brand">
                {session.logo_url?(
                  <img
                    src={session.logo_url}
                    alt=""
                  />
                ):(
                  <div className="rfq-doc-logo">
                    {session.company_name?.[0]?.toUpperCase()||"F"}
                  </div>
                )}

                <div>
                  <strong>
                    {session.company_name}
                  </strong>

                  <span>
                    Request for Quotation
                  </span>
                </div>
              </div>

              <div className="rfq-doc-number">
                <span>RFQ NUMBER</span>

                <strong>
                  {event.rfq_no||
                   "Draft"}
                </strong>
              </div>
            </header>

            <section className="rfq-doc-meta">
              <div>
                <span>Issue date</span>
                <strong>
                  {event.issue_date||"—"}
                </strong>
              </div>

              <div>
                <span>Closing date</span>
                <strong>
                  {event.closing_date||"—"}
                </strong>
              </div>

              <div>
                <span>Delivery date</span>
                <strong>
                  {event.required_delivery_date||"—"}
                </strong>
              </div>

              <div>
                <span>Currency</span>
                <strong>
                  {event.currency_code||
                   session.currency||
                   "—"}
                </strong>
              </div>
            </section>

            <section className="rfq-doc-section">
              <span className="rfq-doc-section-title">
                REQUIREMENT
              </span>

              <h2>
                {event.title}
              </h2>

              <p>
                {event.description||
                 "No additional description."}
              </p>
            </section>

            <section className="rfq-doc-section">
              <span className="rfq-doc-section-title">
                ITEMS
              </span>

              <div className="rfq-doc-table">
                <div className="rfq-doc-table-head">
                  <span>#</span>
                  <span>Description</span>
                  <span>Qty</span>
                  <span>Unit</span>
                </div>

                {items.map(item=>(
                  <div
                    className="rfq-doc-table-row"
                    key={item.id}
                  >
                    <span>
                      {item.line_no}
                    </span>

                    <span>
                      {item.description}
                    </span>

                    <span>
                      {Number(
                        item.quantity||0
                      ).toLocaleString()}
                    </span>

                    <span>
                      {item.unit_of_measure||"—"}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rfq-doc-section">
              <span className="rfq-doc-section-title">
                SUBMISSION
              </span>

              <p>
                {event.submission_instructions||
                 "Submit your quotation before the stated closing date."}
              </p>
            </section>

            <section className="rfq-doc-section">
              <span className="rfq-doc-section-title">
                DELIVERY
              </span>

              <p>
                {event.delivery_address||
                 "Delivery address will be confirmed on award."}
              </p>
            </section>

            <footer className="rfq-doc-footer">
              <span>
                Generated through FinFlow Procurement
              </span>

              <strong>
                {event.rfq_no||
                 event.sourcing_no}
              </strong>
            </footer>
          </div>
        </aside>
      </div>
    </Shell>
  );
}