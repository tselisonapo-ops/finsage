import {
  Bell,Building2,CheckSquare,ChevronDown,FileText,
  LayoutDashboard,LogOut,Settings,ShieldCheck,
  ShoppingCart,Users,WalletCards
} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {clearSession} from "../api/api";

export default function Shell({session,active="setup",children}){
  const nav=useNavigate();

  const items=[
    ["dashboard",LayoutDashboard,"Overview","/"],
    ["team",Users,"People","/people"],
    ["requests",FileText,"Requests","/requests"],
    ["approvals",CheckSquare,"Approvals","/approvals"],
    ["procurement",ShoppingCart,"Procurement","/procurement"],
    ["budget",WalletCards,"Budget control","/budget"],
    ["organisation",Building2,"Organisation","/organisation"],
    ["governance",ShieldCheck,"Governance","/governance"],
    ["settings",Settings,"Settings","/settings"],
  ];

  function logout(){
    clearSession();
    nav("/signin",{replace:true});
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">F</div>
          <div>
            <strong>FinSage Nexus</strong>
            <small>by FinSphere</small>
          </div>
        </div>

        <nav>
          <span className="nav-label">WORKSPACE</span>

          {items.map(([key,Icon,label,path])=>(
            <button key={key} className={`nav-item ${active===key?"active":""}`} onClick={()=>nav(path)}>
              <Icon size={18}/>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="avatar">
            {(session?.first_name?.[0]||"U").toUpperCase()}
          </div>

          <div className="user-copy">
            <strong>{session?.first_name} {session?.last_name}</strong>
            <small>{session?.position_title||session?.company_role}</small>
          </div>

          <button onClick={logout}><LogOut size={17}/></button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="company-switch">
            <Building2 size={18}/>
            <div>
              <small>Organisation</small>
              <strong>{session?.company_name}</strong>
            </div>
            <ChevronDown size={16}/>
          </div>

          <div className="top-actions">
            <button className="icon-btn"><Bell size={19}/></button>
            <div className="department-chip">
              {session?.department_name||"No department"}
            </div>
          </div>
        </header>

        <main className="page-content">{children}</main>
      </section>
    </div>
  );
}