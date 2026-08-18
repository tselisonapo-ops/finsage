import {useEffect,useState} from "react";
import {
  ArrowLeft,Building2,CalendarDays,
  FileCheck2,Mail,PackageCheck,Save,Send,ShoppingCart
} from "lucide-react";
import {useNavigate,useParams} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

const money=(value,currency="")=>
  `${currency||""} ${Number(value||0).toLocaleString(undefined,{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  })}`.trim();

export default function PurchaseOrderPage(){
  const companyId=getCompanyId();
  const {caseId,poId}=useParams();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [data,setData]=useState(null);

  const [busy,setBusy]=useState(false);
  const [sending,setSending]=useState(false);

  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [creatingReceipt,setCreatingReceipt]=useState(false);

  async function load(){
    const [ctx,po]=await Promise.all([
      opsApi.session(companyId),
      opsApi.purchaseOrder(
        companyId,
        poId
      )
    ]);

    setSession(ctx);
    setData(po);
  }

  useEffect(()=>{
    load().catch(err=>
      setError(err.message)
    );
  },[poId]);

  const po=data?.purchase_order||null;
  const lines=data?.lines||[];

  const setPo=(key,value)=>
    setData(x=>({
      ...x,
      purchase_order:{
        ...x.purchase_order,
        [key]:value
      }
    }));

  async function save(){
    if(!po) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try{
      await opsApi.updatePurchaseOrder(
        companyId,
        po.id,
        {
          po_date:po.po_date,

          expected_delivery_date:
            po.expected_delivery_date,

          delivery_address:
            po.delivery_address,

          billing_address:
            po.billing_address,

          payment_terms:
            po.payment_terms,

          delivery_terms:
            po.delivery_terms,

          warranty_terms:
            po.warranty_terms,

          supplier_reference:
            po.supplier_reference,

          buyer_notes:
            po.buyer_notes,

          terms_text:
            po.terms_text
        }
      );

      await load();

      setSuccess(
        "Purchase order draft saved."
      );

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  async function issue(){
    setBusy(true);
    setError("");
    setSuccess("");

    try{
      await save();

      await opsApi.issuePurchaseOrder(
        companyId,
        po.id
      );

      await load();

      setSuccess(
        "Purchase order issued."
      );

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  async function send(){
    setSending(true);
    setError("");
    setSuccess("");

    try{
      await opsApi.sendPurchaseOrder(
        companyId,
        po.id
      );

      setSuccess(
        "Purchase order sent to vendor."
      );

    }catch(err){
      setError(err.message);
    }finally{
      setSending(false);
    }
  }

  if(!session||!po)
    return (
      <div className="loading-screen">
        Loading purchase order…
      </div>
    );

  const editable=
    po.status==="draft";

  async function createReceipt(){
    if(!po) return;

    setCreatingReceipt(true);
    setError("");
    setSuccess("");

    try{
      const receipt=
        await opsApi.createReceipt(
          companyId,
          po.id
        );

      nav(
        `/procurement/${caseId}/receipts/${receipt.id}`
      );

    }catch(err){
      setError(err.message);
    }finally{
      setCreatingReceipt(false);
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
                `/procurement/${caseId}/award`
              )
            }
          >
            <ArrowLeft size={15}/>
            Award
          </button>

          <span className="eyebrow dark">
            PURCHASE ORDER
          </span>

          <h1>
            {po.po_no}
          </h1>

          <p>
            {po.vendor_name}
          </p>
        </div>

        <div className="po-header-actions">
          <span
            className={`status-pill ${po.status}`}
          >
            {po.status.replaceAll("_"," ")}
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
                onClick={issue}
              >
                <FileCheck2 size={16}/>
                Issue PO
              </button>
            </>
          )}

          {po.status==="issued"&&(
            <button
              type="button"
              className="primary-btn"
              disabled={sending}
              onClick={send}
            >
              <Mail size={16}/>
              {sending
                ?"Sending..."
                :"Send to vendor"}
            </button>
          )}

          {[
            "issued",
            "acknowledged",
            "partially_received"
          ].includes(po.status)&&(
            <button
              type="button"
              className="primary-btn"
              disabled={creatingReceipt}
              onClick={createReceipt}
            >
              <PackageCheck size={16}/>

              {creatingReceipt
                ?"Opening receipt..."
                :po.fulfilment_type==="service"
                  ?"Confirm service"
                  :"Record receipt"}
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

      <div className="po-builder-workspace">
        <main className="po-builder-inputs">
          <section className="po-section">
            <div className="po-section-heading">
              <ShoppingCart size={18}/>

              <div>
                <strong>
                  Purchase order details
                </strong>

                <span>
                  Commercial values originate from the approved vendor quotation.
                </span>
              </div>
            </div>

            <div className="po-form-grid">
              <div>
                <label>PO date</label>

                <input
                  type="date"
                  disabled={!editable}
                  value={
                    po.po_date
                      ?String(
                        po.po_date
                      ).slice(0,10)
                      :""
                  }
                  onChange={e=>
                    setPo(
                      "po_date",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>
                  Expected delivery
                </label>

                <input
                  type="date"
                  disabled={!editable}
                  value={
                    po.expected_delivery_date
                      ?String(
                        po.expected_delivery_date
                      ).slice(0,10)
                      :""
                  }
                  onChange={e=>
                    setPo(
                      "expected_delivery_date",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>
                  Supplier reference
                </label>

                <input
                  disabled={!editable}
                  value={
                    po.supplier_reference||
                    ""
                  }
                  onChange={e=>
                    setPo(
                      "supplier_reference",
                      e.target.value
                    )
                  }
                />
              </div>
            </div>

            <label>
              Delivery address
            </label>

            <textarea
              rows="4"
              disabled={!editable}
              value={
                po.delivery_address||
                ""
              }
              onChange={e=>
                setPo(
                  "delivery_address",
                  e.target.value
                )
              }
            />

            <label>
              Billing address
            </label>

            <textarea
              rows="3"
              disabled={!editable}
              value={
                po.billing_address||
                ""
              }
              onChange={e=>
                setPo(
                  "billing_address",
                  e.target.value
                )
              }
            />
          </section>

          <section className="po-section">
            <div className="po-section-heading">
              <FileCheck2 size={18}/>

              <div>
                <strong>
                  Order lines
                </strong>

                <span>
                  Generated from the successful quotation.
                </span>
              </div>
            </div>

            <div className="po-line-table">
              <div className="po-line-head">
                <span>#</span>
                <span>Description</span>
                <span>Qty</span>
                <span>Unit price</span>
                <span>Tax</span>
                <span>Total</span>
              </div>

              {lines.map(line=>(
                <div
                  className="po-line-row"
                  key={line.id}
                >
                  <span>
                    {line.line_no}
                  </span>

                  <div>
                    <strong>
                      {line.description}
                    </strong>

                    {line.specification&&(
                      <small>
                        {line.specification}
                      </small>
                    )}
                  </div>

                  <span>
                    {Number(
                      line.quantity||0
                    ).toLocaleString()}
                    {" "}
                    {line.unit_of_measure||""}
                  </span>

                  <span>
                    {money(
                      line.unit_price,
                      po.currency_code
                    )}
                  </span>

                  <span>
                    {money(
                      line.tax_amount,
                      po.currency_code
                    )}
                  </span>

                  <strong>
                    {money(
                      line.line_total,
                      po.currency_code
                    )}
                  </strong>
                </div>
              ))}
            </div>
          </section>

          <section className="po-section">
            <div className="po-section-heading">
              <CalendarDays size={18}/>

              <div>
                <strong>
                  Commercial terms
                </strong>

                <span>
                  Terms supplied to the successful vendor.
                </span>
              </div>
            </div>

            <div className="po-form-grid">
              <div>
                <label>
                  Payment terms
                </label>

                <input
                  disabled={!editable}
                  value={
                    po.payment_terms||
                    ""
                  }
                  onChange={e=>
                    setPo(
                      "payment_terms",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>
                  Delivery terms
                </label>

                <input
                  disabled={!editable}
                  value={
                    po.delivery_terms||
                    ""
                  }
                  onChange={e=>
                    setPo(
                      "delivery_terms",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>
                  Warranty
                </label>

                <input
                  disabled={!editable}
                  value={
                    po.warranty_terms||
                    ""
                  }
                  onChange={e=>
                    setPo(
                      "warranty_terms",
                      e.target.value
                    )
                  }
                />
              </div>
            </div>

            <label>
              Purchase-order terms
            </label>

            <textarea
              rows="7"
              disabled={!editable}
              value={
                po.terms_text||
                ""
              }
              onChange={e=>
                setPo(
                  "terms_text",
                  e.target.value
                )
              }
            />

            <label>
              Internal buyer notes
            </label>

            <textarea
              rows="4"
              disabled={!editable}
              value={
                po.buyer_notes||
                ""
              }
              onChange={e=>
                setPo(
                  "buyer_notes",
                  e.target.value
                )
              }
            />
          </section>
        </main>

        <aside className="po-document-preview">
          <div className="po-preview-toolbar">
            <div>
              <span>
                {po.status==="draft"
                  ?"LIVE DOCUMENT"
                  :"PURCHASE ORDER"}
              </span>

              <strong>
                {po.po_no}
              </strong>
            </div>

            <span
              className={`status-pill ${po.status}`}
            >
              {po.status}
            </span>
          </div>

          <div className="po-document">
            <header className="po-doc-header">
              <div className="po-doc-brand">
                {session.logo_url?(
                  <img
                    src={session.logo_url}
                    alt=""
                  />
                ):(
                  <div className="po-doc-logo">
                    {session.company_name?.[0]?.toUpperCase()||"F"}
                  </div>
                )}

                <div>
                  <strong>
                    {session.company_name}
                  </strong>

                  <span>
                    Purchase Order
                  </span>
                </div>
              </div>

              <div className="po-doc-number">
                <span>
                  PO NUMBER
                </span>

                <strong>
                  {po.po_no}
                </strong>
              </div>
            </header>

            <section className="po-doc-parties">
              <div>
                <span>
                  SUPPLIER
                </span>

                <strong>
                  {po.vendor_name}
                </strong>

                <p>
                  {po.vendor_email||""}
                </p>

                <p>
                  {po.vendor_phone||""}
                </p>
              </div>

              <div>
                <span>
                  ORDER DETAILS
                </span>

                <p>
                  Date: {po.po_date||"—"}
                </p>

                <p>
                  Delivery: {po.expected_delivery_date||"—"}
                </p>

                <p>
                  Currency: {po.currency_code||"—"}
                </p>
              </div>
            </section>

            <section className="po-doc-table">
              <div className="po-doc-table-head">
                <span>#</span>
                <span>Description</span>
                <span>Qty</span>
                <span>Unit Price</span>
                <span>Total</span>
              </div>

              {lines.map(line=>(
                <div
                  className="po-doc-table-row"
                  key={line.id}
                >
                  <span>
                    {line.line_no}
                  </span>

                  <span>
                    {line.description}
                  </span>

                  <span>
                    {line.quantity}
                  </span>

                  <span>
                    {money(
                      line.unit_price,
                      po.currency_code
                    )}
                  </span>

                  <strong>
                    {money(
                      line.line_total,
                      po.currency_code
                    )}
                  </strong>
                </div>
              ))}
            </section>

            <section className="po-doc-total">
              <div>
                <span>Subtotal</span>

                <strong>
                  {money(
                    po.subtotal,
                    po.currency_code
                  )}
                </strong>
              </div>

              <div>
                <span>Discount</span>

                <strong>
                  {money(
                    po.discount_amount,
                    po.currency_code
                  )}
                </strong>
              </div>

              <div>
                <span>Tax</span>

                <strong>
                  {money(
                    po.tax_amount,
                    po.currency_code
                  )}
                </strong>
              </div>

              <div>
                <span>Delivery</span>

                <strong>
                  {money(
                    po.delivery_amount,
                    po.currency_code
                  )}
                </strong>
              </div>

              <div className="grand">
                <span>
                  PURCHASE ORDER TOTAL
                </span>

                <strong>
                  {money(
                    po.total_amount,
                    po.currency_code
                  )}
                </strong>
              </div>
            </section>

            <section className="po-doc-address">
              <span>
                DELIVERY ADDRESS
              </span>

              <p>
                {po.delivery_address||
                 "Not specified"}
              </p>
            </section>

            <footer className="po-doc-footer">
              <span>
                Generated through FinFlow Procurement
              </span>

              <strong>
                {po.po_no}
              </strong>
            </footer>
          </div>
        </aside>
      </div>
    </Shell>
  );
}