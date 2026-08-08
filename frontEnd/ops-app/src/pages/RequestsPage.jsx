import {useEffect,useState} from "react";
import {
  ArrowRight,FileText,Plus,Search,X
} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {
  getCompanyId,
  opsApi
} from "../api/api";
import Shell from "../components/Shell";

const money=(value,currency="")=>
  `${currency||""} ${Number(value||0).toLocaleString(undefined,{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  })}`.trim();

export default function RequestsPage(){
  const companyId=getCompanyId();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [rows,setRows]=useState([]);
  const [types,setTypes]=useState([]);

  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const [form,setForm]=useState({
    request_type_id:"",
    title:"",
    description:"",
    estimated_amount:"",
    priority:"normal",
    required_date:""
  });

  const set=(k,v)=>setForm(x=>({...x,[k]:v}));

  async function load(){
    const [ctx,reqs,typeData]=await Promise.all([
      opsApi.session(companyId),
      opsApi.requests(companyId),
      opsApi.requestTypes(companyId)
    ]);

    setSession(ctx);
    setRows(reqs.rows||[]);
    setTypes(typeData.rows||[]);
  }

  useEffect(()=>{
    load().catch(err=>setError(err.message));
  },[]);

  async function save(e){
    e.preventDefault();

    if(!form.request_type_id){
      setError("Choose a request type.");
      return;
    }

    if(!form.title.trim()){
      setError("Request title is required.");
      return;
    }

    setBusy(true);
    setError("");

    try{
      const row=await opsApi.createRequest(
        companyId,
        {
          ...form,
          request_type_id:Number(form.request_type_id),
          estimated_amount:Number(
            form.estimated_amount||0
          ),
          required_date:
            form.required_date||null
        }
      );

      setOpen(false);

      setForm({
        request_type_id:"",
        title:"",
        description:"",
        estimated_amount:"",
        priority:"normal",
        required_date:""
      });

      await load();

      nav(`/requests/${row.id}`);

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  if(!session)
    return <div className="loading-screen">
      Loading requests…
    </div>;

  return (
    <Shell session={session} active="requests">

      <div className="page-header">
        <div>
          <span className="eyebrow dark">MY WORK</span>
          <h1>Requests</h1>
          <p>
            Create and track requests across your organisation.
          </p>
        </div>

        <button type="button" className="primary-btn" onClick={()=>nav("/requests/new")}>
            <Plus size={17}/> Create request
        </button>
      </div>

      {error&&
        <div className="alert error">{error}</div>}

      <section className="surface-card">
        <div className="request-toolbar">
          <div className="search-box">
            <Search size={16}/>
            <input placeholder="Search requests"/>
          </div>
        </div>

        <div className="request-list">

          {!rows.length&&(
            <div className="beautiful-empty">
              <FileText/>
              <h3>No requests yet</h3>
              <p>
                Your first FinFlow request will appear here.
              </p>
            </div>
          )}

          {rows.map(row=>(
            <button
              type="button"
              className="request-row"
              key={row.id}
              onClick={()=>nav(`/requests/${row.id}`)}
            >
              <div className="request-ref">
                <span className="request-icon">
                  <FileText size={16}/>
                </span>

                <div>
                  <strong>{row.request_no}</strong>
                  <small>{row.request_type_name}</small>
                </div>
              </div>

              <div className="request-title">
                <strong>{row.title}</strong>
                <small>
                  {row.department_name||"No department"}
                </small>
              </div>

              <span
                className={`status-pill ${row.status}`}
              >
                {row.status.replaceAll("_"," ")}
              </span>

              <strong className="request-amount">
                {money(
                  row.estimated_amount,
                  row.currency_code
                )}
              </strong>

              <ArrowRight size={16}/>
            </button>
          ))}
        </div>
      </section>

      {open&&(
        <div
          className="drawer-backdrop"
          onMouseDown={()=>setOpen(false)}
        >
          <aside
            className="request-drawer"
            onMouseDown={e=>e.stopPropagation()}
          >
            <header className="drawer-header">
              <div>
                <span className="eyebrow dark">
                  NEW REQUEST
                </span>
                <h2>Create request</h2>
              </div>

              <button
                type="button"
                className="icon-btn"
                onClick={()=>setOpen(false)}
              >
                <X size={18}/>
              </button>
            </header>

            <form
              className="drawer-form"
              onSubmit={save}
            >
              <label>Request type</label>

              <select
                value={form.request_type_id}
                onChange={e=>
                  set("request_type_id",e.target.value)
                }
                required
              >
                <option value="">
                  Select request type
                </option>

                {types.map(type=>(
                  <option
                    key={type.id}
                    value={type.id}
                  >
                    {type.name}
                  </option>
                ))}
              </select>

              <label>Title</label>

              <input
                value={form.title}
                onChange={e=>set("title",e.target.value)}
                placeholder="What do you need?"
                required
              />

              <label>Description</label>

              <textarea
                rows="5"
                value={form.description}
                onChange={e=>
                  set("description",e.target.value)
                }
                placeholder="Explain the request..."
              />

              <div className="two-col">
                <div>
                  <label>Estimated amount</label>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.estimated_amount}
                    onChange={e=>
                      set(
                        "estimated_amount",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div>
                  <label>Priority</label>

                  <select
                    value={form.priority}
                    onChange={e=>
                      set("priority",e.target.value)
                    }
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <label>Required date</label>

              <input
                type="date"
                value={form.required_date}
                onChange={e=>
                  set("required_date",e.target.value)
                }
              />

              <div className="drawer-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={()=>setOpen(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-btn"
                  disabled={busy}
                >
                  {busy
                    ?"Saving..."
                    :"Save draft"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}

    </Shell>
  );
}