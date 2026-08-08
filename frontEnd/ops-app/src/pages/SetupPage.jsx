
import {useEffect,useMemo,useState} from "react";
import {
  ArrowRight,Building2,Check,ChevronRight,
  Plus,ShieldCheck,UserPlus,Users
} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

export default function SetupPage(){
  const companyId=getCompanyId();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [data,setData]=useState(null);
  const [step,setStep]=useState(1);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const [department,setDepartment]=useState({name:"",code:""});
  const [position,setPosition]=useState({
    title:"",
    department_id:"",
    approval_level:0,
    is_department_head:false
  });

  const [invite,setInvite]=useState({
    email:"",
    department_id:"",
    position_id:"",
    branch_id:"",
    manager_user_id:"",
    ops_role_code:"REQUESTER"
  });

  async function load(){
    setError("");

    try{
      const [ctx,setup]=await Promise.all([
        opsApi.session(companyId),
        opsApi.setup(companyId)
      ]);

      setSession(ctx);
      setData(setup);
      setStep(Math.max(1,Number(setup.settings?.setup_step||1)));
    }catch(err){
      setError(err.message);
    }
  }

  useEffect(()=>{load();},[]);

  const positions=useMemo(()=>{
    if(!invite.department_id) return data?.positions||[];
    return (data?.positions||[]).filter(
      x=>String(x.department_id||"")===String(invite.department_id)
    );
  },[data,invite.department_id]);

  async function addDepartment(e){
    e.preventDefault();
    if(busy) return;

    const name=department.name.trim();
    const code=department.code.trim();

    if(!name){
      setError("Department name is required.");
      return;
    }

    setBusy(true);
    setError("");

    try{
      await opsApi.createDepartment(companyId,{
        name,
        code:code||null
      });

      setDepartment({name:"",code:""});
      await load();
    }catch(err){
      console.error("[FINFLOW] add department failed",err);
      setError(err.message||"Could not add department.");
    }finally{
      setBusy(false);
    }
  }

  async function addPosition(e){
    e.preventDefault();
    if(busy) return;

    const title=position.title.trim();

    if(!title){
      setError("Position title is required.");
      return;
    }

    setBusy(true);
    setError("");

    try{
      await opsApi.createPosition(companyId,{
        title,
        department_id:position.department_id
          ?Number(position.department_id)
          :null,
        approval_level:Number(position.approval_level||0),
        is_department_head:Boolean(position.is_department_head)
      });

      setPosition({
        title:"",
        department_id:"",
        approval_level:0,
        is_department_head:false
      });

      await load();
    }catch(err){
      console.error("[FINFLOW] add position failed",err);
      setError(err.message||"Could not add position.");
    }finally{
      setBusy(false);
    }
  }

  async function saveGovernance(mode){
    setBusy(true);

    try{
      await opsApi.settings(companyId,{
        governance_mode:mode,
        setup_step:4
      });

      setStep(4);
      await load();
    }catch(err){setError(err.message);}
    finally{setBusy(false);}
  }

  async function sendInvite(e){
    e.preventDefault();

    setBusy(true);

    try{
      const selectedRole=invite.ops_role_code;

      const accountingMap={
        OWNER:"owner",
        ADMIN:"admin",
        EXECUTIVE:"viewer",
        CFO:"cfo",
        FINANCE_MANAGER:"manager",
        ACCOUNTANT:"accountant",
      };

      await opsApi.inviteUser({
        email:invite.email,
        role:accountingMap[selectedRole]||"viewer",
        access_scope:"core",

        department_id:invite.department_id||null,
        position_id:invite.position_id||null,
        branch_id:invite.branch_id||null,
        manager_user_id:invite.manager_user_id||null,

        ops_role_code:selectedRole,

        product_access:{
          finsage:["OWNER","ADMIN","CFO","FINANCE_MANAGER","ACCOUNTANT"]
            .includes(selectedRole),
          finflow:true,
          finpos:false
        }
      });

      setInvite({
        email:"",
        department_id:"",
        position_id:"",
        branch_id:"",
        manager_user_id:"",
        ops_role_code:"REQUESTER"
      });

      await load();
    }catch(err){setError(err.message);}
    finally{setBusy(false);}
  }

  async function finish(){
    setBusy(true);

    try{
      await opsApi.settings(companyId,{
        setup_completed:true,
        setup_step:5
      });

      nav("/",{replace:true});
    }catch(err){setError(err.message);}
    finally{setBusy(false);}
  }

  if(!session||!data)
    return <div className="loading-screen">Preparing your workspace…</div>;

  const steps=[
    [1,"Organisation"],
    [2,"Positions"],
    [3,"People"],
    [4,"Governance"],
  ];

  return (
    <Shell session={session} active="organisation">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">FINFLOW SETUP</span>
          <h1>Build your organisation</h1>
          <p>
            Tell FinFlow how your business is structured.
            Workflows will use this structure automatically.
          </p>
        </div>

        <div className="setup-progress">
          <strong>{Math.min(step,4)}/4</strong>
          <span>Setup progress</span>
        </div>
      </div>

      <div className="stepper">
        {steps.map(([n,label])=>(
          <button key={n}
            className={`step ${step===n?"current":""} ${step>n?"done":""}`}
            onClick={()=>setStep(n)}>
            <span>{step>n?<Check size={15}/>:n}</span>
            {label}
          </button>
        ))}
      </div>

      {error&&<div className="alert error">{error}</div>}

      {step===1&&(
        <section className="setup-grid">
          <div className="setup-main">
            <div className="section-heading">
              <div>
                <h2>Departments</h2>
                <p>Create the teams that make up {session.company_name}.</p>
              </div>
              <Building2/>
            </div>

            <div className="department-grid">
              {data.departments.map(d=>(
                <article className="department-card" key={d.id}>
                  <div className="department-icon">
                    {(d.name?.[0]||"D").toUpperCase()}
                  </div>
                  <div>
                    <strong>{d.name}</strong>
                    <small>{d.code||"No code"}</small>
                  </div>
                  <ChevronRight size={18}/>
                </article>
              ))}

              {!data.departments.length&&(
                <div className="empty-state">
                  <Building2 size={28}/>
                  <strong>No departments yet</strong>
                  <p>Create your first department.</p>
                </div>
              )}
            </div>
          </div>

          <form className="setup-side-card" onSubmit={addDepartment}>
            <div className="card-icon"><Plus/></div>
            <h3>Add department</h3>
            <p>Examples: Finance, Procurement, Operations, IT.</p>

            <label>Department name</label>
            <input
              value={department.name}
              onChange={e=>setDepartment(x=>({...x,name:e.target.value}))}
              placeholder="Finance"
            />

            <label>Code</label>
            <input
              value={department.code}
              onChange={e=>setDepartment(x=>({...x,code:e.target.value}))}
              placeholder="FIN"
            />

            <button
              type="submit"
              className="primary-btn"
              disabled={busy}
            >
              {busy?"Saving...":"Add department"}
            </button>
          </form>

          <div className="setup-next">
            <button
              type="button"
              className="primary-btn"
              onClick={()=>setStep(2)}
            >
              Continue <ArrowRight size={17}/>
            </button>
          </div>
        </section>
      )}

      {step===2&&(
        <section className="setup-grid">
          <div className="setup-main">
            <div className="section-heading">
              <div>
                <h2>Positions</h2>
                <p>Define authority inside each department.</p>
              </div>
              <Users/>
            </div>

            <div className="position-table">
              {data.positions.map(p=>(
                <div className="position-row" key={p.id}>
                  <div>
                    <strong>{p.title}</strong>
                    <small>{p.department_name||"Organisation-wide"}</small>
                  </div>

                  <span className="level-pill">
                    Level {p.approval_level||0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <form className="setup-side-card" onSubmit={addPosition}>
            <div className="card-icon"><Plus/></div>
            <h3>Add position</h3>

            <label>Position title</label>
            <input value={position.title}
              onChange={e=>setPosition(x=>({...x,title:e.target.value}))}
              placeholder="Finance Manager"/>

            <label>Department</label>
            <select value={position.department_id}
              onChange={e=>setPosition(x=>({...x,department_id:e.target.value}))}>
              <option value="">Organisation-wide</option>
              {data.departments.map(d=>
                <option key={d.id} value={d.id}>{d.name}</option>
              )}
            </select>

            <label>Authority level</label>
            <input type="number" min="0"
              value={position.approval_level}
              onChange={e=>setPosition(x=>({...x,approval_level:e.target.value}))}/>

            <label className="check-row">
              <input type="checkbox"
                checked={position.is_department_head}
                onChange={e=>setPosition(x=>({...x,is_department_head:e.target.checked}))}/>
              Department head
            </label>

            <button type="submit" className="primary-btn" disabled={busy}>
              {busy?"Saving...":"Add position"}
            </button>
          </form>

          <div className="setup-next">
            <button
              type="button"
              className="ghost-btn"
              onClick={()=>setStep(1)}
            >
              Back
            </button>

            <button
              type="button"
              className="primary-btn"
              onClick={()=>setStep(3)}
            >
              Continue <ArrowRight size={17}/>
            </button>
          </div>
        </section>
      )}

      {step===3&&(
        <section className="setup-grid">
          <div className="setup-main">
            <div className="section-heading">
              <div>
                <h2>Your team</h2>
                <p>People who currently belong to this organisation.</p>
              </div>
              <Users/>
            </div>

            <div className="team-list">
              {data.team.map(u=>(
                <article className="team-card" key={u.company_user_id}>
                  <div className="avatar large">
                    {(u.first_name?.[0]||u.email?.[0]||"U").toUpperCase()}
                  </div>

                  <div className="team-person">
                    <strong>{u.first_name} {u.last_name}</strong>
                    <small>{u.email}</small>
                  </div>

                  <div className="team-meta">
                    <strong>{u.position_title||u.company_role}</strong>
                    <small>{u.department_name||"No department"}</small>
                  </div>

                  <div className="role-pills">
                    {(u.ops_roles||[]).map(r=>
                      <span key={r}>{r.replaceAll("_"," ")}</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <form className="setup-side-card" onSubmit={sendInvite}>
            <div className="card-icon"><UserPlus/></div>
            <h3>Invite team member</h3>

            <label>Email</label>
            <input type="email" value={invite.email}
              onChange={e=>setInvite(x=>({...x,email:e.target.value}))}
              required placeholder="person@company.com"/>

            <label>Department</label>
            <select value={invite.department_id}
              onChange={e=>setInvite(x=>({
                ...x,
                department_id:e.target.value,
                position_id:""
              }))}>
              <option value="">No department</option>
              {data.departments.map(d=>
                <option key={d.id} value={d.id}>{d.name}</option>
              )}
            </select>

            <label>Position</label>
            <select value={invite.position_id}
              onChange={e=>setInvite(x=>({...x,position_id:e.target.value}))}>
              <option value="">No position</option>
              {positions.map(p=>
                <option key={p.id} value={p.id}>{p.title}</option>
              )}
            </select>

            <label>FinFlow role</label>
            <select value={invite.ops_role_code}
              onChange={e=>setInvite(x=>({...x,ops_role_code:e.target.value}))}>
              {data.roles
                .filter(r=>r.code!=="OWNER")
                .map(r=>
                  <option key={r.id} value={r.code}>{r.name}</option>
                )}
            </select>

            <label>Branch</label>
            <select value={invite.branch_id}
              onChange={e=>setInvite(x=>({...x,branch_id:e.target.value}))}>
              <option value="">All / Head office</option>
              {data.branches.map(b=>
                <option key={b.id} value={b.id}>{b.name}</option>
              )}
            </select>

            <button
              type="submit"
              className="primary-btn"
              disabled={busy}
            >
              {busy?"Sending...":"Send invitation"}
            </button>
          </form>

          <div className="setup-next">
            <button
              type="button"
              className="ghost-btn"
              onClick={()=>setStep(2)}
            >
              Back
            </button>

            <button
              type="button"
              className="primary-btn"
              onClick={()=>setStep(4)}
            >
              Continue <ArrowRight size={17}/>
            </button>
          </div>
        </section>
      )}

      {step===4&&(
        <section>
          <div className="governance-heading">
            <ShieldCheck size={34}/>
            <h2>How controlled should FinFlow be?</h2>
            <p>This determines how strongly approvals will be enforced.</p>
          </div>

          <div className="governance-grid">
            {[
              ["flexible","Flexible","Owner-managed businesses",
                "Fast workflows with owner override available."],

              ["structured","Structured","Recommended",
                "Approvals and separation of responsibilities without excessive rigidity."],

              ["controlled","Controlled","NGOs & Corporates",
                "Strict approval rules and stronger separation of duties."]
            ].map(([key,name,badge,desc])=>(
              <button key={key}
                className={`governance-card ${
                  data.settings.governance_mode===key?"selected":""
                }`}
                onClick={()=>saveGovernance(key)}>
                <span className="governance-badge">{badge}</span>
                <ShieldCheck/>
                <h3>{name}</h3>
                <p>{desc}</p>
                {data.settings.governance_mode===key&&
                  <span className="selected-check"><Check size={15}/> Selected</span>}
              </button>
            ))}
          </div>

          <div className="setup-finish">
            <button type="button" className="ghost-btn" onClick={()=>setStep(3)}>Back</button>
            <button type="button" className="primary-btn finish" onClick={finish} disabled={busy}>
              {busy?"Finishing...":"Finish setup"} {!busy&&<ArrowRight size={17}/>}
            </button>
          </div>
        </section>
      )}
    </Shell>
  );
}