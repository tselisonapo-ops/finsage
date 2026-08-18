import {useEffect,useState} from "react";
import {AlertTriangle,CheckCircle2,FileText,ListTodo} from "lucide-react";
import {getCompanyId,opsApi} from "../api/api";
import FinanceShell from "../components/FinanceShell";

export default function FinanceOverviewPage(){
  const companyId=getCompanyId();
  const [session,setSession]=useState(null);
  const [finance,setFinance]=useState(null);
  const [stats,setStats]=useState(null);
  const [error,setError]=useState("");

  async function load(){
    const [ctx,fin,overview]=await Promise.all([
      opsApi.session(companyId),
      opsApi.financeContext(companyId),
      opsApi.financeOverview(companyId)
    ]);
    setSession(ctx);
    setFinance(fin);
    setStats(overview);
  }

  useEffect(()=>{load().catch(e=>setError(e.message));},[]);

  if(!session||!finance||!stats)
    return <div className="loading-screen">Loading Finance…</div>;

  return (
    <FinanceShell session={session} finance={finance} active="finance-overview">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">FINANCE</span>
          <h1>Finance overview</h1>
          <p>What needs Finance's attention today.</p>
        </div>
      </div>

      {error&&<div className="alert error">{error}</div>}

      <div className="finance-stat-grid">
        <article><ListTodo/><div><span>My work</span><strong>{stats.my_work}</strong></div></article>
        <article><FileText/><div><span>Invoice inbox</span><strong>{stats.invoice_inbox}</strong></div></article>
        <article><AlertTriangle/><div><span>Exceptions</span><strong>{stats.exceptions}</strong></div></article>
        <article><CheckCircle2/><div><span>Ready for accounting</span><strong>{stats.ready_for_accounting}</strong></div></article>
      </div>
    </FinanceShell>
  );
}