import {useEffect,useMemo,useState} from "react";
import {
  AlertTriangle,ArrowRight,BriefcaseBusiness,
  FileSearch,Search,ShoppingCart
} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

const money=(value,currency="")=>
  `${currency||""} ${Number(value||0).toLocaleString(undefined,{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  })}`.trim();

export default function ProcurementPage(){
  const companyId=getCompanyId();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [rows,setRows]=useState([]);
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");

  async function load(){
    const [ctx,data]=await Promise.all([
      opsApi.session(companyId),
      opsApi.procurement(companyId,{status})
    ]);

    setSession(ctx);
    setRows(data.rows||[]);
  }

  useEffect(()=>{
    load().catch(err=>setError(err.message));
  },[status]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();

    if(!q) return rows;

    return rows.filter(row=>
      [
        row.case_no,
        row.request_no,
        row.title,
        row.requester_name,
        row.department_name
      ].some(v=>
        String(v||"").toLowerCase().includes(q)
      )
    );
  },[rows,search]);

  if(!session)
    return (
      <div className="loading-screen">
        Loading Procurement…
      </div>
    );

  return (
    <Shell session={session} active="procurement">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">
            PROCUREMENT
          </span>

          <h1>Sourcing workspace</h1>

          <p>
            Turn approved requisitions into controlled purchasing decisions.
          </p>
        </div>

        <div className="procurement-header-actions">
          <button
            type="button"
            className="ghost-btn"
            onClick={()=>nav("/procurement/vendors")}
          >
            Vendors
          </button>

          <button
            type="button"
            className="ghost-btn"
            onClick={()=>nav("/procurement/policies")}
          >
            Policies
          </button>

          <button
            type="button"
            className="primary-btn"
            onClick={()=>nav("/procurement/settings")}
          >
            Procurement settings
          </button>
        </div>
      </div>

      {error&&(
        <div className="alert error">
          {error}
        </div>
      )}

      <div className="procurement-stat-grid">
        <article className="procurement-stat">
          <span>
            <BriefcaseBusiness size={18}/>
          </span>

          <div>
            <strong>{rows.length}</strong>
            <small>Procurement cases</small>
          </div>
        </article>

        <article className="procurement-stat">
          <span>
            <FileSearch size={18}/>
          </span>

          <div>
            <strong>
              {rows.filter(
                x=>x.status==="ready_for_sourcing"
              ).length}
            </strong>

            <small>Ready for sourcing</small>
          </div>
        </article>

        <article className="procurement-stat">
          <span>
            <AlertTriangle size={18}/>
          </span>

          <div>
            <strong>
              {rows.filter(
                x=>x.status==="pending_review"
              ).length}
            </strong>

            <small>Need policy review</small>
          </div>
        </article>
      </div>

      <section className="surface-card procurement-workspace">
        <div className="procurement-toolbar">
          <div className="search-box">
            <Search size={16}/>

            <input
              value={search}
              onChange={e=>setSearch(e.target.value)}
              placeholder="Search requisition, case or requester"
            />
          </div>

          <select
            value={status}
            onChange={e=>setStatus(e.target.value)}
          >
            <option value="">
              All procurement cases
            </option>

            <option value="pending_review">
              Pending review
            </option>

            <option value="ready_for_sourcing">
              Ready for sourcing
            </option>

            <option value="sourcing">
              Sourcing
            </option>

            <option value="vendor_selection">
              Vendor selection
            </option>

            <option value="po_pending">
              PO pending
            </option>
          </select>
        </div>

        {!filtered.length?(
          <div className="beautiful-empty">
            <ShoppingCart/>
            <h3>No procurement cases</h3>

            <p>
              Approved requisitions will automatically arrive here.
            </p>
          </div>
        ):(
          <div className="procurement-case-list">
            {filtered.map(row=>(
              <button
                type="button"
                className="procurement-case-row"
                key={row.id}
                onClick={()=>
                  nav(`/procurement/${row.id}`)
                }
              >
                <div className="procurement-case-ref">
                  <span className="procurement-case-icon">
                    <ShoppingCart size={17}/>
                  </span>

                  <div>
                    <strong>{row.case_no}</strong>
                    <small>{row.request_no}</small>
                  </div>
                </div>

                <div className="procurement-case-main">
                  <strong>{row.title}</strong>

                  <small>
                    {[
                      row.department_name,
                      row.requester_name
                    ].filter(Boolean).join(" · ")}
                  </small>
                </div>

                <div className="procurement-method">
                  <small>Sourcing</small>

                  <strong>
                    {(row.sourcing_method||"Review")
                      .replaceAll("_"," ")}
                  </strong>
                </div>

                <div className="procurement-quotes">
                  <small>Quotes required</small>

                  <strong>
                    {row.required_quote_count}
                  </strong>
                </div>

                <strong className="request-amount">
                  {money(
                    row.estimated_amount,
                    row.currency_code
                  )}
                </strong>

                <span
                  className={`status-pill ${row.status}`}
                >
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