import {useEffect,useMemo,useState} from "react";
import {
  ArrowLeft,CheckCircle2,
  FileText,Paperclip,Save,
  Send,Upload
} from "lucide-react";
import {useNavigate,useParams} from "react-router-dom";
import {
  getCompanyId,
  portalApi
} from "../api/api";
import PortalShell from "../components/PortalShell";

const money=(value,currency="")=>
  `${currency||""} ${Number(value||0).toLocaleString(undefined,{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  })}`.trim();

export default function RfqPage(){
  const companyId=getCompanyId();
  const {eventId}=useParams();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [rfq,setRfq]=useState(null);
  const [items,setItems]=useState([]);
  const [quote,setQuote]=useState(null);

  const [busy,setBusy]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  async function load(){
    const [ctx,data]=await Promise.all([
      portalApi.session(companyId),
      portalApi.rfq(
        companyId,
        eventId
      )
    ]);

    setSession(ctx);
    setRfq(data.rfq);
    setItems(data.items||[]);
    setQuote(data.quote);
  }

  useEffect(()=>{
    load().catch(err=>
      setError(err.message)
    );
  },[eventId]);

  const setQuoteField=(key,value)=>
    setQuote(x=>({
      ...x,
      [key]:value
    }));

  const setLine=(index,key,value)=>
    setQuote(x=>({
      ...x,
      lines:x.lines.map((line,i)=>
        i===index
          ?{...line,[key]:value}
          :line
      )
    }));

  const totals=useMemo(()=>{
    let subtotal=0;
    let tax=0;

    (quote?.lines||[]).forEach(line=>{
      const qty=Number(
        line.quantity||0
      );

      const price=Number(
        line.unit_price||0
      );

      const discount=Number(
        line.line_discount||0
      );

      const lineTax=Number(
        line.tax_amount||0
      );

      subtotal+=Math.max(
        qty*price-discount,
        0
      );

      tax+=lineTax;
    });

    const delivery=Number(
      quote?.delivery_amount||0
    );

    return {
      subtotal,
      tax,
      delivery,
      total:
        subtotal
        +tax
        +delivery
    };
  },[quote]);

  async function save(){
    setBusy(true);
    setError("");
    setSuccess("");

    try{
      const data=
        await portalApi.saveQuote(
          companyId,
          quote.id,
          {
            vendor_quote_reference:
              quote.vendor_quote_reference,

            quote_date:
              quote.quote_date,

            valid_until:
              quote.valid_until,

            delivery_amount:
              Number(
                quote.delivery_amount||0
              ),

            lead_time_days:
              quote.lead_time_days,

            warranty_text:
              quote.warranty_text,

            payment_terms:
              quote.payment_terms,

            delivery_terms:
              quote.delivery_terms,

            notes:
              quote.notes,

            lines:quote.lines.map(line=>({
              ...line,
              quantity:Number(
                line.quantity||0
              ),
              unit_price:Number(
                line.unit_price||0
              ),
              line_discount:Number(
                line.line_discount||0
              ),
              tax_amount:Number(
                line.tax_amount||0
              )
            }))
          }
        );

      setQuote(data);
      setSuccess(
        "Quotation draft saved."
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

      await portalApi.submitQuote(
        companyId,
        quote.id
      );

      await load();

      setSuccess(
        "Quotation submitted successfully."
      );

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  async function upload(file){
    if(!file) return;

    setUploading(true);
    setError("");

    try{
      await portalApi.uploadQuoteDocument(
        companyId,
        quote.id,
        file,
        "quotation"
      );

      await load();

    }catch(err){
      setError(err.message);
    }finally{
      setUploading(false);
    }
  }

  if(!session||!rfq||!quote)
    return (
      <div className="portal-loading">
        Loading RFQ…
      </div>
    );

  const editable=
    quote.status==="draft";

  return (
    <PortalShell
      session={session}
      active="rfqs"
    >
      <div className="vendor-portal-page-header">
        <div>
          <button
            type="button"
            className="portal-back"
            onClick={()=>nav("/")}
          >
            <ArrowLeft size={15}/>
            RFQs
          </button>

          <span className="portal-eyebrow">
            REQUEST FOR QUOTATION
          </span>

          <h1>
            {rfq.rfq_no||
             rfq.sourcing_no}
          </h1>

          <p>
            {rfq.title}
          </p>
        </div>

        <div className="vendor-quote-actions">
          <span
            className={`portal-status ${quote.status}`}
          >
            {quote.status}
          </span>

          {editable&&(
            <>
              <button
                type="button"
                className="portal-secondary"
                disabled={busy}
                onClick={save}
              >
                <Save size={16}/>
                Save draft
              </button>

              <button
                type="button"
                className="portal-primary"
                disabled={busy}
                onClick={submit}
              >
                <Send size={16}/>
                Submit quotation
              </button>
            </>
          )}
        </div>
      </div>

      {error&&(
        <div className="portal-alert error">
          {error}
        </div>
      )}

      {success&&(
        <div className="portal-alert success">
          {success}
        </div>
      )}

      <div className="vendor-quote-workspace">
        <main className="vendor-quote-main">
          <section className="vendor-rfq-summary">
            <div>
              <span>Closing date</span>
              <strong>
                {rfq.closing_date||"—"}
              </strong>
            </div>

            <div>
              <span>Required delivery</span>
              <strong>
                {rfq.required_delivery_date||"—"}
              </strong>
            </div>

            <div>
              <span>Currency</span>
              <strong>
                {quote.currency_code||
                 rfq.currency_code||
                 session.company.currency}
              </strong>
            </div>
          </section>

          <section className="vendor-quote-section">
            <div className="vendor-section-title">
              <FileText size={17}/>

              <div>
                <strong>Quotation details</strong>
                <span>
                  Your commercial quotation reference and validity.
                </span>
              </div>
            </div>

            <div className="portal-form-grid">
              <div>
                <label>Your quote reference</label>
                <input
                  value={
                    quote.vendor_quote_reference||
                    ""
                  }
                  disabled={!editable}
                  onChange={e=>
                    setQuoteField(
                      "vendor_quote_reference",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>Quote date</label>
                <input
                  type="date"
                  value={
                    quote.quote_date
                      ?String(
                        quote.quote_date
                      ).slice(0,10)
                      :""
                  }
                  disabled={!editable}
                  onChange={e=>
                    setQuoteField(
                      "quote_date",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>Valid until</label>
                <input
                  type="date"
                  value={
                    quote.valid_until
                      ?String(
                        quote.valid_until
                      ).slice(0,10)
                      :""
                  }
                  disabled={!editable}
                  onChange={e=>
                    setQuoteField(
                      "valid_until",
                      e.target.value
                    )
                  }
                />
              </div>
            </div>
          </section>

          <section className="vendor-quote-section">
            <div className="vendor-section-title">
              <FileText size={17}/>

              <div>
                <strong>Pricing</strong>
                <span>
                  Complete the structured quotation lines below.
                </span>
              </div>
            </div>

            <div className="vendor-quote-table">
              <div className="vendor-quote-table-head">
                <span>Description</span>
                <span>Qty</span>
                <span>Unit price</span>
                <span>Discount</span>
                <span>Tax</span>
                <span>Total</span>
              </div>

              {quote.lines.map((line,index)=>{
                const total=Math.max(
                  Number(
                    line.quantity||0
                  )
                  *Number(
                    line.unit_price||0
                  )
                  -Number(
                    line.line_discount||0
                  )
                  +Number(
                    line.tax_amount||0
                  ),
                  0
                );

                return (
                  <div
                    className="vendor-quote-table-row"
                    key={line.id}
                  >
                    <div>
                      <strong>
                        {line.description}
                      </strong>

                      {line.offered_specification&&(
                        <small>
                          {line.offered_specification}
                        </small>
                      )}
                    </div>

                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      disabled={!editable}
                      value={line.quantity}
                      onChange={e=>
                        setLine(
                          index,
                          "quantity",
                          e.target.value
                        )
                      }
                    />

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!editable}
                      value={line.unit_price}
                      onChange={e=>
                        setLine(
                          index,
                          "unit_price",
                          e.target.value
                        )
                      }
                    />

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!editable}
                      value={line.line_discount}
                      onChange={e=>
                        setLine(
                          index,
                          "line_discount",
                          e.target.value
                        )
                      }
                    />

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!editable}
                      value={line.tax_amount}
                      onChange={e=>
                        setLine(
                          index,
                          "tax_amount",
                          e.target.value
                        )
                      }
                    />

                    <strong>
                      {money(
                        total,
                        quote.currency_code
                      )}
                    </strong>

                    <textarea
                      className="vendor-line-spec"
                      rows="2"
                      disabled={!editable}
                      value={
                        line.offered_specification||
                        ""
                      }
                      onChange={e=>
                        setLine(
                          index,
                          "offered_specification",
                          e.target.value
                        )
                      }
                      placeholder="Offered specification / model..."
                    />
                  </div>
                );
              })}
            </div>

            <div className="vendor-quote-totals">
              <div>
                <span>Subtotal</span>
                <strong>
                  {money(
                    totals.subtotal,
                    quote.currency_code
                  )}
                </strong>
              </div>

              <div>
                <span>Tax</span>
                <strong>
                  {money(
                    totals.tax,
                    quote.currency_code
                  )}
                </strong>
              </div>

              <div>
                <span>Delivery</span>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={!editable}
                  value={
                    quote.delivery_amount||
                    0
                  }
                  onChange={e=>
                    setQuoteField(
                      "delivery_amount",
                      e.target.value
                    )
                  }
                />
              </div>

              <div className="total">
                <span>Total quotation</span>
                <strong>
                  {money(
                    totals.total,
                    quote.currency_code
                  )}
                </strong>
              </div>
            </div>
          </section>

          <section className="vendor-quote-section">
            <div className="vendor-section-title">
              <Paperclip size={17}/>

              <div>
                <strong>Quotation document</strong>
                <span>
                  Upload the signed or official quotation supplied by your organisation.
                </span>
              </div>
            </div>

            {editable&&(
              <label className="vendor-upload-zone">
                <Upload size={22}/>

                <strong>
                  {uploading
                    ?"Uploading..."
                    :"Upload quotation PDF"}
                </strong>

                <span>
                  PDF, image, Word or Excel
                </span>

                <input
                  type="file"
                  hidden
                  disabled={uploading}
                  onChange={e=>
                    upload(
                      e.target.files?.[0]
                    )
                  }
                />
              </label>
            )}

            <div className="vendor-document-list">
              {(quote.documents||[]).map(doc=>(
                <article
                  className="vendor-document-row"
                  key={doc.id}
                >
                  <FileText size={16}/>

                  <div>
                    <strong>
                      {doc.file_name}
                    </strong>

                    <span>
                      {doc.document_type}
                    </span>
                  </div>

                  <CheckCircle2 size={15}/>
                </article>
              ))}
            </div>
          </section>

          <section className="vendor-quote-section">
            <div className="vendor-section-title">
              <FileText size={17}/>

              <div>
                <strong>Commercial terms</strong>
                <span>
                  Include delivery, payment and warranty information.
                </span>
              </div>
            </div>

            <div className="portal-form-grid">
              <div>
                <label>Lead time</label>

                <input
                  type="number"
                  min="0"
                  disabled={!editable}
                  value={
                    quote.lead_time_days||
                    ""
                  }
                  onChange={e=>
                    setQuoteField(
                      "lead_time_days",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>Payment terms</label>

                <input
                  disabled={!editable}
                  value={
                    quote.payment_terms||
                    ""
                  }
                  onChange={e=>
                    setQuoteField(
                      "payment_terms",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>Delivery terms</label>

                <input
                  disabled={!editable}
                  value={
                    quote.delivery_terms||
                    ""
                  }
                  onChange={e=>
                    setQuoteField(
                      "delivery_terms",
                      e.target.value
                    )
                  }
                />
              </div>
            </div>

            <label>Warranty</label>

            <textarea
              rows="3"
              disabled={!editable}
              value={
                quote.warranty_text||
                ""
              }
              onChange={e=>
                setQuoteField(
                  "warranty_text",
                  e.target.value
                )
              }
            />

            <label>Additional notes</label>

            <textarea
              rows="4"
              disabled={!editable}
              value={
                quote.notes||
                ""
              }
              onChange={e=>
                setQuoteField(
                  "notes",
                  e.target.value
                )
              }
            />
          </section>
        </main>

        <aside className="vendor-rfq-document">
          <span className="portal-eyebrow">
            CUSTOMER RFQ
          </span>

          <h2>
            {rfq.rfq_no||
             rfq.sourcing_no}
          </h2>

          <h3>{rfq.title}</h3>

          <p>
            {rfq.description}
          </p>

          <div className="vendor-rfq-document-meta">
            <div>
              <span>Closing</span>
              <strong>
                {rfq.closing_date||"—"}
              </strong>
            </div>

            <div>
              <span>Delivery</span>
              <strong>
                {rfq.required_delivery_date||
                 "—"}
              </strong>
            </div>
          </div>

          <div className="vendor-rfq-document-items">
            {items.map(item=>(
              <div key={item.id}>
                <span>
                  {item.line_no}
                </span>

                <div>
                  <strong>
                    {item.description}
                  </strong>

                  <small>
                    {item.quantity}{" "}
                    {item.unit_of_measure||""}
                  </small>

                  {item.specification&&(
                    <p>
                      {item.specification}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="vendor-rfq-terms">
            <strong>
              Submission instructions
            </strong>

            <p>
              {rfq.submission_instructions||
               "Submit your quotation before the closing date."}
            </p>
          </div>
        </aside>
      </div>
    </PortalShell>
  );
}