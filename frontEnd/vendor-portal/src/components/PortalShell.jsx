import {
  FileText,LayoutDashboard,
  LogOut,ReceiptText,Store,
  UserRound,WalletCards
} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {
  clearPortalSession
} from "../api/api";

export default function PortalShell({
  session,
  active="dashboard",
  children
}){
  const nav=useNavigate();

  const items=[
    ["dashboard",LayoutDashboard,"Overview","/"],
    ["rfqs",FileText,"RFQs","/"],
    ["orders",Store,"Purchase orders","/purchase-orders"],
    ["invoices",FileText,"Invoices","/invoices"],
    ["payments",WalletCards,"Payments","#"],
    ["profile",UserRound,"Company profile","/profile"]
  ];

  function logout(){
    clearPortalSession();
    nav("/signin",{replace:true});
  }

  return (
    <div className="vendor-portal-shell">
      <aside className="vendor-portal-sidebar">
        <div className="vendor-portal-brand">
          {session?.company?.logo_url?(
            <img
              src={session.company.logo_url}
              alt=""
            />
          ):(
            <div className="vendor-portal-brand-logo">
              {session?.company?.name?.[0]?.toUpperCase()||"F"}
            </div>
          )}

          <div>
            <strong>
              {session?.company?.name}
            </strong>

            <small>Vendor Portal</small>
          </div>
        </div>

        <nav>
          {items.map(([key,Icon,label,path])=>(
            <button
              type="button"
              key={key}
              className={`vendor-portal-nav ${
                active===key?"active":""
              }`}
              disabled={path==="#"}
              onClick={()=>{
                if(path!=="#") nav(path);
              }}
            >
              <Icon size={17}/>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="vendor-portal-user">
          <div>
            <strong>
              {session?.user?.first_name}{" "}
              {session?.user?.last_name}
            </strong>

            <span>
              {session?.vendor?.name}
            </span>
          </div>

          <button
            type="button"
            onClick={logout}
          >
            <LogOut size={16}/>
          </button>
        </div>
      </aside>

      <main className="vendor-portal-workspace">
        {children}
      </main>
    </div>
  );
}