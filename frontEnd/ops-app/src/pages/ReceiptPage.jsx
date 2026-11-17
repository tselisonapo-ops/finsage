import {useEffect,useState} from "react";
import {
  AlertTriangle,ArrowLeft,Box,
  Check,CheckCircle2,FileCheck2,
  PackageCheck,Save,Send,ShieldCheck,
  Wrench,X,ExternalLink,Lock
} from "lucide-react";
import {useNavigate,useParams} from "react-router-dom";
import {getCompanyId,getFinSageAppUrl,opsApi} from "../api/api";
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
  const [canAccessAccounting,setCanAccessAccounting]=useState(false);

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

    try {
      const acctStatus = await opsApi.checkAccountingStatus(companyId);
      setCanAccessAccounting(Boolean(acctStatus?.can_access_accounting));
    } catch {
      setCanAccessAccounting(false);
    }
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

  function setAsset(poLineId, key, value){
    setData(x => {
      const existing = x.asset_receipts || [];
      const idx = existing.findIndex(a => a.purchase_order_line_id === poLineId);
      let updated;
      if (idx >= 0) {
        updated = existing.map((a, i) => i === idx ? { ...a, [key]: value } : a);
      } else {
        updated = [...existing, { purchase_order_line_id: poLineId, [key]: value }];
      }
      return { ...x, asset_receipts: updated };
    });
  }

  function handoffAssetToFinSage(line) {
    if (!canAccessAccounting) {
      alert("Access Restricted: Only accountants and administrators with FinSage ERP access can hand off assets to FinSage.");
      return;
    }
    const poLineId = line.po_line_id || line.id;
    const url = new URL(getFinSageAppUrl());
    url.searchParams.set("screen", "fixedassets");
    url.searchParams.set("action", "acquire_asset");
    url.searchParams.set("receipt_id", String(receipt.id));
    url.searchParams.set("po_line_id", String(poLineId));
    url.searchParams.set("company_id", String(companyId));
    window.location.href = url.toString();
  }

  function handoffLeaseToFinSage() {
    if (!canAccessAccounting) {
      alert("Access Restricted: Only accountants and administrators with FinSage ERP access can hand off leases to FinSage.");
      return;
    }
    const perspective = (data?.lease_receipt?.lease_perspective || "lessee").toLowerCase();
    const url = new URL(getFinSageAppUrl());
    if (perspective === "lessor") {
      url.searchParams.set("screen", "lessor-subsequent");
      url.searchParams.set("action", "lessor_lease");
      url.searchParams.set("lease_role", "lessor");
    } else {
      url.searchParams.set("screen", "leases");
      url.searchParams.set("action", "lease_wizard");
      url.searchParams.set("lease_role", "lessee");
    }
    url.searchParams.set("receipt_id", String(receipt.id));
    url.searchParams.set("company_id", String(companyId));
    window.location.href = url.toString();
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
        receipt.receipt_type==="asset"
      ){
        const assetList = data.asset_receipts || [];
        for (const line of lines) {
          const poLineId = line.po_line_id || line.id;
          const assetInfo = assetList.find(a => a.purchase_order_line_id === poLineId) || {};
          await opsApi.saveAssetReceipt(
            companyId,
            receipt.id,
            poLineId,
            assetInfo
          );
        }
      }

      if(
        receipt.receipt_type==="lease"
      ){
        await opsApi.saveLeaseReceipt(
          companyId,
          receipt.id,
          {
            ...(data.lease_receipt||{}),
            lease_perspective: data.lease_receipt?.lease_perspective || "lessee",
          }
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

              {receipt.receipt_type==="asset"&&(
                <div style={{marginTop:"20px",borderTop:"1px solid #e2e8f0",paddingTop:"16px"}}>
                  <h4 style={{fontSize:"14px",fontWeight:600,color:"#0f172a",marginBottom:"12px"}}>
                    Fixed Asset Capitalisation & Tagging
                  </h4>
                  {lines.map((line)=>{
                    const poLineId = line.po_line_id || line.id;
                    const asset = (data.asset_receipts||[]).find(a=>a.purchase_order_line_id===poLineId)||{};
                    return (
                      <div key={`asset-${poLineId}`} style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:"10px",padding:"14px",marginBottom:"12px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
                          <strong>{line.description}</strong>
                          <span style={{fontSize:"12px",color:"#64748b"}}>Ordered: {line.ordered_quantity} | Accepted: {line.accepted_quantity}</span>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",gap:"10px",marginBottom:"10px"}}>
                          <div>
                            <label style={{fontSize:"11px",color:"#475569",display:"block",marginBottom:"4px"}}>Asset Tag</label>
                            <input
                              type="text"
                              disabled={!editable}
                              placeholder="e.g. AST-001"
                              value={asset.asset_tag||""}
                              onChange={e=>setAsset(poLineId,"asset_tag",e.target.value)}
                              style={{width:"100%",padding:"6px 10px",fontSize:"12px",borderRadius:"6px",border:"1px solid #cbd5e1"}}
                            />
                          </div>
                          <div>
                            <label style={{fontSize:"11px",color:"#475569",display:"block",marginBottom:"4px"}}>Serial Number</label>
                            <input
                              type="text"
                              disabled={!editable}
                              placeholder="e.g. SN-98765432"
                              value={asset.serial_number||""}
                              onChange={e=>setAsset(poLineId,"serial_number",e.target.value)}
                              style={{width:"100%",padding:"6px 10px",fontSize:"12px",borderRadius:"6px",border:"1px solid #cbd5e1"}}
                            />
                          </div>
                          <div>
                            <label style={{fontSize:"11px",color:"#475569",display:"block",marginBottom:"4px"}}>Category</label>
                            <input
                              type="text"
                              disabled={!editable}
                              placeholder="e.g. Plant & Machinery"
                              value={asset.category||""}
                              onChange={e=>setAsset(poLineId,"category",e.target.value)}
                              style={{width:"100%",padding:"6px 10px",fontSize:"12px",borderRadius:"6px",border:"1px solid #cbd5e1"}}
                            />
                          </div>
                          <div>
                            <label style={{fontSize:"11px",color:"#475569",display:"block",marginBottom:"4px"}}>Location</label>
                            <input
                              type="text"
                              disabled={!editable}
                              placeholder="e.g. Site Office"
                              value={asset.location_text||""}
                              onChange={e=>setAsset(poLineId,"location_text",e.target.value)}
                              style={{width:"100%",padding:"6px 10px",fontSize:"12px",borderRadius:"6px",border:"1px solid #cbd5e1"}}
                            />
                          </div>
                          <div>
                            <label style={{fontSize:"11px",color:"#475569",display:"block",marginBottom:"4px"}}>Placed in Service Date</label>
                            <input
                              type="date"
                              disabled={!editable}
                              value={asset.placed_in_service_date||receipt.receipt_date||""}
                              onChange={e=>setAsset(poLineId,"placed_in_service_date",e.target.value)}
                              style={{width:"100%",padding:"6px 10px",fontSize:"12px",borderRadius:"6px",border:"1px solid #cbd5e1"}}
                            />
                          </div>
                        </div>

                        {receipt.status==="verified"&&(
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:"8px",borderTop:"1px dashed #cbd5e1"}}>
                            <span style={{fontSize:"12px",color:"#64748b"}}>
                              Handoff Status: <strong style={{color: asset.handoff_status==="completed"?"#059669":"#0284c7"}}>{asset.handoff_status||"Ready for FinSage"}</strong>
                            </span>
                            {canAccessAccounting ? (
                              <button
                                type="button"
                                className="primary-btn"
                                onClick={()=>handoffAssetToFinSage(line)}
                                style={{fontSize:"12px",padding:"6px 12px",display:"inline-flex",alignItems:"center",gap:"6px"}}
                              >
                                <ExternalLink size={13}/>
                                Open in FinSage Fixed Assets Drawer →
                              </button>
                            ) : (
                              <div style={{display:"inline-flex",alignItems:"center",gap:"6px",padding:"4px 10px",background:"#fef3c7",color:"#92400e",borderRadius:"6px",fontSize:"11px",fontWeight:600}}>
                                <Lock size={12}/>
                                Accountants & Super Admins only
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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

                <div>
                  <label>
                    Lease perspective
                  </label>

                  <select
                    disabled={!editable}
                    value={
                      data.lease_receipt?.lease_perspective || "lessee"
                    }
                    onChange={e=>
                      setLease(
                        "lease_perspective",
                        e.target.value
                      )
                    }
                  >
                    <option value="lessee">Lessee (Right-of-Use Asset / Liability)</option>
                    <option value="lessor">Lessor (Subsequent Measurement / Receivable)</option>
                  </select>
                </div>
              </div>

              {receipt.status==="verified"&&(
                <div style={{marginTop:"16px",padding:"16px",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:"12px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px"}}>
                    <FileCheck2 size={18} color="#00C8C8"/>
                    <strong style={{fontSize:"14px",color:"#0f172a"}}>FinSage IFRS 16 Accounting Hand-over</strong>
                  </div>
                  <p style={{fontSize:"12px",color:"#64748b",marginBottom:"12px"}}>
                    Perspective: <strong>{data.lease_receipt?.lease_perspective === "lessor" ? "Lessor Accounting" : "Lessee Accounting (IFRS 16)"}</strong>.
                    Move to FinSage ERP to initiate lease schedule calculation and general ledger recognition.
                  </p>
                  {canAccessAccounting ? (
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={handoffLeaseToFinSage}
                      style={{display:"inline-flex",alignItems:"center",gap:"8px"}}
                    >
                      <ExternalLink size={15}/>
                      {data.lease_receipt?.lease_perspective === "lessor"
                        ? "Open in FinSage Lessor Measurement →"
                        : "Open in FinSage IFRS 16 Lessee Lease Wizard →"}
                    </button>
                  ) : (
                    <div style={{display:"inline-flex",alignItems:"center",gap:"6px",padding:"8px 12px",background:"#fef3c7",color:"#92400e",borderRadius:"8px",fontSize:"12px",fontWeight:600}}>
                      <Lock size={14}/>
                      Restricted to FinSage Accountants and Super Admins
                    </div>
                  )}
                </div>
              )}
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

            {receipt.status==="verified" && ["asset", "lease"].includes(receipt.receipt_type) && (
              <div style={{marginTop:"16px",padding:"14px",background:"#fff",border:"1px solid #e2e8f0",borderRadius:"12px",boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"8px"}}>
                  <PackageCheck size={18} color="#00C8C8"/>
                  <strong style={{fontSize:"13px",color:"#0f172a"}}>FinSage ERP Hand-over</strong>
                </div>

                <p style={{fontSize:"12px",color:"#64748b",marginBottom:"12px"}}>
                  {receipt.receipt_type === "asset"
                    ? "Capitalise verified line items directly into the FinSage Fixed Asset Register."
                    : `Handoff lease contract to FinSage (${data.lease_receipt?.lease_perspective === "lessor" ? "Lessor" : "Lessee IFRS 16"}).`}
                </p>

                {canAccessAccounting ? (
                  receipt.receipt_type === "asset" ? (
                    <button
                      type="button"
                      className="primary-btn receipt-full-btn"
                      onClick={() => handoffAssetToFinSage(lines[0] || {})}
                      disabled={!lines.length}
                    >
                      <ExternalLink size={15}/>
                      Open Fixed Assets Drawer
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary-btn receipt-full-btn"
                      onClick={handoffLeaseToFinSage}
                    >
                      <ExternalLink size={15}/>
                      {data.lease_receipt?.lease_perspective === "lessor"
                        ? "Open Lessor Measurement"
                        : "Open IFRS 16 Lease Wizard"}
                    </button>
                  )
                ) : (
                  <div style={{display:"flex",alignItems:"center",gap:"8px",padding:"8px 10px",background:"#fef3c7",color:"#92400e",borderRadius:"8px",fontSize:"11px",fontWeight:600}}>
                    <Lock size={14}/>
                    <span>Accounting Hand-over Restricted (Accountants & Admins only)</span>
                  </div>
                )}
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