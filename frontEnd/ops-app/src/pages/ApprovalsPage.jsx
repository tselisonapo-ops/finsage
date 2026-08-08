import {useEffect,useState} from "react";
import {
  Check,Clock3,FileCheck2,
  X
} from "lucide-react";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

export default function ApprovalsPage(){
  const companyId=getCompanyId();

  const [session,setSession]=useState(null);
  const [rows,setRows]=useState([]);

  const [selected,setSelected]=useState(null);
  const [comment,setComment]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function load(){
    const [ctx,data]=await Promise.all([
      opsApi.session(companyId),
      opsApi.approvals(companyId)
    ]);

    setSession(ctx);
    setRows(data.rows||[]);
  }

  useEffect(()=>{
    load().catch(err=>setError(err.message));
  },[]);

  async function decide(decision){
    if(!selected) return;

    setBusy(true);
    setError("");

    try{
      await opsApi.decideApproval(
        companyId,
        selected.id,
        decision,
        comment
      );

      setSelected(null);
      setComment("");
      await load();

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  if(!session)
    return <div className="loading-screen">
      Loading approvals…
    </div>;

  return (
    <Shell session={session} active="approvals">

      <div className="page-header">
        <div>
          <span className="eyebrow dark">
            MY WORK
          </span>

          <h1>Approvals</h1>

          <p>
            Requests currently waiting for your decision.
          </p>
        </div>

        <div className="approval-count">
          <Clock3 size={18}/>
          <strong>{rows.length}</strong>
          <span>Waiting</span>
        </div>
      </div>

      {error&&
        <div className="alert error">{error}</div>}

      <div className="approval-grid">

        <section className="surface-card">

          {!rows.length&&(
            <div className="beautiful-empty">
              <FileCheck2/>
              <h3>Nothing waiting</h3>
              <p>
                You have no pending approvals.
              </p>
            </div>
          )}

          {rows.map(row=>(
            <button
              type="button"
              className={`approval-row ${
                selected?.id===row.id
                  ?"selected"
                  :""
              }`}
              key={row.id}
              onClick={()=>setSelected(row)}
            >
              <div>
                <strong>{row.request_no}</strong>
                <small>{row.request_type_name}</small>
              </div>

              <div className="approval-main">
                <strong>{row.title}</strong>
                <small>
                  {row.requester_name}
                  {" · "}
                  {row.department_name||"No department"}
                </small>
              </div>

              <span className="status-pill pending">
                {row.step_name}
              </span>
            </button>
          ))}
        </section>

        <aside className="surface-card approval-panel">

          {!selected?(
            <div className="beautiful-empty">
              <FileCheck2/>
              <h3>Select an approval</h3>
              <p>
                Review its details before deciding.
              </p>
            </div>
          ):(
            <>
              <span className="eyebrow dark">
                APPROVAL
              </span>

              <h2>{selected.title}</h2>

              <p className="muted">
                {selected.description||
                  "No description was provided."}
              </p>

              <div className="approval-detail">
                <span>Request</span>
                <strong>{selected.request_no}</strong>
              </div>

              <div className="approval-detail">
                <span>Requester</span>
                <strong>{selected.requester_name}</strong>
              </div>

              <div className="approval-detail">
                <span>Step</span>
                <strong>{selected.step_name}</strong>
              </div>

              <label>Decision comment</label>

              <textarea
                rows="4"
                value={comment}
                onChange={e=>setComment(e.target.value)}
                placeholder="Optional comment..."
              />

              <div className="approval-actions">

                <button
                  type="button"
                  className="reject-btn"
                  disabled={busy}
                  onClick={()=>decide("reject")}
                >
                  <X size={17}/>
                  Reject
                </button>

                <button
                  type="button"
                  className="primary-btn"
                  disabled={busy}
                  onClick={()=>decide("approve")}
                >
                  <Check size={17}/>
                  Approve
                </button>

              </div>
            </>
          )}

        </aside>

      </div>
    </Shell>
  );
}