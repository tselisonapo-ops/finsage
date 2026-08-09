
import {useEffect,useMemo,useState} from "react";
import {
  ArrowDown,ArrowRight,Building2,Check,ChevronRight,
  GripVertical,Plus,ShieldCheck,Trash2,UserPlus,Users
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

  const [governance,setGovernance]=useState(null);
  const [governanceSaved,setGovernanceSaved]=useState(true);

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

  const saved=setup.governance;

  if(saved?.steps?.length){
    setGovernance({
      mode:saved.mode,
      allow_owner_override:saved.allow_owner_override,
      require_override_reason:saved.require_override_reason,
      prevent_self_approval:Boolean(
        saved.settings_json?.governance?.prevent_self_approval
      ),
      prevent_consecutive_approval:Boolean(
        saved.settings_json?.governance?.prevent_consecutive_approval
      ),
      require_finance_review:Boolean(
        saved.settings_json?.governance?.require_finance_review
      ),
      require_budget_validation:Boolean(
        saved.settings_json?.governance?.require_budget_validation
      ),
      invalidate_approvals_on_change:Boolean(
        saved.settings_json?.governance?.invalidate_approvals_on_change
      ),
      steps:saved.steps.map(step=>({
        ...step,
        approver_position_id:step.approver_position_id||"",
        approver_role_code:step.approver_role_code||"",
        min_amount:
          step.conditions?.find(x=>
            x.field_name==="estimated_amount"&&
            x.operator==="gte"
          )?.comparison_value||"",
        max_amount:
          step.conditions?.find(x=>
            x.field_name==="estimated_amount"&&
            x.operator==="lte"
          )?.comparison_value||""
      }))
    });

    setGovernanceSaved(true);
  }else{
    setGovernance(
      governanceTemplate(
        setup.settings?.governance_mode||"structured"
      )
    );
  }
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

  function governanceTemplate(mode){
    const common={
      mode,
      allow_owner_override:mode==="flexible",
      require_override_reason:mode!=="flexible",
      prevent_self_approval:mode!=="flexible",
      prevent_consecutive_approval:mode!=="flexible",
      require_finance_review:mode!=="flexible",
      require_budget_validation:mode!=="flexible",
      invalidate_approvals_on_change:mode==="controlled"
    };

    if(mode==="flexible"){
      return {
        ...common,
        steps:[
          {
            name:"Manager Approval",
            approver_type:"requester_manager",
            approver_role_code:"",
            approver_position_id:"",
            min_amount:"",
            max_amount:"",
            required:true,
            allow_delegation:true,
            allow_reassignment:true
          }
        ]
      };
    }

    if(mode==="controlled"){
      return {
        ...common,
        steps:[
          {
            name:"Department Approval",
            approver_type:"department_head",
            approver_role_code:"",
            approver_position_id:"",
            min_amount:"",
            max_amount:"",
            required:true,
            allow_delegation:false,
            allow_reassignment:false
          },
          {
            name:"Finance Review",
            approver_type:"role",
            approver_role_code:"FINANCE_REVIEWER",
            approver_position_id:"",
            min_amount:"",
            max_amount:"",
            required:true,
            allow_delegation:false,
            allow_reassignment:false
          },
          {
            name:"CFO Approval",
            approver_type:"role",
            approver_role_code:"CFO",
            approver_position_id:"",
            min_amount:"",
            max_amount:"",
            required:true,
            allow_delegation:false,
            allow_reassignment:false
          }
        ]
      };
    }

    return {
      ...common,
      steps:[
        {
          name:"Department Approval",
          approver_type:"department_head",
          approver_role_code:"",
          approver_position_id:"",
          min_amount:"",
          max_amount:"",
          required:true,
          allow_delegation:true,
          allow_reassignment:false
        },
        {
          name:"Finance Review",
          approver_type:"role",
          approver_role_code:"FINANCE_REVIEWER",
          approver_position_id:"",
          min_amount:"",
          max_amount:"",
          required:true,
          allow_delegation:true,
          allow_reassignment:false
        }
      ]
    };
  }

  function selectGovernance(mode){
    if(governance?.mode===mode) return;

    setGovernance(governanceTemplate(mode));
    setGovernanceSaved(false);
    setError("");
  }

  function updateGovernance(key,value){
    setGovernance(x=>({...x,[key]:value}));
    setGovernanceSaved(false);
  }

  function updateGovernanceStep(index,key,value){
    setGovernance(x=>({
      ...x,
      steps:x.steps.map((step,i)=>
        i===index?{...step,[key]:value}:step
      )
    }));

    setGovernanceSaved(false);
  }

  function addGovernanceStep(){
    setGovernance(x=>({
      ...x,
      steps:[
        ...x.steps,
        {
          name:`Approval ${x.steps.length+1}`,
          approver_type:"role",
          approver_role_code:"",
          approver_position_id:"",
          min_amount:"",
          max_amount:"",
          required:true,
          allow_delegation:x.mode!=="controlled",
          allow_reassignment:x.mode==="flexible"
        }
      ]
    }));

    setGovernanceSaved(false);
  }

  function removeGovernanceStep(index){
    setGovernance(x=>({
      ...x,
      steps:x.steps.filter((_,i)=>i!==index)
    }));

    setGovernanceSaved(false);
  }

  async function saveGovernance(){
    if(!governance?.steps?.length){
      setError("Add at least one approval step.");
      return;
    }

    setBusy(true);
    setError("");

    try{
      const saved=await opsApi.saveGovernance(
        companyId,
        governance
      );

      setGovernance({
        mode:saved.mode,
        allow_owner_override:saved.allow_owner_override,
        require_override_reason:saved.require_override_reason,
        prevent_self_approval:Boolean(
          saved.settings_json?.governance?.prevent_self_approval
        ),
        prevent_consecutive_approval:Boolean(
          saved.settings_json?.governance?.prevent_consecutive_approval
        ),
        require_finance_review:Boolean(
          saved.settings_json?.governance?.require_finance_review
        ),
        require_budget_validation:Boolean(
          saved.settings_json?.governance?.require_budget_validation
        ),
        invalidate_approvals_on_change:Boolean(
          saved.settings_json?.governance?.invalidate_approvals_on_change
        ),
        steps:(saved.steps||[]).map(step=>({
          ...step,
          approver_position_id:step.approver_position_id||"",
          approver_role_code:step.approver_role_code||"",
          min_amount:
            step.conditions?.find(x=>
              x.field_name==="estimated_amount"&&
              x.operator==="gte"
            )?.comparison_value||"",
          max_amount:
            step.conditions?.find(x=>
              x.field_name==="estimated_amount"&&
              x.operator==="lte"
            )?.comparison_value||""
        }))
      });

      setGovernanceSaved(true);
      await load();
    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
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
    if(!governanceSaved){
      setError("Save your governance configuration before finishing setup.");
      return;
    }

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

      {step===4&&governance&&(
        <section>
          <div className="governance-heading">
            <ShieldCheck size={34}/>
            <h2>How controlled should FinFlow be?</h2>
            <p>Choose a governance model, then configure exactly who approves requests.</p>
          </div>

          <div className="governance-grid">
            {[
              ["flexible","Flexible","Owner-managed businesses",
                "Fast workflows with lighter controls and owner override."],

              ["structured","Structured","Recommended",
                "Clear approvals and separation of responsibilities without excessive rigidity."],

              ["controlled","Controlled","NGOs & Corporates",
                "Strict approval chains, stronger separation of duties and tighter governance."]
            ].map(([key,name,badge,desc])=>(
              <button
                type="button"
                key={key}
                className={`governance-card ${governance.mode===key?"selected":""}`}
                onClick={()=>selectGovernance(key)}
              >
                <span className="governance-badge">{badge}</span>
                <ShieldCheck/>
                <h3>{name}</h3>
                <p>{desc}</p>

                {governance.mode===key&&
                  <span className="selected-check">
                    <Check size={15}/> Selected
                  </span>}
              </button>
            ))}
          </div>

          <div className="governance-config">
            <div className="governance-config-head">
              <div>
                <span className="eyebrow dark">
                  {governance.mode.toUpperCase()} GOVERNANCE
                </span>

                <h2>Approval workflow</h2>

                <p>
                  Requests move through these approval stages in order.
                  Amount thresholds determine when a stage applies.
                </p>
              </div>

              <button
                type="button"
                className="ghost-btn"
                onClick={addGovernanceStep}
              >
                <Plus size={16}/> Add approval step
              </button>
            </div>

            <div className="governance-flow">
              {governance.steps.map((approval,index)=>(
                <div className="governance-flow-wrap" key={index}>
                  <article className="governance-step-card">
                    <div className="governance-step-order">
                      <GripVertical size={15}/>
                      <span>{index+1}</span>
                    </div>

                    <div className="governance-step-fields">
                      <div className="governance-step-title">
                        <div>
                          <label>Stage name</label>
                          <input
                            value={approval.name}
                            onChange={e=>
                              updateGovernanceStep(
                                index,
                                "name",
                                e.target.value
                              )
                            }
                            placeholder="Finance Review"
                          />
                        </div>

                        <div>
                          <label>Approver source</label>
                          <select
                            value={approval.approver_type}
                            onChange={e=>{
                              updateGovernanceStep(
                                index,
                                "approver_type",
                                e.target.value
                              );

                              updateGovernanceStep(
                                index,
                                "approver_role_code",
                                ""
                              );

                              updateGovernanceStep(
                                index,
                                "approver_position_id",
                                ""
                              );
                            }}
                          >
                            <option value="requester_manager">Requester's manager</option>
                            <option value="department_head">Department manager / head</option>
                            <option value="role">FinFlow role</option>
                            <option value="position">Organisation position</option>
                            <option value="owner">Business owner</option>
                          </select>
                        </div>
                      </div>

                      {approval.approver_type==="role"&&(
                        <div>
                          <label>FinFlow role</label>
                          <select
                            value={approval.approver_role_code||""}
                            onChange={e=>
                              updateGovernanceStep(
                                index,
                                "approver_role_code",
                                e.target.value
                              )
                            }
                          >
                            <option value="">Select role</option>

                            {data.roles
                              .filter(role=>role.code!=="REQUESTER")
                              .map(role=>(
                                <option key={role.id} value={role.code}>
                                  {role.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}

                      {approval.approver_type==="position"&&(
                        <div>
                          <label>Organisation position</label>
                          <select
                            value={approval.approver_position_id||""}
                            onChange={e=>
                              updateGovernanceStep(
                                index,
                                "approver_position_id",
                                e.target.value
                              )
                            }
                          >
                            <option value="">Select position</option>

                            {data.positions.map(position=>(
                              <option key={position.id} value={position.id}>
                                {position.title}
                                {position.department_name
                                  ?` · ${position.department_name}`
                                  :""}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="governance-thresholds">
                        <div>
                          <label>Minimum amount</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={approval.min_amount||""}
                            onChange={e=>
                              updateGovernanceStep(
                                index,
                                "min_amount",
                                e.target.value
                              )
                            }
                            placeholder="Always"
                          />
                        </div>

                        <div>
                          <label>Maximum amount</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={approval.max_amount||""}
                            onChange={e=>
                              updateGovernanceStep(
                                index,
                                "max_amount",
                                e.target.value
                              )
                            }
                            placeholder="No limit"
                          />
                        </div>
                      </div>

                      <div className="governance-step-options">
                        <label className="check-row">
                          <input
                            type="checkbox"
                            checked={Boolean(approval.required)}
                            onChange={e=>
                              updateGovernanceStep(
                                index,
                                "required",
                                e.target.checked
                              )
                            }
                          />
                          Required approval
                        </label>

                        <label className="check-row">
                          <input
                            type="checkbox"
                            checked={Boolean(approval.allow_delegation)}
                            onChange={e=>
                              updateGovernanceStep(
                                index,
                                "allow_delegation",
                                e.target.checked
                              )
                            }
                          />
                          Allow delegation
                        </label>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="governance-delete-step"
                      disabled={governance.steps.length===1}
                      onClick={()=>removeGovernanceStep(index)}
                      title="Remove approval step"
                    >
                      <Trash2 size={16}/>
                    </button>
                  </article>

                  {index<governance.steps.length-1&&(
                    <div className="governance-flow-arrow">
                      <ArrowDown size={17}/>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="governance-rules-panel">
              <div className="governance-rules-head">
                <ShieldCheck size={20}/>
                <div>
                  <h3>Governance rules</h3>
                  <p>These rules apply across the complete approval chain.</p>
                </div>
              </div>

              <div className="governance-rules-grid">
                <label className="governance-rule">
                  <input
                    type="checkbox"
                    checked={Boolean(governance.prevent_self_approval)}
                    onChange={e=>
                      updateGovernance(
                        "prevent_self_approval",
                        e.target.checked
                      )
                    }
                  />
                  <div>
                    <strong>Prevent self-approval</strong>
                    <span>Requester cannot approve their own requisition.</span>
                  </div>
                </label>

                <label className="governance-rule">
                  <input
                    type="checkbox"
                    checked={Boolean(governance.prevent_consecutive_approval)}
                    onChange={e=>
                      updateGovernance(
                        "prevent_consecutive_approval",
                        e.target.checked
                      )
                    }
                  />
                  <div>
                    <strong>Separate consecutive approvals</strong>
                    <span>Do not let one person approve two consecutive stages.</span>
                  </div>
                </label>

                <label className="governance-rule">
                  <input
                    type="checkbox"
                    checked={Boolean(governance.require_finance_review)}
                    onChange={e=>
                      updateGovernance(
                        "require_finance_review",
                        e.target.checked
                      )
                    }
                  />
                  <div>
                    <strong>Require Finance review</strong>
                    <span>Financial classification must be completed before final approval.</span>
                  </div>
                </label>

                <label className="governance-rule">
                  <input
                    type="checkbox"
                    checked={Boolean(governance.require_budget_validation)}
                    onChange={e=>
                      updateGovernance(
                        "require_budget_validation",
                        e.target.checked
                      )
                    }
                  />
                  <div>
                    <strong>Require budget validation</strong>
                    <span>Budget control must pass or be formally overridden.</span>
                  </div>
                </label>

                <label className="governance-rule">
                  <input
                    type="checkbox"
                    checked={Boolean(governance.invalidate_approvals_on_change)}
                    onChange={e=>
                      updateGovernance(
                        "invalidate_approvals_on_change",
                        e.target.checked
                      )
                    }
                  />
                  <div>
                    <strong>Invalidate approvals after changes</strong>
                    <span>Material edits require the request to pass approval again.</span>
                  </div>
                </label>

                <label className="governance-rule">
                  <input
                    type="checkbox"
                    checked={Boolean(governance.allow_owner_override)}
                    onChange={e=>
                      updateGovernance(
                        "allow_owner_override",
                        e.target.checked
                      )
                    }
                  />
                  <div>
                    <strong>Allow owner override</strong>
                    <span>Business owner may override eligible governance controls.</span>
                  </div>
                </label>

                {governance.allow_owner_override&&(
                  <label className="governance-rule">
                    <input
                      type="checkbox"
                      checked={Boolean(governance.require_override_reason)}
                      onChange={e=>
                        updateGovernance(
                          "require_override_reason",
                          e.target.checked
                        )
                      }
                    />
                    <div>
                      <strong>Require override reason</strong>
                      <span>Every override must contain an auditable explanation.</span>
                    </div>
                  </label>
                )}
              </div>
            </div>

            <div className="governance-save-bar">
              <div>
                <strong>
                  {governanceSaved
                    ?"Governance configuration saved"
                    :"You have unsaved governance changes"}
                </strong>

                <span>
                  {governance.steps.length} approval
                  {governance.steps.length===1?" stage":" stages"}
                </span>
              </div>

              <button
                type="button"
                className="primary-btn"
                onClick={saveGovernance}
                disabled={busy||governanceSaved}
              >
                {busy?"Saving...":"Save governance"}
              </button>
            </div>
          </div>

          <div className="setup-finish">
            <button
              type="button"
              className="ghost-btn"
              onClick={()=>setStep(3)}
            >
              Back
            </button>

            <button
              type="button"
              className="primary-btn finish"
              onClick={finish}
              disabled={busy||!governanceSaved}
            >
              {busy?"Finishing...":"Finish setup"} {!busy&&<ArrowRight size={17}/>}
            </button>
          </div>
        </section>
      )}
    </Shell>
  );
}