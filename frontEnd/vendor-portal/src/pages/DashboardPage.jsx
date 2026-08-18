import {useEffect,useState} from "react";
import {
  ArrowRight,Clock3,
  FileCheck2,FileText
} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {
  getCompanyId,
  portalApi
} from "../api/api";
import PortalShell from "../components/PortalShell";

export default function DashboardPage(){
  const companyId=getCompanyId();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [rows,setRows]=useState([]);
  const [error,setError]=useState("");

  async function load(){
    const [ctx,data]=await Promise.all([
      portalApi.session(companyId),
      portalApi.rfqs(companyId)
    ]);

    setSession(ctx);
    setRows(data.rows||[]);
  }

  useEffect(()=>{
    load().catch(err=>
      setError(err.message)
    );
  },[]);

  if(!session)
    return (
      <div className="portal-loading">
        Loading vendor portal…
      </div>
    );

  return (
    <PortalShell
      session={session}
      active="rfqs"
    >
      <div className="vendor-portal-page-header">
        <div>
          <span className="portal-eyebrow">
            PROCUREMENT
          </span>

          <h1>Request for quotations</h1>

          <p>
            Review sourcing opportunities and submit quotations securely.
          </p>
        </div>
      </div>

      {error&&(
        <div className="portal-alert error">
          {error}
        </div>
      )}

      <div className="vendor-rfq-grid">
        {!rows.length?(
          <div className="vendor-empty">
            <FileCheck2/>
            <h3>No RFQs available</h3>
            <p>
              New procurement invitations will appear here.
            </p>
          </div>
        ):(
          rows.map(row=>(
            <button
              type="button"
              className="vendor-rfq-card"
              key={row.id}
              onClick={()=>
                nav(`/rfqs/${row.id}`)
              }
            >
              <div className="vendor-rfq-icon">
                <FileText size={18}/>
              </div>

              <div className="vendor-rfq-copy">
                <span>
                  {row.rfq_no||
                   row.sourcing_no}
                </span>

                <strong>
                  {row.title}
                </strong>

                <small>
                  Closing {row.closing_date||"—"}
                </small>
              </div>

              <div className="vendor-rfq-status">
                {row.quote_status==="submitted"
                  ?<span className="portal-status submitted">
                    Submitted
                  </span>
                  :<span className="portal-status open">
                    Open
                  </span>}
              </div>

              <ArrowRight size={16}/>
            </button>
          ))
        )}
      </div>
    </PortalShell>
  );
}