import {useEffect,useState} from "react";
import {
  AlertTriangle,ArrowLeft,CheckCircle2,FileText,
  Send,ShoppingCart,UploadCloud
} from "lucide-react";
import {useNavigate,useParams} from "react-router-dom";
import {getCompanyId,portalApi} from "../api/api";
import PortalShell from "../components/PortalShell";

const money=(v,c="")=>`${c||""} ${Number(v||0).toLocaleString(undefined,{
  minimumFractionDigits:2,
  maximumFractionDigits:2
})}`.trim();

export default function InvoicePage(){
  const companyId=getCompanyId();
  const {invoiceId}=useParams();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [data,setData]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  async function load(){
    const [ctx,d]=await Promise.all([
      portalApi.session(companyId),
      portalApi.invoice(companyId,invoiceId)
    ]);

    setSession(ctx);
    setData(d);
  }

  useEffect(()=>{
    load().catch(err=>setError(err.message));
  },[invoiceId]);

  async function submit(){
    setBusy(true);
    setError("");
    setSuccess("");

    try{
      await portalApi.submitInvoice(companyId,invoiceId);
      await load();
      setSuccess("Invoice submitted to Accounts Payable.");
    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  if(!session||!data)
    return <div className="portal-loading">Loading invoice…</div>;

  const {invoice,lines,exceptions,match,documents}=data;
  const editable=invoice.status==="draft";

  return (
    <PortalShell session={session} active="invoices">
      <div className="vendor-portal-page-header">
        <div>
          <button type="button" className="portal-back" onClick={()=>nav("/invoices")}>
            <ArrowLeft size={15}/>
            Invoices
          </button>

          <span className="portal-eyebrow">SUPPLIER INVOICE</span>
          <h1>{invoice.supplier_invoice_no}</h1>
          <p>{invoice.po_no||"No purchase order"}</p>
        </div>

        <span className={`portal-status ${invoice.status}`}>
          {invoice.status.replaceAll("_"," ")}
        </span>
      </div>

      {error&&<div className="portal-alert error">{error}</div>}
      {success&&<div className="portal-alert success">{success}</div>}

      <div className="vendor-invoice-workspace">
        <main className="vendor-invoice-main">
          <section className="vendor-po-summary">
            <div>
              <span>Invoice date</span>
              <strong>
                {invoice.invoice_date
                  ?new Date(invoice.invoice_date).toLocaleDateString()
                  :"—"}
              </strong>
            </div>

            <div>
              <span>Due date</span>
              <strong>
                {invoice.due_date
                  ?new Date(invoice.due_date).toLocaleDateString()
                  :"—"}
              </strong>
            </div>

            <div>
              <span>PO</span>
              <strong>{invoice.po_no||"—"}</strong>
            </div>

            <div>
              <span>Total</span>
              <strong>{money(invoice.total_amount,invoice.currency_code)}</strong>
            </div>
          </section>

          <section className="vendor-po-detail-section">
            <div className="vendor-section-title">
              <ShoppingCart size={17}/>
              <div>
                <strong>Invoice lines</strong>
                <span>Amounts submitted against the customer purchase order.</span>
              </div>
            </div>

            <div className="vendor-po-lines">
              <div className="vendor-invoice-lines-head">
                <span>#</span>
                <span>Description</span>
                <span>Qty</span>
                <span>Unit price</span>
                <span>Tax</span>
                <span>Total</span>
              </div>

              {lines.map(line=>(
                <div className="vendor-invoice-lines-row" key={line.id}>
                  <span>{line.line_no}</span>

                  <div>
                    <strong>{line.description}</strong>
                    {line.po_description&&<small>PO: {line.po_description}</small>}
                  </div>

                  <span>{Number(line.quantity||0).toLocaleString()}</span>
                  <span>{money(line.unit_price,invoice.currency_code)}</span>
                  <span>{money(line.tax_amount,invoice.currency_code)}</span>
                  <strong>{money(line.line_total,invoice.currency_code)}</strong>
                </div>
              ))}
            </div>

            <div className="vendor-po-totals">
              <div><span>Subtotal</span><strong>{money(invoice.subtotal,invoice.currency_code)}</strong></div>
              <div><span>Discount</span><strong>{money(invoice.discount_amount,invoice.currency_code)}</strong></div>
              <div><span>Tax</span><strong>{money(invoice.tax_amount,invoice.currency_code)}</strong></div>
              <div className="total">
                <span>Invoice total</span>
                <strong>{money(invoice.total_amount,invoice.currency_code)}</strong>
              </div>
            </div>
          </section>

          <section className="vendor-po-detail-section">
            <div className="vendor-section-title">
              <UploadCloud size={17}/>
              <div>
                <strong>Invoice document</strong>
                <span>Attach the supplier tax invoice or supporting PDF.</span>
              </div>
            </div>

            {!documents.length?(
              <div className="vendor-invoice-upload-placeholder">
                <UploadCloud size={22}/>
                <div>
                  <strong>No invoice document uploaded</strong>
                  <span>Upload support will connect to the invoice-document endpoint.</span>
                </div>
              </div>
            ):(
              <div className="vendor-invoice-document-list">
                {documents.map(doc=>(
                  <div key={doc.id}>
                    <FileText size={16}/>
                    <div>
                      <strong>{doc.file_name}</strong>
                      <span>{doc.document_type}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {match&&(
            <section className="vendor-po-detail-section">
              <div className="vendor-section-title">
                <CheckCircle2 size={17}/>
                <div>
                  <strong>Customer matching status</strong>
                  <span>Accounts Payable validation against the PO and fulfilment.</span>
                </div>
              </div>

              <div className={`vendor-invoice-match-card ${match.status}`}>
                <strong>{match.status.replaceAll("_"," ")}</strong>
                <span>PO: {money(match.po_amount,invoice.currency_code)}</span>
                <span>Invoice: {money(match.invoiced_amount,invoice.currency_code)}</span>
                <span>Variance: {money(match.variance_amount,invoice.currency_code)}</span>
              </div>
            </section>
          )}

          {!!exceptions.length&&(
            <section className="vendor-po-detail-section">
              <div className="vendor-section-title">
                <AlertTriangle size={17}/>
                <div>
                  <strong>Invoice issues</strong>
                  <span>Exceptions identified during customer review.</span>
                </div>
              </div>

              <div className="vendor-invoice-exception-list">
                {exceptions.map(ex=>(
                  <article key={ex.id}>
                    <AlertTriangle size={16}/>
                    <div>
                      <strong>{ex.exception_type.replaceAll("_"," ")}</strong>
                      <p>{ex.description}</p>
                    </div>
                    <span className={`portal-status ${ex.status}`}>{ex.status}</span>
                  </article>
                ))}
              </div>
            </section>
          )}
        </main>

        <aside className="vendor-po-action-panel">
          <div className="vendor-po-action-sticky">
            <span className="portal-eyebrow">INVOICE STATUS</span>
            <h2>{money(invoice.total_amount,invoice.currency_code)}</h2>

            <div className="vendor-profile-customer-info">
              <div><span>Invoice</span><strong>{invoice.supplier_invoice_no}</strong></div>
              <div><span>PO</span><strong>{invoice.po_no||"—"}</strong></div>
              <div><span>Status</span><strong>{invoice.status.replaceAll("_"," ")}</strong></div>
              <div><span>Match</span><strong>{invoice.match_status.replaceAll("_"," ")}</strong></div>
            </div>

            {editable&&(
              <>
                <div className="vendor-po-ack-warning">
                  <FileText size={17}/>
                  <span>
                    Confirm the invoice information is correct before submitting it to the customer.
                  </span>
                </div>

                <button type="button" className="portal-primary vendor-invoice-submit"
                  disabled={busy} onClick={submit}>
                  <Send size={16}/>
                  {busy?"Submitting...":"Submit invoice"}
                </button>
              </>
            )}

            {invoice.status==="submitted"&&(
              <div className="vendor-invoice-status-card pending">
                <FileText size={20}/>
                <div>
                  <strong>Submitted</strong>
                  <span>Your invoice is waiting for Accounts Payable review.</span>
                </div>
              </div>
            )}

            {invoice.status==="under_review"&&(
              <div className="vendor-invoice-status-card pending">
                <FileText size={20}/>
                <div>
                  <strong>Under review</strong>
                  <span>The customer is matching and reviewing your invoice.</span>
                </div>
              </div>
            )}

            {invoice.status==="accepted"&&(
              <div className="vendor-invoice-status-card accepted">
                <CheckCircle2 size={21}/>
                <div>
                  <strong>Invoice accepted</strong>
                  <span>The invoice has been approved for payment processing.</span>
                </div>
              </div>
            )}

            {invoice.status==="rejected"&&(
              <div className="vendor-invoice-status-card rejected">
                <AlertTriangle size={21}/>
                <div>
                  <strong>Invoice rejected</strong>
                  <span>{invoice.rejection_reason||"Contact the customer for more information."}</span>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </PortalShell>
  );
}