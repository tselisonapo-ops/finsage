import {useEffect,useMemo,useState} from "react";
import {
  Banknote,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Search,
  ShieldCheck
} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import FinanceShell from "../components/FinanceShell";

const money=(value,currency="")=>
  `${currency||""} ${Number(value||0).toLocaleString(undefined,{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  })}`.trim();

const dateLabel=value=>{
  if(!value) return "—";

  const d=new Date(`${value}T00:00:00`);

  if(Number.isNaN(d.getTime())) return value;

  return d.toLocaleDateString(undefined,{
    day:"2-digit",
    month:"short",
    year:"numeric"
  });
};

function statusLabel(status){
  return String(status||"draft")
    .replaceAll("_"," ")
    .replace(/\b\w/g,x=>x.toUpperCase());
}

export default function PaymentVouchersPage(){
  const companyId=getCompanyId();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [finance,setFinance]=useState(null);
  const [rows,setRows]=useState([]);

  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const [q,setQ]=useState("");
  const [status,setStatus]=useState("");

  async function load(){
    setLoading(true);
    setError("");

    try{
      const [ctx,fin,result]=await Promise.all([
        opsApi.session(companyId),
        opsApi.financeContext(companyId),
        opsApi.paymentVouchers(companyId,{
          status,
          q
        })
      ]);

      setSession(ctx);
      setFinance(fin);
      setRows(result?.items||[]);
    }catch(e){
      setError(e.message);
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    load();
  },[companyId,status]);

  useEffect(()=>{
    const timer=setTimeout(()=>{
      load();
    },300);

    return ()=>clearTimeout(timer);
  },[q]);

  const summary=useMemo(()=>{
    const total=rows.reduce(
      (sum,row)=>sum+Number(row.amount||0),
      0
    );

    const prepared=rows.filter(
      row=>String(row.status||"").toLowerCase()==="prepared"
    ).length;

    const released=rows.filter(
      row=>String(row.status||"").toLowerCase()==="released"
    ).length;

    return {
      count:rows.length,
      total,
      prepared,
      released
    };
  },[rows]);

  if(!session||!finance){
    return (
      <div className="loading-screen">
        Loading payment vouchers…
      </div>
    );
  }

  return (
    <FinanceShell
      session={session}
      finance={finance}
      active="payment-vouchers"
    >
      <div className="page-header">
        <div>
          <span className="eyebrow dark">
            ACCOUNTS PAYABLE
          </span>

          <h1>Payment Vouchers</h1>

          <p>
            Review prepared payment instructions and continue eligible
            vouchers through the payment process.
          </p>
        </div>
      </div>

      {error&&(
        <div className="alert error">
          {error}
        </div>
      )}

      <section className="payment-voucher-summary-grid">

        <article>
          <ClipboardCheck size={19}/>

          <div>
            <span>Total vouchers</span>
            <strong>{summary.count}</strong>
          </div>
        </article>

        <article>
          <Banknote size={19}/>

          <div>
            <span>Voucher value</span>
            <strong>{money(summary.total)}</strong>
          </div>
        </article>

        <article>
          <FileText size={19}/>

          <div>
            <span>Prepared</span>
            <strong>{summary.prepared}</strong>
          </div>
        </article>

        <article>
          <ShieldCheck size={19}/>

          <div>
            <span>Released</span>
            <strong>{summary.released}</strong>
          </div>
        </article>

      </section>

      <section className="surface-card payment-voucher-register">

        <div className="payment-voucher-register-head">

          <div>
            <h2>Voucher register</h2>

            <p>
              Payment vouchers prepared from approved supplier invoices.
            </p>
          </div>

          <span className="payment-voucher-count">
            {rows.length} {rows.length===1?"voucher":"vouchers"}
          </span>

        </div>

        <div className="payment-voucher-toolbar">

          <div className="payment-voucher-search">
            <Search size={16}/>

            <input
              value={q}
              onChange={e=>setQ(e.target.value)}
              placeholder="Search voucher, vendor, invoice or reference"
            />
          </div>

          <select
            value={status}
            onChange={e=>setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="prepared">Prepared</option>
            <option value="approved">Approved</option>
            <option value="released">Released</option>
            <option value="cancelled">Cancelled</option>
          </select>

        </div>

        {loading ? (
          <div className="beautiful-empty">
            <ClipboardCheck size={32}/>
            <h3>Loading vouchers</h3>
            <p>Please wait while the payment register is loaded.</p>
          </div>
        ) : !rows.length ? (
          <div className="beautiful-empty">
            <ClipboardCheck size={34}/>

            <h3>No payment vouchers yet</h3>

            <p>
              Payment vouchers will appear here after they are prepared
              from eligible supplier invoices.
            </p>
          </div>
        ) : (
          <div className="payment-voucher-list">

            <div className="payment-voucher-table-head">
              <span>Voucher</span>
              <span>Vendor</span>
              <span>Invoice / Bill</span>
              <span>Payment date</span>
              <span>Amount</span>
              <span>Status</span>
              <span></span>
            </div>

            {rows.map(row=>(
              <button
                key={row.id}
                type="button"
                className="payment-voucher-row"
                onClick={()=>
                  nav(
                    `/finance/payables/payment-vouchers/${row.id}`
                  )
                }
              >

                <div className="payment-voucher-number">
                  <span className="payment-voucher-row-icon">
                    <ClipboardCheck size={15}/>
                  </span>

                  <div>
                    <strong>{row.voucher_no}</strong>

                    <small>
                      {row.reference||"No reference"}
                    </small>
                  </div>
                </div>

                <div className="payment-voucher-vendor">
                  <strong>
                    {row.vendor_name||"—"}
                  </strong>

                  <small>
                    Vendor #{row.vendor_id}
                  </small>
                </div>

                <div className="payment-voucher-invoice">
                  <strong>
                    {row.supplier_invoice_no||
                     row.invoice_no||
                     "—"}
                  </strong>

                  <small>
                    {row.accounting_bill_no
                      ?`Bill ${row.accounting_bill_no}`
                      :"No accounting bill number"}
                  </small>
                </div>

                <div>
                  <strong>
                    {dateLabel(row.payment_date)}
                  </strong>
                </div>

                <div className="payment-voucher-row-amount">
                  <strong>
                    {money(
                      row.amount,
                      row.currency_code
                    )}
                  </strong>

                  {row.wht_enabled&&(
                    <small>
                      WHT {money(
                        row.wht_amount,
                        row.currency_code
                      )}
                    </small>
                  )}
                </div>

                <div>
                  <span
                    className={`status-pill ${
                      String(row.status||"draft")
                        .toLowerCase()
                    }`}
                  >
                    {statusLabel(row.status)}
                  </span>
                </div>

                <ChevronRight size={16}/>

              </button>
            ))}

          </div>
        )}

      </section>

    </FinanceShell>
  );
}