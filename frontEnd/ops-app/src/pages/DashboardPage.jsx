
import {useEffect,useState} from "react";
import {useNavigate} from "react-router-dom";
import {
  ArrowUpRight,CheckCircle2,Clock3,
  ShieldCheck,Users,WalletCards
} from "lucide-react";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";


export default function DashboardPage(){
  const companyId=getCompanyId();
  const nav=useNavigate();
  const [session,setSession]=useState(null);
  
  useEffect(()=>{
    opsApi.session(companyId).then(setSession);
  },[]);

  if(!session) return <div className="loading-screen">Opening FinFlow…</div>;

  return (
    <Shell session={session} active="dashboard">
      <div className="page-header dashboard-heading">
        <div>
          <span className="eyebrow dark">OVERVIEW</span>
          <h1>Good to see you, {session.first_name}.</h1>
          <p>Here's what needs your attention today.</p>
        </div>

        <button
          type="button"
          className="primary-btn"
          onClick={()=>nav("/requests")}
        >
          Create request <ArrowUpRight size={17}/>
        </button>
      </div>

      <div className="metric-grid">
        <article className="metric-card">
          <div className="metric-icon"><Clock3/></div>
          <span>Pending approvals</span>
          <strong>—</strong>
          <small>Available in Phase 1</small>
        </article>

        <article className="metric-card">
          <div className="metric-icon"><CheckCircle2/></div>
          <span>Completed this month</span>
          <strong>—</strong>
          <small>Workflow engine coming next</small>
        </article>

        <article className="metric-card">
          <div className="metric-icon"><WalletCards/></div>
          <span>Committed spend</span>
          <strong>—</strong>
          <small>Budget integration upcoming</small>
        </article>

        <article className="metric-card">
          <div className="metric-icon"><Users/></div>
          <span>Organisation</span>
          <strong>{session.department_name||"Company"}</strong>
          <small>{session.position_title||session.company_role}</small>
        </article>
      </div>

      <div className="dashboard-grid">
        <section className="surface-card big">
          <div className="section-heading">
            <div>
              <h2>My work</h2>
              <p>Your requests and approvals will appear here.</p>
            </div>
            <Clock3/>
          </div>

          <div className="beautiful-empty">
            <div className="empty-orb"><CheckCircle2/></div>
            <h3>You're all caught up</h3>
            <p>There are no workflow tasks yet.</p>
          </div>
        </section>

        <section className="surface-card">
          <div className="section-heading">
            <div>
              <h2>Access</h2>
              <p>Your current FinFlow authority.</p>
            </div>
            <ShieldCheck/>
          </div>

          <div className="access-stack">
            {(session.ops_roles||[]).map(r=>(
              <div className="access-row" key={r.code}>
                <div>
                  <strong>{r.name}</strong>
                  <small>{r.scope_type}</small>
                </div>
                <span>Level {r.authority_rank}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Shell>
  );
}