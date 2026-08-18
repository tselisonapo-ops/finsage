import {useEffect,useMemo,useState} from "react";
import {
  Building2,
  ChevronRight,
  Plus,
  ShieldCheck,
  UserPlus,
  Users
} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

const AUTHORITY_LEVELS={
  0:"No authority",
  1:"Supervisor",
  2:"Manager",
  3:"Senior management",
  4:"Executive",
  5:"Organisation head"
};

export default function OrganisationPage(){
  const companyId=getCompanyId();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [data,setData]=useState(null);

  const [view,setView]=useState("overview");
  const [selectedDepartmentId,setSelectedDepartmentId]=useState(null);

  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  const [department,setDepartment]=useState({
    name:"",
    code:""
  });

  const [editingPositionId,setEditingPositionId]=useState(null);

  const [position,setPosition]=useState({
    title:"",
    department_id:"",
    approval_level:0,
    is_department_head:false
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
    }catch(err){
      setError(
        err.message||
        "Could not load organisation."
      );
    }
  }

  useEffect(()=>{load();},[]);

  const selectedDepartment=useMemo(
    ()=>data?.departments?.find(
      d=>String(d.id)===String(selectedDepartmentId)
    )||null,
    [data,selectedDepartmentId]
  );

  const departmentPositions=useMemo(()=>{
    if(!selectedDepartmentId) return [];

    return (data?.positions||[])
      .filter(
        p=>
          String(p.department_id||"")===
          String(selectedDepartmentId)
      )
      .map(p=>({
        ...p,

        occupants:(data?.team||[]).filter(
          user=>
            String(user.position_id||"")===
            String(p.id)
        )
      }))
      .sort(
        (a,b)=>
          Number(b.approval_level||0)-
          Number(a.approval_level||0)
      );
  },[data,selectedDepartmentId]);

  const organisationWidePositions=useMemo(
    ()=>(data?.positions||[])
      .filter(p=>!p.department_id)
      .map(p=>({
        ...p,

        occupants:(data?.team||[]).filter(
          user=>
            String(user.position_id||"")===
            String(p.id)
        )
      }))
      .sort(
        (a,b)=>
          Number(b.approval_level||0)-
          Number(a.approval_level||0)
      ),
    [data]
  );

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
    setMessage("");

    try{
      await opsApi.createDepartment(companyId,{
        name,
        code:code||null
      });

      setDepartment({
        name:"",
        code:""
      });

      await load();

      setMessage("Department added.");
    }catch(err){
      setError(
        err.message||
        "Could not add department."
      );
    }finally{
      setBusy(false);
    }
  }

  function editPosition(p){
    setEditingPositionId(p.id);

    setPosition({
      title:p.title||"",
      department_id:p.department_id||"",
      approval_level:Number(
        p.approval_level||0
      ),
      is_department_head:Boolean(
        p.is_department_head
      )
    });

    setView("positions");
    setError("");
    setMessage("");
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

  async function savePosition(e){
    e.preventDefault();
    if(busy) return;

    const title=position.title.trim();

    if(!title){
      setError("Position title is required.");
      return;
    }

    const payload={
      title,

      department_id:
        position.department_id
          ?Number(position.department_id)
          :null,

      approval_level:
        Number(position.approval_level||0),

      is_department_head:
        Boolean(position.is_department_head)
    };

    setBusy(true);
    setError("");
    setMessage("");

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

      const wasEditing=Boolean(editingPositionId);

      cancelPositionEdit();
      await load();

      setMessage(
        wasEditing
          ?"Position updated."
          :"Position added."
      );
    }catch(err){
      setError(
        err.message||
        "Could not save position."
      );
    }finally{
      setBusy(false);
    }
  }

  if(!session||!data){
    return(
      <div className="loading-screen">
        Loading organisation…
      </div>
    );
  }

  return(
    <Shell session={session} active="organisation">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">
            FINSAGE NEXUS
          </span>

          <h1>Organisation</h1>

          <p>
            Manage departments, positions,
            authority and organisation structure.
          </p>
        </div>
      </div>

      {error&&
        <div className="alert error">
          {error}
        </div>
      }

      {message&&
        <div className="alert success">
          {message}
        </div>
      }

      <div className="organisation-summary-grid">
        <button
          type="button"
          className="organisation-summary-card"
          onClick={()=>{
            setSelectedDepartmentId(null);
            setView("overview");
          }}
        >
          <Building2 size={20}/>

          <strong>
            {data.departments?.length||0}
          </strong>

          <span>Departments</span>
        </button>

        <button
          type="button"
          className="organisation-summary-card"
          onClick={()=>setView("positions")}
        >
          <Users size={20}/>

          <strong>
            {data.positions?.length||0}
          </strong>

          <span>Positions</span>
        </button>

        <button
          type="button"
          className="organisation-summary-card"
          onClick={()=>nav("/people")}
        >
          <UserPlus size={20}/>

          <strong>
            {data.team?.length||0}
          </strong>

          <span>People</span>
        </button>

        <button
          type="button"
          className="organisation-summary-card"
          onClick={()=>nav("/governance")}
        >
          <ShieldCheck size={20}/>

          <strong>
            {data.governance?.mode
              ?data.governance.mode
                .replace(/^./,c=>c.toUpperCase())
              :"Not set"}
          </strong>

          <span>Governance</span>
        </button>
      </div>

      {view==="overview"&&(
        <section className="setup-grid organisation-page-grid">
          <div className="setup-main">
            {!selectedDepartment?(
              <>
                <div className="section-heading">
                  <div>
                    <h2>Departments</h2>

                    <p>
                      Select a department to view its
                      positions and occupants.
                    </p>
                  </div>

                  <Building2/>
                </div>

                <div className="department-grid">
                  {(data.departments||[]).map(d=>{
                    const positions=
                      (data.positions||[]).filter(
                        p=>
                          String(p.department_id||"")===
                          String(d.id)
                      );

                    const people=
                      (data.team||[]).filter(
                        user=>
                          String(user.department_id||"")===
                          String(d.id)
                      );

                    return(
                      <button
                        type="button"
                        className="department-card"
                        key={d.id}
                        onClick={()=>
                          setSelectedDepartmentId(d.id)
                        }
                      >
                        <div className="department-icon">
                          {(d.name?.[0]||"D")
                            .toUpperCase()}
                        </div>

                        <div>
                          <strong>{d.name}</strong>

                          <small>
                            {d.code||"No code"}
                            {" · "}
                            {positions.length}
                            {" position"}
                            {positions.length===1
                              ?""
                              :"s"}
                            {" · "}
                            {people.length}
                            {" people"}
                          </small>
                        </div>

                        <ChevronRight size={18}/>
                      </button>
                    );
                  })}

                  {!data.departments?.length&&(
                    <div className="empty-state">
                      <Building2 size={28}/>

                      <strong>
                        No departments configured
                      </strong>

                      <p>
                        Add the first department for
                        this organisation.
                      </p>
                    </div>
                  )}
                </div>

                <div className="organisation-overview-panel organisation-wide-panel">
                  <div className="section-heading">
                    <div>
                      <h2>
                        Organisation-wide positions
                      </h2>

                      <p>
                        Positions that do not belong
                        to one department.
                      </p>
                    </div>

                    <Users/>
                  </div>

                  <div className="organisation-wide-list">
                    {organisationWidePositions.map(p=>(
                      <button
                        type="button"
                        className="organisation-wide-row"
                        key={p.id}
                        onClick={()=>editPosition(p)}
                      >
                        <div>
                          <strong>{p.title}</strong>

                          <small>
                            {AUTHORITY_LEVELS[
                              Number(
                                p.approval_level
                              )||0
                            ]}
                          </small>
                        </div>

                        <div className="position-occupant-summary">
                          {p.occupants?.length?(
                            <span>
                              {p.occupants.map(
                                user=>
                                  `${user.first_name||""} ${
                                    user.last_name||""
                                  }`.trim()||user.email
                              ).join(", ")}
                            </span>
                          ):(
                            <span className="vacant-text">
                              Vacant
                            </span>
                          )}

                          <span className="level-pill">
                            Level {
                              Number(
                                p.approval_level
                              )||0
                            }
                          </span>
                        </div>
                      </button>
                    ))}

                    {!organisationWidePositions.length&&(
                      <div className="empty-state compact">
                        <strong>
                          No organisation-wide positions
                        </strong>

                        <p>
                          Positions such as CEO or COO
                          can appear here.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ):(
              <>
                <div className="department-detail-head">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={()=>
                      setSelectedDepartmentId(null)
                    }
                  >
                    ← All departments
                  </button>

                  <div className="department-detail-title">
                    <div className="department-icon">
                      {(selectedDepartment.name?.[0]||
                        "D"
                      ).toUpperCase()}
                    </div>

                    <div>
                      <h2>
                        {selectedDepartment.name}
                      </h2>

                      <p>
                        {selectedDepartment.code||
                          "No code"}
                        {" · "}
                        {departmentPositions.length}
                        {" position"}
                        {departmentPositions.length===1
                          ?""
                          :"s"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="department-position-list">
                  {departmentPositions.map(p=>(
                    <article
                      className="department-position-card"
                      key={p.id}
                    >
                      <div className="department-position-main">
                        <div>
                          <strong>
                            {p.title}
                          </strong>

                          <span className="level-pill">
                            Level {
                              Number(
                                p.approval_level
                              )||0
                            } · {
                              AUTHORITY_LEVELS[
                                Number(
                                  p.approval_level
                                )||0
                              ]
                            }
                          </span>
                        </div>

                        <div className="position-card-actions">
                          {p.is_department_head&&(
                            <span className="department-head-pill">
                              Department head
                            </span>
                          )}

                          <button
                            type="button"
                            className="position-edit-btn"
                            onClick={()=>editPosition(p)}
                          >
                            Edit
                          </button>
                        </div>
                      </div>

                      <div className="department-occupants">
                        {p.occupants?.length?(
                          p.occupants.map(user=>(
                            <div
                              className="department-occupant"
                              key={
                                user.company_user_id
                              }
                            >
                              <div className="avatar">
                                {(user.first_name?.[0]||
                                  user.email?.[0]||
                                  "U"
                                ).toUpperCase()}
                              </div>

                              <div className="department-occupant-person">
                                <strong>
                                  {`${user.first_name||""} ${
                                    user.last_name||""
                                  }`.trim()||
                                    user.email}
                                </strong>

                                <small>
                                  {user.email}
                                </small>
                              </div>

                              <div className="role-pills">
                                {(user.ops_roles||[])
                                  .map(role=>(
                                    <span key={role}>
                                      {role.replaceAll(
                                        "_",
                                        " "
                                      )}
                                    </span>
                                  ))}
                              </div>
                            </div>
                          ))
                        ):(
                          <div className="position-vacant">
                            <span>Vacant</span>

                            <small>
                              No person currently occupies
                              this position.
                            </small>

                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={()=>nav("/people")}
                            >
                              Assign person
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}

                  {!departmentPositions.length&&(
                    <div className="empty-state">
                      <Users size={28}/>

                      <strong>
                        No positions in this department
                      </strong>

                      <p>
                        Add positions for {
                          selectedDepartment.name
                        }.
                      </p>

                      <button
                        type="button"
                        className="primary-btn"
                        onClick={()=>{
                          setPosition({
                            title:"",
                            department_id:
                              selectedDepartment.id,
                            approval_level:0,
                            is_department_head:false
                          });

                          setEditingPositionId(null);
                          setView("positions");
                        }}
                      >
                        Add position
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <form
            className="setup-side-card"
            onSubmit={addDepartment}
          >
            <div className="card-icon">
              <Plus/>
            </div>

            <h3>Add department</h3>

            <p>
              Create another organisational department.
            </p>

            <label>Department name</label>

            <input
              value={department.name}
              onChange={e=>
                setDepartment(x=>({
                  ...x,
                  name:e.target.value
                }))
              }
              placeholder="Finance"
            />

            <label>Code</label>

            <input
              value={department.code}
              onChange={e=>
                setDepartment(x=>({
                  ...x,
                  code:e.target.value
                }))
              }
              placeholder="FIN"
            />

            <button
              type="submit"
              className="primary-btn"
              disabled={busy}
            >
              {busy
                ?"Saving..."
                :"Add department"}
            </button>
          </form>
        </section>
      )}

      {view==="positions"&&(
        <section className="setup-grid organisation-page-grid">
          <div className="setup-main">
            <div className="section-heading">
              <div>
                <h2>Positions</h2>

                <p>
                  Define jobs and approval authority
                  across the organisation.
                </p>
              </div>

              <Users/>
            </div>

            <div className="position-table">
              {(data.positions||[]).map(p=>{
                const occupants=
                  (data.team||[]).filter(
                    user=>
                      String(user.position_id||"")===
                      String(p.id)
                  );

                return(
                  <div
                    className={`position-row ${
                      editingPositionId===p.id
                        ?"editing"
                        :""
                    }`}
                    key={p.id}
                  >
                    <div>
                      <strong>{p.title}</strong>

                      <small>
                        {p.department_name||
                          "Organisation-wide"}

                        {occupants.length
                          ?` · ${occupants
                            .map(user=>
                              `${user.first_name||""} ${
                                user.last_name||""
                              }`.trim()||user.email
                            )
                            .join(", ")}`
                          :" · Vacant"}
                      </small>
                    </div>

                    <span
                      className="level-pill"
                      title={
                        AUTHORITY_LEVELS[
                          Number(
                            p.approval_level
                          )||0
                        ]
                      }
                    >
                      Level {
                        Number(
                          p.approval_level
                        )||0
                      } · {
                        AUTHORITY_LEVELS[
                          Number(
                            p.approval_level
                          )||0
                        ]
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
                );
              })}

              {!data.positions?.length&&(
                <div className="empty-state">
                  <Users size={28}/>

                  <strong>
                    No positions configured
                  </strong>

                  <p>
                    Create the first organisation
                    position.
                  </p>
                </div>
              )}
            </div>
          </div>

          <form
            className="setup-side-card"
            onSubmit={savePosition}
          >
            <div className="card-icon">
              <Plus/>
            </div>

            <h3>
              {editingPositionId
                ?"Edit position"
                :"Add position"}
            </h3>

            <label>Position title</label>

            <input
              value={position.title}
              onChange={e=>
                setPosition(x=>({
                  ...x,
                  title:e.target.value
                }))
              }
              placeholder="Finance Manager"
            />

            <label>Department</label>

            <select
              value={position.department_id}
              onChange={e=>
                setPosition(x=>({
                  ...x,
                  department_id:e.target.value
                }))
              }
            >
              <option value="">
                Organisation-wide
              </option>

              {(data.departments||[]).map(d=>(
                <option
                  key={d.id}
                  value={d.id}
                >
                  {d.name}
                </option>
              ))}
            </select>

            <label>Authority level</label>

            <select
              value={position.approval_level}
              onChange={e=>
                setPosition(x=>({
                  ...x,
                  approval_level:
                    Number(e.target.value)
                }))
              }
            >
              <option value={0}>
                Level 0 — No approval authority
              </option>

              <option value={1}>
                Level 1 — Supervisor / Team lead
              </option>

              <option value={2}>
                Level 2 — Manager / Department authority
              </option>

              <option value={3}>
                Level 3 — Senior management
              </option>

              <option value={4}>
                Level 4 — Executive
              </option>

              <option value={5}>
                Level 5 — Organisation head
              </option>
            </select>

            <small className="field-help">
              Determines approval hierarchy and
              escalation. It does not grant system
              permissions.
            </small>

            <label className="check-row">
              <input
                type="checkbox"
                checked={
                  position.is_department_head
                }
                onChange={e=>
                  setPosition(x=>({
                    ...x,
                    is_department_head:
                      e.target.checked
                  }))
                }
              />

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

            <button
              type="button"
              className="ghost-btn"
              onClick={()=>{
                cancelPositionEdit();
                setView("overview");
              }}
            >
              Back to organisation
            </button>
          </form>
        </section>
      )}
    </Shell>
  );
}