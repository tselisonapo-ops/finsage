import {useEffect,useState} from "react";
import {ArrowRight,BriefcaseBusiness,ListTodo} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import FinanceShell from "../components/FinanceShell";

export default function FinanceMyWorkPage(){
  const companyId=getCompanyId();
  const nav=useNavigate();
  const [session,setSession]=useState(null);
  const [finance,setFinance]=useState(null);
  const [rows,setRows]=useState([]);
  const [error,setError]=useState("");

  async function load(){
    const [ctx,fin,data]=await Promise.all([
      opsApi.session(companyId),
      opsApi.financeContext(companyId),
      opsApi.financeMyWork(companyId)
    ]);
    setSession(ctx);
    setFinance(fin);
    setRows(data.rows||[]);
  }

  useEffect(()=>{load().catch(e=>setError(e.message));},[]);

  function open(row){
    if(row.entity_type==="vendor_invoice")
      nav(`/finance/payables/invoices/${row.entity_id}`);
  }

  if(!session||!finance)
    return <div className="loading-screen">Loading Finance work…</div>;

  return (
    <FinanceShell session={session} finance={finance} active="finance-my-work">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">FINANCE</span>
          <h1>My work</h1>
          <p>Finance tasks assigned to you or your role.</p>
        </div>
      </div>

      {error&&<div className="alert error">{error}</div>}

      <section className="surface-card">
        {!rows.length?(
          <div className="beautiful-empty">
            <ListTodo/>
            <h3>You're caught up</h3>
            <p>No Finance work is currently assigned to you.</p>
          </div>
        ):(
          <div className="finance-work-list">
            {rows.map(row=>(
              <button type="button" className="finance-work-row" key={row.id} onClick={()=>open(row)}>
                <BriefcaseBusiness size={17}/>
                <div>
                  <strong>{row.title}</strong>
                  <small>{row.entity_ref||row.entity_type}</small>
                </div>
                <span className={`status-pill ${row.priority}`}>{row.priority}</span>
                <span className={`status-pill ${row.status}`}>{row.status.replaceAll("_"," ")}</span>
                <ArrowRight size={16}/>
              </button>
            ))}
          </div>
        )}
      </section>
    </FinanceShell>
  );
}