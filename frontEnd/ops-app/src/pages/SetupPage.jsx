
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


  const [editingPositionId,setEditingPositionId]=useState(null);

  const [position,setPosition]=useState({
    title:"",
    department_id:"",
    approval_level:0,
    is_department_head:false
  });

  const [selectedDepartmentId,setSelectedDepartmentId]=useState(null);

  const selectedDepartment=useMemo(
    ()=>data?.departments?.find(
      d=>String(d.id)===String(selectedDepartmentId)
    )||null,
    [data,selectedDepartmentId]
  );

  const departmentPositions=useMemo(()=>{
    if(!selectedDepartmentId) return [];

    return (data?.positions||[])
      .filter(p=>String(p.department_id||"")===String(selectedDepartmentId))
      .map(p=>({
        ...p,
        occupants:(data?.team||[]).filter(u=>String(u.position_id||"")===String(p.id))
      }))
      .sort((a,b)=>Number(b.approval_level||0)-Number(a.approval_level||0));
  },[data,selectedDepartmentId]);
  const [selectedUser,setSelectedUser]=useState(null);

  const [userAccess,setUserAccess]=useState({
    department_id:"",
    position_id:"",
    branch_id:"",
    manager_user_id:"",
    ops_role_codes:[]
  });
  const [invite,setInvite]=useState({
    email:"",
    department_id:"",
    position_id:"",
    branch_id:"",
    manager_user_id:"",
    ops_role_code:"REQUESTER"
  });

  const AUTHORITY_LEVELS={
    0:"No authority",
    1:"Supervisor",
    2:"Manager",
    3:"Senior management",
    4:"Executive",
    5:"Organisation head"
  };

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

  const userPositions=useMemo(()=>{
    if(!userAccess.department_id) return data?.positions||[];

    return (data?.positions||[]).filter(
      p=>String(p.department_id||"")===String(userAccess.department_id)
    );
  },[data,userAccess.department_id]);

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
      console.error("[FinSage Nexus] add department failed",err);
      setError(err.message||"Could not add department.");
    }finally{
      setBusy(false);
    }
  }

  function editUser(u){
    setSelectedUser(u);

    setUserAccess({
      department_id:u.department_id||"",
      position_id:u.position_id||"",
      branch_id:u.branch_id||"",
      manager_user_id:u.manager_user_id||"",
      ops_role_codes:u.ops_roles||[]
    });
  } 

  function cancelUserEdit(){
    setSelectedUser(null);

    setUserAccess({
      department_id:"",
      position_id:"",
      branch_id:"",
      manager_user_id:"",
      ops_role_codes:[]
    });
  }

  async function savePosition(e,continueAfter=false){
    e.preventDefault();
    if(busy) return;

    const title=position.title.trim();

    if(!title){
      setError("Position title is required.");
      return;
    }

    const payload={
      title,
      department_id:position.department_id
        ?Number(position.department_id)
        :null,
      approval_level:Number(position.approval_level||0),
      is_department_head:Boolean(position.is_department_head)
    };

    setBusy(true);
    setError("");

    try{
      if(editingPositionId){
        await opsApi.updatePosition(
          companyId,
          editingPositionId,
          payload
        );
      }else{
        await opsApi.createPosition(
          companyId,
          payload
        );
      }

      setEditingPositionId(null);

      setPosition({
        title:"",
        department_id:"",
        approval_level:0,
        is_department_head:false
      });

      await load();
      if(continueAfter) setStep(3);
    }catch(err){
      console.error("[FinSage Nexus] save position failed",err);
      setError(err.message||"Could not save position.");
    }finally{
      setBusy(false);
    }
  }

  function editPosition(p){
    setEditingPositionId(p.id);

    setPosition({
      title:p.title||"",
      department_id:p.department_id||"",
      approval_level:Number(p.approval_level||0),
      is_department_head:Boolean(p.is_department_head)
    });
  }

  function cancelPositionEdit(){
    setEditingPositionId(null);

    setPosition({
      title:"",
      department_id:"",
      approval_level:0,
      is_department_head:false
    });
  }

  async function continueFromPositions(){
    const hasDraft=
      position.title.trim()||
      position.department_id||
      Number(position.approval_level||0)!==0||
      position.is_department_head||
      editingPositionId;

    const isSmallScreen=window.matchMedia("(max-width:760px)").matches;

    if(!isSmallScreen||!hasDraft){
      setStep(3);
      return;
    }

    const shouldSave=window.confirm(
      editingPositionId
        ?"You have unsaved changes to this position. Save them before continuing?"
        :"You have position details that have not been added yet. Save this position before continuing?"
    );

    if(!shouldSave) return;

    await savePosition(
      {preventDefault:()=>{}},
      true
    );
  }

  async function saveUserAccess(){
    if(!selectedUser||busy) return;

    setBusy(true);
    setError("");

    try{
      await opsApi.updateUserAccess(companyId,selectedUser.user_id,{
        department_id:userAccess.department_id?Number(userAccess.department_id):null,
        position_id:userAccess.position_id?Number(userAccess.position_id):null,
        branch_id:userAccess.branch_id?Number(userAccess.branch_id):null,
        manager_user_id:userAccess.manager_user_id?Number(userAccess.manager_user_id):null,
        ops_role_codes:userAccess.ops_role_codes
      });

      cancelUserEdit();
      await load();
    }catch(err){
      console.error("[FinSage Nexus] update user access failed",err);
      setError(err.message||"Could not update team member.");
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
          nexus:true,
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
          <span className="eyebrow dark">FinSage Nexus SETUP</span>
          <h1>Organisation overview</h1>
          <p>
            Tell FinSage Nexus how your business is structured.
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

      {step>=5&&(
        <section className="organisation-overview">
          <div className="organisation-overview-head">
            <div>
              <span className="eyebrow dark">ORGANISATION</span>
              <h2>Organisation overview</h2>
              <p>Departments, positions, people and governance across {session.company_name}.</p>
            </div>

            <button type="button" className="primary-btn" onClick={()=>setStep(1)}>
              Manage organisation
            </button>
          </div>

          <div className="organisation-summary-grid">
            <button type="button" className="organisation-summary-card" onClick={()=>setStep(1)}>
              <Building2 size={20}/>
              <strong>{data.departments?.length||0}</strong>
              <span>Departments</span>
            </button>

            <button type="button" className="organisation-summary-card" onClick={()=>setStep(2)}>
              <Users size={20}/>
              <strong>{data.positions?.length||0}</strong>
              <span>Positions</span>
            </button>

            <button type="button" className="organisation-summary-card" onClick={()=>setStep(3)}>
              <UserPlus size={20}/>
              <strong>{data.team?.length||0}</strong>
              <span>People</span>
            </button>

            <button type="button" className="organisation-summary-card" onClick={()=>setStep(4)}>
              <ShieldCheck size={20}/>
              <strong>{governance?.mode?governance.mode.replace(/^./,c=>c.toUpperCase()):"Not set"}</strong>
              <span>Governance</span>
            </button>
          </div>

          <div className="organisation-overview-grid">
            <div className="organisation-overview-panel">
              <div className="section-heading">
                <div>
                  <h2>Departments</h2>
                  <p>Organisation structure and assigned positions.</p>
                </div>
                <Building2/>
              </div>

              <div className="organisation-department-list">
                {(data.departments||[]).map(d=>{
                  const deptPositions=(data.positions||[]).filter(p=>String(p.department_id||"")===String(d.id));
                  const deptPeople=(data.team||[]).filter(u=>String(u.department_id||"")===String(d.id));

                  return(
                    <button type="button" className="organisation-department-row" key={d.id} onClick={()=>{setSelectedDepartmentId(d.id);setStep(1);}}>
                      <div className="department-icon">{(d.name?.[0]||"D").toUpperCase()}</div>

                      <div className="organisation-department-info">
                        <strong>{d.name}</strong>
                        <small>{d.code||"No code"}</small>
                      </div>

                      <div className="organisation-department-counts">
                        <span>{deptPositions.length} position{deptPositions.length===1?"":"s"}</span>
                        <span>{deptPeople.length} people</span>
                      </div>

                      <ChevronRight size={17}/>
                    </button>
                  );
                })}

                {!data.departments?.length&&(
                  <div className="empty-state">
                    <Building2 size={28}/>
                    <strong>No departments configured</strong>
                    <p>Add departments to start building your organisation structure.</p>
                    <button type="button" className="primary-btn" onClick={()=>setStep(1)}>Add department</button>
                  </div>
                )}
              </div>
            </div>

            <div className="organisation-overview-panel">
              <div className="section-heading">
                <div>
                  <h2>Organisation-wide positions</h2>
                  <p>Positions that are not assigned to a specific department.</p>
                </div>
                <Users/>
              </div>

              <div className="organisation-wide-list">
                {(data.positions||[])
                  .filter(p=>!p.department_id)
                  .sort((a,b)=>Number(b.approval_level||0)-Number(a.approval_level||0))
                  .map(p=>(
                    <div className="organisation-wide-row" key={p.id}>
                      <div>
                        <strong>{p.title}</strong>
                        <small>{AUTHORITY_LEVELS[Number(p.approval_level)||0]}</small>
                      </div>

                      <span className="level-pill">
                        Level {Number(p.approval_level)||0}
                      </span>
                    </div>
                  ))}

                {!(data.positions||[]).some(p=>!p.department_id)&&(
                  <div className="empty-state compact">
                    <strong>No organisation-wide positions</strong>
                    <p>Positions such as CEO or COO can appear here.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {step===1&&(
        <section className="setup-grid">
          <div className="setup-main">
            {!selectedDepartment?(
              <>
                <div className="section-heading">
                  <div>
                    <h2>Departments</h2>
                    <p>Create the teams that make up {session.company_name}.</p>
                  </div>
                  <Building2/>
                </div>

                <div className="department-grid">
                  {data.departments.map(d=>(
                    <button type="button" className="department-card" key={d.id} onClick={()=>setSelectedDepartmentId(d.id)}>
                      <div className="department-icon">{(d.name?.[0]||"D").toUpperCase()}</div>
                      <div>
                        <strong>{d.name}</strong>
                        <small>{d.code||"No code"}</small>
                      </div>
                      <ChevronRight size={18}/>
                    </button>
                  ))}

                  {!data.departments.length&&(
                    <div className="empty-state">
                      <Building2 size={28}/>
                      <strong>No departments yet</strong>
                      <p>Create your first department.</p>
                    </div>
                  )}
                </div>
              </>
            ):(
              <>
                <div className="department-detail-head">
                  <button type="button" className="ghost-btn" onClick={()=>setSelectedDepartmentId(null)}>
                    ← All departments
                  </button>

                  <div className="department-detail-title">
                    <div className="department-icon">
                      {(selectedDepartment.name?.[0]||"D").toUpperCase()}
                    </div>

                    <div>
                      <h2>{selectedDepartment.name}</h2>
                      <p>
                        {selectedDepartment.code||"No code"} · {departmentPositions.length} position
                        {departmentPositions.length===1?"":"s"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="department-position-list">
                  {departmentPositions.map(p=>(
                    <article className="department-position-card" key={p.id}>
                      <div className="department-position-main">
                        <div>
                          <strong>{p.title}</strong>

                          <span className="level-pill">
                            Level {Number(p.approval_level)||0} · {
                              AUTHORITY_LEVELS[Number(p.approval_level)||0]
                            }
                          </span>
                        </div>

                        {p.is_department_head&&(
                          <span className="department-head-pill">
                            Department head
                          </span>
                        )}
                      </div>

                      <div className="department-occupants">
                        {p.occupants?.length?p.occupants.map(u=>(
                          <div className="department-occupant" key={u.company_user_id}>
                            <div className="avatar">
                              {(u.first_name?.[0]||u.email?.[0]||"U").toUpperCase()}
                            </div>

                            <div className="department-occupant-person">
                              <strong>
                                {`${u.first_name||""} ${u.last_name||""}`.trim()||u.email}
                              </strong>
                              <small>{u.email}</small>
                            </div>

                            <div className="role-pills">
                              {(u.ops_roles||[]).map(role=>(
                                <span key={role}>{role.replaceAll("_"," ")}</span>
                              ))}
                            </div>
                          </div>
                        )):(
                          <div className="position-vacant">
                            <span>Vacant</span>
                            <small>No person currently occupies this position.</small>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}

                  {!departmentPositions.length&&(
                    <div className="empty-state">
                      <Users size={28}/>
                      <strong>No positions in this department</strong>
                      <p>Create positions and assign them to {selectedDepartment.name}.</p>
                    </div>
                  )}
                </div>
              </>
            )}
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
            <button type="button" className="primary-btn" onClick={()=>setStep(2)}>
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
                <div
                  className={`position-row ${
                    editingPositionId===p.id?"editing":""
                  }`}
                  key={p.id}
                >
                  <div>
                    <strong>{p.title}</strong>
                    <small>{p.department_name||"Organisation-wide"}</small>
                  </div>

                  <span
                    className="level-pill"
                    title={AUTHORITY_LEVELS[Number(p.approval_level)||0]}
                  >
                    Level {Number(p.approval_level)||0} · {
                      AUTHORITY_LEVELS[Number(p.approval_level)||0]
                    }
                  </span>

                  <button
                    type="button"
                    className="position-edit-btn"
                    onClick={()=>editPosition(p)}
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          </div>

          <form className="setup-side-card" onSubmit={savePosition}>
            <div className="card-icon"><Plus/></div>
            <h3>{editingPositionId?"Edit position":"Add position"}</h3>

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
            <select
              value={position.approval_level}
              onChange={e=>setPosition(x=>({
                ...x,
                approval_level:Number(e.target.value)
              }))}
            >
              <option value={0}>Level 0 — No approval authority</option>
              <option value={1}>Level 1 — Supervisor / Team lead</option>
              <option value={2}>Level 2 — Manager / Department authority</option>
              <option value={3}>Level 3 — Senior management</option>
              <option value={4}>Level 4 — Executive</option>
              <option value={5}>Level 5 — Organisation head</option>
            </select>

            <small className="field-help">
              Determines approval hierarchy and escalation. It does not grant system permissions.
            </small>
            <label className="check-row">
              <input type="checkbox"
                checked={position.is_department_head}
                onChange={e=>setPosition(x=>({...x,is_department_head:e.target.checked}))}/>
              Department head
            </label>

            <div className="position-form-actions">
              {editingPositionId&&(
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={cancelPositionEdit}
                  disabled={busy}
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                className="primary-btn"
                disabled={busy}
              >
                {busy
                  ?"Saving..."
                  :editingPositionId
                    ?"Save changes"
                    :"Add position"}
              </button>
            </div>
          </form>

          <div className="setup-next">
            <button
              type="button"
              className="ghost-btn"
              onClick={()=>setStep(1)}
            >
              Back
            </button>

            <button type="button" className="primary-btn" onClick={continueFromPositions} disabled={busy}>
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
              {data.team.map(u=>{
                const isSelected=selectedUser?.user_id===u.user_id;

                return(
                  <div className={`team-card-wrap ${isSelected?"active":""}`} key={u.company_user_id}>
                    <button type="button" className="team-card" onClick={()=>isSelected?cancelUserEdit():editUser(u)}>
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

                      <ChevronRight className={`team-expand-icon ${isSelected?"open":""}`} size={17}/>
                    </button>

                    {isSelected&&(
                      <div className="user-access-editor">
                        <div className="user-access-head">
                          <div>
                            <span className="eyebrow dark">ORGANISATION ASSIGNMENT</span>
                            <h3>{`${u.first_name||""} ${u.last_name||""}`.trim()||u.email}</h3>
                            <p>Assign this person to the organisation structure and FinSage Nexus roles.</p>
                          </div>

                          <button type="button" className="ghost-btn" onClick={cancelUserEdit}>Close</button>
                        </div>

                        <div className="user-access-grid">
                          <div className="user-access-field">
                            <label>Department</label>
                            <select value={userAccess.department_id} onChange={e=>setUserAccess(x=>({...x,department_id:e.target.value,position_id:""}))}>
                              <option value="">No department</option>
                              {data.departments.map(d=>
                                <option key={d.id} value={d.id}>{d.name}</option>
                              )}
                            </select>
                          </div>

                          <div className="user-access-field">
                            <label>Position</label>
                            <select value={userAccess.position_id} onChange={e=>setUserAccess(x=>({...x,position_id:e.target.value}))}>
                              <option value="">No position</option>
                              {userPositions.map(p=>
                                <option key={p.id} value={p.id}>{p.title}</option>
                              )}
                            </select>
                          </div>

                          <div className="user-access-field">
                            <label>Branch</label>
                            <select value={userAccess.branch_id} onChange={e=>setUserAccess(x=>({...x,branch_id:e.target.value}))}>
                              <option value="">All / Head office</option>
                              {data.branches.map(b=>
                                <option key={b.id} value={b.id}>{b.name}</option>
                              )}
                            </select>
                          </div>

                          <div className="user-access-field">
                            <label>Manager</label>
                            <select value={userAccess.manager_user_id} onChange={e=>setUserAccess(x=>({...x,manager_user_id:e.target.value}))}>
                              <option value="">No manager</option>
                              {data.team
                                .filter(member=>member.user_id!==u.user_id)
                                .map(member=>
                                  <option key={member.user_id} value={member.user_id}>
                                    {`${member.first_name||""} ${member.last_name||""}`.trim()||member.email}
                                  </option>
                                )}
                            </select>
                          </div>
                        </div>

                        <div className="user-role-editor">
                          <div className="user-role-head">
                            <div>
                              <label>FinSage Nexus roles</label>
                              <small>Select one or more roles for this team member.</small>
                            </div>

                            <span>{userAccess.ops_role_codes.length} selected</span>
                          </div>

                          <div className="user-role-grid">
                            {data.roles
                              .filter(r=>r.code!=="OWNER"||u.ops_roles?.includes("OWNER"))
                              .map(r=>{
                                const checked=userAccess.ops_role_codes.includes(r.code);

                                return(
                                  <label className={`user-role-option ${checked?"selected":""}`} key={r.id}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={e=>setUserAccess(x=>({
                                        ...x,
                                        ops_role_codes:e.target.checked
                                          ?[...new Set([...x.ops_role_codes,r.code])]
                                          :x.ops_role_codes.filter(code=>code!==r.code)
                                      }))}
                                    />

                                    <span>
                                      <strong>{r.name}</strong>
                                      <small>{r.code.replaceAll("_"," ")}</small>
                                    </span>
                                  </label>
                                );
                              })}
                          </div>
                        </div>

                        <div className="user-access-actions">
                          <button type="button" className="ghost-btn" onClick={cancelUserEdit} disabled={busy}>Cancel</button>
                          <button type="button" className="primary-btn" onClick={saveUserAccess} disabled={busy}>
                            {busy?"Saving...":"Save assignment"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {!data.team.length&&(
                <div className="empty-state">
                  <Users size={28}/>
                  <strong>No team members yet</strong>
                  <p>Invite people to start building your organisation.</p>
                </div>
              )}
            </div>
          </div>

          <form className="setup-side-card" onSubmit={sendInvite}>
            <div className="card-icon"><UserPlus/></div>
            <h3>Invite team member</h3>

            <label>Email</label>
            <input type="email" value={invite.email} onChange={e=>setInvite(x=>({...x,email:e.target.value}))} required placeholder="person@company.com"/>

            <label>Department</label>
            <select value={invite.department_id} onChange={e=>setInvite(x=>({...x,department_id:e.target.value,position_id:""}))}>
              <option value="">No department</option>
              {data.departments.map(d=>
                <option key={d.id} value={d.id}>{d.name}</option>
              )}
            </select>

            <label>Position</label>
            <select value={invite.position_id} onChange={e=>setInvite(x=>({...x,position_id:e.target.value}))}>
              <option value="">No position</option>
              {positions.map(p=>
                <option key={p.id} value={p.id}>{p.title}</option>
              )}
            </select>

            <label>FinSage Nexus role</label>
            <select value={invite.ops_role_code} onChange={e=>setInvite(x=>({...x,ops_role_code:e.target.value}))}>
              {data.roles
                .filter(r=>r.code!=="OWNER")
                .map(r=>
                  <option key={r.id} value={r.code}>{r.name}</option>
                )}
            </select>

            <label>Branch</label>
            <select value={invite.branch_id} onChange={e=>setInvite(x=>({...x,branch_id:e.target.value}))}>
              <option value="">All / Head office</option>
              {data.branches.map(b=>
                <option key={b.id} value={b.id}>{b.name}</option>
              )}
            </select>

            <button type="submit" className="primary-btn" disabled={busy}>
              {busy?"Sending...":"Send invitation"}
            </button>
          </form>

          <div className="setup-next">
            <button type="button" className="ghost-btn" onClick={()=>setStep(2)}>
              Back
            </button>

            <button type="button" className="primary-btn" onClick={()=>setStep(4)}>
              Continue <ArrowRight size={17}/>
            </button>
          </div>
        </section>
      )}

      {step===4&&governance&&(
        <section>
          <div className="governance-heading">
            <ShieldCheck size={34}/>
            <h2>How controlled should FinSage Nexus be?</h2>
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
                            <option value="role">FinSage Nexus role</option>
                            <option value="position">Organisation position</option>
                            <option value="owner">Business owner</option>
                          </select>
                        </div>
                      </div>

                      {approval.approver_type==="role"&&(
                        <div>
                          <label>FinSage Nexus role</label>
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