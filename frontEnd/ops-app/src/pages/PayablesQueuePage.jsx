import {useEffect,useMemo,useState} from "react";
import {AlertTriangle,ArrowRight,CheckCircle2,FileText,Search} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import FinanceShell from "../components/FinanceShell";

const money=(v,c="")=>`${c||""} ${Number(v||0).toLocaleString(undefined,{
  minimumFractionDigits:2,maximumFractionDigits:2
})}`.trim();

const config={
  inbox:{
    active:"payables-invoices",
    eyebrow:"ACCOUNTS PAYABLE",
    title:"Invoice inbox",
    description:"Supplier invoices waiting for Finance processing.",
    empty:"No invoices waiting for review."
  },
  matching:{
    active:"payables-matching",
    eyebrow:"ACCOUNTS PAYABLE",
    title:"Matching",
    description:"Invoices waiting for PO and fulfilment matching.",
    empty:"No invoices waiting for matching."
  },
  exceptions:{
    active:"payables-exceptions",
    eyebrow:"ACCOUNTS PAYABLE",
    title:"Exceptions",
    description:"Invoices requiring Finance intervention.",
    empty:"No open invoice exceptions."
  },
  ready:{
    active:"payables-ready",
    eyebrow:"ACCOUNTS PAYABLE",
    title:"Ready for Accounting",
    description:"Finance-approved invoices ready for FinSage AP handoff.",
    empty:"Nothing is ready for accounting handoff."
  }
};

export default function PayablesQueuePage({queue}){
  const companyId=getCompanyId();
  const nav=useNavigate();
  const page=config[queue];

  const [session,setSession]=useState(null);
  const [finance,setFinance]=useState(null);
  const [rows,setRows]=useState([]);
  const [search,setSearch]=useState("");
  const [error,setError]=useState("");

  async function load(){
    const [ctx,fin,data]=await Promise.all([
      opsApi.session(companyId),
      opsApi.financeContext(companyId),
      opsApi.payablesQueue(companyId,queue)
    ]);

    setSession(ctx);
    setFinance(fin);
    setRows(data.rows||[]);
  }

  useEffect(()=>{
    load().catch(e=>setError(e.message));
  },[queue]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q) return rows;

    return rows.filter(x=>[
      x.invoice_no,x.supplier_invoice_no,x.vendor_name,x.po_no,x.request_no
    ].some(v=>String(v||"").toLowerCase().includes(q)));
  },[rows,search]);

  if(!session||!finance)
    return <div className="loading-screen">Loading Payables…</div>;

  return (
    <FinanceShell session={session} finance={finance} active={page.active}>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">{page.eyebrow}</span>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
        </div>

        <div className="department-chip">{rows.length} items</div>
      </div>

      {error&&<div className="alert error">{error}</div>}

      <section className="surface-card">
        <div className="request-toolbar">
          <div className="search-box">
            <Search size={16}/>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search vendor, invoice or PO"/>
          </div>
        </div>

        {!filtered.length?(
          <div className="beautiful-empty">
            {queue==="exceptions"?<AlertTriangle/>:queue==="ready"?<CheckCircle2/>:<FileText/>}
            <h3>{page.empty}</h3>
          </div>
        ):(
          <div className="ap-queue-list">
            {filtered.map(row=>(
              <button type="button" className="ap-queue-row" key={row.id}
                onClick={()=>nav(`/finance/payables/invoices/${row.id}`)}>

                <div>
                  <strong>{row.supplier_invoice_no}</strong>
                  <small>{row.invoice_no}</small>
                </div>

                <div>
                  <strong>{row.vendor_name}</strong>
                  <small>{row.po_no||"No PO"}</small>
                </div>

                <div>
                  <small>Match</small>
                  <strong>{String(row.match_status||"not checked").replaceAll("_"," ")}</strong>
                </div>

                <div>
                  <small>Exceptions</small>
                  <strong>{row.open_exception_count||0}</strong>
                </div>

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
    </FinanceShell>
  );
}