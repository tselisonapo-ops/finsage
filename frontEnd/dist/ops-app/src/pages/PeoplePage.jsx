import {useEffect,useMemo,useState} from "react";
import {ChevronRight,UserPlus,Users} from "lucide-react";
import {getCompanyId,opsApi} from "../api/api";
import Shell from "../components/Shell";

export default function PeoplePage(){
  const companyId=getCompanyId();

  const [session,setSession]=useState(null);
  const [data,setData]=useState(null);
  const [selectedUser,setSelectedUser]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

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
      setError(err.message||"Could not load people.");
    }
  }

  useEffect(()=>{load();},[]);

  const invitePositions=useMemo(()=>{
    if(!invite.department_id) return data?.positions||[];

    return (data?.positions||[]).filter(
      p=>String(p.department_id||"")===String(invite.department_id)
    );
  },[data,invite.department_id]);

  const userPositions=useMemo(()=>{
    if(!userAccess.department_id) return data?.positions||[];

    return (data?.positions||[]).filter(
      p=>String(p.department_id||"")===String(userAccess.department_id)
    );
  },[data,userAccess.department_id]);

  function editUser(user){
    setSelectedUser(user);

    setUserAccess({
      department_id:user.department_id||"",
      position_id:user.position_id||"",
      branch_id:user.branch_id||"",
      manager_user_id:user.manager_user_id||"",
      ops_role_codes:user.ops_roles||[]
    });

    setError("");
    setMessage("");
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

  async function saveUserAccess(){
    if(!selectedUser||busy) return;

    setBusy(true);
    setError("");
    setMessage("");

    try{
      await opsApi.updateUserAccess(companyId,selectedUser.user_id,{
        department_id:userAccess.department_id
          ?Number(userAccess.department_id)
          :null,

        position_id:userAccess.position_id
          ?Number(userAccess.position_id)
          :null,

        branch_id:userAccess.branch_id
          ?Number(userAccess.branch_id)
          :null,

        manager_user_id:userAccess.manager_user_id
          ?Number(userAccess.manager_user_id)
          :null,

        ops_role_codes:userAccess.ops_role_codes
      });

      cancelUserEdit();
      await load();

      setMessage("Team member assignment updated.");
    }catch(err){
      setError(err.message||"Could not update team member.");
    }finally{
      setBusy(false);
    }
  }

  async function sendInvite(e){
    e.preventDefault();
    if(busy) return;

    const email=invite.email.trim();

    if(!email){
      setError("Email is required.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try{
      const selectedRole=invite.ops_role_code;

      const accountingMap={
        OWNER:"owner",
        ADMIN:"admin",
        EXECUTIVE:"viewer",
        CFO:"cfo",
        FINANCE_MANAGER:"manager",
        ACCOUNTANT:"accountant"
      };

      await opsApi.inviteUser({
        email,
        role:accountingMap[selectedRole]||"viewer",
        access_scope:"core",

        department_id:invite.department_id||null,
        position_id:invite.position_id||null,
        branch_id:invite.branch_id||null,
        manager_user_id:invite.manager_user_id||null,

        ops_role_code:selectedRole,

        product_access:{
          finsage:[
            "OWNER",
            "ADMIN",
            "CFO",
            "FINANCE_MANAGER",
            "ACCOUNTANT"
          ].includes(selectedRole),

          "FinSage Nexus":true,
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

      setMessage("Invitation sent.");
    }catch(err){
      setError(err.message||"Could not send invitation.");
    }finally{
      setBusy(false);
    }
  }

  if(!session||!data){
    return(
      <div className="loading-screen">
        Loading people…
      </div>
    );
  }

  return(
    <Shell session={session} active="team">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">FINSAGE NEXUS</span>
          <h1>People</h1>
          <p>
            Manage team members, organisation assignments and Nexus roles.
          </p>
        </div>

        <div className="setup-progress">
          <strong>{data.team?.length||0}</strong>
          <span>People</span>
        </div>
      </div>

      {error&&<div className="alert error">{error}</div>}
      {message&&<div className="alert success">{message}</div>}

      <section className="setup-grid">
        <div className="setup-main">
          <div className="section-heading">
            <div>
              <h2>Your team</h2>
              <p>
                Click a person to manage their department, position,
                manager and Nexus roles.
              </p>
            </div>

            <Users/>
          </div>

          <div className="team-list">
            {(data.team||[]).map(user=>{
              const isSelected=
                selectedUser?.user_id===user.user_id;

              return(
                <div
                  className={`team-card-wrap ${
                    isSelected?"active":""
                  }`}
                  key={user.company_user_id}
                >
                  <button
                    type="button"
                    className="team-card"
                    onClick={()=>
                      isSelected
                        ?cancelUserEdit()
                        :editUser(user)
                    }
                  >
                    <div className="avatar large">
                      {(user.first_name?.[0]||
                        user.email?.[0]||
                        "U"
                      ).toUpperCase()}
                    </div>

                    <div className="team-person">
                      <strong>
                        {`${user.first_name||""} ${
                          user.last_name||""
                        }`.trim()||user.email}
                      </strong>

                      <small>{user.email}</small>
                    </div>

                    <div className="team-meta">
                      <strong>
                        {user.position_title||
                          user.company_role||
                          "No position"}
                      </strong>

                      <small>
                        {user.department_name||
                          "No department"}
                      </small>
                    </div>

                    <div className="role-pills">
                      {(user.ops_roles||[]).map(role=>(
                        <span key={role}>
                          {role.replaceAll("_"," ")}
                        </span>
                      ))}
                    </div>

                    <ChevronRight
                      size={17}
                      className={`team-expand-icon ${
                        isSelected?"open":""
                      }`}
                    />
                  </button>

                  {isSelected&&(
                    <div className="user-access-editor">
                      <div className="user-access-head">
                        <div>
                          <span className="eyebrow dark">
                            ORGANISATION ASSIGNMENT
                          </span>

                          <h3>
                            {`${user.first_name||""} ${
                              user.last_name||""
                            }`.trim()||user.email}
                          </h3>

                          <p>
                            Assign this person to the organisation
                            structure and Nexus roles.
                          </p>
                        </div>

                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={cancelUserEdit}
                        >
                          Close
                        </button>
                      </div>

                      <div className="user-access-grid">
                        <div className="user-access-field">
                          <label>Department</label>

                          <select
                            value={userAccess.department_id}
                            onChange={e=>
                              setUserAccess(x=>({
                                ...x,
                                department_id:e.target.value,
                                position_id:""
                              }))
                            }
                          >
                            <option value="">
                              No department
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
                        </div>

                        <div className="user-access-field">
                          <label>Position</label>

                          <select
                            value={userAccess.position_id}
                            onChange={e=>
                              setUserAccess(x=>({
                                ...x,
                                position_id:e.target.value
                              }))
                            }
                          >
                            <option value="">
                              No position
                            </option>

                            {userPositions.map(p=>(
                              <option
                                key={p.id}
                                value={p.id}
                              >
                                {p.title}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="user-access-field">
                          <label>Branch</label>

                          <select
                            value={userAccess.branch_id}
                            onChange={e=>
                              setUserAccess(x=>({
                                ...x,
                                branch_id:e.target.value
                              }))
                            }
                          >
                            <option value="">
                              All / Head office
                            </option>

                            {(data.branches||[]).map(b=>(
                              <option
                                key={b.id}
                                value={b.id}
                              >
                                {b.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="user-access-field">
                          <label>Manager</label>

                          <select
                            value={userAccess.manager_user_id}
                            onChange={e=>
                              setUserAccess(x=>({
                                ...x,
                                manager_user_id:e.target.value
                              }))
                            }
                          >
                            <option value="">
                              No manager
                            </option>

                            {(data.team||[])
                              .filter(
                                member=>
                                  member.user_id!==user.user_id
                              )
                              .map(member=>(
                                <option
                                  key={member.user_id}
                                  value={member.user_id}
                                >
                                  {`${member.first_name||""} ${
                                    member.last_name||""
                                  }`.trim()||member.email}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>

                      <div className="user-role-editor">
                        <div className="user-role-head">
                          <div>
                            <label>
                              FinSage Nexus roles
                            </label>

                            <small>
                              Select one or more roles for this
                              person.
                            </small>
                          </div>

                          <span>
                            {userAccess.ops_role_codes.length}
                            {" "}selected
                          </span>
                        </div>

                        <div className="user-role-grid">
                          {(data.roles||[])
                            .filter(
                              role=>
                                role.code!=="OWNER"||
                                user.ops_roles?.includes("OWNER")
                            )
                            .map(role=>{
                              const checked=
                                userAccess.ops_role_codes
                                  .includes(role.code);

                              const ownerRole=
                                role.code==="OWNER";

                              return(
                                <label
                                  className={`user-role-option ${
                                    checked?"selected":""
                                  }`}
                                  key={role.id}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={ownerRole}
                                    onChange={e=>
                                      setUserAccess(x=>({
                                        ...x,
                                        ops_role_codes:
                                          e.target.checked
                                            ?[
                                              ...new Set([
                                                ...x.ops_role_codes,
                                                role.code
                                              ])
                                            ]
                                            :x.ops_role_codes
                                              .filter(
                                                code=>
                                                  code!==role.code
                                              )
                                      }))
                                    }
                                  />

                                  <span>
                                    <strong>
                                      {role.name}
                                    </strong>

                                    <small>
                                      {role.code
                                        .replaceAll("_"," ")}
                                    </small>
                                  </span>
                                </label>
                              );
                            })}
                        </div>
                      </div>

                      <div className="user-access-actions">
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={cancelUserEdit}
                          disabled={busy}
                        >
                          Cancel
                        </button>

                        <button
                          type="button"
                          className="primary-btn"
                          onClick={saveUserAccess}
                          disabled={busy}
                        >
                          {busy
                            ?"Saving..."
                            :"Save assignment"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {!data.team?.length&&(
              <div className="empty-state">
                <Users size={28}/>
                <strong>No team members yet</strong>
                <p>
                  Invite people to start building your
                  organisation.
                </p>
              </div>
            )}
          </div>
        </div>

        <form
          className="setup-side-card"
          onSubmit={sendInvite}
        >
          <div className="card-icon">
            <UserPlus/>
          </div>

          <h3>Invite team member</h3>

          <p>
            Invite a user and optionally assign their
            organisation structure immediately.
          </p>

          <label>Email</label>

          <input
            type="email"
            value={invite.email}
            onChange={e=>
              setInvite(x=>({
                ...x,
                email:e.target.value
              }))
            }
            required
            placeholder="person@company.com"
          />

          <label>Department</label>

          <select
            value={invite.department_id}
            onChange={e=>
              setInvite(x=>({
                ...x,
                department_id:e.target.value,
                position_id:""
              }))
            }
          >
            <option value="">
              No department
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

          <label>Position</label>

          <select
            value={invite.position_id}
            onChange={e=>
              setInvite(x=>({
                ...x,
                position_id:e.target.value
              }))
            }
          >
            <option value="">
              No position
            </option>

            {invitePositions.map(p=>(
              <option
                key={p.id}
                value={p.id}
              >
                {p.title}
              </option>
            ))}
          </select>

          <label>FinSage Nexus role</label>

          <select
            value={invite.ops_role_code}
            onChange={e=>
              setInvite(x=>({
                ...x,
                ops_role_code:e.target.value
              }))
            }
          >
            {(data.roles||[])
              .filter(role=>role.code!=="OWNER")
              .map(role=>(
                <option
                  key={role.id}
                  value={role.code}
                >
                  {role.name}
                </option>
              ))}
          </select>

          <label>Branch</label>

          <select
            value={invite.branch_id}
            onChange={e=>
              setInvite(x=>({
                ...x,
                branch_id:e.target.value
              }))
            }
          >
            <option value="">
              All / Head office
            </option>

            {(data.branches||[]).map(b=>(
              <option
                key={b.id}
                value={b.id}
              >
                {b.name}
              </option>
            ))}
          </select>

          <label>Manager</label>

          <select
            value={invite.manager_user_id}
            onChange={e=>
              setInvite(x=>({
                ...x,
                manager_user_id:e.target.value
              }))
            }
          >
            <option value="">
              No manager
            </option>

            {(data.team||[]).map(user=>(
              <option
                key={user.user_id}
                value={user.user_id}
              >
                {`${user.first_name||""} ${
                  user.last_name||""
                }`.trim()||user.email}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="primary-btn"
            disabled={busy}
          >
            {busy
              ?"Sending..."
              :"Send invitation"}
          </button>
        </form>
      </section>
    </Shell>
  );
}