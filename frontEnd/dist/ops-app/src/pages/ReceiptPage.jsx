import {useEffect,useState} from "react";
import {
  AlertTriangle,ArrowLeft,Box,
  Check,CheckCircle2,FileCheck2,
  PackageCheck,Save,Send,ShieldCheck,
  Wrench,X
} from "lucide-react";
import {useNavigate,useParams} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

export default function ReceiptPage(){
  const companyId=getCompanyId();
  const {caseId,receiptId}=useParams();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [data,setData]=useState(null);

  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  const [verifyComment,setVerifyComment]=useState("");
  const [rejectReason,setRejectReason]=useState("");

  async function load(){
    const [ctx,receiptData]=await Promise.all([
      opsApi.session(companyId),
      opsApi.receipt(
        companyId,
        receiptId
      )
    ]);

    setSession(ctx);
    setData(receiptData);
  }

  useEffect(()=>{
    load().catch(err=>
      setError(err.message)
    );
  },[receiptId]);

  const receipt=data?.receipt||null;
  const lines=data?.lines||[];

  const editable=
    receipt?.status==="draft";

  function setReceipt(key,value){
    setData(x=>({
      ...x,
      receipt:{
        ...x.receipt,
        [key]:value
      }
    }));
  }

  function setLine(index,key,value){
    setData(x=>({
      ...x,
      lines:x.lines.map((line,i)=>
        i===index
          ?{
            ...line,
            [key]:value
          }
          :line
      )
    }));
  }

  function setService(key,value){
    setData(x=>({
      ...x,
      service_confirmation:{
        ...(x.service_confirmation||{}),
        [key]:value
      }
    }));
  }

  function setLease(key,value){
    setData(x=>({
      ...x,
      lease_receipt:{
        ...(x.lease_receipt||{}),
        [key]:value
      }
    }));
  }

  async function save(){
    if(!receipt) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try{
      await opsApi.updateReceipt(
        companyId,
        receipt.id,
        {
          receipt_date:
            receipt.receipt_date,

          delivery_note_no:
            receipt.delivery_note_no,

          supplier_reference:
            receipt.supplier_reference,

          received_location:
            receipt.received_location,

          notes:
            receipt.notes,

          lines:lines.map(line=>({
            id:line.id,

            received_quantity:Number(
              line.received_quantity||0
            ),

            accepted_quantity:Number(
              line.accepted_quantity||0
            ),

            rejected_quantity:Number(
              line.rejected_quantity||0
            ),

            condition_status:
              line.condition_status,

            rejection_reason:
              line.rejection_reason,

            batch_no:
              line.batch_no,

            serial_numbers:
              line.serial_numbers||[],

            notes:
              line.notes
          }))
        }
      );

      if(
        receipt.receipt_type==="service"
      ){
        await opsApi.saveServiceConfirmation(
          companyId,
          receipt.id,
          data.service_confirmation||{
            completion_percent:100
          }
        );
      }

      if(
        receipt.receipt_type==="lease"
      ){
        await opsApi.saveLeaseReceipt(
          companyId,
          receipt.id,
          data.lease_receipt||{}
        );
      }

      await load();

      setSuccess(
        "Receipt draft saved."
      );

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  async function submit(){
    setBusy(true);
    setError("");
    setSuccess("");

    try{
      await save();

      await opsApi.submitReceipt(
        companyId,
        receipt.id
      );

      await load();

      setSuccess(
        "Receipt submitted for verification."
      );

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  async function verify(){
    setBusy(true);
    setError("");
    setSuccess("");

    try{
      await opsApi.verifyReceipt(
        companyId,
        receipt.id,
        verifyComment
      );

      await load();

      setSuccess(
        "Receipt verified successfully."
      );

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  async function reject(){
    if(!rejectReason.trim()){
      setError(
        "Enter a rejection reason."
      );
      return;
    }

    setBusy(true);
    setError("");

    try{
      await opsApi.rejectReceipt(
        companyId,
        receipt.id,
        rejectReason.trim()
      );

      await load();

      setSuccess(
        "Receipt rejected."
      );

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  if(!session||!receipt)
    return (
      <div className="loading-screen">
        Loading receipt…
      </div>
    );

  const title={
    goods:"Goods receipt",
    service:"Service confirmation",
    asset:"Asset receipt",
    lease:"Lease commencement"
  }[receipt.receipt_type]||
    "Receipt";

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
                `/procurement/${caseId}`
              )
            }
          >
            <ArrowLeft size={15}/>
            Procurement
          </button>

          <span className="eyebrow dark">
            FULFILMENT
          </span>

          <h1>{receipt.receipt_no}</h1>

          <p>
            {title} · {receipt.po_no}
          </p>
        </div>

        <div className="receipt-header-actions">
          <span
            className={`status-pill ${receipt.status}`}
          >
            {receipt.status.replaceAll("_"," ")}
          </span>

          {editable&&(
            <>
              <button
                type="button"
                className="ghost-btn"
                disabled={busy}
                onClick={save}
              >
                <Save size={16}/>
                Save draft
              </button>

              <button
                type="button"
                className="primary-btn"
                disabled={busy}
                onClick={submit}
              >
                <Send size={16}/>
                Submit
              </button>
            </>
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

      <div className="receipt-workspace">
        <main className="receipt-main">
          <section className="receipt-section">
            <div className="receipt-section-heading">
              <PackageCheck size={18}/>

              <div>
                <strong>
                  {title}
                </strong>

                <span>
                  Record fulfilment against the approved purchase order.
                </span>
              </div>
            </div>

            <div className="receipt-form-grid">
              <div>
                <label>
                  Receipt date
                </label>

                <input
                  type="date"
                  disabled={!editable}
                  value={
                    receipt.receipt_date
                      ?String(
                        receipt.receipt_date
                      ).slice(0,10)
                      :""
                  }
                  onChange={e=>
                    setReceipt(
                      "receipt_date",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>
                  Delivery note
                </label>

                <input
                  disabled={!editable}
                  value={
                    receipt.delivery_note_no||
                    ""
                  }
                  onChange={e=>
                    setReceipt(
                      "delivery_note_no",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>
                  Received location
                </label>

                <input
                  disabled={!editable}
                  value={
                    receipt.received_location||
                    ""
                  }
                  onChange={e=>
                    setReceipt(
                      "received_location",
                      e.target.value
                    )
                  }
                />
              </div>
            </div>
          </section>

          {["goods","asset"].includes(
            receipt.receipt_type
          )&&(
            <section className="receipt-section">
              <div className="receipt-section-heading">
                <Box size={18}/>

                <div>
                  <strong>
                    Items received
                  </strong>

                  <span>
                    Record actual, accepted and rejected quantities.
                  </span>
                </div>
              </div>

              <div className="receipt-line-table">
                <div className="receipt-line-head">
                  <span>Item</span>
                  <span>Ordered</span>
                  <span>Previously</span>
                  <span>Received</span>
                  <span>Accepted</span>
                  <span>Rejected</span>
                  <span>Condition</span>
                </div>

                {lines.map((line,index)=>(
                  <div
                    className="receipt-line-row"
                    key={line.id}
                  >
                    <div>
                      <strong>
                        {line.description}
                      </strong>

                      <small>
                        {line.specification||""}
                      </small>
                    </div>

                    <span>
                      {line.ordered_quantity}
                    </span>

                    <span>
                      {line.previously_received_quantity}
                    </span>

                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      disabled={!editable}
                      value={
                        line.received_quantity
                      }
                      onChange={e=>
                        setLine(
                          index,
                          "received_quantity",
                          e.target.value
                        )
                      }
                    />

                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      disabled={!editable}
                      value={
                        line.accepted_quantity
                      }
                      onChange={e=>
                        setLine(
                          index,
                          "accepted_quantity",
                          e.target.value
                        )
                      }
                    />

                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      disabled={!editable}
                      value={
                        line.rejected_quantity
                      }
                      onChange={e=>
                        setLine(
                          index,
                          "rejected_quantity",
                          e.target.value
                        )
                      }
                    />

                    <select
                      disabled={!editable}
                      value={
                        line.condition_status||
                        "acceptable"
                      }
                      onChange={e=>
                        setLine(
                          index,
                          "condition_status",
                          e.target.value
                        )
                      }
                    >
                      <option value="acceptable">
                        Acceptable
                      </option>

                      <option value="damaged">
                        Damaged
                      </option>

                      <option value="short_delivered">
                        Short delivered
                      </option>

                      <option value="incorrect">
                        Incorrect
                      </option>
                    </select>
                  </div>
                ))}
              </div>
            </section>
          )}

          {receipt.receipt_type==="service"&&(
            <section className="receipt-section">
              <div className="receipt-section-heading">
                <Wrench size={18}/>

                <div>
                  <strong>
                    Service completion
                  </strong>

                  <span>
                    Confirm what was performed before Accounts Payable can process the supplier invoice.
                  </span>
                </div>
              </div>

              <div className="receipt-form-grid">
                <div>
                  <label>
                    Service from
                  </label>

                  <input
                    type="date"
                    disabled={!editable}
                    value={
                      data.service_confirmation?.service_from||
                      ""
                    }
                    onChange={e=>
                      setService(
                        "service_from",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div>
                  <label>
                    Service to
                  </label>

                  <input
                    type="date"
                    disabled={!editable}
                    value={
                      data.service_confirmation?.service_to||
                      ""
                    }
                    onChange={e=>
                      setService(
                        "service_to",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div>
                  <label>
                    Completion %
                  </label>

                  <input
                    type="number"
                    min="0"
                    max="100"
                    disabled={!editable}
                    value={
                      data.service_confirmation
                        ?.completion_percent
                      ??100
                    }
                    onChange={e=>
                      setService(
                        "completion_percent",
                        e.target.value
                      )
                    }
                  />
                </div>
              </div>

              <label>
                Deliverables completed
              </label>

              <textarea
                rows="5"
                disabled={!editable}
                value={
                  data.service_confirmation
                    ?.deliverables_completed
                  ||""
                }
                onChange={e=>
                  setService(
                    "deliverables_completed",
                    e.target.value
                  )
                }
              />

              <label>
                Quality assessment
              </label>

              <textarea
                rows="4"
                disabled={!editable}
                value={
                  data.service_confirmation
                    ?.quality_assessment
                  ||""
                }
                onChange={e=>
                  setService(
                    "quality_assessment",
                    e.target.value
                  )
                }
              />
            </section>
          )}

          {receipt.receipt_type==="lease"&&(
            <section className="receipt-section">
              <div className="receipt-section-heading">
                <FileCheck2 size={18}/>

                <div>
                  <strong>
                    Lease commencement
                  </strong>

                  <span>
                    Confirm commencement before the IFRS 16 handoff.
                  </span>
                </div>
              </div>

              <div className="receipt-form-grid">
                <div>
                  <label>
                    Commencement date
                  </label>

                  <input
                    type="date"
                    disabled={!editable}
                    value={
                      data.lease_receipt
                        ?.commencement_date
                      ||""
                    }
                    onChange={e=>
                      setLease(
                        "commencement_date",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div>
                  <label>
                    Underlying asset
                  </label>

                  <input
                    disabled={!editable}
                    value={
                      data.lease_receipt
                        ?.underlying_asset
                      ||""
                    }
                    onChange={e=>
                      setLease(
                        "underlying_asset",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div>
                  <label>
                    Contract reference
                  </label>

                  <input
                    disabled={!editable}
                    value={
                      data.lease_receipt
                        ?.contract_reference
                      ||""
                    }
                    onChange={e=>
                      setLease(
                        "contract_reference",
                        e.target.value
                      )
                    }
                  />
                </div>
              </div>
            </section>
          )}

          <section className="receipt-section">
            <label>
              Receipt notes
            </label>

            <textarea
              rows="5"
              disabled={!editable}
              value={receipt.notes||""}
              onChange={e=>
                setReceipt(
                  "notes",
                  e.target.value
                )
              }
            />
          </section>
        </main>

        <aside className="receipt-side">
          <div className="receipt-side-sticky">
            <span className="eyebrow dark">
              CONTROL
            </span>

            <h2>
              Receipt verification
            </h2>

            <div className="receipt-context-card">
              <div>
                <span>PO</span>
                <strong>
                  {receipt.po_no}
                </strong>
              </div>

              <div>
                <span>Vendor</span>
                <strong>
                  {receipt.vendor_name}
                </strong>
              </div>

              <div>
                <span>Receipt type</span>
                <strong>
                  {receipt.receipt_type}
                </strong>
              </div>
            </div>

            {receipt.status==="submitted"&&(
              <>
                <div className="receipt-verification-info">
                  <ShieldCheck size={18}/>

                  <span>
                    Verification confirms that the organisation accepts this fulfilment as evidence for invoice matching.
                  </span>
                </div>

                <label>
                  Verification comment
                </label>

                <textarea
                  rows="4"
                  value={verifyComment}
                  onChange={e=>
                    setVerifyComment(
                      e.target.value
                    )
                  }
                />

                <button
                  type="button"
                  className="primary-btn receipt-full-btn"
                  disabled={busy}
                  onClick={verify}
                >
                  <Check size={16}/>
                  Verify receipt
                </button>

                <label>
                  Rejection reason
                </label>

                <textarea
                  rows="4"
                  value={rejectReason}
                  onChange={e=>
                    setRejectReason(
                      e.target.value
                    )
                  }
                />

                <button
                  type="button"
                  className="reject-btn receipt-full-btn"
                  disabled={busy}
                  onClick={reject}
                >
                  <X size={16}/>
                  Reject
                </button>
              </>
            )}

            {receipt.status==="verified"&&(
              <div className="receipt-verified-card">
                <CheckCircle2 size={22}/>

                <div>
                  <strong>
                    Fulfilment verified
                  </strong>

                  <span>
                    This PO can now participate in supplier invoice matching.
                  </span>
                </div>
              </div>
            )}

            {receipt.status==="rejected"&&(
              <div className="receipt-rejected-card">
                <AlertTriangle size={22}/>

                <div>
                  <strong>
                    Receipt rejected
                  </strong>

                  <span>
                    {receipt.rejection_reason}
                  </span>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </Shell>
  );
}