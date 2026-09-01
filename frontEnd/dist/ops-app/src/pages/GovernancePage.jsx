import {useEffect,useMemo,useState} from "react";
import {useNavigate} from "react-router-dom";
import {getCompanyId,getToken} from "../api/api";
import "./GovernancePage.css";

const emptyStep=()=>({
  name:"",
  approver_type:"requester_manager",
  approver_role_code:"",
  approver_position_id:"",
  approver_user_id:"",
  required:true,
  allow_delegation:true,
  allow_reassignment:false,
  min_amount:"",
  max_amount:"",
});

export default function GovernancePage(){
  const navigate=useNavigate();
  const companyId=getCompanyId();
  const token=getToken();

  const [form,setForm]=useState({
    mode:"structured",
    allow_owner_override:false,
    require_override_reason:false,
    prevent_self_approval:true,
    prevent_consecutive_approval:false,
    require_finance_review:false,
    require_budget_validation:false,
    invalidate_approvals_on_change:true,
    steps:[emptyStep()],
  });

  const [roles,setRoles]=useState([]);
  const [positions,setPositions]=useState([]);
  const [team,setTeam]=useState([]);

  const [workflow,setWorkflow]=useState(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  const apiBase=import.meta.env.VITE_API_BASE_URL || "";

  const headers=useMemo(()=>({
    "Content-Type":"application/json",
    Authorization:`Bearer ${token}`,
  }),[token]);

  useEffect(()=>{
    loadPage();
  },[]);

  async function loadPage(){
    setLoading(true);
    setError("");

    try{
      const [govRes,setupRes]=await Promise.all([
        fetch(
          `${apiBase}/api/companies/${companyId}/ops/governance`,
          {headers}
        ),
        fetch(
          `${apiBase}/api/companies/${companyId}/ops/setup`,
          {headers}
        ),
      ]);

      const gov=await govRes.json();
      const setup=await setupRes.json();

      if(!govRes.ok){
        throw new Error(
          gov.error || "Unable to load governance configuration."
        );
      }

      if(!setupRes.ok){
        throw new Error(
          setup.error || "Unable to load organisation metadata."
        );
      }

      setRoles(setup.roles || []);
      setPositions(setup.positions || []);
      setTeam(setup.team || []);
      setWorkflow(gov.workflow || null);

      hydrateGovernance(gov);

    }catch(e){
      setError(e.message);
    }finally{
      setLoading(false);
    }
  }

  function hydrateGovernance(gov){
    const rules=gov?.settings_json?.governance || {};

    const steps=(gov.steps || []).map(step=>{
      const minCondition=(step.conditions || []).find(
        row=>
          row.field_name==="estimated_amount" &&
          row.operator==="gte"
      );

      const maxCondition=(step.conditions || []).find(
        row=>
          row.field_name==="estimated_amount" &&
          row.operator==="lte"
      );

      return {
        id:step.id,
        name:step.name || "",
        approver_type:step.approver_type || "requester_manager",
        approver_role_code:step.approver_role_code || "",
        approver_position_id:step.approver_position_id || "",
        approver_user_id:step.approver_user_id || "",
        required:step.settings_json?.required !== false,
        allow_delegation:step.allow_delegation !== false,
        allow_reassignment:!!step.allow_reassignment,
        min_amount:minCondition?.comparison_value || "",
        max_amount:maxCondition?.comparison_value || "",
      };
    });

    setForm({
      mode:gov.mode || "structured",
      allow_owner_override:!!gov.allow_owner_override,
      require_override_reason:!!gov.require_override_reason,

      prevent_self_approval:
        rules.prevent_self_approval !== false,

      prevent_consecutive_approval:
        !!rules.prevent_consecutive_approval,

      require_finance_review:
        !!rules.require_finance_review,

      require_budget_validation:
        !!rules.require_budget_validation,

      invalidate_approvals_on_change:
        rules.invalidate_approvals_on_change !== false,

      steps:steps.length?steps:[emptyStep()],
    });
  }

  function field(name,value){
    setForm(prev=>({
      ...prev,
      [name]:value,
    }));
  }

  function stepField(index,name,value){
    setForm(prev=>({
      ...prev,
      steps:prev.steps.map((step,i)=>
        i===index
          ?{...step,[name]:value}
          :step
      ),
    }));
  }

  function addStep(){
    setForm(prev=>({
      ...prev,
      steps:[
        ...prev.steps,
        emptyStep(),
      ],
    }));
  }

  function removeStep(index){
    if(form.steps.length<=1){
      setError("At least one approval step is required.");
      return;
    }

    setForm(prev=>({
      ...prev,
      steps:prev.steps.filter((_,i)=>i!==index),
    }));
  }

  function moveStep(index,direction){
    const next=index+direction;

    if(next<0 || next>=form.steps.length){
      return;
    }

    setForm(prev=>{
      const steps=[...prev.steps];

      [steps[index],steps[next]]=[
        steps[next],
        steps[index],
      ];

      return {
        ...prev,
        steps,
      };
    });
  }

  async function save(){
    setSaving(true);
    setError("");
    setMessage("");

    try{
      const payload={
        ...form,
        steps:form.steps.map((step,index)=>({
          name:
            step.name.trim()
            || `Approval ${index+1}`,

          approver_type:
            step.approver_type,

          approver_role_code:
            step.approver_type==="role"
              ?step.approver_role_code
              :null,

          approver_position_id:
            step.approver_type==="position"
              ?Number(step.approver_position_id || 0) || null
              :null,

          approver_user_id:
            step.approver_type==="user"
              ?Number(step.approver_user_id || 0) || null
              :null,

          required:!!step.required,
          allow_delegation:!!step.allow_delegation,
          allow_reassignment:!!step.allow_reassignment,

          min_amount:
            step.min_amount===""
              ?null
              :Number(step.min_amount),

          max_amount:
            step.max_amount===""
              ?null
              :Number(step.max_amount),
        })),
      };

      const res=await fetch(
        `${apiBase}/api/companies/${companyId}/ops/governance`,
        {
          method:"PUT",
          headers,
          body:JSON.stringify(payload),
        }
      );

      const data=await res.json();

      if(!res.ok){
        throw new Error(
          data.error || "Unable to save governance configuration."
        );
      }

      setWorkflow(data.workflow || null);
      hydrateGovernance(data);

      setMessage(
        "Governance workflow saved successfully."
      );

    }catch(e){
      setError(e.message);
    }finally{
      setSaving(false);
    }
  }

  if(loading){
    return (
      <div className="governance-page">
        <div className="governance-loading">
          Loading governance configuration…
        </div>
      </div>
    );
  }

  return (
    <div className="governance-page">

      <header className="governance-header">

        <div>
          <button
            type="button"
            className="governance-back"
            onClick={()=>navigate("/settings")}
          >
            ← Settings
          </button>

          <div className="governance-eyebrow">
            FINSPHERE NEXUS
          </div>

          <h1>Governance & Approvals</h1>

          <p>
            Define how operational requests move through
            approval, finance review and governance controls.
          </p>
        </div>

        {workflow&&(
          <div className="governance-version">
            <span>ACTIVE WORKFLOW</span>
            <strong>
              {workflow.name || "Standard Request Approval"}
            </strong>
            <small>
              Version {workflow.version_no || 1}
            </small>
          </div>
        )}

      </header>


      {error&&(
        <div className="governance-alert error">
          <strong>Governance configuration error</strong>
          <span>{error}</span>
        </div>
      )}

      {message&&(
        <div className="governance-alert success">
          <strong>Success</strong>
          <span>{message}</span>
        </div>
      )}


      <div className="governance-layout">

        <main className="governance-main">

          <section className="governance-card">

            <div className="governance-card-header">
              <div>
                <h2>Governance mode</h2>

                <p>
                  Choose how strictly FinSage should enforce
                  the approval workflow.
                </p>
              </div>
            </div>

            <div className="governance-mode-grid">

              <ModeCard
                value="flexible"
                current={form.mode}
                title="Flexible"
                description="Allows more delegation and reassignment during approval."
                onChange={value=>field("mode",value)}
              />

              <ModeCard
                value="structured"
                current={form.mode}
                title="Structured"
                description="Balanced governance with a defined approval workflow."
                onChange={value=>field("mode",value)}
              />

              <ModeCard
                value="controlled"
                current={form.mode}
                title="Controlled"
                description="Strict workflow with limited override and delegation."
                onChange={value=>field("mode",value)}
              />

            </div>

          </section>


          <section className="governance-card">

            <div className="governance-card-header">
              <div>
                <h2>Governance controls</h2>

                <p>
                  Apply safeguards across approval decisions.
                </p>
              </div>
            </div>

            <div className="governance-rules-grid">

              <ToggleRow
                label="Prevent self approval"
                description="The requester cannot approve their own request."
                checked={form.prevent_self_approval}
                onChange={value=>
                  field("prevent_self_approval",value)
                }
              />

              <ToggleRow
                label="Prevent consecutive approval"
                description="Avoid the same approver acting across consecutive stages."
                checked={form.prevent_consecutive_approval}
                onChange={value=>
                  field("prevent_consecutive_approval",value)
                }
              />

              <ToggleRow
                label="Require finance review"
                description="The workflow must include a Finance approval stage."
                checked={form.require_finance_review}
                onChange={value=>
                  field("require_finance_review",value)
                }
              />

              <ToggleRow
                label="Require budget validation"
                description="Requests must pass budget validation before progressing."
                checked={form.require_budget_validation}
                onChange={value=>
                  field("require_budget_validation",value)
                }
              />

              <ToggleRow
                label="Invalidate approvals after change"
                description="Material request changes invalidate existing approvals."
                checked={form.invalidate_approvals_on_change}
                onChange={value=>
                  field("invalidate_approvals_on_change",value)
                }
              />

              <ToggleRow
                label="Allow owner override"
                description="Company owners may override the normal workflow."
                checked={form.allow_owner_override}
                onChange={value=>
                  field("allow_owner_override",value)
                }
              />

              {form.allow_owner_override&&(
                <ToggleRow
                  label="Require override reason"
                  description="An explanation is mandatory whenever an override is used."
                  checked={form.require_override_reason}
                  onChange={value=>
                    field("require_override_reason",value)
                  }
                />
              )}

            </div>

          </section>


          <section className="governance-card governance-workflow-card">

            <div className="governance-card-header">

              <div>
                <h2>Approval workflow</h2>

                <p>
                  Define the stages a request must pass
                  before it is approved.
                </p>
              </div>

              <button
                type="button"
                className="governance-add-step"
                onClick={addStep}
              >
                + Add approval step
              </button>

            </div>


            <div className="governance-flow">

              {form.steps.map((step,index)=>(
                <div
                  key={step.id || `step-${index}`}
                  className="governance-flow-item"
                >

                  <ApprovalStep
                    index={index}
                    step={step}
                    roles={roles}
                    positions={positions}
                    team={team}
                    total={form.steps.length}
                    onChange={stepField}
                    onRemove={removeStep}
                    onMove={moveStep}
                  />

                  {index<form.steps.length-1&&(
                    <div className="governance-flow-arrow">
                      <span>↓</span>
                      <small>
                        then
                      </small>
                    </div>
                  )}

                </div>
              ))}

            </div>

          </section>

        </main>


        <aside className="governance-sidebar">

          <section className="governance-card governance-summary">

            <div className="governance-sidebar-label">
              WORKFLOW SUMMARY
            </div>

            <div className="governance-summary-number">
              {form.steps.length}
            </div>

            <p>
              Approval {form.steps.length===1?"stage":"stages"}
            </p>

            <div className="governance-summary-row">
              <span>Mode</span>
              <strong>{titleCase(form.mode)}</strong>
            </div>

            <div className="governance-summary-row">
              <span>Finance review</span>
              <strong>
                {form.require_finance_review
                  ?"Required"
                  :"Optional"}
              </strong>
            </div>

            <div className="governance-summary-row">
              <span>Owner override</span>
              <strong>
                {form.allow_owner_override
                  ?"Allowed"
                  :"Blocked"}
              </strong>
            </div>

          </section>


          <section className="governance-card governance-info-card">

            <div className="governance-sidebar-label">
              RELATED
            </div>

            <button
              type="button"
              className="governance-link-button"
              onClick={()=>navigate("/approvals")}
            >
              Approval Work Queue
              <span>→</span>
            </button>

            <button
              type="button"
              className="governance-link-button"
              onClick={()=>navigate("/setup")}
            >
              Organisation Setup
              <span>→</span>
            </button>

            <button
              type="button"
              className="governance-link-button"
              onClick={()=>navigate("/budget")}
            >
              Budget Controls
              <span>→</span>
            </button>

          </section>

        </aside>

      </div>


      <div className="governance-save-bar">

        <div>
          <strong>Governance configuration</strong>

          <span>
            Saving creates a new active workflow version.
          </span>
        </div>

        <div className="governance-save-actions">

          <button
            type="button"
            className="governance-btn secondary"
            onClick={loadPage}
            disabled={saving}
          >
            Reset
          </button>

          <button
            type="button"
            className="governance-btn primary"
            onClick={save}
            disabled={saving}
          >
            {saving
              ?"Saving governance…"
              :"Save governance"}
          </button>

        </div>

      </div>

    </div>
  );
}


function ModeCard({
  value,
  current,
  title,
  description,
  onChange,
}){
  const active=current===value;

  return (
    <button
      type="button"
      className={`governance-mode-card ${
        active?"active":""
      }`}
      onClick={()=>onChange(value)}
    >
      <div className="governance-mode-radio">
        {active&&<span/>}
      </div>

      <strong>{title}</strong>
      <p>{description}</p>
    </button>
  );
}


function ToggleRow({
  label,
  description,
  checked,
  onChange,
}){
  return (
    <div className="governance-toggle-row">

      <div>
        <strong>{label}</strong>
        <span>{description}</span>
      </div>

      <label className="governance-switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={e=>onChange(e.target.checked)}
        />
        <span/>
      </label>

    </div>
  );
}


function ApprovalStep({
  index,
  step,
  roles,
  positions,
  team,
  total,
  onChange,
  onRemove,
  onMove,
}){
  return (
    <div className="governance-step">

      <div className="governance-step-header">

        <div className="governance-step-number">
          {index+1}
        </div>

        <div className="governance-step-heading">
          <strong>
            {step.name || `Approval ${index+1}`}
          </strong>

          <span>
            Step {index+1} of {total}
          </span>
        </div>

        <div className="governance-step-actions">

          <button
            type="button"
            onClick={()=>onMove(index,-1)}
            disabled={index===0}
            title="Move up"
          >
            ↑
          </button>

          <button
            type="button"
            onClick={()=>onMove(index,1)}
            disabled={index===total-1}
            title="Move down"
          >
            ↓
          </button>

          <button
            type="button"
            className="governance-delete-step"
            onClick={()=>onRemove(index)}
            title="Remove approval step"
          >
            ×
          </button>

        </div>

      </div>


      <div className="governance-step-grid">

        <label className="governance-field governance-field-full">
          <span>Approval stage name</span>

          <input
            value={step.name}
            onChange={e=>
              onChange(
                index,
                "name",
                e.target.value
              )
            }
            placeholder="Manager Approval"
          />
        </label>


        <label className="governance-field">
          <span>Approver type</span>

          <select
            value={step.approver_type}
            onChange={e=>
              onChange(
                index,
                "approver_type",
                e.target.value
              )
            }
          >
            <option value="requester_manager">
              Requester's Manager
            </option>

            <option value="department_head">
              Department Head
            </option>

            <option value="role">
              Role
            </option>

            <option value="position">
              Position
            </option>

            <option value="user">
              Specific User
            </option>

            <option value="owner">
              Company Owner
            </option>
          </select>
        </label>


        {step.approver_type==="role"&&(
          <label className="governance-field">
            <span>Approver role</span>

            <select
              value={step.approver_role_code}
              onChange={e=>
                onChange(
                  index,
                  "approver_role_code",
                  e.target.value
                )
              }
            >
              <option value="">
                Select role
              </option>

              {roles.map(role=>(
                <option
                  key={role.code || role.id}
                  value={role.code}
                >
                  {role.name || role.code}
                </option>
              ))}
            </select>
          </label>
        )}


        {step.approver_type==="position"&&(
          <label className="governance-field">
            <span>Approver position</span>

            <select
              value={step.approver_position_id}
              onChange={e=>
                onChange(
                  index,
                  "approver_position_id",
                  e.target.value
                )
              }
            >
              <option value="">
                Select position
              </option>

              {positions.map(position=>(
                <option
                  key={position.id}
                  value={position.id}
                >
                  {position.title || position.name}
                </option>
              ))}
            </select>
          </label>
        )}


        {step.approver_type==="user"&&(
          <label className="governance-field">
            <span>Approver</span>

            <select
              value={step.approver_user_id}
              onChange={e=>
                onChange(
                  index,
                  "approver_user_id",
                  e.target.value
                )
              }
            >
              <option value="">
                Select user
              </option>

              {team.map(member=>(
                <option
                  key={
                    member.user_id ||
                    member.id
                  }
                  value={
                    member.user_id ||
                    member.id
                  }
                >
                  {member.name ||
                   member.full_name ||
                   member.email}
                </option>
              ))}
            </select>
          </label>
        )}


        <label className="governance-field">
          <span>Minimum amount</span>

          <input
            type="number"
            min="0"
            step="0.01"
            value={step.min_amount}
            onChange={e=>
              onChange(
                index,
                "min_amount",
                e.target.value
              )
            }
            placeholder="No minimum"
          />
        </label>


        <label className="governance-field">
          <span>Maximum amount</span>

          <input
            type="number"
            min="0"
            step="0.01"
            value={step.max_amount}
            onChange={e=>
              onChange(
                index,
                "max_amount",
                e.target.value
              )
            }
            placeholder="No maximum"
          />
        </label>

      </div>


      <div className="governance-step-options">

        <label>
          <input
            type="checkbox"
            checked={step.required}
            onChange={e=>
              onChange(
                index,
                "required",
                e.target.checked
              )
            }
          />

          <span>Required stage</span>
        </label>

        <label>
          <input
            type="checkbox"
            checked={step.allow_delegation}
            onChange={e=>
              onChange(
                index,
                "allow_delegation",
                e.target.checked
              )
            }
          />

          <span>Allow delegation</span>
        </label>

        <label>
          <input
            type="checkbox"
            checked={step.allow_reassignment}
            onChange={e=>
              onChange(
                index,
                "allow_reassignment",
                e.target.checked
              )
            }
          />

          <span>Allow reassignment</span>
        </label>

      </div>

    </div>
  );
}


function titleCase(value){
  return String(value || "")
    .replace(/_/g," ")
    .replace(/\b\w/g,char=>char.toUpperCase());
}