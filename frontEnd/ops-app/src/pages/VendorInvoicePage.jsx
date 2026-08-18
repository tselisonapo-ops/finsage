import {useEffect,useState} from "react";
import {AlertTriangle,ArrowLeft,Check,ExternalLink,Landmark,FileCheck2,ReceiptText,ShieldCheck,X} from "lucide-react";
import {useNavigate,useParams} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import FinanceShell from "../components/FinanceShell";

const money=(v,c="")=>`${c||""} ${Number(v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`.trim();

export default function VendorInvoicePage(){
  const companyId=getCompanyId();
  const {invoiceId}=useParams();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [data,setData]=useState(null);
  const [form,setForm]=useState({
    tax_review_status:"passed"
  });
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [finance,setFinance]=useState(null);
  const [accounting,setAccounting]=useState(null);
  const [handoffBusy,setHandoffBusy]=useState(false);
  const [paymentEligibility,setPaymentEligibility]=useState(null);

  async function load(){
    const [ctx,fin,d]=await Promise.all([
      opsApi.session(companyId),
      opsApi.financeContext(companyId),
      opsApi.vendorInvoice(companyId,invoiceId)
    ]);

    setSession(ctx);
    setFinance(fin);
    setData(d);

    setForm({
      tax_review_status:
        d.invoice.tax_review_status==="pending"
          ?"passed"
          :d.invoice.tax_review_status
    });

    if(d.invoice.ready_for_accounting){
      try{
        setAccounting(
          await opsApi.invoiceAccountingStatus(companyId,invoiceId)
        );
      }catch{
        setAccounting(null);
      }
    if(d.invoice.accounting_bill_id){
      try{
        setPaymentEligibility(
          await opsApi.paymentEligibility(
            companyId,
            invoiceId
          )
        );
      }catch{
        setPaymentEligibility(null);
      }
    }
    }
  }

  useEffect(()=>{load().catch(e=>setError(e.message));},[invoiceId]);

  async function match(){
    setBusy(true);setError("");setSuccess("");
    try{await opsApi.matchVendorInvoice(companyId,invoiceId);await load();setSuccess("Invoice matching completed.");}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }

  async function review(){
    setBusy(true);setError("");setSuccess("");

    try{
      await opsApi.reviewVendorInvoice(companyId,invoiceId,{
        tax_review_status:form.tax_review_status
      });

      await load();
      setSuccess("Finance review completed.");
    }catch(e){
      setError(e.message);
    }finally{
      setBusy(false);
    }
  }

  async function accept(){
    setBusy(true);setError("");setSuccess("");

    try{
      await opsApi.acceptVendorInvoice(companyId,invoiceId);
      await load();
      setSuccess("Invoice accepted and ready for accounting handoff.");
    }catch(e){
      setError(e.message);
    }finally{
      setBusy(false);
    }
  }

  async function reject(){
    if(!reason.trim()){setError("Rejection reason is required.");return;}
    setBusy(true);setError("");
    try{await opsApi.rejectVendorInvoice(companyId,invoiceId,reason);await load();setSuccess("Invoice rejected.");}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }

  if(!session||!finance||!data)
    return <div className="loading-screen">Loading invoice…</div>;

  const {invoice,lines,exceptions,match:matchResult}=data;

  function setLine(index,key,value){
    setData(x=>({
      ...x,
      lines:x.lines.map((line,i)=>i===index?{...line,[key]:value}:line)
    }));
  }

  async function saveCoding(){
    setBusy(true);
    setError("");
    setSuccess("");

    try{
      await opsApi.saveInvoiceCoding(
        companyId,
        invoiceId,
        lines.map(line=>({
          id:line.id,
          gl_account_code:line.gl_account_code||"",
          tax_code:line.tax_code||""
        }))
      );

      await load();
      setSuccess("Invoice coding saved.");
    }catch(e){
      setError(e.message);
    }finally{
      setBusy(false);
    }
  }

  async function sendToAccounting(){
    setHandoffBusy(true);
    setError("");
    setSuccess("");

    try{
      const result=await opsApi.handoffInvoiceToAccounting(
        companyId,
        invoiceId
      );

      setAccounting({
        accounting_handoff_status:result.handoff_status,
        accounting_bill_id:result.bill_id,
        accounting_bill_no:result.bill_no,
        bill_status:result.bill_status
      });

      await load();

      setSuccess(
        result.already_exists
          ?`FinSage bill ${result.bill_no} already exists.`
          :`FinSage draft bill ${result.bill_no} created successfully.`
      );

    }catch(e){
      setError(e.message);
    }finally{
      setHandoffBusy(false);
    }
  }

  function getFinSageAppUrl(){
    const configured=(import.meta.env.VITE_FINSAGE_APP_URL||"").trim();
    if(configured) return configured;

    const local=["localhost","127.0.0.1"].includes(window.location.hostname);

    return local
      ?"http://127.0.0.1:5000/dashboard.html"
      :`${window.location.origin}/app/dashboard.html`;
  }

  function openInFinSage(){
    if(!accounting?.accounting_bill_id) return;

    const url=new URL(getFinSageAppUrl());
    url.searchParams.set("screen","ap");
    url.searchParams.set("bill_id",String(accounting.accounting_bill_id));

    window.location.href=url.toString();
  }

  function openPaymentInFinSage(voucher){
    if(!voucher?.accounting_bill_id) return;

    const url=new URL(getFinSageAppUrl());

    url.searchParams.set("screen","ap");
    url.searchParams.set("bill_id",String(voucher.accounting_bill_id));
    url.searchParams.set("action","payment");
    url.searchParams.set("voucher_id",String(voucher.id));

    if(voucher.amount)
      url.searchParams.set("amount",String(voucher.amount));

    if(voucher.payment_date)
      url.searchParams.set("payment_date",voucher.payment_date);

    if(voucher.reference)
      url.searchParams.set("reference",voucher.reference);

    if(voucher.description)
      url.searchParams.set("description",voucher.description);

    if(voucher.wht_enabled){
      url.searchParams.set("wht","1");
      url.searchParams.set("wht_rate",String(voucher.wht_rate||0));
      url.searchParams.set("wht_amount",String(voucher.wht_amount||0));

      if(voucher.wht_ledger_code)
        url.searchParams.set("wht_ledger_code",voucher.wht_ledger_code);

      if(voucher.wht_reason)
        url.searchParams.set("wht_reason",voucher.wht_reason);
    }

    window.location.href=url.toString();
  }

  return (
    <FinanceShell
      session={session}
      finance={finance}
      active="payables-invoices"
    >
      <div className="page-header">
        <div>
          <button
            type="button"
            className="page-back-link"
            onClick={()=>nav("/finance/payables/invoices")}
          >
            <ArrowLeft size={15}/>
            Invoice Inbox
          </button>
          <span className="eyebrow dark">SUPPLIER INVOICE</span>
          <h1>{invoice.supplier_invoice_no}</h1>
          <p>{invoice.vendor_name} · {invoice.po_no}</p>
        </div>

        <span className={`status-pill ${invoice.status}`}>{invoice.status.replaceAll("_"," ")}</span>
      </div>

      {error&&<div className="alert error">{error}</div>}
      {success&&<div className="alert success">{success}</div>}

      <div className="invoice-review-workspace">
        <main className="invoice-review-main">
          <section className="invoice-review-section">
            <div className="section-heading">
              <div>
                <h2>Invoice lines & financial coding</h2>
                <p>Compare supplier values with the PO, then assign the correct GL and tax treatment.</p>
              </div>
              <ReceiptText/>
            </div>

            <div className="invoice-match-table">
              <div className="invoice-match-head invoice-coding-head">
                <span>Description</span>
                <span>Invoice Qty</span>
                <span>Received</span>
                <span>PO Price</span>
                <span>Invoice Price</span>
                <span>GL Account</span>
                <span>Tax Code</span>
                <span>Status</span>
              </div>

              {lines.map((line,index)=>(
                <div className="invoice-match-row invoice-coding-row" key={line.id}>
                  <strong>{line.description}</strong>
                  <span>{line.quantity}</span>
                  <span>{line.received_quantity??"—"}</span>
                  <span>{money(line.po_unit_price,invoice.currency_code)}</span>
                  <span>{money(line.unit_price,invoice.currency_code)}</span>

                  <input
                    value={line.gl_account_code||""}
                    onChange={e=>setLine(index,"gl_account_code",e.target.value)}
                    placeholder="GL account"
                    disabled={invoice.status==="accepted"||invoice.status==="rejected"}
                  />

                  <input
                    value={line.tax_code||""}
                    onChange={e=>setLine(index,"tax_code",e.target.value)}
                    placeholder="Tax code"
                    disabled={invoice.status==="accepted"||invoice.status==="rejected"}
                  />

                  <span className={`status-pill ${line.match_status}`}>
                    {line.match_status.replaceAll("_"," ")}
                  </span>
                </div>
              ))}
            </div>

            {["submitted","under_review"].includes(invoice.status)&&(
              <button type="button" className="ghost-btn coding-save-btn" disabled={busy} onClick={saveCoding}>
                {busy?"Saving...":"Save financial coding"}
              </button>
            )}
          </section>

          <section className="invoice-review-section">
            <div className="section-heading">
              <div><h2>Matching</h2><p>PO, fulfilment and supplier invoice validation.</p></div>
              <FileCheck2/>
            </div>

            {matchResult?(
              <div className={`invoice-match-summary ${matchResult.status}`}>
                <strong>{matchResult.status.replaceAll("_"," ")}</strong>
                <span>PO {money(matchResult.po_amount,invoice.currency_code)}</span>
                <span>Invoice {money(matchResult.invoiced_amount,invoice.currency_code)}</span>
                <span>Variance {money(matchResult.variance_amount,invoice.currency_code)}</span>
              </div>
            ):(
              <button type="button" className="primary-btn" disabled={busy} onClick={match}>
                <FileCheck2 size={16}/> Run invoice match
              </button>
            )}

            {!!exceptions.length&&(
              <div className="invoice-exception-list">
                {exceptions.map(ex=>(
                  <article key={ex.id} className={`invoice-exception ${ex.severity}`}>
                    <AlertTriangle size={17}/>
                    <div><strong>{ex.exception_type.replaceAll("_"," ")}</strong><p>{ex.description}</p></div>
                    <span className={`status-pill ${ex.status}`}>{ex.status}</span>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="invoice-review-section">
            <div className="section-heading">
              <div>
                <h2>Finance review</h2>
                <p>Confirm matching, financial coding and tax treatment before accepting the invoice.</p>
              </div>
              <ShieldCheck/>
            </div>

            <div className="invoice-coding-grid">
              <div>
                <label>Tax review</label>
                <select
                  value={form.tax_review_status}
                  onChange={e=>setForm(x=>({...x,tax_review_status:e.target.value}))}
                  disabled={invoice.status==="accepted"||invoice.status==="rejected"}
                >
                  <option value="passed">Passed</option>
                  <option value="exception">Exception</option>
                  <option value="not_required">Not required</option>
                </select>
              </div>
            </div>

            <div className="finance-review-checks">
              <div>
                <span>Matching</span>
                <strong>{invoice.match_status.replaceAll("_"," ")}</strong>
              </div>

              <div>
                <span>Financial coding</span>
                <strong>{String(invoice.coding_status||"pending").replaceAll("_"," ")}</strong>
              </div>

              <div>
                <span>Tax review</span>
                <strong>{invoice.tax_review_status.replaceAll("_"," ")}</strong>
              </div>
            </div>

            {invoice.status==="under_review"&&(
              <button
                type="button"
                className="primary-btn"
                disabled={
                  busy
                  ||invoice.coding_status!=="complete"
                  ||!["matched","partial_match","not_required"].includes(invoice.match_status)
                }
                onClick={review}
              >
                <Check size={16}/>
                Complete Finance review
              </button>
            )}
          </section>
        </main>

        <aside className="invoice-review-side">
          <div className="invoice-review-sticky">
            <span className="eyebrow dark">AP CONTROL</span>
            <h2>{money(invoice.total_amount,invoice.currency_code)}</h2>

            <div className="receipt-context-card">
              <div><span>Vendor</span><strong>{invoice.vendor_name}</strong></div>
              <div><span>PO</span><strong>{invoice.po_no}</strong></div>
              <div><span>Match</span><strong>{invoice.match_status.replaceAll("_"," ")}</strong></div>
              <div><span>Coding</span><strong>{String(invoice.coding_status||"pending").replaceAll("_"," ")}</strong></div>
              <div><span>Tax</span><strong>{invoice.tax_review_status.replaceAll("_"," ")}</strong></div>
              <div><span>Finance review</span><strong>{String(invoice.finance_review_status||"pending").replaceAll("_"," ")}</strong></div>
            </div>

            {invoice.status==="under_review"&&(
              <>
                {invoice.finance_review_status==="reviewed"&&(
                  <button type="button" className="primary-btn receipt-full-btn" disabled={busy} onClick={accept}>
                    <Check size={16}/>
                    Accept invoice
                  </button>
                )}

                {invoice.finance_review_status!=="reviewed"&&(
                  <div className="invoice-control-note">
                    <ShieldCheck size={17}/>
                    <span>Complete matching, line coding and Finance review before the invoice can be accepted.</span>
                  </div>
                )}

                <label>Rejection reason</label>
                <textarea rows="4" value={reason} onChange={e=>setReason(e.target.value)}/>

                <button type="button" className="reject-btn receipt-full-btn" disabled={busy} onClick={reject}>
                  <X size={16}/>
                  Reject invoice
                </button>
              </>
            )}

            {invoice.ready_for_accounting&&(
              <div className="accounting-handoff-card">
                <div className="accounting-handoff-head">
                  <span className="accounting-handoff-icon">
                    <Landmark size={19}/>
                  </span>

                  <div>
                    <strong>
                      {accounting?.accounting_handoff_status==="completed"
                        ?"Sent to FinSage"
                        :"Ready for accounting"}
                    </strong>

                    <span>
                      {accounting?.accounting_handoff_status==="completed"
                        ?"The supplier invoice now exists as a FinSage AP bill."
                        :"Create the supplier bill in FinSage Accounts Payable."}
                    </span>
                  </div>
                </div>

                {accounting?.accounting_handoff_status==="completed"?(
                  <>
                    <div className="accounting-handoff-detail">
                      <div>
                        <span>FinSage bill</span>
                        <strong>
                          {accounting.accounting_bill_no||
                            `Bill ${accounting.accounting_bill_id}`}
                        </strong>
                      </div>

                      <div>
                        <span>Status</span>
                        <strong>
                          {(accounting.bill_status||"draft")
                            .replaceAll("_"," ")}
                        </strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="primary-btn receipt-full-btn"
                      onClick={openInFinSage}
                    >
                      <ExternalLink size={16}/>
                      Open in FinSage
                    </button>
                  </>
                ):(
                  <button
                    type="button"
                    className="primary-btn receipt-full-btn"
                    disabled={handoffBusy}
                    onClick={sendToAccounting}
                  >
                    <Landmark size={16}/>
                    {handoffBusy
                      ?"Creating FinSage bill..."
                      :"Create FinSage AP bill"}
                  </button>
                )}

                {paymentEligibility?.eligible&&(
                  <div className="payment-next-card">
                    <Banknote size={19}/>

                    <div>
                      <strong>Ready for payment preparation</strong>

                      <span>
                        Outstanding{" "}
                        {money(
                          paymentEligibility.outstanding_amount,
                          paymentEligibility.bill?.currency
                        )}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="primary-btn"
                      onClick={()=>
                        nav(
                          `/finance/payables/invoices/${invoiceId}/payment-voucher`
                        )
                      }
                    >
                      Prepare payment voucher
                    </button>
                  </div>
                )}

                {paymentEligibility&&!paymentEligibility.eligible&&invoice.accounting_handoff_status==="completed"&&(
                  <div className="invoice-control-note">
                    <ShieldCheck size={17}/>

                    <span>
                      {paymentEligibility.reason}
                    </span>
                  </div>
                )}
           </div>
            )}
          </div>
        </aside>
      </div>
    </FinanceShell>
  );
}