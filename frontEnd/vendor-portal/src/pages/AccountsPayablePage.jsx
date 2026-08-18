import {useEffect,useMemo,useState} from "react";
import {AlertTriangle,ArrowRight,CheckCircle2,FileText,Search,WalletCards} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

const money=(v,c="")=>`${c||""} ${Number(v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`.trim();

export default function AccountsPayablePage(){
  const companyId=getCompanyId();
  const nav=useNavigate();
  const [session,setSession]=useState(null);
  const [rows,setRows]=useState([]);
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");

  async function load(){
    const [ctx,data]=await Promise.all([opsApi.session(companyId),opsApi.apInvoices(companyId,status)]);
    setSession(ctx);
    setRows(data.rows||[]);
  }

  useEffect(()=>{load().catch(e=>setError(e.message));},[status]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q) return rows;
    return rows.filter(x=>[x.invoice_no,x.supplier_invoice_no,x.vendor_name,x.po_no,x.request_no]
      .some(v=>String(v||"").toLowerCase().includes(q)));
  },[rows,search]);

  if(!session) return <div className="loading-screen">Loading Accounts Payable…</div>;

  return (
    <Shell session={session} active="accounts-payable">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">FINANCE</span>
          <h1>Accounts Payable</h1>
          <p>Review supplier invoices, matching exceptions and invoices ready for payment.</p>
        </div>
      </div>

      {error&&<div className="alert error">{error}</div>}

      <div className="ap-stat-grid">
        <article><FileText/><div><strong>{rows.length}</strong><span>Invoices</span></div></article>
        <article><AlertTriangle/><div><strong>{rows.filter(x=>x.match_status==="exception").length}</strong><span>Exceptions</span></div></article>
        <article><CheckCircle2/><div><strong>{rows.filter(x=>x.ready_for_payment).length}</strong><span>Ready for payment</span></div></article>
      </div>

      <section className="surface-card">
        <div className="request-toolbar">
          <div className="search-box">
            <Search size={16}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vendor, invoice or PO"/>
          </div>

          <select value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="">All invoices</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under review</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {!filtered.length?(
          <div className="beautiful-empty">
            <WalletCards/>
            <h3>No supplier invoices</h3>
            <p>Invoices submitted by vendors or captured internally will appear here.</p>
          </div>
        ):(
          <div className="ap-invoice-list">
            {filtered.map(row=>(
              <button type="button" className="ap-invoice-row" key={row.id}
                onClick={()=>nav(`/accounts-payable/invoices/${row.id}`)}>
                <div>
                  <strong>{row.supplier_invoice_no}</strong>
                  <small>{row.invoice_no}</small>
                </div>

                <div>
                  <strong>{row.vendor_name}</strong>
                  <small>{row.po_no||"No PO"}</small>
                </div>

                <span className={`status-pill ${row.match_status}`}>
                  {row.match_status.replaceAll("_"," ")}
                </span>

                <strong>{money(row.total_amount,row.currency_code)}</strong>

                <span className={`status-pill ${row.status}`}>
                  {row.status.replaceAll("_"," ")}
                </span>

                <ArrowRight size={16}/>
              </button>
            ))}
          </div>
        )}
      </section>
    </Shell>
  );
}