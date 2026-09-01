import {useEffect,useState} from "react";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ExternalLink,
  FileText,
  Landmark,
  Save,
  ShieldCheck
} from "lucide-react";
import {useNavigate,useParams} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import FinanceShell from "../components/FinanceShell";

const money=(value,currency="")=>
  `${currency||""} ${Number(value||0).toLocaleString(undefined,{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  })}`.trim();

export default function PaymentVoucherPage(){
  const companyId=getCompanyId();
  const {invoiceId}=useParams();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [finance,setFinance]=useState(null);
  const [eligibility,setEligibility]=useState(null);
  const [voucher,setVoucher]=useState(null);

  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  const [form,setForm]=useState({
    payment_date:"",
    amount:"",
    reference:"",
    description:"",
    wht_enabled:false,
    wht_rate:"",
    wht_amount:"",
    wht_ledger_code:"",
    wht_reason:""
  });

  const set=(key,value)=>
    setForm(x=>({...x,[key]:value}));

  async function load(){
    const [ctx,fin,elig]=await Promise.all([
      opsApi.session(companyId),
      opsApi.financeContext(companyId),
      opsApi.paymentEligibility(companyId,invoiceId)
    ]);

    setSession(ctx);
    setFinance(fin);
    setEligibility(elig);

    if(elig?.eligible){
      const bill=elig.bill||{};

      setForm(x=>({
        ...x,
        amount:
          x.amount||
          String(elig.outstanding_amount||""),
        description:
          x.description||
          `Payment for bill ${bill.number||bill.id||""}`
      }));
    }
  }

  useEffect(()=>{
    load().catch(e=>setError(e.message));
  },[invoiceId]);

  async function prepare(e){
    e.preventDefault();

    if(!eligibility?.eligible){
      setError(
        eligibility?.reason||
        "This invoice is not eligible for payment."
      );
      return;
    }

    const amount=Number(form.amount||0);

    if(amount<=0){
      setError("Payment amount must be greater than zero.");
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try{
      const row=await opsApi.createPaymentVoucher(
        companyId,
        invoiceId,
        {
          payment_date:form.payment_date||null,
          amount,
          reference:form.reference||null,
          description:form.description||null,

          wht_enabled:form.wht_enabled,
          wht_rate:Number(form.wht_rate||0),
          wht_amount:Number(form.wht_amount||0),
          wht_ledger_code:
            form.wht_ledger_code||null,
          wht_reason:
            form.wht_reason||null
        }
      );

      setVoucher(row);
        if(!form.reference){
        setForm(x=>({
            ...x,
            reference:row.voucher_no
        }));
        }
      setSuccess(
        `Payment voucher ${row.voucher_no} prepared.`
      );

    }catch(e){
      setError(e.message);
    }finally{
      setBusy(false);
    }
  }

  function getFinSageAppUrl(){
    const configured=
      (import.meta.env.VITE_FINSAGE_APP_URL||"")
        .trim();

    if(configured) return configured;

    const local=[
      "localhost",
      "127.0.0.1"
    ].includes(window.location.hostname);

    return local
      ?"http://127.0.0.1:5000/dashboard.html"
      :`${window.location.origin}/app/dashboard.html`;
  }

  function continueToFinSage(){
    if(!voucher?.accounting_bill_id) return;

    const url=new URL(getFinSageAppUrl());

    url.searchParams.set("screen","ap");
    url.searchParams.set(
      "bill_id",
      String(voucher.accounting_bill_id)
    );

    url.searchParams.set("action","payment");
    url.searchParams.set(
      "voucher_id",
      String(voucher.id)
    );

    if(voucher.amount)
      url.searchParams.set(
        "amount",
        String(voucher.amount)
      );

    if(voucher.payment_date)
      url.searchParams.set(
        "payment_date",
        voucher.payment_date
      );

    if(voucher.reference)
      url.searchParams.set(
        "reference",
        voucher.reference
      );

    if(voucher.description)
      url.searchParams.set(
        "description",
        voucher.description
      );

    if(voucher.wht_enabled){
      url.searchParams.set("wht","1");

      url.searchParams.set(
        "wht_rate",
        String(voucher.wht_rate||0)
      );

      url.searchParams.set(
        "wht_amount",
        String(voucher.wht_amount||0)
      );

      if(voucher.wht_ledger_code){
        url.searchParams.set(
          "wht_ledger_code",
          voucher.wht_ledger_code
        );
      }

      if(voucher.wht_reason){
        url.searchParams.set(
          "wht_reason",
          voucher.wht_reason
        );
      }
    }

    window.location.href=url.toString();
  }

  if(!session||!finance||!eligibility){
    return (
      <div className="loading-screen">
        Loading payment voucher…
      </div>
    );
  }

  const bill=eligibility.bill||{};

  return (
    <FinanceShell
        session={session}
        finance={finance}
        active="payment-vouchers"
    >
      <button
        type="button"
        className="page-back-link"
        onClick={()=>
          nav(`/finance/payables/invoices/${invoiceId}`)
        }
      >
        <ArrowLeft size={15}/>
        Invoice
      </button>

      <div className="page-header">
        <div>
          <span className="eyebrow dark">
            ACCOUNTS PAYABLE
          </span>

          <h1>Payment voucher</h1>

          <p>
            Prepare the payment instruction before
            execution in FinSage.
          </p>
        </div>

        {voucher&&(
          <span className="status-pill prepared">
            Prepared
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

      {!eligibility.eligible&&(
        <section className="payment-eligibility-block">
          <ShieldCheck size={22}/>

          <div>
            <strong>
              Payment preparation unavailable
            </strong>

            <span>
              {eligibility.reason}
            </span>
          </div>
        </section>
      )}

      <div className="payment-voucher-layout">

        <form
          className="payment-voucher-form"
          onSubmit={prepare}
        >
          <section className="surface-card">
            <div className="section-heading">
              <div>
                <h2>Payment details</h2>
                <p>
                  Prepare the payment instruction.
                </p>
              </div>

              <Banknote/>
            </div>

            <div className="two-col">
              <div>
                <label>Payment date</label>

                <input
                  type="date"
                  value={form.payment_date}
                  onChange={e=>
                    set(
                      "payment_date",
                      e.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>Amount</label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={e=>
                    set("amount",e.target.value)
                  }
                  required
                />

                <small className="field-help">
                  Outstanding:{" "}
                  {money(
                    eligibility.outstanding_amount,
                    bill.currency
                  )}
                </small>
              </div>
            </div>

            <label>Reference</label>

            <input
              value={form.reference}
              onChange={e=>
                set("reference",e.target.value)
              }
              placeholder="EFT reference or payment reference"
            />

            <label>Description</label>

            <textarea
              rows="3"
              value={form.description}
              onChange={e=>
                set("description",e.target.value)
              }
              placeholder="Payment description"
            />
          </section>

          <section className="surface-card">
            <div className="section-heading">
              <div>
                <h2>Withholding tax</h2>
                <p>
                  Optional withholding tax instruction.
                </p>
              </div>

              <ShieldCheck/>
            </div>

            <label className="check-row">
              <input
                type="checkbox"
                checked={form.wht_enabled}
                onChange={e=>
                  set(
                    "wht_enabled",
                    e.target.checked
                  )
                }
              />

              Apply withholding tax
            </label>

            {form.wht_enabled&&(
              <>
                <div className="two-col">
                  <div>
                    <label>WHT rate %</label>

                    <input
                      type="number"
                      min="0"
                      step="0.000001"
                      value={form.wht_rate}
                      onChange={e=>
                        set(
                          "wht_rate",
                          e.target.value
                        )
                      }
                    />
                  </div>

                  <div>
                    <label>WHT amount</label>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.wht_amount}
                      onChange={e=>
                        set(
                          "wht_amount",
                          e.target.value
                        )
                      }
                    />
                  </div>
                </div>

                <label>WHT ledger code</label>

                <input
                  value={form.wht_ledger_code}
                  onChange={e=>
                    set(
                      "wht_ledger_code",
                      e.target.value
                    )
                  }
                />

                <label>Reason</label>

                <input
                  value={form.wht_reason}
                  onChange={e=>
                    set(
                      "wht_reason",
                      e.target.value
                    )
                  }
                />
              </>
            )}
          </section>

          {!voucher&&(
            <button
              type="submit"
              className="primary-btn payment-voucher-submit"
              disabled={
                busy||
                !eligibility.eligible
              }
            >
              <Save size={16}/>

              {busy
                ?"Preparing..."
                :"Prepare payment voucher"}
            </button>
          )}
        </form>

        <aside className="payment-voucher-preview">

          <section className="payment-voucher-document">
            <div className="payment-voucher-document-head">
              <div className="payment-voucher-brand">
                {session?.company_logo_url&&(
                  <img
                    src={session.company_logo_url}
                    alt=""
                  />
                )}

                <div>
                  <strong>
                    {session.company_name}
                  </strong>

                  <span>PAYMENT VOUCHER</span>
                </div>
              </div>

              <strong>
                {voucher?.voucher_no||
                  "DRAFT"}
              </strong>
            </div>

            <div className="payment-voucher-document-grid">
              <div>
                <span>Vendor</span>
                <strong>
                  {bill.vendor_name||"—"}
                </strong>
              </div>

              <div>
                <span>FinSage bill</span>
                <strong>
                  {bill.number||bill.id||"—"}
                </strong>
              </div>

              <div>
                <span>Payment date</span>
                <strong>
                  {form.payment_date||"—"}
                </strong>
              </div>

              <div>
                <span>Currency</span>
                <strong>
                  {bill.currency||"—"}
                </strong>
              </div>
            </div>

            <div className="payment-voucher-amount">
              <span>PAYMENT AMOUNT</span>

              <strong>
                {money(
                  form.amount,
                  bill.currency
                )}
              </strong>
            </div>

            <div className="payment-voucher-reference">
              <span>Reference</span>
              <strong>
                {form.reference||"—"}
              </strong>
            </div>

            <div className="payment-voucher-reference">
              <span>Description</span>
              <strong>
                {form.description||"—"}
              </strong>
            </div>

            {form.wht_enabled&&(
              <div className="payment-voucher-wht">
                <div>
                  <span>WHT rate</span>
                  <strong>
                    {form.wht_rate||0}%
                  </strong>
                </div>

                <div>
                  <span>WHT amount</span>
                  <strong>
                    {money(
                      form.wht_amount,
                      bill.currency
                    )}
                  </strong>
                </div>
              </div>
            )}

            <div className="payment-voucher-signatures">
              <div>
                <span>Prepared by</span>
                <strong>
                  {session.first_name}{" "}
                  {session.last_name}
                </strong>
              </div>

              <div>
                <span>Execution</span>
                <strong>
                  FinSage AP
                </strong>
              </div>
            </div>
          </section>

          {voucher&&(
            <section className="payment-voucher-ready">
              <CheckCircle2 size={22}/>

              <div>
                <strong>
                  Voucher prepared
                </strong>

                <span>
                  Continue to FinSage to choose
                  the bank account, allocate,
                  approve and release the payment.
                </span>
              </div>

              <button
                type="button"
                className="primary-btn"
                onClick={continueToFinSage}
              >
                <ExternalLink size={16}/>
                Continue to FinSage
              </button>
            </section>
          )}
        </aside>
      </div>
    </FinanceShell>
  );
}